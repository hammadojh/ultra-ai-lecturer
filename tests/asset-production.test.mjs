import test from 'node:test';
import assert from 'node:assert/strict';
import {diagramSVG} from '../asset-production.mjs';
test('AI diagrams escape text and reject executable shapes and colors',()=>{
 const element={type:'text',x:40,y:40,w:0,h:0,color:'#123456',text:'<script>alert(1)</script>'};
 const svg=diagramSVG({description:'"<img>',elements:[element]});assert.ok(!svg.includes('<script>'));assert.ok(svg.includes('&lt;script&gt;'));assert.throws(()=>diagramSVG({description:'x',elements:[{...element,type:'script'}]}));assert.throws(()=>diagramSVG({description:'x',elements:[{...element,color:'url(https://example.com)'}]}));
});
