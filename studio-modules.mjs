export const studioModules=[
 {id:'material',name:'Material maker',input:['sources'],output:'Lesson article',description:'A source-grounded article with explanations, worked examples, guided practice and checks for understanding.',available:true},
 {id:'planner',name:'Lecture planner',input:['material'],output:'Timed teaching plan',description:'Plan conceptual learning, practical activities and discussion within a fixed duration, independently of slides.'},
 {id:'slides',name:'Slides maker',input:['material','planner'],output:'Teaching slide deck',description:'Translate the article and teaching plan into a minimal deck with objectives, practice and closure.'},
 {id:'retoucher',name:'Slides retoucher',input:['slides'],output:'Visual slide deck',description:'Improve hierarchy, color, figures, tables and assets while preserving the teaching content.'},
 {id:'animator',name:'Slide animator',input:['retoucher'],output:'Animated deck',description:'Use purposeful reveals and motion to explain relationships, sequence and change.'},
 {id:'script',name:'Script generator',input:['material','planner','animator'],output:'Synchronized script',description:'Write the exact introduction, explanation, instructions and questions against slide events.'},
 {id:'toner',name:'Script toner',input:['animator','script'],output:'Toned script',description:'Direct pacing, emphasis, pauses and emotional tone for each spoken segment.'},
 {id:'speech',name:'Speech generator',input:['animator','toner'],output:'Voice clips and timings',description:'Generate modular voice clips using the selected voice model. Reuse unchanged clips.'},
 {id:'annotations',name:'Annotator',input:['animator','toner','speech'],output:'Timed annotations',description:'Optional highlights and pointing cues synchronized with speech.',optional:true},
 {id:'avatar',name:'Avatar chooser',input:['toner','speech'],output:'Presenter selection',description:'Choose the presenter, preview lip-sync and rehearse the complete lecture.'}
];
export function sourceFingerprint(p){return JSON.stringify({title:p.title,audience:p.audience,sources:p.sources});}
export function materialCurrent(p){return !!p.article&&p.article.input===sourceFingerprint(p);}
export function validateProject(p){
 if(typeof p.title!=='string'||!p.title.trim()||p.title.length>160)throw Error('Enter a lesson title (up to 160 characters).');
 if(typeof p.audience!=='string'||p.audience.length>1000)throw Error('Enter an audience description.');
 if(!Array.isArray(p.sources)||p.sources.length>30||p.sources.some(s=>typeof s.id!=='string'||typeof s.name!=='string'||typeof s.text!=='string')||new Set(p.sources.map(s=>s.id)).size!==p.sources.length)throw Error('Invalid lesson sources.');
 if(p.sources.reduce((n,s)=>n+s.text.length,0)>2000000)throw Error('Source storage limit exceeded.');
 return p;
}
