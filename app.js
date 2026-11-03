import {readReplyEvents} from './reply-stream.mjs';
import {user} from './account.js';
import { lecture as sampleLecture } from './lecture.mjs';
import {classroomLecture} from './classroom-lecture.mjs';
import {imageBounds,annotationActive} from './annotations.mjs';
const studentName=user.name;
const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);while(walker.nextNode()){const n=walker.currentNode;if(n.parentElement.tagName!=='SCRIPT'&&n.textContent.includes('Omar'))n.textContent=n.textContent.replaceAll('Omar',studentName);}
const publishedId=new URLSearchParams(location.search).get('published');
let lectureLoadFailed=false;
let lecture=sampleLecture;
if(publishedId){try{const r=await fetch('/api/published/'+encodeURIComponent(publishedId));if(!r.ok)throw Error('Published lecture not found.');const d=await r.json();if(d.classroom){lecture=d.classroom;}else{const source=d.sources.find(s=>s.id===d.presentation.sourceId);let pages=d.renderedPages||source?.import?.assets.filter(a=>a.kind==='page')||[];if(!pages.length){const response=await fetch('/api/render-slides',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({originalUrl:source.import.originalUrl})});const data=await response.json();if(!response.ok)throw Error(data.error);pages=data.pages;}lecture=classroomLecture(d,pages);}}catch(error){lectureLoadFailed=true;document.querySelector('.library-intro p').textContent=error.message+' Choose another lecture below.';}}
import { LecturePlayer } from './player.mjs';
import { Discussion } from './discussion.mjs';
import { Presenter } from './presenter.mjs';
const $ = id => document.getElementById(id);
const player = new LecturePlayer(lecture.segments.map(s=>({...s})),{checkpoints:true});
const discussion=new Discussion(lecture.discussion);
document.body.classList.toggle('no-avatar',lecture.avatar==='none');
let feedbackSegment=null,feedbackOffset=0,feedbackStarted=false,feedbackReady=false,feedbackItem=null,discussionRequest=null,discussionEpoch=0;
let replyRun=null,retryRestore=null,interruptedActivity=null;
const messageNodes=new Map();
const presenter=new Presenter($('avatar-3d'),message=>{
 $('presenter-status').textContent=message;
 $('voice-status').textContent=message;
},lecture.avatar||'default');
let lastCaptionId=null,lastSpokenCaption='';
let voiceEnabled=true, speakingId=null, muted=false;
function stopSpeech(){retryRestore?.();retryRestore=null;if(player.state==='discussion'&&presenter.position!==null)feedbackOffset=presenter.position;if(replyRun&&feedbackStarted&&feedbackSegment){replyRun.queue.unshift({...feedbackSegment,resumeOffset:feedbackOffset});feedbackSegment=null;}feedbackStarted=false;presenter.stop();speakingId=null;}
function startSpeech(){
 if(!voiceEnabled||player.state!=='playing'||speakingId===player.segment.id)return;
 const segment=player.segment;speakingId=segment.id;
 $('voice-error').hidden=true;
 presenter.play(segment,player.offset,{
  onReady:duration=>{segment.duration=duration;sync();const next=player.segments[player.index+1];if(next)presenter.clip(next).catch(()=>{});},
  onEnd:()=>{if(player.state!=='playing'||player.segment.id!==segment.id)return;speakingId=null;player.tick(Math.max(.001,segment.duration-player.offset));sync();resetClock();if(player.state==='playing')startSpeech();},
  onError:error=>{speakingId=null;player.pause();$('voice-error').textContent=error.message+' Resume to retry, or turn off Lecturer voice for silent playback.';$('voice-error').hidden=false;sync();}
 });
}
const handEvents=[];
let current = 0, captions = true, raised = false, questionCount = 0;
let drawnSlide = null;
let slideRenderEpoch=0;
const slideImages=new Map();
function preloadSlide(slide){
 if(!slide?.image)return null;
 if(!slideImages.has(slide.image)){
  const img=new Image();img.src=slide.image;
  const ready=img.decode().then(()=>img);ready.catch(()=>{});slideImages.set(slide.image,ready);
 }
 return slideImages.get(slide.image);
}
function renderSlide(slide){
 const epoch=++slideRenderEpoch;
 if(!slide.image){$('slide-content').innerHTML=`<div><h2 class="slide-title">${slide.title}</h2><p class="slide-copy">${slide.body}</p>${slide.html}</div>`;return;}
 // Keep the decoded previous slide on screen until the replacement is ready.
 preloadSlide(slide).then(img=>{
  if(epoch!==slideRenderEpoch)return;
  img.alt=slide.title||'Slide '+slide.id;img.id='classroom-slide-image';img.dataset.slide=slide.id;
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.id='classroom-annotations';
  $('slide-content').replaceChildren(img,svg);
 }).catch(()=>{if(epoch===slideRenderEpoch){drawnSlide=null;$('voice-error').textContent='Could not load this slide. Select Back to current slide or retry navigation.';$('voice-error').hidden=false;}});
}
let activityPosted = false;
let answerSubmitted = false;
let viewedSlide = null;
const formatTime = seconds => `${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;
function sync(){
 $('play').dataset.playing=String(player.state==='playing');
 if(player.state==='discussion'&&['idle','closed'].includes(discussion.state))discussion.start({final:!!player.segment.finalCheckpoint});
 const segment=player.segment;
 current=lecture.slides.findIndex(s=>s.id===(viewedSlide ?? segment.slide));
 const slide=lecture.slides[current];
 if(drawnSlide!==slide.id){
  renderSlide(slide);
  preloadSlide(lecture.slides[current+1]);
  drawnSlide=slide.id;
  if($('continue-lecture')) $('continue-lecture').onclick=()=>{viewedSlide=null;player.continue();resetClock();sync();};
 }
 document.querySelectorAll('.cue-active').forEach(el=>el.classList.remove('cue-active'));
 if(segment.highlight && $(segment.highlight)) $(segment.highlight).classList.add('cue-active');
 if($('activity')) $('activity').hidden=player.state!=='activity';
 if($('explanation')) $('explanation').hidden=segment.reveal!=='explanation';
 $('chapter').textContent=slide.chapter;
 $('slide-number').textContent=`${String(current+1).padStart(2,'0')} / ${String(lecture.slides.length).padStart(2,'0')}`;
 $('progress').textContent=`${current+1} of ${lecture.slides.length}`;
 setCaption(player.state==='ready'?'Ready when you are. Select Start lecture.':player.state==='activity'?(answerSubmitted?'Answer submitted. You can keep discussing until time runs out.':'Your turn. Submit your answer in the chat.'):streamedCaption(segment));
 const statuses={ready:'Ready to start',playing:voiceEnabled?'Presenting':'Presenting · silent',paused:'Paused',activity:'Activity break',discussion:'Class discussion',completed:'Lecture complete'};
 $('status').textContent=statuses[player.state];
 const waiting=player.state==='activity';
 document.querySelector('.stage').classList.toggle('waiting',waiting);
 $('waiting-state').hidden=!waiting;
 updateTimer();
 $('chat-waiting').hidden=!waiting;
 if(waiting&&!activityPosted){
  activityPosted=true;answerSubmitted=false;
  $('time-status').textContent='';
  if($('message-kind').value!=='discussion')$('message-kind').value='answer';
  appendMessage('AI LECTURER',segment.question,`Answer in the next ${Math.ceil(player.answerRemaining)} seconds.`,'lecturer-message');
  document.body.classList.remove('chat-collapsed');
 }
 if(!waiting){activityPosted=false;answerSubmitted=false;if($('message-kind').value==='answer')$('message-kind').value='question';}
 $('back-current').hidden=viewedSlide===null;
 $('more-time').hidden=!waiting&&player.state!=='discussion';
 $('facilitator-controls').hidden=user.role!=='admin'||(!waiting&&player.state!=='discussion');
 $('play').textContent=player.state==='playing'?'Pause':player.state==='ready'?'Start lecture':player.state==='completed'?'Completed':player.state==='activity'?'Waiting for your answer':'Resume';
 $('play').disabled=['activity','discussion','completed'].includes(player.state);
 $('prev').disabled=current===0; $('next').disabled=current===lecture.slides.length-1;
 $('elapsed').textContent=`${formatTime(player.elapsed)} / ${formatTime(player.duration)}`;
 $('timeline').value=player.elapsed; $('timeline').max=player.duration;
 $('runtime-state').textContent=player.state==='activity'?'Waiting for an answer · countdown on slide':player.state==='completed'?'Complete · replay anytime':voiceEnabled?'Narration on':'Silent playback';
 updateComposer();
 renderDiscussion();
}
let lastTime=performance.now();
function resetClock(){lastTime=performance.now();}
function frame(now){
 const before=player.index, state=player.state;
 if(!document.hidden&&!$('classroom-view').hidden){
  if(player.state==='discussion'){discussion.tick((now-lastTime)/1000,{buffering:!!replyRun&&!presenter.active&&!replyRun.reading});stepDiscussion((now-lastTime)/1000);}
  else if(player.state==='playing'&&voiceEnabled){const position=presenter.position;if(position!==null)player.offset=Math.min(position,player.segment.duration-.0001);}
  else player.tick((now-lastTime)/1000);
 }lastTime=now;
 if(state==='activity'&&player.state!=='activity')viewedSlide=null;
 if(before!==player.index||state!==player.state){sync();if(player.state==='playing')startSpeech();}
 else if(player.state==='activity'){updateTimer();}
 else if(player.state==='discussion'){renderDiscussion();}
 else if(player.state==='playing'){
  $('elapsed').textContent=`${formatTime(player.elapsed)} / ${formatTime(player.duration)}`;
  $('timeline').value=player.elapsed;
 }
 requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
$('play').onclick=()=>{if(player.state==='playing'){if(presenter.position!==null)player.offset=presenter.position;player.pause();stopSpeech();}else player.play();resetClock();sync();startSpeech();};
$('restart').onclick=()=>{discussionEpoch++;discussionRequest?.abort();replyRun=null;interruptedActivity=null;discussion.reset();handEvents.length=0;raised=false;$('hand').setAttribute('aria-pressed','false');$('hand').setAttribute('aria-label','Raise hand');$('hand').title='Raise hand';feedbackSegment=null;feedbackOffset=0;feedbackItem=null;messageNodes.clear();questionCount=0;$('question-count').textContent='0';$('question-list').replaceChildren();stopSpeech();viewedSlide=null;player.restart();resetClock();sync();};
function browseSlide(index){
 if(index<0||index>=lecture.slides.length)return;
 viewedSlide=lecture.slides[index].id===player.segment.slide?null:lecture.slides[index].id;
 sync();
}
$('back-current').onclick=()=>{viewedSlide=null;sync();};
function extendTime(){
 const extended=player.state==='activity'?player.extendActivity(30):discussion.extend(30);
 if(extended){$('time-status').textContent='30 seconds added to this session.';resetClock();sync();}
}
$('more-time').onclick=extendTime;
$('extend-time').onclick=()=>{if(user.role==='admin')extendTime();};
$('skip-time').onclick=()=>{
 if(user.role!=='admin')return;
 if(player.state==='activity'){player.completeAnswers();viewedSlide=null;resetClock();sync();}
 else if(player.state==='discussion'){discussion.close('Facilitator ended discussion');finishDiscussion();}
};
$('prev').onclick=()=>browseSlide(current-1);
$('next').onclick=()=>browseSlide(current+1);
document.addEventListener('visibilitychange',()=>{if(document.hidden){player.pause();stopSpeech();sync();}resetClock();});
$('captions').onclick=()=>{captions=!captions;$('captions').setAttribute('aria-pressed',captions);$('captions').querySelector('span').textContent=`Captions ${captions?'on':'off'}`;$('caption').hidden=!captions;};
function updateAnswerNow(){
 const available=raised||discussion.messages.some(m=>m.raisedHand&&['queued','deferred'].includes(m.status));
 $('answer-now').hidden=user.role!=='admin'||!available;
 $('answer-now').disabled=!!replyRun||['reviewing','speaking'].includes(discussion.state);
}
$('answer-now').onclick=()=>{
 if(user.role!=='admin'||$('answer-now').disabled||$('answer-now').hidden)return;
 if(player.state!=='discussion'){
  if(player.state==='playing'&&presenter.position!==null)player.offset=presenter.position;
  stopSpeech();interruptedActivity={activityPosted,answerSubmitted};
  player.interruptForDiscussion();discussion.start();
 }
 discussion.remaining=Math.max(discussion.remaining,discussion.config.budgetSeconds);
 discussion.idle=Math.max(discussion.idle,30);
 viewedSlide=null;$('message-kind').value='question';document.body.classList.remove('chat-collapsed');
 resetClock();sync();
 if(discussion.pending.length)requestFeedback();else {$('hand-status').textContent='The lecturer is listening now. Submit your question.';$('question').focus();}
};
function acknowledgeHand(){
 if(!raised||!discussion.raiseHand())return;
 appendMessage('AI LECTURER',`${studentName}, I see your hand. Please type your question in the chat.`,'Your question window is open.','lecturer-message');
 $('hand-status').textContent=`${studentName}, you have the floor. Type and submit your question.`;
 $('question').focus();
}
$('hand').onclick=()=>{
 raised=!raised;if(raised)handEvents.push({segment:player.index,fraction:player.offset/player.segment.duration});$('hand').setAttribute('aria-pressed',raised);
 $('hand').querySelector('span').textContent=raised?'Lower hand':'Raise hand';
 $('hand').setAttribute('aria-label',raised?'Lower hand':'Raise hand');$('hand').title=raised?'Lower hand':'Raise hand';renderCheckpoints();
 $('hand-status').textContent=raised?'Hand raised. You’ll be invited to ask at the next available discussion turn.':'';
 if(raised&&!(player.state==='discussion'&&discussion.state==='followup')){
  const timing=player.state==='discussion'?'after this response, during this checkpoint':player.state==='completed'?'when you restart the lecture':'during the next checkpoint';
  appendMessage('AI LECTURER',`${studentName}, I see you raised your hand. I’ll respond to you ${timing}.`,'Hand acknowledged','lecturer-message');
 }
 acknowledgeHand();updateAnswerNow();
};
function appendMessage(author,value,status,className=''){
 if(questionCount===0)$('question-list').replaceChildren();
 const item=document.createElement('article');item.className='question-item '+className;
 const label=document.createElement('small');label.textContent=author==='AI LECTURER'?'Lecturer':author==='YOU'?studentName:author;
 const text=document.createElement('p');text.textContent=value;
 const context=document.createElement('small');context.textContent=status;
 item.append(label,text,context);$('question-list').append(item);$('question-count').textContent=++questionCount;
 $('question-list').scrollTop=$('question-list').scrollHeight;
 return context;
}
function updateTimer(){
 const remaining=formatTime(Math.ceil(player.answerRemaining));
 $('answer-timer').textContent=remaining;
 $('chat-answer-timer').textContent=remaining;
}
function updateComposer(){
 const waiting=player.state==='activity';
 const submitted=waiting&&answerSubmitted;
 $('message-kind').querySelector('[value=answer]').disabled=!waiting||submitted;
 if(submitted&&$('message-kind').value==='answer')$('message-kind').value='question';
 const kind=$('message-kind').value;
 document.querySelectorAll('[data-message-kind]').forEach(button=>{
  button.disabled=$('message-kind').querySelector(`[value=${button.dataset.messageKind}]`).disabled;
  button.setAttribute('aria-pressed',String(button.dataset.messageKind===kind));
 });
 $('question').placeholder=kind==='discussion'?'Discuss with the class…':kind==='answer'?'Type your answer…':'Ask the lecturer…';
 $('message-label').textContent=kind==='discussion'?'Class discussion':kind==='answer'?'Your answer':'Your question';
 $('question').disabled=false;
 const button=$('question-form').querySelector('button[type=submit]');
 button.disabled=false;button.textContent='↑';
 $('chat-waiting').querySelector('strong').textContent=submitted?'Answer submitted':'Waiting for your answer';
 $('chat-waiting').querySelector('small').textContent=submitted?'The explanation resumes when time runs out':'Submit before the explanation resumes';
 $('waiting-label').textContent=submitted?'Activity time remaining':'Waiting for your answer';
 if(submitted){$('status').textContent='Activity time remaining';$('play').textContent='Activity in progress';$('runtime-state').textContent='Answer submitted · activity continues';}
}
$('question-form').onsubmit=e=>{
 e.preventDefault();const value=$('question').value.trim();
 if(!value){$('question').setCustomValidity('Please write a message.');$('question').reportValidity();return;}
 const kind=$('message-kind').value;
 const isAnswer=kind==='answer'&&player.state==='activity'&&!answerSubmitted;
 if(kind==='answer'&&!isAnswer){updateComposer();return;}
 const message=discussion.add(value,kind);
 if(raised&&kind==='question')message.raisedHand=true;
 const node=appendMessage('YOU',value,kind==='discussion'?'Class discussion · not submitted as an answer':isAnswer?'Answer submitted · awaiting checkpoint':`Queued for checkpoint · slide ${current+1}`);messageNodes.set(message.id,node);
 $('question').value='';$('question').style.height='36px';discussion.typing(false);
 if(raised&&kind!=='discussion'){raised=false;$('hand').setAttribute('aria-pressed','false');$('hand').querySelector('span').textContent='Raise hand';$('hand-status').textContent='Question received. It will be addressed in the next response.';}
 if(isAnswer){answerSubmitted=true;sync();}
 renderDiscussion();
};
$('question').oninput=()=>{$('question').setCustomValidity('');discussion.typing($('message-kind').value!=='discussion'&&!!$('question').value.trim());$('question').style.height='auto';$('question').style.height=Math.min(110,$('question').scrollHeight)+'px';};
document.querySelectorAll('[data-message-kind]').forEach(button=>{button.onclick=()=>{
 $('message-kind').value=button.dataset.messageKind;
 $('message-kind').dispatchEvent(new Event('change'));
};});
$('message-kind').onchange=()=>{discussion.typing($('message-kind').value!=='discussion'&&!!$('question').value.trim());updateComposer();};
$('question').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('question-form').requestSubmit();}};
sync();

function showLibrary(){document.body.classList.remove('watch-page');$('lecture-breadcrumb').hidden=true;player.pause();const returnLink=document.querySelector('[data-current-lecture]');if(returnLink&&player.state!=='ready'){returnLink.querySelector('.lecture-card-action').textContent='Return to classroom';returnLink.setAttribute('aria-label','Return to classroom: '+lecture.title);}stopSpeech();sync();document.body.classList.remove('focus-mode','chat-collapsed');$('focus').setAttribute('aria-pressed','false');$('focus').querySelector('span').textContent='Focus mode';$('library').hidden=false;$('classroom-view').hidden=true;$('library-nav').setAttribute('aria-current','page');window.scrollTo(0,0);}
function openClassroom(){document.body.classList.add('watch-page','navigation-collapsed');$('menu-toggle').setAttribute('aria-expanded','false');$('lecture-breadcrumb').hidden=false;$('lecture-breadcrumb').textContent=lecture.title;$('library').hidden=true;$('classroom-view').hidden=false;$('library-nav').removeAttribute('aria-current');window.scrollTo(0,0);presenter.init().then(()=>{presenter.idle();presenter.mute(muted);}).catch(()=>{});};
$('open-lecture').onclick=()=>{if(publishedId){location.assign('/?demo=1');return;}openClassroom();};
$('library-nav').onclick=showLibrary;$('back-library').onclick=showLibrary;
function setFocus(value){document.body.classList.toggle('focus-mode',value);document.body.classList.remove('chat-collapsed');$('focus').setAttribute('aria-pressed',String(value));$('focus').querySelector('span').textContent=value?'Exit focus mode':'Focus mode';$('focus').setAttribute('aria-label',value?'Exit focus mode':'Focus mode');$('focus').title=value?'Exit focus mode':'Focus mode';window.scrollTo(0,0);}
$('focus').onclick=()=>setFocus(!document.body.classList.contains('focus-mode'));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('focus-mode')){setFocus(false);$('focus').focus();}});


$('voice-enabled').onchange=()=>{if(player.state==='discussion')return;stopSpeech();voiceEnabled=$('voice-enabled').checked;player.pause();$('voice-error').hidden=true;sync();};
$('mute').onclick=()=>{muted=!muted;presenter.mute(muted);$('mute').setAttribute('aria-pressed',String(muted));$('mute').textContent=muted?'Unmute':'Mute';};

// Named exports support integration checks without adding globals.
export { player, presenter, discussion };

function renderDiscussion(){
 updateAnswerNow();
 const active=player.state==='discussion';
 for(const button of document.querySelectorAll('.retry-speech')){button.disabled=!active||discussion.state!=='followup'||!!replyRun;button.title=active?'Replay this answer aloud':'This discussion has ended';}
 if(active)acknowledgeHand();
 renderCheckpoints();
 $('voice-enabled').disabled=active;
 $('checkpoint-panel').hidden=!active;
 const awaitingFollowup=active&&discussion.state==='followup';
 $('followup-waiting').hidden=!awaitingFollowup;
 if(awaitingFollowup){
 $('followup-timer').hidden=discussion.typingRemaining>0;
 $('followup-timer').textContent=formatTime(Math.ceil(Math.min(discussion.idle,discussion.remaining)));
 $('followup-waiting').querySelector('strong').textContent=discussion.typingRemaining>0?'Waiting for student question…':`${studentName}, any follow-up questions?`;
 $('followup-waiting').querySelector('small').textContent=discussion.typingRemaining>0?'Take your time typing. Submit when ready.':discussion.final?'Q&A closes when this timer ends.':'The lecture continues when this timer ends.';
 }
 for(const message of discussion.messages){const node=messageNodes.get(message.id);if(node)node.textContent=({conversation:'Class discussion · not submitted as an answer',queued:'Queued for checkpoint',selected:'Included in current response',addressed:'Addressed',deferred:'Deferred: '+(message.reason||'For later')})[message.status];}
 if(!active)return;
 const labels={reviewing:'Reviewing class messages',speaking:'Addressing the class',followup:'Any follow-up questions?',closed:'Returning to the lecture'};
 $('checkpoint-title').textContent=labels[discussion.state]||'Class discussion';
 $('checkpoint-time').textContent=discussion.typingRemaining>0&&discussion.state==='followup'?'Typing…':discussion.final&&discussion.state!=='followup'?'Final Q&A':formatTime(Math.ceil(discussion.state==='followup'?Math.min(discussion.idle,discussion.remaining):discussion.remaining));
 $('checkpoint-detail').textContent=discussion.state==='followup'?discussion.final?'Final Q&A · ask about anything in this lecture':`Follow-up window · ${formatTime(Math.ceil(discussion.remaining))} discussion time left`:'New questions stay queued until this response finishes.';
 $('status').textContent=labels[discussion.state]||'Class discussion';
 $('play').textContent='Checkpoint discussion';$('runtime-state').textContent=discussion.final?'Final Q&A · lecture ends after discussion':'Lecture resumes automatically after discussion';
 setCaption(discussion.state==='speaking'&&feedbackSegment?(!voiceEnabled||feedbackReady?streamedCaption(feedbackSegment):'Thinking…'):replyRun||discussion.state==='reviewing'?'Thinking…':'You can ask a follow-up question before we continue.');
 updateComposer();
 const button=$('question-form').querySelector('button[type=submit]');button.disabled=false;button.textContent='↑';
}
function finishDiscussion(){
 discussionRequest?.abort();discussionRequest=null;discussionEpoch++;replyRun=null;
 stopSpeech();feedbackSegment=null;feedbackOffset=0;feedbackItem=null;viewedSlide=null;
 appendMessage('AI LECTURER',!player.interruption&&player.segment.finalCheckpoint?`Thank you, ${studentName}. That concludes our lecture and Q&A.`:'Let’s continue with the lesson.','Discussion closed; deferred messages remain visible.','lecturer-message');
 player.continue();
 if(interruptedActivity){({activityPosted,answerSubmitted}=interruptedActivity);interruptedActivity=null;}
 resetClock();sync();startSpeech();
}
function stepDiscussion(dt){
 if(discussion.state==='closed'){finishDiscussion();return;}
 if(discussion.state==='followup'&&discussion.pending.length&&!replyRun){requestFeedback();return;}
 const run=replyRun;if(!run)return;
 if(feedbackStarted)return;
 if(run.queue.length){startFeedback(run.queue.shift());return;}
 if(!run.done||!run.result)return;
 if(!voiceEnabled||run.audioFailed){
  run.reading=true;discussion.state='speaking';
  feedbackSegment={id:run.result.segmentId,text:run.result.text};feedbackReady=true;
  run.readSeconds=(run.readSeconds||0)+dt;
  if(run.readSeconds<Math.max(5,run.result.text.split(/\s+/).length/2.5))return;
 }
 finishFeedback();
}
async function requestFeedback(){
 const batch=discussion.select();if(!batch)return;
 const epoch=discussionEpoch;discussionRequest=new AbortController();
 const run=replyRun={queue:[],done:false,result:null,audioFailed:false,text:'',started:performance.now()};
 feedbackItem=appendMessage('AI LECTURER','Thinking…','Preparing reply','lecturer-message');
 const item=feedbackItem;renderDiscussion();
 try{
  const response=await fetch('/api/discuss',{method:'POST',headers:{'Content-Type':'application/json'},signal:discussionRequest.signal,body:JSON.stringify({messages:batch.map(({id,text,kind})=>({id,text,kind})),history:discussion.history,checkpointId:player.segment.id,publishedId,stream:true,silent:!voiceEnabled,facilitatorOverride:!!player.interruption})});
  if(!response.ok)throw Error('Feedback unavailable');
  await readReplyEvents(response.body,event=>{
   if(epoch!==discussionEpoch||replyRun!==run)return;
   if(event.type==='text'){run.text=event.text;item.parentElement.querySelector('p').textContent=event.text;}
   if(event.type==='audio'&&!run.audioFailed){run.queue.push({id:'reply-'+epoch+'-'+batch[0].id+'-'+event.index,text:event.text,audioData:event.audio});if(event.audio.fallback)run.fallback=true;}
   if(event.type==='speech-error'){run.audioFailed=true;run.queue=[];item.textContent='Voice unavailable · answer available as text';}
   if(event.type==='answer'){run.result=event;run.text=event.text;discussion.accept(event);item.parentElement.querySelector('p').textContent=event.text;}
   if(event.type==='done')run.done=true;
  });
  if(epoch!==discussionEpoch||replyRun!==run)return;
  if(!run.result)throw Error('Reply incomplete');
  if(run.audioFailed)addSpeechRetry(item,run.result,epoch);
 }catch(error){
  if(epoch!==discussionEpoch||replyRun!==run)return;
  stopSpeech();replyRun=null;feedbackSegment=null;
  discussion.fail('Reply interrupted; retained for later');
  item.textContent='Incomplete reply · questions deferred';
  if(!run.text)item.parentElement.querySelector('p').textContent='The reply could not be generated. Please ask again.';
  renderDiscussion();
 }
}
function startFeedback(segment){
 const run=replyRun;if(!run)return;
 feedbackSegment=segment;feedbackStarted=true;feedbackReady=false;feedbackOffset=0;
 const epoch=discussionEpoch;
 presenter.play(segment,segment.resumeOffset||0,{
  onReady:()=>{
   if(epoch!==discussionEpoch||replyRun!==run)return;
   discussion.state='speaking';feedbackReady=true;
   if(!run.firstAudioMs){run.firstAudioMs=Math.round(performance.now()-run.started);console.info('Q&A first audio',run.firstAudioMs+'ms');}
   if(feedbackItem)feedbackItem.textContent=run.fallback?'Speaking · Kokoro fallback':'Speaking reply';renderDiscussion();
  },
  onEnd:()=>{if(epoch!==discussionEpoch||replyRun!==run)return;feedbackStarted=false;feedbackSegment=null;feedbackReady=false;},
  onError:()=>{
   if(epoch!==discussionEpoch||replyRun!==run)return;
   feedbackStarted=false;feedbackSegment=null;run.audioFailed=true;run.queue=[];
   if(feedbackItem){feedbackItem.textContent='Voice unavailable · answer available as text';if(run.result)addSpeechRetry(feedbackItem,run.result,epoch);}
  }
 });
}
function addSpeechRetry(item,result,epoch){
 if(item.parentElement.querySelector('.retry-speech'))return;
 const button=document.createElement('button');button.className='retry-speech';button.textContent='Retry voice';button.disabled=!!replyRun;
 button.onclick=()=>{
  if(epoch!==discussionEpoch||replyRun||discussion.state!=='followup')return;
  button.disabled=true;discussion.state='reviewing';
  const segment={id:result.segmentId,text:result.text};feedbackSegment=segment;feedbackReady=false;
  const restore=()=>{retryRestore=null;if(epoch!==discussionEpoch)return;discussion.state='followup';discussion.idle=discussion.final?30:discussion.config.idleSeconds;feedbackSegment=null;button.disabled=false;};
  retryRestore=restore;
  presenter.play(segment,0,{onReady:()=>{discussion.state='speaking';feedbackReady=true;},onEnd:restore,onError:()=>{item.textContent='Voice still unavailable · text answer retained';restore();}});
 };
 item.parentElement.append(button);
}
function finishFeedback(){
 const run=replyRun;if(!run?.result)return;
 discussion.accept(run.result);discussion.delivered(run.result.text);
 feedbackStarted=false;feedbackOffset=0;feedbackSegment=null;replyRun=null;
 if(feedbackItem)feedbackItem.textContent=run.audioFailed?'Answer delivered as text':run.fallback?'Reply delivered · Kokoro fallback':'Reply delivered';
 if(feedbackItem)for(const button of feedbackItem.parentElement.querySelectorAll('.retry-speech'))button.disabled=false;
 feedbackItem=null;renderDiscussion();
}

function renderCheckpoints(){
 const hands=$('timeline-hands');hands.replaceChildren();
 handEvents.forEach(event=>{
 const position=player.segments.slice(0,event.segment).reduce((sum,s)=>sum+s.duration,0)+player.segments[event.segment].duration*event.fraction;
 const pin=document.createElement('span');pin.className='hand-marker';pin.textContent='O';pin.style.left=Math.min(98,Math.max(2,position/player.duration*100))+'%';
 pin.title=`${studentName} raised a hand`;pin.setAttribute('aria-label',`${studentName} raised a hand`);hands.append(pin);
 });
 const container=$('timeline-checkpoints');
 container.replaceChildren();
 let elapsed=0;
 player.segments.forEach((segment,index)=>{
  elapsed+=segment.duration;
  if(!segment.holdAfter&&!segment.finalCheckpoint)return;
  const marker=document.createElement('span');
  const active=player.index===index&&['activity','discussion'].includes(player.state);
  const passed=player.index>index||player.state==='completed';
  marker.className='checkpoint-marker'+(active?' current':passed?' passed':'');
  const position=elapsed/player.duration*100;marker.style.left=position+'%';
  marker.style.top='12px';
  const label=segment.finalCheckpoint?'Final Q&A':'Q&A';
  marker.textContent=active?`◆ ${label} · now`:passed?`✓ ${label}`:`◆ ${label}`;
  marker.title=segment.finalCheckpoint?'Final open Q&A for all remaining questions':'Discussion checkpoint after the practice question';
  if(segment.finalCheckpoint)marker.style.transform='translateX(-100%)';
  container.append(marker);
 });
}

async function loadLectureLibrary(){
 $('library-status').textContent='Loading lectures…';$('retry-library').hidden=true;
 try{
  const response=await fetch('/api/published');if(!response.ok)throw Error();const {lectures}=await response.json();if(!Array.isArray(lectures))throw Error();
  $('published-lectures').replaceChildren();$('lecture-total').textContent=String(lectures.length);
  for(const item of lectures){
   const row=document.createElement('article');row.className='lecture-card';
   const link=document.createElement('a');link.className='lecture-card-link';link.href='/?published='+encodeURIComponent(item.id);link.setAttribute('aria-label','Enter classroom: '+item.title);
   const thumbnail=document.createElement('div');thumbnail.className='lecture-thumbnail';
   const label=document.createElement('span');label.className='thumbnail-label';label.textContent='ULTRA / CLASSROOM';
   const coverTitle=document.createElement('strong');coverTitle.textContent=item.title;
   const duration=document.createElement('span');duration.className='thumbnail-duration';duration.textContent=item.duration+' min';
   const play=document.createElement('span');play.className='thumbnail-play';play.textContent='▷';play.setAttribute('aria-hidden','true');
   thumbnail.append(label,coverTitle,play,duration);
   const body=document.createElement('div');body.className='lecture-card-body';
   const title=document.createElement('h3');title.textContent=item.title;
   const detail=document.createElement('p');detail.textContent='Ultra classroom · '+item.duration+' min';
   const action=document.createElement('span');action.className='lecture-card-action';action.textContent='Watch & discuss';
   body.append(title,detail,action);link.append(thumbnail,body);row.append(link);
   if(item.id===publishedId&&!lectureLoadFailed){link.dataset.currentLecture='true';link.onclick=e=>{e.preventDefault();openClassroom();};}
   $('published-lectures').append(row);
  }
  $('library-status').textContent=lectures.length?'':'No lectures have been published yet. You can try the classroom demo below.';filterLectureLibrary();
 }catch{$('library-status').textContent='We couldn’t load your lectures. Try again.';$('retry-library').hidden=false;}
}
function filterLectureLibrary(){const query=$('student-search').value.trim().toLowerCase(),rows=[...$('published-lectures').children];for(const row of rows)row.hidden=!row.querySelector('h3').textContent.toLowerCase().includes(query);$('library-empty').hidden=!rows.length||rows.some(row=>!row.hidden);}
$('student-search').oninput=()=>{if(!$('classroom-view').hidden)showLibrary();filterLectureLibrary();};$('retry-library').onclick=loadLectureLibrary;loadLectureLibrary();

if(publishedId&&!lectureLoadFailed){
 document.body.classList.add('authored-classroom');document.querySelector('.lecture-heading h1').textContent=lecture.title;document.querySelector('.lecture-heading .eyebrow').textContent='YOUR CLASSROOM';document.querySelector('.lecture-heading p').textContent='Slides, narration and discussion';document.querySelector('.stage-bottom span').textContent=lecture.title;document.querySelector('.prototype').textContent='Student classroom';
 openClassroom();
}
function setCaption(text){
 const box=$('caption'),previous=box.textContent;
 if(previous===text)return;
 const extending=previous&&text.startsWith(previous+' ');
 if(!extending)box.replaceChildren();
 const addition=extending?text.slice(previous.length).trim():text;
 for(const word of addition.split(/\s+/).filter(Boolean)){
  if(box.childNodes.length)box.append(document.createTextNode(' '));
  const span=document.createElement('span');span.className='caption-word';span.textContent=word;box.append(span);
 }
}
function streamedCaption(segment){
 if(replyRun?.reading&&player.state==='discussion')return segment.text;
 const active=presenter.active;
 if(active?.id===segment.id){
  const words=active.words?.length?active.words:segment.text.split(/\s+/),times=active.wtimes;
  const time=(presenter.position||0)*1000;
  let count=times?.length===words.length?times.filter(t=>t<=time).length:Math.floor(time/1000/active.duration*words.length)+1;
  count=Math.min(words.length,Math.max(0,count));
  // Keep a short readable phrase, revealing words at their audio timestamps.
  const start=Math.floor(Math.max(0,count-1)/12)*12;
  lastCaptionId=segment.id;lastSpokenCaption=words.slice(start,count).join(' ').replace(/\s+/g,' ').trim();
  return lastSpokenCaption;
 }
 if(!voiceEnabled){const words=segment.text.split(/\s+/);const count=Math.min(words.length,Math.max(1,Math.floor(player.offset/Math.max(1,segment.duration)*words.length)+1));return words.slice(Math.floor((count-1)/12)*12,count).join(' ');}
 return lastCaptionId===segment.id?lastSpokenCaption:'Thinking…';
}
function updateStreamingCaption(){
 const segment=player.state==='discussion'&&discussion.state==='speaking'?feedbackSegment:player.segment;
 if(!segment||!['playing','paused','discussion'].includes(player.state))return;
 if(player.state==='discussion'&&discussion.state!=='speaking')return;
 setCaption(streamedCaption(segment));
}
function drawClassroomAnnotations(){
 updateStreamingCaption();
 const svg=$('classroom-annotations'),img=$('classroom-slide-image');if(svg&&img){svg.replaceChildren();const segment=player.segment;if(player.state==='playing'&&segment.slide===lecture.slides[current]?.id&&img.dataset.slide===String(segment.slide)&&presenter.position!==null){const b=imageBounds(img.clientWidth,img.clientHeight,img.naturalWidth||16,img.naturalHeight||9);for(const a of segment.annotations||[]){if(!annotationActive(a,presenter.position))continue;const n=document.createElementNS('http://www.w3.org/2000/svg',a.style==='circle'?'ellipse':a.style==='underline'?'line':'rect'),x=b.x+a.x*b.width,y=b.y+a.y*b.height,w=a.w*b.width,h=a.h*b.height,attrs=a.style==='circle'?{cx:x+w/2,cy:y+h/2,rx:w/2,ry:h/2}:a.style==='underline'?{x1:x,y1:y+h,x2:x+w,y2:y+h}:{x,y,width:w,height:h};for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);n.setAttribute('stroke','#ffbd17');n.setAttribute('stroke-width','3');n.setAttribute('fill',a.style==='highlight'?'#ffd82d40':'none');svg.append(n);}}}requestAnimationFrame(drawClassroomAnnotations);
}drawClassroomAnnotations();

if(!publishedId&&new URLSearchParams(location.search).get('demo')==='1')openClassroom();

$('menu-toggle').onclick=()=>{const collapsed=document.body.classList.toggle('navigation-collapsed');$('menu-toggle').setAttribute('aria-expanded',String(!collapsed));};
$('demo-nav').onclick=()=>$('open-lecture').click();
for(const [index,slide] of lecture.slides.entries()){
 const button=document.createElement('button');button.type='button';button.className='slide-chapter';
 const number=document.createElement('span');number.textContent=String(index+1).padStart(2,'0');
 const title=document.createElement('span');title.textContent=slide.title||'Slide '+(index+1);
 button.append(number,title);button.onclick=()=>{browseSlide(index);document.querySelector('.stage').scrollIntoView({block:'start',behavior:'instant'});};
 $('slide-chapters').append(button);
}

if(matchMedia('(max-width:800px)').matches){document.body.classList.add('navigation-collapsed');$('menu-toggle').setAttribute('aria-expanded','false');}
