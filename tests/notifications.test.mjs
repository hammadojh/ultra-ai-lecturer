import test from 'node:test';
import assert from 'node:assert/strict';
import {startNotificationTask} from '../notifications.mjs';
test('long tasks notify once; quick tasks, cancellations and opt-outs stay quiet',()=>{
 const oldNow=Date.now;let now=0,on=true;const calls=[];
 globalThis.window={Notification:true};globalThis.localStorage={getItem:()=>on?'on':'off'};globalThis.Notification=class {static permission='granted';constructor(title){calls.push(title);}};Date.now=()=>now;
 try{
 const quick=startNotificationTask('Quick');quick();assert.equal(calls.length,0);
 const done=startNotificationTask('Script');now=11000;done();done();assert.deepEqual(calls,['Script ready']);
 const cancelled=startNotificationTask('Cancelled');now+=11000;cancelled({name:'AbortError'});assert.equal(calls.length,1);
 const failure=startNotificationTask('Voice');now+=11000;failure(Error('failed'));assert.equal(calls[1],'Voice needs attention');
 on=false;const silent=startNotificationTask('Silent');now+=11000;silent();assert.equal(calls.length,2);
 }finally{Date.now=oldNow;delete globalThis.window;delete globalThis.localStorage;delete globalThis.Notification;}
});
