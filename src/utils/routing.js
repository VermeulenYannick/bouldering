/** Parse the browser URL into one of the app's supported screens. */
export function routeFromLocation() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';

  if (path === '/' || path === '/calendar') {
    return { screen: 'calendar', date: null };
  }

  const match = path.match(/^\/(?:day|entry)\/(\d{4}-\d{2}-\d{2})$/);
  if (match) {
    return { screen: 'entry', date: match[1] };
  }

  window.history.replaceState({}, '', '/');
  return { screen: 'calendar', date: null };
}

/** Navigate within the SPA while preserving normal browser back/forward behavior. */
export function navigateTo(path, replace = false) {
  const method = replace ? 'replaceState' : 'pushState';
  window.history[method]({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
