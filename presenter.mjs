import { TalkingHead } from './node_modules/@met4citizen/talkinghead/modules/talkinghead.mjs';

export class Presenter {
  constructor(node,onStatus){this.node=node;this.onStatus=onStatus;this.cache=new Map();this.token=0;this.active=null;this.ready=null;}
  init(){
    if(this.ready)return this.ready;
    this.ready=(async()=>{
      this.onStatus('Loading 3D lecturer…');
      this.head=new TalkingHead(this.node,{cameraView:'upper',cameraRotateEnable:false,cameraPanEnable:false,cameraZoomEnable:false,modelFPS:30,modelPixelRatio:Math.min(devicePixelRatio,2),lipsyncModules:[],lightAmbientIntensity:1.2,lightDirectIntensity:8,avatarMood:'neutral'});
      await this.head.showAvatar({url:'./assets/avatars/lecturer.glb',body:'F',avatarMood:'neutral',lipsyncLang:'en'});
      this.onStatus('3D lecturer ready');
    })().catch(error=>{this.ready=null;this.onStatus('Presenter unavailable: '+error.message);throw error;});
    return this.ready;
  }
  async clip(segment){
    if(!this.cache.has(segment.id)){
      const promise=(async()=>{
        const response=await fetch('/api/speech',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({segmentId:segment.id})});
        const data=await response.json();if(!response.ok)throw new Error(data.error||'Speech unavailable');
        const bytes=Uint8Array.from(atob(data.audio),c=>c.charCodeAt(0));
        const audio=await this.head.audioCtx.decodeAudioData(bytes.buffer);
        return {...data,audio};
      })().catch(error=>{this.cache.delete(segment.id);throw error;});
      this.cache.set(segment.id,promise);
    }
    return this.cache.get(segment.id);
  }
  async play(segment,offset,{onReady,onEnd,onError}){
    const token=++this.token;
    try{
      await this.init();if(token!==this.token)return;
      this.onStatus('Preparing speech…');
      const clip=await this.clip(segment);if(token!==this.token)return;
      this.head.stopSpeaking();this.head.start();await this.head.audioCtx.resume();
      if(token!==this.token)return;
      offset=Math.min(offset,Math.max(0,clip.audio.duration-.01));
      const startSample=Math.floor(offset*clip.audio.sampleRate);
      const audio=this.head.audioCtx.createBuffer(clip.audio.numberOfChannels,clip.audio.length-startSample,clip.audio.sampleRate);
      for(let channel=0;channel<audio.numberOfChannels;channel++)audio.copyToChannel(clip.audio.getChannelData(channel).subarray(startSample),channel);
      const data={audio,words:[],wtimes:[],wdurations:[],visemes:[],vtimes:[],vdurations:[]};
      for(const [values,times,durations] of [['words','wtimes','wdurations'],['visemes','vtimes','vdurations']]){
        for(let i=0;i<(clip[values]?.length||0);i++){
          const end=clip[times][i]+clip[durations][i]-offset*1000;if(end<=0)continue;
          const start=Math.max(0,clip[times][i]-offset*1000);
          data[values].push(clip[values][i]);data[times].push(start);data[durations].push(end-start);
        }
      }
      this.active={id:segment.id,start:this.head.audioCtx.currentTime,offset,duration:clip.audio.duration};
      this.head.speakAudio(data,{isRaw:true});
      this.head.speakMarker(()=>{if(token!==this.token)return;this.active=null;this.onStatus('Ready');onEnd();});
      this.onStatus(clip.cached?'Speaking · cached voice':'Speaking · local voice');
      onReady(clip.audio.duration);
    }catch(error){if(token!==this.token)return;this.active=null;this.onStatus('Speech unavailable');onError(error);}
  }
  get position(){return this.active?Math.min(this.active.duration,this.active.offset+this.head.audioCtx.currentTime-this.active.start):null;}
  stop(){this.token++;this.active=null;if(this.head){this.head.stopSpeaking();this.head.stop();}}
  idle(){if(this.head)this.head.start();}
  mute(value){this.head?.setMixerGain(value?0:1);}
}
