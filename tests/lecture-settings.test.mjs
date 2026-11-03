import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {zipSync,strToU8} from 'fflate';
import {createLectureSettings,regenerationEstimate} from '../src/server/lecture-settings.mjs';
import {readPackage} from '../src/server/lecture-packages.mjs';
const profile={provider:'elevenlabs',voiceId:'oldVoice',model:'eleven_v4',settings:{stability:.5}};
async function fixture(generate){
 const root=await mkdtemp(path.join(tmpdir(),'lecture-settings-test-')),id='lesson';
 const m={format:'ultra-lecture',version:1,title:'Lesson',article:'article.md',voiceProfile:profile,avatar:'default',slides:[{id:'s',title:'Slide',image:'slide.png'}],segments:[1,2].map(i=>({id:'c'+i,slide:'s',text:'Hello class.',audio:i+'.mp3',duration:2,annotations:[{style:'highlight',x:.1,y:.1,w:.2,h:.2,start:.5,duration:1}]}))};
 const source=zipSync({'lecture.json':strToU8(JSON.stringify(m)),'article.md':strToU8('Source'),'slide.png':new Uint8Array([1]),'1.mp3':new Uint8Array([2]),'2.mp3':new Uint8Array([3])});
 await mkdir(path.join(root,'.cache/published'),{recursive:true});await writeFile(path.join(root,'.cache/published',id+'.json'),JSON.stringify({id,title:'Lesson',publishedAt:'original',voiceProfile:profile,brief:{duration:1},classroom:{segments:m.segments,avatar:'default'}}));
 const dependencies={root,exportLecture:async()=>source,voices:async()=>[{id:'oldVoice',name:'Original'},{id:'newVoice',name:'New'}],duration:async()=>4,generate};
 const service=createLectureSettings(dependencies);
 return {root,id,service,dependencies,cleanup:()=>rm(root,{recursive:true,force:true}),read:async()=>JSON.parse(await readFile(path.join(root,'.cache/published',id+'.json'),'utf8'))};
}
const audio={audio:Buffer.from('test-audio').toString('base64'),words:['Hello','class.'],wtimes:[0,1000],wdurations:[900,900]};
async function finished(service,j){for(let i=0;i<100;i++){const job=await service.getJob(j.token,'lesson');if(job.state!=='generating')return job;await new Promise(r=>setTimeout(r,10));}throw Error('Job timed out');}
test('estimate includes every clip, pricing, and an explicitly bounded time range',()=>{const e=regenerationEstimate([{text:'a'.repeat(1000)},{text:'b'.repeat(1000)}],'eleven_v4');assert.equal(e.characters,2000);assert.equal(e.costUSD,.16);assert.equal(e.clips,2);assert.ok(e.maxMinutes>e.minMinutes);assert.equal(regenerationEstimate([{text:'Hello'}],'unknown').costUSD,null);});
test('avatar-only update generates no audio, preserves voice, and publishes atomically',async()=>{let calls=0;const f=await fixture(async()=>{calls++;return audio;});try{
 const j=await f.service.prepare(f.id,{expectedPublishedAt:'original',avatar:'none',voiceId:'oldVoice'});await finished(f.service,j);assert.equal((await f.read()).classroom.avatar,'default');assert.equal(calls,0);
 await f.service.publish(f.id,j.token,false);const d=await f.read();assert.equal(d.classroom.avatar,'none');assert.deepEqual(d.classroom.voiceProfile,profile);assert.equal(d.id,f.id);
 const m=readPackage(await readFile(path.join(f.root,'.cache/packages',j.token,'package.zip'))).manifest;assert.equal(m.avatar,'none');assert.equal(m.segments[0].audio,'1.mp3');
 }finally{await f.cleanup();}});
test('voice change requires confirmation, regenerates all clips and retimes annotations',async()=>{let calls=0;const f=await fixture(async(text,p)=>{assert.equal(p.voiceId,'newVoice');calls++;return audio;});try{
 const input={expectedPublishedAt:'original',avatar:'default',voiceId:'newVoice'};
 await assert.rejects(f.service.prepare(f.id,input),/Confirm/);
 const j=await f.service.prepare(f.id,{...input,confirmRegeneration:true});const ready=await finished(f.service,j);assert.equal(calls,2);assert.equal(ready.state,'ready');assert.equal((await f.read()).voiceProfile.voiceId,'oldVoice');assert.equal(ready.manifest.segments[0].duration,4);assert.equal(ready.manifest.segments[0].annotations[0].start,1);
 await assert.rejects(f.service.publish(f.id,j.token,false),/Review/);await f.service.publish(f.id,j.token,true);assert.equal((await f.read()).classroom.voiceProfile.voiceId,'newVoice');
 }finally{await f.cleanup();}});
test('failure leaves published lecture untouched and persisted completed clips survive restart',async()=>{let calls=0;const f=await fixture(async()=>{if(++calls===2)throw Error('Provider failed');return audio;});try{
 const j=await f.service.prepare(f.id,{expectedPublishedAt:'original',avatar:'default',voiceId:'newVoice',confirmRegeneration:true});const failed=await finished(f.service,j);assert.equal(failed.state,'failed');assert.equal(failed.completed,1);assert.equal((await f.read()).publishedAt,'original');
 const restarted=createLectureSettings(f.dependencies);assert.equal((await restarted.getJob(j.token,f.id)).completed,1);
 let result;await restarted.api({method:'POST',async *[Symbol.asyncIterator](){yield JSON.stringify({token:j.token});}},{writeHead(){return this;},end(x){result=JSON.parse(x);}},new URL('http://localhost/api/lecture-settings/lesson/retry'));
 assert.ok(!result.error);const ready=await finished(restarted,j);assert.equal(ready.state,'ready');assert.equal(calls,3);
 }finally{await f.cleanup();}});
test('stale lecture and mismatched job cannot overwrite newer publication',async()=>{const f=await fixture(async()=>audio);try{
 await assert.rejects(f.service.prepare(f.id,{expectedPublishedAt:'stale',avatar:'none'}),/changed/);
 const j=await f.service.prepare(f.id,{expectedPublishedAt:'original',avatar:'none'});await finished(f.service,j);await assert.rejects(f.service.getJob(j.token,'another'),/another/);
 const d=await f.read();d.publishedAt='newer';await writeFile(path.join(f.root,'.cache/published',f.id+'.json'),JSON.stringify(d));await assert.rejects(f.service.publish(f.id,j.token,true),/changed/);assert.equal((await f.read()).publishedAt,'newer');
 }finally{await f.cleanup();}});

test('every TalkingHead avatar survives publication and package export without speech generation',async()=>{
 for(const avatar of ['brunette','avaturn','avatarsdk','vroid']){const f=await fixture(async()=>{throw Error('Avatar changes must not regenerate speech');});try{
 const job=await f.service.prepare(f.id,{expectedPublishedAt:'original',avatar,voiceId:'oldVoice'});assert.equal((await finished(f.service,job)).state,'ready');await f.service.publish(f.id,job.token,false);assert.equal((await f.read()).classroom.avatar,avatar);
 assert.equal(readPackage(await readFile(path.join(f.root,'.cache/packages',job.token,'package.zip'))).manifest.avatar,avatar);
 }finally{await f.cleanup();}}
});
