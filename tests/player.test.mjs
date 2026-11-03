import test from 'node:test';
import assert from 'node:assert/strict';
import { LecturePlayer } from '../public/player.mjs';
import { lecture } from '../public/lecture.mjs';
test('pause preserves exact position and resume consumes only new time',()=>{
 const p=new LecturePlayer(lecture.segments);p.play();p.tick(2.5);p.pause();p.tick(100);
 assert.equal(p.elapsed,2.5);p.play();p.tick(2);assert.equal(p.elapsed,4.5);assert.equal(p.segment.id,'goals-input');
});
test('activity discards excess time and resumes at the answer exactly once',()=>{
 const p=new LecturePlayer(lecture.segments);p.play();p.tick(100);
 assert.equal(p.state,'activity');assert.equal(p.elapsed,36);p.tick(5);assert.equal(p.elapsed,36);assert.equal(p.answerRemaining,25);
 p.continue();assert.equal(p.segment.id,'answer');assert.equal(p.offset,0);p.continue();assert.equal(p.segment.id,'answer');
 p.tick(11);assert.equal(p.state,'completed');assert.equal(p.elapsed,47);p.tick(100);assert.equal(p.elapsed,47);
});
test('seek pauses at slide boundary; restart clears playback state',()=>{
 const p=new LecturePlayer(lecture.segments);p.play();p.tick(20);p.seekSlide('practice');
 assert.equal(p.state,'paused');assert.equal(p.elapsed,31);p.restart();assert.equal(p.state,'ready');assert.equal(p.elapsed,0);
});
test('approved content has valid references and unique ids',()=>{
 assert.equal(new Set(lecture.segments.map(s=>s.id)).size,lecture.segments.length);
 for(const s of lecture.segments){const slide=lecture.slides.find(x=>x.id===s.slide);assert.ok(slide);for(const target of [s.highlight,s.reveal].filter(Boolean))assert.ok(slide.html.includes(`id="${target}"`));}
});

test('answer timeout resumes at answer with no spillover; reset clears timer',()=>{
 const p=new LecturePlayer(lecture.segments);p.play();p.tick(100);assert.equal(p.answerRemaining,30);
 p.tick(29);assert.equal(p.state,'activity');assert.equal(p.answerRemaining,1);
 p.tick(8);assert.equal(p.segment.id,'answer');assert.equal(p.offset,0);assert.equal(p.state,'playing');
 p.restart();assert.equal(p.answerRemaining,0);
});

test('custom activity timer extends without moving the narration and skip opens feedback',()=>{
 const p=new LecturePlayer([{id:'task',slide:'one',duration:1,holdAfter:true,answerSeconds:75},{id:'next',slide:'two',duration:2}],{checkpoints:true});
 assert.equal(p.extendActivity(),false);p.play();p.tick(1);p.tick(5);assert.equal(p.answerRemaining,70);
 assert.equal(p.extendActivity(30),true);assert.equal(p.answerRemaining,100);assert.equal(p.index,0);
 assert.equal(p.extendActivity(-1),false);p.completeAnswers();assert.equal(p.state,'discussion');p.continue();assert.equal(p.segment.id,'next');
});

test('facilitator interruption resumes the exact narration position and prior state',()=>{
 for(const state of ['playing','paused','ready','completed']){
  const p=new LecturePlayer(lecture.segments,{checkpoints:true});p.state=state;p.offset=2.25;
  assert.equal(p.interruptForDiscussion(),true);assert.equal(p.state,'discussion');assert.equal(p.interruptForDiscussion(),false);
  p.tick(20);p.continue();assert.equal(p.state,state);assert.equal(p.offset,2.25);assert.equal(p.index,0);assert.equal(p.interruption,null);
 }
});
test('facilitator question freezes activity time and restart discards the resume point',()=>{
 const p=new LecturePlayer(lecture.segments,{checkpoints:true});p.play();p.tick(100);p.tick(7);const remaining=p.answerRemaining;
 p.interruptForDiscussion();p.tick(99);p.continue();assert.equal(p.state,'activity');assert.equal(p.answerRemaining,remaining);
 p.interruptForDiscussion();p.restart();assert.equal(p.interruption,null);assert.equal(p.state,'ready');
});
