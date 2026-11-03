import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {slidesReady,approvedVisuals,deckHTML} from './slides.mjs';
const execute=promisify(execFile),jobs=new Map();
export async function renderGeneratedSlides(root,d){
 if(!slidesReady(d))throw Error('Approve the current generated slide deck first.');
 const key=createHash('sha256').update(JSON.stringify({items:d.slides.items,visuals:approvedVisuals(d),version:2})).digest('hex');
 const manifest=path.join(root,'.cache','generated-'+key+'.json');
 try{return JSON.parse(await readFile(manifest,'utf8'));}catch{}
 if(jobs.has(key))return jobs.get(key);
 const job=(async()=>{
 const id=randomUUID(),directory=path.join(root,'.cache/imports',id);await mkdir(directory,{recursive:true});
 const visuals=await Promise.all(approvedVisuals(d).map(async v=>{
  if(/^\/imports\/[0-9a-f-]{36}\/[0-9]+\.(png|jpe?g|gif|webp)$/.test(v.url)){const bytes=await readFile(path.join(root,'.cache',v.url.slice(1)));return {...v,url:'data:image/'+(v.url.endsWith('.png')?'png':v.url.endsWith('.gif')?'gif':v.url.endsWith('.webp')?'webp':'jpeg')+';base64,'+bytes.toString('base64')};}
  if(/^https:\/\/upload\.wikimedia\.org\//.test(v.url)){const r=await fetch(v.url,{signal:AbortSignal.timeout(30000),redirect:'error'});if(!r.ok)throw Error('Could not load an approved image. Retry rendering.');const bytes=Buffer.from(await r.arrayBuffer());const mime=r.headers.get('content-type')?.split(';')[0];if(bytes.length>12000000||!['image/png','image/jpeg','image/gif','image/webp'].includes(mime))throw Error('Approved image is unsupported or too large.');return {...v,url:`data:${mime};base64,${bytes.toString('base64')}`};}return v;
 }));
 const pages=[];
 try{for(const [i,slide] of d.slides.items.entries()){
  const file=path.join(directory,'render.html'),png=path.join(directory,(i+1)+'.png');
  const html=deckHTML([slide],visuals).replace('</style>','.slide{margin:0;width:1200px;height:675px;min-height:0;overflow:hidden}body{width:1200px;height:675px;overflow:hidden}</style>');await writeFile(file,html);
  await execute(process.env.ULTRA_CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless','--disable-gpu','--no-first-run','--no-default-browser-check','--hide-scrollbars','--force-device-scale-factor=1','--window-size=1200,675','--virtual-time-budget=1000','--user-data-dir='+path.join(directory,'chrome'),'--screenshot='+png,pathToFileURL(file).href],{timeout:45000,maxBuffer:1024*1024});
  const image=await readFile(png);if(!image.length)throw Error('Slide rendering failed.');pages.push({kind:'page',page:i+1,label:slide.title,url:'/imports/'+id+'/'+(i+1)+'.png'});
 }const result={pages};await writeFile(manifest,JSON.stringify(result));return result;
 }finally{await rm(path.join(directory,'chrome'),{recursive:true,force:true});await rm(path.join(directory,'render.html'),{force:true});}
 })().finally(()=>jobs.delete(key));jobs.set(key,job);return job;
}
