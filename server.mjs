import {classroomLecture} from './classroom-lecture.mjs';
import {publicationSnapshot} from './publishing.mjs';
import {generateAnnotations} from './annotation-generation.mjs';
import {renderOriginalSlides} from './slide-rendering.mjs';
import {generateDirection} from './directing.mjs';
import {generateAssetBrief} from './assets.mjs';
import {generateScript} from './scripting.mjs';
import * as openrouter from './openrouter.mjs';
import {connectionStatus,beginSignIn,finishSignIn,availableModels,disconnect} from './chatgpt.mjs';
import http from 'node:http';
import { Worker } from 'node:worker_threads';
import { readFile, writeFile, mkdir, stat, rm, rename, readdir } from 'node:fs/promises';
import { generatePlan } from './planning.mjs';
import { generateFeedback } from './feedback.mjs';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { lecture } from './lecture.mjs';
const root=fileURLToPath(new URL('.',import.meta.url));
const pending=new Map();let worker, failure, ready=false, loading=0;
const inflight=new Map();
const feedbackSegments=new Map();
function startWorker(){
 if(worker)return;
 failure=null;ready=false;
 worker=new Worker(new URL('./node_modules/@met4citizen/headtts/modules/worker-tts.mjs',import.meta.url));
 worker.on('message',message=>{
  if(message.type==='ready'){ready=true;console.log('Local voice model ready');return;}
  if(message.type==='progress'){loading=message.data.lengthComputable?Math.round(message.data.loaded/message.data.total*100):0;return;}
  const task=pending.get(message.ref);if(!task)return;
  pending.delete(message.ref);clearTimeout(task.timer);
  if(message.type==='audio'){message.data.audio=Buffer.from(message.data.audio).toString('base64');task.resolve(message.data);}
  else task.reject(new Error(message.data?.error||'Speech generation failed'));
 });
 worker.on('error',error=>{failure=error.message;console.error('Voice:',failure);for(const t of pending.values()){clearTimeout(t.timer);t.reject(error);}pending.clear();worker?.terminate();worker=null;});
 worker.postMessage({type:'connect',data:{transformersModule:import.meta.resolve('@huggingface/transformers'),model:'onnx-community/Kokoro-82M-v1.0-ONNX-timestamped',dtype:'q8',device:'cpu',styleDim:256,frameRate:40,audioSampleRate:24000,languages:['en-us'],dictionaryPath:path.join(root,'node_modules/@met4citizen/headtts/dictionaries'),voicePath:path.join(root,'.cache/voices'),voices:['af_bella'],deltaStart:-10,deltaEnd:10,trace:0}});
}
async function synthesize(segment){
 const key=createHash('sha256').update(JSON.stringify({text:segment.text,voice:'af_bella',speed:1,model:'kokoro-timestamped-q8',version:1})).digest('hex');
 const filename=path.join(root,'.cache/speech',key+'.json');
 try{return {...JSON.parse(await readFile(filename,'utf8')),cached:true};}catch{}
 if(inflight.has(key))return inflight.get(key);
 const job=(async()=>{
  startWorker();if(failure)throw new Error(failure);
  const start=performance.now();
  const result=await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{pending.delete(key);reject(new Error('Speech preparation timed out. Retry after the model finishes loading.'));},180000);
   pending.set(key,{resolve,reject,timer});
   worker.postMessage({type:'synthesize',id:key,data:{input:segment.text,voice:'af_bella',language:'en-us',speed:1,audioEncoding:'wav'}});
  });
  result.generationMs=Math.round(performance.now()-start);
  await mkdir(path.dirname(filename),{recursive:true});await writeFile(filename,JSON.stringify(result));
  console.log(`Speech ${segment.id}: ${result.generationMs}ms`);return {...result,cached:false};
 })().finally(()=>inflight.delete(key));inflight.set(key,job);return job;
}
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary','.wasm':'application/wasm','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.pdf':'application/pdf'};
const publicFiles=new Set(['admin.html','admin.css','admin.js','assets-client.mjs','voice-authoring.mjs','playback.html','playback.js','playback.css','annotations.mjs','classroom-lecture.mjs','annotation-review.html','annotation-review.js','index.html','app.js','style.css','lecture.mjs','player.mjs','presenter.mjs','discussion.mjs']);
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1');
  if(!['127.0.0.1:4173','localhost:4173'].includes(req.headers.host)){res.writeHead(403).end();return;}
  if(url.pathname==='/api/published'&&req.method==='GET'){
   const directory=path.join(root,'.cache/published');await mkdir(directory,{recursive:true});const list=[];
   for(const name of await readdir(directory)){if(!name.endsWith('.json'))continue;try{const d=JSON.parse(await readFile(path.join(directory,name),'utf8'));list.push({id:d.id,title:d.title,duration:d.brief.duration,publishedAt:d.publishedAt});}catch{}}
   res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify({lectures:list}));return;
  }
  if(/^\/api\/published\/[a-zA-Z0-9-]{1,80}$/.test(url.pathname)&&req.method==='GET'){
   res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');try{res.end(await readFile(path.join(root,'.cache/published',url.pathname.split('/').pop()+'.json')));}catch{res.writeHead(404).end(JSON.stringify({error:'Lecture not published.'}));}return;
  }
  if(url.pathname==='/api/publish'&&req.method==='POST'){
   if(req.headers.origin&&!['http://127.0.0.1:4173','http://localhost:4173'].includes(req.headers.origin)){res.writeHead(403).end();return;}
   let body='';for await(const chunk of req){body+=chunk;if(body.length>30000000){res.writeHead(413).end();return;}}
   const snapshot=publicationSnapshot(JSON.parse(body)),directory=path.join(root,'.cache/published');await mkdir(directory,{recursive:true});const tmp=path.join(directory,randomUUID()+'.tmp');await writeFile(tmp,JSON.stringify(snapshot));await rename(tmp,path.join(directory,snapshot.id+'.json'));res.setHeader('Content-Type','application/json');res.end(JSON.stringify({id:snapshot.id,publishedAt:snapshot.publishedAt}));return;
  }
  if(url.pathname==='/api/annotations'&&req.method==='POST'){
   if(req.headers.origin&&!['http://127.0.0.1:4173','http://localhost:4173'].includes(req.headers.origin)){res.writeHead(403).end();return;}
   let body='';for await(const chunk of req){body+=chunk;if(body.length>20000){res.writeHead(413).end();return;}}
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),120000);res.on('close',()=>{if(!res.writableEnded)controller.abort();});
   try{const data=await generateAnnotations(root,JSON.parse(body),controller.signal);res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));}
   finally{clearTimeout(timer);}return;
  }
  if(url.pathname==='/api/render-slides'&&req.method==='POST'){
   if(req.headers.origin&&!['http://127.0.0.1:4173','http://localhost:4173'].includes(req.headers.origin)){res.writeHead(403).end();return;}
   let body='';for await(const chunk of req){body+=chunk;if(body.length>2000){res.writeHead(413).end();return;}}
   const result=await renderOriginalSlides(root,JSON.parse(body).originalUrl);res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));return;
  }
  if(url.pathname==='/api/authoring-backup'){
   res.setHeader('Cache-Control','no-store');
   if(req.headers.origin&&!['http://127.0.0.1:4173','http://localhost:4173'].includes(req.headers.origin)){res.writeHead(403).end();return;}
   const file=path.join(root,'.cache/authoring-backup.json');
   if(req.method==='GET'){try{res.setHeader('Content-Type','application/json');res.end(await readFile(file));}catch{res.writeHead(404).end();}return;}
   if(req.method==='PUT'){
    let body='';for await(const chunk of req){body+=chunk;if(body.length>30000000){res.writeHead(413).end();return;}}
    const data=JSON.parse(body);if(!Array.isArray(data.drafts)||data.drafts.some(d=>typeof d.id!=='string'||!Array.isArray(d.sources))){res.writeHead(400).end();return;}
    await mkdir(path.dirname(file),{recursive:true});const tmp=file+'.'+randomUUID();await writeFile(tmp,body,{mode:0o600});await rename(tmp,file);res.writeHead(204).end();return;
   }res.writeHead(405).end();return;
  }
  if(url.pathname.startsWith('/api/openrouter/')||url.pathname==='/auth/openrouter/callback'){
   res.setHeader('Cache-Control','no-store');
   if(req.method==='POST'&&req.headers.origin&&!['http://127.0.0.1:4173','http://localhost:4173'].includes(req.headers.origin)){res.writeHead(403).end();return;}
   if(url.pathname==='/auth/openrouter/callback'){
    const cookie=req.headers.cookie?.split('; ').find(c=>c.startsWith('ultra_openrouter='))?.slice('ultra_openrouter='.length);
    try{await openrouter.finishSignIn(url,cookie);res.setHeader('Location','/admin.html?openrouter=connected');}catch{res.setHeader('Location','/admin.html?openrouter=failed');}
    res.setHeader('Set-Cookie','ultra_openrouter=; HttpOnly; SameSite=Lax; Path=/auth/openrouter; Max-Age=0');res.writeHead(303).end();return;
   }
   let result;
   if(url.pathname==='/api/openrouter/status'&&req.method==='GET')result=await openrouter.connectionStatus();
   else if(url.pathname==='/api/openrouter/login'&&req.method==='POST'){
    if(req.headers.host!=='127.0.0.1:4173')throw Error('Use http://127.0.0.1:4173/admin.html to connect.');
    const a=openrouter.beginSignIn();res.setHeader('Set-Cookie','ultra_openrouter='+a.state+'; HttpOnly; SameSite=Lax; Path=/auth/openrouter; Max-Age=600');result={url:a.url};
   }else if(url.pathname==='/api/openrouter/models'&&req.method==='GET')result={models:await openrouter.availableModels()};
   else if(url.pathname==='/api/openrouter/logout'&&req.method==='POST')result=await openrouter.disconnect();
   else{res.writeHead(404).end();return;}
   res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));return;
  }
  if(url.pathname.startsWith('/api/chatgpt/')||url.pathname==='/auth/chatgpt/callback'){
   if(!['127.0.0.1:4173','localhost:4173'].includes(req.headers.host)){res.writeHead(403).end();return;}
   res.setHeader('Cache-Control','no-store');
   if(req.method==='POST'&&req.headers.origin&&!['http://127.0.0.1:4173','http://localhost:4173'].includes(req.headers.origin)){res.writeHead(403).end();return;}
   if(url.pathname==='/auth/chatgpt/callback'){
    const cookie=req.headers.cookie?.split('; ').find(c=>c.startsWith('ultra_oauth='))?.slice(12);
    try{const enabled=await finishSignIn(url,cookie);res.setHeader('Location','/admin.html?chatgpt='+ (enabled?'connected':'permission-required'));}
    catch{res.setHeader('Location','/admin.html?chatgpt=failed');}
    res.setHeader('Set-Cookie','ultra_oauth=; HttpOnly; SameSite=Lax; Path=/auth/chatgpt; Max-Age=0');res.writeHead(303).end();return;
   }
   let result;
   if(url.pathname==='/api/chatgpt/status'&&req.method==='GET')result=await connectionStatus();
   else if(url.pathname==='/api/chatgpt/login'&&req.method==='POST'){
    if(req.headers.host!=='127.0.0.1:4173')throw Error('Open http://127.0.0.1:4173/admin.html to connect ChatGPT.');
    const attempt=await beginSignIn();res.setHeader('Set-Cookie','ultra_oauth='+attempt.state+'; HttpOnly; SameSite=Lax; Path=/auth/chatgpt; Max-Age=600');result={url:attempt.url};
   }else if(url.pathname==='/api/chatgpt/models'&&req.method==='GET')result={models:await availableModels()};
   else if(url.pathname==='/api/chatgpt/logout'&&req.method==='POST')result=await disconnect();
   else{res.writeHead(404).end();return;}
   res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));return;
  }
  if(['/api/plan','/api/script','/api/assets','/api/direction'].includes(url.pathname)&&req.method==='POST'){
   if(req.headers.origin&&!['http://127.0.0.1:4173','http://localhost:4173'].includes(req.headers.origin)){res.writeHead(403).end();return;}
   req.setEncoding('utf8');let body='';for await(const chunk of req){body+=chunk;if(body.length>1000000){res.writeHead(413,{'Content-Type':'application/json'}).end(JSON.stringify({error:'Source request is too large. Split the lecture.'}));return;}}
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),300000);
   const disconnected=()=>{if(!res.writableEnded)controller.abort();};res.on('close',disconnected);
   try{const result=await (url.pathname==='/api/direction'?generateDirection:url.pathname==='/api/assets'?generateAssetBrief:url.pathname==='/api/script'?generateScript:generatePlan)(JSON.parse(body),controller.signal);res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify(result));}
   catch(error){res.writeHead(422,{'Content-Type':'application/json'}).end(JSON.stringify({error:error.name==='AbortError'?'Plan generation timed out. Try fewer sources.':error.message}));}
   finally{clearTimeout(timer);res.off('close',disconnected);}return;
  }
  if(url.pathname==='/api/extract'&&req.method==='POST'){
   if(req.headers.origin&&!['http://127.0.0.1:4173','http://localhost:4173'].includes(req.headers.origin)){res.writeHead(403).end();return;}
   const chunks=[];let size=0;
   for await(const chunk of req){size+=chunk.length;if(size>15*1024*1024){res.writeHead(413,{'Content-Type':'application/json'}).end(JSON.stringify({error:'File exceeds 15 MB.'}));return;}chunks.push(chunk);}
   const importId=randomUUID(),directory=path.join(root,'.cache','imports',importId);
   await mkdir(directory,{recursive:true});
   const filename=url.searchParams.get('filename')||'',ext=path.extname(filename).toLowerCase();
   if(!['.pdf','.pptx'].includes(ext)){res.writeHead(422,{'Content-Type':'application/json'}).end(JSON.stringify({error:'Choose PDF or PPTX.'}));await rm(directory,{recursive:true,force:true});return;}
   await writeFile(path.join(directory,'original'+ext),Buffer.concat(chunks));
   const extractor=new Worker(new URL('./extraction-worker.mjs',import.meta.url),{workerData:{bytes:Buffer.concat(chunks),filename,storage:{directory,url:'/imports/'+importId}},resourceLimits:{maxOldGenerationSizeMb:256}});
   let extractionTimer;
   const disconnect=()=>{if(!res.writableEnded)extractor.terminate();};res.on('close',disconnect);
   try{
    const result=await new Promise((resolve,reject)=>{
     extractionTimer=setTimeout(()=>reject(Error('Extraction took too long. Try a smaller file.')),120000);
     extractor.once('message',message=>message.error?reject(Error(message.error)):resolve(message.result));
     extractor.once('error',reject);
     extractor.once('exit',()=>reject(Error('Extraction stopped before completing.')));
    });
    res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({...result,originalUrl:'/imports/'+importId+'/original'+ext}));
   }catch(error){await rm(directory,{recursive:true,force:true});res.writeHead(422,{'Content-Type':'application/json'}).end(JSON.stringify({error:error.message}));}
   finally{clearTimeout(extractionTimer);res.off('close',disconnect);await extractor.terminate();}
   return;
  }
  if(/^\/imports\/[0-9a-f-]{36}\/(?:[0-9]+\.(?:png|jpe?g|gif|webp)|original\.(?:pdf|pptx))$/.test(url.pathname)){
   const file=path.join(root,'.cache',url.pathname.slice(1));
   res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');
   res.setHeader('X-Content-Type-Options','nosniff');res.end(await readFile(file));return;
  }
  if(url.pathname==='/api/voice-status'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ready,loading,error:failure||null}));return;}
  if(url.pathname==='/api/discuss'&&req.method==='POST'){
   if(req.headers.origin&&!['http://127.0.0.1:4173','http://localhost:4173'].includes(req.headers.origin)){res.writeHead(403).end();return;}
   let body='';for await(const chunk of req){body+=chunk;if(body.length>24000){res.writeHead(413).end();return;}}
   const {messages,history=[],checkpointId="question",publishedId}=JSON.parse(body);
   if(!Array.isArray(history))throw new Error('Invalid discussion history');
   const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),40000);
   res.on('close',()=>{if(!res.writableEnded)controller.abort();});
   try{
    let authored=null;
    if(publishedId){if(!/^[a-zA-Z0-9-]{1,80}$/.test(publishedId))throw Error('Invalid lecture');const d=JSON.parse(await readFile(path.join(root,'.cache/published',publishedId+'.json'),'utf8')),source=d.sources.find(s=>s.id===d.presentation.sourceId);let pages=source.import.assets.filter(a=>a.kind==='page');if(!pages.length)pages=(await renderOriginalSlides(root,source.import.originalUrl)).pages;authored=classroomLecture(d,pages);}
    const result=await generateFeedback(messages,history,controller.signal,checkpointId,authored);
    const id='feedback-'+randomUUID();
    for(const [key,value] of feedbackSegments)if(value.expires<Date.now())feedbackSegments.delete(key);
    if(feedbackSegments.size>=100)feedbackSegments.delete(feedbackSegments.keys().next().value);
    feedbackSegments.set(id,{id,text:result.text,expires:Date.now()+1200000});
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify({...result,segmentId:id,model:process.env.ULTRA_CHAT_MODEL||'qwen3:14b'}));
   }finally{clearTimeout(timer);}return;
  }
  if(url.pathname==='/api/authoring-playback'&&req.method==='POST'){
   if(req.headers.origin&&!['http://127.0.0.1:4173','http://localhost:4173'].includes(req.headers.origin)){res.writeHead(403).end();return;}
   let body='';for await(const chunk of req){body+=chunk;if(body.length>6000){res.writeHead(413).end();return;}}
   const {text}=JSON.parse(body);if(typeof text!=='string'||text.length>600){res.writeHead(400).end();return;}
   const key=createHash('sha256').update(JSON.stringify({text,voice:'af_bella',speed:1,model:'kokoro-timestamped-q8',version:1})).digest('hex');
   try{const data=JSON.parse(await readFile(path.join(root,'.cache/speech',key+'.json'),'utf8'));res.setHeader('Content-Type','application/json');res.end(JSON.stringify({...data,cached:true}));}
   catch{res.writeHead(404,{'Content-Type':'application/json'}).end(JSON.stringify({error:'Prepared audio or lip-sync data is missing. Return to voice preparation.'}));}return;
  }
  if(url.pathname==='/api/authoring-speech'&&req.method==='POST'){
   if(req.headers.origin&&!['http://127.0.0.1:4173','http://localhost:4173'].includes(req.headers.origin)){res.writeHead(403).end();return;}
   let body='';for await(const chunk of req){body+=chunk;if(body.length>6000){res.writeHead(413).end();return;}}
   const {text}=JSON.parse(body);if(typeof text!=='string'||!text.trim()||text.length>600){res.writeHead(400).end('Invalid narration clip');return;}
   const result=await synthesize({id:'authoring',text});
   const hash=createHash('sha256').update(text+'|af_bella|kokoro-v1').digest('hex');
   await mkdir(path.join(root,'.cache/authoring-audio'),{recursive:true});
   await writeFile(path.join(root,'.cache/authoring-audio',hash+'.wav'),Buffer.from(result.audio,'base64'));
   res.setHeader('Content-Type','application/json');res.end(JSON.stringify({url:'/authoring-audio/'+hash+'.wav',cached:result.cached}));return;
  }
  if(/^\/authoring-audio\/[a-f0-9]{64}\.wav$/.test(url.pathname)){
   const audio=await readFile(path.join(root,'.cache',url.pathname.slice(1)));res.writeHead(200,{'Content-Type':'audio/wav','Content-Length':audio.length});res.end(audio);return;
  }
  if(url.pathname==='/api/speech'&&req.method==='POST'){
   if(req.headers.origin&&!['http://127.0.0.1:4173','http://localhost:4173'].includes(req.headers.origin)){res.writeHead(403).end();return;}
   let body='';for await(const chunk of req){body+=chunk;if(body.length>1024){res.writeHead(413).end();return;}}
   const {segmentId}=JSON.parse(body);const segment=lecture.segments.find(s=>s.id===segmentId)||feedbackSegments.get(segmentId);
   if(!segment){res.writeHead(400).end('Unknown segment');return;}
   const result=await synthesize(segment);res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));return;
  }
  let relative=decodeURIComponent(url.pathname).replace(/^\//,'')||'index.html';
  const allowed=publicFiles.has(relative)||relative.startsWith('assets/')||relative.startsWith('node_modules/three/')||relative.startsWith('node_modules/@met4citizen/talkinghead/');
  const filename=path.resolve(root,relative);
  if(relative.split('/').includes('..')||!allowed||!filename.startsWith(root)||!(await stat(filename)).isFile()){res.writeHead(404).end('Not found');return;}
  res.setHeader('Content-Type',types[path.extname(filename)]||'application/octet-stream');res.setHeader('Cache-Control','no-cache');res.end(await readFile(filename));
 }catch(error){res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:error.message}));}
});
server.listen(4173,'127.0.0.1',()=>console.log('Ultra: http://127.0.0.1:4173'));
process.on('SIGINT',()=>{worker?.terminate();server.close();process.exit(0);});
