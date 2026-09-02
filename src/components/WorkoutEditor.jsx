import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../utils/api.js';
import { navigateTo } from '../utils/routing.js';
import { EXERCISE_TYPES, INTENSITY_LABELS } from '../constants/app.js';
import ExercisePicker from './ExercisePicker.jsx';
import HamburgerMenu from './HamburgerMenu.jsx';

/**
 * Edit or create a reusable workout template.
 * Gym templates use the lifting exercise catalog; bouldering templates use the
 * climbing catalog. Changes here affect the reusable template only.
 */
export default function WorkoutEditor({ workoutId, onBack }) {
  const isNew = workoutId === 'new';
  const [form, setForm] = useState(() => ({
    _id: '', title: '', type: 'strength', color: 'yellow', intensity: 'moderate', description: '', exercises: [], blocks: [], version: 1,
  }));
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  /** Load an existing template for editing. */
  useEffect(() => {
    if (isNew) return;
    api(`/workout-templates/${encodeURIComponent(workoutId)}`)
      .then((data) => setForm({
        _id: data._id,
        title: data.title || '',
        type: data.type || 'strength',
        color: data.color || ({ hard: 'red', moderate: 'yellow', easy: 'green' }[data.intensity] || 'yellow'),
        intensity: data.intensity || ({ red: 'hard', yellow: 'moderate', green: 'easy' }[data.color] || 'moderate'),
        description: data.description || '',
        exercises: Array.isArray(data.exercises) ? data.exercises : [],
        blocks: Array.isArray(data.blocks) ? data.blocks : [],
        version: data.version || 1,
      }))
      .catch((err) => setError(err.message || 'Could not load workout.'))
      .finally(() => setLoading(false));
  }, [isNew, workoutId]);

  const exerciseType = form.type === 'climbing' ? EXERCISE_TYPES.CLIMBING : EXERCISE_TYPES.LIFTING;

  /** Update one scalar field in the template draft. */
  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  /** Add a selected catalog exercise to the template while preventing duplicates. */
  const addExercise = (selected) => {
    setForm((current) => {
      const items = [...(current.exercises || [])];
      if (items.some((item) => item.exerciseId === selected._id)) return current;
      const item = {
        id: `${selected._id}_${Date.now()}`,
        exerciseId: selected._id,
        name: selected.name,
        target: `${selected.defaultSets || 3} ×  ${selected.unit === 'reps' ? '8–12' : '5–8'}`,
        unit: selected.unit || (current.type === 'climbing' ? 'reps' : 'kg'),
        defaultSets: selected.defaultSets || 3,
      };
      return { ...current, exercises: [...items, item] };
    });
    setPickerOpen(false);
  };

  /** Remove an exercise from the reusable template. */
  const removeExercise = (exerciseId) => setForm((current) => ({ ...current, exercises: current.exercises.filter((item) => item.id !== exerciseId) }));

  /** Update an exercise-level template field such as its target. */
  const updateExercise = (exerciseId, field, value) => setForm((current) => ({
    ...current,
    exercises: current.exercises.map((item) => item.id === exerciseId ? { ...item, [field]: value } : item),
  }));

  /** Reorder exercises within the reusable template. */
  const moveExercise = (index, direction) => setForm((current) => {
    const next = [...current.exercises];
    const target = index + direction;
    if (target < 0 || target >= next.length) return current;
    [next[index], next[target]] = [next[target], next[index]];
    return { ...current, exercises: next };
  });

  /** Add a simple custom bouldering block for problem/note/set work. */
  const addBlock = () => setForm((current) => ({
    ...current,
    blocks: [...(current.blocks || []), {
      id: `block_${Date.now()}`,
      title: 'New block',
      kind: 'problems',
      count: 5,
      target: '',
    }],
  }));

  /** Update one field of one bouldering block. */
  const updateBlock = (blockId, field, value) => setForm((current) => ({
    ...current,
    blocks: current.blocks.map((block) => block.id === blockId ? { ...block, [field]: field === 'count' ? Number(value) : value } : block),
  }));

  /** Remove a block from the bouldering template. */
  const removeBlock = (blockId) => setForm((current) => ({ ...current, blocks: current.blocks.filter((block) => block.id !== blockId) }));

  /** Save the template to MongoDB via create or update endpoint. */
  const save = async () => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const payload = {
        title: form.title.trim(),
        type: form.type,
        color: form.color,
        intensity: form.intensity,
        description: form.description.trim(),
        exercises: form.exercises,
        blocks: form.blocks,
        version: form.version || 1,
      };
      if (!payload.title) throw new Error('Workout name is required.');
      const result = isNew
        ? await api('/workout-templates', { method: 'POST', body: JSON.stringify(payload) })
        : await api(`/workout-templates/${encodeURIComponent(workoutId)}`, { method: 'PUT', body: JSON.stringify(payload) });
      setMessage('Saved. Existing logged days were not changed.');
      if (isNew && result?._id) navigateTo(`/workouts/${encodeURIComponent(result._id)}`, true);
    } catch (err) {
      setError(err.message || 'Could not save workout.');
    } finally {
      setSaving(false);
    }
  };

  /** Soft-delete an unused workout template after user confirmation. */
  const archive = async () => {
    if (isNew || !window.confirm('Archive this workout template? It will no longer be offered in the schedule.')) return;
    try {
      await api(`/workout-templates/${encodeURIComponent(workoutId)}`, { method: 'DELETE' });
      navigateTo('/workouts');
    } catch (err) {
      setError(err.message || 'Could not archive workout.');
    }
  };

  const pageTitle = useMemo(() => isNew ? 'New workout' : 'Edit workout', [isNew]);

  if (loading) return <div className="loading">Loading workout…</div>;

  return <main className="app management-app">
    <header className="topbar management-topbar">
      <div className="management-title-row">
        <HamburgerMenu />
        <div>
          <div className="eyebrow">WORKOUT BUILDER</div>
          <h1>{pageTitle}</h1>
        </div>
      </div>
      <button type="button" className="primary-action" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save workout'}</button>
    </header>

    <section className="editor-card">
      <div className="editor-grid">
        <label>Workout name<input value={form.title} onChange={(e) => setField('title', e.target.value)} placeholder="e.g. Full Body A" /></label>
        <label>Type<select value={form.type} onChange={(e) => setField('type', e.target.value)}><option value="strength">Gym</option><option value="climbing">Bouldering</option></select></label>
        <label>Intensity<select value={form.intensity} onChange={(e) => { const intensity=e.target.value; const color={hard:'red',moderate:'yellow',easy:'green'}[intensity]; setForm(current=>({...current,intensity,color})); }}><option value="hard">Hard</option><option value="moderate">Moderate</option><option value="easy">Easy</option></select></label>
        <label>Description<textarea rows="2" value={form.description} onChange={(e) => setField('description', e.target.value)} placeholder="What is this workout for?" /></label>
      </div>
    </section>

    <section className="editor-card">
      <div className="management-card-head">
        <div>
          <h2>{form.type === 'climbing' ? 'Bouldering exercises' : 'Gym exercises'}</h2>
          <p>{form.type === 'climbing' ? 'This list uses the climbing exercise library.' : 'This list uses the lifting exercise library.'}</p>
        </div>
        <button type="button" className="secondary-action" onClick={() => setPickerOpen(true)}>＋ Add exercise</button>
      </div>

      <div className="editor-exercise-list">
        {(form.exercises || []).map((exercise, index) => <div className="editor-exercise-row" key={exercise.id}>
          <div className="editor-reorder">
            <button type="button" onClick={() => moveExercise(index, -1)} disabled={index === 0}>↑</button>
            <button type="button" onClick={() => moveExercise(index, 1)} disabled={index === form.exercises.length - 1}>↓</button>
          </div>
          <div className="editor-exercise-main">
            <strong>{exercise.name}</strong>
            <input value={exercise.target || ''} onChange={(e) => updateExercise(exercise.id, 'target', e.target.value)} placeholder="Target, e.g. 3 × 6–8" />
          </div>
          <button type="button" className="exercise-menu-button danger" onClick={() => removeExercise(exercise.id)}>Remove</button>
        </div>)}
        {!form.exercises?.length && <div className="management-empty">No exercises selected yet.</div>}
      </div>
    </section>

    {form.type === 'climbing' && <section className="editor-card">
      <div className="management-card-head">
        <div>
          <h2>Climbing blocks</h2>
          <p>Use blocks for warm-ups, problem groups, notes, or anything that is not a simple exercise.</p>
        </div>
        <button type="button" className="secondary-action" onClick={addBlock}>＋ Add block</button>
      </div>
      <div className="block-editor-list">
        {(form.blocks || []).map((block) => <div className="block-editor-row" key={block.id}>
          <label>Title<input value={block.title || ''} onChange={(e) => updateBlock(block.id, 'title', e.target.value)} /></label>
          <label>Kind<select value={block.kind || 'problems'} onChange={(e) => updateBlock(block.id, 'kind', e.target.value)}><option value="problems">Problems</option><option value="sets">Sets</option><option value="notes">Notes</option></select></label>
          {block.kind === 'problems' && <label>Count<input type="number" min="1" step="1" value={block.count ?? 1} onChange={(e) => updateBlock(block.id, 'count', e.target.value)} /></label>}
          {block.kind === 'sets' && <label>Target<input value={block.target || ''} onChange={(e) => updateBlock(block.id, 'target', e.target.value)} placeholder="3 × 10 sec" /></label>}
          <button type="button" className="exercise-menu-button danger" onClick={() => removeBlock(block.id)}>Remove</button>
        </div>)}
        {!form.blocks?.length && <div className="management-empty">No custom climbing blocks.</div>}
      </div>
    </section>}

    {(error || message) && <div className={error ? 'editor-error' : 'editor-success'}>{error || message}</div>}

    {!isNew && <button type="button" className="danger-outline-button" onClick={archive}>Archive template</button>}
    <button type="button" className="secondary-action management-back" onClick={onBack}>‹ Workouts</button>

    {pickerOpen && <ExercisePicker
      type={exerciseType}
      title={form.type === 'climbing' ? 'Add bouldering exercise' : 'Add gym exercise'}
      onCancel={() => setPickerOpen(false)}
      onSelect={addExercise}
    />}
  </main>;
}
