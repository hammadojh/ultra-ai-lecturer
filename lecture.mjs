// Approved sample content. All times are provisional until audio is connected.
export const lecture = {
  id: 'functions-01', version: 1,
  discussion: {budgetSeconds:90,idleSeconds:12,reserveSeconds:20},
  slides: [
    {id:'goals', chapter:'01 / YOUR LEARNING GOALS', title:'By the end, you can…', body:'Three ideas to take with you.', html:'<div class="outcomes"><div id="goal-input"><span>01</span><p>Identify an input and its output.</p></div><div id="goal-rule"><span>02</span><p>Explain the rule connecting them.</p></div><div id="goal-predict"><span>03</span><p>Predict what happens with a new input.</p></div></div>'},
    {id:'relationship', chapter:'02 / THE BIG IDEA', title:'A function is a relationship.', body:'Give it an input. Follow a rule. Get an output.', html:'<div class="diagram"><div class="node" id="input"><small>INPUT</small>3</div><span class="arrow">→</span><div class="node function" id="rule"><small>RULE</small>× 2</div><span class="arrow">→</span><div class="node" id="output"><small>OUTPUT</small>6</div></div>'},
    {id:'practice', chapter:'03 / A MOMENT TO THINK', title:'Same rule. New input.', body:'Our function doubles its input.', html:'<div id="practice-prompt" class="slide-question">If the input is 7, what comes out?</div><div id="activity" hidden><p class="activity-instruction">Submit your answer in the chat. We’ll wait for the class before continuing.</p></div><p id="explanation" class="answer" hidden>14. The rule multiplies the input by two: 7 × 2 = 14.</p>'}
  ],
  segments: [
    {id:'goals-intro',slide:'goals',duration:4,text:'Let’s begin with three things you’ll be able to do.'},
    {id:'goals-input',slide:'goals',duration:4,text:'First, identify an input and its output.',highlight:'goal-input'},
    {id:'goals-rule',slide:'goals',duration:4,text:'Then, explain the rule that connects them.',highlight:'goal-rule'},
    {id:'goals-predict',slide:'goals',duration:4,text:'Finally, use that rule to predict a new output.',highlight:'goal-predict'},
    {id:'input',slide:'relationship',duration:5,text:'A function takes an input. Here, we start with three.',highlight:'input'},
    {id:'rule',slide:'relationship',duration:5,text:'Our rule multiplies the input by two.',highlight:'rule'},
    {id:'output',slide:'relationship',duration:5,text:'Three times two gives us six. That is our output.',highlight:'output'},
    {id:'question',slide:'practice',duration:5,text:'Now try it. If the input is seven, what comes out?',highlight:'practice-prompt',holdAfter:true,answerSeconds:30,question:"If the input is 7 and the rule doubles it, what is the output?"},
    {id:'answer',slide:'practice',duration:6,text:'The output is fourteen. Seven times two equals fourteen.',reveal:'explanation'},
    {id:'recap',slide:'practice',duration:5,text:'You identified the input, applied the rule, and predicted the output.',reveal:'explanation'}
  ]
};
