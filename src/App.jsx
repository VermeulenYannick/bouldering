import { useEffect, useMemo, useState } from 'react';
import { api } from './utils/api.js';
import { clone, emptyLog } from './utils/data.js';
import { dateKey } from './utils/dates.js';
import { loadLocal, saveLocal } from './utils/storage.js';
import { navigateTo, routeFromLocation } from './utils/routing.js';
import { useTrainingSync } from './hooks/useTrainingSync.js';
import PinScreen from './components/auth/PinScreen.jsx';
import PasskeyLogin from './components/auth/PasskeyLogin.jsx';
import PasskeySetup from './components/auth/PasskeySetup.jsx';
import Calendar from './components/Calendar.jsx';
import Entry from './components/Entry.jsx';

/**
 * Root application component.
 *
 * App owns cross-screen concerns only: authentication state, route state,
 * workout templates, and the shared local/server training-log state. Individual
 * screens and editors live in their own component modules.
 */
export default function App() {
  const initialRoute = useMemo(() => routeFromLocation(), []);
  const [authStage, setAuthStage] = useState('loading');
  const [route, setRoute] = useState(initialRoute);
  const [localState, setLocalState] = useState(() => loadLocal());
  const [serverMeta, setServerMeta] = useState(null);
  const [syncState, setSyncState] = useState('');
  const [workouts, setWorkouts] = useState([]);

  /** Keep React's route state synchronized with browser back/forward navigation. */
  useEffect(() => {
    const onPopState = () => setRoute(routeFromLocation());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  /** Determine whether the visitor is already authenticated and which gate to show. */
  useEffect(() => {
    api('/auth/status')
      .then((status) => {
        if (status.authenticated) setAuthStage('authenticated');
        else setAuthStage(status.passkeyConfigured ? 'passkey' : 'pin');
      })
      .catch(() => setAuthStage('pin'));
  }, []);

  const loggedIn = authStage === 'authenticated';

  /** Load workout templates only after authentication succeeds. */
  useEffect(() => {
    if (!loggedIn) return;
    api('/workouts').then(setWorkouts).catch(() => setWorkouts([]));
  }, [loggedIn]);

  useTrainingSync({
    loggedIn,
    localState,
    setLocalState,
    serverMeta,
    setServerMeta,
    setSyncState,
  });

  /** Apply a mutation to the local log and mark it dirty for debounced syncing. */
  const updateLog = (mutator) => {
    const current = clone(loadLocal() || { logs: {} });
    current.logs = current.logs || {};
    mutator(current);
    current.updatedAt = Date.now();
    saveLocal(current);
    setLocalState(current);
    setSyncState('pending');
  };

  /** Return a saved log for a date, or a virtual log based on the scheduled template. */
  const getLog = (key) => localState?.logs?.[key] || emptyLog(key, workouts);

  /** Open a specific day using the URL-based SPA router. */
  const openDate = (key) => navigateTo(`/day/${key}`);

  /** Return to the calendar route without causing a full page reload. */
  const goCalendar = () => navigateTo('/');

  if (authStage === 'loading') return <div className="loading">Loading…</div>;
  if (authStage === 'passkey') return <PasskeyLogin onSuccess={() => setAuthStage('pin')} />;
  if (authStage === 'pin') return <PinScreen onSuccess={(needsSetup) => setAuthStage(needsSetup ? 'setup' : 'authenticated')} />;
  if (authStage === 'setup') return <PasskeySetup onSuccess={() => setAuthStage('authenticated')} />;
  if (!workouts.length) return <div className="loading">Loading workouts…</div>;

  if (route.screen === 'entry') {
    const date = route.date || dateKey();
    return (
      <Entry
        key={date}
        date={date}
        log={getLog(date)}
        workouts={workouts}
        onBack={goCalendar}
        onChange={(patch) => updateLog((state) => {
          state.logs[date] = { ...getLog(date), ...patch, updatedAt: Date.now() };
        })}
        syncState={syncState}
      />
    );
  }

  return <Calendar localState={localState} workouts={workouts} onDate={openDate} syncState={syncState} />;
}
