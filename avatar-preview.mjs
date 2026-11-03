import {Presenter} from './presenter.mjs';
import {avatars} from './avatar-catalog.mjs';
const id=new URLSearchParams(location.search).get('avatar')||'default';
const status=document.querySelector('#status'),node=document.querySelector('#avatar'),avatar=avatars.find(a=>a.id===id);
if(avatar?.provider){
 const image=document.createElement('img');image.src=avatar.previewUrl;image.alt=avatar.name;image.style.cssText='width:100%;height:100%;object-fit:contain';node.append(image);
 const controls=document.createElement('div');controls.style.cssText='position:absolute;top:12px;left:12px;display:flex;gap:8px';
 const start=document.createElement('button');start.textContent='Start live preview';const stop=document.createElement('button');stop.textContent='Stop';stop.disabled=true;controls.append(start,stop);document.body.append(controls);status.textContent='Static preview · live preview uses '+(avatar.provider==='simli'?'Simli':'HeyGen')+' credits.';let presenter;
 start.onclick=async()=>{start.disabled=true;try{presenter=new Presenter(node,text=>status.textContent=text,id);stop.disabled=false;await presenter.play({id:'preview',live:true,audioUrl:'/api/liveavatar/sample'},0,{onReady:()=>{},onEnd:()=>{presenter.disconnect();start.disabled=false;stop.disabled=true;status.textContent='Preview ended';},onError:e=>{presenter.disconnect();start.disabled=false;stop.disabled=true;status.textContent=e.message;}});}catch(e){start.disabled=false;status.textContent=e.message;}};
 stop.onclick=()=>{presenter?.stop();presenter?.disconnect();start.disabled=false;stop.disabled=true;status.textContent='Preview stopped';};document.body.dataset.ready='true';
}else{
 const presenter=new Presenter(node,text=>status.textContent=text,id);
 try{await presenter.init();status.textContent='';document.body.dataset.ready='true';}catch(e){status.textContent='Preview unavailable: '+e.message;document.body.dataset.ready='error';}
}
