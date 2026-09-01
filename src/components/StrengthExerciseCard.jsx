import React from 'react';
import { clone } from '../utils/data.js';
import { normalizeSet } from '../utils/exercises.js';

/** Render one editable strength exercise and the sets/notes belonging to it. */
export default function StrengthExerciseCard({item,index,value,updateEntry,onReplace,onRemove,canRemove}){
  const raw=value('exercises',item.key);
  const current=raw && typeof raw==='object' ? raw : null;
  const defaultSets=Math.max(1,Number(item.defaultSets)||3);
  const sets=Array.isArray(current?.sets) && current.sets.length ? current.sets.map(normalizeSet) : Array.from({length:defaultSets},()=>({weight:'',reps:''}));
  const notes=current?.notes ?? '';
  // Update one field in one set and persist it through the parent strength form.
  const changeSet=(i,field,val)=>{
    const next=sets.map(normalizeSet);
    next[i]={...next[i],[field]:val};
    updateEntry(item,{sets:next});
  };
  // Append one blank set using the same shape as existing sets.
  const addSet=()=>updateEntry(item,{sets:[...sets,{weight:'',reps:''}]});
  // Remove a set while retaining at least one editable set.
  const removeSet=(i)=>{ if(sets.length<=1)return; updateEntry(item,{sets:sets.filter((_,idx)=>idx!==i)}); };
  // Copy a set's values into the following row when there is already a following row.
  const copySet=(i)=>{
    const source=sets[i];
    const next=sets.map(normalizeSet);
    next[i+1]={...source};
    updateEntry(item,{sets:next});
  };

  return <section className="exercise-card" data-exercise-key={item.key}>
    <div className="exercise-head">
      <div>
        <h2>{index+1}. {item.name}</h2>
        <span className="exercise-target">{item.target}</span>
      </div>
      <div className="exercise-actions">
        <button type="button" className="exercise-menu-button" onClick={onReplace}>Replace</button>
        <button type="button" className="exercise-menu-button danger" onClick={onRemove} disabled={!canRemove}>Remove</button>
      </div>
    </div>
    <div className="sets-list">
      <div className="set-header"><span>#</span><span>Weight / load</span><span>Reps</span><span></span><span></span></div>
      {sets.map((set,i)=>{
        const s=normalizeSet(set);
        return <div className="set-row" key={i}>
          <span className="set-number">{i+1}</span>
          <input type="number" inputMode="decimal" step="0.5" value={s.weight} placeholder={item.unit==='reps'?'—':item.unit==='seconds'?'sec':'kg'} onChange={e=>changeSet(i,'weight',e.target.value)} />
          <input type="number" inputMode="numeric" step="1" min="0" value={s.reps} placeholder={item.unit==='reps'?'reps':'reps'} onChange={e=>changeSet(i,'reps',e.target.value)} />
          <button type="button" className="set-copy" onClick={()=>copySet(i)} disabled={i===sets.length-1}>Copy</button>
          <button type="button" className="set-remove" onClick={()=>removeSet(i)} disabled={sets.length<=1}>×</button>
        </div>;
      })}
    </div>
    <button type="button" className="add-set" onClick={addSet}>＋ Add set</button>
    <textarea value={notes} onChange={e=>updateEntry(item,{notes:e.target.value})} placeholder="Exercise notes…" />
  </section>;
}
