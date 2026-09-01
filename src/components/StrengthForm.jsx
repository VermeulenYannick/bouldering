import React, { useEffect, useMemo, useState } from 'react';
import { EXERCISE_TYPES } from '../constants/app.js';
import { clone } from '../utils/data.js';
import { inferDefaultSets } from '../utils/exercises.js';
import StrengthExerciseCard from './StrengthExerciseCard.jsx';
import ExercisePicker from './ExercisePicker.jsx';

/** Render and manage a day's strength exercise plan, without mutating its template. */
export default function StrengthForm({workout,value,setData,date,data}){
  const rawPlan=value('exercisePlan');
  const defaultPlan=useMemo(()=>workout.exercises.map(ex=>({
    key:ex.id,
    exerciseId:ex.exerciseId || ex.id,
    name:ex.name,
    target:ex.target,
    unit:ex.unit || 'kg',
    defaultSets:inferDefaultSets(ex),
    template:true,
  })),[workout.exercises]);
  const plan=Array.isArray(rawPlan) && rawPlan.length ? rawPlan : defaultPlan;
  const [picker,setPicker]=useState(null);

  useEffect(()=>{
    const key=value('lastEditedExerciseKey');
    if(!key) return;
    let frame1=0;
    let frame2=0;
    frame1=requestAnimationFrame(()=>{
      frame2=requestAnimationFrame(()=>{
        const target=Array.from(document.querySelectorAll('[data-exercise-key]')).find(el=>el.dataset.exerciseKey===key);
        if(target) target.scrollIntoView({behavior:'auto',block:'center'});
      });
    });
    return()=>{cancelAnimationFrame(frame1); cancelAnimationFrame(frame2);};
  },[]);

  // Merge an exercise-level edit into this date's data and mark the exercise as the last edited.
  const updateEntry=(item,patch)=>{
    const exercises=clone(value('exercises')||{});
    const previous=exercises[item.key] || { exerciseId:item.exerciseId, name:item.name, unit:item.unit || 'kg', sets:[] };
    exercises[item.key]={...previous,...patch,exerciseId:item.exerciseId,name:item.name,unit:item.unit || 'kg'};
    const nextData=clone(data||{});
    nextData.exercises=exercises;
    nextData.lastEditedExerciseKey=item.key;
    nextData.lastEditedExerciseAt=Date.now();
    setData(['__replace__'],nextData);
  };

  // Open the picker in replacement mode for the selected slot.
  const replaceExercise=(item)=>setPicker({mode:'replace',slotKey:item.key,item});
  // Open the picker in add mode so a new exercise can be appended to this day.
  const addExercise=()=>setPicker({mode:'add',item:null});

  // Apply the selected catalog exercise to the current day without changing the template.
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
    nextData.lastEditedExerciseKey = picker.mode==='replace' ? picker.item.key : nextPlan[nextPlan.length-1]?.key;
    nextData.lastEditedExerciseAt = Date.now();
    setData(['__replace__'],nextData);
    setPicker(null);
  };

  // Remove one exercise from this day's plan and data while leaving the template untouched.
  const removeExercise=(item)=>{
    const nextPlan=plan.filter(x=>x.key!==item.key);
    const exercises=clone(value('exercises')||{});
    delete exercises[item.key];
    const nextData=clone(data||{});
    nextData.exercisePlan=nextPlan;
    nextData.exercises=exercises;
    setData(['__replace__'],nextData);
  };

  // Restore this day to the template plan and clear its recorded exercise data.
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
    />)}

    {picker&&<ExercisePicker
      type={EXERCISE_TYPES.LIFTING}
      title={picker.mode==='replace'?`Replace ${picker.item.name}`:'Add exercise'}
      onCancel={()=>setPicker(null)}
      onSelect={applyExercise}
    />}
  </>;
}
