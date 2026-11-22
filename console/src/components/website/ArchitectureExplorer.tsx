import { useState } from 'react';
import { ArrowRight, CheckCircle2, Layers, Shield } from 'lucide-react';
import { PROTOCOL_28_CANISTERS, type CanisterSpec } from '../../data/whitepaperContent';
import type { SiteRoute } from './TopNav';

interface ArchitectureExplorerProps {
  onNavigate: (route: SiteRoute) => void;
}

export function ArchitectureExplorer({ onNavigate }: ArchitectureExplorerProps) {
  const [selectedId, setSelectedId] = useState<CanisterSpec['id']>('billing');
  const selected = PROTOCOL_28_CANISTERS.find((c) => c.id === selectedId) ?? PROTOCOL_28_CANISTERS[0];

  return (
    <main className="container" style={{ paddingTop: 44, paddingBottom: 72 }}>
      <div className="section-header" style={{ marginBottom: 32 }}>
        <span className="section-eyebrow">Protocol 28 · Five Audited Motoko Canisters</span>
        <h1 className="section-title">On-chain control plane architecture.</h1>
        <p className="section-subtitle">
          Every canister in <code>protocol-28/</code> is a <code>persistent actor</code> on
          <code> mo:base/OrderedMap</code> with anonymous-principal rejection, bounded quotas,
          <code> transient let</code> constants, and zero compiler warnings. Click any canister
          below to inspect its Candid interface and audit hardening.
        </p>
      </div>

      {/* Layer Diagram */}
      <div className="sheet sheet-pad" style={{ marginBottom: 28 }}>
        <div className="row-between" style={{ marginBottom: 16 }}>
          <div className="row-wrap">
            <Layers size={16} color="var(--accent)" />
            <strong style={{ fontSize: 15 }}>End-to-End Request &amp; Settlement Flow</strong>
          </div>
          <span className="badge badge-emerald">Wasm &amp; Candid Verified</span>
        </div>

        <div className="grid-4">
          {[
            { step: '01', title: 'Client / CLI / Console', detail: 'Internet Identity (FIDO2) or local 0600 Ed25519 key submits lemnis.yaml' },
            { step: '02', title: 'Protocol 28 (ICP)', detail: 'identity, compute, billing, storage & database persist intent and enforce bid caps' },
            { step: '03', title: 'Akash Bridge → Chain-Key', detail: 'Stateless reconciler (Phase 1) migrating to ICP sign_with_ecdsa (Phase 2)' },
            { step: '04', title: 'Akash Providers', detail: 'Audited Kubernetes providers run Docker/GPU workloads under 50% AWS cap' },
          ].map((node) => (
            <div key={node.step} className="recessed stack-sm" style={{ gap: 6 }}>
              <span className="mono" style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700 }}>
                STEP {node.step}
              </span>
              <strong style={{ fontSize: 14.5 }}>{node.title}</strong>
              <p style={{ fontSize: 12.5, color: 'var(--ink-secondary)' }}>{node.detail}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Canister Selector + Inspector */}
      <div className="row-wrap" style={{ marginBottom: 18 }}>
        {PROTOCOL_28_CANISTERS.map((canister) => (
          <button
            key={canister.id}
            id={`canister-tab-${canister.id}`}
            type="button"
            className={`btn btn-sm ${selectedId === canister.id ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setSelectedId(canister.id)}
          >
            {canister.name}
          </button>
        ))}
      </div>

      <div className="sheet sheet-pad stack-lg">
        <div className="row-between">
          <div>
            <div className="row-wrap">
              <h2 style={{ fontSize: 24 }}>{selected.name}</h2>
              <span className="badge badge-neutral">{selected.file}</span>
            </div>
            <p style={{ color: 'var(--ink-secondary)', marginTop: 6 }}>{selected.role}</p>
            <div className="mono" style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 6 }}>
              {selected.persistence}
            </div>
          </div>
          <button
            type="button"
            className="btn btn-accent btn-sm"
            onClick={() => onNavigate('console')}
          >
            Interact in Console <ArrowRight size={14} />
          </button>
        </div>

        <div className="grid-2" style={{ alignItems: 'start' }}>
          <div>
            <h3 style={{ fontSize: 15, marginBottom: 12 }}>Public Candid Interface</h3>
            <div className="table-wrap sheet">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Method</th>
                    <th>Kind</th>
                    <th>Auth Guard</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.methods.map((m) => (
                    <tr key={m.name}>
                      <td>
                        <code style={{ fontWeight: 600, fontSize: 12.5 }}>{m.name}</code>
                        <div className="mono" style={{ fontSize: 11, color: 'var(--ink-muted)' }}>{m.signature}</div>
                      </td>
                      <td>
                        <span className={`badge ${m.kind === 'query' ? 'badge-neutral' : 'badge-accent'}`}>
                          {m.kind}
                        </span>
                      </td>
                      <td style={{ fontSize: 12.5 }}>{m.auth}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="stack-md">
            <h3 style={{ fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Shield size={16} color="var(--emerald)" />
              November 2026 Security Audit Fixes
            </h3>
            <div className="stack-sm">
              {selected.hardeningFixes.map((fix) => (
                <div key={fix} className="recessed" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 14px' }}>
                  <CheckCircle2 size={16} color="var(--emerald)" style={{ flexShrink: 0, marginTop: 2 }} />
                  <span style={{ fontSize: 13.5 }}>{fix}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
