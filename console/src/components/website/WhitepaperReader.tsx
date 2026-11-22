import { useMemo, useState } from 'react';
import { ArrowRight, Search } from 'lucide-react';
import { WHITEPAPER_SECTIONS } from '../../data/whitepaperContent';
import type { SiteRoute } from './TopNav';

interface WhitepaperReaderProps {
  onNavigate: (route: SiteRoute) => void;
}

export function WhitepaperReader({ onNavigate }: WhitepaperReaderProps) {
  const [activeId, setActiveId] = useState(WHITEPAPER_SECTIONS[0].id);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return WHITEPAPER_SECTIONS;
    return WHITEPAPER_SECTIONS.filter(
      (sec) =>
        sec.title.toLowerCase().includes(q) ||
        sec.summary.toLowerCase().includes(q) ||
        sec.paragraphs.some((p) => p.toLowerCase().includes(q)) ||
        (sec.bullets ?? []).some((b) => b.toLowerCase().includes(q)),
    );
  }, [query]);

  function scrollToSection(id: string) {
    setActiveId(id);
    const el = document.getElementById(`wp-${id}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <main className="container" style={{ paddingTop: 44, paddingBottom: 72 }}>
      <div className="row-between" style={{ marginBottom: 32, alignItems: 'flex-end' }}>
        <div className="section-header" style={{ marginBottom: 0 }}>
          <span className="section-eyebrow">Enterprise Architecture Whitepaper · v3.1 (Audited Nov 2026)</span>
          <h1 className="section-title">LEMNIS Decentralized Cloud Specification</h1>
          <p className="section-subtitle">
            Reconciled against verified November 2026 cloud pricing and the hardened Protocol 28
            Motoko codebase (<code>docs/ARCHITECTURE.md</code>).
          </p>
        </div>
        <button
          type="button"
          className="btn btn-accent btn-sm"
          onClick={() => onNavigate('console')}
        >
          Test in Cloud Console <ArrowRight size={14} />
        </button>
      </div>

      <div className="whitepaper-layout">
        <aside className="sheet whitepaper-toc stack-sm">
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--ink-muted)' }} />
            <input
              id="whitepaper-search"
              type="search"
              className="input"
              placeholder="Search sections..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ paddingLeft: 32, fontSize: 13 }}
            />
          </div>

          <div style={{ marginTop: 6 }}>
            {WHITEPAPER_SECTIONS.map((sec) => (
              <button
                key={sec.id}
                type="button"
                className={`toc-btn ${activeId === sec.id ? 'active' : ''}`}
                onClick={() => scrollToSection(sec.id)}
              >
                <span className="mono" style={{ fontSize: 11, marginRight: 6, opacity: 0.7 }}>{sec.number}</span>
                {sec.title}
              </button>
            ))}
          </div>
        </aside>

        <div className="stack-lg">
          {filtered.length === 0 ? (
            <div className="sheet sheet-pad" style={{ color: 'var(--ink-muted)' }}>
              No whitepaper sections matched &ldquo;{query}&rdquo;.
            </div>
          ) : (
            filtered.map((sec) => (
              <article key={sec.id} id={`wp-${sec.id}`} className="sheet sheet-pad stack-md">
                <div>
                  <span className="mono" style={{ fontSize: 11.5, color: 'var(--accent)', fontWeight: 600 }}>
                    SECTION {sec.number}
                  </span>
                  <h2 style={{ fontSize: 24, marginTop: 4 }}>{sec.title}</h2>
                  <p style={{ color: 'var(--ink-muted)', fontSize: 14, marginTop: 6 }}>{sec.summary}</p>
                </div>

                {sec.paragraphs.map((p) => (
                  <p key={p} style={{ color: 'var(--ink-secondary)', fontSize: 15, lineHeight: 1.72 }}>
                    {p}
                  </p>
                ))}

                {sec.bullets && (
                  <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8, color: 'var(--ink-secondary)' }}>
                    {sec.bullets.map((b) => (
                      <li key={b} style={{ lineHeight: 1.6 }}>{b}</li>
                    ))}
                  </ul>
                )}

                {sec.table && (
                  <div className="table-wrap" style={{ border: '1px solid var(--border)', borderRadius: 8 }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          {sec.table.headers.map((h) => (
                            <th key={h}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sec.table.rows.map((row, idx) => (
                          <tr key={idx}>
                            {row.map((cell, cIdx) => (
                              <td key={cIdx} style={{ fontSize: 13.5 }}>{cell}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {sec.code && (
                  <div className="stack-sm" style={{ gap: 6 }}>
                    <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-muted)' }}>{sec.code.label}</span>
                    <pre className="code-block">{sec.code.snippet}</pre>
                  </div>
                )}

                {sec.callout && (
                  <div className={`callout callout-${sec.callout.tone}`}>
                    <div>
                      <strong>{sec.callout.title}:</strong> {sec.callout.body}
                    </div>
                  </div>
                )}
              </article>
            ))
          )}
        </div>
      </div>
    </main>
  );
}
