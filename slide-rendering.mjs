import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {extractDocument} from './extraction.mjs';
const execute=promisify(execFile),jobs=new Map();
export async function renderOriginalSlides(root,url){
 if(!/^\/imports\/[0-9a-f-]{36}\/original\.pptx$/.test(url))throw Error('A stored original PowerPoint is required.');
 const original=path.join(root,'.cache',url.slice(1)),manifest=path.join(path.dirname(original),'rendered-pages.json');
 try{return JSON.parse(await readFile(manifest,'utf8'));}catch{}
 if(jobs.has(url))return jobs.get(url);
 const job=(async()=>{
  const id=randomUUID(),directory=path.join(root,'.cache/imports',id),profile=path.join(directory,'office-profile');await mkdir(directory,{recursive:true});
  try{
   await execute(process.env.ULTRA_SOFFICE||'soffice',['-env:UserInstallation='+pathToFileURL(profile).href,'--headless','--convert-to','pdf:impress_pdf_Export','--outdir',directory,original],{timeout:120000,maxBuffer:1024*1024});
   const bytes=await readFile(path.join(directory,'original.pdf'));
   const extracted=await extractDocument(bytes,'original.pdf',{directory,url:'/imports/'+id});
   const result={pages:extracted.assets.filter(a=>a.kind==='page')};if(!result.pages.length)throw Error('No slides rendered.');
   await writeFile(manifest,JSON.stringify(result));return result;
  }catch(error){throw Error('PowerPoint rendering failed. '+(error.code==='ENOENT'?'Install LibreOffice or configure ULTRA_SOFFICE.':'Try again or check the original deck.'));}
  finally{await rm(profile,{recursive:true,force:true});}
 })().finally(()=>jobs.delete(url));jobs.set(url,job);return job;
}
