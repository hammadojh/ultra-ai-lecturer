import {annotationKey} from './annotations.mjs';
import {voiceReady} from './voice-authoring.mjs';
const $=id=>document.getElementById(id),ns='http://www.w3.org/2000/svg';let draft,source,pages=[],sections=[],job=null,queue=Promise.resolve(),activeKey=null,failedKey=null;
let listingView='grid';try{listingView=localStorage.getItem('ultra-annotation-view')==='rows'?'rows':'grid';}catch{}
const expandedSlides=new Set();
const slideFor=c=>Number(sections[c.section-1]?.match(/^Original slide:\s*(\d+)/m)?.[1]);
const keyFor=c=>annotationKey(draft,c,slideFor(c));
function save(){
 const all=JSON.parse(localStorage.getItem('ultra-authoring-v1')||'[]'),target=all.find(d=>d.id===draft.id);if(!target)throw Error('Lecture no longer exists.');
 target.annotations=draft.annotations;target.annotationGeneration=draft.annotationGeneration;target.annotationsApproved=draft.annotationsApproved;
 localStorage.setItem('ultra-authoring-v1',JSON.stringify(all));const body=JSON.stringify({drafts:all,selected:draft.id,savedAt:new Date().toISOString()});
 queue=queue.catch(()=>{}).then(async()=>{const r=await fetch('/api/authoring-backup',{method:'PUT',headers:{'Content-Type':'application/json'},body});if(!r.ok)throw Error();}).catch(()=>{$('status').textContent='Saved in browser; local backup unavailable.';});
}
function complete(){return draft.voice.clips.every(c=>draft.annotationGeneration?.[keyFor(c)]);}
function draw(svg,clips){svg.replaceChildren();for(const clip of clips)for(const a of draft.annotations?.[keyFor(clip)]||[]){const node=document.createElementNS(ns,a.style==='circle'?'ellipse':a.style==='underline'?'line':'rect'),x=a.x*1000,y=a.y*1000,w=a.w*1000,h=a.h*1000;const attrs=a.style==='circle'?{cx:x+w/2,cy:y+h/2,rx:w/2,ry:h/2}:a.style==='underline'?{x1:x,y1:y+h,x2:x+w,y2:y+h}:{x,y,width:w,height:h};for(const [k,v]of Object.entries(attrs))node.setAttribute(k,v);node.setAttribute('stroke','#ffad00');node.setAttribute('stroke-width',3);node.setAttribute('fill',a.style==='highlight'?'#ffd82d40':'none');svg.append(node);}}
function render(){
 $('slides').replaceChildren();$('slides').classList.toggle('rows-view',listingView==='rows');$('grid-view').setAttribute('aria-pressed',String(listingView==='grid'));$('rows-view').setAttribute('aria-pressed',String(listingView==='rows'));$('approve').disabled=!!job||!complete();$('publish').disabled=!!job||!complete()||!draft.annotationsApproved;
 const total=draft.voice.clips.length,done=draft.voice.clips.filter(c=>draft.annotationGeneration?.[keyFor(c)]).length;
 $('generation-progress').max=total||1;$('generation-progress').value=done;
 $('generation-summary').textContent=done===total?'All annotations generated':done+' of '+total+' clips generated';
 $('generation-detail').textContent=job?'AI generation in progress. Each completed clip is saved.':done===total?'Review the slide annotations, then approve to open rehearsal.':done?'Progress saved. Resume to generate the remaining clips.':'Ready to generate annotations for the lecture.';
 $('generate').textContent=done===total?'✓ All annotations generated':done?'Resume annotation generation':'Generate AI annotations';$('generate').disabled=!!job||done===total;

 for(const section of source.import.sections){const page=pages.find(p=>p.page===section.number),clips=draft.voice.clips.filter(c=>slideFor(c)===section.number);const card=document.createElement(listingView==='rows'?'details':'article');card.className='review-card';const h=document.createElement(listingView==='rows'?'summary':'h2');h.textContent='Slide '+section.number;card.append(h);if(listingView==='rows'){h.className='slide-row-summary';card.open=expandedSlides.has(section.number);card.ontoggle=()=>{if(card.open)expandedSlides.add(section.number);else expandedSlides.delete(section.number);};}
 const slideDone=clips.filter(c=>draft.annotationGeneration?.[keyFor(c)]).length,slideBusy=clips.some(c=>keyFor(c)===activeKey),slideFailed=clips.some(c=>keyFor(c)===failedKey);
 const slideLabel=document.createElement('p');slideLabel.className='local-progress';slideLabel.textContent=!clips.length?'No narration on this slide':slideDone===clips.length?'✓ Slide complete · '+slideDone+' clips':slideBusy?'Generating · '+slideDone+' / '+clips.length+' clips':slideFailed?'Needs retry · '+slideDone+' / '+clips.length+' clips':slideDone+' / '+clips.length+' clips generated';const slideProgress=document.createElement('progress');slideProgress.max=clips.length||1;slideProgress.value=slideDone;slideProgress.setAttribute('aria-label','Slide '+section.number+' generation progress');if(listingView==='rows'){const badge=document.createElement('span');badge.className='local-progress';badge.textContent=' · '+slideLabel.textContent;h.append(badge);}card.append(slideLabel,slideProgress);
const stage=document.createElement('div');stage.className='review-slide';const img=document.createElement('img');img.alt='Original slide '+section.number;if(page)img.src=page.url;const svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 1000 1000');svg.setAttribute('preserveAspectRatio','none');stage.append(img,svg);const content=document.createElement('div');content.className='slide-row-content';const editors=document.createElement('div');editors.className='clip-editors';content.append(stage,editors);card.append(content);
  if(!clips.length){const p=document.createElement('p');p.textContent='No narration mapped to this slide.';editors.append(p);}
  for(const clip of clips){const key=keyFor(clip),box=document.createElement('details');box.open=true;const summary=document.createElement('summary');summary.textContent=clip.id+' · '+(draft.annotationGeneration?.[key]?'✓ Generated':key===activeKey?'Generating…':key===failedKey?'Failed · retry available':'Queued');const text=document.createElement('p');text.textContent=clip.text;const clipProgress=document.createElement('progress');clipProgress.max=1;clipProgress.setAttribute('aria-label',clip.id+' annotation progress');if(key!==activeKey)clipProgress.value=draft.annotationGeneration?.[key]?1:0;box.append(summary,clipProgress,text);
   const marks=draft.annotations?.[key]||[];
   marks.forEach((a,i)=>{const row=document.createElement('div');row.className='annotation-editor';const select=document.createElement('select');select.setAttribute('aria-label','Annotation style');for(const style of ['highlight','circle','underline']){const o=document.createElement('option');o.value=style;o.textContent=style;select.append(o);}select.value=a.style;select.disabled=!!job;select.onchange=()=>{a.style=select.value;changed();};row.append(select);
    function changed(){draft.annotationsApproved=null;try{save();$('status').textContent='Saved';draw(svg,clips);$('publish').disabled=true;}catch(e){$('status').textContent=e.message;}}
    for(const field of ['x','y','w','h','start','duration']){const label=document.createElement('label');label.textContent=field+(['start','duration'].includes(field)?' sec':' %');const input=document.createElement('input');input.type='number';const scale=['start','duration'].includes(field)?1:100;input.value=String(Math.round(a[field]*scale*100)/100);input.step='.1';input.min=field==='duration'?'.1':'0';input.disabled=!!job;input.onchange=()=>{const value=Number(input.value)/scale,old=a[field];a[field]=value;if(!Number.isFinite(value)||a.x<0||a.y<0||a.w<=0||a.h<=0||a.x+a.w>1.001||a.y+a.h>1.001||a.start<0||a.duration<=0){a[field]=old;input.value=String(old*scale);$('status').textContent='Keep the region inside the slide and enter positive duration.';return;}changed();};label.append(input);row.append(label);}
    const remove=document.createElement('button');remove.textContent='Remove';remove.disabled=!!job;remove.onclick=()=>{marks.splice(i,1);changed();render();};row.append(remove);box.append(row);
   });
   const add=document.createElement('button');add.textContent='Add annotation';add.disabled=!!job;add.onclick=()=>{draft.annotations??={};(draft.annotations[key]??=[]).push({style:'highlight',x:.2,y:.2,w:.2,h:.1,start:0,duration:5});draft.annotationsApproved=null;save();render();};box.append(add);editors.append(box);
  }draw(svg,clips);$('slides').append(card);
 }
}
try{
 const all=JSON.parse(localStorage.getItem('ultra-authoring-v1')||'[]');draft=all.find(d=>d.id===new URLSearchParams(location.search).get('lecture'));if(!draft?.voice?.approved||!voiceReady(draft)||!draft.direction?.approved)throw Error('Approve the current voice and presenter instructions first.');
 source=draft.sources.find(s=>s.id===draft.presentation.sourceId);sections=draft.direction.markdown.split(/^## /m).filter(s=>/^.+\[\d+:\d{2}[–-]\d+:\d{2}\]/.test(s));$('title').textContent=draft.title+' · Annotations';$('status').textContent='Loading original slides…';$('generate').disabled=true;
 if(source.import.originalUrl.endsWith('.pptx')){const r=await fetch('/api/render-slides',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({originalUrl:source.import.originalUrl})}),data=await r.json();if(!r.ok)throw Error(data.error);pages=data.pages;}else pages=source.import.assets.filter(a=>a.kind==='page');
 render();$('generate').disabled=false;$('status').textContent='Review all slides below. Overlays show all marks for that slide; timing is per clip.';
}catch(e){$('status').textContent=e.message;$('generate').disabled=true;}
$('generate').onclick=async()=>{
 if(job)return;failedKey=null;job=new AbortController();$('generate').disabled=true;$('stop').hidden=false;render();
 try{let count=0;for(const clip of draft.voice.clips){const key=keyFor(clip);if(draft.annotationGeneration?.[key]){count++;continue;}const page=pages.find(p=>p.page===slideFor(clip));if(!page)throw Error('Original slide missing.');activeKey=key;render();$('status').textContent='Generating '+(count+1)+' / '+draft.voice.clips.length;
 const r=await fetch('/api/annotations',{method:'POST',headers:{'Content-Type':'application/json'},signal:job.signal,body:JSON.stringify({ai:draft.ai,text:clip.text,imageUrl:page.url,cue:sections[clip.section-1]})}),data=await r.json();if(!r.ok)throw Error(data.error);draft.annotations??={};draft.annotationGeneration??={};draft.annotations[key]=[...(draft.annotations[key]||[]).filter(a=>!a.generated),...data.annotations];draft.annotationGeneration[key]={model:data.model,at:new Date().toISOString()};draft.annotationsApproved=null;save();count++;activeKey=null;render();}
 $('status').textContent='Generated. Review the annotations, then approve to open rehearsal.';
 }catch(e){if(e.name!=='AbortError')failedKey=activeKey;$('status').textContent=e.name==='AbortError'?'Stopped. Generated annotations are saved.':e.message;}
 finally{job=null;activeKey=null;$('generate').disabled=false;$('stop').hidden=true;render();}
};
$('stop').onclick=()=>job?.abort();
$('approve').onclick=()=>{if(job||!complete())return;draft.annotationsApproved=new Date().toISOString();save();location.assign('/playback.html?lecture='+encodeURIComponent(draft.id));};

function changeView(view){listingView=view;try{localStorage.setItem('ultra-annotation-view',view);}catch{}if(draft)render();}
$('grid-view').onclick=()=>changeView('grid');$('rows-view').onclick=()=>changeView('rows');

$('publish').onclick=async()=>{
 if(job||!complete()||!draft.annotationsApproved)return;$('publish').disabled=true;
 try{const all=JSON.parse(localStorage.getItem('ultra-authoring-v1')||'[]'),current=all.find(d=>d.id===draft.id);const r=await fetch('/api/publish',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(current)}),data=await r.json();if(!r.ok)throw Error(data.error||'Publication failed.');$('status').textContent='Published to the local student lecture library. Draft edits remain private until you publish again.';$('publish').textContent='Publish updated version';}
 catch(e){$('status').textContent=e.message;}finally{$('publish').disabled=false;}
};
