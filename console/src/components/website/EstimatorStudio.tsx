import { useMemo, useState } from 'react';
import { AlertTriangle, Check, Copy, Download, Rocket } from 'lucide-react';
import {
  DEFAULT_MARKUP_PERCENT,
  MAX_MARKUP_PERCENT,
  estimateProjectSavings,
  generateAkashSdl,
  parseLemnisYaml,
} from '@lemnis/sdk';
import { MANIFEST_PRESETS } from '../../data/whitepaperContent';

interface EstimatorStudioProps {
  initialYaml?: string;
  onSendToConsole: (yaml: string) => void;
}

function formatUsd(val: number): string {
  return `$${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function EstimatorStudio({ initialYaml, onSendToConsole }: EstimatorStudioProps) {
  const [yamlText, setYamlText] = useState(initialYaml ?? MANIFEST_PRESETS[0].yaml);
  const [markup, setMarkup] = useState(DEFAULT_MARKUP_PERCENT);
  const [activeTab, setActiveTab] = useState<'estimate' | 'sdl'>('estimate');
  const [copied, setCopied] = useState(false);

  const analysis = useMemo(() => {
    try {
      const { manifest, warnings } = parseLemnisYaml(yamlText);
      const estimate = estimateProjectSavings(manifest, markup);
      const sdl = generateAkashSdl(manifest, markup);
      return { ok: true as const, manifest, warnings, estimate, sdl };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
    }
  }, [yamlText, markup]);

  function handleCopySdl() {
    if (!analysis.ok) return;
    navigator.clipboard?.writeText(analysis.sdl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  function handleDownload(filename: string, content: string) {
    const blob = new Blob([content], { type: 'text/yaml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="container" style={{ paddingTop: 44, paddingBottom: 72 }}>
      <div className="section-header" style={{ marginBottom: 28 }}>
        <span className="section-eyebrow">Offline Savings Estimator &amp; Akash SDL Studio</span>
        <h1 className="section-title">Inspect real numbers before you sign up.</h1>
        <p className="section-subtitle">
          Powered by the exact same <code>@lemnis/sdk</code> engine as <code>lemniskit estimate</code>.
          Edit <code>lemnis.yaml</code> directly, adjust platform markup (capped at {MAX_MARKUP_PERCENT}% on-chain),
          and inspect your deterministic Akash SDL v2.0.
        </p>
      </div>

      {/* Preset Selector */}
      <div className="row-between" style={{ marginBottom: 18 }}>
        <div className="row-wrap">
          {MANIFEST_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setYamlText(preset.yaml)}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="row-wrap">
          <label htmlFor="markup-slider" className="field-label" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>LEMNIS Markup:</span>
            <input
              id="markup-slider"
              type="range"
              min={0}
              max={MAX_MARKUP_PERCENT}
              value={markup}
              onChange={(e) => setMarkup(Number(e.target.value))}
            />
            <span className="mono tabular" style={{ fontWeight: 700, color: 'var(--accent)', minWidth: 36 }}>
              {markup}%
            </span>
          </label>
        </div>
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        {/* Left: Manifest Editor */}
        <div className="sheet sheet-pad stack-md">
          <div className="row-between">
            <div>
              <strong className="mono" style={{ fontSize: 13 }}>lemnis.yaml</strong>
              <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>Validated live with Zod · non-secret config only</div>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => handleDownload('lemnis.yaml', yamlText)}
            >
              <Download size={14} /> Download
            </button>
          </div>

          <textarea
            id="manifest-editor"
            aria-label="lemnis.yaml manifest editor"
            className="textarea textarea-code"
            rows={20}
            value={yamlText}
            onChange={(e) => setYamlText(e.target.value)}
            spellCheck={false}
          />

          {analysis.ok && analysis.warnings.length > 0 && (
            <div className="callout callout-amber">
              <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
              <div className="stack-sm" style={{ gap: 4 }}>
                <strong>Confidentiality &amp; Manifest Warnings</strong>
                {analysis.warnings.map((w) => (
                  <div key={w}>{w}</div>
                ))}
              </div>
            </div>
          )}

          {!analysis.ok && (
            <div className="callout callout-danger">
              <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <strong>Validation Error:</strong> {analysis.error}
              </div>
            </div>
          )}
        </div>

        {/* Right: Output Panel */}
        <div className="sheet sheet-pad stack-md">
          <div className="row-between">
            <div className="row-wrap">
              <button
                id="tab-estimate"
                type="button"
                className={`btn btn-sm ${activeTab === 'estimate' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setActiveTab('estimate')}
              >
                Cost Breakdown
              </button>
              <button
                id="tab-sdl"
                type="button"
                className={`btn btn-sm ${activeTab === 'sdl' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setActiveTab('sdl')}
              >
                Akash SDL v2.0
              </button>
            </div>

            {analysis.ok && (
              <button
                id="estimator-deploy-console"
                type="button"
                className="btn btn-accent btn-sm"
                onClick={() => onSendToConsole(yamlText)}
              >
                <Rocket size={14} />
                Deploy in Console
              </button>
            )}
          </div>

          {!analysis.ok ? (
            <div className="recessed" style={{ color: 'var(--ink-muted)' }}>
              Fix the YAML syntax or schema errors on the left to compute your savings estimate and Akash SDL.
            </div>
          ) : activeTab === 'estimate' ? (
            <div className="stack-md">
              <div className="grid-3">
                <div className="recessed">
                  <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>AWS On-Demand</div>
                  <div className="mono tabular" style={{ fontSize: 20, fontWeight: 700 }}>
                    {formatUsd(analysis.estimate.totalAwsMonthlyUsd)}
                  </div>
                </div>
                <div className="recessed">
                  <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>LEMNIS ({markup}% markup)</div>
                  <div className="mono tabular" style={{ fontSize: 20, fontWeight: 700, color: 'var(--emerald)' }}>
                    {formatUsd(analysis.estimate.totalLemnisMonthlyUsd)}
                  </div>
                </div>
                <div className="recessed">
                  <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>Monthly Savings</div>
                  <div className="mono tabular" style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent)' }}>
                    {analysis.estimate.totalSavedPercent}%
                  </div>
                </div>
              </div>

              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Line Item</th>
                      <th>AWS Baseline</th>
                      <th className="num">AWS/mo</th>
                      <th className="num">LEMNIS/mo</th>
                      <th className="num">Bid Cap</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.estimate.services.map((line) => (
                      <tr key={line.service}>
                        <td>
                          <strong>{line.service}</strong>
                          <div style={{ fontSize: 11.5, color: 'var(--ink-muted)' }}>{line.specSummary}</div>
                        </td>
                        <td style={{ fontSize: 12.5 }}>{line.awsBaselineLabel}</td>
                        <td className="num">{formatUsd(line.awsMonthlyUsd)}</td>
                        <td className="num">
                          {formatUsd(line.lemnisMonthlyUsd)}
                          {line.confidence === 'estimate' ? '*' : ''}
                        </td>
                        <td className="num" style={{ color: 'var(--ink-muted)' }}>
                          ≤ {formatUsd(line.bidCapMonthlyUsd)}
                        </td>
                      </tr>
                    ))}
                    {analysis.estimate.internetEgressGiB > 0 && (
                      <tr>
                        <td><strong>egress</strong></td>
                        <td style={{ fontSize: 12.5 }}>{analysis.estimate.internetEgressGiB} GiB internet</td>
                        <td className="num">{formatUsd(analysis.estimate.awsEgressMonthlyUsd)}</td>
                        <td className="num">$0.00</td>
                        <td className="num">—</td>
                      </tr>
                    )}
                    {analysis.estimate.fromAwsGiB > 0 && (
                      <tr>
                        <td><strong>from_aws</strong></td>
                        <td style={{ fontSize: 12.5 }}>{analysis.estimate.fromAwsGiB} GiB still paid to AWS</td>
                        <td className="num">$0.00</td>
                        <td className="num">{formatUsd(analysis.estimate.fromAwsStillPaidToAwsUsd)}</td>
                        <td className="num">—</td>
                      </tr>
                    )}
                    <tr className="total-row">
                      <td>TOTAL</td>
                      <td>{analysis.estimate.region ? `region: ${analysis.estimate.region}` : 'region: global'}</td>
                      <td className="num">{formatUsd(analysis.estimate.totalAwsMonthlyUsd)}</td>
                      <td className="num">{formatUsd(analysis.estimate.totalLemnisMonthlyUsd)}</td>
                      <td className="num" style={{ color: 'var(--emerald)' }}>
                        -{formatUsd(analysis.estimate.totalSavedMonthlyUsd)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {analysis.estimate.notes.length > 0 && (
                <div className="callout callout-neutral">
                  <div className="stack-sm" style={{ gap: 6, fontSize: 12.5 }}>
                    <strong>Honesty Disclosures (prices checked {analysis.estimate.pricesCheckedAt})</strong>
                    {analysis.estimate.notes.map((n) => (
                      <div key={n}>• {n}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="stack-sm">
              <div className="row-between">
                <span style={{ fontSize: 12.5, color: 'var(--ink-muted)' }}>
                  Deterministic Akash SDL v2.0 (enforces ≤ 50% AWS bid caps)
                </span>
                <div className="row-wrap">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={handleCopySdl}>
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? 'Copied' : 'Copy SDL'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => handleDownload(`${analysis.manifest.project}.sdl.yaml`, analysis.sdl)}
                  >
                    <Download size={14} /> Save
                  </button>
                </div>
              </div>
              <pre className="code-block" style={{ maxHeight: 460 }}>{analysis.sdl}</pre>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
