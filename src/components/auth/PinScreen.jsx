import React, { useEffect, useState } from 'react';
import { PIN_LENGTH } from '../../constants/app.js';
import { api } from '../../utils/api.js';

/** Render the six-digit application PIN gate used after passkey authentication. */
export default function PinScreen({onSuccess}){
  const [pin,setPin]=useState('');
  const [error,setError]=useState('');
  // Append one numeric keypad digit without exceeding the configured PIN length.
  const tap=(n)=>{if(pin.length<PIN_LENGTH)setPin(p=>p+n)};
  useEffect(()=>{
    if(pin.length!==PIN_LENGTH)return;
    api('/auth/login',{method:'POST',body:JSON.stringify({pin})})
      .then(result=>onSuccess(Boolean(result.needsPasskeySetup)))
      .catch(e=>{setError(e.message==='Passkey authentication required'?'Use Face ID / passkey first':'Wrong PIN');setPin('');});
  },[pin,onSuccess]);
  return <div className="pin-screen"><div className="pin-card"><div className="lock-icon">⌁</div><h1>Training Log</h1><p>Enter PIN</p><div className="dots">{Array.from({length:PIN_LENGTH},(_,i)=><span key={i} className={i<pin.length?'filled':''}></span>)}</div>{error&&<div className="pin-error">{error}</div>}<div className="keypad">{['1','2','3','4','5','6','7','8','9','','0','⌫'].map((n,i)=>n?<button key={i} onClick={()=>n==='⌫'?setPin(p=>p.slice(0,-1)):tap(n)}>{n}</button>:<div key={i}/>)}</div></div></div>;
}
