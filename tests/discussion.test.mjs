import test from 'node:test';
import assert from 'node:assert/strict';
import { Discussion } from '../discussion.mjs';
import { validateBatch,validateResponse } from '../feedback.mjs';
import { LecturePlayer } from '../player.mjs';
import { lecture } from '../lecture.mjs';
test('new messages never interrupt selected batch; coverage commits after delivery',()=>{
 const d=new Discussion();const a=d.add('9','answer');d.start();assert.equal(d.select().length,1);
 const b=d.add('Why multiply?');assert.equal(d.state,'reviewing');assert.equal(a.status,'selected');
 d.accept({addressedIds:[a.id],deferredIds:[]});assert.equal(a.status,'selected');
 d.delivered('Multiply seven by two.');assert.equal(a.status,'addressed');assert.equal(b.status,'queued');assert.equal(d.select()[0].id,b.id);
});
test('empty checkpoint follows idle timeout; continual arrivals cannot exceed budget',()=>{
 const d=new Discussion({budgetSeconds:30,idleSeconds:5,reserveSeconds:10});d.start();d.tick(5);assert.equal(d.state,'closed');
 d.reset();d.add('Question');d.start();d.select();d.tick(30);assert.equal(d.state,'closed');assert.equal(d.messages[0].status,'deferred');
});
test('spoken response finishes naturally at time limit',()=>{
 const d=new Discussion();const a=d.add('14','answer');d.start();d.select();d.accept({addressedIds:[a.id],deferredIds:[]});d.tick(100);assert.equal(d.state,'speaking');d.delivered('Correct.');assert.equal(d.state,'closed');assert.equal(a.status,'addressed');
});
test('failure keeps messages deferred rather than addressed',()=>{
 const d=new Discussion();d.add('Question');d.start();d.select();d.fail('Model unavailable');assert.equal(d.messages[0].status,'deferred');
});
test('checkpoint mode saves the exact resume segment',()=>{
 const p=new LecturePlayer(lecture.segments,{checkpoints:true});p.play();p.tick(100);p.tick(30);assert.equal(p.state,'discussion');assert.equal(p.segment.id,'question');p.tick(10);assert.equal(p.segment.id,'question');p.continue();assert.equal(p.segment.id,'answer');assert.equal(p.offset,0);
});
test('response contract covers every ID once and rejects invented coverage',()=>{
 const batch=validateBatch([{id:'m1',kind:'answer',text:'9'},{id:'m2',kind:'question',text:'What is an input?'}]);
 assert.throws(()=>validateResponse({text:'Fourteen.',addressedIds:['m1'],deferredIds:[]},batch));
 assert.throws(()=>validateResponse({text:'Fourteen.',addressedIds:['m1','fake'],deferredIds:[]},batch));
 assert.throws(()=>validateBatch([{id:'m1',text:'hi',kind:'invalid'}]));
 assert.equal(validateResponse({text:'Fourteen.',addressedIds:['m1'],deferredIds:['m2']},batch).deferredIds[0],'m2');
});

test('all answers received opens discussion immediately without skipping feedback',()=>{
 const p=new LecturePlayer(lecture.segments,{checkpoints:true});p.play();p.tick(100);
 assert.equal(p.state,'activity');assert.ok(p.answerRemaining>0);
 p.completeAnswers();assert.equal(p.state,'discussion');assert.equal(p.answerRemaining,0);assert.equal(p.segment.id,'question');
 p.completeAnswers();assert.equal(p.state,'discussion');
 p.continue();assert.equal(p.segment.id,'answer');
});
test('typing holds the countdown and inactivity releases the lecturer',()=>{
 const d=new Discussion();d.start();d.tick(10);d.typing(true);d.tick(15);
 assert.equal(d.state,'followup');assert.equal(d.idle,2);
 d.typing(true);d.tick(19);assert.equal(d.state,'followup');d.tick(1);assert.equal(d.state,'closed');
});
test('final checkpoint revisits deferred messages and stays open across responses',()=>{
 const d=new Discussion();const m=d.add('Question');d.start();d.close();d.start({final:true});
 assert.equal(m.status,'queued');d.select();d.tick(120);assert.equal(d.state,'reviewing');
 d.accept({addressedIds:[m.id],deferredIds:[]});d.delivered('Answer');assert.equal(d.idle,30);
 const p=new LecturePlayer(lecture.segments,{checkpoints:true});p.index=p.segments.length-1;p.play();p.tick(100);
 assert.equal(p.state,'discussion');p.continue();assert.equal(p.state,'completed');
});
