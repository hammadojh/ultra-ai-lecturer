import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepareWorkspace,workspaceFile,runtimeEnvironment,createUltraAgent} from '../src/server/ultra-agent.mjs';
import {zipSync,strToU8} from 'fflate';
const root=fileURLToPath(new URL('..',import.meta.url));
const manifest={format:'ultra-lecture',version:1,title:'Existing lesson',article:'article.md',slides:[{id:'s1',title:'One',image:'slides/1.png'}],segments:[{id:'c1',slide:'s1',text:'Hello',audio:'audio/1.wav',duration:1}]};

test('new and edit workspaces load every teaching skill and preserve editable package files',async()=>{
 const folder=await mkdtemp(path.join(tmpdir(),'ultra-agent-'));
 try{
  const catalog=JSON.parse(await readFile(path.join(root,'studio-skills.json')));
  assert.equal(await prepareWorkspace(root,folder),catalog.length);
  for(const skill of catalog)assert.equal(await readFile(path.join(folder,'.opencode/skills',skill.id,'SKILL.md'),'utf8'),await readFile(path.join(root,'studio-skills',skill.id,'SKILL.md'),'utf8'));
  assert.match(await readFile(path.join(folder,'AGENTS.md'),'utf8'),/output\/ultra-lecture.zip/);
  const bytes=zipSync({'lecture.json':strToU8(JSON.stringify(manifest)),'article.md':strToU8('Approved article'),'slides/1.png':new Uint8Array([1]),'audio/1.wav':new Uint8Array([1]),'slides.html':strToU8('<h1>Editable</h1>')});
  await prepareWorkspace(root,folder,{editing:true,title:'Existing lesson',packageBytes:bytes});
  assert.equal(await readFile(path.join(folder,'lecture/slides.html'),'utf8'),'<h1>Editable</h1>');
  assert.match(await readFile(path.join(folder,'AGENTS.md'),'utf8'),/preserve unaffected approved content/);
  const config=JSON.parse(await readFile(path.join(folder,'opencode.json')));assert.deepEqual(config.enabled_providers,['openai','openrouter']);assert.equal(config.default_agent,'ultra');assert.equal(config.permission.external_directory,'deny');
 }finally{await rm(folder,{recursive:true,force:true});}
});

test('package handoff rejects traversal, symlink escapes and directories',async()=>{
 const folder=await mkdtemp(path.join(tmpdir(),'ultra-agent-path-'));
 try{
  const workspace=path.join(folder,'work');await mkdir(path.join(workspace,'output'),{recursive:true});await writeFile(path.join(folder,'private'),'secret');await symlink(path.join(folder,'private'),path.join(workspace,'output/ultra-lecture.zip'));
  await assert.rejects(workspaceFile(workspace,'output/ultra-lecture.zip'),/outside/);
  for(const name of ['../private','/etc/passwd','output/../private','output\\private'])await assert.rejects(workspaceFile(workspace,name),/Invalid/);
  await assert.rejects(workspaceFile(workspace,'output'),/file up to/);
  await rm(path.join(workspace,'output/ultra-lecture.zip'));await writeFile(path.join(workspace,'output/ultra-lecture.zip'),'zip');assert.match(await workspaceFile(workspace,'output/ultra-lecture.zip'),/ultra-lecture.zip$/);
 }finally{await rm(folder,{recursive:true,force:true});}
});

test('runtime uses its own home and does not inherit model credentials or user config',()=>{
 const env=runtimeEnvironment('/tmp/ultra-isolated-home','test-password');
 assert.equal(env.HOME,'/tmp/ultra-isolated-home');assert.equal(env.XDG_DATA_HOME,'/tmp/ultra-isolated-home/data');assert.equal(env.OPENCODE_SERVER_PASSWORD,'test-password');
 for(const key of ['OPENAI_API_KEY','OPENROUTER_API_KEY','ANTHROPIC_API_KEY','OPENCODE_CONFIG','CODEX_HOME','NODE_OPTIONS'])assert.equal(env[key],undefined);
});

async function call(agent,user,route,data={},method='POST'){
 let status,result;const req={method,headers:{host:'127.0.0.1:4173'},async *[Symbol.asyncIterator](){yield Buffer.from(JSON.stringify(data));}};
 const res={writeHead(code){status=code;return this;},end(bytes){result=JSON.parse(bytes);}};
 await agent.api(req,res,new URL(route,'http://127.0.0.1:4173'),user);return {status,result};
}
test('rejects non-admin access, foreign sessions, and stale edit requests before launching an agent',async()=>{
 const folder=await mkdtemp(path.join(tmpdir(),'ultra-agent-api-'));const agent=createUltraAgent({root:folder,auth:{session(){return null;}},exportLecture(){throw Error('Must not export');}});
 try{
  assert.equal((await call(agent,{id:'student',role:'student'},'/api/ultra-agent/start')).status,403);
  const admin={id:'a',role:'admin'};assert.match((await call(agent,admin,'/api/ultra-agent/start',{id:'00000000-0000-0000-0000-000000000000'})).result.error,/not found for this account/);
  await mkdir(path.join(folder,'.cache/published'),{recursive:true});await writeFile(path.join(folder,'.cache/published/lesson.json'),JSON.stringify({id:'lesson',publishedAt:'current'}));
  assert.match((await call(agent,admin,'/api/ultra-agent/start',{replaceId:'lesson',expectedPublishedAt:'old'})).result.error,/changed/);
 }finally{agent.close();await rm(folder,{recursive:true,force:true});}
});

