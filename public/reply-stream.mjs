// A response is streamed as independently playable, timed sentences. Speech work
// overlaps model output; coverage is committed only after the final JSON validates.
export async function streamReply({generate,speak,emit,signal}){
 let chain=Promise.resolve(),index=0,text='',speechFailed=false;const started=performance.now();
 const cancelled=new AbortController(),speechSignal=AbortSignal.any([cancelled.signal,...(signal?[signal]:[])]);
 const queue=sentence=>{
  signal?.throwIfAborted();const id=index++;text+=(text?' ':'')+sentence;
  emit({type:'text',text,sentence,index:id});
  chain=chain.then(async()=>{
   speechSignal.throwIfAborted();
   try{if(speechFailed)throw Error('Speech unavailable');const audio=await speak(sentence,speechSignal);speechSignal.throwIfAborted();emit({type:'audio',index:id,text:sentence,audio,elapsedMs:Math.round(performance.now()-started)});}
   catch(error){if(speechSignal.aborted)throw error;speechFailed=true;emit({type:'speech-error',index:id,text:sentence});}
  });
  // Attach a handler immediately, including while generation is still running.
  chain.catch(()=>{});
 };
 try{const result=await generate(queue);emit({type:'answer',...result});await chain;signal?.throwIfAborted();emit({type:'done',elapsedMs:Math.round(performance.now()-started)});}
 catch(error){cancelled.abort();await chain.catch(()=>{});throw error;}
}

export async function readReplyEvents(body,onEvent){
 const reader=body.getReader(),decoder=new TextDecoder();let buffer='',doneEvent=false;
 try{while(true){const {value,done}=await reader.read();buffer+=decoder.decode(value||new Uint8Array(),{stream:!done});let end;
  while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!line.trim())continue;const event=JSON.parse(line);if(event.type==='error')throw Error(event.error);if(event.type==='done')doneEvent=true;onEvent(event);}
  if(done)break;
 }if(!doneEvent)throw Error('Reply interrupted.');}catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
}
