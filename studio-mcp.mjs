import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {z} from 'zod';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,readdir,realpath,stat,rm} from 'node:fs/promises';
import path from 'node:path';
import {packageApi} from './lecture-packages.mjs';
const digest=s=>createHash('sha256').update(s).digest('hex');
const idSchema=z.string().regex(/^[a-zA-Z0-9-]{1,80}$/);
const reply=data=>({content:[{type:'text',text:typeof data==='string'?data:JSON.stringify(data,null,2)}]});
export function createStudioMcp({root,exportLecture,allowedHosts=['127.0.0.1:4173','localhost:4173']}){
 const base=path.join(root,'.cache/mcp');
 const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
 async function issue(user){
  if(user?.role!=='admin')throw Error('Administrator access required.');
  const token=randomBytes(32).toString('hex'),record={owner:user.id,expires:Date.now()+30*86400000};
  await mkdir(path.join(base,'tokens'),{recursive:true,mode:0o700});
  await writeFile(path.join(base,'tokens',digest(token)+'.json'),JSON.stringify(record),{mode:0o600});
  return {token,expires:record.expires};
 }
 async function authorize(req){
  const token=/^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization||'')?.[1];if(!token)return null;
  try{const record=JSON.parse(await readFile(path.join(base,'tokens',digest(token)+'.json'),'utf8'));return record.expires>Date.now()?record:null;}catch{return null;}
 }
 async function revoke(user){const dir=path.join(base,'tokens');for(const file of await readdir(dir).catch(()=>[])){const record=JSON.parse(await readFile(path.join(dir,file),'utf8'));if(record.owner===user.id)await rm(path.join(dir,file));}}
 async function published(id){return JSON.parse(await readFile(path.join(root,'.cache/published',id+'.json'),'utf8'));}
 async function workspace(owner,id){const folder=path.join(base,'workspaces',digest(owner),id);return {folder,meta:JSON.parse(await readFile(path.join(folder,'workspace.json'),'utf8'))};}
 async function review(owner,id){const data=JSON.parse(await readFile(path.join(base,'reviews',id+'.json'),'utf8'));if(data.owner!==owner)throw Error('Review not found.');return data;}
 function build(owner,origin){
  const server=new McpServer({name:'ultra-studio',version:'1.0.0'},{instructions:'Use get_teaching_instructions, then create_workspace. Build the lecture ZIP in the returned local workspace and submit_package for educator review. Never claim publication: only the educator publishes in Studio. This server and your file tools must run on the same computer.'});
  function tool(name,description,schema,readOnly,handler){server.registerTool(name,{description,inputSchema:schema,annotations:{readOnlyHint:readOnly,destructiveHint:false,openWorldHint:false}},async args=>{try{return reply(await handler(args));}catch(e){return {...reply(e.message),isError:true};}});}
  tool('get_teaching_instructions','Read the Ultra teaching skills and exact lecture package format.',{},true,async()=>{const catalog=JSON.parse(await readFile(path.join(root,'studio-skills.json'),'utf8'));return (await Promise.all(catalog.map(s=>readFile(path.join(root,'studio-skills',s.id,'SKILL.md'),'utf8')))).join('\n\n')+'\n\n'+await readFile(path.join(root,'docs/lecture-package.md'),'utf8');});
  tool('list_lectures','List published lectures available to edit.',{},true,async()=>{const out=[];for(const file of await readdir(path.join(root,'.cache/published')).catch(()=>[])){if(!/^[a-zA-Z0-9-]{1,80}\.json$/.test(file))continue;const d=await published(file.slice(0,-5));out.push({id:d.id,title:d.title,publishedAt:d.publishedAt});}return out;});
  tool('create_workspace','Create a local working folder. For edits, export the existing lecture into current-lecture.zip. Use your local file tools to work in this folder.',{lectureId:idSchema.optional()},false,async({lectureId})=>{const id=randomUUID(),folder=path.join(base,'workspaces',digest(owner),id);const d=lectureId?await published(lectureId):null;await mkdir(folder,{recursive:true,mode:0o700});if(d)await writeFile(path.join(folder,'current-lecture.zip'),await exportLecture(d));const meta={replaceId:d?.id,expectedPublishedAt:d?.publishedAt,title:d?.title};await writeFile(path.join(folder,'workspace.json'),JSON.stringify(meta));return {workspaceId:id,directory:folder,outputFile:path.join(folder,'ultra-lecture.zip'),...(d?{currentPackage:path.join(folder,'current-lecture.zip'),title:d.title}:{}),next:'Build ultra-lecture.zip here, then call submit_package with this workspaceId.'};});
  tool('submit_package','Validate ultra-lecture.zip in your workspace and return a Studio review link. Does not publish.',{workspaceId:z.string().uuid()},false,async({workspaceId})=>{
   const {folder,meta}=await workspace(owner,workspaceId),file=await realpath(path.join(folder,'ultra-lecture.zip')),canonical=await realpath(folder);
   if(path.dirname(file)!==canonical)throw Error('Package must be inside its workspace, not a symlink outside it.');
   const info=await stat(file);if(!info.isFile()||info.size>200*1024*1024)throw Error('Package must be a ZIP up to 200 MB.');
   const bytes=await readFile(file);let code,data;
   await packageApi({method:'POST',async *[Symbol.asyncIterator](){yield bytes;}},{writeHead(c){code=c;return this;},end(s){data=JSON.parse(s);}},new URL('/api/lecture-packages/validate',origin),root);
   if(code!==200)throw Error(data.error);
   const reviewId=randomUUID();await mkdir(path.join(base,'reviews'),{recursive:true});await writeFile(path.join(base,'reviews',reviewId+'.json'),JSON.stringify({owner,candidate:data,replacement:meta.replaceId?{id:meta.replaceId,publishedAt:meta.expectedPublishedAt,title:meta.title}:null}));
   return {...data,reviewUrl:origin+'/studio.html?mcpReview='+reviewId,status:'Validated; awaiting educator publication.'};
  });
  return server;
 }
 async function handle(req,res){
  if(!allowedHosts.includes(req.headers.host)||(req.headers.origin&&!allowedHosts.map(h=>'http://'+h).includes(req.headers.origin))){json(res,403,{error:'Invalid host or origin.'});return;}
  const record=await authorize(req);if(!record){res.setHeader('WWW-Authenticate','Bearer realm="Ultra Studio"');json(res,401,{error:'Create an MCP access token in Studio.'});return;}
  if(req.method!=='POST'){res.setHeader('Allow','POST');json(res,405,{error:'Use Streamable HTTP POST.'});return;}
  let body;try{const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>1024*1024){json(res,413,{error:'Request too large.'});return;}chunks.push(chunk);}body=JSON.parse(Buffer.concat(chunks).toString());}catch{json(res,400,{error:'Invalid JSON.'});return;}
  const server=build(record.owner,'http://'+req.headers.host),transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
  res.on('close',()=>{transport.close();server.close();});await server.connect(transport);await transport.handleRequest(req,res,body);
 }
 return {handle,issue,revoke,review};
}
