// Use the established dual-connection handshake: the newer fast-join path
// changes RTC configuration after creating its offer, which embedded browsers reject.
// Rejoin with a fresh PeerConnection instead of asking the browser to mutate
// an existing connection's configuration during LiveKit signal resumption.
export async function connectAvatarRoom(sdk,session,onTrack,{attempts=2}={}){
 let lastError;
 for(let attempt=0;attempt<attempts;attempt++){
  const room=new sdk.Room({adaptiveStream:false,dynacast:false,singlePeerConnection:false,reconnectPolicy:{nextRetryDelayInMs:()=>null}});
  room.on(sdk.RoomEvent.TrackSubscribed,onTrack);
  try{await room.connect(session.livekit_url,session.livekit_client_token,{rtcConfig:{iceTransportPolicy:'relay'},peerConnectionTimeout:20000,maxRetries:0});await room.startAudio();return room;}
  catch(error){lastError=error;await room.disconnect().catch(()=>{});if(!/setConfiguration|signal connection|peer.?connection|could not establish pc connection/i.test(error.message))throw error;}
 }
 throw lastError;
}
