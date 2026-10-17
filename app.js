import { lecture } from './lecture.mjs';
import { LecturePlayer } from './player.mjs';
const $ = id => document.getElementById(id);
const player = new LecturePlayer(lecture.segments);
let current = 0, captions = true, raised = false, questionCount = 0;
let drawnSlide = null;
const formatTime = seconds => `${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;
function sync(){
 const segment=player.segment;
 current=lecture.slides.findIndex(s=>s.id===segment.slide);
 const slide=lecture.slides[current];
 if(drawnSlide!==slide.id){
  $('slide-content').innerHTML=`<div><h2 class="slide-title">${slide.title}</h2><p class="slide-copy">${slide.body}</p>${slide.html}</div>`;
  drawnSlide=slide.id;
  if($('continue-lecture')) $('continue-lecture').onclick=()=>{player.continue();resetClock();sync();};
 }
 document.querySelectorAll('.cue-active').forEach(el=>el.classList.remove('cue-active'));
 if(segment.highlight && $(segment.highlight)) $(segment.highlight).classList.add('cue-active');
 if($('activity')) $('activity').hidden=player.state!=='activity';
 if($('explanation')) $('explanation').hidden=segment.reveal!=='explanation';
 $('chapter').textContent=slide.chapter;
 $('slide-number').textContent=`${String(current+1).padStart(2,'0')} / 03`;
 $('progress').textContent=`${current+1} of 3`;
 $('caption').textContent=player.state==='ready'?'Ready when you are. Start the scripted preview below.':player.state==='activity'?'Take your time. The lecture is waiting for you.':segment.text;
 const statuses={ready:'Ready to start',playing:'Presenting · no audio',paused:'Paused',activity:'Activity break',completed:'Lecture complete'};
 $('status').textContent=statuses[player.state];
 $('play').textContent=player.state==='playing'?'Pause':player.state==='ready'?'Start lecture':player.state==='completed'?'Completed':player.state==='activity'?'Waiting for your answer':'Resume';
 $('play').disabled=['activity','completed'].includes(player.state);
 $('prev').disabled=current===0; $('next').disabled=current===lecture.slides.length-1;
 $('elapsed').textContent=`${formatTime(player.elapsed)} / ${formatTime(player.duration)}`;
 $('timeline').value=player.elapsed; $('timeline').max=player.duration;
 $('runtime-state').textContent=player.state==='activity'?'Activity · continue on the slide':player.state==='completed'?'Complete · replay anytime':'Scripted preview · voice connects in Part 3';
}
let lastTime=performance.now();
function resetClock(){lastTime=performance.now();}
function frame(now){
 const before=player.index, state=player.state;
 player.tick((now-lastTime)/1000);lastTime=now;
 if(before!==player.index||state!==player.state)sync();
 else if(player.state==='playing'){
  $('elapsed').textContent=`${formatTime(player.elapsed)} / ${formatTime(player.duration)}`;
  $('timeline').value=player.elapsed;
 }
 requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
$('play').onclick=()=>{if(player.state==='playing')player.pause();else player.play();resetClock();sync();};
$('restart').onclick=()=>{player.restart();resetClock();sync();};
$('prev').onclick=()=>{if(current>0){player.seekSlide(lecture.slides[current-1].id);sync();}};
$('next').onclick=()=>{if(current<lecture.slides.length-1){player.seekSlide(lecture.slides[current+1].id);sync();}};
document.addEventListener('visibilitychange',()=>{if(document.hidden){player.pause();sync();}resetClock();});
$('captions').onclick=()=>{captions=!captions;$('captions').setAttribute('aria-pressed',captions);$('captions').querySelector('span').textContent=`Captions ${captions?'on':'off'}`;$('caption').hidden=!captions;};
$('hand').onclick=()=>{raised=!raised;$('hand').setAttribute('aria-pressed',raised);$('hand').querySelector('span').textContent=raised?'Lower hand':'Raise hand';$('hand-status').textContent=raised?'Your hand is raised in this preview.':'';};
$('question-form').onsubmit=e=>{e.preventDefault();const value=$('question').value.trim();if(!value){$('question').setCustomValidity('Please write a question.');$('question').reportValidity();return;}if(questionCount===0)$('question-list').replaceChildren();const item=document.createElement('article');item.className='question-item';const label=document.createElement('small');label.textContent='YOU';const state=document.createElement('span');state.className='queued';state.textContent='Queued · preview';const text=document.createElement('p');text.textContent=value;const context=document.createElement('small');context.textContent=`Slide ${current+1} · ${lecture.slides[current].chapter.split(' / ')[1]}`;item.append(label,state,text,context);$('question-list').append(item);$('question-count').textContent=++questionCount;$('question').value='';item.scrollIntoView({block:'nearest'});};
$('question').oninput=()=>$('question').setCustomValidity('');
sync();

function showLibrary(){player.pause();sync();document.body.classList.remove('focus-mode','chat-collapsed');$('toggle-chat').hidden=true;$('toggle-chat').textContent='Hide chat';$('toggle-chat').setAttribute('aria-expanded','true');$('focus').setAttribute('aria-pressed','false');$('focus').querySelector('span').textContent='Focus mode';$('library').hidden=false;$('classroom-view').hidden=true;$('library-nav').setAttribute('aria-current','page');window.scrollTo(0,0);}
$('open-lecture').onclick=()=>{$('library').hidden=true;$('classroom-view').hidden=false;$('library-nav').removeAttribute('aria-current');window.scrollTo(0,0);};
$('library-nav').onclick=showLibrary;$('back-library').onclick=showLibrary;
function setFocus(value){document.body.classList.toggle('focus-mode',value);document.body.classList.remove('chat-collapsed');$('toggle-chat').hidden=!value;$('toggle-chat').textContent='Hide chat';$('toggle-chat').setAttribute('aria-expanded','true');$('focus').setAttribute('aria-pressed',String(value));$('focus').querySelector('span').textContent=value?'Exit focus mode':'Focus mode';window.scrollTo(0,0);}
$('focus').onclick=()=>setFocus(!document.body.classList.contains('focus-mode'));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('focus-mode')){setFocus(false);$('focus').focus();}});

$('toggle-chat').onclick=()=>{const collapsed=document.body.classList.toggle('chat-collapsed');$('toggle-chat').textContent=collapsed?'Show chat':'Hide chat';$('toggle-chat').setAttribute('aria-expanded',String(!collapsed));};
