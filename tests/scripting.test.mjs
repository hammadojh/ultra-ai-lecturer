import test from 'node:test';
import assert from 'node:assert/strict';
import {scriptInput,validateScript,scriptMarkdown,fitScriptTiming} from '../scripting.mjs';
const draft={approved:'yes',title:'Functions',brief:{audience:'Beginners',goals:'Identify inputs',duration:5},sources:[{id:'s1',name:'Source',text:'Double 7 to get 14.'}],plan:{approved:'yes',markdown:'Teach functions, then Q&A.'}};
draft.plan.input=JSON.stringify({title:draft.title,brief:draft.brief,presentation:draft.presentation,ai:{provider:'local'},sources:draft.sources});
const segment={title:'Final Q&A',seconds:300,kind:'final_qa',say:'What questions remain?',show:'Summary',actions:'Wait for questions.',sourceIds:['s1']};
test('requires approved plan and setup',()=>{assert.throws(()=>scriptInput({...draft,plan:{markdown:'draft'}}),/Approve/);assert.throws(()=>scriptInput({...draft,approved:null}),/Confirm/);assert.throws(()=>scriptInput({...draft,title:'Changed'}),/out of date/);assert.equal(scriptInput(draft).approvedPlan,draft.plan.markdown);});
test('script rejects invented sources, incorrect timing and missing final checkpoint',()=>{const input=scriptInput(draft);for(const changes of [{sourceIds:['invented']},{seconds:299},{kind:'narration'}])assert.throws(()=>validateScript({segments:[{...segment,...changes}]},input));assert.ok(validateScript({segments:[segment]},input));});
test('Markdown includes cumulative times and say/show/do blocks',()=>{const md=scriptMarkdown({segments:[{...segment,seconds:60,kind:'narration'},{...segment,seconds:240}]},scriptInput(draft));assert.match(md,/00:00–01:00/);assert.match(md,/01:00–05:00/);for(const heading of ['Say','Show','Do'])assert.ok(md.includes('### '+heading));assert.match(md,/Sources: Source/);});

test('fits proposed timing deterministically without dropping segments',()=>{const result=fitScriptTiming({segments:[{...segment,seconds:100},{...segment,seconds:150}]},300);assert.equal(result.segments.reduce((n,s)=>n+s.seconds,0),300);assert.equal(result.segments.length,2);assert.ok(result.segments.every(s=>s.seconds>0));});
