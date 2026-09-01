import React, { useEffect, useState } from 'react';
import { navigateTo } from '../utils/routing.js';

/**
 * Render the global hamburger navigation drawer.
 * The drawer owns only its open/closed state; navigation itself is handled by
 * the shared history-based SPA router.
 */
export default function HamburgerMenu() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  /** Navigate to a top-level app screen and close the drawer. */
  const go = (path) => {
    setOpen(false);
    navigateTo(path);
  };

  return <>
    <button type="button" className="hamburger-button" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)}>
      <span /><span /><span />
    </button>

    {open && <div className="menu-backdrop" onClick={() => setOpen(false)}>
      <aside className="side-menu" aria-label="Main menu" onClick={(event) => event.stopPropagation()}>
        <div className="side-menu-head">
          <div>
            <div className="eyebrow">BOULDERING LOG</div>
            <strong>Menu</strong>
          </div>
          <button type="button" className="menu-close" aria-label="Close menu" onClick={() => setOpen(false)}>×</button>
        </div>

        <nav className="side-menu-nav">
          <button type="button" onClick={() => go('/')}>Calendar</button>
          <button type="button" onClick={() => go('/workouts')}>Workouts</button>
          <button type="button" onClick={() => go('/schedule')}>Weekly schedule</button>
        </nav>
      </aside>
    </div>}
  </>;
}
