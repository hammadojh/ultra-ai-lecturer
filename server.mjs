import http from 'node:http';
import { Worker } from 'node:worker_threads';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { lecture } from './lecture.mjs';
const root=fileURLToPath(new URL('.',import.meta.url));
const pending=new Map();let worker, failure, ready=false, loading=0;
const inflight=new Map();
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
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary','.wasm':'application/wasm','.png':'image/png','.jpg':'image/jpeg'};
const publicFiles=new Set(['index.html','app.js','style.css','lecture.mjs','player.mjs','presenter.mjs']);
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname==='/api/voice-status'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ready,loading,error:failure||null}));return;}
  if(url.pathname==='/api/speech'&&req.method==='POST'){
   if(req.headers.origin&&!['http://127.0.0.1:4173','http://localhost:4173'].includes(req.headers.origin)){res.writeHead(403).end();return;}
   let body='';for await(const chunk of req){body+=chunk;if(body.length>1024){res.writeHead(413).end();return;}}
   const {segmentId}=JSON.parse(body);const segment=lecture.segments.find(s=>s.id===segmentId);
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
