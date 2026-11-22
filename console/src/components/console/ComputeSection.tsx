import { useState } from 'react';
import { Play, Plus, Rocket, Square, Trash2 } from 'lucide-react';
import { HOURS_PER_MONTH } from '@lemnis/sdk';
import { MANIFEST_PRESETS } from '../../data/whitepaperContent';
import {
  type Persona,
  type Protocol28State,
  opCloseDeployment,
  opCreateInstance,
  opDeployFromManifest,
  opMutateInstance,
} from '../../runtime/protocol28Store';

interface ComputeSectionProps {
  state: Protocol28State;
  persona: Persona;
  draftManifestYaml: string;
  onDraftChange: (yaml: string) => void;
  onStateChange: (next: Protocol28State, notice: { tone: 'emerald' | 'danger'; text: string }) => void;
}

function microHourlyToMonthly(microHourly: number): string {
  const usd = (microHourly * HOURS_PER_MONTH) / 1_000_000;
  return `$${usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function ComputeSection({
  state,
  persona,
  draftManifestYaml,
  onDraftChange,
  onStateChange,
}: ComputeSectionProps) {
  const [simulateOverCap, setSimulateOverCap] = useState(false);
  const [memoryMiB, setMemoryMiB] = useState(512);
  const [attachedTCycles, setAttachedTCycles] = useState(2);

  const myDeployments = Object.values(state.deployments)
    .filter((d) => d.owner === persona.principal || persona.isController)
    .sort((a, b) => b.createdAt - a.createdAt);

  const myInstances = Object.values(state.instances)
    .filter((i) => i.owner === persona.principal || persona.isController)
    .sort((a, b) => b.createdAt - a.createdAt);

  function handleDeploy() {
    const res = opDeployFromManifest(state, persona, draftManifestYaml, simulateOverCap);
    if (!res.ok) {
      onStateChange(state, { tone: 'danger', text: `compute.requestDeployment() -> #err("${res.error}")` });
      return;
    }
    const failedCount = res.value.created.filter((d) => d.state === 'failed').length;
    onStateChange(res.value.state, {
      tone: failedCount > 0 ? 'danger' : 'emerald',
      text:
        failedCount > 0
          ? `Bid cap enforced: ${failedCount} deployment(s) rejected (#failed) because provider bid exceeded 50% AWS limit.`
          : `Deployed ${res.value.created.length} service(s) to Akash under 50% AWS bid cap.`,
    });
  }

  function handleCloseDeployment(id: string) {
    const res = opCloseDeployment(state, persona, id);
    if (!res.ok) {
      onStateChange(state, { tone: 'danger', text: `compute.requestCloseDeployment("${id}") -> #err("${res.error}")` });
      return;
    }
    onStateChange(res.value.state, { tone: 'emerald', text: `Deployment ${id} closed and Akash lease settled.` });
  }

  function handleCreateInstance() {
    const res = opCreateInstance(state, persona, memoryMiB * 1024 * 1024, attachedTCycles * 1_000_000_000_000);
    if (!res.ok) {
      onStateChange(state, { tone: 'danger', text: `compute.createInstance() -> #err("${res.error}")` });
      return;
    }
    onStateChange(res.value.state, {
      tone: 'emerald',
      text: `Created ICP instance ${res.value.instance.id} (${memoryMiB} MiB, ${attachedTCycles}T attached cycles).`,
    });
  }

  function handleInstanceAction(id: string, action: 'start' | 'stop' | 'terminate') {
    const res = opMutateInstance(state, persona, id, action);
    if (!res.ok) {
      onStateChange(state, { tone: 'danger', text: `compute.${action}Instance("${id}") -> #err("${res.error}")` });
      return;
    }
    onStateChange(res.value.state, { tone: 'emerald', text: `Instance ${id} transitioned to #${res.value.instance.status}.` });
  }

  return (
    <div className="stack-lg">
      {/* Akash Container Deploy Panel */}
      <div className="sheet sheet-pad stack-md">
        <div className="row-between">
          <div>
            <h2 style={{ fontSize: 19 }}>Deploy Containers to Akash (via Protocol 28 Registry)</h2>
            <p style={{ fontSize: 13.5, color: 'var(--ink-muted)', marginTop: 4 }}>
              Submits <code>compute.requestDeployment()</code> and simulates provider auction reconciliation with on-chain 50% bid-cap verification.
            </p>
          </div>
          <div className="row-wrap">
            {MANIFEST_PRESETS.map((p) => (
              <button key={p.id} type="button" className="btn btn-secondary btn-sm" onClick={() => onDraftChange(p.yaml)}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <textarea
          id="console-deploy-yaml"
          className="textarea textarea-code"
          rows={9}
          value={draftManifestYaml}
          onChange={(e) => onDraftChange(e.target.value)}
          spellCheck={false}
        />

        <div className="row-between">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink-secondary)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={simulateOverCap}
              onChange={(e) => setSimulateOverCap(e.target.checked)}
            />
            Simulate provider bid above 50% AWS cap (tests on-chain rejection)
          </label>
          <button id="btn-submit-deployment" type="button" className="btn btn-accent" onClick={handleDeploy}>
            <Rocket size={15} />
            Submit Deployment
          </button>
        </div>
      </div>

      {/* Active Deployments Table */}
      <div className="sheet">
        <div className="sheet-pad" style={{ paddingBottom: 14 }}>
          <h3 style={{ fontSize: 16 }}>Akash Container Deployments ({myDeployments.length})</h3>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Deployment</th>
                <th>State</th>
                <th>Provider / URI</th>
                <th className="num">AWS/mo</th>
                <th className="num">Settled/mo</th>
                <th className="num">Action</th>
              </tr>
            </thead>
            <tbody>
              {myDeployments.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ color: 'var(--ink-muted)', textAlign: 'center', padding: 24 }}>
                    No deployments visible for this principal.
                  </td>
                </tr>
              ) : (
                myDeployments.map((dep) => {
                  const savedPct =
                    dep.actualHourlyMicroUsd && dep.awsHourlyMicroUsd > 0
                      ? Math.round(((dep.awsHourlyMicroUsd - dep.actualHourlyMicroUsd) / dep.awsHourlyMicroUsd) * 100)
                      : null;
                  return (
                    <tr key={dep.id}>
                      <td>
                        <div className="mono" style={{ fontWeight: 600, fontSize: 13 }}>{dep.project}/{dep.service}</div>
                        <div className="mono" style={{ fontSize: 11.5, color: 'var(--ink-muted)' }}>
                          {dep.id} · {dep.image} · {dep.cpuMilli / 1000} vCPU · {(dep.memoryMiB / 1024).toFixed(0)}Gi
                          {dep.gpuCount > 0 ? ` · ${dep.gpuCount}x GPU` : ''}
                        </div>
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            dep.state === 'active'
                              ? 'badge-emerald'
                              : dep.state === 'failed'
                                ? 'badge-danger'
                                : 'badge-neutral'
                          }`}
                        >
                          #{dep.state}
                        </span>
                      </td>
                      <td style={{ fontSize: 12.5 }}>
                        {dep.providerUri ? (
                          <div>
                            <code style={{ fontSize: 11.5 }}>{dep.providerUri}</code>
                            <div style={{ fontSize: 11.5, color: 'var(--ink-muted)' }}>{dep.providerName} · dseq {dep.dseq}</div>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--danger)', fontSize: 12 }}>{dep.lastError ?? 'No active lease'}</span>
                        )}
                      </td>
                      <td className="num">{microHourlyToMonthly(dep.awsHourlyMicroUsd)}</td>
                      <td className="num">
                        {dep.actualHourlyMicroUsd ? (
                          <div>
                            <strong>{microHourlyToMonthly(dep.actualHourlyMicroUsd)}</strong>
                            {savedPct !== null && (
                              <div style={{ fontSize: 11, color: 'var(--emerald)' }}>-{savedPct}%</div>
                            )}
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="num">
                        {dep.state === 'active' ? (
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={() => handleCloseDeployment(dep.id)}
                          >
                            Close
                          </button>
                        ) : (
                          <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Native ICP Compute Instances */}
      <div className="sheet sheet-pad stack-md">
        <div className="row-between">
          <div>
            <h3 style={{ fontSize: 17 }}>ICP Compute Instances (Strict Lifecycle Guard)</h3>
            <p style={{ fontSize: 13, color: 'var(--ink-muted)', marginTop: 2 }}>
              Memory bounds: 64 MiB – 64 GiB. Terminated instances cannot be stopped or restarted.
            </p>
          </div>
          <div className="row-wrap">
            <select
              aria-label="Instance memory"
              className="select"
              style={{ width: 130 }}
              value={memoryMiB}
              onChange={(e) => setMemoryMiB(Number(e.target.value))}
            >
              <option value={128}>128 MiB</option>
              <option value={512}>512 MiB</option>
              <option value={2048}>2 GiB</option>
              <option value={8192}>8 GiB</option>
            </select>
            <input
              aria-label="Attached trillion cycles"
              type="number"
              className="input"
              style={{ width: 115 }}
              min={0}
              max={100}
              value={attachedTCycles}
              onChange={(e) => setAttachedTCycles(Number(e.target.value))}
            />
            <button id="btn-create-icp-instance" type="button" className="btn btn-primary btn-sm" onClick={handleCreateInstance}>
              <Plus size={14} /> Launch Instance
            </button>
          </div>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Instance ID</th>
                <th>Status</th>
                <th className="num">Memory</th>
                <th className="num">Attached Cycles</th>
                <th className="num">Lifecycle Controls</th>
              </tr>
            </thead>
            <tbody>
              {myInstances.map((inst) => (
                <tr key={inst.id}>
                  <td className="mono" style={{ fontWeight: 600 }}>{inst.id}</td>
                  <td>
                    <span
                      className={`badge ${
                        inst.status === 'running'
                          ? 'badge-emerald'
                          : inst.status === 'stopped'
                            ? 'badge-amber'
                            : 'badge-danger'
                      }`}
                    >
                      #{inst.status}
                    </span>
                  </td>
                  <td className="num">{Math.round(inst.memoryBytes / (1024 * 1024))} MiB</td>
                  <td className="num">{(inst.cyclesBalance / 1e12).toFixed(2)}T</td>
                  <td className="num">
                    <div className="row-wrap" style={{ justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        title="startInstance()"
                        onClick={() => handleInstanceAction(inst.id, 'start')}
                      >
                        <Play size={12} /> Start
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        title="stopInstance()"
                        onClick={() => handleInstanceAction(inst.id, 'stop')}
                      >
                        <Square size={12} /> Stop
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        title="terminateInstance()"
                        onClick={() => handleInstanceAction(inst.id, 'terminate')}
                      >
                        <Trash2 size={12} /> Terminate
                      </button>
                    </div>
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
