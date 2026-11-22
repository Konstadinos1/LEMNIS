import { useMemo, useState } from 'react';
import { ArrowRight, BookOpen, Calculator, Check, ShieldCheck, Terminal } from 'lucide-react';
import { DEFAULT_MARKUP_PERCENT, estimateProjectSavings, parseLemnisYaml } from '@lemnis/sdk';
import { MANIFEST_PRESETS } from '../../data/whitepaperContent';
import type { SiteRoute } from './TopNav';

interface LandingPageProps {
  onNavigate: (route: SiteRoute) => void;
  onDeployPreset: (yaml: string) => void;
}

function formatMoney(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function LandingPage({ onNavigate, onDeployPreset }: LandingPageProps) {
  const [selectedPresetId, setSelectedPresetId] = useState(MANIFEST_PRESETS[0].id);

  const activeBenchmark = useMemo(() => {
    const preset = MANIFEST_PRESETS.find((p) => p.id === selectedPresetId) ?? MANIFEST_PRESETS[0];
    const { manifest } = parseLemnisYaml(preset.yaml);
    const estimate = estimateProjectSavings(manifest, DEFAULT_MARKUP_PERCENT);
    return { preset, estimate };
  }, [selectedPresetId]);

  return (
    <main>
      {/* Hero Section */}
      <section className="hero">
        <div className="container hero-grid">
          <div>
            <span className="section-eyebrow">Internet Computer Control Plane · Akash Compute</span>
            <h1 className="hero-title">Move your containers. Cut your AWS bill in half.</h1>
            <p className="hero-lead">
              LEMNIS pairs five audited Internet Computer (Protocol 28) canisters with the Akash
              decentralized container &amp; GPU marketplace. Keep your Docker images, pay in
              prepaid USD credits, and enforce a hard 50% savings bid cap on every deployment.
            </p>

            <div className="hero-actions">
              <button
                id="hero-open-console"
                type="button"
                className="btn btn-accent"
                onClick={() => onNavigate('console')}
              >
                <Terminal size={16} />
                Open Cloud Console
                <ArrowRight size={16} />
              </button>
              <button
                id="hero-open-estimator"
                type="button"
                className="btn btn-secondary"
                onClick={() => onNavigate('estimator')}
              >
                <Calculator size={16} />
                Estimate Savings
              </button>
              <button
                id="hero-open-whitepaper"
                type="button"
                className="btn btn-ghost"
                onClick={() => onNavigate('whitepaper')}
              >
                <BookOpen size={16} />
                Read Whitepaper v3.1
              </button>
            </div>

            <div className="hero-metrics">
              <div>
                <div className="metric-value tabular">50–75%</div>
                <div className="metric-label">Savings vs AWS on-demand with enforced bid cap</div>
              </div>
              <div>
                <div className="metric-value tabular">5 / 5</div>
                <div className="metric-label">Protocol 28 canisters audited &amp; compiled to Wasm</div>
              </div>
              <div>
                <div className="metric-value tabular">$0 / GB</div>
                <div className="metric-label">Akash marginal egress vs AWS $0.09/GB tax</div>
              </div>
            </div>
          </div>

          <div className="hero-visual-frame">
            <img
              src="./lemnis-architecture-hero.jpg"
              alt="Minimalist architectural diagram of decentralized LEMNIS server nodes interconnected in a lemniscate loop"
              className="hero-visual-img"
            />
            <div className="hero-benchmark">
              <div className="row-between" style={{ marginBottom: 10 }}>
                <span className="mono" style={{ fontSize: 11, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Live @lemnis/sdk Benchmark (us-east-1)
                </span>
                <span className="badge badge-emerald tabular">
                  Save {activeBenchmark.estimate.totalSavedPercent}%
                </span>
              </div>

              <div className="benchmark-tabs">
                {MANIFEST_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className={`benchmark-tab ${preset.id === selectedPresetId ? 'active' : ''}`}
                    onClick={() => setSelectedPresetId(preset.id)}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <div className="benchmark-row" style={{ marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>AWS On-Demand</div>
                  <div className="mono tabular" style={{ fontSize: 18, fontWeight: 600, color: 'var(--ink-secondary)', textDecoration: 'line-through' }}>
                    {formatMoney(activeBenchmark.estimate.totalAwsMonthlyUsd)}/mo
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>LEMNIS (incl. 20% markup)</div>
                  <div className="mono tabular" style={{ fontSize: 22, fontWeight: 700, color: 'var(--emerald)' }}>
                    {formatMoney(activeBenchmark.estimate.totalLemnisMonthlyUsd)}/mo
                  </div>
                </div>
              </div>

              <div className="row-between">
                <span style={{ fontSize: 12.5, color: 'var(--ink-muted)' }}>
                  Net saved: <strong className="mono tabular" style={{ color: 'var(--ink-primary)' }}>{formatMoney(activeBenchmark.estimate.totalSavedMonthlyUsd)}/mo</strong>
                </span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => onDeployPreset(activeBenchmark.preset.yaml)}
                >
                  Inspect &amp; Deploy →
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Two-Plane Architecture Section */}
      <section className="section">
        <div className="container">
          <div className="section-header">
            <span className="section-eyebrow">Two-Plane Architecture</span>
            <h2 className="section-title">Each workload runs where the math actually works.</h2>
            <p className="section-subtitle">
              We audited the original whitepaper and stripped away inflated claims. LEMNIS never
              forces bulk storage onto expensive on-chain memory — it puts control-plane integrity
              on ICP and heavy Docker/GPU execution on Akash.
            </p>
          </div>

          <div className="grid-3">
            <article className="sheet sheet-pad stack-sm">
              <span className="mono" style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>01 · CONTROL PLANE</span>
              <h3 style={{ fontSize: 20 }}>Protocol 28 on ICP</h3>
              <p style={{ color: 'var(--ink-secondary)', fontSize: 14.5 }}>
                Five persistent Motoko canisters govern Identity &amp; Org RBAC, Compute Deployment
                Registries, Control-Plane Storage, KV Metadata, and Idempotent micro-USD/Cycles Billing.
              </p>
              <div className="recessed" style={{ marginTop: 8, fontSize: 13 }}>
                <div className="row-wrap" style={{ color: 'var(--emerald)', fontWeight: 600 }}>
                  <ShieldCheck size={15} />
                  <span>Zero-warning Wasm build + 7 security fixes</span>
                </div>
              </div>
            </article>

            <article className="sheet sheet-pad stack-sm">
              <span className="mono" style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>02 · COMPUTE PLANE</span>
              <h3 style={{ fontSize: 20 }}>Akash Containers &amp; GPUs</h3>
              <p style={{ color: 'var(--ink-secondary)', fontSize: 14.5 }}>
                Bring unmodified OCI/Docker images in a clean <code>lemnis.yaml</code>. Deterministic
                Akash SDL v2.0 enforces your 50% AWS bid cap on-chain so overpriced leases are
                rejected automatically.
              </p>
              <div className="recessed" style={{ marginTop: 8, fontSize: 13 }}>
                <span className="mono">H100 ~$2.88/hr vs AWS $6.88/hr on-demand</span>
              </div>
            </article>

            <article className="sheet sheet-pad stack-sm">
              <span className="mono" style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>03 · DEVELOPER EXPERIENCE</span>
              <h3 style={{ fontSize: 20 }}>Lemniskit CLI + SDK</h3>
              <p style={{ color: 'var(--ink-secondary)', fontSize: 14.5 }}>
                Estimate costs offline before signing up, generate Akash SDL manifests, verify
                real ICP replica reachability, and inspect every dollar saved against AWS on-demand.
              </p>
              <pre className="code-block" style={{ padding: '10px 12px', fontSize: 11.5, marginTop: 6 }}>
{`lemniskit init my-api
lemniskit estimate -f lemnis.yaml
lemniskit sdl -f lemnis.yaml`}
              </pre>
            </article>
          </div>
        </div>
      </section>

      {/* Honest Pricing & Storage Transparency */}
      <section className="section">
        <div className="container">
          <div className="section-header">
            <span className="section-eyebrow">Audited Pricing · Checked Nov 2026</span>
            <h2 className="section-title">Transparent baselines — including where AWS wins.</h2>
            <p className="section-subtitle">
              All AWS figures reflect us-east-1 on-demand list pricing. LEMNIS markup defaults to
              20% and is hard-capped at 25% inside <code>protocol-28/billing/main.mo</code>.
            </p>
          </div>

          <div className="sheet">
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Monthly Workload (730 hrs)</th>
                    <th>AWS On-Demand Baseline</th>
                    <th className="num">AWS / mo</th>
                    <th className="num">LEMNIS / mo</th>
                    <th className="num">Net Saving</th>
                    <th>Disclosure</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>Web API</strong> (2 vCPU · 8 GiB · 20 GiB disk)</td>
                    <td><code>m7i.large</code> + EBS gp3</td>
                    <td className="num">$75.18</td>
                    <td className="num">~$23.16*</td>
                    <td className="num"><span className="badge badge-emerald">~69%</span></td>
                    <td style={{ fontSize: 13, color: 'var(--ink-muted)' }}>*CPU rate confirmed by live Akash bid</td>
                  </tr>
                  <tr>
                    <td><strong>Web API + 500 GiB Egress</strong></td>
                    <td><code>m7i.large</code> + $36 egress</td>
                    <td className="num">$111.18</td>
                    <td className="num">~$23.16*</td>
                    <td className="num"><span className="badge badge-emerald">~79%</span></td>
                    <td style={{ fontSize: 13, color: 'var(--ink-muted)' }}>Akash bundles bandwidth into bids</td>
                  </tr>
                  <tr>
                    <td><strong>GPU Inference</strong> (1× NVIDIA H100, 100 hrs)</td>
                    <td><code>p5.48xlarge</code> ($6.88/GPU-hr)</td>
                    <td className="num">$688.00</td>
                    <td className="num">~$288.00</td>
                    <td className="num"><span className="badge badge-emerald">~58%</span></td>
                    <td style={{ fontSize: 13, color: 'var(--ink-muted)' }}>3-yr AWS Savings Plan (~$3.10/hr) narrows gap</td>
                  </tr>
                  <tr>
                    <td><strong>Bulk Object Storage</strong> (100 GB, low egress)</td>
                    <td>S3 Standard ($0.023/GB-mo)</td>
                    <td className="num">$2.30</td>
                    <td className="num">$5.00 IPFS / $44.60 ICP</td>
                    <td className="num"><span className="badge badge-amber">AWS wins</span></td>
                    <td style={{ fontSize: 13, color: 'var(--ink-muted)' }}>ICP storage is for small control-plane state only</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid-4" style={{ marginTop: 28 }}>
            {[
              { name: 'Free', price: '$0/mo', cycles: '100B cycles (~$0.14)', credit: '$2 Akash sandbox', perks: ['Offline estimator & SDL', '1 org · 3 deployments', 'Protocol 28 control plane'] },
              { name: 'Indie', price: '$9/mo', cycles: '5T cycles (~$7.00)', credit: '$9 compute credit', perks: ['50% savings bid cap', 'Unlimited CLI link codes', '$0 Akash egress markup'] },
              { name: 'Pro', price: '$29/mo', cycles: '20T cycles (~$28.00)', credit: '$29 compute credit', perks: ['Multi-group GPU placements', 'Team RBAC (up to 5 seats)', 'Idempotent usage ledger'] },
              { name: 'Team', price: '$99/mo', cycles: '100T cycles (~$140)', credit: '$99 compute credit', perks: ['Up to 20 org members', 'EU/US region pinning', 'Priority Akash bridge SLA'] },
            ].map((tier) => (
              <div key={tier.name} className="sheet sheet-pad stack-sm">
                <div className="row-between">
                  <strong style={{ fontSize: 16 }}>{tier.name}</strong>
                  <span className="mono tabular" style={{ fontWeight: 700, color: 'var(--accent)' }}>{tier.price}</span>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--ink-muted)' }}>{tier.cycles} · {tier.credit}</div>
                <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {tier.perks.map((perk) => (
                    <li key={perk} style={{ fontSize: 13, color: 'var(--ink-secondary)', display: 'flex', gap: 7, alignItems: 'center' }}>
                      <Check size={14} color="var(--emerald)" />
                      <span>{perk}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="container footer-inner">
          <div>
            <strong style={{ color: 'var(--ink-primary)' }}>LEMNIS Cloud Platform</strong> · Protocol 28 (ICP) + Akash Network · Apache-2.0
          </div>
          <div className="row-wrap">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onNavigate('estimator')}>Estimator</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onNavigate('architecture')}>Protocol 28</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onNavigate('whitepaper')}>Whitepaper v3.1</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => onNavigate('console')}>Launch Console</button>
          </div>
        </div>
      </footer>
    </main>
  );
}
