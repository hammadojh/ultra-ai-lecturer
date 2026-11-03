import {SimliPresenter} from './simli-presenter.mjs';
import {LiveAvatarPresenter} from './liveavatar-presenter.mjs';
import {avatarOptions} from './avatar-catalog.mjs';
import { TalkingHead } from './node_modules/@met4citizen/talkinghead/modules/talkinghead.mjs';

import { LipsyncEn } from './node_modules/@met4citizen/talkinghead/modules/lipsync-en.mjs';

export class Presenter {
  constructor(node,onStatus,avatar='default'){if(avatar.startsWith('simli-'))return new SimliPresenter(node,onStatus,avatar,Presenter.prototype.clip);if(avatar.startsWith('heygen-'))return new LiveAvatarPresenter(node,onStatus,avatar,Presenter.prototype.clip);this.avatar=avatar;if(avatar==='none'){node.hidden=true;const frame=node.closest('.floating-presenter');if(frame)frame.hidden=true;}this.node=node;this.onStatus=onStatus;this.cache=new Map();this.token=0;this.active=null;this.ready=null;}
  init(){
    if(this.ready)return this.ready;
    this.ready=(async()=>{
      if(this.avatar==='none'){
       this.node.hidden=true;const audioCtx=new AudioContext(),gain=audioCtx.createGain();gain.connect(audioCtx.destination);let source,marker;
       this.head={audioCtx,start(){},stop(){},stopSpeaking(){if(source){source.onended=null;source.stop();source=null;}marker=null;},setMixerGain(value){gain.gain.value=value;},speakAudio({audio}){source=audioCtx.createBufferSource();source.buffer=audio;source.connect(gain);source.onended=()=>{source=null;marker?.();};source.start();},speakMarker(fn){marker=fn;}};
       this.onStatus('Narration ready');return;
      }
      this.onStatus('Loading 3D lecturer…');
      this.head=new TalkingHead(this.node,{cameraView:'upper',cameraRotateEnable:false,cameraPanEnable:false,cameraZoomEnable:false,modelFPS:30,modelPixelRatio:Math.min(devicePixelRatio,2),lipsyncModules:[],lightAmbientIntensity:1.2,lightDirectIntensity:8,avatarMood:'neutral'});
      this.head.lipsync.en=new LipsyncEn();
      await this.head.showAvatar(avatarOptions(this.avatar));
      this.onStatus('3D lecturer ready');
    })().catch(error=>{this.ready=null;this.onStatus('Presenter unavailable: '+error.message);throw error;});
    return this.ready;
  }
  async clip(segment){
    if(!this.cache.has(segment.id)){
      const promise=(async()=>{
        let data,bytes;
        if(segment.audioData){
          data=segment.audioData;bytes=Uint8Array.from(atob(data.audio),c=>c.charCodeAt(0));
        }else if(segment.audioUrl){
          const response=await fetch(segment.audioUrl);if(!response.ok)throw Error('Uploaded audio is unavailable.');
          bytes=new Uint8Array(await response.arrayBuffer());data={words:segment.words||[],wtimes:segment.wtimes||[],wdurations:segment.wdurations||[],cached:true};
        }else{
          const response=await fetch(segment.prepared?'/api/authoring-playback':'/api/speech',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(segment.prepared?{text:segment.text}:{segmentId:segment.id})});
          data=await response.json();if(!response.ok)throw new Error(data.error||'Speech unavailable');
          bytes=Uint8Array.from(atob(data.audio),c=>c.charCodeAt(0));
        }
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
      this.active={id:segment.id,start:this.head.audioCtx.currentTime,offset,duration:clip.audio.duration,words:clip.words,wtimes:clip.wtimes};
      if(!data.visemes.length){delete data.visemes;delete data.vtimes;delete data.vdurations;}
      this.head.speakAudio(data,{isRaw:true});
      this.head.speakMarker(()=>{if(token!==this.token)return;this.active=null;this.onStatus('Ready');onEnd();});
      this.onStatus(clip.cached?'Speaking · cached voice':clip.model==='eleven_v4'?'Speaking · Eleven v4':'Speaking · local voice');
      onReady(clip.audio.duration);
    }catch(error){if(token!==this.token)return;this.active=null;this.onStatus('Speech unavailable');onError(error);}
  }
  get position(){return this.active?Math.min(this.active.duration,this.active.offset+this.head.audioCtx.currentTime-this.active.start):null;}
  stop(){this.token++;this.active=null;if(this.head){this.head.stopSpeaking();this.head.stop();}}
  idle(){if(this.head)this.head.start();}
  mute(value){this.head?.setMixerGain(value?0:1);}
}
