import React, { useState } from 'react';
import { MOBILITY_ITEMS } from '../constants/app.js';
import { clone, hasMeaningfulData } from '../utils/data.js';
import { localDateFromKey } from '../utils/dates.js';
import StrengthForm from './StrengthForm.jsx';
import ClimbingForm from './ClimbingForm.jsx';
import HamburgerMenu from './HamburgerMenu.jsx';

/** Render the editable day view, including workout selection and shared daily notes. */
export default function Entry({date,log,workouts,onBack,onChange,syncState}){
  const [workoutId,setWorkoutId]=useState(log.workoutId);
  const [pendingWorkoutId,setPendingWorkoutId]=useState(null);
  const workout=workoutId?workouts.find(w=>w._id===workoutId):null;
  const hasData=hasMeaningfulData(log.data||{});
  // Update a nested piece of this day's data and send the resulting patch to App.
  const setData=(path,value)=>{
    const data=path[0]==='__replace__' ? clone(value||{}) : clone(log.data||{});
    if(path[0]!=='__replace__'){
      let obj=data;
      for(let i=0;i<path.length-1;i++){obj[path[i]]=obj[path[i]]||{};obj=obj[path[i]];}
      obj[path[path.length-1]]=value;
    }
    onChange({workoutId,workoutVersion:workout?.version ?? 1,data});
  };
  // Safely read a nested field from this day's data for controlled form inputs.
  const value=(...path)=>path.reduce((o,k)=>o?.[k],log.data||{} ) ?? '';
  // Request a workout change; edited days require confirmation before their data is cleared.
  const requestWorkoutChange=(nextId)=>{
    const normalized=nextId||null;
    if(normalized===workoutId) return;
    if(hasData) setPendingWorkoutId(normalized);
    else {
      const nextWorkout=normalized?workouts.find(w=>w._id===normalized):null;
      setWorkoutId(normalized);
      onChange({workoutId:normalized,workoutVersion:nextWorkout?.version ?? 1,data:{}});
    }
  };
  // Apply the confirmed workout change and intentionally reset only this day's data.
  const confirmWorkoutChange=()=>{
    const normalized=pendingWorkoutId;
    const nextWorkout=normalized?workouts.find(w=>w._id===normalized):null;
    setWorkoutId(normalized);
    setPendingWorkoutId(null);
    onChange({workoutId:normalized,workoutVersion:nextWorkout?.version ?? 1,data:{}});
  };
  // Close the confirmation dialog without changing the day.
  const cancelWorkoutChange=()=>setPendingWorkoutId(null);
  return <main className="app"><header className="entry-head"><div className="entry-left-actions"><button className="back" onClick={onBack}>‹ Calendar</button><HamburgerMenu /></div><div className="date-title">{localDateFromKey(date).toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'})}</div><div className="sync">{syncState==='pending'?'Unsaved':'Saved'}</div></header><section className="entry"><label className="select-label">Workout<select value={workoutId||''} onChange={e=>requestWorkoutChange(e.target.value)}><option value="">Rest / no workout</option>{workouts.map(w=><option key={w._id} value={w._id}>{w.title}</option>)}</select></label>{workout?.exercises?<StrengthForm workout={workout} value={value} setData={setData} date={date} data={log.data||{}}/>:workout?<ClimbingForm workout={workout} value={value} setData={setData} date={date} data={log.data || {}}/>:<div className="rest-card">No workout scheduled. Use the notes below for recovery, mobility, or anything else.</div>}<section className="mobility-card"><h2>Mobility</h2>{MOBILITY_ITEMS.map((x,i)=><label className="check-row" key={x}><input type="checkbox" checked={Boolean(value('mobility',i))} onChange={e=>setData(['mobility',i],e.target.checked)}/><span>{x}</span></label>)}<textarea value={value('mobilityNotes')} onChange={e=>setData(['mobilityNotes'],e.target.value)} placeholder="Mobility notes…"/></section><section className="notes-card"><h2>Daily notes</h2><textarea value={value('dailyNotes')} onChange={e=>setData(['dailyNotes'],e.target.value)} placeholder="How did you feel? Pain, fatigue, sleep, observations…"/></section></section>{pendingWorkoutId!==null&&<div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="change-workout-title"><div className="confirm-modal"><h2 id="change-workout-title">Change workout?</h2><p>This day already contains training data. Changing the workout will erase <strong>all data currently recorded for this day</strong>.</p><div className="modal-actions"><button className="modal-cancel" onClick={cancelWorkoutChange}>Cancel</button><button className="modal-danger" onClick={confirmWorkoutChange}>Change workout</button></div></div></div>}</main>
}
