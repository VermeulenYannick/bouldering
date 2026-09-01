import React, { useState } from 'react';
import { DEFAULT_BOULDER_SCHEMA } from '../constants/app.js';
import { api } from '../utils/api.js';
import { localDateFromKey } from '../utils/dates.js';
import { normalizeProblem, resultLabel } from '../utils/exercises.js';
import StrengthForm from './StrengthForm.jsx';

/** Render the bouldering blocks for a workout and persist edits through the parent day form. */
export default function ClimbingForm({workout,value,setData,date,data}){
  const problemSchema = workout.blocks.find(block => block.kind === 'problems')?.problemSchema || DEFAULT_BOULDER_SCHEMA;
  const boulderGrades = problemSchema.grades || DEFAULT_BOULDER_SCHEMA.grades;
  const boulderResults = problemSchema.results || DEFAULT_BOULDER_SCHEMA.results;
  const [lastWorkout,setLastWorkout]=useState(null);
  const [lastError,setLastError]=useState('');
  const [loadingLast,setLoadingLast]=useState(false);

  // Fetch the most recent historical session for this same bouldering workout.
  const openLastWorkout=async()=>{
    setLoadingLast(true); setLastError(''); setLastWorkout(null);
    try{
      const result=await api(`/logs/bouldering/${encodeURIComponent(workout._id)}?before=${encodeURIComponent(date)}`);
      if(!result) setLastError('No previous entry found for this workout.');
      else setLastWorkout(result);
    }catch(e){ setLastError(e.message||'Could not load previous workout.'); }
    finally{ setLoadingLast(false); }
  };

  // Return normalized problem rows, creating blank rows from the template count when needed.
  const blockProblems = (block) => {
    const raw=value('blocks',block.id,'problems');
    if(Array.isArray(raw) && raw.length) return raw.map(normalizeProblem);
    return Array.from({length:block.count ?? 0},()=>normalizeProblem());
  };

  // Update one field of one bouldering problem in the current day.
  const updateProblem=(block,index,field,val)=>{
    const problems=blockProblems(block);
    problems[index]={...normalizeProblem(problems[index]),[field]:val};
    setData(['blocks',block.id,'problems'],problems);
  };

  // Append a fresh blank problem row to a bouldering block.
  const addProblem=(block)=>{
    const problems=blockProblems(block);
    problems.push(normalizeProblem());
    setData(['blocks',block.id,'problems'],problems);
  };

  // Remove a problem row while retaining at least one row in the block.
  const removeProblem=(block,index)=>{
    const problems=blockProblems(block);
    if(problems.length<=1) return;
    problems.splice(index,1);
    setData(['blocks',block.id,'problems'],problems);
  };

  return <>
    {Array.isArray(workout.exercises) && workout.exercises.length > 0 && <section className="climbing-exercise-section">
      <div className="climbing-exercise-section-head">
        <div><div className="eyebrow">CLIMBING EXERCISES</div><h2>Training exercises</h2></div>
      </div>
      <StrengthForm workout={{...workout, title: 'Climbing exercises'}} value={value} setData={setData} date={date} data={data || {}} exerciseType={EXERCISE_TYPES.CLIMBING} showPlanToolbar={false} />
    </section>}
    <div className="climbing-header-action">
      <div><div className="eyebrow">BOULDERING SESSION</div><h2>{workout.title}</h2></div>
      <button type="button" className="last-time-button" onClick={openLastWorkout} disabled={loadingLast}>{loadingLast?'Loading…':'Last time'}</button>
    </div>
    {workout.blocks.map(block=><section className="block-card" key={block.id}>
      <div className="exercise-head">
        <div><h2>{block.title}</h2><span>{block.kind==='sets'?block.target:''}</span></div>
      </div>

      {block.kind==='notes' && <textarea value={value('blocks',block.id,'notes')} onChange={e=>setData(['blocks',block.id,'notes'],e.target.value)} placeholder="Warm-up notes…"/>}

      {block.kind==='problems' && <div className="bouldering-list">
        <div className="problem-header"><span>Problem</span><span>Grade</span><span>Result</span><span>Tries</span><span></span></div>
        {blockProblems(block).map((problem,i)=>{
          const p=normalizeProblem(problem);
          return <div className="problem-card" key={i}>
            <div className="problem-topline">
              <b>#{i+1}</b>
              <button type="button" className="problem-remove" onClick={()=>removeProblem(block,i)} disabled={blockProblems(block).length<=1}>Remove</button>
            </div>
            <div className="problem-inputs">
              <label><span>Grade</span><select value={p.grade} onChange={e=>updateProblem(block,i,'grade',e.target.value)}>
                <option value="">—</option>
                {boulderGrades.map(grade=><option key={grade} value={grade}>{grade}</option>)}
              </select></label>
              <label><span>Result</span><select value={p.result} onChange={e=>updateProblem(block,i,'result',e.target.value)}>
                <option value="">—</option>
                {boulderResults.map(result=><option key={result.value} value={result.value}>{result.label}</option>)}
              </select></label>
              <label><span>Tries</span><input type="number" inputMode="numeric" min="0" step="1" value={p.tries} onFocus={e=>e.currentTarget.select()} onChange={e=>updateProblem(block,i,'tries',e.target.value)} /></label>
              <label className="problem-notes"><span>Notes</span><textarea rows="2" value={p.notes} onChange={e=>updateProblem(block,i,'notes',e.target.value)} placeholder="Beta / notes" /></label>
            </div>
          </div>;
        })}
        <button type="button" className="add-problem" onClick={()=>addProblem(block)}>＋ Add another problem</button>
      </div>}

      {block.kind==='sets' && <div className="set-grid"><label><span>Load</span><input type="number" inputMode="decimal" step="0.5" value={value('blocks',block.id,'weight')} onChange={e=>setData(['blocks',block.id,'weight'],e.target.value)}/></label><label><span>Duration</span><input type="number" inputMode="decimal" step="1" value={value('blocks',block.id,'duration')} onChange={e=>setData(['blocks',block.id,'duration'],e.target.value)}/></label><label><span>Notes</span><input value={value('blocks',block.id,'notes')} onChange={e=>setData(['blocks',block.id,'notes'],e.target.value)}/></label></div>}
    </section>)}

    {(lastWorkout || lastError) && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="last-boulder-title">
      <div className="last-time-modal boulder-history-modal">
        <div className="modal-kicker">LAST TIME</div>
        <h2 id="last-boulder-title">{workout.title}</h2>
        {lastError ? <p className="last-time-empty">{lastError}</p> : <>
          <p className="last-time-date">{localDateFromKey(lastWorkout.date).toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric',year:'numeric'})}</p>
          <div className="boulder-history-blocks">
            {(lastWorkout.blocks||[]).map(block=><div className="boulder-history-block" key={block.id}>
              <div className="boulder-history-block-title">{block.title}</div>
              {block.problems?.length ? block.problems.map((problem,i)=><div className="boulder-history-problem" key={i}>
                <span>#{i+1}</span><strong>{problem.grade || '—'}</strong><span>{resultLabel(problem.result,boulderResults)}</span><span>{problem.tries === '' || problem.tries === undefined ? '—' : `${problem.tries} tries`}</span>
              </div>) : <div className="boulder-history-empty">No problems recorded.</div>}
            </div>)}
          </div>
        </>}
        <button className="modal-close" onClick={()=>{setLastWorkout(null);setLastError('');}}>Close</button>
      </div>
    </div>}
  </>;
}
