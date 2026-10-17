import {scriptInput} from './scripting.mjs';
import {directorFingerprint} from './directing.mjs';
import {voiceReady} from './voice-authoring.mjs';
import {annotationKey} from './annotations.mjs';
export function publicationSnapshot(d){
 scriptInput(d);
 if(!/^[a-zA-Z0-9-]{1,80}$/.test(d.id)||!d.script?.approved||d.script.input!==JSON.stringify({setup:d.plan.input,plan:d.plan.markdown})||!d.direction?.approved||d.direction.input!==directorFingerprint(d)||!d.voice?.approved||!voiceReady(d)||!d.annotationsApproved)throw Error('Approve all current authoring stages before publishing.');
 const sections=d.direction.markdown.split(/^## /m).filter(s=>/^.+\[\d+:\d{2}[–-]\d+:\d{2}\]/.test(s));
 for(const clip of d.voice.clips){const slide=Number(sections[clip.section-1]?.match(/^Original slide:\s*(\d+)/m)?.[1]);if(!d.annotationGeneration?.[annotationKey(d,clip,slide)])throw Error('Generate and approve annotations for every current clip.');}
 return {id:d.id,title:d.title,brief:d.brief,presentation:d.presentation,sources:d.sources,ai:d.ai,approved:d.approved,plan:d.plan,script:d.script,direction:d.direction,voice:d.voice,annotations:d.annotations||{},annotationGeneration:d.annotationGeneration,annotationsApproved:d.annotationsApproved,publishedAt:new Date().toISOString()};
}
