import { ArrowUpRight, Terminal } from 'lucide-react';

export type SiteRoute = 'home' | 'estimator' | 'architecture' | 'whitepaper' | 'console';

interface TopNavProps {
  currentRoute: SiteRoute;
  onNavigate: (route: SiteRoute) => void;
}

export function TopNav({ currentRoute, onNavigate }: TopNavProps) {
  const isConsole = currentRoute === 'console';

  return (
    <header className="topnav">
      <div className="container topnav-inner">
        <button
          id="nav-brand-home"
          type="button"
          className="brand-mark"
          onClick={() => onNavigate('home')}
        >
          <svg width="28" height="18" viewBox="0 0 28 18" fill="none" aria-hidden="true">
            <path
              d="M7.5 3.2C4.4 3.2 2 5.8 2 9s2.4 5.8 5.5 5.8c3.6 0 5.5-3.4 6.5-5.8 1-2.4 2.9-5.8 6.5-5.8 3.1 0 5.5 2.6 5.5 5.8s-2.4 5.8-5.5 5.8c-3.6 0-5.5-3.4-6.5-5.8-1-2.4-2.9-5.8-6.5-5.8Z"
              stroke="#14171B"
              strokeWidth="2.3"
              strokeLinecap="round"
            />
            <circle cx="20.5" cy="9" r="2.2" fill="#D84B1D" />
          </svg>
          <span>LEMNIS</span>
          <span className="brand-tag">P28 · v3.1</span>
        </button>

        <nav className="nav-links" aria-label="Primary navigation">
          <button
            id="nav-platform"
            type="button"
            className={`nav-link ${currentRoute === 'home' ? 'active' : ''}`}
            onClick={() => onNavigate('home')}
          >
            Platform
          </button>
          <button
            id="nav-estimator"
            type="button"
            className={`nav-link ${currentRoute === 'estimator' ? 'active' : ''}`}
            onClick={() => onNavigate('estimator')}
          >
            Estimator
          </button>
          <button
            id="nav-architecture"
            type="button"
            className={`nav-link ${currentRoute === 'architecture' ? 'active' : ''}`}
            onClick={() => onNavigate('architecture')}
          >
            Protocol 28
          </button>
          <button
            id="nav-whitepaper"
            type="button"
            className={`nav-link ${currentRoute === 'whitepaper' ? 'active' : ''}`}
            onClick={() => onNavigate('whitepaper')}
          >
            Whitepaper v3.1
          </button>
        </nav>

        <div className="row-wrap">
          {isConsole ? (
            <button
              id="nav-back-website"
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => onNavigate('home')}
            >
              Back to Website
            </button>
          ) : (
            <button
              id="nav-launch-console"
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => onNavigate('console')}
            >
              <Terminal size={15} />
              Launch Console
              <ArrowUpRight size={15} />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
