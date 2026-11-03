import { unzipSync, strFromU8 } from 'fflate';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import path from 'node:path';
import {writeFile} from 'node:fs/promises';
import {createCanvas,ImageData} from '@napi-rs/canvas';
const MAX_TEXT=200000;
const list=v=>v===undefined?[]:Array.isArray(v)?v:[v];
const parser=new XMLParser({ignoreAttributes:false,parseTagValue:false,trimValues:false});
function xml(bytes){
 const text=strFromU8(bytes);
 if(/<!DOCTYPE|<!ENTITY/i.test(text)||XMLValidator.validate(text)!==true)throw Error('Invalid presentation XML.');
 return parser.parse(text);
}
function paragraphs(value){
 if(!value||typeof value!=='object')return [];
 const result=[];
 function runs(node){
  if(!node||typeof node!=='object')return '';
  return Object.entries(node).map(([key,value])=>{
   if(key==='a:t')return list(value).map(v=>typeof v==='object'?v['#text']||'':v).join('');
   if(key==='a:br')return '\n';
   if(key.startsWith('@_'))return '';
   return list(value).map(runs).join('');
  }).join('');
 }
 for(const [key,child] of Object.entries(value)){
  if(key==='a:p')result.push(...list(child).map(runs).filter(s=>s.trim()));
  else for(const item of list(child))result.push(...paragraphs(item));
 }
 return result;
}
function result(kind,sections,warnings,assets=[]){
 const text=sections.map(s=>'['+kind+' '+s.number+']\n'+(s.text||'(No extractable text)')).join('\n\n');
 if(text.length>MAX_TEXT)throw Error('Extracted text exceeds 200,000 characters. Split the document.');
 if(!sections.some(s=>s.text.trim())&&!assets.length)throw Error('No readable text found. Paste a transcript for scanned pages or image-only slides; OCR is not included yet.');
 return {text,sections,warnings,assets};
}
async function pdf(bytes,saveAsset){
 const {getDocument,OPS}=await import('pdfjs-dist/legacy/build/pdf.mjs');
 const task=getDocument({data:new Uint8Array(bytes),isEvalSupported:false,useSystemFonts:true});
 try{
  const doc=await task.promise;
  if(doc.numPages>300)throw Error('PDF exceeds 300 pages. Split it into smaller files.');
  const sections=[],assets=[],warnings=['Review reading order, equations and tables. Page previews preserve the full layout; embedded images are separate reusable assets. Vector diagrams remain in the full-page preview.'];
  let count=0;
  for(let i=1;i<=doc.numPages;i++){
   const page=await doc.getPage(i),content=await page.getTextContent();
   const text=content.items.filter(item=>'str' in item).map(item=>item.str+(item.hasEOL?'\n':' ')).join('').trim();
   count+=text.length;if(count>MAX_TEXT)throw Error('Extracted text exceeds 200,000 characters. Split the PDF.');
   sections.push({number:i,text});
   if(saveAsset){
    const base=page.getViewport({scale:1}),viewport=page.getViewport({scale:Math.min(2,1600/Math.max(base.width,base.height))});
    const canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));
    await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
    assets.push(await saveAsset(canvas.toBuffer('image/png'),'png',{kind:'page',page:i,label:'Page '+i,width:canvas.width,height:canvas.height}));
    const ops=await page.getOperatorList(),seen=new Set();
    for(let n=0;n<ops.fnArray.length;n++){
     const op=ops.fnArray[n];if(![OPS.paintImageXObject,OPS.paintInlineImageXObject,OPS.paintImageXObjectRepeat].includes(op))continue;
     const arg=ops.argsArray[n][0];if(typeof arg==='string'&&seen.has(arg))continue;seen.add(arg);
     try{
      const image=typeof arg==='string'?(arg.startsWith('g_')?page.commonObjs:page.objs).get(arg):arg;
      if(!image?.width||!image.height||image.width*image.height>16000000)throw Error('unsupported image');
      const out=createCanvas(image.width,image.height),ctx=out.getContext('2d');
      if(image.bitmap)ctx.drawImage(image.bitmap,0,0);
      else{
       const rgba=new Uint8ClampedArray(image.width*image.height*4);
       for(let pixel=0;pixel<image.width*image.height;pixel++){
        if(image.kind===3){rgba.set(image.data.subarray(pixel*4,pixel*4+4),pixel*4);continue;}
        if(image.kind===2){rgba.set(image.data.subarray(pixel*3,pixel*3+3),pixel*4);}
        else if(image.kind===1){const row=Math.floor(pixel/image.width),col=pixel%image.width;const v=(image.data[row*Math.ceil(image.width/8)+(col>>3)]>>(7-col%8)&1)*255;rgba.set([v,v,v],pixel*4);}
        else throw Error('unsupported pixel format');
        rgba[pixel*4+3]=255;
       }
       ctx.putImageData(new ImageData(rgba,image.width,image.height),0,0);
      }
      assets.push(await saveAsset(out.toBuffer('image/png'),'png',{kind:'image',page:i,label:'Page '+i+' · image '+seen.size,width:image.width,height:image.height}));
     }catch{warnings.push('An embedded image on page '+i+' could not be separated; it remains visible in the page preview.');}
    }
   }
   page.cleanup();
  }
  const blanks=sections.filter(s=>!s.text).map(s=>s.number);
  if(blanks.length)warnings.push('No text on pages '+blanks.join(', ')+'. These may need OCR or a manual transcript.');
  return result('Page',sections,warnings,assets);
 }catch(error){
  if(error.name==='PasswordException')throw Error('This PDF is password-protected. Upload an unlocked copy.');
  throw error;
 }finally{await task.destroy();}
}
async function pptx(bytes,saveAsset){
 let total=0;
 const files=unzipSync(new Uint8Array(bytes),{filter:entry=>{
  if(!/^ppt\/.*(\.xml|\.rels)$/.test(entry.name)&&!(saveAsset&&/^ppt\/media\/.*\.(png|jpe?g|gif|webp)$/i.test(entry.name)))return false;
  total+=entry.originalSize;
  if(total>20*1024*1024||entry.originalSize>5*1024*1024)throw Error('Presentation XML is too large. Split the file.');
  return true;
 }});
 const main=files['ppt/presentation.xml'],rels=files['ppt/_rels/presentation.xml.rels'];
 if(!main||!rels)throw Error('Not a valid PPTX presentation. Save legacy .ppt files as .pptx first.');
 const relationships=list(xml(rels).Relationships?.Relationship);
 const slides=list(xml(main)['p:presentation']?.['p:sldIdLst']?.['p:sldId']);
 if(!slides.length||slides.length>300)throw Error('Presentation must contain 1–300 slides.');
 const sections=slides.map((slide,index)=>{
  const r=relationships.find(r=>r['@_Id']===slide['@_r:id']);
  if(!r||r['@_TargetMode']==='External')throw Error('Invalid slide relationship.');
  const target=r['@_Target'];
  const name=path.posix.normalize(target.startsWith('/')?target.slice(1):'ppt/'+target);
  if(!name.startsWith('ppt/slides/')||!files[name])throw Error('Missing slide content.');
  return {number:index+1,text:paragraphs(xml(files[name])).join('\n')};
 });
 const assets=[];
 if(saveAsset)for(const [name,data] of Object.entries(files))if(name.startsWith('ppt/media/'))assets.push(await saveAsset(data,path.extname(name).slice(1),{kind:'image',label:path.basename(name)}));
 return result('Slide',sections,['Embedded raster images are extracted. Vector shapes, speaker notes and animations are not separated. For original slide layout, also upload the presentation exported as PDF.'],assets);
}
export async function extractDocument(bytes,filename,storage){
 let size=0,sequence=0;
 const saveAsset=storage?async(data,ext,metadata)=>{
  size+=data.length;if(size>80*1024*1024)throw Error('Extracted assets exceed 80 MB. Split the source.');
  const name=String(++sequence)+'.'+ext;await writeFile(path.join(storage.directory,name),data);
  return {...metadata,url:storage.url+'/'+name};
 }:null;
 if(!bytes.length||bytes.length>15*1024*1024)throw Error('Choose a non-empty file up to 15 MB.');
 const ext=path.extname(filename).toLowerCase();
 if(ext==='.pdf')return pdf(bytes,saveAsset);
 if(ext==='.pptx')return pptx(bytes,saveAsset);
 throw Error('Choose PDF or PPTX. Save legacy .ppt files as .pptx first.');
}
