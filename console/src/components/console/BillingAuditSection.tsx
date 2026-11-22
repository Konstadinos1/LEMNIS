import { useState } from 'react';
import { CheckCircle2, Coins, ShieldAlert, ShieldCheck, XCircle } from 'lucide-react';
import {
  type Persona,
  type Protocol28State,
  type SecurityProbeResult,
  opDepositCycles,
  opGrantCredits,
  opSetMarkupBps,
  runSecurityAuditProbes,
} from '../../runtime/protocol28Store';

interface BillingSectionProps {
  state: Protocol28State;
  persona: Persona;
  onStateChange: (next: Protocol28State, notice: { tone: 'emerald' | 'danger'; text: string }) => void;
}

function fmtUsd(micro: number): string {
  return `$${(micro / 1_000_000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function BillingSection({ state, persona, onStateChange }: BillingSectionProps) {
  const [grantAmountUsd, setGrantAmountUsd] = useState(100);
  const [depositT, setDepositT] = useState(5);
  const [markupInputPct, setMarkupInputPct] = useState(state.markupBps / 100);

  const account = state.accounts[persona.principal];
  const usage = state.usageHistory[persona.principal] ?? [];
  const savedMicro = account ? Math.max(0, account.awsEquivalentMicroUsd - account.spentMicroUsd) : 0;
  const savedPct =
    account && account.awsEquivalentMicroUsd > 0
      ? Math.round((savedMicro / account.awsEquivalentMicroUsd) * 100)
      : 0;

  function handleGrantCredits(e: React.FormEvent) {
    e.preventDefault();
    const res = opGrantCredits(state, persona, persona.principal, grantAmountUsd);
    if (!res.ok) {
      onStateChange(state, { tone: 'danger', text: `billing.grantCredits() -> #err("${res.error}")` });
      return;
    }
    onStateChange(res.value.state, {
      tone: 'emerald',
      text: `Granted $${grantAmountUsd.toFixed(2)} prepaid USD credits to ${persona.principal}.`,
    });
  }

  function handleDepositCycles(e: React.FormEvent) {
    e.preventDefault();
    const res = opDepositCycles(state, persona, depositT);
    if (!res.ok) {
      onStateChange(state, { tone: 'danger', text: `billing.deposit() -> #err("${res.error}")` });
      return;
    }
    onStateChange(res.value, { tone: 'emerald', text: `Deposited ${depositT}T ICP cycles into billing account.` });
  }

  function handleSetMarkup(e: React.FormEvent) {
    e.preventDefault();
    const res = opSetMarkupBps(state, persona, Math.round(markupInputPct * 100));
    if (!res.ok) {
      onStateChange(state, { tone: 'danger', text: `billing.setMarkupBps() -> #err("${res.error}")` });
      return;
    }
    onStateChange(res.value, { tone: 'emerald', text: `Platform markup updated to ${markupInputPct}% (${Math.round(markupInputPct * 100)} bps).` });
  }

  return (
    <div className="stack-lg">
      <div className="grid-4">
        <div className="sheet sheet-pad">
          <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>Prepaid USD Credits</div>
          <div className="mono tabular" style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>
            {fmtUsd(account?.creditsMicroUsd ?? 0)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 4 }}>Integer micro-USD ledger</div>
        </div>
        <div className="sheet sheet-pad">
          <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>ICP Cycles Balance</div>
          <div className="mono tabular" style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>
            {((account?.balanceCycles ?? 0) / 1e12).toFixed(2)}T
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 4 }}>
            Oracle: ${(state.microUsdPerTrillionCycles / 1e6).toFixed(2)} / 1T cycles
          </div>
        </div>
        <div className="sheet sheet-pad">
          <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>Cumulative Savings vs AWS</div>
          <div className="mono tabular" style={{ fontSize: 24, fontWeight: 700, color: 'var(--emerald)', marginTop: 4 }}>
            {fmtUsd(savedMicro)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--emerald)', marginTop: 4 }}>{savedPct}% saved vs AWS on-demand</div>
        </div>
        <div className="sheet sheet-pad">
          <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>Protocol Markup</div>
          <div className="mono tabular" style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent)', marginTop: 4 }}>
            {(state.markupBps / 100).toFixed(1)}%
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 4 }}>Hard-capped at 25.0% on-chain</div>
        </div>
      </div>

      <div className="grid-3">
        <form onSubmit={handleDepositCycles} className="sheet sheet-pad stack-sm">
          <div className="row-wrap">
            <Coins size={15} color="var(--accent)" />
            <strong style={{ fontSize: 15 }}>Deposit ICP Cycles</strong>
          </div>
          <input
            type="number"
            className="input mono"
            min={1}
            max={500}
            value={depositT}
            onChange={(e) => setDepositT(Number(e.target.value))}
          />
          <button type="submit" className="btn btn-primary btn-sm">Deposit {depositT}T Cycles</button>
        </form>

        <form onSubmit={handleGrantCredits} className="sheet sheet-pad stack-sm">
          <strong style={{ fontSize: 15 }}>Grant Prepaid USD (Controller)</strong>
          <input
            type="number"
            className="input mono"
            min={1}
            max={10000}
            value={grantAmountUsd}
            onChange={(e) => setGrantAmountUsd(Number(e.target.value))}
          />
          <button type="submit" className="btn btn-accent btn-sm">Grant ${grantAmountUsd} USD</button>
        </form>

        <form onSubmit={handleSetMarkup} className="sheet sheet-pad stack-sm">
          <strong style={{ fontSize: 15 }}>Set Markup % (Controller, ≤ 25%)</strong>
          <input
            type="number"
            className="input mono"
            min={0}
            max={40}
            value={markupInputPct}
            onChange={(e) => setMarkupInputPct(Number(e.target.value))}
          />
          <button type="submit" className="btn btn-secondary btn-sm">Update Markup</button>
        </form>
      </div>

      {/* Authorized Chargers & Idempotent Usage Ledger */}
      <div className="sheet sheet-pad stack-md">
        <div className="row-between">
          <h3 style={{ fontSize: 16 }}>Idempotent Usage Ledger</h3>
          <span className="mono" style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
            Authorized chargers: {state.authorizedChargers.join(', ')}
          </span>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Idempotency Key</th>
                <th>Service</th>
                <th className="num">Akash Base</th>
                <th className="num">Billed (LEMNIS)</th>
                <th className="num">AWS Equiv.</th>
              </tr>
            </thead>
            <tbody>
              {usage.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ color: 'var(--ink-muted)', textAlign: 'center', padding: 20 }}>
                    No usage records for this principal yet.
                  </td>
                </tr>
              ) : (
                usage.map((u) => (
                  <tr key={u.idempotencyKey}>
                    <td className="mono" style={{ fontSize: 12 }}>{u.idempotencyKey}</td>
                    <td>{u.service}</td>
                    <td className="num">{fmtUsd(u.akashCostMicroUsd)}</td>
                    <td className="num"><strong>{fmtUsd(u.chargedMicroUsd)}</strong></td>
                    <td className="num" style={{ color: 'var(--ink-muted)' }}>{fmtUsd(u.awsEquivalentMicroUsd)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function SecurityAuditSection() {
  const [results, setResults] = useState<SecurityProbeResult[]>(() => runSecurityAuditProbes());
  const passedCount = results.filter((r) => r.passed).length;

  function handleRerun() {
    setResults(runSecurityAuditProbes());
  }

  return (
    <div className="stack-lg">
      <div className="sheet sheet-pad row-between">
        <div>
          <div className="row-wrap">
            <ShieldCheck size={18} color="var(--emerald)" />
            <h2 style={{ fontSize: 19 }}>Protocol 28 Live Security Audit Probes</h2>
            <span className="badge badge-emerald tabular">
              {passedCount} / {results.length} Passed
            </span>
          </div>
          <p style={{ fontSize: 13.5, color: 'var(--ink-muted)', marginTop: 4 }}>
            Executes adversarial multi-principal calls directly against the Protocol 28 state machine to verify every security fix from our November 2026 audit.
          </p>
        </div>
        <button id="btn-rerun-security-probes" type="button" className="btn btn-primary btn-sm" onClick={handleRerun}>
          <ShieldAlert size={14} /> Re-Run All 7 Probes
        </button>
      </div>

      <div className="sheet">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Canister</th>
                <th>Security Invariant Tested</th>
                <th>Observed Behavior</th>
                <th className="num">Verdict</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.id}>
                  <td><span className="badge badge-neutral">{r.canister}</span></td>
                  <td><strong>{r.title}</strong></td>
                  <td className="mono" style={{ fontSize: 12, color: 'var(--ink-secondary)' }}>{r.detail}</td>
                  <td className="num">
                    {r.passed ? (
                      <span className="badge badge-emerald"><CheckCircle2 size={12} /> PASS</span>
                    ) : (
                      <span className="badge badge-danger"><XCircle size={12} /> FAIL</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
