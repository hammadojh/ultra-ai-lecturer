import {createSimliApi} from './simli-api.mjs';
import {createLiveAvatarApi} from './liveavatar-api.mjs';
import {createLectureSettings} from './lecture-settings.mjs';
import {streamReply} from '../../public/reply-stream.mjs';
import {replySpeech,publishedVoiceProfile} from './reply-voice.mjs';
import {createStudioMcp} from './studio-mcp.mjs';
import {packageApi,exportPackage,safePackagePath} from './lecture-packages.mjs';
import {createUltraAgent} from './ultra-agent.mjs';
import {studioApi} from './studio-api.mjs';
import * as elevenVoice from './eleven-voice.mjs';
import {proposeSplit} from './splitting-generation.mjs';
import {renderGeneratedSlides} from './generated-slide-rendering.mjs';
import {generateSlides} from './slide-generation.mjs';
import {produceAsset} from './asset-production.mjs';
import {createAuth,sessionToken,sessionCookie} from './auth.mjs';
import {classroomLecture} from '../../public/classroom-lecture.mjs';
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
import { lecture } from '../../public/lecture.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const port=Number(process.env.ULTRA_PORT||4173);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid ULTRA_PORT');
const liveAvatar=createLiveAvatarApi({root});
const simli=createSimliApi({root});
const allowedHosts=[`127.0.0.1:${port}`,`localhost:${port}`];
const allowedOrigins=allowedHosts.map(host=>'http://'+host);
const auth=createAuth(process.env.ULTRA_AUTH_DIRECTORY||path.join(root,'.cache/auth'));
async function lectureExport(d){
 let lecture=d.classroom;if(!lecture&&!d.packageToken){let pages=d.renderedPages;const source=d.sources.find(s=>s.id===d.presentation.sourceId);if(!pages?.length)pages=source?.import?.assets?.filter(a=>a.kind==='page');if(!pages?.length&&source?.import?.originalUrl)pages=(await renderOriginalSlides(root,source.import.originalUrl)).pages;lecture=classroomLecture(d,pages||[]);}
 return exportPackage(root,d,lecture);
}
const lectureSettings=createLectureSettings({root,exportLecture:lectureExport});
const ultraAgent=createUltraAgent({root,auth,exportLecture:lectureExport});
const studioMcp=createStudioMcp({root,exportLecture:lectureExport});
const pending=new Map();let worker, failure, ready=false, loading=0;
const inflight=new Map();
const feedbackSegments=new Map();
function startWorker(){
 if(worker)return;
 failure=null;ready=false;
 worker=new Worker(new URL('../../node_modules/@met4citizen/headtts/modules/worker-tts.mjs',import.meta.url));
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
const publicFiles=new Set(['studio.html','studio.css','studio-ui.js','lecture-splitting.mjs','slides.mjs','notifications.mjs','login.html','login.js','login.css','account.js','admin.html','admin.css','admin.js','assets-client.mjs','voice-authoring.mjs','playback.html','playback.js','playback.css','annotations.mjs','classroom-lecture.mjs','annotation-review.html','annotation-review.js','index.html','app.js','style.css','lecture.mjs','player.mjs','presenter.mjs','avatar-catalog.mjs','liveavatar-presenter.mjs','simli-presenter.mjs','avatar-preview.html','avatar-preview.mjs','discussion.mjs','reply-stream.mjs']);
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1');
  if(!allowedHosts.includes(req.headers.host)){res.writeHead(403).end();return;}
  if(url.pathname==='/mcp'){await studioMcp.handle(req,res);return;}
  const token=sessionToken(req),user=auth.session(token);
  const json=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  if(!['GET','HEAD'].includes(req.method)&&req.headers.origin!==`http://${req.headers.host}`){json(403,{error:'Invalid request origin.'});return;}
  if(url.pathname.startsWith('/api/auth/')){
   if(url.pathname==='/api/auth/me'&&req.method==='GET'){json(200,{user,setupRequired:await auth.setupRequired()});return;}
   if(req.method!=='POST'){json(405,{error:'Method not allowed.'});return;}
   if(url.pathname==='/api/auth/logout'){auth.logout(token);ultraAgent.closeUser(user?.id);res.setHeader('Set-Cookie',sessionCookie(''));json(200,{ok:true});return;}
   if(!['/api/auth/login','/api/auth/register','/api/auth/setup'].includes(url.pathname)){json(404,{error:'Not found.'});return;}
   if(auth.limited(req.socket.remoteAddress)){json(429,{error:'Too many attempts. Try again in ten minutes.'});return;}
   let body='';for await(const chunk of req){body+=chunk;if(body.length>4096){json(413,{error:'Request too large.'});return;}}
   try{const data=JSON.parse(body),result=url.pathname.endsWith('/login')?await auth.login(data):await auth.register(data,url.pathname.endsWith('/setup'));auth.logout(token);res.setHeader('Set-Cookie',sessionCookie(result.token));json(200,{user:result.user});}catch(e){json(400,{error:e.message});}return;
  }
  const anonymous=['/login.html','/login.js','/login.css'].includes(url.pathname);
  if(!user&&!anonymous){if(url.pathname.startsWith('/api/'))json(401,{error:'Please sign in.'});else res.writeHead(302,{Location:'/login.html?next='+encodeURIComponent(url.pathname+url.search),'Cache-Control':'no-store'}).end();return;}
  const studentApis=['/api/published','/api/discuss','/api/speech','/api/voice-status','/api/authoring-playback','/api/render-slides'];
  const adminOnly=(url.pathname.startsWith('/api/')&&!studentApis.includes(url.pathname)&&!url.pathname.startsWith('/api/liveavatar/')&&!url.pathname.startsWith('/api/simli/')&&!/^\/api\/published\/[a-zA-Z0-9-]+$/.test(url.pathname))||/^\/(studio|admin|annotation-review|playback)\.(html|js)$/.test(url.pathname)||url.pathname.startsWith('/auth/');
  if(user&&user.role!=='admin'&&adminOnly){json(403,{error:'Administrator access required.'});return;}
  if(url.pathname.startsWith('/api/simli/')){await simli.api(req,res,url,user);return;}
  if(url.pathname.startsWith('/api/liveavatar/')){await liveAvatar.api(req,res,url,user);return;}
  if(url.pathname==='/api/mcp/token'&&req.method==='POST'){json(200,await studioMcp.issue(user));return;}
  if(url.pathname==='/api/mcp/token'&&req.method==='DELETE'){await studioMcp.revoke(user);json(200,{ok:true});return;}
  if(/^\/api\/mcp\/review\/[a-f0-9-]{36}$/.test(url.pathname)&&req.method==='GET'){try{json(200,await studioMcp.review(user.id,url.pathname.split('/').pop()));}catch{json(404,{error:'Review not found.'});}return;}
  if(url.pathname.startsWith('/api/ultra-agent/')){await ultraAgent.api(req,res,url,user);return;}
  if(url.pathname.startsWith('/api/lecture-settings/')){await lectureSettings.api(req,res,url);return;}
  if(url.pathname.startsWith('/api/lecture-packages/')){await packageApi(req,res,url,root);return;}
  if(/^\/api\/lecture-package\/[a-zA-Z0-9-]{1,80}$/.test(url.pathname)&&req.method==='GET'){
   const d=JSON.parse(await readFile(path.join(root,'.cache/published',url.pathname.split('/').pop()+'.json'),'utf8'));
   const bytes=await lectureExport(d);res.writeHead(200,{'Content-Type':'application/zip','Content-Disposition':'attachment; filename="ultra-lecture.zip"'});res.end(bytes);return;
  }
  if(url.pathname.startsWith('/package-assets/')){
   const parts=url.pathname.slice('/package-assets/'.length).split('/'),token=parts.shift(),name=parts.join('/');
   if(!/^[0-9a-f-]{36}$/.test(token)||!safePackagePath(name)||! /\.(png|jpe?g|webp|mp3|wav)$/i.test(name)){res.writeHead(404).end();return;}
   const bytes=await readFile(path.join(root,'.cache/packages',token,'files',name));res.writeHead(200,{'Content-Type':types[path.extname(name)]|| (name.endsWith('.mp3')?'audio/mpeg':'audio/wav'),'X-Content-Type-Options':'nosniff','Cache-Control':'private, max-age=31536000, immutable'});res.end(bytes);return;
  }
  if(url.pathname==='/api/studio-v2'||url.pathname.startsWith('/api/studio-v2/')){await studioApi(req,res,url,root);return;}
  if(url.pathname==='/api/published'&&req.method==='GET'){
   const directory=path.join(root,'.cache/published');await mkdir(directory,{recursive:true});const list=[];
   for(const name of await readdir(directory)){if(!name.endsWith('.json'))continue;try{const d=JSON.parse(await readFile(path.join(directory,name),'utf8'));list.push({id:d.id,title:d.title,duration:d.brief.duration,publishedAt:d.publishedAt});}catch{}}
   res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify({lectures:list}));return;
  }
  if(/^\/api\/published\/[a-zA-Z0-9-]{1,80}$/.test(url.pathname)&&req.method==='GET'){
   res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');try{res.end(await readFile(path.join(root,'.cache/published',url.pathname.split('/').pop()+'.json')));}catch{res.writeHead(404).end(JSON.stringify({error:'Lecture not published.'}));}return;
  }
  if(url.pathname==='/api/publish'&&req.method==='POST'){
   if(req.headers.origin&&!allowedOrigins.includes(req.headers.origin)){res.writeHead(403).end();return;}
   let body='';for await(const chunk of req){body+=chunk;if(body.length>30000000){res.writeHead(413).end();return;}}
   const draft=JSON.parse(body),snapshot=publicationSnapshot(draft);snapshot.voiceProfile=await publishedVoiceProfile(root,draft);if(draft.presentation?.mode!=='original')snapshot.renderedPages=(await renderGeneratedSlides(root,draft)).pages;const directory=path.join(root,'.cache/published');await mkdir(directory,{recursive:true});const tmp=path.join(directory,randomUUID()+'.tmp');await writeFile(tmp,JSON.stringify(snapshot));await rename(tmp,path.join(directory,snapshot.id+'.json'));res.setHeader('Content-Type','application/json');res.end(JSON.stringify({id:snapshot.id,publishedAt:snapshot.publishedAt}));return;
  }
  if(url.pathname==='/api/asset-production'&&req.method==='POST'){
   let body='';for await(const chunk of req){body+=chunk;if(body.length>25000){json(413,{error:'Brief too large.'});return;}}
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),180000);res.on('close',()=>{if(!res.writableEnded)controller.abort();});
   try{json(200,await produceAsset(JSON.parse(body),controller.signal));}catch(e){json(422,{error:e.name==='AbortError'?'Asset creation timed out. Retry.':e.message});}finally{clearTimeout(timer);}return;
  }
  if(url.pathname==='/api/annotations'&&req.method==='POST'){
   if(req.headers.origin&&!allowedOrigins.includes(req.headers.origin)){res.writeHead(403).end();return;}
   let body='';for await(const chunk of req){body+=chunk;if(body.length>20000){res.writeHead(413).end();return;}}
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),120000);res.on('close',()=>{if(!res.writableEnded)controller.abort();});
   try{const data=await generateAnnotations(root,JSON.parse(body),controller.signal);res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));}
   finally{clearTimeout(timer);}return;
  }
  if(url.pathname==='/api/render-generated-slides'&&req.method==='POST'){
   let body='';for await(const chunk of req){body+=chunk;if(body.length>30000000){json(413,{error:'Deck too large.'});return;}}
   json(200,await renderGeneratedSlides(root,JSON.parse(body)));return;
  }
  if(url.pathname==='/api/render-slides'&&req.method==='POST'){
   if(req.headers.origin&&!allowedOrigins.includes(req.headers.origin)){res.writeHead(403).end();return;}
   let body='';for await(const chunk of req){body+=chunk;if(body.length>2000){res.writeHead(413).end();return;}}
   const result=await renderOriginalSlides(root,JSON.parse(body).originalUrl);res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));return;
  }
  if(url.pathname==='/api/authoring-backup'){
   res.setHeader('Cache-Control','no-store');
   if(req.headers.origin&&!allowedOrigins.includes(req.headers.origin)){res.writeHead(403).end();return;}
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
   if(req.method==='POST'&&req.headers.origin&&!allowedOrigins.includes(req.headers.origin)){res.writeHead(403).end();return;}
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
   if(!allowedHosts.includes(req.headers.host)){res.writeHead(403).end();return;}
   res.setHeader('Cache-Control','no-store');
   if(req.method==='POST'&&req.headers.origin&&!allowedOrigins.includes(req.headers.origin)){res.writeHead(403).end();return;}
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
  if(['/api/plan','/api/script','/api/assets','/api/direction','/api/slides','/api/split-lecture'].includes(url.pathname)&&req.method==='POST'){
   if(req.headers.origin&&!allowedOrigins.includes(req.headers.origin)){res.writeHead(403).end();return;}
   req.setEncoding('utf8');let body='';for await(const chunk of req){body+=chunk;if(body.length>(['/api/slides','/api/direction'].includes(url.pathname)?30000000:1000000)){res.writeHead(413,{'Content-Type':'application/json'}).end(JSON.stringify({error:'Source request is too large. Split the lecture.'}));return;}}
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),300000);
   const disconnected=()=>{if(!res.writableEnded)controller.abort();};res.on('close',disconnected);
   try{const result=await (url.pathname==='/api/split-lecture'?proposeSplit:url.pathname==='/api/slides'?generateSlides:url.pathname==='/api/direction'?generateDirection:url.pathname==='/api/assets'?generateAssetBrief:url.pathname==='/api/script'?generateScript:generatePlan)(JSON.parse(body),controller.signal);res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify(result));}
   catch(error){res.writeHead(422,{'Content-Type':'application/json'}).end(JSON.stringify({error:error.name==='AbortError'?'Plan generation timed out. Try fewer sources.':error.message}));}
   finally{clearTimeout(timer);res.off('close',disconnected);}return;
  }
  if(url.pathname==='/api/extract'&&req.method==='POST'){
   if(req.headers.origin&&!allowedOrigins.includes(req.headers.origin)){res.writeHead(403).end();return;}
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
   if(req.headers.origin&&!allowedOrigins.includes(req.headers.origin)){res.writeHead(403).end();return;}
   let body='';for await(const chunk of req){body+=chunk;if(body.length>24000){res.writeHead(413).end();return;}}
   const {messages,history=[],checkpointId="question",publishedId,stream=false,silent=false,facilitatorOverride=false}=JSON.parse(body);
   if(facilitatorOverride&&user.role!=='admin'){json(403,{error:'Only a facilitator can request an immediate answer.'});return;}
   if(!Array.isArray(history))throw new Error('Invalid discussion history');
   const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),120000);
   res.on('close',()=>{if(!res.writableEnded)controller.abort();});
   try{
    let authored=null;
    if(publishedId){if(!/^[a-zA-Z0-9-]{1,80}$/.test(publishedId))throw Error('Invalid lecture');const d=JSON.parse(await readFile(path.join(root,'.cache/published',publishedId+'.json'),'utf8'));let pages=d.renderedPages;if(!d.classroom&&!pages){const source=d.sources.find(s=>s.id===d.presentation.sourceId);pages=source.import.assets.filter(a=>a.kind==='page');if(!pages.length)pages=(await renderOriginalSlides(root,source.import.originalUrl)).pages;}authored=d.classroom||classroomLecture(d,pages);authored.voiceProfile=authored.voiceProfile||await publishedVoiceProfile(root,d);}
    const profile=authored?.voiceProfile;let useLocalVoice=false;
    const remember=result=>{
     const id='feedback-'+randomUUID();
     for(const [key,value] of feedbackSegments)if(value.expires<Date.now())feedbackSegments.delete(key);
     if(feedbackSegments.size>=100)feedbackSegments.delete(feedbackSegments.keys().next().value);
     feedbackSegments.set(id,{id,text:result.text,profile,owner:user.id,expires:Date.now()+1200000});return {...result,segmentId:id};
    };
    if(stream){
     res.writeHead(200,{'Content-Type':'application/x-ndjson','Cache-Control':'no-store','X-Accel-Buffering':'no'});res.flushHeaders();
     const emit=event=>{if(!controller.signal.aborted&&!res.destroyed)res.write(JSON.stringify(event)+'\n');};
     try{
      await streamReply({signal:controller.signal,emit,generate:async onSentence=>remember(await generateFeedback(messages,history,controller.signal,checkpointId,authored,undefined,user.name,silent?undefined:onSentence,facilitatorOverride===true)),speak:async(text,signal)=>{const audio=await replySpeech({root,text,profile,signal,preferFallback:useLocalVoice,fallback:text=>synthesize({id:'live-reply',text})});if(audio.fallback)useLocalVoice=true;return audio;}});
     }catch(error){emit({type:'error',error:controller.signal.aborted?'Reply timed out. Please retry.':'Reply interrupted. Your questions remain available.'});}
     res.end();
    }else{
     const result=remember(await generateFeedback(messages,history,controller.signal,checkpointId,authored,undefined,user.name,undefined,facilitatorOverride===true));
     res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));
    }
   }finally{clearTimeout(timer);}return;
  }
  if(url.pathname==='/api/authoring-playback'&&req.method==='POST'){
   if(req.headers.origin&&!allowedOrigins.includes(req.headers.origin)){res.writeHead(403).end();return;}
   let body='';for await(const chunk of req){body+=chunk;if(body.length>6000){res.writeHead(413).end();return;}}
   const {text}=JSON.parse(body);if(typeof text!=='string'||text.length>600){res.writeHead(400).end();return;}
   try{const data=await elevenVoice.readVoice(root,text);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({...data,cached:true}));return;}catch{}
   const key=createHash('sha256').update(JSON.stringify({text,voice:'af_bella',speed:1,model:'kokoro-timestamped-q8',version:1})).digest('hex');
   try{const data=JSON.parse(await readFile(path.join(root,'.cache/speech',key+'.json'),'utf8'));res.setHeader('Content-Type','application/json');res.end(JSON.stringify({...data,cached:true}));}
   catch{res.writeHead(404,{'Content-Type':'application/json'}).end(JSON.stringify({error:'Prepared audio or lip-sync data is missing. Return to voice preparation.'}));}return;
  }
  if(url.pathname==='/api/elevenlabs-settings'&&req.method==='POST'){
   let body='';for await(const chunk of req){body+=chunk;if(body.length>4000){res.writeHead(413).end();return;}}
   const {apiKey,voiceId}=JSON.parse(body);await elevenVoice.configure(root,apiKey,voiceId);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({connected:true}));return;
  }
  if(url.pathname==='/api/authoring-speech'&&req.method==='POST'){
   if(req.headers.origin&&!allowedOrigins.includes(req.headers.origin)){res.writeHead(403).end();return;}
   let body='';for await(const chunk of req){body+=chunk;if(body.length>6000){res.writeHead(413).end();return;}}
   const {text}=JSON.parse(body);if(typeof text!=='string'||!text.trim()||text.length>600){res.writeHead(400).end('Invalid narration clip');return;}
   const result=await elevenVoice.generateVoice(root,text);
   const hash=result.key;
   await mkdir(path.join(root,'.cache/authoring-audio'),{recursive:true});
   await writeFile(path.join(root,'.cache/authoring-audio',hash+'.mp3'),Buffer.from(result.audio,'base64'));
   res.setHeader('Content-Type','application/json');res.end(JSON.stringify({url:'/authoring-audio/'+hash+'.mp3',cached:result.cached,voiceProfile:{provider:'elevenlabs',voiceId:result.voice,model:result.model,settings:result.settings||{}}}));return;
  }
  if(/^\/authoring-audio\/[a-f0-9]{64}\.(wav|mp3)$/.test(url.pathname)){
   const audio=await readFile(path.join(root,'.cache',url.pathname.slice(1)));res.writeHead(200,{'Content-Type':url.pathname.endsWith('.mp3')?'audio/mpeg':'audio/wav','Content-Length':audio.length});res.end(audio);return;
  }
  if(url.pathname==='/api/speech'&&req.method==='POST'){
   if(req.headers.origin&&!allowedOrigins.includes(req.headers.origin)){res.writeHead(403).end();return;}
   let body='';for await(const chunk of req){body+=chunk;if(body.length>1024){res.writeHead(413).end();return;}}
   const {segmentId}=JSON.parse(body);const segment=lecture.segments.find(s=>s.id===segmentId)||feedbackSegments.get(segmentId);
   if(!segment||segment.expires<Date.now()||(segment.owner&&segment.owner!==user.id)){res.writeHead(400).end('Unknown segment');return;}
   const result=segment.id.startsWith('feedback-')?await replySpeech({root,text:segment.text,profile:segment.profile,signal:AbortSignal.timeout(45000),fallback:text=>synthesize({id:segment.id,text})}):await synthesize(segment);res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));return;
  }
  let relative=decodeURIComponent(url.pathname).replace(/^\//,'')||'index.html';
  const allowed=publicFiles.has(relative)||relative.startsWith('assets/')||relative==='node_modules/livekit-client/dist/livekit-client.umd.js'||relative.startsWith('node_modules/three/')||relative.startsWith('node_modules/@met4citizen/talkinghead/');
  const staticRoot=relative.startsWith('node_modules/')?root:path.join(root,'public');
  const filename=path.resolve(staticRoot,relative);
  if(relative.split('/').includes('..')||!allowed||!filename.startsWith(root)||!(await stat(filename)).isFile()){res.writeHead(404).end('Not found');return;}
  res.setHeader('Content-Type',types[path.extname(filename)]||'application/octet-stream');res.setHeader('Cache-Control','no-cache');res.end(await readFile(filename));
 }catch(error){res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:error.message}));}
});
server.listen(port,'127.0.0.1',()=>console.log('Ultra: http://127.0.0.1:'+port));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await liveAvatar.close();ultraAgent.close();worker?.terminate();server.close();process.exit(0);});
