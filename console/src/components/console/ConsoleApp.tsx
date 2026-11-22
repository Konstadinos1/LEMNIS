import { useState } from 'react';
import {
  Activity,
  CreditCard,
  Database,
  HardDrive,
  LayoutDashboard,
  Radio,
  RotateCcw,
  Server,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { HOURS_PER_MONTH, checkReplicaStatus, type ReplicaStatusReport } from '@lemnis/sdk';
import {
  DEMO_PERSONAS,
  type Persona,
  type Protocol28State,
  resetProtocol28State,
  saveProtocol28State,
} from '../../runtime/protocol28Store';
import { BillingSection, SecurityAuditSection } from './BillingAuditSection';
import { ComputeSection } from './ComputeSection';
import { IdentitySection } from './IdentitySection';
import { DatabaseSection, StorageSection } from './StorageDatabaseSection';

export type ConsoleTab = 'overview' | 'compute' | 'identity' | 'storage' | 'database' | 'billing' | 'audit';

interface ConsoleAppProps {
  state: Protocol28State;
  setState: (next: Protocol28State) => void;
  draftManifestYaml: string;
  onDraftChange: (yaml: string) => void;
  initialTab?: ConsoleTab;
}

function fmtUsd(micro: number): string {
  return `$${(micro / 1_000_000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function ConsoleApp({
  state,
  setState,
  draftManifestYaml,
  onDraftChange,
  initialTab = 'overview',
}: ConsoleAppProps) {
  const [tab, setTab] = useState<ConsoleTab>(initialTab);
  const [personaId, setPersonaId] = useState<string>(DEMO_PERSONAS[0].id);
  const [notice, setNotice] = useState<{ tone: 'emerald' | 'danger'; text: string } | null>(null);
  const [replicaHost, setReplicaHost] = useState('http://127.0.0.1:8080');
  const [replicaStatus, setReplicaStatus] = useState<ReplicaStatusReport | null>(null);
  const [checkingReplica, setCheckingReplica] = useState(false);

  const persona: Persona = DEMO_PERSONAS.find((p) => p.id === personaId) ?? DEMO_PERSONAS[0];

  function handleStateChange(next: Protocol28State, nextNotice: { tone: 'emerald' | 'danger'; text: string }) {
    setState(next);
    saveProtocol28State(next);
    setNotice(nextNotice);
  }

  function handleReset() {
    const fresh = resetProtocol28State();
    setState(fresh);
    setNotice({ tone: 'emerald', text: 'Reset Protocol 28 local ledger to clean seeded state.' });
  }

  async function handleProbeReplica() {
    setCheckingReplica(true);
    const report = await checkReplicaStatus(replicaHost, 2_500);
    setReplicaStatus(report);
    setCheckingReplica(false);
  }

  const account = state.accounts[persona.principal];
  const activeDeployments = Object.values(state.deployments).filter(
    (d) => d.state === 'active' && (d.owner === persona.principal || persona.isController),
  );
  const hourlyBurnMicro = activeDeployments.reduce((sum, d) => sum + (d.actualHourlyMicroUsd ?? 0), 0);
  const runwayDays =
    account && hourlyBurnMicro > 0 ? Math.floor(account.creditsMicroUsd / (hourlyBurnMicro * 24)) : null;

  const savedMicro = account ? Math.max(0, account.awsEquivalentMicroUsd - account.spentMicroUsd) : 0;
  const savedPct =
    account && account.awsEquivalentMicroUsd > 0
      ? Math.round((savedMicro / account.awsEquivalentMicroUsd) * 100)
      : 0;

  return (
    <div className="console-shell">
      <aside className="console-sidebar">
        <div>
          <div className="console-nav-group-label">Cloud Control Plane</div>
          <nav className="stack-sm" style={{ gap: 4 }}>
            {(
              [
                ['overview', 'Overview', LayoutDashboard],
                ['compute', 'Compute & Akash', Server],
                ['identity', 'Identity & Orgs', Users],
                ['storage', 'Storage Buckets', HardDrive],
                ['database', 'KV Database', Database],
                ['billing', 'Billing & Credits', CreditCard],
                ['audit', 'Security Audit', ShieldCheck],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                id={`console-nav-${id}`}
                type="button"
                className={`console-nav-item ${tab === id ? 'active' : ''}`}
                onClick={() => setTab(id)}
              >
                <Icon size={16} />
                <span>{label}</span>
              </button>
            ))}
          </nav>
        </div>

        <div className="recessed stack-sm" style={{ marginTop: 'auto', padding: 14, gap: 8 }}>
          <div className="row-wrap" style={{ gap: 6 }}>
            <Radio size={14} color="var(--accent)" />
            <strong style={{ fontSize: 12.5 }}>ICP Replica Probe</strong>
          </div>
          <input
            aria-label="ICP replica host"
            type="text"
            className="input mono"
            style={{ fontSize: 11.5, padding: '6px 8px' }}
            value={replicaHost}
            onChange={(e) => setReplicaHost(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={checkingReplica}
            onClick={handleProbeReplica}
          >
            {checkingReplica ? 'Checking...' : 'Check /api/v2/status'}
          </button>
          {replicaStatus && (
            <div className="mono" style={{ fontSize: 11, color: replicaStatus.reachable ? 'var(--emerald)' : 'var(--ink-muted)' }}>
              {replicaStatus.reachable
                ? `● Reachable (${replicaStatus.latencyMs}ms)`
                : `○ Offline (${replicaStatus.error ?? 'unreachable'}) — using local P28 ledger`}
            </div>
          )}
        </div>
      </aside>

      <main className="console-main">
        {/* Console Top Bar */}
        <div className="console-topbar">
          <div>
            <h1 style={{ fontSize: 22 }}>LEMNIS Cloud Console</h1>
            <div style={{ fontSize: 12.5, color: 'var(--ink-muted)' }}>
              Protocol 28 Local Persistent Runtime · Switch principal to test on-chain authorization
            </div>
          </div>

          <div className="row-wrap">
            <label htmlFor="persona-select" className="field-label" style={{ fontSize: 12 }}>
              Active Principal:
            </label>
            <select
              id="persona-select"
              className="select"
              style={{ width: 220, padding: '7px 10px', fontSize: 13 }}
              value={personaId}
              onChange={(e) => {
                setPersonaId(e.target.value);
                setNotice(null);
              }}
            >
              {DEMO_PERSONAS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-ghost btn-sm" onClick={handleReset} title="Reset local ledger">
              <RotateCcw size={14} /> Reset
            </button>
          </div>
        </div>

        {notice && (
          <div className={`callout callout-${notice.tone}`} style={{ marginBottom: 20 }}>
            <div className="mono" style={{ fontSize: 12.5 }}>{notice.text}</div>
          </div>
        )}

        {tab === 'overview' && (
          <div className="stack-lg">
            {/* Savings Hero Card */}
            <div className="sheet sheet-pad stack-md">
              <div className="row-between">
                <div>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--ink-muted)', textTransform: 'uppercase' }}>
                    Billing Boundary · {persona.principal}
                  </span>
                  <div className="row-wrap" style={{ marginTop: 6, gap: 18 }}>
                    <div>
                      <span style={{ fontSize: 12.5, color: 'var(--ink-muted)' }}>Prepaid Credits </span>
                      <strong className="mono tabular" style={{ fontSize: 22 }}>{fmtUsd(account?.creditsMicroUsd ?? 0)}</strong>
                    </div>
                    <div>
                      <span style={{ fontSize: 12.5, color: 'var(--ink-muted)' }}>Runway </span>
                      <strong className="mono tabular" style={{ fontSize: 18, color: runwayDays !== null && runwayDays < 2 ? 'var(--danger)' : 'var(--ink-primary)' }}>
                        {runwayDays !== null ? `${runwayDays} days` : '—'}
                      </strong>
                    </div>
                    <div>
                      <span style={{ fontSize: 12.5, color: 'var(--ink-muted)' }}>ICP Cycles </span>
                      <strong className="mono tabular" style={{ fontSize: 18 }}>
                        {((account?.balanceCycles ?? 0) / 1e12).toFixed(2)}T
                      </strong>
                    </div>
                  </div>
                </div>
                <span className="badge badge-emerald tabular" style={{ fontSize: 13, padding: '6px 12px' }}>
                  Saved {fmtUsd(savedMicro)} ({savedPct}%) vs AWS
                </span>
              </div>

              <div className="stack-sm" style={{ gap: 6 }}>
                <div className="row-between" style={{ fontSize: 13 }}>
                  <span>
                    Paid to LEMNIS: <strong className="mono">{fmtUsd(account?.spentMicroUsd ?? 0)}</strong>
                  </span>
                  <span style={{ color: 'var(--ink-muted)' }}>
                    AWS On-Demand Equivalent: <strong className="mono">{fmtUsd(account?.awsEquivalentMicroUsd ?? 0)}</strong>
                  </span>
                </div>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${Math.min(100, Math.max(8, savedPct))}%` }} />
                </div>
              </div>
            </div>

            {/* Active Workloads Snapshot */}
            <div className="sheet sheet-pad stack-md">
              <div className="row-between">
                <div className="row-wrap">
                  <Activity size={16} color="var(--accent)" />
                  <h2 style={{ fontSize: 17 }}>Active Deployments ({activeDeployments.length})</h2>
                </div>
                <button type="button" className="btn btn-accent btn-sm" onClick={() => setTab('compute')}>
                  Deploy Container →
                </button>
              </div>

              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Service</th>
                      <th>Endpoint</th>
                      <th className="num">Settled / mo</th>
                      <th className="num">AWS / mo</th>
                      <th className="num">Saved</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeDeployments.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ textAlign: 'center', color: 'var(--ink-muted)', padding: 20 }}>
                          No active deployments for {persona.label}. Switch to Controller or deploy a service.
                        </td>
                      </tr>
                    ) : (
                      activeDeployments.map((d) => {
                        const settledMo = ((d.actualHourlyMicroUsd ?? 0) * HOURS_PER_MONTH) / 1e6;
                        const awsMo = (d.awsHourlyMicroUsd * HOURS_PER_MONTH) / 1e6;
                        const pct = awsMo > 0 ? Math.round(((awsMo - settledMo) / awsMo) * 100) : 0;
                        return (
                          <tr key={d.id}>
                            <td>
                              <strong className="mono">{d.project}/{d.service}</strong>
                              <div style={{ fontSize: 11.5, color: 'var(--ink-muted)' }}>{d.region} · {d.image}</div>
                            </td>
                            <td className="mono" style={{ fontSize: 12 }}>{d.providerUri}</td>
                            <td className="num"><strong>${settledMo.toFixed(2)}</strong></td>
                            <td className="num" style={{ color: 'var(--ink-muted)' }}>${awsMo.toFixed(2)}</td>
                            <td className="num"><span className="badge badge-emerald">{pct}%</span></td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {tab === 'compute' && (
          <ComputeSection
            state={state}
            persona={persona}
            draftManifestYaml={draftManifestYaml}
            onDraftChange={onDraftChange}
            onStateChange={handleStateChange}
          />
        )}

        {tab === 'identity' && (
          <IdentitySection state={state} persona={persona} onStateChange={handleStateChange} />
        )}

        {tab === 'storage' && (
          <StorageSection state={state} persona={persona} onStateChange={handleStateChange} />
        )}

        {tab === 'database' && (
          <DatabaseSection state={state} persona={persona} onStateChange={handleStateChange} />
        )}

        {tab === 'billing' && (
          <BillingSection state={state} persona={persona} onStateChange={handleStateChange} />
        )}

        {tab === 'audit' && <SecurityAuditSection />}
      </main>
    </div>
  );
}
