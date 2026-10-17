import test from 'node:test';
import assert from 'node:assert/strict';
import {validateGeneratedAnnotations} from '../annotation-generation.mjs';
const a={style:'highlight',x:.1,y:.2,w:.3,h:.1,startWord:1,endWord:4};
test('valid AI targets include empty results for slides without relevant targets',()=>{assert.ok(validateGeneratedAnnotations({annotations:[a]},5));assert.ok(validateGeneratedAnnotations({annotations:[]},5));});
test('rejects off-slide boxes and fabricated word indices',()=>{for(const changes of [{x:-.1},{w:1},{startWord:-1},{endWord:5},{endWord:0},{style:'fake'}])assert.throws(()=>validateGeneratedAnnotations({annotations:[{...a,...changes}]},5));});
