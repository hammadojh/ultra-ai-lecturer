import test from 'node:test';
import assert from 'node:assert/strict';
import {readResponseStream,finishSignIn} from '../chatgpt.mjs';
function stream(events){const bytes=new TextEncoder().encode(events.map(e=>'data: '+JSON.stringify(e)+'\n\n').join(''));return new ReadableStream({start(c){for(let i=0;i<bytes.length;i+=7)c.enqueue(bytes.slice(i,i+7));c.close();}});}
test('collects split UTF8 deltas only after completion',async()=>{assert.equal(await readResponseStream(stream([{type:'response.output_text.delta',delta:'Hello عمر'},{type:'response.completed'}])),'Hello عمر');});
test('rejects a late error despite partial text',async()=>{await assert.rejects(readResponseStream(stream([{type:'response.output_text.delta',delta:'partial'},{type:'response.failed',response:{error:{code:'usage_limit'}}}])),/usage_limit/);});
test('rejects incomplete and interrupted output',async()=>{await assert.rejects(readResponseStream(stream([{type:'response.incomplete'}])),/could not finish/);await assert.rejects(readResponseStream(stream([{type:'response.output_text.delta',delta:'partial'}])),/interrupted/);});
test('rejects unsolicited sign-in callback before token exchange',async()=>{await assert.rejects(finishSignIn(new URL('http://127.0.0.1:4173/auth/chatgpt/callback?state=unknown&code=invalid'),'unknown'),/could not be verified/);});
