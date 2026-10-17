import {annotationKey} from './annotations.mjs';
export function classroomLecture(d,pages){
 const sections=d.direction.markdown.split(/^## /m).filter(s=>/^.+\[\d+:\d{2}[–-]\d+:\d{2}\]/.test(s));
 const source=d.sources.find(s=>s.id===d.presentation.sourceId);
 const segments=d.voice.clips.map((clip,i)=>{const section=sections[clip.section-1]||'',slide=Number(section.match(/^Original slide:\s*(\d+)/m)?.[1]),kind=section.match(/^Type:\s*(\w+)/m)?.[1],boundary=i===d.voice.clips.length-1||d.voice.clips[i+1].section!==clip.section;
 return {...clip,prepared:true,slide:String(slide),duration:Math.max(2,clip.text.split(/\s+/).length/2.2),holdAfter:boundary&&kind==='checkpoint',finalCheckpoint:boundary&&kind==='final_qa',question:clip.text,answerSeconds:30,annotations:d.annotations?.[annotationKey(d,clip,slide)]||[]};});
 const numbers=[...new Set(segments.map(s=>s.slide))];
 const slides=numbers.map(number=>{const page=pages.find(p=>p.page===Number(number));if(!page)throw Error('Original slide '+number+' is missing.');return {id:number,chapter:'SLIDE '+number,title:'',body:'',html:'',image:page.url};});
 return {id:d.id,title:d.title,discussion:{budgetSeconds:90,idleSeconds:30,reserveSeconds:20},slides,segments,sourceText:source.text};
}
