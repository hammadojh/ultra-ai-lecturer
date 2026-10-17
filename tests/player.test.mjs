import test from 'node:test';
import assert from 'node:assert/strict';
import { LecturePlayer } from '../player.mjs';
import { lecture } from '../lecture.mjs';
test('pause preserves exact position and resume consumes only new time',()=>{
 const p=new LecturePlayer(lecture.segments);p.play();p.tick(2.5);p.pause();p.tick(100);
 assert.equal(p.elapsed,2.5);p.play();p.tick(2);assert.equal(p.elapsed,4.5);assert.equal(p.segment.id,'goals-input');
});
test('activity discards excess time and resumes at the answer exactly once',()=>{
 const p=new LecturePlayer(lecture.segments);p.play();p.tick(100);
 assert.equal(p.state,'activity');assert.equal(p.elapsed,36);p.tick(50);assert.equal(p.elapsed,36);
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
