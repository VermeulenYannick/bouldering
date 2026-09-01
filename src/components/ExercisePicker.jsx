import React, { useEffect, useMemo, useState } from 'react';
import { EXERCISE_TYPES } from '../constants/app.js';
import { api } from '../utils/api.js';

/** Render the searchable exercise catalog used to replace or add exercises. */
export default function ExercisePicker({type,title,onCancel,onSelect}){
  const [query,setQuery]=useState('');
  const [exercises,setExercises]=useState([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');

  useEffect(()=>{
    let alive=true;
    setLoading(true); setError('');
    api(`/exercises?type=${encodeURIComponent(type)}`)
      .then(list=>{if(alive)setExercises(Array.isArray(list)?list:[]);})
      .catch(e=>{if(alive)setError(e.message||'Could not load exercises.');})
      .finally(()=>{if(alive)setLoading(false);});
    return()=>{alive=false;};
  },[type]);

  // Filter the catalog client-side so results respond immediately as the user types.
  const filtered=useMemo(()=>{
    const q=query.trim().toLowerCase();
    const source=q?exercises.filter(ex=>ex.name.toLowerCase().includes(q)):exercises;
    return source.slice(0,50);
  },[exercises,query]);

  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="exercise-picker-title">
    <div className="exercise-picker-modal">
      <div className="modal-kicker">{type===EXERCISE_TYPES.CLIMBING?'CLIMBING':'LIFTING'} EXERCISES</div>
      <h2 id="exercise-picker-title">{title}</h2>
      <input autoFocus className="exercise-search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Start typing an exercise…" />
      {loading ? <div className="exercise-picker-empty">Loading exercise library…</div> : error ? <div className="exercise-picker-empty">{error}</div> : <div className="exercise-picker-results">
        {filtered.map(ex=><button type="button" className="exercise-option" key={ex._id} onClick={()=>onSelect(ex)}><span>{ex.name}</span><small>{ex.defaultSets || 3} sets · {ex.unit || 'kg'}</small></button>)}
        {!filtered.length&&<div className="exercise-picker-empty">No exercises match “{query}”.</div>}
      </div>}
      <button type="button" className="modal-cancel" onClick={onCancel}>Cancel</button>
    </div>
  </div>;
}
