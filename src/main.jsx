import React, { useEffect, useMemo, useRef, useState } from 'react';
import { startAuthentication, startRegistration, browserSupportsWebAuthn } from '@simplewebauthn/browser';
import { createRoot } from 'react-dom/client';
import './styles.css';

const STORAGE_KEY = 'bouldering-log-v1';
const SYNC_INTERVAL = 2000;
const PIN_LENGTH = 6;
const TIME_ZONE = 'Asia/Tokyo';


function dateKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year:'numeric', month:'2-digit', day:'2-digit' }).format(date);
}
function localDateFromKey(key){ const [y,m,d] = key.split('-').map(Number); return new Date(y,m-1,d,12); }
function clone(x){ return JSON.parse(JSON.stringify(x)); }
function emptyLog(key, workouts) { const w=workouts.find(x=>x.dayOfWeek===localDateFromKey(key).getDay()); return { date:key, workoutId:w?._id ?? null, workoutVersion:w?.version ?? 1, data:{}, updatedAt:0 }; }

function loadLocal(){ try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'null')}catch{return null} }
function saveLocal(state){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

async function api(path, options={}) {
  const res = await fetch('/api'+path, { ...options, headers:{'Content-Type':'application/json', ...(options.headers||{})}, credentials:'include' });
  if (!res.ok) { let message='Request failed'; try { const j=await res.json(); message=j.error||message; } catch{}; const e=new Error(message); e.status=res.status; throw e; }
  return res.json();
}

function App(){
  const [authStage,setAuthStage]=useState('loading');
  const [screen,setScreen]=useState('calendar');
  const [selectedDate,setSelectedDate]=useState(dateKey());
  const [localState,setLocalState]=useState(()=>loadLocal());
  const [serverMeta,setServerMeta]=useState(null);
  const [syncState,setSyncState]=useState('');
  const [workouts,setWorkouts]=useState([]);

  useEffect(()=>{
    api('/auth/status').then(status=>{
      if(status.authenticated) setAuthStage('authenticated');
      else setAuthStage(status.passkeyConfigured ? 'passkey' : 'pin');
    }).catch(()=>setAuthStage('pin'));
  },[]);

  const loggedIn=authStage==='authenticated';

  useEffect(()=>{
    if(!loggedIn) return;
    api('/workouts').then(setWorkouts).catch(()=>setWorkouts([]));
  },[loggedIn]);

  useEffect(()=>{
    if(!loggedIn) return;
    const syncLatest=async(keepalive=false)=>{
      const current=loadLocal();
      if(!current?.updatedAt) return;
      try{
        if(keepalive){
          await fetch('/api/logs',{method:'PUT',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(current),keepalive:true});
          return;
        }
        setSyncState('saving');
        const latest=await api('/logs/latest');
        const latestTs=latest?.updatedAt||0;
        if(current.updatedAt>latestTs){
          await api('/logs',{method:'PUT',body:JSON.stringify(current)});
          setServerMeta({updatedAt:current.updatedAt}); setSyncState('saved');
        } else { setServerMeta({updatedAt:latestTs}); setSyncState('synced'); }
      }catch{ if(!keepalive) setSyncState('offline'); }
    };
    const timer=setInterval(()=>syncLatest(false),SYNC_INTERVAL);
    const onVisibility=()=>{if(document.visibilityState==='hidden')syncLatest(true)};
    const onPageHide=()=>syncLatest(true);
    document.addEventListener('visibilitychange',onVisibility);
    window.addEventListener('pagehide',onPageHide);
    return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',onVisibility);window.removeEventListener('pagehide',onPageHide)};
  },[loggedIn]);

  useEffect(()=>{
    if(!loggedIn) return;
    (async()=>{
      const local=loadLocal();
      try{
        const latest=await api('/logs/latest');
        if(!local&&latest){saveLocal(latest);setLocalState(latest)}
        else if(latest&&local&&latest.updatedAt>local.updatedAt){saveLocal(latest);setLocalState(latest)}
        setServerMeta(latest?{updatedAt:latest.updatedAt}:null);
      }catch{}
    })();
  },[loggedIn]);

  const updateLog=(mutator)=>{
    const current=clone(loadLocal()||{logs:{}});
    current.logs=current.logs||{};
    mutator(current);
    current.updatedAt=Date.now();
    saveLocal(current); setLocalState(current); setSyncState('pending');
  };
  const getLog=(key)=>localState?.logs?.[key]||emptyLog(key,workouts);
  const openDate=(key)=>{setSelectedDate(key);setScreen('entry')};

  if(authStage==='loading') return <div className="loading">Loading…</div>;
  if(authStage==='passkey') return <PasskeyLogin onSuccess={()=>setAuthStage('pin')}/>;
  if(authStage==='pin') return <PinScreen onSuccess={(needsSetup)=>setAuthStage(needsSetup?'setup':'authenticated')}/>;
  if(authStage==='setup') return <PasskeySetup onSuccess={()=>setAuthStage('authenticated')}/>;
  if(!workouts.length) return <div className="loading">Loading workouts…</div>;
  return screen==='calendar'
    ? <Calendar localState={localState} workouts={workouts} onDate={openDate} onEntry={()=>setScreen('entry')} syncState={syncState}/>
    : <Entry key={selectedDate} date={selectedDate} log={getLog(selectedDate)} workouts={workouts} onBack={()=>setScreen('calendar')} onChange={(patch)=>updateLog(state=>{state.logs[selectedDate]={...getLog(selectedDate),...patch,updatedAt:Date.now()};})} syncState={syncState}/>;
}

function PinScreen({onSuccess}){
  const [pin,setPin]=useState('');
  const [error,setError]=useState('');
  const tap=(n)=>{if(pin.length<PIN_LENGTH)setPin(p=>p+n)};
  useEffect(()=>{
    if(pin.length!==PIN_LENGTH)return;
    api('/auth/login',{method:'POST',body:JSON.stringify({pin})})
      .then(result=>onSuccess(Boolean(result.needsPasskeySetup)))
      .catch(e=>{setError(e.message==='Passkey authentication required'?'Use Face ID / passkey first':'Wrong PIN');setPin('');});
  },[pin,onSuccess]);
  return <div className="pin-screen"><div className="pin-card"><div className="lock-icon">⌁</div><h1>Training Log</h1><p>Enter PIN</p><div className="dots">{Array.from({length:PIN_LENGTH},(_,i)=><span key={i} className={i<pin.length?'filled':''}></span>)}</div>{error&&<div className="pin-error">{error}</div>}<div className="keypad">{['1','2','3','4','5','6','7','8','9','','0','⌫'].map((n,i)=>n?<button key={i} onClick={()=>n==='⌫'?setPin(p=>p.slice(0,-1)):tap(n)}>{n}</button>:<div key={i}/>)}</div></div></div>;
}

function PasskeyLogin({onSuccess}){
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const supported=browserSupportsWebAuthn();

  async function begin(){
    setBusy(true); setError('');
    try{
      const options=await api('/auth/passkey/login/options');
      const response=await startAuthentication({optionsJSON:options});
      await api('/auth/passkey/login/verify',{method:'POST',body:JSON.stringify(response)});
      onSuccess();
    }catch(e){setError(e.message||'Face ID authentication failed.');}
    finally{setBusy(false);}
  }

  return <div className="passkey-screen"><div className="passkey-card"><div className="passkey-symbol">◉</div><div className="eyebrow">SECURE ACCESS</div><h1>Training Log</h1><p>Use Face ID or your device passkey to continue.</p>{!supported&&<div className="auth-error">This browser does not support passkeys.</div>}{error&&<div className="auth-error">{error}</div>}<button className="passkey-primary" onClick={begin} disabled={busy||!supported}>{busy?'Waiting for Face ID…':'Use Face ID / Passkey'}</button></div></div>;
}

function PasskeySetup({onSuccess}){
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const supported=browserSupportsWebAuthn();

  async function register(){
    setBusy(true); setError('');
    try{
      const options=await api('/auth/passkey/register/options');
      const response=await startRegistration({optionsJSON:options});
      await api('/auth/passkey/register/verify',{method:'POST',body:JSON.stringify(response)});
      onSuccess();
    }catch(e){setError(e.message||'Could not create passkey.');}
    finally{setBusy(false);}
  }

  return <div className="passkey-screen"><div className="passkey-card"><div className="passkey-symbol">✦</div><div className="eyebrow">ONE-TIME SECURITY SETUP</div><h1>Protect Training Log</h1><p>Create a passkey for this site. On your iPhone this can use Face ID and the passkey stored by Apple.</p>{!supported&&<div className="auth-error">This browser does not support passkeys.</div>}{error&&<div className="auth-error">{error}</div>}<button className="passkey-primary" onClick={register} disabled={busy||!supported}>{busy?'Setting up…':'Create passkey'}</button><div className="auth-footnote">You will still enter your PIN after the passkey check.</div></div></div>;
}

function Calendar({localState,workouts,onDate,syncState}){
  const todayKey=dateKey();
  const [cursor,setCursor]=useState(()=>{const now=new Date(); return new Date(now.getFullYear(),now.getMonth(),1);});
  const cells=useMemo(()=>{const first=cursor.getDay(); const days=new Date(cursor.getFullYear(),cursor.getMonth()+1,0).getDate(); const out=[]; for(let i=0;i<first;i++)out.push(null); for(let d=1;d<=days;d++)out.push(new Date(cursor.getFullYear(),cursor.getMonth(),d)); while(out.length%7)out.push(null); return out;},[cursor]);
  const title=cursor.toLocaleDateString('en-US',{month:'long',year:'numeric'});
  const goToday=()=>{const today=new Date(); setCursor(new Date(today.getFullYear(),today.getMonth(),1));};
  return <main className="app"><header className="topbar"><div><div className="eyebrow">BOULDERING LOG</div><h1>Training</h1></div><div className="sync">{syncState==='saving'?'Saving…':syncState==='pending'?'Unsaved':syncState==='offline'?'Offline':'Saved'}</div></header><section className="calendar-card"><div className="monthbar"><button aria-label="Previous month" onClick={()=>setCursor(new Date(cursor.getFullYear(),cursor.getMonth()-1,1))}>‹</button><div className="month-title-wrap"><strong>{title}</strong><button className="today-button" onClick={goToday}>Today</button></div><button aria-label="Next month" onClick={()=>setCursor(new Date(cursor.getFullYear(),cursor.getMonth()+1,1))}>›</button></div><div className="dow">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=><span key={d}>{d}</span>)}</div><div className="grid">{cells.map((d,i)=>{if(!d)return <div className="cell empty" key={i}/>; const k=dateKey(d); const log=localState?.logs?.[k]; const has=Boolean(log&&Object.keys(log.data||{}).length); const wid=log?.workoutId ?? workouts.find(w=>w.dayOfWeek===d.getDay())?._id; const wd=wid?workouts.find(w=>w._id===wid):null; const isToday=k===todayKey; const isPast=k<todayKey; const isFuture=k>todayKey; const color=wd?.color||''; const typeLetter=wd?.type==='strength'?'G':wd?.type==='climbing'?'B':''; return <button key={i} className={`cell ${has?'logged':''} ${color} ${isToday?'today':''} ${isPast?'past':''} ${isFuture?'future':''}`} onClick={()=>onDate(k)}><span className="date">{d.getDate()}</span>{wd&&<span className="workout-type" title={wd.type==='strength'?'Gym':'Bouldering'}>{typeLetter}</span>}{has&&<span className="check">✓</span>}</button>})}</div></section><div className="legend"><span><b className="legend-letter b">B</b> Bouldering</span><span><b className="legend-letter g">G</b> Gym</span><span><i className="legend-intensity red"></i>Hard</span><span><i className="legend-intensity yellow"></i>Moderate</span><span><i className="legend-intensity green"></i>Easy</span><span><i className="legend-today"></i>Today</span><span>✓ Logged</span></div></main>
}

