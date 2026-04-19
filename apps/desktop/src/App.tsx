import { useEffect, useState } from 'react';
import { QuickPrompt } from './components/QuickPrompt';
import { Preferences } from './components/Preferences';

/**
 * Root router. Electron loads the same bundle for each BrowserWindow and picks
 * a route via URL hash: `#/quick` or `#/preferences`. Default falls back to the
 * quick prompt so `pnpm dev` in a plain browser still shows something useful.
 */
export function App() {
  const [route, setRoute] = useState(() => window.location.hash.replace(/^#/, '') || '/quick');

  useEffect(() => {
    const onHash = () => setRoute(window.location.hash.replace(/^#/, '') || '/quick');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (route.startsWith('/preferences')) return <Preferences />;
  return <QuickPrompt />;
}

export default App;
