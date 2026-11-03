export const splitFingerprint=d=>JSON.stringify({title:d.title,brief:d.brief,presentation:d.presentation,ai:d.ai,sources:d.sources.map(({id,name,text})=>({id,name,text}))});
export function sourceUnits(sources){
 const units=[];
 for(const source of sources){let start=0;while(start<source.text.length){let end=Math.min(start+4000,source.text.length);if(end<source.text.length){const boundary=source.text.lastIndexOf('\n\n',end);if(boundary>start+1000)end=boundary+2;}const text=source.text.slice(start,end);units.push({index:units.length+1,sourceId:source.id,sourceName:source.name,start,end,chars:end-start,from:text.trim().slice(0,100),to:text.trim().slice(-100),sample:text.slice(0,450)+'\n…\n'+text.slice(-200)});start=end;}}
 return units;
}
export function validateSplit(value,units){
 if(!Array.isArray(value?.lectures)||!value.lectures.length||value.lectures.length>100)throw Error('Invalid lecture split. Retry.');let next=1;
 for(const p of value.lectures){if(!Number.isInteger(p.from)||!Number.isInteger(p.to)||p.from!==next||p.to<p.from||p.to>units.length||!['title','reason'].every(k=>typeof p[k]==='string'&&p[k].trim())||p.title.length>140||!Number.isInteger(p.minutes)||p.minutes<5||p.minutes>180)throw Error('The proposed split has a gap or invalid range. Retry.');if(units.slice(p.from-1,p.to).reduce((n,u)=>n+u.chars,0)>45000)throw Error('A proposed lecture is still too large. Retry the split.');next=p.to+1;}
 if(next!==units.length+1)throw Error('The proposed split omitted material. Retry.');return value;
}
export function splitSources(sources,units,part){
 return sources.flatMap(s=>{const selected=units.slice(part.from-1,part.to).filter(u=>u.sourceId===s.id);if(!selected.length)return [];const start=selected[0].start,end=selected.at(-1).end;const source=structuredClone(s);source.text=s.text.slice(start,end);source.coverage={start,end,from:selected[0].from,to:selected.at(-1).to};
 if(source.import?.sections){const sections=source.import.sections;const ranges=sections.map(section=>({section,offset:s.text.indexOf(section.text)}));source.import.sections=ranges.filter((r,i)=>r.offset<0||r.offset<end&&(ranges[i+1]?.offset??s.text.length)>start).map(r=>r.section);}
 return [source];});
}
