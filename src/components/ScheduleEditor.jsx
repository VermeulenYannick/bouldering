import React, { useEffect, useState } from 'react';
import { api } from '../utils/api.js';
import { WEEKDAY_LABELS } from '../constants/app.js';
import { navigateTo } from '../utils/routing.js';
import HamburgerMenu from './HamburgerMenu.jsx';

/**
 * Edit the reusable Monday-Sunday schedule.
 * The schedule stores only the template assigned to each weekday; individual
 * calendar dates remain free to override that schedule in their own log.
 */
export default function ScheduleEditor({ onBack }) {
  const [templates, setTemplates] = useState([]);
  const [schedule, setSchedule] = useState(Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, workoutId: null })));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  /** Load all templates and the current seven-day schedule. */
  useEffect(() => {
    Promise.all([api('/workout-templates'), api('/workout-schedule')])
      .then(([items, savedSchedule]) => {
        setTemplates(Array.isArray(items) ? items : []);
        const byDay = new Map((savedSchedule || []).map((item) => [Number(item.dayOfWeek), item.workoutId || null]));
        setSchedule(Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, workoutId: byDay.get(dayOfWeek) || null })));
      })
      .catch((err) => setError(err.message || 'Could not load the schedule.'))
      .finally(() => setLoading(false));
  }, []);

  /** Change one weekday's assigned workout locally until the whole schedule is saved. */
  const setDay = (dayOfWeek, workoutId) => setSchedule((current) => current.map((day) => day.dayOfWeek === dayOfWeek ? { ...day, workoutId: workoutId || null } : day));

  /** Persist all seven weekday assignments to MongoDB. */
  const save = async () => {
    setSaving(true); setError(''); setMessage('');
    try {
      await Promise.all(schedule.map((day) => api(`/workout-schedule/${day.dayOfWeek}`, { method: 'PUT', body: JSON.stringify({ workoutId: day.workoutId }) })));
      setMessage("Schedule saved. Specific dates you've already edited were not changed.");
    } catch (err) {
      setError(err.message || 'Could not save schedule.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="loading">Loading schedule…</div>;

  return <main className="app management-app">
    <header className="topbar management-topbar">
      <div className="management-title-row">
        <HamburgerMenu />
        <div>
          <div className="eyebrow">WORKOUT SCHEDULE</div>
          <h1>Weekly schedule</h1>
        </div>
      </div>
      <button type="button" className="primary-action" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save schedule'}</button>
    </header>

    <section className="management-card">
      <div className="management-card-head">
        <div>
          <h2>Monday to Sunday</h2>
          <p>This controls future dates that haven't been explicitly customized.</p>
        </div>
      </div>
      <div className="schedule-list">
        {schedule.map((day) => <div className="schedule-row" key={day.dayOfWeek}>
          <strong>{WEEKDAY_LABELS[(day.dayOfWeek + 6) % 7]}</strong>
          <select value={day.workoutId || ''} onChange={(e) => setDay(day.dayOfWeek, e.target.value)}>
            <option value="">Rest / no workout</option>
            {templates.map((template) => <option key={template._id} value={template._id}>{template.title}</option>)}
          </select>
          <button type="button" className="schedule-edit" onClick={() => day.workoutId && navigateTo(`/workouts/${encodeURIComponent(day.workoutId)}`)} disabled={!day.workoutId}>Edit</button>
        </div>)}
      </div>
    </section>

    {(error || message) && <div className={error ? 'editor-error' : 'editor-success'}>{error || message}</div>}
    <button type="button" className="secondary-action management-back" onClick={onBack}>‹ Calendar</button>
  </main>;
}
