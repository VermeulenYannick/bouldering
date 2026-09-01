import { useEffect } from 'react';
import { SAVE_DEBOUNCE_MS } from '../constants/app.js';
import { api } from '../utils/api.js';
import { loadLocal, saveLocal } from '../utils/storage.js';

/**
 * Synchronize the browser's local training log with the server.
 *
 * The local copy is the fast, resilient source used by the UI. Server writes
 * are debounced so normal typing does not create a request for every keystroke.
 * A final keepalive request is attempted when the document is hidden or paged
 * away from, protecting edits when mobile Safari suspends the page.
 */
export function useTrainingSync({ loggedIn, localState, setLocalState, setServerMeta, serverMeta, setSyncState }) {
  useEffect(() => {
    if (!loggedIn) return undefined;

    let timer = null;

    /** Save newer local data to the server, optionally using fetch keepalive. */
    const syncLatest = async (keepalive = false) => {
      const current = loadLocal();
      if (!current?.updatedAt) return;

      try {
        if (keepalive) {
          const serverTimestamp = serverMeta?.updatedAt || 0;
          if (current.updatedAt <= serverTimestamp) return;

          await fetch('/api/logs', {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(current),
            keepalive: true,
          });
          return;
        }

        setSyncState('saving');
        const latest = await api('/logs/latest');
        const latestTimestamp = latest?.updatedAt || 0;

        if (current.updatedAt > latestTimestamp) {
          await api('/logs', { method: 'PUT', body: JSON.stringify(current) });
          setServerMeta({ updatedAt: current.updatedAt });
          setSyncState('saved');
        } else {
          setServerMeta({ updatedAt: latestTimestamp });
          setSyncState('synced');
        }
      } catch {
        if (!keepalive) setSyncState('offline');
      }
    };

    /** Debounce a normal server save until the user pauses editing. */
    const scheduleSave = () => {
      if (timer) clearTimeout(timer);

      const current = loadLocal();
      if (!current?.updatedAt) return;

      const serverTimestamp = serverMeta?.updatedAt || 0;
      if (current.updatedAt <= serverTimestamp) return;

      timer = setTimeout(() => {
        timer = null;
        syncLatest(false);
      }, SAVE_DEBOUNCE_MS);
    };

    scheduleSave();

    /** Flush pending edits when Safari moves the page into the background. */
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') syncLatest(true);
    };

    /** Flush pending edits when the current document is being discarded. */
    const onPageHide = () => syncLatest(true);

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onPageHide);

    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [loggedIn, localState?.updatedAt, serverMeta?.updatedAt, setServerMeta, setSyncState]);

  useEffect(() => {
    if (!loggedIn) return undefined;

    let alive = true;

    /** Hydrate local state from the newest available local/server copy. */
    const hydrate = async () => {
      const local = loadLocal();

      try {
        const latest = await api('/logs/latest');
        if (!alive) return;

        if (!local && latest) {
          saveLocal(latest);
          setLocalState(latest);
        } else if (latest && local && latest.updatedAt > local.updatedAt) {
          saveLocal(latest);
          setLocalState(latest);
        }

        setServerMeta(latest ? { updatedAt: latest.updatedAt } : null);
      } catch {
        // Local state remains usable when the server cannot be reached.
      }
    };

    hydrate();
    return () => {
      alive = false;
    };
  }, [loggedIn, setLocalState, setServerMeta]);
}
