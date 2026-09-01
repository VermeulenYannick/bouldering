import React, { useMemo, useState } from 'react';
import { INTENSITY_LABELS, WEEKDAY_LABELS, WORKOUT_TYPE_LABELS } from '../constants/app.js';
import { dateKey } from '../utils/dates.js';

/** Render the month calendar and derive each cell from scheduled or saved day data. */
export default function Calendar({localState,workouts,onDate,syncState}){
  const todayKey=dateKey();
  const [cursor,setCursor]=useState(()=>{const now=new Date(); return new Date(now.getFullYear(),now.getMonth(),1);});
  // Build complete Monday-Sunday weeks, including dates immediately outside the current month.
  const cells=useMemo(()=>{
    const year=cursor.getFullYear();
    const month=cursor.getMonth();
    const first=new Date(year,month,1);
    // Monday-first calendar: JS Sunday=0, so shift Sunday to the end.
    const leading=(first.getDay()+6)%7;
    const days=new Date(year,month+1,0).getDate();
    const out=[];
    // Include the actual dates from the previous month that complete the first week.
    for(let i=leading;i>0;i--) out.push(new Date(year,month,1-i));
    for(let d=1;d<=days;d++) out.push(new Date(year,month,d));
    // Include the actual dates from the next month that complete the final week.
    while(out.length%7) out.push(new Date(year,month,days + (out.length - leading - days) + 1));
    return out;
  },[cursor]);
  const title=cursor.toLocaleDateString('en-US',{month:'long',year:'numeric'});
  // Move the visible month back to the month containing today's date.
  const goToday=()=>{const today=new Date(); setCursor(new Date(today.getFullYear(),today.getMonth(),1));};
  return <main className="app"><header className="topbar"><div><div className="eyebrow">BOULDERING LOG</div><h1>Training</h1></div><div className="sync">{syncState==='saving'?'Saving…':syncState==='pending'?'Unsaved':syncState==='offline'?'Offline':'Saved'}</div></header><section className="calendar-card"><div className="monthbar"><button aria-label="Previous month" onClick={()=>setCursor(new Date(cursor.getFullYear(),cursor.getMonth()-1,1))}>‹</button><div className="month-title-wrap"><strong>{title}</strong><button className="today-button" onClick={goToday}>Today</button></div><button aria-label="Next month" onClick={()=>setCursor(new Date(cursor.getFullYear(),cursor.getMonth()+1,1))}>›</button></div><div className="dow">{WEEKDAY_LABELS.map(day=><span key={day}>{day}</span>)}</div><div className="grid">{cells.map((d,i)=>{if(!d)return <div className="cell empty" key={i}/>; const k=dateKey(d); const log=localState?.logs?.[k]; const has=Boolean(log&&Object.keys(log.data||{}).length); const wid=log ? log.workoutId : workouts.find(w=>w.dayOfWeek===d.getDay())?._id; const wd=wid?workouts.find(w=>w._id===wid):null; const isToday=k===todayKey; const isPast=k<todayKey; const isFuture=k>todayKey; const isCurrentMonth=d.getMonth()===cursor.getMonth(); const color=wd?.color||''; const typeLetter=wd?.type==='strength'?'G':wd?.type==='climbing'?'B':''; return <button key={i} className={`cell ${!isCurrentMonth?'outside-month':''} ${has?'logged':''} ${color} ${isToday?'today':''} ${isPast?'past':''} ${isFuture?'future':''}`} onClick={()=>onDate(k)}><span className="date">{d.getDate()}</span>{wd&&<><span className="workout-type" title={WORKOUT_TYPE_LABELS[wd.type] || ''}>{typeLetter}</span><span className="workout-intensity" aria-label={`${color||'unknown'} intensity`}>{INTENSITY_LABELS[color] || ''}</span></>}{has&&<span className="check">✓</span>}</button>})}</div></section><div className="legend"><span><b className="legend-letter b">B</b> Bouldering</span><span><b className="legend-letter g">G</b> Gym</span><span><i className="legend-intensity red"></i>Hard</span><span><i className="legend-intensity yellow"></i>Moderate</span><span><i className="legend-intensity green"></i>Easy</span><span><i className="legend-today"></i>Today</span><span>✓ Logged</span></div></main>
}
