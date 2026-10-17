import test from 'node:test';
import assert from 'node:assert/strict';
import {planInput,validatePlan,planMarkdown} from '../planning.mjs';
const draft={approved:'yes',title:'Functions',brief:{audience:'Beginners',duration:10,goals:'Apply doubling'},presentation:{mode:'original',sourceId:'s'},sources:[{id:'s',name:'Slides',text:'[Slide 1] Double seven to get fourteen.'}]};
const plan={outcomes:['Apply doubling'],coreConcepts:['Input and output'],assessment:['Ask for the output of seven'],nextSteps:['Review the rule'],gaps:['Only one example is provided'],sections:[{title:'Final Q&A',minutes:10,approach:'Explain the rule',example:'Seven becomes fourteen',interaction:'Final Q&A',sourceIds:['s']}]};
test('planning requires confirmed setup and rejects excess source text without truncation',()=>{
 assert.throws(()=>planInput({...draft,approved:null}),/Confirm/);
 assert.throws(()=>planInput({...draft,sources:[{id:'s',name:'Long',text:'x'.repeat(50001)}]}),/50,000/);
 assert.equal(planInput(draft).presentation.mode,'original');
});
test('planning rejects invented sources and mismatched duration',()=>{
 const input=planInput(draft);
 assert.throws(()=>validatePlan({...plan,sections:[{...plan.sections[0],sourceIds:['fake']}]},input),/references/);
 assert.throws(()=>validatePlan({...plan,sections:[{...plan.sections[0],minutes:9}]},input),/duration/);
 assert.throws(()=>validatePlan({...plan,sections:[{...plan.sections[0],title:'Review'}]},input),/final Q&A/);
 assert.equal(validatePlan(plan,input),plan);
 assert.match(planMarkdown(plan,input),/Sources: Slides/);
 assert.match(planMarkdown(plan,input),/original slides/);
});