test('authenticated gateway isolates accounts, pins the workspace, and strips browser credentials',async()=>{
 const {cp,chmod}=await import('node:fs/promises');
 const folder=await mkdtemp(path.join(tmpdir(),'ultra-agent-bridge-'));
 const previous=process.env.ULTRA_OPENCODE_BIN;let agent;
 try{
  for(const name of ['studio-skills.json','studio-skills','docs'])await cp(path.join(root,name),path.join(folder,name),{recursive:true});
  const binary=path.join(folder,'fake-opencode');
  await writeFile(binary,`#!/usr/bin/env node
const http=require('node:http');
const server=http.createServer((req,res)=>{if(req.url.startsWith('/provider/openai/oauth/authorize')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({url:'https://auth.openai.com/oauth/authorize?state=test',method:'auto',instructions:'Complete authorization in your browser.'}));return;}if(req.url.startsWith('/provider/openai/oauth/callback')){res.end('true');return;}res.setHeader('Content-Type','application/json');res.end(JSON.stringify(req.url.startsWith('/session?')?{id:'ses_test'}:{directory:new URL(req.url,'http://localhost').searchParams.get('directory'),browserCookie:req.headers.cookie||null,authenticated:!!req.headers.authorization}));});
server.listen(0,'127.0.0.1',()=>console.log('opencode server listening on http://127.0.0.1:'+server.address().port));
`);await chmod(binary,0o700);process.env.ULTRA_OPENCODE_BIN=binary;
  const admin={id:'owner',role:'admin'},other={id:'other',role:'admin'};
  agent=createUltraAgent({root:folder,auth:{session(token){return token==='a'.repeat(64)?admin:token==='b'.repeat(64)?other:null;}},exportLecture(){throw Error('unused');}});
  const started=await call(agent,admin,'/api/ultra-agent/start');assert.equal(started.status,200,JSON.stringify(started.result));
  const base=new URL(started.result.url).origin,headers={cookie:'ultra_session='+'a'.repeat(64)};
  assert.equal((await fetch(base+'/global/health')).status,401);
  assert.equal((await fetch(base+'/global/health',{headers:{cookie:'ultra_session='+'b'.repeat(64)}})).status,401);
  const info=await (await fetch(base+'/file?directory=/etc',{headers})).json();assert.match(info.directory,/workspace$/);assert.notEqual(info.directory,'/etc');assert.equal(info.browserCookie,null);assert.equal(info.authenticated,true);
  assert.equal((await fetch(base+'/session',{method:'POST',headers:{...headers,origin:'https://untrusted.example'}})).status,403);
  assert.equal((await fetch(base+'/global/upgrade',{method:'POST',headers:{...headers,origin:base}})).status,403);
  const authRoute='/api/ultra-agent/'+started.result.id+'/authorization';
  assert.equal((await call(agent,admin,authRoute,{},'GET')).result.authorization,null);
  await fetch(base+'/provider/openai/oauth/authorize',{method:'POST',headers:{...headers,origin:base},body:'{"method":0}'});
  const pending=await call(agent,admin,authRoute,{},'GET');
  assert.equal(pending.result.authorization.status,'pending');
  assert.equal(pending.result.authorization.url,'https://auth.openai.com/oauth/authorize?state=test');
  assert.equal((await call(agent,other,authRoute,{},'GET')).status,422);
  await fetch(base+'/provider/openai/oauth/callback',{method:'POST',headers:{...headers,origin:base},body:'{"method":0}'});
  const complete=(await call(agent,admin,authRoute,{},'GET')).result.authorization;
  assert.equal(complete.status,'connected');assert.equal(complete.url,undefined);
  const resumed=await call(agent,admin,'/api/ultra-agent/start',{id:started.result.id});assert.equal(resumed.result.sessionId,'ses_test');assert.equal(resumed.result.url,started.result.url);
  assert.equal((await call(agent,other,'/api/ultra-agent/start',{id:started.result.id})).status,422);
  assert.equal((await call(agent,admin,'/api/ultra-agent/start',{id:started.result.id,replaceId:'another'})).status,422);
 }finally{agent?.close();if(previous===undefined)delete process.env.ULTRA_OPENCODE_BIN;else process.env.ULTRA_OPENCODE_BIN=previous;await rm(folder,{recursive:true,force:true});}
});
