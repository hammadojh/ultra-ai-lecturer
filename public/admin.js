import {splitFingerprint,sourceUnits,splitSources,validateSplit} from './lecture-splitting.mjs';
import {readAuthoringDrafts} from './annotations.mjs';
import {presentationFingerprint,slidesFingerprint,slidesReady,approvedVisuals,deckHTML} from './slides.mjs';
let slidesJob=null;
import {startNotificationTask} from './notifications.mjs';
import {narrationClips,voiceFingerprint,voiceReady} from './voice-authoring.mjs';
const visualJobs=new Map();
const slidePreviewObservers=[];
let voiceJob=null;
let directionJob=null;
import {sourceAssets,assetFingerprint,assetsReady} from './assets-client.mjs';
let assetJob=null;
let scriptJob=null;
let openrouterConnection={connected:false},openrouterModels=[];
const $=id=>document.getElementById(id),key='ultra-authoring-v1';
let drafts=[],selected=null,importMetadata=null,importToken=0,editingSource=null,undoState=null,planJob=null,chatgptConnection={connected:false,enabled:false},chatgptModels=[];
try{drafts=readAuthoringDrafts();if(!Array.isArray(drafts))throw Error();selected=drafts.find(d=>d.id===localStorage.getItem(key+'-selected'))?.id||drafts[0]?.id;}catch{$('studio-status').textContent='Saved drafts could not be read. Export any open work before clearing browser storage.';drafts=[];}
const current=()=>drafts.find(d=>d.id===selected);
let backupTimer,backupQueue=Promise.resolve();
function backupSnapshot(){return JSON.stringify({drafts,selected,savedAt:new Date().toISOString()});}
function queueBackup(){
 clearTimeout(backupTimer);const snapshot=backupSnapshot();
 backupQueue=backupQueue.catch(()=>{}).then(async()=>{const r=await fetch('/api/authoring-backup',{method:'PUT',headers:{'Content-Type':'application/json'},body:snapshot});if(!r.ok)throw Error();$('autosave-status').textContent='Saved · browser and local backup · '+new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});}).catch(()=>{$('autosave-status').textContent='Local backup unavailable. Keep this tab open or export your draft.';});
}
function save(){let ok=true;try{localStorage.setItem(key,JSON.stringify(drafts));localStorage.setItem(key+'-selected',selected||'');$('studio-status').textContent='Saved in this browser.';$('autosave-status').textContent='Saved in browser · backing up…';}catch{ok=false;$('studio-status').textContent='Browser storage full. Saving a local backup…';}
 clearTimeout(backupTimer);backupTimer=setTimeout(queueBackup,400);return ok;
}
window.addEventListener('pagehide',()=>{clearTimeout(backupTimer);fetch('/api/authoring-backup',{method:'PUT',headers:{'Content-Type':'application/json'},body:backupSnapshot(),keepalive:true}).catch(()=>{});});

