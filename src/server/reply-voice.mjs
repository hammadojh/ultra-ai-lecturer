import {settings,model as narrationModel} from './eleven-voice.mjs';
export function voiceProfile(value){
 if(!value)return null;
 if(value.provider!=='elevenlabs'||typeof value.voiceId!=='string'||!value.voiceId.match(/^[a-zA-Z0-9_-]{1,100}$/)||typeof value.model!=='string'||!/^eleven_[a-zA-Z0-9_]{1,80}$/.test(value.model))throw Error('Invalid lecture voice profile.');
 const voiceSettings={};
 for(const [k,min,max] of [['stability',0,1],['similarity_boost',0,1],['style',0,1],['speed',.7,1.2]])if(value.settings?.[k]!==undefined){const n=value.settings[k];if(!Number.isFinite(n)||n<min||n>max)throw Error('Invalid voice setting.');voiceSettings[k]=n;}
 if(typeof value.settings?.use_speaker_boost==='boolean')voiceSettings.use_speaker_boost=value.settings.use_speaker_boost;
 return {provider:'elevenlabs',voiceId:value.voiceId,model:value.model,settings:voiceSettings};
}
export function generationVoiceProfile(metadata){
 if(!metadata||!['ElevenLabs API','elevenlabs'].includes(metadata.provider))return null;
 return voiceProfile({provider:'elevenlabs',voiceId:metadata.voice_id,model:metadata.model,settings:metadata.voice_settings||{}});
}
export async function configuredProfile(root){const cfg=await settings(root);return voiceProfile({provider:'elevenlabs',voiceId:cfg.voiceId,model:process.env.ULTRA_REPLY_VOICE_MODEL||'eleven_flash_v2_5',settings:{speed:1}});}
export async function publishedVoiceProfile(root,d){
 if(d.voiceProfile||d.classroom?.voiceProfile||d.voice?.profile)return voiceProfile(d.voiceProfile||d.classroom?.voiceProfile||d.voice.profile);
 if(d.packageToken&&/^[0-9a-f-]{36}$/.test(d.packageToken)){
  const {readFile}=await import('node:fs/promises');const path=await import('node:path');
  let metadata;try{metadata=JSON.parse(await readFile(path.join(root,'.cache/packages',d.packageToken,'files/audio-generation.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
  const recovered=generationVoiceProfile(metadata);if(recovered)return recovered;
 }
 const profiles=(d.voice?.clips||[]).map(c=>c.voiceProfile).filter(Boolean);
 if(profiles.length){const profile=voiceProfile(profiles[0]);if(profiles.some(p=>JSON.stringify(voiceProfile(p))!==JSON.stringify(profile)))throw Error('Lecture clips use different voices. Regenerate them with one voice before publishing.');return profile;}
 // Recover metadata from the actual generated clips instead of guessing the voice.
 const {readFile}=await import('node:fs/promises');const path=await import('node:path');
 for(const clip of d.voice?.clips||[]){const key=/\/([a-f0-9]{64})\.mp3$/.exec(clip.url||'')?.[1];if(!key)continue;try{const audio=JSON.parse(await readFile(path.join(root,'.cache/speech',key+'.json'),'utf8'));if(audio.voice)return voiceProfile({provider:'elevenlabs',voiceId:audio.voice,model:audio.model||narrationModel,settings:audio.settings||{}});}catch{}}
 return null;
}
export async function replySpeech({text,profile,root,signal,fallback,request=fetch,preferFallback=false}){
 const cfg=await settings(root);
 try{
  signal?.throwIfAborted();if(preferFallback)throw Error('Using fallback for this reply');if(!cfg.apiKey)throw Error('ElevenLabs unavailable');
  profile=voiceProfile(profile)||await configuredProfile(root);
  const response=await request('https://api.elevenlabs.io/v1/text-to-speech/'+encodeURIComponent(profile.voiceId)+'/with-timestamps?output_format=mp3_44100_128',{method:'POST',headers:{'xi-api-key':cfg.apiKey,'Content-Type':'application/json'},signal:AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(8000)]),body:JSON.stringify({text,model_id:profile.model,voice_settings:profile.settings})});
  if(!response.ok)throw Error('ElevenLabs speech unavailable');const data=await response.json(),a=data.normalized_alignment||data.alignment;
  if(!data.audio_base64||!a?.characters?.length)throw Error('Missing speech or timing');
  const {alignmentData}=await import('./eleven-voice.mjs');
  return {audio:data.audio_base64,...alignmentData({characters:a.characters,characterStartTimesSeconds:a.character_start_times_seconds,characterEndTimesSeconds:a.character_end_times_seconds}),model:profile.model,voice:profile.voiceId,provider:'elevenlabs'};
 }catch(error){if(signal?.aborted)throw error;const localSignal=AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(30000)]);
  const result=await abortable(fallback(text,localSignal),localSignal);signal?.throwIfAborted();return {...result,provider:'kokoro',fallback:true};}
}

function abortable(promise,signal){
 return new Promise((resolve,reject)=>{const abort=()=>reject(signal.reason);signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();Promise.resolve(promise).then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));});
}
