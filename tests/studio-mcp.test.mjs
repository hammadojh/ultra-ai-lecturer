import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {createStudioMcp} from '../studio-mcp.mjs';
import {createCanvas} from '@napi-rs/canvas';
import {zipSync,strToU8} from 'fflate';
function packageBytes(){const wav=Buffer.alloc(48044);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(24000,24);wav.writeUInt32LE(48000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(48000,40);return zipSync({'lecture.json':strToU8(JSON.stringify({format:'ultra-lecture',version:1,title:'MCP test',article:'article.md',slides:[{id:'s',title:'Test',image:'s.png'}],segments:[{id:'c',slide:'s',text:'Hello',audio:'a.wav',duration:1}]})),'article.md':strToU8('Test lesson'),'s.png':createCanvas(100,100).toBuffer('image/png'),'a.wav':wav});}
test('official MCP client: handshake, tools, workspace, validated review, guards and revocation',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'ultra-mcp-'));let mcp;const host=http.createServer((req,res)=>mcp.handle(req,res));await new Promise(r=>host.listen(0,'127.0.0.1',r));const authority='127.0.0.1:'+host.address().port,origin='http://'+authority;const user={id:'admin-test',role:'admin'};
 mcp=createStudioMcp({root,allowedHosts:[authority],exportLecture:async()=>packageBytes()});const credential=await mcp.issue(user);const client=new Client({name:'integration-test',version:'1'});
 try{
  await assert.rejects(mcp.issue({id:'student',role:'student'}));
  assert.equal((await fetch(origin+'/mcp',{method:'POST',body:'{}'})).status,401);
  assert.equal((await fetch(origin+'/mcp',{method:'POST',headers:{Authorization:'Bearer '+credential.token,Origin:'https://evil.example'},body:'{}'})).status,403);
  assert.equal(await new Promise(resolve=>{const req=http.request(origin+'/mcp',{method:'POST',headers:{Host:'evil.example'}},res=>{res.resume();resolve(res.statusCode);});req.end('{}');}),403);
  await mkdir(path.join(root,'.cache/published'),{recursive:true});await writeFile(path.join(root,'.cache/published/lesson.json'),JSON.stringify({id:'lesson',title:'Existing',publishedAt:'original'}));
  await client.connect(new StreamableHTTPClientTransport(new URL(origin+'/mcp'),{requestInit:{headers:{Authorization:'Bearer '+credential.token}}}));
  const names=(await client.listTools()).tools.map(t=>t.name);assert.equal(names.length,4);assert.ok(!names.includes('publish'));
  const call=async(name,args={})=>{const r=await client.callTool({name,arguments:args});assert.ok(!r.isError,r.content[0].text);return JSON.parse(r.content[0].text);};
  assert.equal((await call('list_lectures'))[0].id,'lesson');
  const w=await call('create_workspace',{lectureId:'lesson'});assert.ok((await readFile(w.currentPackage)).length);
  await writeFile(w.outputFile,'bad zip');assert.equal((await client.callTool({name:'submit_package',arguments:{workspaceId:w.workspaceId}})).isError,true);
  await rm(w.outputFile);const outside=path.join(root,'outside.zip');await writeFile(outside,packageBytes());await symlink(outside,w.outputFile);assert.equal((await client.callTool({name:'submit_package',arguments:{workspaceId:w.workspaceId}})).isError,true);await rm(w.outputFile);
  await writeFile(w.outputFile,packageBytes());const result=await call('submit_package',{workspaceId:w.workspaceId});const reviewId=new URL(result.reviewUrl).searchParams.get('mcpReview');const review=await mcp.review(user.id,reviewId);assert.equal(review.candidate.title,'MCP test');assert.equal(review.replacement.publishedAt,'original');await assert.rejects(mcp.review('other',reviewId));
  assert.equal(JSON.parse(await readFile(path.join(root,'.cache/published/lesson.json'))).publishedAt,'original');
  const restarted=createStudioMcp({root,allowedHosts:[authority]});mcp=restarted;assert.equal((await call('list_lectures')).length,1);
  await mcp.revoke(user);assert.equal((await fetch(origin+'/mcp',{method:'POST',headers:{Authorization:'Bearer '+credential.token},body:'{}'})).status,401);
 }finally{await client.close();await new Promise(r=>host.close(r));await rm(root,{recursive:true,force:true});}
});