function render(){
 const d=current();$('empty-studio').hidden=!!d;$('editor').hidden=!d;$('draft-list').replaceChildren();
 for(const draft of drafts){const b=document.createElement('button');b.className='draft-link';b.setAttribute('aria-current',draft.id===selected);b.textContent=draft.title||'Untitled lecture';const small=document.createElement('small');small.textContent=draft.approved?'Confirmed':draft.sources.length+' sources · draft';b.append(small);b.onclick=()=>{selected=draft.id;clearImport();save();render();};$('draft-list').append(b);}
 if(!d)return;
 d.presentation??={mode:'generated',sourceId:null};
 d.wizardStep??=d.sources.length?3:2;
 d.brief??={};
 d.brief.audience||='Students new to this topic';
 d.brief.duration||=30;
 d.brief.goals||='Explain the main concepts in the material. Apply them to a practical example. Check understanding with a short question.';
 $('lecture-title').value=d.title;$('draft-status').textContent=d.approved?'Confirmed':'Draft';
 $('sources').replaceChildren();
 for(const source of d.sources){const details=document.createElement('details');details.className='source-card';const summary=document.createElement('summary');summary.textContent=source.name+' · '+source.text.trim().split(/\s+/).length+' words';const pre=document.createElement('pre');pre.textContent=source.text;const edit=document.createElement('button');edit.className='text-button';edit.textContent='Edit source';edit.onclick=()=>{
 clearImport();$('manual-source').open=true;editingSource=source.id;importMetadata=source.import||null;$('source-name').value=source.name;$('source-text').value=source.text;$('source-text').oninput();
 $('source-form').querySelector('button[type=submit]').textContent='Save source';$('cancel-edit').hidden=false;showAssets($('import-assets'),source.import?.assets||[]);$('source-form').scrollIntoView({behavior:'smooth'});};
 const remove=document.createElement('button');remove.className='text-button';remove.textContent='Remove source';remove.onclick=()=>{rememberDeletion({kind:'source',draftId:d.id,source:structuredClone(source),index:d.sources.indexOf(source)});clearImport();d.sources=d.sources.filter(s=>s.id!==source.id);d.approved=null;if(d.plan)d.plan.approved=null;save();render();};details.append(summary,pre);
 if(source.import?.warnings?.length){const note=document.createElement('p');note.className='extraction-note';note.textContent=source.import.warnings.join(' ');details.append(note);}
 details.append(edit,document.createTextNode(' · '),remove);
 const gallery=document.createElement('div');gallery.className='asset-gallery';showAssets(gallery,source.import?.assets||[]);details.append(gallery);
 if(!source.import?.assets&&/\.(pdf|pptx)$/i.test(source.import?.filename||source.name)){const notice=document.createElement('p');notice.className='extraction-note';notice.textContent='This source predates asset extraction. Re-import the original file to add its images and page previews.';details.append(notice);}
 $('sources').append(details);}
 renderWorkflow();restoreSourceBuffer();
}
function clearImport(){importToken++;$('manual-source').open=false;editingSource=null;$('cancel-edit').hidden=true;$('source-form').querySelector('button[type=submit]').textContent='Add source';$('import-assets').replaceChildren();importMetadata=null;$('source-form').reset();$('source-file').value='';$('extraction-status').hidden=true;$('word-count').textContent='0 words';$('source-file').disabled=false;$('source-form').querySelector('button[type=submit]').disabled=false;}
function create(){clearImport();const draft={id:crypto.randomUUID(),title:'New lecture',sources:[],approved:null,wizardStep:2};drafts.unshift(draft);selected=draft.id;save();render();$('step-title').focus();}
$('new-draft').onclick=create;$('first-draft').onclick=create;
$('lecture-title').oninput=()=>{const d=current();d.title=$('lecture-title').value;d.approved=null;if(d.plan)d.plan.approved=null;save();$('draft-status').textContent='Draft';};
$('source-text').oninput=()=>{$('word-count').textContent=($('source-text').value.trim().match(/\S+/g)||[]).length+' words';renderWorkflow();};
$('source-file').onchange=async()=>{
 const file=$('source-file').files[0];if(!file)return;
 const token=++importToken,draftId=selected,status=$('extraction-status');status.hidden=false;
 if(!/\.(txt|md|pdf|pptx)$/i.test(file.name)||file.size>15*1024*1024){status.textContent='Choose TXT, Markdown, PDF or PPTX up to 15 MB. Save older .ppt files as .pptx.';return;}
 $('upload-next').disabled=true;$('source-file').disabled=true;$('source-form').querySelector('button[type=submit]').disabled=true;
 status.classList.add('is-loading');status.textContent='Extracting '+file.name+'…';
 try{
  let extracted;
  if(/\.(pdf|pptx)$/i.test(file.name)){
   const response=await fetch('/api/extract?filename='+encodeURIComponent(file.name),{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:file,signal:AbortSignal.timeout(125000)});
   extracted=await response.json();if(!response.ok)throw Error(extracted.error||'Extraction failed.');
  }else extracted={text:await file.text(),warnings:[],sections:[]};
  if(token!==importToken||draftId!==selected)return;
  if(!extracted.text.trim())throw Error('This file has no readable text.');
  if(extracted.text.length>200000)throw Error('Text exceeds 200,000 characters. Split the file.');
  $('source-name').value=file.name;$('source-text').value=extracted.text;$('source-text').oninput();
  importMetadata={filename:file.name,sections:extracted.sections,warnings:extracted.warnings,assets:extracted.assets||[],originalUrl:extracted.originalUrl,extractedAt:new Date().toISOString()};
  showAssets($('import-assets'),importMetadata.assets);
  if(!editingSource){
   const d=current();d.sources.push({id:crypto.randomUUID(),name:file.name,text:extracted.text,import:importMetadata});
   if(!d.title||d.title==='New lecture')d.title=file.name.replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ');
   d.approved=null;if(d.plan)d.plan.approved=null;clearImport();save();render();
   $('studio-status').textContent='Material added. Continue to lecture details when ready.';return;
  }

  status.textContent=(extracted.sections.length?extracted.sections.length+' pages/slides extracted. ':'Text loaded. ')+extracted.warnings.join(' ')+ ' '+(extracted.assets||[]).filter(a=>a.kind==='image').length+' reusable images; '+(extracted.assets||[]).filter(a=>a.kind==='page').length+' page previews. Review the text and visuals before saving.';
 }catch(error){if(token===importToken)status.textContent=error.name==='TimeoutError'?'Extraction timed out. Try a smaller file.':error.message;}
 finally{status.classList.remove('is-loading');if(token===importToken){$('source-file').disabled=false;$('source-form').querySelector('button[type=submit]').disabled=false;$('source-file').value='';renderWorkflow();}}
};
$('source-form').onsubmit=e=>{
 e.preventDefault();const d=current(),text=$('source-text').value.trim(),name=$('source-name').value.trim();if(!text||!name)return;
 const source={id:editingSource||crypto.randomUUID(),name,text,import:importMetadata};
 if(editingSource)d.sources=d.sources.map(s=>s.id===editingSource?source:s);else d.sources.push(source);
 d.approved=null;if(d.plan)d.plan.approved=null;delete d.sourceBuffer;clearImport();save();render();
};
$('cancel-edit').onclick=()=>{delete current().sourceBuffer;clearImport();save();renderWorkflow();};
$('approve').onclick=()=>{const d=current();if(!validDetails(d))return;d.approved=new Date().toISOString();d.wizardStep=5;save();render();$('step-title').focus();};
$('export').onclick=()=>{const blob=new Blob([JSON.stringify(current(),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='ultra-lecture-draft.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
function showAssets(container,assets){
 container.replaceChildren();if(!assets.length)return;
 const title=document.createElement('p');title.className='asset-summary';title.textContent=assets.filter(a=>a.kind==='image').length+' reusable images · '+assets.filter(a=>a.kind==='page').length+' original pages';container.append(title);
 for(const asset of assets){
  const link=document.createElement('a');link.href=asset.url;link.target='_blank';link.rel='noopener';
  const img=document.createElement('img');img.src=asset.url;img.alt=asset.label;img.loading='lazy';
  const label=document.createElement('span');label.textContent=(asset.kind==='page'?'Original · ':'Image · ')+asset.label;
  link.append(img,label);container.append(link);
 }
}
function validDetails(d){return !!(d.sources.length&&d.title.trim()&&d.brief?.audience?.trim()&&d.brief?.goals?.trim()&&d.brief.duration>=5&&d.brief.duration<=180);}
function go(step){
 const d=current();if(step!==2&&(editingSource||$('source-text').value.trim()||$('source-file').disabled)){$('studio-status').textContent='Save or cancel the source edit before changing steps.';return;}if(step>2&&!d.sources.length)return;if(step>3&&!validDetails(d))return;
 d.wizardStep=step;d.furthestStep=Math.max(d.furthestStep||2,step);save();render();$('step-title').focus();
}
function planFingerprint(d){return JSON.stringify({title:d.title,brief:d.brief,presentation:d.presentation,ai:d.ai||{provider:'local'},sources:d.sources.map(({id,name,text})=>({id,name,text}))});}
function renderPlan(){
 const d=current();if(!d)return;renderModelChoice();const busy=planJob?.id===d.id,stale=d.plan&&d.plan.input!==planFingerprint(d);
 $('generate-plan').disabled=!!planJob||!!scriptJob||!d.approved||(d.ai?.provider==='chatgpt'&&(!chatgptConnection.enabled||!chatgptModels.some(m=>m.id===d.ai.model)))||(d.ai?.provider==='openrouter'&&(!openrouterConnection.connected||!openrouterModels.some(m=>m.id===d.ai.model)));$('generate-plan').textContent=d.sources.reduce((n,s)=>n+s.text.length,0)>50000?'Suggest lecture split with AI':d.plan?'Regenerate plan':'Generate lecture plan';
 renderSplitReview(d);
 $('cancel-plan').hidden=!busy;$('generated-plan').hidden=!d.plan;
 $('generation-status').classList.toggle('is-loading',busy);
 $('generation-status').textContent=busy?'Thinking… building your lecture plan from the confirmed sources. This can take a few minutes.':stale?'Sources or details changed. Confirm setup and regenerate before approving this plan.':d.plan?'Generated with '+d.plan.model+'. Review facts, timing and examples.':d.ai?.provider==='openrouter'?'Choose an OpenRouter model. Generation uses your OpenRouter credits.':d.ai?.provider==='chatgpt'?'Connect your ChatGPT plan and choose an available model.':'Ready to generate using the local AI model.';
 if(d.plan)$('plan-markdown').value=d.plan.markdown;
 $('plan-markdown').disabled=busy;
 $('approve-plan').disabled=!d.plan||stale||busy||!d.approved||!d.plan.markdown.trim()||!!d.plan.approved;
 $('next-script').disabled=!planReady(d)||!!planJob;
 $('plan-approval').textContent=d.plan?.approved&&!stale?'Plan approved. Ready for the presentation-script step.':'';
}
function renderWorkflow(){
 const d=current();if(!d)return;
 renderPlan();renderScript();renderAssets();renderSlides();renderDirection();renderVoice();
 if(d.presentation?.mode==='original'&&d.wizardStep===7){d.wizardStep=8;save();}
 if(d.presentation?.mode!=='original'&&d.wizardStep===8&&!slidesReady(d)){d.wizardStep=10;save();}
 const step=d.wizardStep||2;
 $('slides-stage').hidden=step!==10;$('source-stage').hidden=step!==2;$('details-stage').hidden=step!==3;$('review-stage').hidden=step!==4;$('ready-stage').hidden=step!==5;$('script-stage').hidden=step!==6;$('assets-stage').hidden=step!==7;$('original-ready-stage').hidden=step!==8;$('voice-stage').hidden=step!==9;
 $('original-ready-status').textContent=scriptReady(d)?'Script approved. Ready for detailed presentation instructions.':'Return to the script and approve its current version first.';
 const titles={10:'Create your lecture slides.',9:'Prepare the lecturer voice.',8:'Direct the AI presenter.',7:'Prepare your lecture visuals.',2:'Upload your material.',3:'Fill in the lecture details.',4:'Review your lecture.',6:'Write the presentation script.',5:'Build your lecture plan.'};
 const descriptions={10:'Generate from your approved script and visuals. Review and edit each slide before approving.',9:'Sample the narration, then approve the voice set. Individual clip reviews are optional.',8:'Add timing, delivery and pointing cues to your approved slides.',7:'Describe the essential visuals, then approve the descriptions. Visuals are created alongside the HTML slides.',2:'Add one or more sources. Text and visuals are extracted automatically.',3:'We filled in starting defaults. Adjust them to suit your students.',4:'Check the material and details, then confirm to move on.',6:'Review the timing, exact narration, slide content and presenter actions before approving.',5:'Generate from your confirmed material, review the plan, then approve it.'};
 $('step-kicker').textContent=step>=5?'AUTHORING · '+(step===10?'HTML SLIDES':step===5?'LECTURE PLAN':step===6?'PRESENTATION SCRIPT':step===8?'PRESENTER INSTRUCTIONS':step===9?'VOICE':'ASSETS'):'Lecture setup';
 $('step-title').textContent=titles[step];$('step-description').textContent=descriptions[step];
 document.querySelectorAll('.wizard-steps li').forEach((li,i)=>{li.classList.toggle('complete',i+1<step);if(i+1===Math.min(step,4))li.setAttribute('aria-current','step');else li.removeAttribute('aria-current');});
 document.querySelectorAll('[data-step]').forEach(b=>b.disabled=Number(b.dataset.step)>Math.max(d.furthestStep||step,step)||Number(b.dataset.step)>2&&!d.sources.length||Number(b.dataset.step)>3&&!validDetails(d));
 $('upload-next').disabled=!d.sources.length||$('source-file').disabled||!!editingSource||!!$('source-text').value.trim();
 $('upload-help').textContent=editingSource||$('source-text').value.trim()?'Save or cancel the source you are editing before continuing.':d.sources.length?d.sources.length+' source'+(d.sources.length===1?'':'s')+' added. Ready for lecture details.':'Add at least one source to continue.';
 document.querySelectorAll('[name=presentation-mode]').forEach(r=>r.checked=r.value===d.presentation.mode);
 $('original-options').hidden=d.presentation.mode!=='original';
 const select=$('original-source');select.replaceChildren();const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='Choose your original slides';select.append(placeholder);
 for(const source of d.sources){if(!source.import?.sections?.length)continue;const option=document.createElement('option');option.value=source.id;option.textContent=source.name;select.append(option);}
 select.value=d.presentation.sourceId||'';
 const source=d.sources.find(s=>s.id===d.presentation.sourceId);
 $('original-help').textContent='Your original-slide preference is saved for presentation. You can continue with lecture planning now.';
 $('preview-original').hidden=!source?.import?.originalUrl;if(source?.import?.originalUrl)$('preview-original').href=source.import.originalUrl;
 $('approve').disabled=!validDetails(d);
 $('review-blocker').textContent=validDetails(d)?'':!d.sources.length?'Add source material before confirming.':'Return to Lecture details and complete the title, audience, learning outcomes and a duration between 5 and 180 minutes.';
 $('plan-audience').value=d.brief.audience;$('plan-duration').value=d.brief.duration;$('plan-goals').value=d.brief.goals;
 $('review-summary').replaceChildren();
 const facts={'Title':d.title,'Audience':d.brief.audience,'Duration':d.brief.duration+' minutes','Learning outcomes':d.brief.goals,'Presentation':d.presentation.mode==='original'?'Original slides · '+(source?.name||'Select a source'):'Create new slides from the material'};
 for(const [label,value] of Object.entries(facts)){const term=document.createElement('dt'),description=document.createElement('dd');term.textContent=label;description.textContent=value;$('review-summary').append(term,description);}
 $('review-sources').replaceChildren();
 for(const sourceNode of $('sources').children){const copy=sourceNode.cloneNode(true);copy.querySelectorAll('button').forEach(b=>b.remove());$('review-sources').append(copy);}
}
function captureBrief(){
 const d=current();d.brief={audience:$('plan-audience').value,duration:Number($('plan-duration').value),goals:$('plan-goals').value};d.approved=null;if(d.plan)d.plan.approved=null;save();
}
for(const id of ['plan-audience','plan-duration','plan-goals'])$(id).oninput=captureBrief;
document.querySelectorAll('[name=presentation-mode]').forEach(r=>r.onchange=()=>{captureBrief();const d=current();d.presentation.mode=r.value;if(r.value==='original'&&!d.presentation.sourceId)d.presentation.sourceId=d.sources.find(s=>s.import?.sections?.length)?.id||null;save();renderWorkflow();});
$('original-source').onchange=()=>{captureBrief();current().presentation.sourceId=$('original-source').value;save();renderWorkflow();};
document.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>go(Number(b.dataset.step)));
$('upload-next').onclick=()=>go(3);
$('details-back').onclick=()=>go(2);
$('review-back').onclick=()=>go(3);
$('back-review').onclick=()=>go(4);
$('plan-brief').onsubmit=e=>{e.preventDefault();captureBrief();go(4);};
function rememberDeletion(record){undoState=record;$('undo-delete').hidden=false;}
$('delete-lecture').onclick=()=>{rememberDeletion({kind:'lecture',draft:structuredClone(current()),index:drafts.findIndex(d=>d.id===selected)});clearImport();drafts=drafts.filter(d=>d.id!==selected);selected=drafts[0]?.id;save();render();$('studio-status').textContent='Lecture deleted. You can undo this deletion.';};
$('undo-delete').onclick=()=>{if(!undoState)return;if(undoState.kind==='lecture'){drafts.splice(undoState.index,0,undoState.draft);selected=undoState.draft.id;}
 else{const d=drafts.find(d=>d.id===undoState.draftId);if(d){d.sources.splice(undoState.index,0,undoState.source);d.approved=null;if(d.plan)d.plan.approved=null;selected=d.id;}}undoState=null;$('undo-delete').hidden=true;clearImport();save();render();};
$('generate-plan').onclick=async()=>{
 const d=current();if(!d.approved||planJob||scriptJob)return;
 if(d.sources.reduce((n,s)=>n+s.text.length,0)>50000){await suggestLectureSplit(d);return;}
 const input=planFingerprint(d),controller=new AbortController();planJob={id:d.id,controller};renderPlan();
 const notify=startNotificationTask('Lecture plan');
 try{
  const response=await fetch('/api/plan',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({...JSON.parse(input),approved:d.approved})});
  const result=await response.json();if(!response.ok)throw Error(result.error||'Plan generation failed.');
  if(controller.signal.aborted)return;
  if(!drafts.includes(d)||planFingerprint(d)!==input||!d.approved)throw Error('Setup changed while generating. Confirm it and generate again.');
  d.plan={...result,input,approved:null};save();notify();planJob=null;
  if(current())renderPlan();
 }catch(error){notify(error);planJob=null;if(current()?.id===d.id){renderPlan();$('generation-status').textContent=error.name==='AbortError'?'Generation cancelled. Your existing plan is unchanged.':error.message;}else if(current())renderPlan();}
};
$('cancel-plan').onclick=()=>planJob?.controller.abort();scriptJob?.controller.abort();
$('plan-markdown').oninput=()=>{const d=current();d.plan.markdown=$('plan-markdown').value;d.plan.approved=null;save();$('approve-plan').disabled=!d.approved||d.plan.input!==planFingerprint(d)||!d.plan.markdown.trim();$('plan-approval').textContent='Edited · approval required';};
$('approve-plan').onclick=()=>{const d=current();if(!d.plan||!d.approved||planJob||d.plan.input!==planFingerprint(d)||!d.plan.markdown.trim())return;d.plan.approved=new Date().toISOString();save();renderPlan();};
$('download-plan').onclick=()=>{const url=URL.createObjectURL(new Blob([current().plan.markdown],{type:'text/markdown'})),a=document.createElement('a');a.href=url;a.download='lecture-plan.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
function renderModelChoice(){
 const d=current();if(!d)return;
 $('ai-provider').value=d.ai?.provider||'local';$('cloud-model-choice').hidden=!['chatgpt','openrouter'].includes(d.ai?.provider);
 $('ai-model').replaceChildren();const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='Choose a model';$('ai-model').append(placeholder);
 for(const model of (d.ai?.provider==='openrouter'?openrouterModels:chatgptModels)){const option=document.createElement('option');option.value=model.id;option.textContent=model.name;$('ai-model').append(option);}
 $('ai-model').value=d.ai?.model||'';
 $('model-status').textContent=d.ai?.provider==='openrouter'?(openrouterConnection.connected?'Models supporting structured lecture plans. Uses OpenRouter credits.':'Continue with OpenRouter above.'):chatgptConnection.enabled?'Uses your ChatGPT plan limits. Model availability comes from your account.':'Continue with ChatGPT above and allow plan usage.';
}
async function refreshConnection(){
 try{
  const response=await fetch('/api/chatgpt/status');if(!response.ok)throw Error('Connection status unavailable.');
  chatgptConnection=await response.json();
  $('connection-status').textContent=chatgptConnection.connected?(chatgptConnection.enabled?'Connected':'Connected · plan permission needed')+(chatgptConnection.email?' · '+chatgptConnection.email:''):'Not connected · Local AI is available.';
  $('disconnect-chatgpt').hidden=!chatgptConnection.connected;
  $('connect-chatgpt').textContent=chatgptConnection.connected?'Reconnect with ChatGPT':'Continue with ChatGPT';
  chatgptModels=[];
  if(chatgptConnection.enabled){const response=await fetch('/api/chatgpt/models');const data=await response.json();if(!response.ok)throw Error(data.error||'Could not load models.');chatgptModels=data.models;}
 }catch(error){$('connection-status').textContent=error.message;}
 if(current())renderPlan();
}
$('connect-chatgpt').onclick=async()=>{
 $('connect-chatgpt').disabled=true;
 try{
  const response=await fetch('/api/chatgpt/login',{method:'POST'});const data=await response.json();if(!response.ok)throw Error('Could not start ChatGPT sign-in.');
  const target=new URL(data.url);if(target.origin!=='https://auth.openai.com')throw Error('Invalid sign-in destination.');
  window.location.assign(target.href);
 }catch(error){$('connection-status').textContent=error.message;$('connect-chatgpt').disabled=false;}
};
$('disconnect-chatgpt').onclick=async()=>{
 planJob?.controller.abort();scriptJob?.controller.abort();
 const response=await fetch('/api/chatgpt/logout',{method:'POST'}),result=await response.json();
 await refreshConnection();if(!result.revoked)$('connection-status').textContent='Disconnected locally. Remote revocation was not confirmed; disconnect Ultra in ChatGPT Settings too.';
};
$('ai-provider').onchange=()=>{const d=current();d.ai={provider:$('ai-provider').value,model:''};if(d.plan)d.plan.approved=null;save();renderPlan();};
$('ai-model').onchange=()=>{current().ai={provider:$('ai-provider').value,model:$('ai-model').value};if(current().plan)current().plan.approved=null;save();renderPlan();};
render();
refreshConnection().then(()=>{const result=new URLSearchParams(location.search).get('chatgpt');if(result==='failed')$('connection-status').textContent='ChatGPT sign-in was cancelled, expired or could not be verified. Please try again.';});


async function refreshOpenRouter(){
 try{
  const response=await fetch('/api/openrouter/status');if(!response.ok)throw Error('OpenRouter connection unavailable.');
  openrouterConnection=await response.json();openrouterModels=[];
  $('openrouter-status').textContent=openrouterConnection.connected?'Connected · OpenRouter':'Not connected';
  $('disconnect-openrouter').hidden=!openrouterConnection.connected;
  $('connect-openrouter').textContent=openrouterConnection.connected?'Reconnect with OpenRouter':'Continue with OpenRouter';
  if(openrouterConnection.connected){const r=await fetch('/api/openrouter/models'),data=await r.json();if(!r.ok)throw Error(data.error||'Could not load models.');openrouterModels=data.models;}
 }catch(error){$('openrouter-status').textContent=error.message;}
 if(current())renderPlan();
}
$('connect-openrouter').onclick=async()=>{
 $('connect-openrouter').disabled=true;
 try{const r=await fetch('/api/openrouter/login',{method:'POST'}),data=await r.json();if(!r.ok)throw Error(data.error||'Could not start OpenRouter sign-in.');const url=new URL(data.url);if(url.origin!=='https://openrouter.ai')throw Error('Invalid sign-in destination.');location.assign(url.href);}
 catch(error){$('openrouter-status').textContent=error.message;$('connect-openrouter').disabled=false;}
};
$('disconnect-openrouter').onclick=async()=>{
 planJob?.controller.abort();scriptJob?.controller.abort();
 try{const r=await fetch('/api/openrouter/logout',{method:'POST'});if(!r.ok)throw Error('Disconnect failed. Try again.');await refreshOpenRouter();$('openrouter-status').textContent='Disconnected locally. Revoke the Ultra key in OpenRouter to remove remote access.';}
 catch(error){$('openrouter-status').textContent=error.message;}
};
refreshOpenRouter().then(()=>{if(new URLSearchParams(location.search).get('openrouter')==='failed')$('openrouter-status').textContent='OpenRouter sign-in was cancelled, expired or could not be verified. Please try again.';});

function planReady(d){return !!(d?.approved&&d.plan?.approved&&d.plan.input===planFingerprint(d));}
function scriptFingerprint(d){return JSON.stringify({setup:planFingerprint(d),plan:d.plan?.markdown});}
function renderScript(){
 const d=current();if(!d)return;const busy=scriptJob?.id===d.id,valid=planReady(d),stale=d.script&&d.script.input!==scriptFingerprint(d);
 $('generate-script').disabled=!!scriptJob||!!planJob||!valid;
 $('generate-script').textContent=d.script?'Regenerate script':'Generate presentation script';
 $('cancel-script').hidden=!busy;$('generated-script').hidden=!d.script;
 if(d.script)$('script-markdown').value=d.script.markdown;
 $('script-markdown').disabled=busy;
 $('approve-script').disabled=busy||!valid||!d.script||stale||!d.script.markdown.trim()||!!d.script.approved;
 $('script-status').classList.toggle('is-loading',busy);
 $('script-status').textContent=busy?'Thinking… writing the timed script. This may take a few minutes.':!valid?'Return to the lecture plan and approve its current version first.':stale?'The plan or sources changed. Regenerate this script.':d.script?'Generated with '+d.script.model+'. Review narration, timing and source accuracy.':'Ready to write using your selected planning provider and approved plan.';
 $('next-assets').disabled=!scriptReady(d)||!!scriptJob;
 const original=d.presentation?.mode==='original';
 $('next-assets').textContent=original?'Continue with uploaded slides →':'Next: prepare assets →';
 $('script-next-note').textContent=original?'Using your uploaded slides as-is. Asset preparation and new slide creation are skipped.':'Next after approval: prepare the images, graphs and other visual assets requested by this script.';
 $('script-approval').textContent=d.script?.approved&&!stale&&valid?(original?'Script approved. Ready to continue with your uploaded slides.':'Script approved. Ready for asset preparation.'):'';
}
$('next-script').onclick=()=>{if(planReady(current()))go(6);};
$('back-plan').onclick=()=>go(5);
$('generate-script').onclick=async()=>{
 const d=current();if(!planReady(d)||scriptJob||planJob)return;
 const input=scriptFingerprint(d),controller=new AbortController();scriptJob={id:d.id,controller};renderScript();
 const notify=startNotificationTask('Presentation script');
 try{
  const response=await fetch('/api/script',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({...JSON.parse(planFingerprint(d)),approved:d.approved,plan:d.plan})});
  const result=await response.json();if(!response.ok)throw Error(result.error||'Script generation failed.');
  if(controller.signal.aborted)return;
  if(!drafts.includes(d)||scriptFingerprint(d)!==input||!planReady(d))throw Error('The plan changed during generation. Approve it and try again.');
  d.script={...result,input,approved:null};save();notify();
 }catch(error){notify(error);if(current()?.id===d.id){scriptJob=null;renderScript();$('script-status').textContent=error.name==='AbortError'?'Cancelled. Your existing script is unchanged.':error.message;return;}}
 finally{scriptJob=null;}
 if(current())renderScript();
};
$('cancel-script').onclick=()=>scriptJob?.controller.abort();
$('script-markdown').oninput=()=>{const d=current();d.script.markdown=$('script-markdown').value;d.script.approved=null;save();$('approve-script').disabled=!planReady(d)||d.script.input!==scriptFingerprint(d)||!d.script.markdown.trim();$('script-approval').textContent='Edited · approval required';};
$('approve-script').onclick=()=>{const d=current();if(!planReady(d)||scriptJob||!d.script?.markdown.trim()||d.script.input!==scriptFingerprint(d))return;d.script.approved=new Date().toISOString();save();renderScript();};
$('download-script').onclick=()=>{const url=URL.createObjectURL(new Blob([current().script.markdown],{type:'text/markdown'})),a=document.createElement('a');a.href=url;a.download='presentation-script.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};

function scriptReady(d){return planReady(d)&&!!d.script?.approved&&d.script.input===scriptFingerprint(d);}
function renderAssets(){
 const d=current();if(!d)return;const valid=scriptReady(d),stale=d.assets&&d.assets.input!==assetFingerprint(d),busy=assetJob?.id===d.id;
 $('generate-assets').disabled=!valid||!!assetJob||!!scriptJob||!!planJob;$('cancel-assets').hidden=!busy;
 $('assets-status').classList.toggle('is-loading',busy);$('assets-status').textContent=busy?'Thinking… planning essential visuals.':stale?'Source material changed. Regenerate the descriptions.':'Review the visual descriptions. Images and diagrams will be prepared inside the HTML slides step.';
 $('source-visuals').replaceChildren();$('asset-phase-controls').replaceChildren();$('asset-production-progress').textContent=d.assets?`${d.assets.items.filter(i=>i.status==='reviewed').length} of ${d.assets.items.length} descriptions reviewed`:'';
 $('asset-checklist').replaceChildren();
 for(const item of d.assets?.items||[]){const card=document.createElement('article');card.className='asset-review-card';const title=document.createElement('h4');title.textContent=item.title;const context=document.createElement('p');context.textContent=item.scriptLocation+' · '+item.purpose;const brief=document.createElement('textarea');brief.value=item.brief;brief.rows=3;brief.setAttribute('aria-label','Asset description: '+item.title);brief.disabled=busy;
 brief.oninput=()=>{item.brief=brief.value;item.status='pending';d.assets.approved=null;save();$('approve-assets').disabled=true;$('next-slides').hidden=true;};
 const review=document.createElement('button');review.className='control';review.textContent=item.status==='reviewed'?'✓ Description reviewed':'Keep description';review.disabled=busy||stale||!valid;review.onclick=()=>{if(!item.brief.trim())return;item.status='reviewed';d.assets.approved=null;save();renderAssets();};card.append(title,context,brief,review);$('asset-checklist').append(card);}
 $('approve-assets').hidden=false;$('approve-assets').textContent='Approve asset descriptions';$('approve-assets').disabled=!valid||busy||!assetsReady(d)||!!d.assets?.approved;$('download-assets').hidden=false;$('download-assets').disabled=!d.assets;
 $('assets-approval').textContent=d.assets?.approved&&assetsReady(d)?'Descriptions approved. Create and review the visuals with your slides.':'';$('next-slides').hidden=!(valid&&assetsReady(d)&&d.assets?.approved);
}
$('next-assets').onclick=()=>{if(scriptReady(current()))go(current().presentation?.mode==='original'?8:7);};$('back-script').onclick=()=>go(6);
$('generate-assets').onclick=async()=>{
 const d=current();if(!scriptReady(d)||assetJob||d.presentation?.mode==='original')return;const input=assetFingerprint(d),controller=new AbortController();assetJob={id:d.id,controller};renderAssets();
 const notify=startNotificationTask('Asset preparation');
 try{const response=await fetch('/api/assets',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({title:d.title,brief:d.brief,presentation:d.presentation,ai:d.ai,approved:d.approved,sources:d.sources,plan:d.plan,script:d.script})}),result=await response.json();if(!response.ok)throw Error(result.error||'Asset preparation failed.');if(!drafts.includes(d)||input!==assetFingerprint(d)||!scriptReady(d))throw Error('The script changed. Prepare the checklist again.');d.assets={...result,input,approved:null};save();notify();assetJob=null;renderAssets();}
 catch(error){notify(error);assetJob=null;if(current()?.id===d.id){renderAssets();$('assets-status').textContent=error.name==='AbortError'?'Cancelled. Your previous checklist is unchanged.':error.message;}}
};
$('cancel-assets').onclick=()=>assetJob?.controller.abort();
$('approve-assets').onclick=()=>{const d=current();if(!scriptReady(d)||!assetsReady(d)||assetJob)return;d.assets.approved=new Date().toISOString();save();renderAssets();};
$('download-assets').onclick=()=>{const d=current(),available=sourceAssets(d);const manifest={title:d.title,...d.assets,items:d.assets.items.map(item=>({...item,visual:item.assetId==='upload'?item.upload:available.find(a=>a.id===item.assetId)||null}))};const url=URL.createObjectURL(new Blob([JSON.stringify(manifest,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='lecture-assets.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};

$('original-back-script').onclick=()=>go(current().presentation?.mode==='original'?6:10);

function directionFingerprint(d){return presentationFingerprint(d);}
function renderDirection(){
 const d=current();if(!d)return;const busy=directionJob?.id===d.id,valid=scriptReady(d)&&(d.presentation?.mode==='original'||slidesReady(d)),stale=d.direction&&d.direction.input!==directionFingerprint(d);
 $('generate-direction').disabled=!valid||!!directionJob||!!scriptJob||!!planJob;$('cancel-direction').hidden=!busy;$('generated-direction').hidden=!d.direction;
 if(d.direction)$('direction-markdown').value=d.direction.markdown;$('direction-markdown').disabled=busy;
 $('direction-status').classList.toggle('is-loading',busy);
 $('direction-status').textContent=busy?'Thinking… mapping the script to your slides and adding delivery cues.':!valid?'Approve the current script first.':stale?'The script or original slides changed. Regenerate instructions.':d.direction?'Generated with '+d.direction.model+'. Review slide references, pointing suggestions and delivery.':'Your approved slides stay unchanged. Narration is copied from the approved script.';
 $('approve-direction').disabled=!valid||busy||!d.direction||stale||!d.direction.markdown.trim()||!!d.direction.approved;
 $('next-voice').disabled=!directionReady(d)||!!directionJob;
 $('direction-approval').textContent=valid&&!stale&&d.direction?.approved?'Presenter instructions approved. Ready for modular voice preparation.':'';
}
$('generate-direction').onclick=async()=>{
 const d=current();if(!scriptReady(d)||directionJob)return;const input=directionFingerprint(d),controller=new AbortController();directionJob={id:d.id,controller};renderDirection();
 const notify=startNotificationTask('Presenter instructions');
 try{const r=await fetch('/api/direction',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({title:d.title,brief:d.brief,presentation:d.presentation,ai:d.ai,approved:d.approved,sources:d.sources,plan:d.plan,script:d.script,slides:d.slides,assets:d.assets})}),data=await r.json();if(!r.ok)throw Error(data.error||'Generation failed.');if(!drafts.includes(d)||input!==directionFingerprint(d)||!scriptReady(d))throw Error('The script changed. Generate again.');d.direction={...data,input,approved:null};save();notify();directionJob=null;renderDirection();}
 catch(error){notify(error);directionJob=null;if(current()?.id===d.id){renderDirection();$('direction-status').textContent=error.name==='AbortError'?'Cancelled. Previous instructions are unchanged.':error.message;}}
};
$('cancel-direction').onclick=()=>directionJob?.controller.abort();
$('direction-markdown').oninput=()=>{const d=current();d.direction.markdown=$('direction-markdown').value;d.direction.approved=null;save();$('approve-direction').disabled=!scriptReady(d)||d.direction.input!==directionFingerprint(d)||!d.direction.markdown.trim();$('next-voice').disabled=!directionReady(d)||!!directionJob;
 $('direction-approval').textContent='Edited · approval required';};
$('approve-direction').onclick=()=>{const d=current();if(!scriptReady(d)||directionJob||!d.direction?.markdown.trim()||d.direction.input!==directionFingerprint(d))return;d.direction.approved=new Date().toISOString();save();renderDirection();};
$('download-direction').onclick=()=>{const url=URL.createObjectURL(new Blob([current().direction.markdown],{type:'text/markdown'})),a=document.createElement('a');a.href=url;a.download='presenter-instructions.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};

function directionReady(d){return scriptReady(d)&&(d.presentation?.mode==='original'||slidesReady(d))&&!!d.direction?.approved&&d.direction.input===directionFingerprint(d);}
function renderVoice(){
 const d=current();if(!d)return;const valid=directionReady(d),stale=d.voice&&d.voice.input!==voiceFingerprint(d),busy=voiceJob?.id===d.id;
 const total=d.voice?.clips.length||0,ready=d.voice?.clips.filter(c=>c.url).length||0,reviewed=d.voice?.clips.filter(c=>c.url&&c.reviewed).length||0,complete=total>0&&ready===total&&!stale;
 $('voice-overall-progress').max=total||1;$('voice-overall-progress').value=stale?0:ready;
 $('voice-overall-label').textContent=total?(complete?'All clips generated':ready+' of '+total+' clips generated'):'Voice preparation';
 $('voice-review-count').textContent=total?reviewed+' of '+total+' reviewed (optional)':'';
 $('prepare-voice').disabled=!valid||!!voiceJob||complete;$('stop-voice').hidden=!busy;
 $('prepare-voice').textContent=complete?'✓ All clips generated':busy?'Generating…':d.voice&&!stale?'Resume missing clips':'Prepare voice clips';
 $('voice-build-status').classList.toggle('is-loading',busy);
 $('voice-build-status').textContent=busy?'Preparing clip '+voiceJob.position+' of '+d.voice.clips.length+'…':!valid?'Approve the current presenter instructions first.':stale?'Presenter instructions changed. Prepare the voice set again.':d.voice?d.voice.clips.filter(c=>c.url).length+' of '+d.voice.clips.length+' clips ready. Sample any clips, then approve the whole set. Individual review is optional.':'Ready to generate short clips from the approved narration.';
 const openClips=new Set([...$('voice-clips').querySelectorAll('details[open]')].map(el=>el.dataset.clip));$('voice-clips').replaceChildren();
 for(const clip of d.voice?.clips||[]){const card=document.createElement('details');card.className='asset-review-card voice-clip-row';card.dataset.clip=clip.id;card.open=openClips.has(clip.id);const title=document.createElement('summary');title.textContent='Clip '+clip.id.replace('clip-','')+' · Script section '+clip.section;const text=document.createElement('p');text.textContent=clip.text;card.append(title,text);const status=document.createElement('span');status.className='clip-status';const active=busy&&voiceJob.position===d.voice.clips.indexOf(clip)+1&&!clip.url;status.textContent=stale?'Outdated':clip.url?(clip.reviewed?'✓ Reviewed':'✓ Generated'):active?'Generating…':clip.error?'Failed · retry available':'Queued';const progress=document.createElement('progress');progress.max=1;progress.setAttribute('aria-label','Progress for '+clip.id);if(!active)progress.value=clip.url?1:0;title.append(status);card.append(progress);
 if(clip.url){const audio=document.createElement('audio');audio.controls=true;audio.preload='none';audio.src=clip.url;card.append(audio);const download=document.createElement('a');download.href=clip.url;download.download=clip.id+'.wav';download.textContent='Download WAV';card.append(download);const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.checked=clip.reviewed;check.disabled=busy||stale||!valid;check.onchange=()=>{clip.reviewed=check.checked;save();$('approve-voice').disabled=!directionReady(d)||!voiceReady(d)||!!d.voice.approved;status.textContent=clip.reviewed?'✓ Reviewed':'✓ Generated';$('voice-review-count').textContent=d.voice.clips.filter(c=>c.url&&c.reviewed).length+' of '+d.voice.clips.length+' reviewed (optional)';};label.append(check,document.createTextNode(' Listened and reviewed (optional)'));card.append(label);}else{const note=document.createElement('p');note.textContent=clip.error||'Waiting for voice generation';card.append(note);} $('voice-clips').append(card);}
 $('preview-playback').disabled=!valid||!voiceReady(d)||!d.voice?.approved||busy;
 $('approve-voice').disabled=!valid||busy||!voiceReady(d)||!!d.voice?.approved;$('voice-approval').textContent=valid&&voiceReady(d)&&d.voice.approved?'Voice set approved. Ready for avatar and playback integration.':'';
}
$('next-voice').onclick=()=>{if(directionReady(current()))go(9);};$('back-direction').onclick=()=>go(8);
$('stop-voice').onclick=()=>{if(voiceJob)voiceJob.stop=true;$('voice-build-status').textContent='Stopping after the current clip finishes…';};
$('prepare-voice').onclick=async()=>{
 const d=current();if(!directionReady(d)||voiceJob)return;
 const notify=startNotificationTask('Narration clips');
 try{const input=voiceFingerprint(d);if(!d.voice||d.voice.input!==input)d.voice={input,clips:narrationClips(d.direction.markdown),approved:null};save();voiceJob={id:d.id,stop:false,position:0};
 for(const [i,clip] of d.voice.clips.entries()){
  if(voiceJob.stop||!drafts.includes(d)||!directionReady(d)||voiceFingerprint(d)!==input)break;if(clip.url)continue;
  voiceJob.position=i+1;if(current()?.id===d.id)renderVoice();
  try{const response=await fetch('/api/authoring-speech',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:clip.text}),signal:AbortSignal.timeout(190000)});if(!response.ok)throw Error('Voice preparation failed. Retry this set.');const result=await response.json();clip.url=result.url;clip.voiceProfile=result.voiceProfile;clip.error=null;save();}
  catch(error){notify(error);clip.error=error.message;save();break;}
 }
 }catch(error){notify(error);$('voice-build-status').textContent=error.message;voiceJob=null;return;}
 if(d.voice.clips.every(c=>c.url))notify();
 voiceJob=null;renderVoice();
};
$('approve-voice').onclick=()=>{const d=current();if(!directionReady(d)||!voiceReady(d)||voiceJob)return;d.voice.approved=new Date().toISOString();save();renderVoice();};

$('restore-backup').onclick=async()=>{
 try{const r=await fetch('/api/authoring-backup');if(!r.ok)throw Error('No local backup available yet.');const data=await r.json();if(!Array.isArray(data.drafts))throw Error('Invalid backup.');if(!confirm('Restore the last local backup? This replaces drafts currently shown in this browser. Export current drafts first if needed.'))return;clearTimeout(backupTimer);drafts=data.drafts;selected=drafts.find(d=>d.id===data.selected)?.id||drafts[0]?.id;clearImport();save();render();$('autosave-status').textContent='Restored local backup.';}catch(error){$('autosave-status').textContent=error.message;}
};
// Save unfinished source editing separately from the approved source material.
function saveSourceBuffer(){const d=current();if(!d)return;d.sourceBuffer={name:$('source-name').value,text:$('source-text').value,editingSource,importMetadata};save();}
$('source-name').addEventListener('input',saveSourceBuffer);$('source-text').addEventListener('input',saveSourceBuffer);
function restoreSourceBuffer(){const restored=current()?.sourceBuffer;if(restored){$('manual-source').open=true;$('source-name').value=restored.name;$('source-text').value=restored.text;editingSource=restored.editingSource;importMetadata=restored.importMetadata;$('cancel-edit').hidden=!editingSource;$('source-form').querySelector('button[type=submit]').textContent=editingSource?'Save source':'Add source';$('word-count').textContent=(restored.text.trim().match(/\S+/g)||[]).length+' words';}}

$('preview-playback').onclick=()=>{const d=current();if(directionReady(d)&&voiceReady(d)&&d.voice.approved){save();location.assign('/annotation-review.html?lecture='+encodeURIComponent(d.id));}};

// Navigation reflects approval gates, independently from the saved editing step.
function studioSteps(d){
 const original=d.presentation?.mode==='original';
 return [
  {step:2,label:'Material',done:!!d.sources.length,enabled:true,hint:'Upload and inspect'},
  {step:3,label:'Lecture details',done:!!d.approved,enabled:!!d.sources.length,hint:'Audience and outcomes'},
  {step:4,label:'Confirm setup',done:!!d.approved,enabled:validDetails(d),hint:'Review your sources'},
  {step:5,label:'Lecture plan',done:planReady(d),enabled:!!d.approved,hint:'Generate and approve'},
  {step:6,label:'Presentation script',done:scriptReady(d),enabled:planReady(d),hint:'Narration and timing'},
  ...(original?[
   {step:8,label:'Presenter instructions',done:directionReady(d),enabled:scriptReady(d),hint:'Delivery and slide cues'},
   {step:9,label:'Voice',done:directionReady(d)&&voiceReady(d)&&!!d.voice?.approved,enabled:directionReady(d),hint:'Generate and listen'},
   {label:'Annotations & publish',done:!!d.annotationsSkipped||!!d.annotationsApproved,enabled:directionReady(d)&&voiceReady(d)&&!!d.voice?.approved,href:'/annotation-review.html?lecture='+encodeURIComponent(d.id),hint:'Review, rehearse, publish'}
  ]:[{step:7,label:'Visual assets',done:scriptReady(d)&&assetsReady(d)&&!!d.assets?.approved,enabled:scriptReady(d),hint:'Match and review visuals'},
      {step:10,label:'HTML slides',done:slidesReady(d),enabled:scriptReady(d)&&assetsReady(d)&&!!d.assets?.approved,hint:'Generate, edit and review'},
 {step:8,label:'Presenter instructions',done:directionReady(d),enabled:slidesReady(d)&&scriptReady(d),hint:'Delivery and slide cues'},
 {step:9,label:'Voice',done:directionReady(d)&&voiceReady(d)&&!!d.voice?.approved,enabled:directionReady(d),hint:'Generate and listen'},
 {label:'Annotations & publish',done:!!d.annotationsSkipped||!!d.annotationsApproved,enabled:directionReady(d)&&voiceReady(d)&&!!d.voice?.approved,href:'/annotation-review.html?lecture='+encodeURIComponent(d.id),hint:'Review, rehearse, publish'}])
 ];
}
function refreshStudioChrome(){
 const d=current();$('lecture-count').textContent=drafts.length+' lecture'+(drafts.length===1?'':'s');
 const query=$('lecture-search').value.toLowerCase().trim();
 for(const button of $('draft-list').children)button.hidden=!button.textContent.toLowerCase().includes(query);
 if(query){const count=[...$('draft-list').children].filter(b=>!b.hidden).length;$('lecture-count').textContent=count?count+' matching lecture'+(count===1?'':'s'):'No lectures match your search.';}
 $('workflow-nav').replaceChildren();if(!d)return;
 $('workspace-title').textContent=d.title||'Untitled lecture';
 const steps=studioSteps(d),complete=steps.filter(s=>s.done).length;const pendingSource=!!editingSource||!!$('source-text').value.trim()||$('source-file').disabled;
 const activeStep=steps.find(s=>s.step===d.wizardStep);$('draft-status').textContent=activeStep?.done?'Complete':activeStep?.enabled?'In progress':'Needs review';
 $('workflow-progress').max=steps.length;$('workflow-progress').value=complete;
 $('workflow-summary').textContent=complete+' of '+steps.length+' steps complete';
 for(const [i,item] of steps.entries()){
  if(pendingSource&&item.step!==2){item.enabled=false;item.hint='Save or cancel source edit';}
  const li=document.createElement('li'),button=document.createElement(item.href&&item.enabled?'a':'button');
  const symbol=document.createElement('span');symbol.className='step-symbol';symbol.textContent=item.done?'✓':String(i+1);
  const label=document.createElement('span');label.textContent=item.label;const hint=document.createElement('small');hint.textContent=pendingSource&&item.step!==2?'Save or cancel source edit':item.done?'Complete':item.enabled?item.hint:item.step?'Complete the previous step':item.hint;label.append(hint);button.append(symbol,label);
  if(item.href&&item.enabled)button.href=item.href;else{button.disabled=!item.enabled;button.type='button';button.onclick=()=>go(item.step);}
  if(item.step===d.wizardStep)button.setAttribute('aria-current','step');
  li.append(button);$('workflow-nav').append(li);
 }
 for(const [approve,next] of [['approve-plan','next-script'],['approve-script','next-assets'],['approve-direction','next-voice'],['approve-voice','preview-playback']]){
  $(next).hidden=$(next).disabled;
 }
 for(const id of ['plan','script','direction'])updateDocumentPreview(id);
}
$('lecture-search').addEventListener('input',refreshStudioChrome);
$('open-settings').onclick=()=>$('studio-settings').showModal();
$('close-settings').onclick=()=>$('studio-settings').close();
// Readable document previews use text nodes only; source content never becomes HTML.
function updateDocumentPreview(id){
 const input=$(id+'-markdown'),preview=$(id+'-preview');if(!preview||preview.dataset.value===input.value)return;
 preview.dataset.value=input.value;preview.replaceChildren();
 for(const line of input.value.split('\n')){
  if(!line.trim())continue;
  const heading=line.match(/^(#{1,6})\s+(.+)/),bullet=line.match(/^\s*[-*]\s+(.+)/);
  const node=document.createElement(heading?'h'+Math.min(4,heading[1].length+1):'p');
  node.textContent=heading?heading[2]:bullet?'• '+bullet[1]:line;
  preview.append(node);
 }
}
for(const id of ['plan','script','direction']){
 const input=$(id+'-markdown'),toolbar=document.createElement('div'),preview=document.createElement('div');
 toolbar.className='document-toolbar';toolbar.setAttribute('role','group');toolbar.setAttribute('aria-label','Document view');preview.id=id+'-preview';preview.className='document-preview';preview.tabIndex=0;
 const read=document.createElement('button'),edit=document.createElement('button');read.type=edit.type='button';read.textContent='Read';edit.textContent='Edit Markdown';
 function mode(editing){input.hidden=!editing;preview.hidden=editing;read.setAttribute('aria-pressed',String(!editing));edit.setAttribute('aria-pressed',String(editing));updateDocumentPreview(id);if(editing)input.focus();}
 read.onclick=()=>mode(false);edit.onclick=()=>mode(true);toolbar.append(read,edit);input.before(toolbar,preview);input.addEventListener('input',()=>updateDocumentPreview(id));mode(false);
}
let chromeRefresh;
new MutationObserver(records=>{if(records.every(r=>(r.target.nodeType===1?r.target:r.target.parentElement)?.closest('.workflow-progress, #draft-status, .document-preview, .document-toolbar')))return;clearTimeout(chromeRefresh);chromeRefresh=setTimeout(refreshStudioChrome,20);}).observe($('editor'),{subtree:true,childList:true,attributes:true,attributeFilter:['disabled']});
// Observe the save status as edits can invalidate a downstream approval.
new MutationObserver(()=>{clearTimeout(chromeRefresh);chromeRefresh=setTimeout(refreshStudioChrome,20);}).observe($('autosave-status'),{childList:true});
refreshStudioChrome();

const studioNarrow=matchMedia('(max-width:720px)');$('lecture-library').open=!studioNarrow.matches;studioNarrow.addEventListener('change',e=>{$('lecture-library').open=!e.matches;});

async function prepareSlideVisual(d,slide,mode='generate',parentSignal){
 if(visualJobs.has(slide))return;const controller=new AbortController();visualJobs.set(slide,controller);slide.visualError=null;slide.reviewed=false;slide.assetKept=false;d.slides.approved=null;save();const brief=slide.visualBrief;renderSlides();const notify=startNotificationTask('Slide visual');
 try{const r=await fetch('/api/asset-production',{method:'POST',headers:{'Content-Type':'application/json'},signal:parentSignal?AbortSignal.any([parentSignal,controller.signal]):controller.signal,body:JSON.stringify({ai:d.ai,mode,item:{title:slide.title,brief,purpose:d.assets.items.find(a=>a.id===(slide.requirementId||slide.assetId))?.purpose||slide.title}})}),data=await r.json();if(!r.ok)throw Error(data.error||'Visual generation failed.');if(!drafts.includes(d)||!d.slides.items.includes(slide)||brief!==slide.visualBrief)return;
 slide.candidates=data.candidates;if(!data.candidates.length)throw Error('No image found. Adjust the description or generate a diagram.');if(mode==='generate')slide.visual=data.candidates[0];slide.assetKept=false;slide.reviewed=false;d.slides.approved=null;save();notify();
 }catch(e){if(e.name!=='AbortError'){slide.visualError=e.message;notify(e);}save();}finally{visualJobs.delete(slide);if(current()?.id===d.id)renderSlides();}
}
function slidePreviewHTML(slide,d){return deckHTML([slide],approvedVisuals(d)).replace('</style>','body{width:1200px;height:675px;overflow:hidden}.slide{width:1200px;margin:0}</style>');}
function renderSlides(){
 const d=current();if(!d)return;const ready=scriptReady(d)&&assetsReady(d)&&!!d.assets?.approved,stale=d.slides&&d.slides.input!==slidesFingerprint(d),busy=slidesJob?.id===d.id;
 $('deck-comment').value=d.deckComment||'';$('deck-comment').disabled=busy;$('revise-deck').disabled=!ready||stale||busy||visualJobs.size>0||!d.slides;
 $('generate-slides').disabled=!ready||!!slidesJob||visualJobs.size>0;$('cancel-slides').hidden=!busy;
 $('slides-status').classList.toggle('is-loading',busy||visualJobs.size>0);
 $('slides-status').textContent=busy?'Preparing slides and their visuals…':!ready?'Approve the script and asset descriptions first.':stale?'Script or descriptions changed. Generate the deck again.':slidesReady(d)?'Slide deck approved. Continue to presenter instructions.':d.slides?`${d.slides.items.filter(s=>s.reviewed).length} of ${d.slides.items.length} slides reviewed · ${visualJobs.size} visuals processing`:'Create minimal slides and their visuals from the approved descriptions.';
 $('slides-list').className=d.slideView==='rows'?'slides-rows':'slides-grid';
 for(const mode of ['grid','rows']){$('slides-'+mode).setAttribute('aria-pressed',String((d.slideView||'grid')===mode));$('slides-'+mode).onclick=()=>{d.slideView=mode;save();renderSlides();};}
 $('approve-all-slides').disabled=!ready||stale||busy||visualJobs.size>0||!d.slides?.items.length||d.slides.items.some(s=>s.assetId&&!s.visual?.url);
 $('next-presenter').hidden=!ready||!slidesReady(d)||busy;slidePreviewObservers.splice(0).forEach(o=>o.disconnect());$('slides-list').replaceChildren();
 for(const [i,slide] of (d.slides?.items||[]).entries()){
 if(d.slides.version!==2&&slide.assetId&&!slide.visual)slide.visual=approvedVisuals(d).find(v=>v.id===slide.assetId);
 const card=document.createElement('article');card.className='slide-review-card';const summary=document.createElement('h3');summary.textContent=`${i+1}. ${slide.title} · ${slide.reviewed?'Reviewed':'Needs review'}`;
 const frame=document.createElement('iframe');frame.title='Slide '+(i+1);frame.sandbox='';frame.style.cssText='width:1200px;height:675px;border:0;max-width:none;transform-origin:top left;flex:none';frame.srcdoc=slidePreviewHTML(slide,d);const preview=document.createElement('div');preview.style.cssText='width:100%;overflow:hidden;border:1px solid #dce3f0;border-radius:12px';preview.append(frame);const resize=new ResizeObserver(([entry])=>{const scale=entry.contentRect.width/1200;frame.style.transform='scale('+scale+')';preview.style.height=(675*scale)+'px';});resize.observe(preview);slidePreviewObservers.push(resize);
 const title=document.createElement('input');title.value=slide.title;title.maxLength=160;title.setAttribute('aria-label','Title for slide '+(i+1));title.disabled=busy;
 const changed=()=>{slide.reviewed=false;d.slides.approved=null;save();frame.srcdoc=slidePreviewHTML(slide,d);$('approve-slides').disabled=true;$('next-presenter').hidden=true;};title.oninput=()=>{slide.title=title.value;changed();};card.append(summary,preview,title);if(d.slides.segments){const narration=document.createElement('p');narration.textContent='Narration: '+(d.slides.segments[i]?.say||'');card.append(narration);}
 for(const [field,label] of [['paragraph','Paragraph'],['bullets','Bullets — one per line'],['code','Code'],['caption','Short annotation']]){if(!slide[field]||(Array.isArray(slide[field])&&!slide[field].length))continue;const l=document.createElement('label');l.textContent=label;const input=document.createElement('textarea');input.value=Array.isArray(slide[field])?slide[field].join('\n'):slide[field];input.rows=field==='code'?8:3;if(field==='paragraph')input.maxLength=180;if(field==='caption')input.maxLength=140;input.disabled=busy;input.oninput=()=>{slide[field]=field==='bullets'?input.value.split('\n').filter(Boolean):input.value;changed();};l.append(input);card.append(l);}
 if(slide.assetId){
 slide.visualBrief??=d.assets.items.find(a=>a.id===(slide.requirementId||slide.assetId))?.brief||'';const brief=document.createElement('textarea');brief.value=slide.visualBrief;brief.rows=3;brief.setAttribute('aria-label','Visual description for slide '+(i+1));brief.disabled=busy||visualJobs.has(slide);brief.onchange=()=>{slide.visualBrief=brief.value;slide.assetKept=false;changed();renderSlides();};
 const status=document.createElement('p');status.classList.toggle('is-loading',visualJobs.has(slide));status.setAttribute('role','status');status.textContent=visualJobs.has(slide)?'Creating this slide’s visual…':slide.visualError||(slide.assetKept?'✓ Visual kept':slide.visual?'Review the visual in the slide, then keep or regenerate.':'Visual not ready. Generate it below.');
 const actions=document.createElement('div');actions.className='plan-actions';
 for(const [mode,label] of [['generate',slide.visual?'Regenerate visual':'Generate visual'],['find','Find image']]){const button=document.createElement('button');button.className='control';button.textContent=label;button.disabled=busy||visualJobs.has(slide)||stale;button.onclick=()=>prepareSlideVisual(d,slide,mode);actions.append(button);}
 const keep=document.createElement('button');keep.className='control';keep.textContent=slide.assetKept?'✓ Visual kept':'Keep this visual';keep.disabled=busy||visualJobs.has(slide)||!slide.visual?.url||stale;keep.onclick=()=>{slide.assetKept=true;save();renderSlides();};actions.append(keep);
 if(visualJobs.has(slide)){const cancel=document.createElement('button');cancel.textContent='Cancel';cancel.onclick=()=>visualJobs.get(slide)?.abort();actions.append(cancel);}
 card.append(brief,status,actions);
 for(const candidate of slide.candidates||[]){if(candidate.url===slide.visual?.url)continue;const img=document.createElement('img');img.src=candidate.url;img.alt=candidate.description||candidate.name;img.style.cssText='width:180px;height:120px;object-fit:contain';const pick=document.createElement('button');pick.textContent='Use '+candidate.name;pick.onclick=()=>{slide.visual=candidate;slide.assetKept=false;changed();renderSlides();};card.append(img,pick);}
 }
 const review=document.createElement('button');review.className='control';review.textContent=slide.reviewed?'✓ Slide reviewed':'Confirm slide';review.disabled=busy||stale||!ready||visualJobs.has(slide)||!!slide.assetId&&!slide.assetKept;review.onclick=()=>{if(!slide.title.trim()||slide.bullets.length>(d.slides.version===2?3:6)||slide.bullets.some(b=>b.length>(d.slides.version===2?90:300))){$('slides-status').textContent='Keep the title and bullets concise.';return;}slide.reviewed=true;save();renderSlides();};card.append(review);
 const feedback=document.createElement('textarea');feedback.rows=2;feedback.placeholder='What should change on this slide?';feedback.setAttribute('aria-label','Revision comment for slide '+(i+1));feedback.value=slide.revisionComment||'';feedback.disabled=busy;feedback.oninput=()=>{slide.revisionComment=feedback.value;save();};
 const regenerate=document.createElement('button');regenerate.className='control';regenerate.textContent='Regenerate slide';regenerate.disabled=busy||stale||!ready||visualJobs.size>0;regenerate.onclick=()=>regenerateSlide(d,slide);card.append(feedback,regenerate);$('slides-list').append(card);
 }
 $('approve-slides').disabled=!ready||busy||visualJobs.size>0||stale||!d.slides?.items.length||!d.slides.items.every(s=>s.reviewed&&(!s.assetId||s.assetKept!==false))||!!d.slides.approved;$('download-slides').disabled=!d.slides||stale;
}
$('next-slides').onclick=()=>go(10);$('back-assets').onclick=()=>go(7);
$('generate-slides').onclick=async()=>{const d=current();if(slidesJob||!assetsReady(d)||!d.assets?.approved)return;const input=slidesFingerprint(d),controller=new AbortController();slidesJob={id:d.id,controller};renderSlides();const notify=startNotificationTask('HTML slides');try{const r=await fetch('/api/slides',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({...d,deckComment:null})}),result=await r.json();if(!r.ok)throw Error(result.error||'Slide generation failed.');if(input!==slidesFingerprint(d)||!drafts.includes(d))throw Error('The source changed. Generate again.');d.slides={...result,input,approved:null};save();for(const slide of d.slides.items){if(controller.signal.aborted)break;if(slide.assetId&&!slide.visual)await prepareSlideVisual(d,slide,'generate',controller.signal);}notify();slidesJob=null;if(current()?.id===d.id)renderSlides();}catch(e){notify(e);slidesJob=null;if(current()?.id===d.id){renderSlides();$('slides-status').textContent=e.name==='AbortError'?'Cancelled. Your saved slides are unchanged.':e.message;}}};
$('cancel-slides').onclick=()=>slidesJob?.controller.abort();
$('deck-comment').oninput=()=>{const d=current();d.deckComment=$('deck-comment').value;save();};
$('revise-deck').onclick=async()=>{
 const d=current();if(!d?.deckComment?.trim()||slidesJob||visualJobs.size){$('slides-status').textContent='Describe the changes you want first.';return;}
 const controller=new AbortController(),input=slidesFingerprint(d),deck=d.slides;slidesJob={id:d.id,controller};renderSlides();const notify=startNotificationTask('Deck revision');let error='';
 try{const r=await fetch('/api/slides',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify(d)}),result=await r.json();if(!r.ok)throw Error(result.error||'Deck revision failed.');if(d.slides!==deck||input!==slidesFingerprint(d)||!drafts.includes(d))throw Error('Sources changed. Please retry.');d.previousSlides=deck;d.slides={...result,input,approved:null};save();for(const slide of d.slides.items){if(controller.signal.aborted)break;if(slide.assetId&&!slide.visual)await prepareSlideVisual(d,slide,'generate',controller.signal);}notify();}
 catch(e){error=e.name==='AbortError'?'Cancelled. Saved slides are retained.':e.message;notify(e);}
 finally{slidesJob=null;if(current()?.id===d.id){renderSlides();if(error)$('slides-status').textContent=error;}}
};
$('approve-all-slides').onclick=()=>{const d=current();if(!d?.slides||slidesJob||visualJobs.size||d.slides.input!==slidesFingerprint(d)||d.slides.items.some(s=>s.assetId&&!s.visual?.url))return;for(const s of d.slides.items){s.reviewed=true;s.assetKept=true;}d.slides.approved=new Date().toISOString();save();renderSlides();};
async function regenerateSlide(d,slide){
 if(slidesJob||visualJobs.size)return;const controller=new AbortController(),input=slidesFingerprint(d),deck=d.slides;slidesJob={id:d.id,controller};renderSlides();const notify=startNotificationTask('Slide revision');let revisionError='';
 try{const r=await fetch('/api/slides',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({...d,deckComment:null,regenerateSlide:{segmentId:slide.segmentId,comment:slide.revisionComment||'Improve clarity and visual presentation.'}})}),result=await r.json();if(!r.ok)throw Error(result.error||'Revision failed.');if(d.slides!==deck||input!==slidesFingerprint(d)||!drafts.includes(d))throw Error('The source changed. Retry the revision.');const i=deck.items.indexOf(slide);if(i<0)return;deck.items[i]={...result.item,revisionComment:slide.revisionComment};deck.approved=null;save();if(result.item.assetId)await prepareSlideVisual(d,deck.items[i],'generate',controller.signal);notify();}
 catch(e){notify(e);revisionError=e.name==='AbortError'?'Revision cancelled.':e.message;}
 finally{slidesJob=null;if(current()?.id===d.id){renderSlides();if(revisionError)$('slides-status').textContent=revisionError;}}
}
$('approve-slides').onclick=()=>{const d=current();if(!d.slides||d.slides.input!==slidesFingerprint(d)||!d.slides.items.every(s=>s.reviewed&&(!s.assetId||(s.visual?.url&&s.assetKept!==false))))return;d.slides.approved=new Date().toISOString();save();renderSlides();};
$('download-slides').onclick=()=>{const d=current(),url=URL.createObjectURL(new Blob([deckHTML(d.slides.items,approvedVisuals(d))],{type:'text/html'})),a=document.createElement('a');a.href=url;a.download='lecture-slides.html';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};

$('next-presenter').onclick=()=>{if(slidesReady(current())&&scriptReady(current()))go(8);};

async function suggestLectureSplit(d){
 const input=splitFingerprint(d),controller=new AbortController();planJob={id:d.id,controller};renderPlan();$('generation-status').textContent='AI is grouping the material into lectures. You will review the coverage before anything is created.';const notify=startNotificationTask('Lecture split proposal');
 try{const r=await fetch('/api/split-lecture',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({title:d.title,brief:d.brief,presentation:d.presentation,ai:d.ai,approved:d.approved,sources:d.sources.map(({id,name,text})=>({id,name,text}))})}),data=await r.json();if(!r.ok)throw Error(data.error||'Could not propose a split.');if(input!==splitFingerprint(d)||!drafts.includes(d))throw Error('The sources changed. Suggest a new split.');d.splitProposal={...data,input};save();notify();planJob=null;if(current()?.id===d.id){renderPlan();$('generation-status').textContent='Review the proposed lectures below. Your original lecture remains unchanged.';}}
 catch(e){notify(e);planJob=null;if(current()?.id===d.id){renderPlan();$('generation-status').textContent=e.name==='AbortError'?'Split proposal cancelled.':e.message;}}
}
function renderSplitReview(d){
 const panel=$('split-review');panel.replaceChildren();panel.hidden=!d.splitProposal;if(!d.splitProposal)return;
 const proposal=d.splitProposal,stale=proposal.input!==splitFingerprint(d),heading=document.createElement('h3');heading.textContent='Review proposed lecture sequence';panel.append(heading);
 const note=document.createElement('p');note.textContent=stale?'Source or setup changed. Request a new proposal.':'All source text is covered once, in order. AI recommends boundaries using source excerpts; review the exact text below. Duration is an estimate per lecture.';panel.append(note);
 for(const [i,p] of proposal.lectures.entries()){const units=proposal.units.slice(p.from-1,p.to),card=document.createElement('article');card.className='asset-review-card';const title=document.createElement('h4');title.textContent=`Lecture ${i+1}: ${p.title} · ${p.minutes} min`;const range=document.createElement('p');range.textContent=`From ${units[0].sourceName}: “${units[0].from}” → To ${units.at(-1).sourceName}: “${units.at(-1).to}”`;const reason=document.createElement('p');reason.textContent=p.reason;card.append(title,range,reason);
 if(!stale){const details=document.createElement('details'),summary=document.createElement('summary'),text=document.createElement('pre');summary.textContent='Review exact included material';text.style.cssText='white-space:pre-wrap;max-height:300px;overflow:auto;font:inherit';text.textContent=splitSources(d.sources,proposal.units,p).map(s=>s.name+'\n'+s.text).join('\n\n');details.append(summary,text);card.append(details);}panel.append(card);}
 const approve=document.createElement('button');approve.className='primary';approve.textContent=proposal.createdIds?'✓ Lectures created':'Approve split & create lectures';approve.disabled=stale||!!planJob||!!proposal.createdIds;
 approve.onclick=()=>{if(proposal.input!==splitFingerprint(d)||proposal.createdIds)return;const units=sourceUnits(d.sources);validateSplit(proposal,units);const children=proposal.lectures.map((p,i)=>({id:crypto.randomUUID(),title:p.title,brief:{...d.brief,duration:p.minutes},ai:structuredClone(d.ai),presentation:structuredClone(d.presentation),sources:splitSources(d.sources,units,p),approved:new Date().toISOString(),wizardStep:5,furthestStep:5,splitFrom:d.id,splitPart:i+1}));
 for(const child of children)if(child.presentation?.mode==='original'&&!child.sources.some(s=>s.id===child.presentation.sourceId)){child.presentation={mode:'generated',sourceId:null};child.approved=null;child.wizardStep=3;}
 proposal.createdIds=children.map(c=>c.id);drafts.unshift(...children);selected=children[0].id;save();render();$('studio-status').textContent=`Created ${children.length} lectures. The original is preserved. Review each lecture’s details, then generate its plan.`;};panel.append(approve);
}
$('connect-eleven').onclick=async()=>{const button=$('connect-eleven');button.disabled=true;try{const r=await fetch('/api/elevenlabs-settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({apiKey:$('eleven-key').value,voiceId:$('eleven-voice').value})});if(!r.ok)throw Error('Could not save ElevenLabs settings.');$('eleven-key').value='';$('eleven-status').textContent='Connection saved. Prepare clips to generate with Eleven v4.';}catch(e){$('eleven-status').textContent=e.message;}finally{button.disabled=false;}};
