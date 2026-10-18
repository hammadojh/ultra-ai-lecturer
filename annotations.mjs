export function imageBounds(width,height,imageWidth,imageHeight){const scale=Math.min(width/imageWidth,height/imageHeight),w=imageWidth*scale,h=imageHeight*scale;return {x:(width-w)/2,y:(height-h)/2,width:w,height:h};}
export function normalizedPoint(x,y,b){return {x:Math.max(0,Math.min(1,(x-b.x)/b.width)),y:Math.max(0,Math.min(1,(y-b.y)/b.height))};}
export function annotationActive(a,time){return time>=a.start&&time<a.start+a.duration;}
export function annotationKey(d,clip,slide){compactAnnotations(d);return compactAnnotationKey(JSON.stringify([d.presentation.sourceId,...(d.presentation.mode==='generated'?[d.direction.input]:[]),d.direction.markdown,clip.id,clip.text,slide]));}

// Four independent 32-bit accumulators keep content fingerprints small and synchronous.
export function compactAnnotationKey(value){
 let a=1779033703,b=3144134277,c=1013904242,d=2773480762;
 for(let i=0;i<value.length;i++){const k=value.charCodeAt(i);a=b^Math.imul(a^k,597399067);b=c^Math.imul(b^k,2869860233);c=d^Math.imul(c^k,951274213);d=a^Math.imul(d^k,2716044179);}
 a=Math.imul(c^(a>>>18),597399067);b=Math.imul(d^(b>>>22),2869860233);c=Math.imul(a^(c>>>17),951274213);d=Math.imul(b^(d>>>19),2716044179);
 return 'ann-v2-'+[a^b^c^d,b^a,c^a,d^a].map(n=>(n>>>0).toString(16).padStart(8,'0')).join('');
}
export function compactAnnotations(draft){
 for(const field of ['annotations','annotationGeneration']){
  const entries=draft[field];if(!entries)continue;
  for(const key of Object.keys(entries)){if(!key.startsWith('['))continue;const compact=compactAnnotationKey(key);if(!Object.hasOwn(entries,compact))entries[compact]=entries[key];delete entries[key];}
 }
 return draft;
}
export function readAuthoringDrafts(storage=localStorage){
 const original=storage.getItem('ultra-authoring-v1')||'[]',drafts=JSON.parse(original);
 if(!Array.isArray(drafts))throw Error('Invalid saved lecture drafts.');
 drafts.forEach(compactAnnotations);
 const compact=JSON.stringify(drafts);
 if(compact.length<original.length&&storage.setItem)storage.setItem('ultra-authoring-v1',compact);
 return drafts;
}
