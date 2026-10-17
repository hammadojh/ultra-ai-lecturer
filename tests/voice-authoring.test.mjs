import test from 'node:test';
import assert from 'node:assert/strict';
import {narrationClips,voiceFingerprint,voiceReady} from '../voice-authoring.mjs';
test('clips preserve narration and exclude delivery instructions',()=>{const text='Seven doubled is fourteen. '.repeat(45).trim();const clips=narrationClips('### Approved narration — verbatim\n'+text+'\n\n### Delivery\nDo not speak this.');assert.ok(clips.length>1);assert.ok(clips.every(c=>c.text.length<=600));assert.equal(clips.map(c=>c.text).join(' '),text);});
test('empty instructions cannot create a voice set',()=>assert.throws(()=>narrationClips(''),/narration/));
test('approval requires generated clips and current instructions, not review checkboxes',()=>{const d={direction:{markdown:'hello',input:'v1'}};d.voice={input:voiceFingerprint(d),clips:[{url:'/audio.wav',reviewed:false}]};assert.equal(voiceReady(d),true);d.voice.clips.push({url:null,reviewed:false});assert.equal(voiceReady(d),false);d.voice.clips.pop();d.direction.markdown='changed';assert.equal(voiceReady(d),false);});
test('empty voice sets cannot be approved',()=>{const d={direction:{markdown:'hello',input:'v1'}};d.voice={input:voiceFingerprint(d),clips:[]};assert.equal(voiceReady(d),false);});
