import test from 'node:test';
import assert from 'node:assert/strict';
import {scriptInput,validateScript,scriptMarkdown,fitScriptTiming} from '../src/server/scripting.mjs';
const draft={approved:'yes',title:'Functions',brief:{audience:'Beginners',goals:'Identify inputs',duration:5},sources:[{id:'s1',name:'Source',text:'Double 7 to get 14.'}],plan:{approved:'yes',markdown:'Teach functions, then Q&A.'}};
draft.plan.input=JSON.stringify({title:draft.title,brief:draft.brief,presentation:draft.presentation,ai:{provider:'local'},sources:draft.sources});
const segment={title:'Final Q&A',seconds:300,kind:'final_qa',say:'What questions remain?',show:'Summary',actions:'Wait for questions.',sourceIds:['s1']};
test('requires approved plan and setup',()=>{assert.throws(()=>scriptInput({...draft,plan:{markdown:'draft'}}),/Approve/);assert.throws(()=>scriptInput({...draft,approved:null}),/Confirm/);assert.throws(()=>scriptInput({...draft,title:'Changed'}),/out of date/);assert.equal(scriptInput(draft).approvedPlan,draft.plan.markdown);});
test('script rejects invented sources, incorrect timing and missing final checkpoint',()=>{const input=scriptInput(draft);for(const changes of [{sourceIds:['invented']},{seconds:299},{kind:'narration'}])assert.throws(()=>validateScript({segments:[{...segment,...changes}]},input));assert.ok(validateScript({segments:[segment]},input));});
test('Markdown includes cumulative times and say/show/do blocks',()=>{const md=scriptMarkdown({segments:[{...segment,seconds:60,kind:'narration'},{...segment,seconds:240}]},scriptInput(draft));assert.match(md,/00:00–01:00/);assert.match(md,/01:00–05:00/);for(const heading of ['Say','Show','Do'])assert.ok(md.includes('### '+heading));assert.match(md,/Sources: Source/);});

test('fits proposed timing deterministically without dropping segments',()=>{const result=fitScriptTiming({segments:[{...segment,seconds:100},{...segment,seconds:150}]},300);assert.equal(result.segments.reduce((n,s)=>n+s.seconds,0),300);assert.equal(result.segments.length,2);assert.ok(result.segments.every(s=>s.seconds>0));});

test('custom checkpoint time survives script and presenter instructions into playback',async()=>{
 const {scriptSegments,directorMarkdown}=await import('../src/server/directing.mjs');
 const {classroomLecture}=await import('../public/classroom-lecture.mjs');
 const script={segments:[{...segment,kind:'checkpoint',seconds:180,answerSeconds:95},{...segment,seconds:120}]};
 const parsed=scriptSegments(scriptMarkdown(script,scriptInput(draft)));assert.equal(parsed[0].answerSeconds,95);
 const markdown=directorMarkdown(parsed,parsed.map((s,i)=>({segmentId:s.id,slide:i+1,tone:'calm',energy:'low',pointTo:'',delivery:'Slowly'})));
 const d={title:'Test',sources:[],presentation:{},direction:{markdown},voice:{clips:[{id:'a',section:1,text:'Try this'},{id:'b',section:2,text:'Questions'}]}};
 assert.equal(classroomLecture(d,[{page:1,url:'/1.png'},{page:2,url:'/2.png'}]).segments[0].answerSeconds,95);
});
