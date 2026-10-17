import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {mkdir,readFile,writeFile,rename,chmod} from 'node:fs/promises';
const dir=new URL('./.cache/openrouter/',import.meta.url),file=new URL('connection.json',dir),api='https://openrouter.ai/api/v1';
let version=0;const attempts=new Map();
async function read(){try{return JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return {};throw Error('Cannot read OpenRouter connection.');}}
async function save(value){await mkdir(dir,{recursive:true,mode:0o700});await chmod(dir,0o700);const tmp=new URL(randomUUID()+'.tmp',dir);await writeFile(tmp,JSON.stringify(value),{mode:0o600});await rename(tmp,file);}
export async function connectionStatus(){return {connected:!!(await read()).key};}
export function beginSignIn(){
 const state=randomBytes(32).toString('base64url'),verifier=randomBytes(32).toString('base64url');
 for(const [key,a] of attempts)if(a.expires<Date.now())attempts.delete(key);
 if(attempts.size>=10)attempts.delete(attempts.keys().next().value);
 attempts.set(state,{verifier,expires:Date.now()+600000,version});
 const url=new URL('https://openrouter.ai/auth');url.search=new URLSearchParams({callback_url:'http://127.0.0.1:4173/auth/openrouter/callback',state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',key_label:'Ultra AI Lecturer'}).toString();return {url:url.href,state};
}
export async function finishSignIn(url,cookie){
 const state=url.searchParams.get('state'),a=attempts.get(state);
 if(!state||state!==cookie||!a||a.expires<Date.now())throw Error('OpenRouter sign-in expired or could not be verified.');
 attempts.delete(state);const code=url.searchParams.get('code');if(!code)throw Error('OpenRouter sign-in cancelled.');
 const response=await fetch(api+'/auth/keys',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code,code_verifier:a.verifier,code_challenge_method:'S256'}),signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error('OpenRouter authorization failed.');const data=await response.json();
 if(typeof data.key!=='string'||!data.key||a.version!==version)throw Error('OpenRouter connection changed or was invalid.');
 await save({key:data.key});version++;
}
export async function disconnect(){version++;attempts.clear();await save({});return {revoked:false};}
async function key(){const r=await read();if(!r.key)throw Error('Connect OpenRouter before generating.');return r.key;}
export function planningModels(data){return (data.data||[]).filter(m=>typeof m.id==='string'&&m.supported_parameters?.includes('structured_outputs')).map(m=>({id:m.id,name:m.name||m.id})).sort((a,b)=>a.name.localeCompare(b.name));}
export async function availableModels(){const response=await fetch(api+'/models',{headers:{Authorization:'Bearer '+await key()},signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('Could not load OpenRouter models. Reconnect and try again.');return planningModels(await response.json());}
export function completionText(data){const choice=data.choices?.[0];if(data.error||choice?.finish_reason!=='stop'||typeof choice.message?.content!=='string'||!choice.message.content)throw Error('OpenRouter did not return a complete plan. Check credits or try another model.');return choice.message.content;}
export async function openrouterPlan({model,messages,schema,signal}){
 const started=version,models=await availableModels();if(!models.some(m=>m.id===model))throw Error('Choose an OpenRouter model supporting structured outputs.');
 const response=await fetch(api+'/chat/completions',{method:'POST',signal,headers:{Authorization:'Bearer '+await key(),'Content-Type':'application/json','X-Title':'Ultra AI Lecturer'},body:JSON.stringify({model,messages,stream:false,provider:{require_parameters:true},response_format:{type:'json_schema',json_schema:{name:'lecture_plan',strict:true,schema}}})});
 if(!response.ok)throw Error('OpenRouter request failed ('+response.status+'). Check your credits, key limits and model access.');
 const content=completionText(await response.json());if(started!==version)throw Error('OpenRouter connection changed. Generate again.');return content;
}
