import {readFile,writeFile,mkdir,rename,readdir} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {zipSync,strToU8} from 'fflate';
import {readPackage,packageClassroom,audioDuration,publicationLocks} from './lecture-packages.mjs';
import {publishedVoiceProfile,voiceProfile} from './reply-voice.mjs';
import {settings,alignmentData} from './eleven-voice.mjs';

import {avatars} from '../../public/avatar-catalog.mjs';
export {avatars};
const rates={eleven_v4:.08,eleven_v3:.08,eleven_multilingual_v2:.08,eleven_flash_v2_5:.04,eleven_turbo_v2_5:.04,eleven_v4_turbo:.04};
export function regenerationEstimate(segments,model){
 const characters=segments.reduce((n,s)=>n+Array.from(s.text).length,0),clips=segments.length;
 return {characters,clips,costUSD:rates[model]===undefined?null:Math.ceil(characters/1000*rates[model]*100)/100,ratePerThousand:rates[model]??null,minMinutes:Math.max(1,Math.ceil((clips*2+characters/250)/60)),maxMinutes:Math.max(2,Math.ceil((clips*8+characters/80)/60)),pricingDate:'2026-10-19',pricingUrl:'https://elevenlabs.io/pricing/api'};
}
export async function listVoices(root){
 const {apiKey}=await settings(root);if(!apiKey)throw Error('Configure ElevenLabs in voice settings before choosing a new voice.');
 const r=await fetch('https://api.elevenlabs.io/v1/voices',{headers:{'xi-api-key':apiKey},signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Could not load your ElevenLabs voices. Check the connection and retry.');
 const d=await r.json();return (d.voices||[]).map(v=>({id:v.voice_id,name:v.name,previewUrl:v.preview_url||null}));
}
export async function generateNarration(root,text,profile){
 const {apiKey}=await settings(root);if(!apiKey)throw Error('ElevenLabs is not configured.');
 const r=await fetch('https://api.elevenlabs.io/v1/text-to-speech/'+encodeURIComponent(profile.voiceId)+'/with-timestamps?output_format=mp3_44100_128',{method:'POST',headers:{'xi-api-key':apiKey,'Content-Type':'application/json'},body:JSON.stringify({text,model_id:profile.model,voice_settings:profile.settings}),signal:AbortSignal.timeout(120000)});
 if(!r.ok)throw Error('Voice generation failed ('+r.status+'). Completed clips are saved; retry to continue.');
 const d=await r.json(),a=d.normalized_alignment||d.alignment;if(!d.audio_base64||!a?.characters?.length)throw Error('Voice provider returned incomplete audio or timings.');
 return {audio:d.audio_base64,...alignmentData({characters:a.characters,characterStartTimesSeconds:a.character_start_times_seconds,characterEndTimesSeconds:a.character_end_times_seconds})};
}
export function retimeAnnotations(annotations,oldDuration,newDuration){return (annotations||[]).map(a=>({...a,start:a.start/oldDuration*newDuration,duration:a.duration/oldDuration*newDuration}));}
export function createLectureSettings({root,exportLecture,voices=()=>listVoices(root),generate=(text,p)=>generateNarration(root,text,p),duration=audioDuration}){
 const jobs=new Map(),running=new Set(),preparing=new Set();
 const published=id=>{if(!/^[a-zA-Z0-9-]{1,80}$/.test(id))throw Error('Invalid lecture.');return path.join(root,'.cache/published',id+'.json');};
 const jobDir=token=>{if(!/^[0-9a-f-]{36}$/.test(token))throw Error('Invalid generation job.');return path.join(root,'.cache/lecture-settings',token);};
 const save=async job=>{await mkdir(jobDir(job.token),{recursive:true});const file=path.join(jobDir(job.token),'job.json');await writeFile(file+'.tmp',JSON.stringify(job));await rename(file+'.tmp',file);};
 async function getJob(token,id){let j=jobs.get(token);if(!j){j=JSON.parse(await readFile(path.join(jobDir(token),'job.json'),'utf8'));if(j.state==='generating'){j.state='failed';j.error='Generation was interrupted. Retry to continue from saved clips.';}jobs.set(token,j);}if(j.id!==id)throw Error('This job belongs to another lecture.');return j;}
 async function pendingJob(id){
  const directory=path.join(root,'.cache/lecture-settings');let tokens=[];try{tokens=await readdir(directory);}catch(e){if(e.code!=='ENOENT')throw e;}
  for(const token of tokens){if(!/^[0-9a-f-]{36}$/.test(token))continue;let j=jobs.get(token);if(!j){try{const saved=JSON.parse(await readFile(path.join(jobDir(token),'job.json'),'utf8'));if(saved.id!==id)continue;j=await getJob(token,id);}catch{continue;}}if(j.id===id&&['generating','ready','failed'].includes(j.state))return j;}
  return null;
 }
 const view=j=>({token:j.token,state:j.state,completed:j.completed,total:j.manifest.segments.length,error:j.error||null,estimate:j.estimate,voiceChanged:j.voiceChanged,annotationReview:j.annotationReview,preview:j.state==='ready'?j.manifest.segments.map(s=>({id:s.id,text:s.text,audioUrl:'/package-assets/'+j.token+'/'+s.audio})):[],avatar:j.avatar,voiceProfile:j.profile});
 async function info(id){const d=JSON.parse(await readFile(published(id),'utf8'));let catalogue=[],voiceError=null;try{catalogue=await voices();}catch(e){voiceError=e.message;}
  const current=await publishedVoiceProfile(root,d);const segments=d.classroom?.segments||d.voice?.clips||[];
  if(current&&!catalogue.some(v=>v.id===current.voiceId))catalogue.unshift({id:current.voiceId,name:'Current lecture voice ('+current.voiceId+')'});
  const pending=await pendingJob(id);
  return {pendingJob:pending?view(pending):null,id,title:d.title,publishedAt:d.publishedAt,voiceProfile:current,avatar:d.classroom?.avatar||d.avatar||'default',voices:catalogue,voiceError,avatars,estimate:regenerationEstimate(segments,current?.model||'eleven_v4')};
 }
 async function processJob(j){
  if(running.has(j.token))return;running.add(j.token);j.state='generating';j.error=null;
  try{await save(j);
   const folder=path.join(root,'.cache/packages',j.token),files=readPackage(await readFile(path.join(jobDir(j.token),'source.zip'))).files;
   await mkdir(path.join(folder,'files/generated'),{recursive:true});
   for(let i=j.completed;i<j.manifest.segments.length&&j.voiceChanged;i++){
    const s=j.manifest.segments[i],audio=await generate(s.text,j.profile),name='generated/clip-'+(i+1)+'.mp3',file=path.join(folder,'files',name);
    await writeFile(file,Buffer.from(audio.audio,'base64'));const measured=await duration(file);
    const annotations=retimeAnnotations(s.annotations,s.duration,measured);
    Object.assign(s,{audio:name,duration:measured,words:audio.words,wtimes:audio.wtimes,wdurations:audio.wdurations,annotations});
    j.completed=i+1;await save(j);
   }
   for(const s of j.manifest.segments)if(j.voiceChanged)files[s.audio]=await readFile(path.join(folder,'files',s.audio));
   if(j.voiceChanged){files['audio-segments.json']=strToU8(JSON.stringify(j.manifest.segments,null,2));files['audio-generation.json']=strToU8(JSON.stringify({provider:'ElevenLabs API',model:j.profile.model,voice_id:j.profile.voiceId,voice_settings:j.profile.settings,status:'All classroom clips regenerated',segment_count:j.manifest.segments.length}));files['voice-change-notes.md']=strToU8('Classroom narration and word timings were regenerated. Annotation times were scaled to the new clip duration and require review. Bundled standalone HTML and animation source files retain their previous timing; update them before using them independently.');}
   files['lecture.json']=strToU8(JSON.stringify(j.manifest,null,2));const archive=zipSync(files);readPackage(archive);
   for(const [name,bytes] of Object.entries(files)){const file=path.join(folder,'files',name);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,bytes);}
   await writeFile(path.join(folder,'manifest.json'),JSON.stringify(j.manifest));await writeFile(path.join(folder,'package.zip'),archive);
   j.completed=j.manifest.segments.length;await save({...j,state:'ready'});j.state='ready';
  }catch(e){j.error=e.message;await save({...j,state:'failed'});j.state='failed';}finally{running.delete(j.token);}
 }
 async function prepare(id,input){
  if(preparing.has(id))throw Error('Lecture changes are already being prepared.');preparing.add(id);
  try{
  const d=JSON.parse(await readFile(published(id),'utf8'));if(d.publishedAt!==input.expectedPublishedAt)throw Error('This lecture changed. Reload Edit lecture before continuing.');
  if(!avatars.some(a=>a.id===input.avatar))throw Error('Choose an available avatar.');
  const original=await publishedVoiceProfile(root,d),profile=input.voiceId?voiceProfile({...original||{provider:'elevenlabs',model:'eleven_v4',settings:{stability:.5,similarity_boost:.75}},voiceId:input.voiceId}):original;
  const voiceChanged=!!profile&&profile.voiceId!==original?.voiceId;
  if(voiceChanged){if(input.confirmRegeneration!==true)throw Error('Confirm that changing voice regenerates every audio clip.');if(!(await voices()).some(v=>v.id===profile.voiceId))throw Error('Choose a voice available in your ElevenLabs account.');}
  if(await pendingJob(id))throw Error('A settings job already exists. Finish or discard it first.');
  const source=await exportLecture(d),{manifest}=readPackage(source);manifest.avatar=input.avatar;if(profile)manifest.voiceProfile=profile;
  const j={id,token:randomUUID(),expectedPublishedAt:d.publishedAt,avatar:input.avatar,profile,voiceChanged,manifest,completed:0,state:'generating',estimate:regenerationEstimate(manifest.segments,profile?.model||'eleven_v4'),annotationReview:voiceChanged&&manifest.segments.some(s=>s.annotations?.length)};
  jobs.set(j.token,j);await save(j);await writeFile(path.join(jobDir(j.token),'source.zip'),source);void processJob(j);return view(j);
  }finally{preparing.delete(id);}
 }
 async function publish(id,token,reviewed){
  const j=await getJob(token,id);if(j.state!=='ready')throw Error('Wait for every clip to finish before publishing.');if(j.voiceChanged&&reviewed!==true)throw Error('Review the regenerated audio and timings before publishing.');
  if(publicationLocks.has(id))throw Error('This lecture is being updated. Try again.');publicationLocks.add(id);
  j.state='publishing';try{
   const d=JSON.parse(await readFile(published(id),'utf8'));if(d.publishedAt!==j.expectedPublishedAt)throw Error('The published lecture changed. Discard this job and reload before editing.');
   const classroom=packageClassroom(j.manifest,'/package-assets/'+j.token+'/',await readFile(path.join(root,'.cache/packages',j.token,'files',j.manifest.article),'utf8'));classroom.id=id;
   const snapshot={id,title:d.title,publishedAt:new Date().toISOString(),packageToken:j.token,voiceProfile:j.profile,avatar:j.avatar,brief:{...d.brief,duration:Math.ceil(j.manifest.segments.reduce((n,s)=>n+s.duration,0)/60)},classroom};
   const history=path.join(root,'.cache/publication-history');await mkdir(history,{recursive:true});await writeFile(path.join(history,id+'-'+randomUUID()+'.json'),JSON.stringify(d));await writeFile(published(id)+'.settings-tmp',JSON.stringify(snapshot));await rename(published(id)+'.settings-tmp',published(id));j.state='published';await save(j);return {id,publishedAt:snapshot.publishedAt};
  }catch(e){j.state='ready';throw e;}finally{publicationLocks.delete(id);}
 }
 async function api(req,res,url){const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};try{
  const match=/^\/api\/lecture-settings\/([a-zA-Z0-9-]{1,80})(?:\/([a-z-]+))?$/.exec(url.pathname);if(!match)throw Error('Invalid lecture settings route.');const [,id,action]=match;
  if(req.method==='GET'&&!action){send(200,await info(id));return;}
  if(req.method==='GET'&&action==='job'){send(200,view(await getJob(url.searchParams.get('token'),id)));return;}
  if(req.method!=='POST'){send(405,{error:'Method not allowed.'});return;}
  let body='';for await(const chunk of req){body+=chunk;if(body.length>5000)throw Error('Request too large.');}const input=JSON.parse(body);
  if(action==='prepare')send(200,await prepare(id,input));
  else if(action==='publish')send(200,await publish(id,input.token,input.reviewed));
  else if(action==='retry'){const j=await getJob(input.token,id);if(j.state!=='failed')throw Error('This job cannot be retried.');void processJob(j);send(200,view(j));}
  else if(action==='discard'){const j=await getJob(input.token,id);if(running.has(j.token)||j.state==='publishing')throw Error('Wait for generation to finish before discarding.');j.state='discarded';await save(j);send(200,{ok:true});}
  else send(404,{error:'Not found.'});
 }catch(e){send(422,{error:e.message});}}
 return {info,prepare,publish,getJob,view,api};
}
