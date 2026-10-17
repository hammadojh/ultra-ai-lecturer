import { lecture as sampleLecture } from './lecture.mjs';
import {classroomLecture} from './classroom-lecture.mjs';
import {imageBounds,annotationActive} from './annotations.mjs';
const publishedId=new URLSearchParams(location.search).get('published');
let lecture=sampleLecture;
if(publishedId){try{const r=await fetch('/api/published/'+encodeURIComponent(publishedId));if(!r.ok)throw Error('Published lecture not found.');const d=await r.json(),source=d.sources.find(s=>s.id===d.presentation.sourceId);let pages=source.import.assets.filter(a=>a.kind==='page');if(!pages.length){const response=await fetch('/api/render-slides',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({originalUrl:source.import.originalUrl})});const data=await response.json();if(!response.ok)throw Error(data.error);pages=data.pages;}lecture=classroomLecture(d,pages);}catch(error){document.querySelector('.library-intro p').textContent=error.message;throw error;}}
import { LecturePlayer } from './player.mjs';
import { Discussion } from './discussion.mjs';
import { Presenter } from './presenter.mjs';
const $ = id => document.getElementById(id);
const player = new LecturePlayer(lecture.segments.map(s=>({...s})),{checkpoints:true});
const discussion=new Discussion(lecture.discussion);
let feedbackSegment=null,feedbackOffset=0,feedbackStarted=false,feedbackReady=false,feedbackItem=null,discussionRequest=null,discussionEpoch=0;
const messageNodes=new Map();
const presenter=new Presenter($('avatar-3d'),message=>{
 $('presenter-status').textContent=message;
 $('voice-status').textContent=message;
});
let voiceEnabled=true, speakingId=null, muted=false;
function stopSpeech(){if(player.state==='discussion'&&presenter.position!==null)feedbackOffset=presenter.position;feedbackStarted=false;presenter.stop();speakingId=null;}
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
let activityPosted = false;
let answerSubmitted = false;
let viewedSlide = null;
const formatTime = seconds => `${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;
function sync(){
 if(player.state==='discussion'&&['idle','closed'].includes(discussion.state))discussion.start({final:!!player.segment.finalCheckpoint});
 const segment=player.segment;
 current=lecture.slides.findIndex(s=>s.id===(viewedSlide ?? segment.slide));
 const slide=lecture.slides[current];
 if(drawnSlide!==slide.id){
  if(slide.image){$('slide-content').replaceChildren();const img=document.createElement('img');img.src=slide.image;img.alt='Original slide '+slide.id;img.id='classroom-slide-image';const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.id='classroom-annotations';$('slide-content').append(img,svg);}else $('slide-content').innerHTML=`<div><h2 class="slide-title">${slide.title}</h2><p class="slide-copy">${slide.body}</p>${slide.html}</div>`;
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
 $('caption').textContent=player.state==='ready'?'Ready when you are. Start the scripted preview below.':player.state==='activity'?(answerSubmitted?'Answer submitted. Waiting for the class.':'Your turn. Submit your answer in the chat.'):segment.text;
 const statuses={ready:'Ready to start',playing:voiceEnabled?'Presenting':'Presenting · silent',paused:'Paused',activity:'Activity break',discussion:'Class discussion',completed:'Lecture complete'};
 $('status').textContent=statuses[player.state];
 const waiting=player.state==='activity';
 document.querySelector('.stage').classList.toggle('waiting',waiting);
 $('waiting-state').hidden=!waiting;
 updateTimer();
 $('chat-waiting').hidden=!waiting;
 if(waiting&&!activityPosted){
  activityPosted=true;answerSubmitted=false;
  appendMessage('AI LECTURER',segment.question,'Answer in the next 30 seconds.','lecturer-message');
  document.body.classList.remove('chat-collapsed');$('toggle-chat').textContent='Hide chat';$('toggle-chat').setAttribute('aria-expanded','true');
 }
 if(!waiting){activityPosted=false;answerSubmitted=false;}
 $('play').textContent=player.state==='playing'?'Pause':player.state==='ready'?'Start lecture':player.state==='completed'?'Completed':player.state==='activity'?'Waiting for your answer':'Resume';
 $('play').disabled=['activity','discussion','completed'].includes(player.state);
 $('prev').disabled=current===0; $('next').disabled=current===lecture.slides.length-1;
 $('elapsed').textContent=`${formatTime(player.elapsed)} / ${formatTime(player.duration)}`;
 $('timeline').value=player.elapsed; $('timeline').max=player.duration;
 $('runtime-state').textContent=player.state==='activity'?'Waiting for an answer · countdown on slide':player.state==='completed'?'Complete · replay anytime':voiceEnabled?'Scripted lecture · audio synchronized':'Scripted preview · silent';
 updateComposer();
 renderDiscussion();
}
let lastTime=performance.now();
function resetClock(){lastTime=performance.now();}
function frame(now){
 const before=player.index, state=player.state;
 if(!document.hidden&&!$('classroom-view').hidden){
  if(player.state==='discussion'){discussion.tick((now-lastTime)/1000);stepDiscussion((now-lastTime)/1000);}
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
$('restart').onclick=()=>{discussionEpoch++;discussionRequest?.abort();discussion.reset();handEvents.length=0;raised=false;$('hand').setAttribute('aria-pressed','false');$('hand').setAttribute('aria-label','Raise hand');$('hand').title='Raise hand';feedbackSegment=null;feedbackOffset=0;feedbackItem=null;messageNodes.clear();questionCount=0;$('question-count').textContent='0';$('question-list').replaceChildren();stopSpeech();viewedSlide=null;player.restart();resetClock();sync();};
function browseSlide(index){
 if(index<0||index>=lecture.slides.length)return;
 if(['activity','discussion'].includes(player.state))viewedSlide=lecture.slides[index].id;
 else {stopSpeech();viewedSlide=null;player.seekSlide(lecture.slides[index].id);}
 sync();
}
$('prev').onclick=()=>browseSlide(current-1);
$('next').onclick=()=>browseSlide(current+1);
document.addEventListener('visibilitychange',()=>{if(document.hidden){player.pause();stopSpeech();sync();}resetClock();});
$('captions').onclick=()=>{captions=!captions;$('captions').setAttribute('aria-pressed',captions);$('captions').querySelector('span').textContent=`Captions ${captions?'on':'off'}`;$('caption').hidden=!captions;};
function acknowledgeHand(){
 if(!raised||!discussion.raiseHand())return;
 appendMessage('AI LECTURER','Omar, I see your hand. Please type your question in the chat.','Your question window is open.','lecturer-message');
 $('hand-status').textContent='Omar, you have the floor. Type and submit your question.';
 $('question').focus();
}
$('hand').onclick=()=>{
 raised=!raised;if(raised)handEvents.push({segment:player.index,fraction:player.offset/player.segment.duration});$('hand').setAttribute('aria-pressed',raised);
 $('hand').querySelector('span').textContent=raised?'Lower hand':'Raise hand';
 $('hand').setAttribute('aria-label',raised?'Lower hand':'Raise hand');$('hand').title=raised?'Lower hand':'Raise hand';renderCheckpoints();
 $('hand-status').textContent=raised?'Hand raised. You’ll be invited to ask at the next available discussion turn.':'';
 if(raised&&!(player.state==='discussion'&&discussion.state==='followup')){
  const timing=player.state==='discussion'?'after this response, during this checkpoint':player.state==='completed'?'when you restart the lecture':'during the next checkpoint';
  appendMessage('AI LECTURER',`Omar, I see you raised your hand. I’ll respond to you ${timing}.`,'Hand acknowledged','lecturer-message');
 }
 acknowledgeHand();
};
function appendMessage(author,value,status,className=''){
 if(questionCount===0)$('question-list').replaceChildren();
 const item=document.createElement('article');item.className='question-item '+className;
 const label=document.createElement('small');label.textContent=author==='AI LECTURER'?'Lecturer':author==='YOU'?'Omar':author;
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
 $('question').placeholder=submitted?'Ask a follow-up question…':waiting?'Type your answer…':'Ask a question…';
 $('message-label').textContent=submitted?'Your message':waiting?'Your answer':'Your message';
 $('question').disabled=false;
 const button=$('question-form').querySelector('button[type=submit]');
 button.disabled=false;button.textContent='↑';
 $('chat-waiting').querySelector('strong').textContent=submitted?'Waiting for other students':'Waiting for your answer';
 $('chat-waiting').querySelector('small').textContent=submitted?'The explanation resumes when time runs out':'Submit before the explanation resumes';
 $('waiting-label').textContent=submitted?'Waiting for the class':'Waiting for your answer';
 if(submitted){$('status').textContent='Waiting for the class';$('play').textContent='Waiting for the class';$('runtime-state').textContent='Answer submitted · waiting for the class';}
}
$('question-form').onsubmit=e=>{
 e.preventDefault();const value=$('question').value.trim();
 if(!value){$('question').setCustomValidity('Please write a message.');$('question').reportValidity();return;}
 const isAnswer=player.state==='activity'&&!answerSubmitted;
 const message=discussion.add(value,isAnswer?'answer':'question');
 const node=appendMessage('YOU',value,isAnswer?'Answer submitted · awaiting checkpoint':`Queued for checkpoint · slide ${current+1}`);messageNodes.set(message.id,node);
 $('question').value='';discussion.typing(false);
 if(raised){raised=false;$('hand').setAttribute('aria-pressed','false');$('hand').querySelector('span').textContent='Raise hand';$('hand-status').textContent='Question received. It will be addressed in the next response.';}
 if(isAnswer){answerSubmitted=true;player.completeAnswers();viewedSlide=null;sync();}
 renderDiscussion();
};
$('question').oninput=()=>{$('question').setCustomValidity('');discussion.typing(!!$('question').value.trim());};
sync();

function showLibrary(){player.pause();stopSpeech();sync();document.body.classList.remove('focus-mode','chat-collapsed');$('toggle-chat').hidden=true;$('toggle-chat').textContent='Hide chat';$('toggle-chat').setAttribute('aria-expanded','true');$('focus').setAttribute('aria-pressed','false');$('focus').querySelector('span').textContent='Focus mode';$('library').hidden=false;$('classroom-view').hidden=true;$('library-nav').setAttribute('aria-current','page');window.scrollTo(0,0);}
$('open-lecture').onclick=()=>{$('library').hidden=true;$('classroom-view').hidden=false;$('library-nav').removeAttribute('aria-current');window.scrollTo(0,0);presenter.init().then(()=>{presenter.idle();presenter.mute(muted);}).catch(()=>{});};
$('library-nav').onclick=showLibrary;$('back-library').onclick=showLibrary;
function setFocus(value){document.body.classList.toggle('focus-mode',value);document.body.classList.remove('chat-collapsed');$('toggle-chat').hidden=!value;$('toggle-chat').textContent='Hide chat';$('toggle-chat').setAttribute('aria-expanded','true');$('focus').setAttribute('aria-pressed',String(value));$('focus').querySelector('span').textContent=value?'Exit focus mode':'Focus mode';window.scrollTo(0,0);}
$('focus').onclick=()=>setFocus(!document.body.classList.contains('focus-mode'));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('focus-mode')){setFocus(false);$('focus').focus();}});

$('toggle-chat').onclick=()=>{const collapsed=document.body.classList.toggle('chat-collapsed');$('toggle-chat').textContent=collapsed?'Show chat':'Hide chat';$('toggle-chat').setAttribute('aria-expanded',String(!collapsed));};

$('voice-enabled').onchange=()=>{if(player.state==='discussion')return;stopSpeech();voiceEnabled=$('voice-enabled').checked;player.pause();$('voice-error').hidden=true;sync();};
$('mute').onclick=()=>{muted=!muted;presenter.mute(muted);$('mute').setAttribute('aria-pressed',String(muted));$('mute').textContent=muted?'Unmute':'Mute';};

// Named exports support integration checks without adding globals.
export { player, presenter, discussion };

function renderDiscussion(){
 const active=player.state==='discussion';
 if(active)acknowledgeHand();
 renderCheckpoints();
 $('voice-enabled').disabled=active;
 $('checkpoint-panel').hidden=!active;
 const awaitingFollowup=active&&discussion.state==='followup';
 $('followup-waiting').hidden=!awaitingFollowup;
 if(awaitingFollowup){
 $('followup-timer').hidden=discussion.typingRemaining>0;
 $('followup-timer').textContent=formatTime(Math.ceil(Math.min(discussion.idle,discussion.remaining)));
 $('followup-waiting').querySelector('strong').textContent=discussion.typingRemaining>0?'Waiting for student question…':'Omar, any follow-up questions?';
 $('followup-waiting').querySelector('small').textContent=discussion.typingRemaining>0?'Take your time typing. Submit when ready.':discussion.final?'Q&A closes when this timer ends.':'The lecture continues when this timer ends.';
 }
 for(const message of discussion.messages){const node=messageNodes.get(message.id);if(node)node.textContent=({queued:'Queued for checkpoint',selected:'Included in current response',addressed:'Addressed',deferred:'Deferred: '+(message.reason||'For later')})[message.status];}
 if(!active)return;
 const labels={reviewing:'Reviewing class messages',speaking:'Addressing the class',followup:'Any follow-up questions?',closed:'Returning to the lecture'};
 $('checkpoint-title').textContent=labels[discussion.state]||'Class discussion';
 $('checkpoint-time').textContent=discussion.typingRemaining>0&&discussion.state==='followup'?'Typing…':discussion.final&&discussion.state!=='followup'?'Final Q&A':formatTime(Math.ceil(discussion.state==='followup'?Math.min(discussion.idle,discussion.remaining):discussion.remaining));
 $('checkpoint-detail').textContent=discussion.state==='followup'?discussion.final?'Final Q&A · ask about anything in this lecture':`Follow-up window · ${formatTime(Math.ceil(discussion.remaining))} discussion time left`:'New questions stay queued until this response finishes.';
 $('status').textContent=labels[discussion.state]||'Class discussion';
 $('play').textContent='Checkpoint discussion';$('runtime-state').textContent=discussion.final?'Final Q&A · lecture ends after discussion':'Lecture resumes automatically after discussion';
 $('caption').textContent=discussion.state==='speaking'&&feedbackSegment?(!voiceEnabled||feedbackReady?feedbackSegment.text:'Thinking…'):discussion.state==='reviewing'?'Thinking…':'You can ask a follow-up question before we continue.';
 $('question').disabled=false;$('question').placeholder='Ask a follow-up question…';$('message-label').textContent='Your follow-up';
 const button=$('question-form').querySelector('button[type=submit]');button.disabled=false;button.textContent='↑';
}
function finishDiscussion(){
 discussionRequest?.abort();discussionRequest=null;discussionEpoch++;
 stopSpeech();feedbackSegment=null;feedbackOffset=0;feedbackItem=null;viewedSlide=null;
 appendMessage('AI LECTURER',player.segment.finalCheckpoint?'Thank you, Omar. That concludes our lecture and Q&A.':'Let’s continue with the lesson.','Discussion closed; deferred messages remain visible.','lecturer-message');
 player.continue();resetClock();sync();startSpeech();
}
function stepDiscussion(dt){
 if(discussion.state==='closed'){finishDiscussion();return;}
 if(discussion.state==='followup'&&discussion.pending.length){requestFeedback();return;}
 if(discussion.state==='speaking'){
  if(voiceEnabled&&discussion.remaining===0&&!presenter.active){stopSpeech();discussion.close('Speech preparation exceeded discussion time');return;}
  if(voiceEnabled){if(!feedbackStarted)startFeedback();}
  else {feedbackOffset+=dt;if(feedbackOffset>=Math.max(5,feedbackSegment.text.split(/\s+/).length/2.5))finishFeedback();}
 }
}
async function requestFeedback(){
 const batch=discussion.select();if(!batch)return;
 const epoch=discussionEpoch;discussionRequest=new AbortController();renderDiscussion();
 try{
  const response=await fetch('/api/discuss',{method:'POST',headers:{'Content-Type':'application/json'},signal:discussionRequest.signal,body:JSON.stringify({messages:batch.map(({id,text,kind})=>({id,text,kind})),history:discussion.history,checkpointId:player.segment.id,publishedId})});
  const result=await response.json();if(!response.ok)throw new Error(result.error||'Feedback unavailable');
  if(epoch!==discussionEpoch||discussion.state!=='reviewing')return;
  if(discussion.remaining<result.text.split(/\s+/).length/2.5+8){discussion.close('Not enough time to deliver feedback');return;}
  discussion.accept(result);feedbackSegment={id:result.segmentId,text:result.text};feedbackOffset=0;feedbackStarted=false;feedbackReady=false;
  feedbackItem=appendMessage('AI LECTURER',voiceEnabled?'Thinking…':result.text,voiceEnabled?'Preparing spoken feedback · '+result.model:'Read the feedback · '+result.model,'lecturer-message');
  renderDiscussion();
 }catch(error){
  if(epoch!==discussionEpoch||discussion.state!=='reviewing')return;
  discussion.fail('Feedback unavailable; retained for later');
  appendMessage('SYSTEM','Feedback could not be generated. Your messages are retained for later.','Continuing after the follow-up window.');
  renderDiscussion();
 }
}
function startFeedback(){
 if(!feedbackSegment||feedbackStarted)return;feedbackStarted=true;
 const epoch=discussionEpoch;
 presenter.play(feedbackSegment,feedbackOffset,{
  onReady:()=>{if(epoch!==discussionEpoch)return;feedbackReady=true;if(feedbackItem){feedbackItem.textContent='Speaking feedback';feedbackItem.parentElement.querySelector('p').textContent=feedbackSegment.text;}renderDiscussion();},
  onEnd:()=>{if(epoch===discussionEpoch&&player.state==='discussion')finishFeedback();},
  onError:()=>{if(epoch!==discussionEpoch)return;feedbackStarted=false;discussion.fail('Feedback speech failed');if(feedbackItem)feedbackItem.textContent='Speech failed · messages deferred';feedbackSegment=null;renderDiscussion();}
 });
}
function finishFeedback(){
 discussion.delivered(feedbackSegment.text);feedbackStarted=false;feedbackOffset=0;feedbackSegment=null;
 if(feedbackItem)feedbackItem.textContent='Feedback delivered';feedbackItem=null;renderDiscussion();
}

function renderCheckpoints(){
 const hands=$('timeline-hands');hands.replaceChildren();
 handEvents.forEach(event=>{
 const position=player.segments.slice(0,event.segment).reduce((sum,s)=>sum+s.duration,0)+player.segments[event.segment].duration*event.fraction;
 const pin=document.createElement('span');pin.className='hand-marker';pin.textContent='O';pin.style.left=Math.min(98,Math.max(2,position/player.duration*100))+'%';
 pin.title='Omar raised a hand';pin.setAttribute('aria-label','Omar raised a hand');hands.append(pin);
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
  marker.style.left=(elapsed/player.duration*100)+'%';
  const label=segment.finalCheckpoint?'Final Q&A':'Q&A';
  marker.textContent=active?`◆ ${label} · now`:passed?`✓ ${label}`:`◆ ${label}`;
  marker.title=segment.finalCheckpoint?'Final open Q&A for all remaining questions':'Discussion checkpoint after the practice question';
  if(segment.finalCheckpoint)marker.style.transform='translateX(-100%)';
  container.append(marker);
 });
}

fetch('/api/published').then(r=>r.json()).then(({lectures})=>{for(const lecture of lectures){const row=document.createElement('article');row.className='lecture-row';const body=document.createElement('div'),tag=document.createElement('span'),title=document.createElement('h3'),detail=document.createElement('p'),link=document.createElement('a');tag.className='lecture-tag';tag.textContent='PUBLISHED LECTURE';title.textContent=lecture.title;detail.textContent=lecture.duration+' minutes · Slides, voice and AI annotations';link.className='primary';link.textContent='Open lecture ↗';link.href='/?published='+encodeURIComponent(lecture.id);body.append(tag,title,detail);row.append(body,link);$('published-lectures').append(row);}}).catch(()=>{$('published-lectures').textContent='Published lectures could not be loaded. Refresh to retry.';});

if(publishedId){
 document.body.classList.add('authored-classroom');document.querySelector('.lecture-heading h1').textContent=lecture.title;document.querySelector('.lecture-heading .eyebrow').textContent='YOUR CLASSROOM';document.querySelector('.lecture-heading p').textContent='Slides, narration and discussion';document.querySelector('.stage-bottom span').textContent=lecture.title;document.querySelector('.prototype').textContent='Student classroom';document.querySelector('.top-nav a').hidden=true;
 $('open-lecture').click();
}
function drawClassroomAnnotations(){
 const svg=$('classroom-annotations'),img=$('classroom-slide-image');if(svg&&img){svg.replaceChildren();const segment=player.segment;if(player.state==='playing'&&segment.slide===lecture.slides[current]?.id&&presenter.position!==null){const b=imageBounds(img.clientWidth,img.clientHeight,img.naturalWidth||16,img.naturalHeight||9);for(const a of segment.annotations||[]){if(!annotationActive(a,presenter.position))continue;const n=document.createElementNS('http://www.w3.org/2000/svg',a.style==='circle'?'ellipse':a.style==='underline'?'line':'rect'),x=b.x+a.x*b.width,y=b.y+a.y*b.height,w=a.w*b.width,h=a.h*b.height,attrs=a.style==='circle'?{cx:x+w/2,cy:y+h/2,rx:w/2,ry:h/2}:a.style==='underline'?{x1:x,y1:y+h,x2:x+w,y2:y+h}:{x,y,width:w,height:h};for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);n.setAttribute('stroke','#ffbd17');n.setAttribute('stroke-width','3');n.setAttribute('fill',a.style==='highlight'?'#ffd82d40':'none');svg.append(n);}}}requestAnimationFrame(drawClassroomAnnotations);
}drawClassroomAnnotations();