function hasMeaningfulData(value){
  if(value===null || value===undefined) return false;
  if(typeof value==='string') return value.trim().length>0;
  if(typeof value==='number' || typeof value==='boolean') return value===true || value!==0;
  if(Array.isArray(value)) return value.some(hasMeaningfulData);
  if(typeof value==='object') return Object.values(value).some(hasMeaningfulData);
  return false;
}

function Entry({date,log,workouts,onBack,onChange,syncState}){
  const [workoutId,setWorkoutId]=useState(log.workoutId);
  const [pendingWorkoutId,setPendingWorkoutId]=useState(null);
  const workout=workoutId?workouts.find(w=>w._id===workoutId):null;
  const hasData=hasMeaningfulData(log.data||{});
  const setData=(path,value)=>{
    const data=clone(log.data||{}); let obj=data; for(let i=0;i<path.length-1;i++){obj[path[i]]=obj[path[i]]||{};obj=obj[path[i]];} obj[path[path.length-1]]=value;
    onChange({workoutId,workoutVersion:workout?.version ?? 1,data});
  };
  const value=(...path)=>path.reduce((o,k)=>o?.[k],log.data||{} ) ?? '';
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
  const confirmWorkoutChange=()=>{
    const normalized=pendingWorkoutId;
    const nextWorkout=normalized?workouts.find(w=>w._id===normalized):null;
    setWorkoutId(normalized);
    setPendingWorkoutId(null);
    onChange({workoutId:normalized,workoutVersion:nextWorkout?.version ?? 1,data:{}});
  };
  const cancelWorkoutChange=()=>setPendingWorkoutId(null);
  return <main className="app"><header className="entry-head"><button className="back" onClick={onBack}>‹ Calendar</button><div className="date-title">{localDateFromKey(date).toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'})}</div><div className="sync">{syncState==='pending'?'Unsaved':'Saved'}</div></header><section className="entry"><label className="select-label">Workout<select value={workoutId||''} onChange={e=>requestWorkoutChange(e.target.value)}><option value="">Rest / no workout</option>{workouts.map(w=><option key={w._id} value={w._id}>{w.title}</option>)}</select></label>{workout?.exercises?<StrengthForm workout={workout} value={value} setData={setData} date={date}/>:workout?<ClimbingForm workout={workout} value={value} setData={setData} date={date}/>:<div className="rest-card">No workout scheduled. Use the notes below for recovery, mobility, or anything else.</div>}<section className="mobility-card"><h2>Mobility</h2>{['Hamstrings','90/90 / hip opening','Hip flexors','Cossack / adductors','Ankles','Serratus / thoracic'].map((x,i)=><label className="check-row" key={x}><input type="checkbox" checked={Boolean(value('mobility',i))} onChange={e=>setData(['mobility',i],e.target.checked)}/><span>{x}</span></label>)}<textarea value={value('mobilityNotes')} onChange={e=>setData(['mobilityNotes'],e.target.value)} placeholder="Mobility notes…"/></section><section className="notes-card"><h2>Daily notes</h2><textarea value={value('dailyNotes')} onChange={e=>setData(['dailyNotes'],e.target.value)} placeholder="How did you feel? Pain, fatigue, sleep, observations…"/></section></section>{pendingWorkoutId!==null&&<div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="change-workout-title"><div className="confirm-modal"><h2 id="change-workout-title">Change workout?</h2><p>This day already contains training data. Changing the workout will erase <strong>all data currently recorded for this day</strong>.</p><div className="modal-actions"><button className="modal-cancel" onClick={cancelWorkoutChange}>Cancel</button><button className="modal-danger" onClick={confirmWorkoutChange}>Change workout</button></div></div></div>}</main>
}

function inferDefaultSets(ex){
  if(Number.isFinite(ex?.defaultSets) && ex.defaultSets>0) return ex.defaultSets;
  const match=String(ex?.target||'').match(/^(\d+)/);
  return match ? Number(match[1]) : 3;
}

function normalizeSet(set){
  if(set && typeof set==='object') return {weight:set.weight ?? '', reps:set.reps ?? ''};
  if(set===undefined || set===null || set==='') return {weight:'', reps:''};
  return {weight:set, reps:''};
}

function uniqueExerciseInstanceId(baseId, existing){
  const clean=String(baseId||'exercise').replace(/[^a-zA-Z0-9_-]/g,'_');
  if(!existing.some(ex=>ex.id===clean)) return clean;
  let i=2;
  while(existing.some(ex=>ex.id===`${clean}_${i}`)) i++;
  return `${clean}_${i}`;
}

function getEffectiveExercises(workout,value,setData){
  const stored=value('exercisePlan');
  if(Array.isArray(stored) && stored.length) return stored;
  const initial=(workout.exercises||[]).map(ex=>({
    ...ex,
    exerciseId:ex.exerciseId||ex.id,
    id:ex.id
  }));
  return initial;
}

function StrengthForm({workout,value,setData,date}){
  const [lastExercise,setLastExercise]=useState(null);
  const [lastExerciseName,setLastExerciseName]=useState('');
  const [loadingLast,setLoadingLast]=useState(false);
  const [lastError,setLastError]=useState('');
  const [catalog,setCatalog]=useState([]);
  const [catalogLoading,setCatalogLoading]=useState(false);
  const [editor,setEditor]=useState(null);
  const [query,setQuery]=useState('');

  const exercises=useMemo(()=>getEffectiveExercises(workout,value,setData),[workout,value]);

  useEffect(()=>{
    let cancelled=false;
    setCatalogLoading(true);
    api('/exercises?type=lifting').then(items=>{if(!cancelled)setCatalog(items||[])}).catch(()=>{if(!cancelled)setCatalog([])}).finally(()=>{if(!cancelled)setCatalogLoading(false)});
    return()=>{cancelled=true};
  },[]);

  const openEditor=(mode,index=null)=>{setEditor({mode,index});setQuery('');};
  const closeEditor=()=>{setEditor(null);setQuery('');};

  const chooseExercise=(candidate)=>{
    const plan=clone(exercises);
    if(editor.mode==='replace'){
      const current=plan[editor.index];
      plan[editor.index]={
        ...candidate,
        id:current.id,
        exerciseId:candidate._id,
        target:current.target || `${candidate.defaultSets||3} sets`,
        unit:candidate.unit||'kg'
      };
      setData(['exercisePlan'],plan);
    } else {
      plan.push({
        ...candidate,
        _id:undefined,
        id:uniqueExerciseInstanceId(candidate._id,plan),
        exerciseId:candidate._id,
        target:`${candidate.defaultSets||3} × 6–10`,
        unit:candidate.unit||'kg'
      });
      delete plan[plan.length-1]._id;
      setData(['exercisePlan'],plan);
    }
    closeEditor();
  };

  const removeExercise=(index)=>{
    const plan=clone(exercises);
    if(plan.length<=1) return;
    plan.splice(index,1);
    setData(['exercisePlan'],plan);
  };

  const openLastTime=async(ex)=>{
    setLoadingLast(true); setLastError(''); setLastExerciseName(ex.name);
    try{
      const result=await api(`/logs/exercise/${encodeURIComponent(ex.exerciseId||ex.id)}?before=${encodeURIComponent(date)}`);
      if(!result){ setLastError('No previous entry found for this exercise.'); setLastExercise(null); }
      else setLastExercise(result);
    }catch(e){ setLastError(e.message||'Could not load previous entry.'); setLastExercise(null); }
    finally{ setLoadingLast(false); }
  };

  const exerciseSets=(ex)=>{
    const raw=value('exercises',ex.id,'sets');
    if(Array.isArray(raw) && raw.length) return raw.map(normalizeSet);
    return Array.from({length:inferDefaultSets(ex)},()=>({weight:'',reps:''}));
  };

  const updateSet=(ex,si,field,val)=>{
    const sets=exerciseSets(ex);
    sets[si]={...normalizeSet(sets[si]),[field]:val};
    setData(['exercises',ex.id,'sets'],sets);
  };
  const addSet=(ex)=>{const sets=exerciseSets(ex);sets.push({weight:'',reps:''});setData(['exercises',ex.id,'sets'],sets);};
  const removeSet=(ex,si)=>{const sets=exerciseSets(ex);if(sets.length<=1)return;sets.splice(si,1);setData(['exercises',ex.id,'sets'],sets);};
  const copyPrevious=(ex,si)=>{if(si<=0)return;const sets=exerciseSets(ex);sets[si]={...normalizeSet(sets[si-1])};setData(['exercises',ex.id,'sets'],sets);};

  const filteredCatalog=useMemo(()=>{
    const q=query.trim().toLowerCase();
    if(!q) return catalog;
    return catalog.filter(ex=>ex.name.toLowerCase().includes(q));
  },[catalog,query]);

  return <>
    <div className="exercise-plan-toolbar">
      <div><div className="eyebrow">EXERCISES</div><strong>Today’s exercise plan</strong><span>Changes apply only to this day.</span></div>
      <button type="button" className="last-time-button" onClick={()=>openEditor('add')}>＋ Add exercise</button>
    </div>
    {exercises.map((ex,index)=>{
      const sets=exerciseSets(ex);
      return <section className="exercise-card" key={ex.id}>
        <div className="exercise-head">
          <div><h2>{ex.name}</h2><span className="exercise-target">{ex.target}</span></div>
          <div className="exercise-actions">
            <button className="last-time-button" onClick={()=>openLastTime(ex)} disabled={loadingLast}>{loadingLast ? 'Loading…' : 'Last time'}</button>
            <button type="button" className="exercise-menu-button" onClick={()=>openEditor('replace',index)}>Replace</button>
            <button type="button" className="exercise-menu-button danger" onClick={()=>removeExercise(index)} disabled={exercises.length<=1}>Remove</button>
          </div>
        </div>
        <div className="sets-list">
          <div className="set-header"><span>Set</span><span>Weight</span><span>Reps</span><span></span><span></span></div>
          {sets.map((set,si)=><div className="set-row" key={si}>
            <span className="set-number">{si+1}</span>
            <input type="number" inputMode="decimal" step="0.5" min="0" value={normalizeSet(set).weight} onChange={e=>updateSet(ex,si,'weight',e.target.value)} aria-label={`Set ${si+1} weight`}/>
            <input type="number" inputMode="numeric" step="1" min="0" value={normalizeSet(set).reps} onChange={e=>updateSet(ex,si,'reps',e.target.value)} aria-label={`Set ${si+1} reps`}/>
            <button type="button" className="set-copy" onClick={()=>copyPrevious(ex,si)} disabled={si===0}>Copy ↑</button>
            <button type="button" className="set-remove" onClick={()=>removeSet(ex,si)} disabled={sets.length<=1} aria-label={`Remove set ${si+1}`}>×</button>
          </div>)}
        </div>
        <button type="button" className="add-set" onClick={()=>addSet(ex)}>＋ Add another set</button>
        <textarea value={value('exercises',ex.id,'notes')} onChange={e=>setData(['exercises',ex.id,'notes'],e.target.value)} placeholder="Notes…"/>
      </section>;
    })}
    {(lastExercise || lastError) && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="last-time-title">
      <div className="last-time-modal">
        <div className="modal-kicker">LAST TIME</div>
        <h2 id="last-time-title">{lastExerciseName}</h2>
        {lastError ? <p className="last-time-empty">{lastError}</p> : <>
          <p className="last-time-date">{localDateFromKey(lastExercise.date).toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric',year:'numeric'})}</p>
          <div className="last-time-sets">{(lastExercise.entry?.sets||[]).map((set,i)=>{const normalized=normalizeSet(set);return <div className="last-time-set" key={i}><span>Set {i+1}</span><strong>{normalized.weight === '' ? '—' : `${normalized.weight} kg`}</strong><strong>{normalized.reps === '' ? '—' : `${normalized.reps} reps`}</strong></div>;})}</div>
          {lastExercise.entry?.notes && <div className="last-time-notes">{lastExercise.entry.notes}</div>}
        </>}
        <button className="modal-close" onClick={()=>{setLastExercise(null);setLastError('');}}>Close</button>
      </div>
    </div>}
    {editor && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="exercise-editor-title">
      <div className="exercise-picker-modal">
        <div className="modal-kicker">{editor.mode==='replace'?'REPLACE EXERCISE':'ADD EXERCISE'}</div>
        <h2 id="exercise-editor-title">{editor.mode==='replace'?`Replace ${exercises[editor.index]?.name}`:'Add an exercise'}</h2>
        <input autoFocus className="exercise-search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Type to search exercises…" />
        <div className="exercise-picker-results">
          {catalogLoading ? <div className="exercise-picker-empty">Loading exercise library…</div> : filteredCatalog.length ? filteredCatalog.map(ex=><button type="button" className="exercise-option" key={ex._id} onClick={()=>chooseExercise(ex)}><span>{ex.name}</span><small>{ex.defaultSets||3} sets · {ex.unit||'kg'}</small></button>) : <div className="exercise-picker-empty">No matching exercises.</div>}
        </div>
        <button className="modal-cancel" onClick={closeEditor}>Cancel</button>
      </div>
    </div>}
  </>;
}

function normalizeSet(set){
  if(set && typeof set==='object') return {weight:set.weight ?? '', reps:set.reps ?? ''};
  if(set===undefined || set===null || set==='') return {weight:'', reps:''};
  return {weight:set, reps:''};
}

function inferDefaultSets(ex){
  if(Number.isFinite(ex?.defaultSets) && ex.defaultSets>0) return ex.defaultSets;
  const match=String(ex?.target||'').match(/^(\d+)/);
  return match ? Number(match[1]) : 3;
}

const DEFAULT_BOULDER_SCHEMA = {
  grades: ['8級','7級','6級','5級','4級','3級','2級','1級','初段','二段'],
  results: [
    { value: 'fail', label: 'Fail' },
    { value: 'project', label: 'Project' },
    { value: 'send', label: 'Send' },
    { value: 'flash', label: 'Flash' }
  ]
};

function normalizeProblem(problem){
  return {
    grade: problem?.grade ?? '',
    result: problem?.result ?? '',
    tries: problem?.tries ?? '',
    notes: problem?.notes ?? ''
  };
}

function ClimbingForm({workout,value,setData,date}){
  const problemSchema = workout.blocks.find(block => block.kind === 'problems')?.problemSchema || DEFAULT_BOULDER_SCHEMA;
  const boulderGrades = problemSchema.grades || DEFAULT_BOULDER_SCHEMA.grades;
  const boulderResults = problemSchema.results || DEFAULT_BOULDER_SCHEMA.results;
  const [lastWorkout,setLastWorkout]=useState(null);
  const [lastError,setLastError]=useState('');
  const [loadingLast,setLoadingLast]=useState(false);

  const openLastWorkout=async()=>{
    setLoadingLast(true); setLastError(''); setLastWorkout(null);
    try{
      const result=await api(`/logs/bouldering/${encodeURIComponent(workout._id)}?before=${encodeURIComponent(date)}`);
      if(!result) setLastError('No previous entry found for this workout.');
      else setLastWorkout(result);
    }catch(e){ setLastError(e.message||'Could not load previous workout.'); }
    finally{ setLoadingLast(false); }
  };

  const blockProblems = (block) => {
    const raw=value('blocks',block.id,'problems');
    if(Array.isArray(raw) && raw.length) return raw.map(normalizeProblem);
    return Array.from({length:block.count ?? 0},()=>normalizeProblem());
  };

  const updateProblem=(block,index,field,val)=>{
    const problems=blockProblems(block);
    problems[index]={...normalizeProblem(problems[index]),[field]:val};
    setData(['blocks',block.id,'problems'],problems);
  };

  const addProblem=(block)=>{
    const problems=blockProblems(block);
    problems.push(normalizeProblem());
    setData(['blocks',block.id,'problems'],problems);
  };

  const removeProblem=(block,index)=>{
    const problems=blockProblems(block);
    if(problems.length<=1) return;
    problems.splice(index,1);
    setData(['blocks',block.id,'problems'],problems);
  };

  return <>
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
              <label><span>Tries</span><input type="number" inputMode="numeric" min="0" step="1" value={p.tries} onChange={e=>updateProblem(block,i,'tries',e.target.value)} /></label>
              <label className="problem-notes"><span>Notes</span><input value={p.notes} onChange={e=>updateProblem(block,i,'notes',e.target.value)} placeholder="Beta / notes" /></label>
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

function resultLabel(value,results){ return results.find(r=>r.value===value)?.label || '—'; }


createRoot(document.getElementById('root')).render(<App/>);
