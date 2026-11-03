import {readFile,writeFile,mkdir,rename,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {runStudio,migrate,skills,addArtifact,latestArtifacts,artifactCurrent} from './studio-agent.mjs';
import {validateProject,materialCurrent} from './studio-modules.mjs';
const jobs=new Map(),writes=new Map();
export async function studioApi(req,res,url,root){
 const directory=path.join(root,'.cache/studio-v2');await mkdir(directory,{recursive:true});
 const json=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify(data));};
 const read=id=>readFile(path.join(directory,id+'.json'),'utf8').then(JSON.parse).then(migrate);
 const write=async p=>{const file=path.join(directory,p.id+'.json'),tmp=file+'.'+randomUUID()+'.tmp';await writeFile(tmp,JSON.stringify(p),{mode:0o600});await rename(tmp,file);};
 const loadBody=async()=>{let body='';for await(const chunk of req){body+=chunk;if(body.length>6000000)throw Error('Request too large.');}return JSON.parse(body||'{}');};
 if(req.headers.origin&&!['http://127.0.0.1:4173','http://localhost:4173'].includes(req.headers.origin)){json(403,{error:'Invalid origin.'});return;}
 const parts=url.pathname.split('/').filter(Boolean),id=parts[2],action=parts[3];
 try{
 if(id==='skills'&&req.method==='GET'){json(200,{skills});return;}
 if(!id&&req.method==='GET'){const projects=[];for(const name of await readdir(directory)){if(!name.endsWith('.json'))continue;const p=await read(name.slice(0,-5));projects.push({id:p.id,title:p.title,updatedAt:p.updatedAt});}json(200,{projects:projects.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))});return;}
 if(!id&&req.method==='POST'){const data=await loadBody();const p=validateProject({id:randomUUID(),title:data.title||'Untitled lesson',audience:data.audience||'Students new to the topic',sources:data.sources||[],messages:[],article:null,versions:[],model:data.model||'',revision:1,updatedAt:new Date().toISOString()});await write(p);json(201,p);return;}
 if(!/^[a-f0-9-]{36}$/.test(id||'')){json(404,{error:'Project not found.'});return;}
 if(req.method==='GET'){const p=await read(id);if(!jobs.has(id)&&!writes.has(id)&&p.messages.some(m=>m.activity&&!m.done)){for(const m of p.messages)if(m.activity&&!m.done){m.done=true;m.status='stopped';}p.revision++;await write(p);}json(200,{...(jobs.get(id)?.project||p),phase:jobs.get(id)?.phase||null,running:jobs.has(id)});return;}
 if(action==='cancel'&&req.method==='POST'){jobs.get(id)?.controller.abort();json(200,{cancelled:true});return;}
 if(jobs.has(id)||writes.has(id)){json(409,{error:'This project is busy. Wait for the current operation.'});return;}
 writes.set(id,true);
 try{
 const data=await loadBody(),p=await read(id);
 if(data.revision!==p.revision){json(409,{error:'A newer revision is saved. Reload the project before editing.'});return;}
 if(req.method==='PUT'){
 const before=p.article?.markdown;
 if(data.artifact){const a=data.artifact;if(!['article','plan','slides','animated-slides','script','toned-script','audio','annotations','avatar'].includes(a.type))throw Error('Invalid artifact type.');const previous=a.id&&latestArtifacts(p).find(x=>x.id===a.id);const added=addArtifact(p,{id:a.id,title:a.title,type:previous?.type||a.type,format:previous?.format||a.format,content:a.content,inputs:previous?.inputs||[]});p.messages.push({id:randomUUID(),role:'assistant',text:previous?'Your changes are saved as a new version.':'Attached artifact is ready to use.',artifacts:[{id:added.id,version:added.version}]});}
 if(data.approveArtifact){const a=latestArtifacts(p).find(x=>x.id===data.approveArtifact.id);if(!a||a.version!==data.approveArtifact.version)throw Error('This artifact has a newer version. Review it first.');if(!artifactCurrent(p,a))throw Error('An input changed. Update this artifact before approval.');a.approvedAt=new Date().toISOString();p.messages.push({id:randomUUID(),role:'assistant',text:a.title+' · version '+a.version+' approved.'});}
 for(const key of ['title','audience','sources','model'])if(data[key]!==undefined)p[key]=data[key];validateProject(p);
 if(data.markdown!==undefined){if(typeof data.markdown!=='string'||data.markdown.length>50000)throw Error('Article is too long.');if(p.article&&data.markdown!==before){p.versions.push(structuredClone(p.article));p.article={...p.article,markdown:data.markdown,number:p.article.number+1,approvedAt:null,reviewNotes:['Manually edited. Review the article before approval.']};}}
 if(data.approve){if(!materialCurrent(p)||!p.article.markdown.trim())throw Error('Create a current article before approving.');p.article.approvedAt=new Date().toISOString();}
 p.revision++;p.updatedAt=new Date().toISOString();await write(p);json(200,p);return;
 }
 if(action==='run'&&req.method==='POST'){
 if(typeof data.message!=='string'||!data.message.trim()||data.message.length>8000)throw Error('Enter a message up to 8,000 characters.');if(!p.model)throw Error('Choose a ChatGPT model first.');
 p.messages.push({id:randomUUID(),role:'user',text:data.message});p.revision++;await write(p);
 const controller=new AbortController(),job={controller,phase:'Working',project:p};jobs.set(id,job);
 const timeout=setTimeout(()=>controller.abort(),900000);const close=()=>{if(!res.writableEnded)controller.abort();};res.on('close',close);
 try{const activity={id:randomUUID(),role:'assistant',text:'',activity:[]};p.messages.push(activity);const result=await runStudio(p,{signal:controller.signal,root,event:async text=>{job.phase=text;activity.activity.push({text,time:new Date().toISOString()});await write(p);},checkpoint:async a=>{p.messages.push({id:randomUUID(),role:'assistant',text:'',artifacts:[{id:a.id,version:a.version}]});await write(p);}});if(controller.signal.aborted)throw Error('Generation cancelled.');activity.done=true;p.messages.push({id:randomUUID(),role:'assistant',text:result.message});}
 catch(error){const activity=p.messages.findLast(m=>m.activity&&!m.done);if(activity)activity.status=controller.signal.aborted?'stopped':'failed';p.messages.push({id:randomUUID(),role:'assistant',text:controller.signal.aborted?'Generation stopped. Completed artifacts are saved.':'Could not finish: '+error.message});}
 finally{const unshown=p.artifacts.filter(a=>!p.messages.some(m=>m.artifacts?.some(ref=>ref.id===a.id&&ref.version===a.version)));if(unshown.length)p.messages.push({id:randomUUID(),role:'assistant',text:'Saved artifacts',artifacts:unshown.map(a=>({id:a.id,version:a.version}))});clearTimeout(timeout);res.off('close',close);jobs.delete(id);for(const m of p.messages)if(m.activity)m.done=true;p.revision++;p.updatedAt=new Date().toISOString();await write(p);}
 if(!res.destroyed)json(200,p);return;
 }
 json(405,{error:'Unsupported action.'});
 }finally{writes.delete(id);}
 }catch(error){json(error.code==='ENOENT'?404:400,{error:error.message});}
}
