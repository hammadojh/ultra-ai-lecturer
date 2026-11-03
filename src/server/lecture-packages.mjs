import {avatars} from '../../public/avatar-catalog.mjs';
import {voiceProfile,generationVoiceProfile} from './reply-voice.mjs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {loadImage} from '@napi-rs/canvas';
const execute=promisify(execFile);
import {unzipSync,zipSync,strToU8} from 'fflate';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
const MAX=200*1024*1024;
export const publicationLocks=new Set();
const safe=p=>typeof p==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_./-]*$/.test(p)&&!p.split('/').some(x=>x==='..'||x==='.'||!x);
const fail=m=>{throw Error(m);};
export function readPackage(bytes){
 if(bytes.length>MAX)fail('Package exceeds 200 MB.');
 let count=0,total=0;const names=new Set();
 const files=unzipSync(bytes,{filter:f=>{if(f.name.endsWith('/')){if(!safe(f.name.slice(0,-1)))fail('Unsafe ZIP directory.');return false;}if(names.has(f.name))fail('Duplicate ZIP entry.');names.add(f.name);if(++count>2000||!safe(f.name)||f.originalSize>MAX||(total+=f.originalSize)>MAX)fail('Unsafe ZIP path or package exceeds 200 MB / 2,000 files.');return true;}});
 let m;try{m=JSON.parse(new TextDecoder().decode(files['lecture.json']));}catch{fail('Include a valid lecture.json at the root of the ZIP.');}
 const text=(s,label,max=200000)=>{if(typeof s!=='string'||!s.trim()||s.length>max)fail(label+' is missing or too long.');};
 const ref=(p,ext,label)=>{if(!safe(p)||!ext.test(p)||!files[p]?.length)fail(label+': missing or unsupported file '+p);};
 if(m.format!=='ultra-lecture'||m.version!==1)fail('Expected ultra-lecture format, version 1.');
 text(m.title,'Title',200);text(m.article,'Article path',200);ref(m.article,/\.md$/,'Article');
 if(!Array.isArray(m.slides)||!m.slides.length||m.slides.length>300)fail('Provide 1–300 slides.');
 const ids=new Set();for(const s of m.slides){text(s.id,'Slide ID',80);if(ids.has(s.id))fail('Duplicate slide ID: '+s.id);ids.add(s.id);text(s.title,'Slide title',300);ref(s.image,/\.(png|jpg|jpeg|webp)$/i,'Slide '+s.id);}
 if(!Array.isArray(m.segments)||!m.segments.length||m.segments.length>2000)fail('Provide 1–2,000 narration segments.');
 const segments=new Set();for(const s of m.segments){text(s.id,'Segment ID',80);if(segments.has(s.id))fail('Duplicate segment ID: '+s.id);segments.add(s.id);if(!ids.has(s.slide))fail('Unknown slide in '+s.id);text(s.text,'Narration in '+s.id,10000);if(!Number.isFinite(s.duration)||s.duration<=0||s.duration>3600)fail('Invalid duration in '+s.id);ref(s.audio,/\.(wav|mp3)$/i,'Audio for '+s.id);
 if(s.kind&&!['narration','checkpoint','final_qa'].includes(s.kind))fail('Invalid segment kind.');
 if(s.answerSeconds!==undefined&&(!Number.isFinite(s.answerSeconds)||s.answerSeconds<1||s.answerSeconds>600))fail('Answer time must be 1–600 seconds.');
 if(s.question!==undefined)text(s.question,'Question',10000);
 if(s.words===undefined&&(s.wtimes!==undefined||s.wdurations!==undefined))fail('Supply all word timing arrays together.');
 if(s.words!==undefined){if(!Array.isArray(s.words)||!Array.isArray(s.wtimes)||!Array.isArray(s.wdurations)||s.words.length!==s.wtimes.length||s.words.length!==s.wdurations.length)fail('Word timing arrays must match in '+s.id);s.words.forEach((w,i)=>{if(typeof w!=='string'||!Number.isFinite(s.wtimes[i])||s.wtimes[i]<0||!Number.isFinite(s.wdurations[i])||s.wdurations[i]<0||s.wtimes[i]+s.wdurations[i]>s.duration*1000+100)fail('Invalid word timing in '+s.id);});}
 if(s.annotations!==undefined&&!Array.isArray(s.annotations))fail('Annotations must be an array.');
 for(const a of s.annotations||[]){if(!['highlight','circle','underline'].includes(a.style)||!['x','y','w','h','start','duration'].every(k=>Number.isFinite(a[k]))||a.x<0||a.y<0||a.w<=0||a.h<=0||a.x+a.w>1.001||a.y+a.h>1.001||a.start<0||a.duration<=0||a.start+a.duration>s.duration+.1)fail('Invalid annotation in '+s.id);}}
 if(m.slides.some(s=>!m.segments.some(c=>c.slide===s.id)))fail('Every slide needs at least one narration segment.');
 if(m.avatar&&!avatars.some(a=>a.id===m.avatar))fail('Choose an avatar from the supported catalog.');
 if(m.voiceProfile)m.voiceProfile=voiceProfile(m.voiceProfile);
 else if(files['audio-generation.json']){
  let metadata;try{metadata=JSON.parse(new TextDecoder().decode(files['audio-generation.json']));}catch{fail('Invalid audio-generation.json.');}
  const recovered=generationVoiceProfile(metadata);if(recovered)m.voiceProfile=recovered;
 }
 return {manifest:m,files};
}
export function packageClassroom(m,base,sourceText){return {title:m.title,avatar:m.avatar||'default',voiceProfile:m.voiceProfile||null,sourceText,discussion:{budgetSeconds:90,idleSeconds:30,reserveSeconds:20},slides:m.slides.map(s=>({id:s.id,title:s.title,chapter:s.title,body:'',html:'',image:base+s.image})),segments:m.segments.map(s=>({...s,audioUrl:base+s.audio,prepared:true,holdAfter:s.kind==='checkpoint',finalCheckpoint:s.kind==='final_qa',question:s.question||s.text,answerSeconds:s.answerSeconds||30,annotations:s.annotations||[]}))};}
export async function packageApi(req,res,url,root){
 const send=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
 const dir=path.join(root,'.cache/packages'),pub=path.join(root,'.cache/published');let locked;
 try{
 if(url.pathname==='/api/lecture-packages/validate'&&req.method==='POST'){
 const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>MAX){send(413,{error:'Package exceeds 200 MB.'});return;}chunks.push(c);}
 const bytes=Buffer.concat(chunks),{manifest,files}=readPackage(bytes),token=randomUUID(),folder=path.join(dir,token);await mkdir(folder,{recursive:true});
 for(const [name,data] of Object.entries(files)){const dest=path.join(folder,'files',name);await mkdir(path.dirname(dest),{recursive:true});await writeFile(dest,data);}
 await verifyMedia(folder,manifest);
 await writeFile(path.join(folder,'package.zip'),bytes);await writeFile(path.join(folder,'manifest.json'),JSON.stringify(manifest));
 send(200,{token,title:manifest.title,slides:manifest.slides.length,clips:manifest.segments.length,duration:manifest.segments.reduce((n,s)=>n+s.duration,0),annotations:manifest.segments.reduce((n,s)=>n+(s.annotations?.length||0),0)});return;
 }
 if(url.pathname==='/api/lecture-packages/publish'&&req.method==='POST'){
 let body='';for await(const c of req){body+=c;if(body.length>4096)throw Error('Request too large.');}const {token,replaceId,expectedPublishedAt}=JSON.parse(body);
 if(!/^[0-9a-f-]{36}$/.test(token))throw Error('Validate a package first.');
 const folder=path.join(dir,token),m=JSON.parse(await readFile(path.join(folder,'manifest.json'),'utf8'));
 const id=replaceId||randomUUID();if(!/^[a-zA-Z0-9-]{1,80}$/.test(id))throw Error('Invalid lecture ID.');
 if(publicationLocks.has(id)){send(409,{error:'This lecture is being updated. Try again after it finishes.'});return;}publicationLocks.add(id);locked=id;
 if(replaceId){const old=JSON.parse(await readFile(path.join(pub,id+'.json'),'utf8'));if(old.publishedAt!==expectedPublishedAt){send(409,{error:'This lecture changed. Reload the list before replacing it.'});return;}await mkdir(path.join(root,'.cache/publication-history'),{recursive:true});await writeFile(path.join(root,'.cache/publication-history',id+'-'+randomUUID()+'.json'),JSON.stringify(old));}
 const classroom=packageClassroom(m,'/package-assets/'+token+'/',await readFile(path.join(folder,'files',m.article),'utf8'));classroom.id=id;
 const snapshot={id,title:m.title,publishedAt:new Date().toISOString(),packageToken:token,brief:{duration:Math.ceil(m.segments.reduce((n,s)=>n+s.duration,0)/60)},classroom};
 await mkdir(pub,{recursive:true});const temp=path.join(pub,randomUUID()+'.tmp');await writeFile(temp,JSON.stringify(snapshot));await rename(temp,path.join(pub,id+'.json'));send(200,{id});return;
 }
 send(404,{error:'Not found.'});
 }catch(e){send(422,{error:e.message});}finally{if(locked)publicationLocks.delete(locked);}
}
export {safe as safePackagePath};

