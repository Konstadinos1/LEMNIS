import { useEffect, useState } from 'react';
import { ConsoleApp, type ConsoleTab } from './components/console/ConsoleApp';
import { ArchitectureExplorer } from './components/website/ArchitectureExplorer';
import { EstimatorStudio } from './components/website/EstimatorStudio';
import { LandingPage } from './components/website/LandingPage';
import { TopNav, type SiteRoute } from './components/website/TopNav';
import { WhitepaperReader } from './components/website/WhitepaperReader';
import { MANIFEST_PRESETS } from './data/whitepaperContent';
import { loadProtocol28State, type Protocol28State } from './runtime/protocol28Store';

const VALID_ROUTES = new Set<SiteRoute>(['home', 'estimator', 'architecture', 'whitepaper', 'console']);

function readRouteFromHash(): SiteRoute {
  const clean = window.location.hash.replace(/^#\/?/, '').split('/')[0] as SiteRoute;
  return VALID_ROUTES.has(clean) ? clean : 'home';
}

export function App() {
  const [route, setRoute] = useState<SiteRoute>(() => readRouteFromHash());
  const [consoleInitialTab, setConsoleInitialTab] = useState<ConsoleTab>('overview');
  const [state, setState] = useState<Protocol28State>(() => loadProtocol28State());
  const [draftManifestYaml, setDraftManifestYaml] = useState<string>(MANIFEST_PRESETS[0].yaml);

  useEffect(() => {
    function handleHashChange() {
      setRoute(readRouteFromHash());
    }
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  function navigate(nextRoute: SiteRoute) {
    window.location.hash = nextRoute === 'home' ? '#/' : `#/${nextRoute}`;
    setRoute(nextRoute);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleInspectInEstimator(yaml: string) {
    setDraftManifestYaml(yaml);
    navigate('estimator');
  }

  function handleSendToConsoleDeploy(yaml: string) {
    setDraftManifestYaml(yaml);
    setConsoleInitialTab('compute');
    navigate('console');
  }

  return (
    <>
      <TopNav currentRoute={route} onNavigate={navigate} />

      {route === 'home' && (
        <LandingPage onNavigate={navigate} onDeployPreset={handleInspectInEstimator} />
      )}

      {route === 'estimator' && (
        <EstimatorStudio
          initialYaml={draftManifestYaml}
          onSendToConsole={handleSendToConsoleDeploy}
        />
      )}

      {route === 'architecture' && <ArchitectureExplorer onNavigate={navigate} />}

      {route === 'whitepaper' && <WhitepaperReader onNavigate={navigate} />}

      {route === 'console' && (
        <ConsoleApp
          state={state}
          setState={setState}
          draftManifestYaml={draftManifestYaml}
          onDraftChange={setDraftManifestYaml}
          initialTab={consoleInitialTab}
        />
      )}
    </>
  );
}

export default App;
