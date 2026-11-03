import React,{useEffect,useRef,useState} from 'react';

export default function UltraAgent({lecture,onReview,onBusy}){
 const [session,setSession]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(''),[notice,setNotice]=useState(''),[frameReady,setFrameReady]=useState(false);
 const [authorization,setAuthorization]=useState(null),[copied,setCopied]=useState(false);
 const input=useRef(),starting=useRef(false),mounted=useRef(true);
 const storageKey='ultra-agent:'+(lecture?.id||'new');
 function working(value){setBusy(value);onBusy(!!value);}
 async function start(fresh=false){
  if(starting.current)return;starting.current=true;working('Preparing your lecture workspace…');setError('');setFrameReady(false);
  try{
   let saved;try{saved=!fresh&&sessionStorage.getItem(storageKey);}catch{}
   const res=await fetch('/api/ultra-agent/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:saved||undefined,replaceId:lecture?.id,expectedPublishedAt:lecture?.publishedAt})});
   const data=await res.json();if(!res.ok)throw Error(data.error||'Unable to start Ultra Agent.');
   try{sessionStorage.setItem(storageKey,data.id);}catch{}
   if(mounted.current)setSession(data);
  }catch(e){if(mounted.current)setError(e.message);}finally{starting.current=false;if(mounted.current)working('');}
 }
 useEffect(()=>{mounted.current=true;start();return()=>{mounted.current=false;onBusy(false);};},[]);
 useEffect(()=>{
  if(!session)return;
  let disposed=false,timer;
  async function poll(){
   try{const res=await fetch('/api/ultra-agent/'+session.id+'/authorization');if(res.ok){const data=await res.json();if(!disposed)setAuthorization(data.authorization);}}catch{}
   if(!disposed)timer=setTimeout(poll,1500);
  }
  poll();return()=>{disposed=true;clearTimeout(timer);};
 },[session?.id]);
 useEffect(()=>{setCopied(false);},[authorization?.url]);
 async function copySignIn(){try{await navigator.clipboard.writeText(authorization.url);setCopied(true);}catch{setError('Unable to copy. Right-click Open ChatGPT sign-in and copy its link.');}}
 async function sources(files){
  working('Adding source material…');setError('');setNotice('');const added=[];
  try{for(const file of files){if(file.size>50*1024*1024)throw Error(file.name+' exceeds 50 MB.');const res=await fetch('/api/ultra-agent/'+session.id+'/source?name='+encodeURIComponent(file.name),{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:file});const data=await res.json();if(!res.ok)throw Error(data.error);added.push(data.path);}setNotice('Added '+added.join(', ')+'. Ask Ultra to read these sources in the chat.');}catch(e){setError((added.length?'Added '+added.join(', ')+'. ':'')+e.message);}finally{working('');}
 }
 async function review(){
  working('Opening your lecture package…');setError('');
  try{const res=await fetch('/api/ultra-agent/'+session.id+'/package');if(!res.ok){const data=await res.json();throw Error(data.error);}await onReview(new File([await res.blob()],'ultra-lecture.zip',{type:'application/zip'}),session);}catch(e){setError(e.message);}finally{working('');}
 }
 return <div className="ultra-agent">
  {!session&&!busy&&<div className="agent-start"><p>Your teaching skills and lecture files will be ready inside Ultra Agent.</p><button className="primary" onClick={()=>start()}>Retry connection</button>{error&&<button onClick={()=>start(true)}>Start a fresh workspace</button>}</div>}
  {session&&<><div className="agent-toolbar"><div><strong>Ultra Agent <small>Powered by OpenCode</small></strong><p>{session.skillCount} teaching skills ready{session.replaceId?' · Existing lecture loaded':''}</p></div><div className="actions"><input ref={input} className="sr-only" type="file" multiple aria-label="Add source material" disabled={!!busy} onChange={e=>{sources(Array.from(e.target.files));e.target.value='';}}/><button disabled={!!busy} onClick={()=>input.current.click()}>Add sources</button><button className="primary" disabled={!!busy} onClick={review}>Review package</button><a href={session.url} target="_blank" rel="noreferrer">Open full screen ↗</a></div></div>
  <p className="agent-connection-note">Choose Select model below, then OpenAI for ChatGPT sign-in or OpenRouter for an API key. Once connected, describe your lecture{lecture?' changes':''}. Add source files up to 50 MB each.</p>
  {authorization?.status==='pending'&&<section className="agent-authorization" aria-label="ChatGPT sign-in">
   <strong>Finish connecting your ChatGPT account</strong>
   <p>Open the sign-in page, complete authorization, then return here. If no tab opens, copy the link into your browser.</p>
   {authorization.code&&<p>Enter this confirmation code: <code>{authorization.code}</code></p>}
   <div className="actions"><a className="primary" href={authorization.url} target="_blank" rel="noopener noreferrer">Open ChatGPT sign-in ↗</a><button onClick={copySignIn}>{copied?'Link copied':'Copy sign-in link'}</button></div>
   <p role="status">Waiting for you to finish sign-in. This request expires after five minutes.</p>
  </section>}
  {authorization?.status==='connected'&&<p className="agent-notice" role="status">ChatGPT connected. Select a model below to start your lecture.</p>}
  {['expired','failed'].includes(authorization?.status)&&<p className="error" role="alert">{authorization.status==='expired'?'The sign-in request expired.':'Sign-in did not complete.'} Close the connection dialog below and select ChatGPT again to retry.</p>}
  {!frameReady&&<p role="status">Loading the agent interface…</p>}
  <iframe key={session.url} title="Ultra Agent — OpenCode" className="agent-frame" src={session.url} onLoad={()=>setFrameReady(true)} allow="clipboard-read; clipboard-write" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"/>
  </>}
  {busy&&<p role="status" className="busy"><span className="spinner"/>{busy}</p>}{notice&&<p role="status" className="agent-notice">{notice}</p>}{error&&<p role="alert" className="error">{error}</p>}
 </div>;
}
