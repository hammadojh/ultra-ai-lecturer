import test from 'node:test';
import assert from 'node:assert/strict';
import {validateAssetBrief,sourceAssets,generateAssetBrief} from '../assets.mjs';
import {assetFingerprint,assetsReady} from '../assets-client.mjs';
test('asset suggestions cannot invent source IDs',()=>{const item={title:'Diagram',purpose:'Explain',scriptLocation:'Part 1',brief:'Input and output',assetId:'fake'};assert.throws(()=>validateAssetBrief({items:[item]},[]),/references/);assert.ok(validateAssetBrief({items:[{...item,assetId:''}]},[]));});
test('source visuals exclude untrusted URLs',()=>{assert.deepEqual(sourceAssets({sources:[{id:'s',import:{assets:[{url:'javascript:alert(1)'}]}}]}),[]);});
test('approval requires reviewed requirements and current script',()=>{const d={sources:[],script:{markdown:'Script',input:'version'}};d.assets={input:assetFingerprint(d),items:[{status:'pending',brief:'Show text',assetId:'text-only'}]};assert.equal(assetsReady(d),false);d.assets.items[0].status='reviewed';assert.equal(assetsReady(d),true);d.script.markdown='Changed';assert.equal(assetsReady(d),false);});

test('original slides skip asset generation before any AI call',async()=>{await assert.rejects(generateAssetBrief({presentation:{mode:'original'}}),/skipped/);});
