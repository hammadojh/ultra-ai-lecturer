export class Discussion {
 constructor({budgetSeconds=90,idleSeconds=12,reserveSeconds=20}={}){this.config={budgetSeconds,idleSeconds,reserveSeconds};this.reset();}
 reset(){this.messages=[];this.state='idle';this.remaining=0;this.idle=0;this.batch=[];this.coverage=[];this.history=[];this.sequence=0;this.handAcknowledged=false;this.typingRemaining=0;this.final=false;}
 add(text,kind='question'){const message={id:`m${++this.sequence}`,text,kind,status:'queued'};if(this.state==='closed'){message.status='deferred';message.reason='Checkpoint closed; saved for later';}this.messages.push(message);return message;}
 get active(){return ['reviewing','speaking','followup'].includes(this.state);}
 get pending(){return this.messages.filter(m=>m.status==='queued');}
 raiseHand(){
  if(this.state!=='followup'||this.handAcknowledged)return false;
  this.handAcknowledged=true;this.idle=Math.min(20,this.remaining);return true;
 }
 typing(hasText){this.typingRemaining=hasText?20:0;}
 start({final=false}={}){
  this.final=final;this.remaining=final?Infinity:this.config.budgetSeconds;
  this.state='followup';this.idle=final?30:this.config.idleSeconds;this.handAcknowledged=false;
  this.messages.filter(m=>m.status==='deferred').forEach(m=>{m.status='queued';delete m.reason;});
 }
 select(){
  if(this.state!=='followup'||!this.pending.length)return null;
  if(this.remaining<this.config.reserveSeconds){this.close('Discussion time limit');return null;}
  this.batch=[...this.pending];this.batch.forEach(m=>m.status='selected');this.state='reviewing';return this.batch;
 }
 accept(response){
  if(this.state!=='reviewing')return false;
  this.coverage=response.addressedIds;
  this.batch.filter(m=>response.deferredIds.includes(m.id)).forEach(m=>{m.status='deferred';m.reason='Outside this response’s scope';});
  this.state='speaking';return true;
 }
 delivered(text){
  if(this.state!=='speaking')return;
  this.messages.filter(m=>this.coverage.includes(m.id)).forEach(m=>m.status='addressed');
  this.history.push(text);this.handAcknowledged=false;this.state='followup';this.idle=this.final?30:this.config.idleSeconds;
  if(this.remaining<=0)this.close('Discussion time limit');
 }
 fail(reason){this.batch.filter(m=>m.status==='selected').forEach(m=>{m.status='deferred';m.reason=reason;});this.state='followup';this.idle=this.config.idleSeconds;}
 close(reason='Follow-up window ended'){
  this.messages.filter(m=>['queued','selected'].includes(m.status)).forEach(m=>{m.status='deferred';m.reason=reason;});this.state='closed';
 }
 tick(seconds){
  if(!this.active||!Number.isFinite(seconds)||seconds<=0)return;
  if(this.state==='followup'&&this.typingRemaining>0&&!this.pending.length){
   this.typingRemaining=Math.max(0,this.typingRemaining-seconds);
   if(this.typingRemaining===0)this.close('Student stopped typing without submitting');
   return;
  }
  this.remaining=Math.max(0,this.remaining-seconds);
  // Never cut off a short spoken response to enforce a deadline.
  if(this.state==='speaking')return;
  if(this.remaining===0){this.close('Discussion time limit');return;}
  if(this.state==='followup'&&!this.pending.length){this.idle=Math.max(0,this.idle-seconds);if(this.idle===0)this.close();}
 }
}
