import React, { useState } from 'react';
import { browserSupportsWebAuthn, startRegistration } from '@simplewebauthn/browser';
import { api } from '../../utils/api.js';

/** Render the one-time passkey registration screen used to bootstrap the account. */
export default function PasskeySetup({onSuccess}){
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const supported=browserSupportsWebAuthn();

  /** Start WebAuthn registration and submit the new credential for server verification. */
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
