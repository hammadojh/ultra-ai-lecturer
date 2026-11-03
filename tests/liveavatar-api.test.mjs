import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createLiveAvatarApi} from '../liveavatar-api.mjs';
test('HeyGen session credentials stay server-side and another user cannot stop a session',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'ultra-heygen-'));await mkdir(path.join(root,'.cache/liveavatar'),{recursive:true});await writeFile(path.join(root,'.cache/liveavatar/key'),'test-workspace-key');const calls=[];
 const service=createLiveAvatarApi({root,request:async(url,options)=>{calls.push({url,...options,body:JSON.parse(options.body)});return {ok:true,json:async()=>({data:url.endsWith('/token')?{session_token:'private-session-token'}:url.endsWith('/start')?{session_id:'session',livekit_url:'wss://test',livekit_client_token:'client-token',livekit_agent_token:'private-agent-token',ws_url:'wss://control'}:null})};}});
 try{await assert.rejects(service.start('owner','default'),/HeyGen/);const session=await service.start('owner','heygen-wayne');assert.equal(session.livekit_client_token,'client-token');assert.equal(session.livekit_agent_token,undefined);assert.equal(session.session_token,undefined);assert.equal(calls[0].body.video_settings.quality,'low');assert.equal(calls[0].body.max_session_duration,120);await service.stop('another-user','session');assert.equal(calls.length,2);await service.stop('owner','session');assert.equal(calls.length,3);assert.equal(calls[2].body.session_id,'session');}finally{await service.close();await rm(root,{recursive:true,force:true});}
});
