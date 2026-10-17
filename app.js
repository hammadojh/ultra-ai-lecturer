const $ = id => document.getElementById(id);
let current = -1, captions = true, raised = false, questionCount = 0;
const slides = [
 {chapter:'01 / THE BIG IDEA',title:'A function is a relationship.',body:'Give it an input. Follow a rule. Get an output. The same idea appears in mathematics, code, and everyday life.',extra:'<div class="diagram"><div class="node"><small>INPUT</small>3</div><span class="arrow">→</span><div class="node function"><small>RULE</small>× 2</div><span class="arrow">→</span><div class="node"><small>OUTPUT</small>6</div></div>',caption:'Start with three. Our rule doubles the input, so the output is six.'},
 {chapter:'02 / YOUR LEARNING GOALS',title:'By the end, you can…',body:'Three ideas to take with you.',extra:'<div class="outcomes"><div><span>01</span><p>Identify an input and its output.</p></div><div><span>02</span><p>Explain the rule connecting them.</p></div><div><span>03</span><p>Predict what happens with a new input.</p></div></div>',caption:'We will identify the input, explain the rule, and use it to predict a new output.'},
 {chapter:'03 / A MOMENT TO THINK',title:'Same rule. New input.',body:'Our function doubles its input. Take a moment before revealing the answer.',extra:'<div class="slide-question">If the input is 7, what comes out?</div><button class="answer-button" id="reveal">Reveal explanation</button><p id="answer" class="answer" hidden>14. The rule multiplies the input by two: 7 × 2 = 14.</p>',caption:'If we put seven into the same function, what output would you expect?'}
];
function render(){
 $('prev').disabled=current<=0;$('next').disabled=current<0||current===slides.length-1;
 if(current<0){$('slide-content').innerHTML='<div class="small-label">YOUR NEXT CHAPTER STARTS HERE</div><h2 class="slide-title">Make yourself<br>curious.</h2><p class="slide-copy">Your classroom is ready. Explore a short sample lesson and imagine how learning could feel.</p><div class="waiting-line"><button id="join" class="primary">Enter classroom preview <span>↗</span></button><small>3 slides · No audio yet</small></div>';$('join').onclick=()=>{current=0;render();};return;}
 const s=slides[current];$('chapter').textContent=s.chapter;$('status').textContent='Classroom preview';$('slide-number').textContent=`${String(current+1).padStart(2,'0')} / 03`;$('progress').textContent=`${current+1} of 3`;$('caption').textContent=s.caption;
 $('slide-content').innerHTML=`<div class="slide-enter"><h2 class="slide-title">${s.title}</h2><p class="slide-copy">${s.body}</p>${s.extra}</div>`;
 if($('reveal'))$('reveal').onclick=()=>{$('answer').hidden=false;$('reveal').hidden=true;};
}
$('prev').onclick=()=>{if(current>0){current--;render();}};$('next').onclick=()=>{if(current>=0&&current<2){current++;render();}};
$('captions').onclick=()=>{captions=!captions;$('captions').setAttribute('aria-pressed',captions);$('captions').querySelector('span').textContent=`Captions ${captions?'on':'off'}`;$('caption').hidden=!captions;};
$('hand').onclick=()=>{raised=!raised;$('hand').setAttribute('aria-pressed',raised);$('hand').querySelector('span').textContent=raised?'Lower hand':'Raise hand';$('hand-status').textContent=raised?'Your hand is raised in this preview.':'';};
$('question-form').onsubmit=e=>{e.preventDefault();const value=$('question').value.trim();if(!value){$('question').setCustomValidity('Please write a question.');$('question').reportValidity();return;}if(questionCount===0)$('question-list').replaceChildren();const item=document.createElement('article');item.className='question-item';const label=document.createElement('small');label.textContent='YOU';const state=document.createElement('span');state.className='queued';state.textContent='Queued · preview';const text=document.createElement('p');text.textContent=value;const context=document.createElement('small');context.textContent=current<0?'Before the lecture':`Slide ${current+1} · ${slides[current].chapter.split(' / ')[1]}`;item.append(label,state,text,context);$('question-list').append(item);$('question-count').textContent=++questionCount;$('question').value='';item.scrollIntoView({block:'nearest'});};
$('question').oninput=()=>$('question').setCustomValidity('');
render();

function showLibrary(){document.body.classList.remove('focus-mode','chat-collapsed');$('toggle-chat').hidden=true;$('toggle-chat').textContent='Hide chat';$('toggle-chat').setAttribute('aria-expanded','true');$('focus').setAttribute('aria-pressed','false');$('focus').querySelector('span').textContent='Focus mode';$('library').hidden=false;$('classroom-view').hidden=true;$('library-nav').setAttribute('aria-current','page');window.scrollTo(0,0);}
$('open-lecture').onclick=()=>{$('library').hidden=true;$('classroom-view').hidden=false;$('library-nav').removeAttribute('aria-current');window.scrollTo(0,0);};
$('library-nav').onclick=showLibrary;$('back-library').onclick=showLibrary;
function setFocus(value){document.body.classList.toggle('focus-mode',value);document.body.classList.remove('chat-collapsed');$('toggle-chat').hidden=!value;$('toggle-chat').textContent='Hide chat';$('toggle-chat').setAttribute('aria-expanded','true');$('focus').setAttribute('aria-pressed',String(value));$('focus').querySelector('span').textContent=value?'Exit focus mode':'Focus mode';window.scrollTo(0,0);}
$('focus').onclick=()=>setFocus(!document.body.classList.contains('focus-mode'));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('focus-mode')){setFocus(false);$('focus').focus();}});

$('toggle-chat').onclick=()=>{const collapsed=document.body.classList.toggle('chat-collapsed');$('toggle-chat').textContent=collapsed?'Show chat':'Hide chat';$('toggle-chat').setAttribute('aria-expanded',String(!collapsed));};
