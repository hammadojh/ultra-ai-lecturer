import test from 'node:test';
import assert from 'node:assert/strict';
import {connectAvatarRoom} from '../public/assets/liveavatar-connection.mjs';
test('unsupported RTC resume creates a fresh room with the same session instead of mutating the failed connection',async()=>{
 const rooms=[],session={livekit_url:'wss://room',livekit_client_token:'scoped-token'};class Room{constructor(options){this.options=options;rooms.push(this);}on(){}async connect(url,token){assert.equal(url,session.livekit_url);assert.equal(token,session.livekit_client_token);if(rooms.length===1)throw Error("Failed to execute 'setConfiguration' on 'RTCPeerConnection': Attempted to modify the PeerConnection's configuration in an unsupported way.");}async startAudio(){this.audio=true;}async disconnect(){this.closed=true;}}
 const room=await connectAvatarRoom({Room,RoomEvent:{TrackSubscribed:'track'}},session,()=>{});assert.equal(rooms.length,2);assert.equal(rooms[0].closed,true);assert.equal(room,rooms[1]);assert.equal(room.audio,true);assert.equal(room.options.singlePeerConnection,false);assert.equal(room.options.reconnectPolicy.nextRetryDelayInMs({retryCount:0}),null);
});
test('a non-connection error does not trigger another paid connection attempt',async()=>{
 let count=0;class Room{constructor(){count++;}on(){}async connect(){throw Error('Permission denied');}async disconnect(){}}
 await assert.rejects(connectAvatarRoom({Room,RoomEvent:{}},{},()=>{}),/Permission denied/);assert.equal(count,1);
});
