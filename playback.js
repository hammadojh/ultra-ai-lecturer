import {imageBounds,normalizedPoint,annotationActive,annotationKey} from './annotations.mjs';
import {Presenter} from './presenter.mjs';
import {voiceFingerprint,voiceReady} from './voice-authoring.mjs';
const $=id=>document.getElementById(id);let draft,index=0,offset=0,playing=false,epoch=0,sections=[],renderedPages=[],slidesLoading=false;
class PreparedPresenter extends Presenter{
 async clip(segment){
  if(!this.cache.has(segment.id))this.cache.set(segment.id,(async()=>{const r=await fetch('/api/authoring-playback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:segment.text})}),data=await r.json();if(!r.ok)throw Error(data.error);const bytes=Uint8Array.from(atob(data.audio),c=>c.charCodeAt(0));return {...data,audio:await this.head.audioCtx.decodeAudioData(bytes.buffer)};})().catch(e=>{this.cache.delete(segment.id);throw e;}));
  return this.cache.get(segment.id);
 }
}
let annotationJob=null;
let marking=false,anchor=null,previewBox=null,annotationFrame;
const svgNS='http://www.w3.org/2000/svg';
const presenter=new PreparedPresenter($('avatar'),message=>{$('status').textContent=message;});
function halt(){epoch++;offset=presenter.position??offset;presenter.stop();playing=false;$('play').textContent='Play';drawAnnotations();}
function render(){
 const clip=draft.voice.clips[index],section=sections[clip.section-1]||'',slide=Number(section.match(/^Original slide:\s*(\d+)/m)?.[1]);
 const source=draft.sources.find(s=>s.id===draft.presentation.sourceId),page=renderedPages.find(a=>a.page===slide)||source?.import?.assets?.find(a=>a.kind==='page'&&a.page===slide);
 $('slide-image').hidden=!page;$('slide-text').hidden=!!page;
 if(page)$('slide-image').src=page.url;else $('slide-text').textContent=slidesLoading?'Rendering your original PowerPoint slides…':'No original slide preview available.';
 $('notice').textContent=page?'': 'Original slide preview is not ready. Playback is paused until rendering completes.';
 $('cue').textContent=section.replace(/### Approved narration — verbatim\s*\n[\s\S]*?(?=### Slide)/,'').trim();
 $('position').textContent='Clip '+(index+1)+' / '+draft.voice.clips.length+' · Slide '+(slide||'?');$('progress').max=draft.voice.clips.length;$('progress').value=index;
 $('previous').disabled=index===0;$('next').disabled=index===draft.voice.clips.length-1;$('caption').hidden=true;$('checkpoint').hidden=true;
 renderAnnotations();
 $('clips').replaceChildren();draft.voice.clips.forEach((c,i)=>{const b=document.createElement('button');b.textContent=(i+1)+'. '+c.text.slice(0,65);b.setAttribute('aria-current',String(i===index));b.onclick=()=>{halt();index=i;offset=0;render();};$('clips').append(b);});
}
function play(){
 if(slidesLoading||annotationJob)return;marking=false;anchor=null;$('annotation-layer').classList.remove('marking');
 playing=true;$('play').textContent='Pause';const token=++epoch,clip=draft.voice.clips[index];$('caption').hidden=true;
 presenter.play(clip,offset,{onReady:()=>{if(token!==epoch)return;presenter.mute($('mute').checked);$('caption').textContent=clip.text;$('caption').hidden=false;},onError:error=>{if(token!==epoch)return;halt();$('status').textContent=error.message;},onEnd:()=>{
  if(token!==epoch)return;offset=0;playing=false;$('play').textContent='Play';$('progress').value=index+1;
  const last=index===draft.voice.clips.length-1,boundary=last||draft.voice.clips[index+1].section!==clip.section,kind=sections[clip.section-1]?.match(/^Type:\s*(\w+)/m)?.[1];
  if(boundary&&['checkpoint','final_qa'].includes(kind)){$('checkpoint').hidden=false;$('continue').textContent=last?'Finish rehearsal':'Continue lecture';return;}
  if(last){$('status').textContent='Rehearsal complete.';return;}index++;render();play();
 }});
}
try{
 const publishedId=new URLSearchParams(location.search).get('published');
 if(publishedId){location.replace('/?published='+encodeURIComponent(publishedId));throw Error('Opening student classroom…');}
 const drafts=JSON.parse(localStorage.getItem('ultra-authoring-v1')||'[]');draft=publishedId?await fetch('/api/published/'+encodeURIComponent(publishedId)).then(async r=>{const data=await r.json();if(!r.ok)throw Error(data.error);return data;}):drafts.find(d=>d.id===new URLSearchParams(location.search).get('lecture'));
 if(publishedId){document.title='Ultra · Lecture';document.querySelector('header a').href='/';document.querySelector('header a').textContent='← My lectures';document.querySelector('header strong').textContent='ultra · Classroom';document.querySelector('header span').textContent='Omar · Student';$('review-annotations').hidden=true;document.querySelector('aside h2').textContent='Lecture';$('checkpoint').querySelector('p').textContent='Take a moment to answer the question or review the material, then continue. Live Q&A is not connected for this lecture yet.';}
 if(!draft?.direction?.approved||!draft.voice?.approved||!voiceReady(draft)||draft.voice.input!==voiceFingerprint(draft)||!draft.script?.approved||!draft.plan?.approved||!draft.approved)throw Error('Approve the current presenter instructions and voice set in the authoring studio first.');
 const planInput=JSON.stringify({title:draft.title,brief:draft.brief,presentation:draft.presentation,ai:draft.ai||{provider:'local'},sources:draft.sources.map(({id,name,text})=>({id,name,text}))});
 const scriptInput=JSON.stringify({setup:planInput,plan:draft.plan.markdown});
 const directionInput=JSON.stringify({script:draft.script.markdown,input:draft.script.input,sourceId:draft.presentation?.sourceId,sections:draft.sources.find(s=>s.id===draft.presentation?.sourceId)?.import?.sections});
 if(draft.plan.input!==planInput||draft.script.input!==scriptInput||draft.direction.input!==directionInput)throw Error('Lecture content changed. Approve the updated authoring steps before playback.');
 sections=draft.direction.markdown.split(/^## /m).filter(s=>/^.+\[\d+:\d{2}[–-]\d+:\d{2}\]/.test(s));
 if(!sections.length||draft.voice.clips.some(c=>!sections[c.section-1]))throw Error('Presenter section headings changed. Regenerate instructions and voice clips.');
 $('review-annotations').href='/annotation-review.html?lecture='+encodeURIComponent(draft.id);$('title').textContent=draft.title;render();
 const source=draft.sources.find(s=>s.id===draft.presentation.sourceId);
 if(source?.import?.originalUrl?.endsWith('.pptx')&&!source.import.assets?.some(a=>a.kind==='page')){
  slidesLoading=true;$('play').disabled=true;render();$('notice').textContent='Rendering your original PowerPoint slides. This happens once and is cached.';
  fetch('/api/render-slides',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({originalUrl:source.import.originalUrl})}).then(async r=>{const data=await r.json();if(!r.ok)throw Error(data.error||'Slide rendering failed.');renderedPages=data.pages;slidesLoading=false;$('play').disabled=false;render();$('status').textContent='Original slides ready. Press Play.';}).catch(error=>{$('notice').textContent=error.message;$('status').textContent='Could not render the original slides. Reload to retry.';});
 }

 $('play').onclick=()=>playing?halt():play();$('previous').onclick=()=>{halt();index=Math.max(0,index-1);offset=0;render();};$('next').onclick=()=>{halt();index=Math.min(draft.voice.clips.length-1,index+1);offset=0;render();};$('mute').onchange=()=>presenter.mute($('mute').checked);
 $('continue').onclick=()=>{$('checkpoint').hidden=true;if(index===draft.voice.clips.length-1){$('status').textContent='Rehearsal complete.';return;}index++;offset=0;render();play();};
 window.addEventListener('pagehide',()=>presenter.stop());
}catch(error){$('status').textContent=error.message;for(const id of ['play','previous','next'])$(id).disabled=true;}


function currentAnnotationKey(){const clip=draft.voice.clips[index];return annotationKey(draft,clip,Number(sections[clip.section-1]?.match(/^Original slide:\s*(\d+)/m)?.[1]));}
function marks(){return draft?.annotations?.[currentAnnotationKey()]||[];}
function bounds(){const image=$('slide-image'),stage=image.parentElement;return imageBounds(stage.clientWidth,stage.clientHeight,image.naturalWidth||16,image.naturalHeight||9);}
function drawAnnotations(){
 const layer=$('annotation-layer');layer.replaceChildren();if(!draft||$('slide-image').hidden)return;
 const b=bounds(),time=presenter.position??offset;
 for(const a of [...marks().filter(a=>!playing||annotationActive(a,time)),...(previewBox?[previewBox]:[])]){
  const node=document.createElementNS(svgNS,a.style==='circle'?'ellipse':a.style==='underline'?'line':'rect');
  const x=b.x+a.x*b.width,y=b.y+a.y*b.height,w=a.w*b.width,h=a.h*b.height;
  const attrs=a.style==='circle'?{cx:x+w/2,cy:y+h/2,rx:w/2,ry:h/2}:a.style==='underline'?{x1:x,y1:y+h,x2:x+w,y2:y+h}:{x,y,width:w,height:h,rx:5};
  for(const [key,value] of Object.entries(attrs))node.setAttribute(key,value);
  node.setAttribute('fill',a.style==='highlight'?'rgba(255,216,45,.25)':'none');node.setAttribute('stroke','#ffbd17');node.setAttribute('stroke-width','3');layer.append(node);
 }
}
function persistAnnotations(){
 try{const all=JSON.parse(localStorage.getItem('ultra-authoring-v1')||'[]'),target=all.find(d=>d.id===draft.id);if(!target)throw Error('Lecture no longer exists.');target.annotations=draft.annotations;target.annotationGeneration=draft.annotationGeneration;localStorage.setItem('ultra-authoring-v1',JSON.stringify(all));$('annotation-status').textContent='Annotation saved.';fetch('/api/authoring-backup',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({drafts:all,selected:draft.id,savedAt:new Date().toISOString()})}).then(r=>{if(!r.ok)throw Error();}).catch(()=>{$('annotation-status').textContent='Saved in browser; local backup unavailable.';});}catch(error){$('annotation-status').textContent='Could not save: '+error.message;}
}
function renderAnnotations(){
 if(!draft)return;marking=false;anchor=null;previewBox=null;$('annotation-layer').classList.remove('marking');
 const section=sections[draft.voice.clips[index].section-1]||'';$('annotation-hint').textContent='Suggested target: '+(section.match(/### Pointing cue\s*\n([\s\S]*?)(?=### |$)/)?.[1]?.trim()||'Choose the relevant area.');
 $('mark-annotation').disabled=$('slide-image').hidden;$('annotation-list').replaceChildren();
 marks().forEach((a,i)=>{const row=document.createElement('div'),label=document.createElement('span');label.textContent=(a.generated?'AI · ':'Manual · ')+a.style+' · '+a.start+'–'+(a.start+a.duration)+'s ';const remove=document.createElement('button');remove.textContent='Remove';remove.onclick=()=>{marks().splice(i,1);persistAnnotations();renderAnnotations();};row.append(label,remove);$('annotation-list').append(row);});drawAnnotations();
}
$('mark-annotation').onclick=()=>{halt();marking=true;$('annotation-layer').classList.add('marking');$('annotation-status').textContent='Drag across the slide to mark the target. It will appear during this clip’s selected time window.';};
function eventPoint(e){const rect=$('annotation-layer').getBoundingClientRect();return normalizedPoint(e.clientX-rect.left,e.clientY-rect.top,bounds());}
$('annotation-layer').onpointerdown=e=>{if(!marking)return;anchor=eventPoint(e);e.currentTarget.setPointerCapture(e.pointerId);};
$('annotation-layer').onpointermove=e=>{if(!anchor)return;const p=eventPoint(e);previewBox={x:Math.min(p.x,anchor.x),y:Math.min(p.y,anchor.y),w:Math.abs(p.x-anchor.x),h:Math.abs(p.y-anchor.y),style:$('annotation-style').value};drawAnnotations();};
$('annotation-layer').onpointerup=e=>{if(!anchor)return;const p=eventPoint(e),a={x:Math.min(p.x,anchor.x),y:Math.min(p.y,anchor.y),w:Math.abs(p.x-anchor.x),h:Math.abs(p.y-anchor.y),style:$('annotation-style').value,start:Number($('annotation-start').value),duration:Number($('annotation-duration').value)};anchor=null;previewBox=null;if(a.w<.005||a.h<.005||!Number.isFinite(a.start)||a.start<0||!Number.isFinite(a.duration)||a.duration<.5){$('annotation-status').textContent='Draw a larger area and enter valid timing.';drawAnnotations();return;}draft.annotations??={};(draft.annotations[currentAnnotationKey()]??=[]).push(a);persistAnnotations();renderAnnotations();};
$('annotation-layer').onpointercancel=()=>{anchor=null;previewBox=null;drawAnnotations();};
$('slide-image').addEventListener('load',drawAnnotations);window.addEventListener('resize',drawAnnotations);
function tickAnnotations(){if(playing)drawAnnotations();annotationFrame=requestAnimationFrame(tickAnnotations);}tickAnnotations();
window.addEventListener('pagehide',()=>cancelAnimationFrame(annotationFrame));

$('generate-ai-annotations').onclick=async()=>{
 if(annotationJob||!draft)return;
 if(slidesLoading){$('ai-annotation-status').textContent='Wait for the original slides to finish rendering.';return;}
 halt();const controller=new AbortController();annotationJob=controller;$('generate-ai-annotations').disabled=true;$('cancel-ai-annotations').hidden=false;$('play').disabled=true;
 let completed=0;
 try{
  const source=draft.sources.find(s=>s.id===draft.presentation.sourceId);
  for(const clip of draft.voice.clips){
   const section=sections[clip.section-1]||'',slide=Number(section.match(/^Original slide:\s*(\d+)/m)?.[1]),key=annotationKey(draft,clip,slide);
   if(draft.annotationGeneration?.[key]){completed++;continue;}
   const page=renderedPages.find(a=>a.page===slide)||source.import?.assets?.find(a=>a.kind==='page'&&a.page===slide);
   if(!page)throw Error('Original slide '+slide+' is unavailable. Render the deck first.');
   $('ai-annotation-status').textContent='AI inspecting slide '+slide+' · clip '+(completed+1)+' of '+draft.voice.clips.length+'…';
   const response=await fetch('/api/annotations',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({ai:draft.ai,text:clip.text,imageUrl:page.url,cue:section})}),data=await response.json();if(!response.ok)throw Error(data.error||'Annotation generation failed.');
   draft.annotations??={};draft.annotationGeneration??={};draft.annotations[key]=[...(draft.annotations[key]||[]).filter(a=>!a.generated),...data.annotations];draft.annotationGeneration[key]={model:data.model,at:new Date().toISOString()};persistAnnotations();completed++;renderAnnotations();
  }
  $('ai-annotation-status').textContent='AI annotations ready for '+completed+' clips. Press Play to review them.';$('generate-ai-annotations').textContent='AI annotations generated';
 }catch(error){$('ai-annotation-status').textContent=error.name==='AbortError'?'Stopped. Completed clips are saved; click Generate to resume.':error.message;}
 finally{annotationJob=null;$('generate-ai-annotations').disabled=false;$('cancel-ai-annotations').hidden=true;$('play').disabled=slidesLoading;}
};
$('cancel-ai-annotations').onclick=()=>annotationJob?.abort();
