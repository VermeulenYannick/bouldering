import { STORAGE_KEY } from '../constants/app.js';

/** Read the locally cached training log, returning null when it is absent or malformed. */
export function loadLocal() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  } catch {
    return null;
  }
}

/** Persist the complete client-side training state immediately to localStorage. */
export function saveLocal(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
