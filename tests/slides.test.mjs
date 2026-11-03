import test from 'node:test';import assert from 'node:assert/strict';
import {validateSlides,deckHTML,slidesFingerprint,slidesReady} from '../slides.mjs';
test('slides preserve script order and reject invented visual references',()=>{const segments=[{id:'segment-1'}],slide={segmentId:'segment-1',title:'Intro',bullets:['Hello'],assetId:''};validateSlides({slides:[slide]},segments,[]);assert.throws(()=>validateSlides({slides:[{...slide,assetId:'invented'}]},segments,[]));assert.throws(()=>validateSlides({slides:[]},segments,[]));});
test('generated HTML escapes model text and blocks unsafe image URLs',()=>{const html=deckHTML([{title:'<script>bad()</script>',bullets:['<img onerror=bad()>'],assetId:'a'}],[{id:'a',url:'javascript:bad()'}]);assert.ok(!html.includes('<script>'));assert.ok(!html.includes('javascript:'));assert.ok(html.includes('&lt;script&gt;'));});
test('changing approved assets invalidates slide approval',()=>{const d={script:{markdown:'script'},assets:{items:[]}};d.slides={input:slidesFingerprint(d),approved:'now',items:[{reviewed:true}]};assert.ok(slidesReady(d));d.assets.items.push({id:'new'});assert.ok(!slidesReady(d));});

test('generated slide edits invalidate presenter instructions',async()=>{
 const {presentationFingerprint}=await import('../slides.mjs');const {directorFingerprint}=await import('../directing.mjs');
 const d={presentation:{mode:'generated'},slides:{input:'approved-input',items:[{title:'First slide',bullets:['Point']}]}};
 const before=presentationFingerprint(d);assert.equal(before,directorFingerprint(d));d.slides.items[0].title='Changed title';assert.notEqual(before,directorFingerprint(d));
});
test('semantic slide formats include code tables charts and navigation',()=>{
 const html=deckHTML([{title:'Code',bullets:[],code:'a < b',headers:['Input'],rows:[['7']],chartLabels:[],chartValues:[],number:3,total:8,breadcrumb:'Lecture / Topic'}],[]);assert.match(html,/<pre><code>a &lt; b/);assert.match(html,/<table>/);assert.match(html,/aria-label="Slide breadcrumb"/);assert.match(html,/<footer>/);assert.match(html,/3 \/ 8/);
 const chart=deckHTML([{title:'Data',bullets:[],chartLabels:['A'],chartValues:[4],caption:'Given data'}],[]);assert.match(chart,/<svg/);assert.match(chart,/<figcaption>Given data/);
});

test('new decks require a dedicated objectives slide after the cover',async()=>{
 const {validateObjectivesSlide}=await import('../slide-generation.mjs');
 const cover={title:'Introduction',layout:'cover'};
 const objectives={title:'Lecture objectives',layout:'content',bullets:['Identify inputs','Predict outputs']};
 assert.doesNotThrow(()=>validateObjectivesSlide([cover,objectives]));
 assert.throws(()=>validateObjectivesSlide([cover]));
 assert.throws(()=>validateObjectivesSlide([objectives,cover]));
 assert.throws(()=>validateObjectivesSlide([cover,{...objectives,bullets:[]}]));
});
