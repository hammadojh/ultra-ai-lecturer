import test from 'node:test';
import assert from 'node:assert/strict';
import {imageBounds,normalizedPoint,annotationActive,annotationKey} from '../annotations.mjs';
test('annotation coordinates account for letterboxing and resizing',()=>{const b=imageBounds(1000,600,1600,900);assert.equal(b.y,18.75);assert.deepEqual(normalizedPoint(500,300,b),{x:.5,y:.5});assert.deepEqual(normalizedPoint(-1,-1,b),{x:0,y:0});});
test('annotations appear only within their audio time window',()=>{const a={start:2,duration:3};assert.equal(annotationActive(a,1),false);assert.equal(annotationActive(a,2),true);assert.equal(annotationActive(a,4.99),true);assert.equal(annotationActive(a,5),false);});
test('changed instructions or narration never reuse old annotations',()=>{const d={presentation:{sourceId:'s'},direction:{markdown:'v1'}},c={id:'clip-1',text:'hello'};const key=annotationKey(d,c,1);assert.notEqual(key,annotationKey(d,c,2));assert.notEqual(key,annotationKey(d,{...c,text:'changed'},1));d.direction.markdown='v2';assert.notEqual(key,annotationKey(d,c,1));});

test('legacy annotation keys migrate without losing marks, progress or approval',async()=>{
 const {compactAnnotations,readAuthoringDrafts}=await import('../annotations.mjs');
 const d={presentation:{sourceId:'s',mode:'generated'},direction:{input:'slides'.repeat(50000),markdown:'script'},annotationsApproved:'approved'};
 const c={id:'clip-1',text:'hello'},legacy=JSON.stringify(['s',d.direction.input,'script',c.id,c.text,1]),marks=[{style:'highlight',start:1,duration:2}];
 d.annotations={[legacy]:marks};d.annotationGeneration={[legacy]:{model:'test'}};
 const raw=JSON.stringify([d]);const [loaded]=readAuthoringDrafts({getItem:()=>raw});const key=annotationKey(loaded,c,1);
 assert.ok(key.length<50);assert.deepEqual(loaded.annotations[key],marks);assert.equal(loaded.annotationGeneration[key].model,'test');assert.equal(loaded.annotationsApproved,'approved');assert.equal(Object.keys(loaded.annotations).length,1);
 const once=JSON.stringify(loaded);compactAnnotations(loaded);assert.equal(JSON.stringify(loaded),once);assert.ok(once.length<raw.length/2);
});
