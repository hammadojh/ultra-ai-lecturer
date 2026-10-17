import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {mkdir,readFile,writeFile,rename,chmod} from 'node:fs/promises';
import {createRemoteJWKSet,jwtVerify} from 'jose';
const directory=new URL('./.cache/chatgpt/',import.meta.url),file=new URL('connection.json',directory);
const issuer='https://auth.openai.com',resource='https://api.openai.com/v1';
const redirect='http://127.0.0.1:4173/auth/chatgpt/callback';
const jwks=createRemoteJWKSet(new URL(issuer+'/.well-known/jwks.json'));
let record,loading,refreshing;const attempts=new Map();let sessionVersion=0;
const random=()=>randomBytes(32).toString('base64url');
async function persist(){
 await mkdir(directory,{recursive:true,mode:0o700});await chmod(directory,0o700);
 const temporary=new URL('connection-'+randomUUID()+'.tmp',directory);
 await writeFile(temporary,JSON.stringify(record),{mode:0o600});await rename(temporary,file);await chmod(file,0o600);
}
async function load(){
 if(record)return record;
 if(!loading)loading=(async()=>{try{record=JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw Error('Cannot read the ChatGPT connection.');record={host:'urn:uuid:'+randomUUID()};await persist();}return record;})();
 return loading;
}
export async function connectionStatus(){const r=await load();return {connected:!!r.access_token,enabled:!!r.scopes?.includes('chatgpt.tokens.use.direct'),email:r.access_token?r.email:null};}
export async function beginSignIn(){
 const r=await load(),state=random(),nonce=random(),verifier=random();
 for(const [key,value] of attempts)if(value.expires<Date.now())attempts.delete(key);
 if(attempts.size>=10)attempts.delete(attempts.keys().next().value);
 const client=r.client_id||'dynamic_agent_client';
 attempts.set(state,{nonce,verifier,client,subject:r.subject,expires:Date.now()+600000});
 const url=new URL(issuer+'/api/accounts/authorize');
 const params={client_id:client,ext_agent_host_id:r.host,response_type:'code',redirect_uri:redirect,scope:'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct',resource,state,nonce,code_challenge_method:'S256',code_challenge:createHash('sha256').update(verifier).digest('base64url')};
 if(client==='dynamic_agent_client')params.agent_name_hint='Ultra AI Lecturer';
 // No tokens or email hints in browser-visible authorization URLs.
 for(const [k,v] of Object.entries(params))url.searchParams.set(k,v);
 return {url:url.href,state};
}
async function tokenRequest(params){
 const response=await fetch(issuer+'/api/accounts/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...params,resource}),signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error('ChatGPT authorization could not be completed. Please sign in again.');
 return response.json();
}
export async function finishSignIn(url,cookieState){
 const state=url.searchParams.get('state'),attempt=attempts.get(state);
 if(!state||state!==cookieState||!attempt||attempt.expires<Date.now())throw Error('Sign-in expired or could not be verified. Try again.');
 attempts.delete(state);
 if(url.searchParams.has('error'))throw Error('ChatGPT sign-in was cancelled or declined.');
 const code=url.searchParams.get('code'),returned=url.searchParams.get('client_id');
 const client=attempt.client==='dynamic_agent_client'?returned:attempt.client;
 if(!code||!client||client==='dynamic_agent_client'||(attempt.client!=='dynamic_agent_client'&&returned&&returned!==client))throw Error('Invalid ChatGPT registration response.');
 const tokens=await tokenRequest({grant_type:'authorization_code',client_id:client,code,code_verifier:attempt.verifier,redirect_uri:redirect});
 const {payload}=await jwtVerify(tokens.id_token,jwks,{issuer,audience:client,requiredClaims:['exp','sub','nonce']});
 if(payload.nonce!==attempt.nonce||(attempt.subject&&payload.sub!==attempt.subject))throw Error('ChatGPT account verification failed.');
 if(typeof tokens.access_token!=='string'||typeof tokens.expires_in!=='number')throw Error('ChatGPT returned an incomplete connection.');
 const scopes=String(tokens.scope||'').split(' ');
 const r=await load();
 record={host:r.host,client_id:client,subject:payload.sub,email:payload.email||null,id_token:tokens.id_token,access_token:tokens.access_token,refresh_token:tokens.refresh_token,expires:Date.now()+tokens.expires_in*1000,scopes};
 sessionVersion++;await persist();
 return scopes.includes('chatgpt.tokens.use.direct');
}
async function accessToken(){
 const r=await load();if(!r.access_token||!r.scopes?.includes('chatgpt.tokens.use.direct'))throw Error('Connect ChatGPT and allow plan usage before generating.');
 if(r.expires>Date.now()+60000)return r.access_token;
 if(!refreshing)refreshing=(async()=>{
  if(!r.refresh_token)throw Error('ChatGPT connection expired. Please sign in again.');
  const version=sessionVersion,tokens=await tokenRequest({grant_type:'refresh_token',client_id:r.client_id,refresh_token:r.refresh_token});
  if(version!==sessionVersion)throw Error('ChatGPT connection changed.');
  if(typeof tokens.access_token!=='string'||!Number.isFinite(tokens.expires_in)||tokens.expires_in<=0)throw Error('ChatGPT returned an incomplete connection. Reconnect.');
  record={...record,access_token:tokens.access_token,refresh_token:tokens.refresh_token||r.refresh_token,expires:Date.now()+tokens.expires_in*1000,scopes:tokens.scope?tokens.scope.split(' '):r.scopes};
  if(!record.access_token||!record.scopes.includes('chatgpt.tokens.use.direct'))throw Error('ChatGPT plan permission is unavailable. Reconnect.');
  await persist();return record.access_token;
 })().finally(()=>{refreshing=null;});
 return refreshing;
}
export async function availableModels(){
 const token=await accessToken();
 const response=await fetch(resource+'/models',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error('Could not load ChatGPT models. Reconnect or check your plan availability.');
 const data=await response.json();
 return (data.models||[]).filter(m=>m.visibility==='list'&&typeof m.slug==='string').map(m=>({id:m.slug,name:m.display_name||m.slug}));
}
export async function disconnect(){
 const r=await load();sessionVersion++;attempts.clear();let revoked=!r.refresh_token;
 if(r.refresh_token)try{
  const discovery=await fetch(issuer+'/.well-known/openid-configuration',{signal:AbortSignal.timeout(10000)}).then(r=>r.json());
  const endpoint=new URL(discovery.revocation_endpoint);if(endpoint.origin!==issuer)throw Error();
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:r.refresh_token,token_type_hint:'refresh_token',client_id:r.client_id}),signal:AbortSignal.timeout(10000)});
  revoked=response.status===200;
 }catch{}
 record={host:r.host,client_id:r.client_id,subject:r.subject};await persist();
 return {revoked};
}
export async function readResponseStream(body){
 const reader=body.getReader(),decoder=new TextDecoder();let buffer='',text='',completed=false;
 try{
  while(true){
   const {value,done}=await reader.read();buffer+=decoder.decode(value||new Uint8Array(),{stream:!done});
   let boundary;
   while((boundary=buffer.indexOf('\n'))>=0){
    const line=buffer.slice(0,boundary).trim();buffer=buffer.slice(boundary+1);
    if(!line.startsWith('data:'))continue;const raw=line.slice(5).trim();if(raw==='[DONE]')continue;
    const event=JSON.parse(raw);
    if(event.type==='response.output_text.delta')text+=event.delta;
    if(['response.failed','response.incomplete','error'].includes(event.type))throw Error('ChatGPT could not finish the plan ('+(event.response?.error?.code||event.code||event.type)+'). Check your plan limits or retry.');
    if(event.type==='response.completed')completed=true;
   }
   if(done)break;
  }
 }catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
 if(!completed)throw Error('ChatGPT response was interrupted. The previous plan is unchanged.');
 return text;
}
export async function chatgptPlan({model,instructions,input,schema,signal}){
 const models=await availableModels();if(!models.some(m=>m.id===model))throw Error('Choose a model available to your ChatGPT account.');
 const token=await accessToken(),version=sessionVersion;
 const response=await fetch(resource+'/responses',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},signal,body:JSON.stringify({model,instructions,input:[{role:'user',content:input}],store:false,stream:true,text:{format:{type:'json_schema',name:'lecture_plan',strict:true,schema}}})});
 if(!response.ok)throw Error('ChatGPT request failed ('+response.status+'). Check account access and usage limits; you can switch to Local AI.');
 const result=await readResponseStream(response.body);
 if(version!==sessionVersion)throw Error('ChatGPT connection changed. Generate again.');
 return result;
}
