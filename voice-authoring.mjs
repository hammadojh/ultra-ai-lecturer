export const voiceModel='Kokoro-82M · Bella (English)';
export function voiceFingerprint(d){return JSON.stringify({direction:d.direction?.markdown,input:d.direction?.input,voice:voiceModel});}
export function narrationClips(markdown){
 const blocks=[...markdown.matchAll(/^### Approved narration — verbatim\s*\n([\s\S]*?)(?=^### |^## |$(?![\s\S]))/gm)].map(m=>m[1].trim());
 if(!blocks.length||blocks.some(b=>!b))throw Error('Keep the Approved narration — verbatim blocks in the presenter instructions.');
 const clips=[];
 for(const [index,block] of blocks.entries()){
  let rest=block;
  while(rest.length){let length=Math.min(600,rest.length);if(length<rest.length){const portion=rest.slice(0,length),boundary=Math.max(portion.lastIndexOf('. '),portion.lastIndexOf('? '),portion.lastIndexOf('! '));length=boundary>150?boundary+1:portion.lastIndexOf(' ');if(length<1)length=600;}
   clips.push({id:'clip-'+(clips.length+1),section:index+1,text:rest.slice(0,length).trim(),url:null,reviewed:false});rest=rest.slice(length).trim();
  }
 }
 return clips;
}
export function voiceReady(d){return !!d.voice&&d.voice.input===voiceFingerprint(d)&&d.voice.clips.length>0&&d.voice.clips.every(c=>!!c.url);}
