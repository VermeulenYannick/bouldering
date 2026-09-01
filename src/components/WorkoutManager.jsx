import React, { useEffect, useState } from 'react';
import { api } from '../utils/api.js';
import { navigateTo } from '../utils/routing.js';
import { INTENSITY_LABELS } from '../constants/app.js';
import HamburgerMenu from './HamburgerMenu.jsx';

/**
 * Show all editable workout templates and provide entry points for creation.
 * Template records are intentionally separate from day-specific workout logs.
 */
export default function WorkoutManager({ onBack }) {
  const [workouts, setWorkouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  /** Load the reusable workout templates from MongoDB. */
  const load = () => {
    setLoading(true);
    setError('');
    api('/workout-templates')
      .then((items) => setWorkouts(Array.isArray(items) ? items : []))
      .catch((err) => setError(err.message || 'Could not load workouts.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  /** Open the create-workout editor. */
  const createWorkout = () => navigateTo('/workouts/new');

  return <main className="app management-app">
    <header className="topbar management-topbar">
      <div className="management-title-row">
        <HamburgerMenu />
        <div>
          <div className="eyebrow">WORKOUT BUILDER</div>
          <h1>Workouts</h1>
        </div>
      </div>
      <button type="button" className="primary-action" onClick={createWorkout}>＋ New workout</button>
    </header>

    <section className="management-card">
      <div className="management-card-head">
        <div>
          <h2>Workout templates</h2>
          <p>Edit reusable workouts without changing any already-logged day.</p>
        </div>
      </div>

      {loading ? <div className="management-empty">Loading workouts…</div> : error ? <div className="management-error">{error}<button type="button" onClick={load}>Retry</button></div> : <div className="template-list">
        {workouts.map((workout) => <button type="button" className="template-row" key={workout._id} onClick={() => navigateTo(`/workouts/${encodeURIComponent(workout._id)}`)}>
          <span className={`template-intensity ${workout.color || ''}`} aria-hidden="true" />
          <span className="template-main">
            <strong>{workout.title}</strong>
            <span>{workout.type === 'climbing' ? 'Bouldering' : 'Gym'}{INTENSITY_LABELS[workout.color] ? ` · ${INTENSITY_LABELS[workout.color]}` : ''}</span>
          </span>
          <span className="template-chevron">›</span>
        </button>)}
        {!workouts.length && <div className="management-empty">No workout templates yet.</div>}
      </div>}
    </section>

    <button type="button" className="secondary-action management-back" onClick={onBack}>‹ Calendar</button>
  </main>;
}
