import test from 'node:test';
import assert from 'node:assert/strict';
import {generateFeedback} from '../src/server/feedback.mjs';
const batch=[{id:'m1',kind:'answer',text:'14'}];
test('live feedback uses ChatGPT with grounded instructions, history and truthful metadata',async()=>{
 const signal=new AbortController().signal;
 const result=await generateFeedback(batch,['Earlier reply'],signal,'question',null,async request=>{
  assert.equal(request.model,process.env.ULTRA_CHATGPT_MODEL||'gpt-6.1-sol');
  assert.equal(request.signal,signal);
  assert.match(request.instructions,/APPROVED MATERIAL:/);
  assert.match(request.instructions,/Omar/);
  assert.deepEqual(JSON.parse(request.input),{previousLecturerReplies:['Earlier reply'],pendingMessages:batch});
  return JSON.stringify({text:'Omar, fourteen is correct: seven times two is fourteen.',addressedIds:['m1'],deferredIds:[]});
 });
 assert.equal(result.provider,'chatgpt');
 assert.equal(result.model,process.env.ULTRA_CHATGPT_MODEL||'gpt-6.1-sol');
});
test('ChatGPT failures propagate without a silent local fallback',async()=>{
 await assert.rejects(generateFeedback(batch,[],undefined,'question',null,async()=>{throw Error('Reconnect ChatGPT');}),/Reconnect ChatGPT/);
});
test('ChatGPT output still requires complete message coverage',async()=>{
 await assert.rejects(generateFeedback(batch,[],undefined,'question',null,async()=>JSON.stringify({text:'Omar, correct.',addressedIds:[],deferredIds:[]})),/Invalid message coverage/);
});

test('immediate facilitator feedback accepts a real narration segment without forcing a practice question',async()=>{
 const {lecture}=await import('../public/lecture.mjs');const id=lecture.segments[0].id;
 await assert.rejects(generateFeedback(batch,[],undefined,id),/Invalid checkpoint/);
 const result=await generateFeedback([{id:'m1',kind:'question',text:'What is an input?'}],[],undefined,id,null,async req=>{
  assert.match(req.instructions,/facilitator has invited an immediate raised-hand question/);
  assert.doesNotMatch(req.instructions,/explicitly compare it with fourteen/);
  return JSON.stringify({text:'Omar, an input is the value you give to the function.',addressedIds:['m1'],deferredIds:[]});
 },'Omar',undefined,true);assert.deepEqual(result.addressedIds,['m1']);
 await assert.rejects(generateFeedback(batch,[],undefined,'invented',null,undefined,'Omar',undefined,true),/Invalid checkpoint/);
});
