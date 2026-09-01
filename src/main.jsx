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
    const data=path[0]==='__replace__' ? clone(value||{}) : clone(log.data||{});
    if(path[0]!=='__replace__'){
      let obj=data;
      for(let i=0;i<path.length-1;i++){obj[path[i]]=obj[path[i]]||{};obj=obj[path[i]];}
      obj[path[path.length-1]]=value;
    }
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
  return <main className="app"><header className="entry-head"><button className="back" onClick={onBack}>‹ Calendar</button><div className="date-title">{localDateFromKey(date).toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'})}</div><div className="sync">{syncState==='pending'?'Unsaved':'Saved'}</div></header><section className="entry"><label className="select-label">Workout<select value={workoutId||''} onChange={e=>requestWorkoutChange(e.target.value)}><option value="">Rest / no workout</option>{workouts.map(w=><option key={w._id} value={w._id}>{w.title}</option>)}</select></label>{workout?.exercises?<StrengthForm workout={workout} value={value} setData={setData} date={date} data={log.data||{}}/>:workout?<ClimbingForm workout={workout} value={value} setData={setData} date={date}/>:<div className="rest-card">No workout scheduled. Use the notes below for recovery, mobility, or anything else.</div>}<section className="mobility-card"><h2>Mobility</h2>{['Hamstrings','90/90 / hip opening','Hip flexors','Cossack / adductors','Ankles','Serratus / thoracic'].map((x,i)=><label className="check-row" key={x}><input type="checkbox" checked={Boolean(value('mobility',i))} onChange={e=>setData(['mobility',i],e.target.checked)}/><span>{x}</span></label>)}<textarea value={value('mobilityNotes')} onChange={e=>setData(['mobilityNotes'],e.target.value)} placeholder="Mobility notes…"/></section><section className="notes-card"><h2>Daily notes</h2><textarea value={value('dailyNotes')} onChange={e=>setData(['dailyNotes'],e.target.value)} placeholder="How did you feel? Pain, fatigue, sleep, observations…"/></section></section>{pendingWorkoutId!==null&&<div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="change-workout-title"><div className="confirm-modal"><h2 id="change-workout-title">Change workout?</h2><p>This day already contains training data. Changing the workout will erase <strong>all data currently recorded for this day</strong>.</p><div className="modal-actions"><button className="modal-cancel" onClick={cancelWorkoutChange}>Cancel</button><button className="modal-danger" onClick={confirmWorkoutChange}>Change workout</button></div></div></div>}</main>
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


function StrengthForm({workout,value,setData,date,data}){
  const rawPlan=value('exercisePlan');
  const defaultPlan=useMemo(()=>workout.exercises.map(ex=>({
    key:ex.id,
    exerciseId:catalogIdForName(ex.name),
    name:ex.name,
    target:ex.target,
    unit:ex.unit || 'kg',
    defaultSets:inferDefaultSets(ex),
    template:true,
  })),[workout.exercises]);
  const plan=Array.isArray(rawPlan) && rawPlan.length ? rawPlan : defaultPlan;
  const [picker,setPicker]=useState(null);

  const updateEntry=(item,patch)=>{
    const exercises=clone(value('exercises')||{});
    const previous=exercises[item.key] || { exerciseId:item.exerciseId, name:item.name, unit:item.unit || 'kg', sets:[] };
    exercises[item.key]={...previous,...patch,exerciseId:item.exerciseId,name:item.name,unit:item.unit || 'kg'};
    setData(['exercises'],exercises);
  };

  const replaceExercise=(item)=>setPicker({mode:'replace',slotKey:item.key,item});
  const addExercise=()=>setPicker({mode:'add',item:null});

  const applyExercise=(selected)=>{
    if(!picker) return;
    const dataExercises=clone(value('exercises')||{});
    let nextPlan=clone(plan);
    if(picker.mode==='replace'){
      nextPlan=nextPlan.map(item=>item.key===picker.item.key ? {
        ...item,
        exerciseId:selected._id,
        name:selected.name,
        template:false,
      } : item);
      dataExercises[picker.item.key]={
        exerciseId:selected._id,
        name:selected.name,
        unit:selected.unit || picker.item.unit || 'kg',
        sets:Array.from({length:Math.max(1,Number(selected.defaultSets)||inferDefaultSets(picker.item))},()=>({weight:'',reps:''})),
        notes:''
      };
    } else {
      const key=`added_${selected._id}_${Date.now()}`;
      const baseTarget=`${Math.max(1,Number(selected.defaultSets)||3)} sets`;
      const added={key,exerciseId:selected._id,name:selected.name,target:baseTarget,unit:selected.unit || 'kg',defaultSets:selected.defaultSets || 3,template:false,added:true};
      nextPlan.push(added);
      dataExercises[key]={
        exerciseId:selected._id,
        name:selected.name,
        unit:selected.unit || 'kg',
        sets:Array.from({length:Math.max(1,Number(selected.defaultSets)||3)},()=>({weight:'',reps:''})),
        notes:''
      };
    }
    const nextData=clone(data||{});
    nextData.exercisePlan=nextPlan;
    nextData.exercises=dataExercises;
    setData(['__replace__'],nextData);
    setPicker(null);
  };

  const removeExercise=(item)=>{
    const nextPlan=plan.filter(x=>x.key!==item.key);
    const exercises=clone(value('exercises')||{});
    delete exercises[item.key];
    const nextData=clone(data||{});
    nextData.exercisePlan=nextPlan;
    nextData.exercises=exercises;
    setData(['__replace__'],nextData);
  };

  const resetPlan=()=>{
    const exercises=clone(value('exercises')||{});
    Object.keys(exercises).forEach(k=>delete exercises[k]);
    const nextData=clone(data||{});
    nextData.exercisePlan=defaultPlan;
    nextData.exercises=exercises;
    setData(['__replace__'],nextData);
  };

  return <>
    <section className="exercise-plan-toolbar">
      <div><strong>{workout.title}</strong><span>This plan is for {date} only. The workout template will not be changed.</span></div>
      <div className="exercise-actions">
        <button type="button" className="exercise-menu-button" onClick={addExercise}>＋ Add exercise</button>
        <button type="button" className="exercise-menu-button" onClick={resetPlan}>Reset day</button>
      </div>
    </section>

    {plan.map((item,index)=><StrengthExerciseCard
      key={item.key}
      item={item}
      index={index}
      value={value}
      updateEntry={updateEntry}
      onReplace={()=>replaceExercise(item)}
      onRemove={()=>removeExercise(item)}
      canRemove={plan.length>1}
      onLastTime={()=>{}}
    />)}

    {picker&&<ExercisePicker
      type="lifting"
      title={picker.mode==='replace'?`Replace ${picker.item.name}`:'Add exercise'}
      onCancel={()=>setPicker(null)}
      onSelect={applyExercise}
    />}
  </>;
}

function catalogIdForName(name){
  const value=String(name||'').toLowerCase().trim();
  const aliases={
    'back squat':'back_squat',
    'bench press':'bench_press',
    'romanian deadlift':'romanian_deadlift',
    'bulgarian split squat':'bulgarian_split_squat',
    'chest-supported row':'chest_supported_row',
    'push-up plus':'push_up',
    'ab wheel':'ab_wheel',
    'deadlift / rdl':'conventional_deadlift',
    'overhead press':'overhead_press',
    'front-foot elevated split squat':'front_foot_elevated_split_squat',
    'neutral-grip pull-up':'neutral_grip_pull_up',
    'hamstring curl':'hamstring_curl',
    'serratus wall slide':'serratus_wall_slide',
    'hanging knee raise':'hanging_knee_raise',
  };
  return aliases[value] || value.replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
}

function StrengthExerciseCard({item,index,value,updateEntry,onReplace,onRemove,canRemove}){
  const raw=value('exercises',item.key);
  const current=raw && typeof raw==='object' ? raw : null;
  const defaultSets=Math.max(1,Number(item.defaultSets)||3);
  const sets=Array.isArray(current?.sets) && current.sets.length ? current.sets.map(normalizeSet) : Array.from({length:defaultSets},()=>({weight:'',reps:''}));
  const notes=current?.notes ?? '';
  const changeSet=(i,field,val)=>{
    const next=sets.map(normalizeSet);
    next[i]={...next[i],[field]:val};
    updateEntry(item,{sets:next});
  };
  const addSet=()=>updateEntry(item,{sets:[...sets,{weight:'',reps:''}]});
  const removeSet=(i)=>{ if(sets.length<=1)return; updateEntry(item,{sets:sets.filter((_,idx)=>idx!==i)}); };
  const copySet=(i)=>{
    const source=sets[i];
    const next=sets.map(normalizeSet);
    next[i+1]={...source};
    updateEntry(item,{sets:next});
  };

  return <section className="exercise-card">
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

function ExercisePicker({type,title,onCancel,onSelect}){
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

  const filtered=useMemo(()=>{
    const q=query.trim().toLowerCase();
    const source=q?exercises.filter(ex=>ex.name.toLowerCase().includes(q)):exercises;
    return source.slice(0,50);
  },[exercises,query]);

  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="exercise-picker-title">
    <div className="exercise-picker-modal">
      <div className="modal-kicker">{type==='climbing'?'CLIMBING':'LIFTING'} EXERCISES</div>
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

function resultLabel(value,results){ return results.find(r=>r.value===value)?.label || '—'; }


createRoot(document.getElementById('root')).render(<App/>);
