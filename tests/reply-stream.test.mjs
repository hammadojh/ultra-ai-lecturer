import test from 'node:test';
import assert from 'node:assert/strict';
import {sentenceEmitter,partialReplyText,generateFeedback} from '../src/server/feedback.mjs';
import {streamReply,readReplyEvents} from '../public/reply-stream.mjs';
import {replySpeech,voiceProfile,publishedVoiceProfile} from '../src/server/reply-voice.mjs';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

test('incremental JSON emits complete sentences once without exposing metadata',()=>{
 const text='Omar, use "two". Then multiply 7.5 by two. That gives fifteen.';
 const json=JSON.stringify({text,addressedIds:['m1'],deferredIds:[]}),out=[],e=sentenceEmitter(s=>out.push(s));
 for(let i=1;i<=json.length;i++)e.push(json.slice(0,i));e.finish(text);
 assert.deepEqual(out,['Omar, use "two".','Then multiply 7.5 by two.','That gives fifteen.']);
 assert.equal(partialReplyText('{"text":"Hi \\u06'),'Hi ');
 assert.equal(partialReplyText('{"text":"Hi \\u0627'),'Hi ا');
});
test('first audio arrives before generation completes and coverage remains final',async()=>{
 const events=[];let release;const wait=new Promise(r=>release=r);
 const p=streamReply({generate:async emit=>{emit('First sentence.');await wait;emit('Second sentence.');return {text:'First sentence. Second sentence.',addressedIds:['m1'],deferredIds:[]};},speak:async text=>({audio:text}),emit:e=>{events.push(e);if(e.type==='audio')release();}});
 await p;assert.ok(events.findIndex(e=>e.type==='audio')<events.findIndex(e=>e.type==='answer'));assert.equal(events.at(-1).type,'done');assert.deepEqual(events.filter(e=>e.type==='audio').map(e=>e.index),[0,1]);
});
test('both voice failures preserve the completed text answer',async()=>{
 const events=[];await streamReply({generate:async emit=>{emit('Answer.');return {text:'Answer.'};},speak:async()=>{throw Error('Both unavailable');},emit:e=>events.push(e)});
 assert.ok(events.some(e=>e.type==='speech-error'));assert.equal(events.find(e=>e.type==='answer').text,'Answer.');assert.equal(events.at(-1).type,'done');
});
test('split transport events preserve unicode and reject truncated completion',async()=>{
 const bytes=new TextEncoder().encode('{"type":"text","text":"عمر"}\n{"type":"done"}\n');const out=[];
 await readReplyEvents(new ReadableStream({start(c){for(const b of bytes)c.enqueue(new Uint8Array([b]));c.close();}}),e=>out.push(e));assert.equal(out[0].text,'عمر');
 await assert.rejects(readReplyEvents(new Response('{"type":"text"}\n').body,()=>{}),/interrupted/);
});
test('follow-up prompt includes actual earlier student questions',async()=>{
 await generateFeedback([{id:'m1',kind:'question',text:'Why?'}],[{questions:['What is doubling?'],reply:'Multiply by two.'}],undefined,'question',null,async req=>{assert.deepEqual(JSON.parse(req.input).previousLecturerReplies[0].questions,['What is doubling?']);return JSON.stringify({text:'Omar, the rule doubles the input.',addressedIds:['m1'],deferredIds:[]});});
});
test('saved profile overrides current default and ElevenLabs errors use Kokoro',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'reply-voice-'));try{
 await mkdir(path.join(root,'.cache'));await writeFile(path.join(root,'.cache/elevenlabs.json'),JSON.stringify({apiKey:'test-only',voiceId:'default'}));
 const profile={provider:'elevenlabs',voiceId:'lectureVoice',model:'eleven_flash_v2_5',settings:{speed:1}};
 let calls=0;const result=await replySpeech({root,text:'Hi',profile,request:async(url,init)=>{calls++;assert.match(url,/lectureVoice/);assert.equal(JSON.parse(init.body).model_id,profile.model);return new Response('failed',{status:503});},fallback:async()=>({audio:'local',words:['Hi'],wtimes:[0],wdurations:[100]})});
 assert.equal(calls,1);assert.equal(result.provider,'kokoro');assert.equal(result.audio,'local');assert.equal(result.fallback,true);
 const good=await replySpeech({root,text:'Hi',profile,request:async()=>Response.json({audio_base64:'mp3',alignment:{characters:['H','i'],character_start_times_seconds:[0,.1],character_end_times_seconds:[.1,.2]}}),fallback:async()=>{throw Error('Unexpected fallback');}});assert.equal(good.voice,'lectureVoice');assert.deepEqual(good.words,['Hi']);
 assert.deepEqual(await publishedVoiceProfile(root,{voice:{clips:[{voiceProfile:profile}]}}),profile);
 const abort=new AbortController();abort.abort();await assert.rejects(replySpeech({root,text:'Hi',profile,signal:abort.signal,fallback:async()=>{throw Error('Must not generate fallback after cancellation');}}),{name:'AbortError'});
 }finally{await rm(root,{recursive:true,force:true});}
});
test('published voice profile never carries credentials',()=>{assert.deepEqual(voiceProfile({provider:'elevenlabs',voiceId:'v',model:'eleven_v4',apiKey:'secret',settings:{speed:1,apiKey:'secret'}}),{provider:'elevenlabs',voiceId:'v',model:'eleven_v4',settings:{speed:1}});assert.throws(()=>voiceProfile({provider:'other'}));});
test('invalid final generation cancels queued speech without a done or answer event',async()=>{
 const events=[];await assert.rejects(streamReply({generate:async emit=>{emit('Partial answer.');await new Promise(r=>setTimeout(r,1));throw Error('Invalid coverage');},speak:async(_text,signal)=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true})),emit:e=>events.push(e)}),/Invalid coverage/);
 assert.ok(!events.some(e=>e.type==='done'||e.type==='answer'));
});
test('after speech failure the remaining sentences do not repeat failing providers',async()=>{
 let attempts=0;const events=[];await streamReply({generate:async emit=>{emit('First.');emit('Second.');return {text:'First. Second.'};},speak:async()=>{attempts++;throw Error('Unavailable');},emit:e=>events.push(e)});assert.equal(attempts,1);assert.equal(events.filter(e=>e.type==='speech-error').length,2);
});
