import React, { useState } from 'react';
import { browserSupportsWebAuthn, startAuthentication } from '@simplewebauthn/browser';
import { api } from '../../utils/api.js';

/** Render the WebAuthn login gate and complete a server-verified passkey ceremony. */
export default function PasskeyLogin({onSuccess}){
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const supported=browserSupportsWebAuthn();

  /** Start WebAuthn login, ask the authenticator for proof, and exchange it for pre-auth. */
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