export async function audioDuration(file){
 try{const {stdout}=await execute(process.env.ULTRA_FFPROBE||'ffprobe',['-v','error','-protocol_whitelist','file,pipe','-f',file.toLowerCase().endsWith('.wav')?'wav':'mp3','-show_entries','format=duration:stream=codec_type','-of','json',file],{timeout:15000,maxBuffer:100000});const data=JSON.parse(stdout),duration=Number(data.format?.duration);if(!data.streams?.some(s=>s.codec_type==='audio')||!Number.isFinite(duration)||duration<=0)throw Error('No audio');return duration;}catch(e){throw Error(e.code==='ENOENT'?'Audio validation requires ffprobe on the server.':'Unreadable audio: '+path.basename(file));}
}
export async function verifyMedia(folder,m){
 for(const s of m.slides){let image;try{const bytes=await readFile(path.join(folder,'files',s.image));const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),jpg=bytes[0]===255&&bytes[1]===216,webp=bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';if(!png&&!jpg&&!webp)throw Error('Unsupported image');image=await loadImage(bytes);}catch{throw Error('Unreadable slide image: '+s.image);}if(image.width>8192||image.height>8192)throw Error('Slide images must be no larger than 8192 pixels per side.');}
 for(const s of m.segments){const actual=await audioDuration(path.join(folder,'files',s.audio));if(Math.abs(actual-s.duration)>Math.max(.25,actual*.02))throw Error('Duration mismatch for '+s.id+': manifest '+s.duration+'s, audio '+actual.toFixed(2)+'s. Update lecture.json.');}
}

export async function exportPackage(root,d,lecture){
 if(d.packageToken)return readFile(path.join(root,'.cache/packages',d.packageToken,'package.zip'));
 const files={};const m={format:'ultra-lecture',version:1,title:d.title,article:'article.md',avatar:'default',slides:[],segments:[]};
 if(lecture.voiceProfile||d.voiceProfile)m.voiceProfile=voiceProfile(lecture.voiceProfile||d.voiceProfile);
 files['article.md']=strToU8(lecture.sourceText||d.title);
 // Keep editable legacy material alongside the portable classroom format.
 for(const [name,value] of Object.entries({'plan.md':d.plan?.markdown,'script.md':d.script?.markdown,'direction.md':d.direction?.markdown}))if(value)files[name]=strToU8(value);
 files['legacy-authoring.json']=strToU8(JSON.stringify(d,null,2));
 for(const [i,s] of lecture.slides.entries()){
 if(!/^\/imports\/[0-9a-f-]{36}\/\d+\.(png|jpg|jpeg|webp)$/.test(s.image))throw Error('This legacy lecture needs slide rendering before it can be exported.');
 const filename='slides/'+(i+1)+path.extname(s.image);files[filename]=await readFile(path.join(root,'.cache',s.image.slice(1)));m.slides.push({id:s.id,title:s.title||'Slide '+(i+1),image:filename});}
 const {readVoice}=await import('./eleven-voice.mjs');const {createHash}=await import('node:crypto');
 for(const [i,s] of lecture.segments.entries()){
 let audio;try{audio=await readVoice(root,s.text);}catch{const key=createHash('sha256').update(JSON.stringify({text:s.text,voice:'af_bella',speed:1,model:'kokoro-timestamped-q8',version:1})).digest('hex');try{audio=JSON.parse(await readFile(path.join(root,'.cache/speech',key+'.json'),'utf8'));}catch{if(/^\/authoring-audio\/[a-f0-9]+\.(mp3|wav)$/.test(s.url||'')){audio={audio:(await readFile(path.join(root,'.cache',s.url.slice(1)))).toString('base64')};}else throw Error('Prepared voice is missing for clip '+(i+1)+'. Restore it before exporting.');}}
 const bytes=Buffer.from(audio.audio,'base64'),filename='audio/'+(i+1)+(bytes.toString('ascii',0,4)==='RIFF'?'.wav':'.mp3');files[filename]=bytes;
 const probeDir=path.join(root,'.cache/package-export');await mkdir(probeDir,{recursive:true});const probeFile=path.join(probeDir,randomUUID()+path.extname(filename));await writeFile(probeFile,bytes);let measured;try{measured=await audioDuration(probeFile);}finally{await (await import('node:fs/promises')).rm(probeFile,{force:true});}
 m.segments.push({id:s.id,slide:s.slide,text:s.text,duration:measured,audio:filename,kind:s.finalCheckpoint?'final_qa':s.holdAfter?'checkpoint':'narration',...(s.holdAfter?{answerSeconds:s.answerSeconds??30}:{}),annotations:s.annotations||[],...(audio.words?{words:audio.words,wtimes:audio.wtimes,wdurations:audio.wdurations}:{})});}
 files['lecture.json']=strToU8(JSON.stringify(m,null,2));const zip=zipSync(files);readPackage(zip);return zip;
}
