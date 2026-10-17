import test from 'node:test';
import assert from 'node:assert/strict';
import { zipSync,strToU8 } from 'fflate';
import { extractDocument } from '../extraction.mjs';
import { writeFile } from 'node:fs/promises';
function deck(){
 const entries={
 'ppt/presentation.xml':'<p:presentation xmlns:p="p" xmlns:r="r"><p:sldIdLst><p:sldId r:id="r2"/><p:sldId r:id="r1"/></p:sldIdLst></p:presentation>',
 'ppt/_rels/presentation.xml.rels':'<Relationships><Relationship Id="r1" Target="slides/slide1.xml"/><Relationship Id="r2" Target="slides/slide2.xml"/></Relationships>',
 'ppt/slides/slide1.xml':'<p:sld xmlns:p="p" xmlns:a="a"><a:p><a:r><a:t>Second &amp; final</a:t></a:r></a:p></p:sld>',
 'ppt/slides/slide2.xml':'<p:sld xmlns:p="p" xmlns:a="a"><a:p><a:r><a:t>First: </a:t></a:r><a:r><a:t>functions</a:t></a:r></a:p><a:p><a:r><a:t>Double seven to get fourteen.</a:t></a:r></a:p></p:sld>'
 };
 return zipSync(Object.fromEntries(Object.entries(entries).map(([k,v])=>[k,strToU8(v)])));
}
function pdf(text){
 const stream='BT /F1 12 Tf 40 100 Td ('+text+') Tj ET';
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>','<< /Length '+stream.length+' >>\nstream\n'+stream+'\nendstream'];
 let data='%PDF-1.4\n',offsets=[0];
 objects.forEach((obj,i)=>{offsets.push(Buffer.byteLength(data));data+=(i+1)+' 0 obj\n'+obj+'\nendobj\n';});
 const xref=Buffer.byteLength(data);data+='xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF';
 return Buffer.from(data);
}
test('PPTX follows presentation relationships and decodes text runs',async()=>{
 const result=await extractDocument(deck(),'lesson.pptx');
 assert.equal(result.sections[0].text,'First: functions\nDouble seven to get fourteen.');
 assert.equal(result.sections[1].text,'Second & final');assert.match(result.text,/\[Slide 2\]/);
});
test('PDF preserves page labels and readable text',async()=>{
 const result=await extractDocument(pdf('A function doubles seven.'),'lesson.pdf');
 assert.match(result.text,/\[Page 1\]/);assert.match(result.text,/A function doubles seven/);
});
test('empty and unsupported documents fail instead of returning approved content',async()=>{
 await assert.rejects(extractDocument(new Uint8Array(),'empty.pdf'),/non-empty/);
 await assert.rejects(extractDocument(Buffer.from('bad'),'old.ppt'),/PPTX/);
 await assert.rejects(extractDocument(Buffer.from('bad'),'bad.pptx'));
 await assert.rejects(extractDocument(pdf(''),'scan.pdf'),/No readable text/);
});
if(process.env.WRITE_EXTRACTION_FIXTURES){
 await writeFile('tests/fixtures/functions.pdf',pdf('A function doubles seven.'));
 await writeFile('tests/fixtures/functions.pptx',deck());
}

test('PDF stores distinct rendered pages and embedded image assets',async()=>{
 const {mkdtemp,readFile,rm}=await import('node:fs/promises');
 const {tmpdir}=await import('node:os');
 const directory=await mkdtemp(tmpdir()+'/ultra-assets-');
 try{
  const output=await extractDocument(await readFile(new URL('./fixtures/visual-functions.pdf',import.meta.url)),'visual.pdf',{directory,url:'/imports/test'});
  assert.equal(output.assets.filter(a=>a.kind==='page').length,1);
  const image=output.assets.find(a=>a.kind==='image');assert.equal(image.width,2);
  for(const asset of output.assets){const bytes=await readFile(directory+'/'+asset.url.split('/').at(-1));assert.equal(bytes.subarray(1,4).toString(),'PNG');}
 }finally{await rm(directory,{recursive:true,force:true});}
});
