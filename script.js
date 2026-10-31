const $=id=>document.getElementById(id);

const uid=p=>p+(window.crypto&&crypto.randomUUID?crypto.randomUUID().slice(0,12):Date.now().toString(36)+Math.random().toString(36).slice(2,8));

let tasks=[],filter='all',openId=null,log=[],query='',sortBy='manual',
newPrio='',busy=false,swiped=false,undo=null,undoT=0,lateSig='',
justId='',enterId='',newCat='',cats=[],ccOpen='',catsFrom=null;

let focusId=null;
let audioCtx=null;

const IC={
  check:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  flag:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 21V4M6 4h11l-2.2 4 2.2 4H6"/></svg>',
  focus:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.2"/></svg>',
  trash:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>',
  grip:'<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="currentColor" stroke="none"><circle cx="9" cy="6" r="1.7"/><circle cx="15" cy="6" r="1.7"/><circle cx="9" cy="12" r="1.7"/><circle cx="15" cy="12" r="1.7"/><circle cx="9" cy="18" r="1.7"/><circle cx="15" cy="18" r="1.7"/></g></svg>'
};

const ensureAudio=()=>{
  if(!audioCtx){
    try{audioCtx=new (window.AudioContext||window.webkitAudioContext)()}catch(e){}
  }
  if(audioCtx&&audioCtx.state==='suspended')audioCtx.resume().catch(()=>{});
  return audioCtx;
};

const playTone=(freq,dur=0.12,type='sine',vol=0.18,delay=0)=>{
  const ctx=ensureAudio();
  if(!ctx)return;
  const o=ctx.createOscillator();
  const g=ctx.createGain();
  o.type=type;
  o.frequency.value=freq;
  g.gain.setValueAtTime(0.0001,ctx.currentTime+delay);
  g.gain.exponentialRampToValueAtTime(vol,ctx.currentTime+delay+0.02);
  g.gain.exponentialRampToValueAtTime(0.0001,ctx.currentTime+delay+dur);
  o.connect(g);g.connect(ctx.destination);
  o.start(ctx.currentTime+delay);
  o.stop(ctx.currentTime+delay+dur+0.05);
};

const sfx={
  complete:()=>{playTone(523,0.1,'triangle',0.14);playTone(659,0.12,'triangle',0.12,0.08)},
  add:()=>{playTone(440,0.08,'sine',0.1);playTone(554,0.1,'sine',0.08,0.06)},
  delete:()=>{playTone(220,0.12,'sawtooth',0.06)},
  pomo:()=>{playTone(660,0.1,'sine',0.12);playTone(880,0.18,'sine',0.14,0.1)}
};

const CELEBRATIONS=[
  'Nice.',
  'Out of the way.',
  'One less thing.',
  'Done.',
  'That felt good.',
  'Cleared.',
  'Moving on.',
  'Good.'
];

const FUN_QUOTES=[
  "Small progress is still progress!",
  "You're capable of amazing things today!",
  "Let's turn goals into accomplishments!",
  "Focus on being productive, not busy.",
  "One task at a time, you've got this!",
  "Make today so awesome yesterday gets jealous!",
  "Your future self is already thanking you!",
  "Progress over perfection—always!",
  "Tiny steps still move mountains!",
  "Today is a great day to get things done!"
];

let pomo={
  total:25*60,
  left:25*60,
  running:false,
  timer:null,
  endsAt:0,
  mode:25,
  label:'Focus',
  sessions:0,
  focusMin:0,
  tSess:0,
  tMin:0,
  day:''
};

const loadPomoStats=()=>{
  try{
    const s=localStorage.getItem('my-tasks-pomo');
    if(!s)return;
    const d=JSON.parse(s);
    if(d.day===dkey(new Date())){
      pomo.sessions=d.sessions||0;
      pomo.focusMin=d.focusMin||0;
    }
  }catch(e){}
  pomo.day=dkey(new Date());
};

const POMO_RUN='my-tasks-pomo-run';

const savePomoRun=()=>{
  try{
    localStorage.setItem(POMO_RUN,JSON.stringify({
      mode:pomo.mode,label:pomo.label,total:pomo.total,
      left:pomo.left,running:pomo.running,endsAt:pomo.endsAt
    }));
  }catch(e){}
};

const pomoDayCheck=()=>{
  const k=dkey(new Date());
  if(pomo.day!==k){
    pomo.day=k;
    pomo.sessions=0;
    pomo.focusMin=0;
    savePomoStats();
  }
};

const savePomoStats=()=>{
  try{
    localStorage.setItem('my-tasks-pomo',JSON.stringify({
      day:dkey(new Date()),
      sessions:pomo.sessions,
      focusMin:pomo.focusMin
    }));
  }catch(e){
    warnSave();
  }
};

const fmtPomo=s=>{
  s=Math.max(0,Math.ceil(s));
  const m=Math.floor(s/60),sec=s%60;
  return m+':'+String(sec).padStart(2,'0');
};

const finishPomo=()=>{
  const wasFocus=pomo.label!=='Break'&&pomo.label!=='Long break';
  const mins=pomo.mode;
  pomoDayCheck();
  stopPomo();
  pomo.left=0;
  savePomoRun();
  if(wasFocus){
    pomo.sessions++;
    pomo.focusMin+=mins;
    pomo.tSess++;
    pomo.tMin+=mins;
    savePomoStats();
    savePomoTotals();
    checkAch();
  }
  sfx.pomo();
  const msg=wasFocus?'Focus session done. Take a break.':'Break over. Back to it when ready.';
  toast(msg);
  try{
    if(document.hidden&&'Notification' in window&&Notification.permission==='granted'){
      new Notification('My Tasks',{body:msg});
    }
  }catch(e){}
  updatePomoUI();
};

const updatePomoUI=()=>{
  if($('pomoTime'))$('pomoTime').textContent=fmtPomo(pomo.left);
  if($('pomoLabel'))$('pomoLabel').textContent=pomo.label;
  if($('pomoStart')){
    $('pomoStart').textContent=pomo.running?'Pause':'Start';
    $('pomoStart').classList.toggle('primary',!pomo.running);
  }
  if($('pomoSessions'))$('pomoSessions').textContent=pomo.sessions;
  if($('pomoFocusMin'))$('pomoFocusMin').textContent=pomo.focusMin;

  const grid=$('pomoGrid');
  if(grid){
    const CELLS=60;
    if(grid.children.length!==CELLS){
      grid.innerHTML='';
      for(let i=0;i<CELLS;i++){
        const c=document.createElement('i');
        grid.appendChild(c);
      }
    }
    const lit=pomo.total>0?Math.round((pomo.left/pomo.total)*CELLS):CELLS;
    [...grid.children].forEach((c,i)=>c.classList.toggle('on',i<lit));
  }

  document.querySelectorAll('.pomo-mode').forEach(b=>{
    b.classList.toggle('on',+b.dataset.mins===pomo.mode&&pomo.label!=='Custom');
  });

  const hint=$('pomoHint');
  if(hint){
    if(focusId){
      const t=tasks.find(x=>x.id===focusId);
      hint.textContent=t?'Focusing: '+t.title:'Pick a task with Focus, then start.';
    }else{
      hint.textContent=pomo.running?'Stay with it.':'Pick a task with Focus, then start.';
    }
  }
  if($('pomoSec'))$('pomoSec').classList.toggle('running',pomo.running);

  try{
    document.title=pomo.running?(fmtPomo(pomo.left)+' · '+pomo.label+' · My Tasks'):'My Tasks';
  }catch(e){}
};

const stopPomo=()=>{
  if(pomo.timer){clearInterval(pomo.timer);pomo.timer=null}
  if(pomo.running&&pomo.endsAt){
    pomo.left=Math.max(0,(pomo.endsAt-Date.now())/1000);
  }
  pomo.running=false;
  pomo.endsAt=0;
  savePomoRun();
  updatePomoUI();
};

const startPomo=()=>{
  if(pomo.running){
    stopPomo();
    return;
  }
  if(pomo.left<=0){
    pomo.left=pomo.total;
  }
  ensureAudio();
  pomo.running=true;
  pomo.endsAt=Date.now()+pomo.left*1000;
  savePomoRun();
  updatePomoUI();

  if(pomo.timer)clearInterval(pomo.timer);
  pomo.timer=setInterval(()=>{
    const left=(pomo.endsAt-Date.now())/1000;
    if(left<=0){
      finishPomo();
      return;
    }
    pomo.left=left;
    updatePomoUI();
  },250);
};

const resetPomo=(mins,label)=>{
  stopPomo();
  if(mins){
    pomo.mode=mins;
    if(label)pomo.label=label;
    else if(mins===25)pomo.label='Focus';
    else if(mins===5)pomo.label='Break';
    else if(mins===15)pomo.label='Long break';
    else pomo.label='Custom';
  }
  pomo.total=pomo.mode*60;
  pomo.left=pomo.total;
  savePomoRun();
  updatePomoUI();
};
const restorePomo=()=>{
  try{
    const d=JSON.parse(localStorage.getItem(POMO_RUN));
    if(!d||!(d.mode>0))return;

    pomo.mode=d.mode;
    pomo.label=d.label||'Focus';
    pomo.total=d.total>0?d.total:d.mode*60;
    pomo.left=d.left>=0?d.left:pomo.total;

    if(d.running&&d.endsAt){
      if(d.endsAt>Date.now()){
        pomo.left=(d.endsAt-Date.now())/1000;
        startPomo();
      }else{
        finishPomo();
      }
    }
  }catch(e){}
};

const AIC={
  check:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  flame:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c1 3.5 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z"/></svg>',
  target:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.2"/></svg>',
  clock:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/></svg>',
  trophy:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4h8v5a4 4 0 0 1-8 0V4zM8 6H5v1a3 3 0 0 0 3 3M16 6h3v1a3 3 0 0 1-3 3M12 13v4M9 20h6"/></svg>',
  star:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9 6.8 19.7l1-5.9L3.5 9.7l5.9-.8z"/></svg>',
  list:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg>',
  bolt:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 3L5 13.5h6L10 21l8-10.5h-6z"/></svg>',
  sun:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/></svg>',
  moon:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>',
  cal:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5.5" width="16" height="14.5" rx="3"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/></svg>',
  flag:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 21V4M6 5h11l-2 4 2 4H6"/></svg>',
  tag:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 12.5V4.5h8l9 9-8 8z"/><circle cx="8" cy="9" r="1"/></svg>',
  note:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.5h9l3 3V20.5H6zM9 11h6M9 15h6"/></svg>',
  loop:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.5M20 4v4.5h-4.5M20 12a8 8 0 0 1-13.7 5.6L4 15.5M4 20v-4.5h4.5"/></svg>'
};

const ACH=[
  {id:'first',n:'First step',d:'Complete your first task',x:'Every big list starts with one finished task. You just proved you can get started.',ic:'check',t:1,v:s=>s.done},
  {id:'ten',n:'Getting going',d:'Complete 10 tasks',x:'Ten tasks done. You are building a real habit of finishing things.',ic:'check',t:10,v:s=>s.done},
  {id:'fifty',n:'Task master',d:'Complete 50 tasks',x:'Fifty finished tasks means you follow through, even on the boring ones.',ic:'star',t:50,v:s=>s.done},
  {id:'hundred',n:'Centurion',d:'Complete 100 tasks',x:'One hundred tasks completed. That is serious consistency.',ic:'trophy',t:100,v:s=>s.done},
  {id:'day5',n:'Big day',d:'Complete 5 tasks in a single day',x:'Five tasks in one day is a rare burst of momentum. Make the most of it.',ic:'bolt',t:5,v:s=>s.bestDay},
  {id:'streak3',n:'Three in a row',d:'Finish tasks 3 days in a row',x:'Three days in a row of getting something done. The habit is starting to stick.',ic:'flame',t:3,v:s=>s.best},
  {id:'streak7',n:'Week warrior',d:'Keep a 7-day streak',x:'A full week of finishing at least one task every single day.',ic:'flame',t:7,v:s=>s.best},
  {id:'streak30',n:'Unstoppable',d:'Keep a 30-day streak',x:'Thirty days without a miss. Habits do not get stronger than this.',ic:'trophy',t:30,v:s=>s.best},
  {id:'focus1',n:'Deep breath',d:'Finish a focus session',x:'Your first full focus session on the Timer. Deep work starts here.',ic:'target',t:1,v:s=>s.sess},
  {id:'focus10',n:'In the zone',d:'Finish 10 focus sessions',x:'Ten finished focus sessions. Staying focused is becoming routine.',ic:'target',t:10,v:s=>s.sess},
  {id:'focus300',n:'Five hours of focus',d:'Focus for 300 minutes in total',x:'Five hours of focused time, added up across all your sessions.',ic:'clock',t:300,v:s=>s.mins},
  {id:'planner',n:'Planner',d:'Give 10 tasks a due date',x:'Planning ahead pays off. Ten tasks now have a due date.',ic:'list',t:10,v:s=>tasks.filter(t=>t.date).length},
  {id:'task25',n:'Quarter century',d:'Complete 25 tasks',x:'Twenty-five tasks finished. Your momentum is real.',ic:'check',t:25,v:s=>s.done},
  {id:'task250',n:'Powerhouse',d:'Complete 250 tasks',x:'Two hundred and fifty tasks done. You get things finished.',ic:'star',t:250,v:s=>s.done},
  {id:'task500',n:'Legend',d:'Complete 500 tasks',x:'Five hundred completed tasks. Very few people stick with it this long.',ic:'trophy',t:500,v:s=>s.done},
  {id:'task1000',n:'Thousand club',d:'Complete 1000 tasks',x:'One thousand tasks completed. An incredible track record.',ic:'trophy',t:1000,v:s=>s.done},
  {id:'day3',n:'Productive day',d:'Complete 3 tasks in a single day',x:'Three tasks in one day. A solid, productive day.',ic:'bolt',t:3,v:s=>s.bestDay},
  {id:'day10',n:'Unstoppable day',d:'Complete 10 tasks in a single day',x:'Ten tasks in a single day. That is an outstanding burst of energy.',ic:'bolt',t:10,v:s=>s.bestDay},
  {id:'streak14',n:'Fortnight focus',d:'Keep a 14-day streak',x:'Two full weeks of finishing something every day.',ic:'flame',t:14,v:s=>s.best},
  {id:'streak60',n:'Iron habit',d:'Keep a 60-day streak',x:'Sixty days in a row. This is a lifestyle now.',ic:'flame',t:60,v:s=>s.best},
  {id:'streak100',n:'Hundred days',d:'Keep a 100-day streak',x:'One hundred days without missing. Truly remarkable.',ic:'trophy',t:100,v:s=>s.best},
  {id:'active10',n:'Regular',d:'Complete tasks on 10 different days',x:'You showed up and finished tasks on ten separate days.',ic:'cal',t:10,v:s=>s.days},
  {id:'active30',n:'Committed',d:'Complete tasks on 30 different days',x:'Thirty different days with something finished. Consistency wins.',ic:'cal',t:30,v:s=>s.days},
  {id:'active100',n:'Dedicated',d:'Complete tasks on 100 different days',x:'One hundred different days of getting things done.',ic:'cal',t:100,v:s=>s.days},
  {id:'early',n:'Early bird',d:'Complete 5 tasks before 9 AM',x:'Five tasks finished before the day really began.',ic:'sun',t:5,v:s=>s.early},
  {id:'owl',n:'Night owl',d:'Complete 5 tasks after 9 PM',x:'Five tasks finished late in the evening. Some people just work better at night.',ic:'moon',t:5,v:s=>s.late},
  {id:'weekend',n:'Weekend warrior',d:'Complete 10 tasks on weekends',x:'Ten tasks done while everyone else was relaxing.',ic:'cal',t:10,v:s=>s.wknd},
  {id:'focus5',n:'Warming up',d:'Finish 5 focus sessions',x:'Five finished focus sessions. The rhythm is building.',ic:'target',t:5,v:s=>s.sess},
  {id:'focus25',n:'Focus regular',d:'Finish 25 focus sessions',x:'Twenty-five finished focus sessions. Deep work is part of your routine.',ic:'target',t:25,v:s=>s.sess},
  {id:'focus100',n:'Focus master',d:'Finish 100 focus sessions',x:'One hundred focus sessions. You have trained serious concentration.',ic:'trophy',t:100,v:s=>s.sess},
  {id:'focus600',n:'Ten hours of focus',d:'Focus for 600 minutes in total',x:'Ten hours of focused time, added up across all your sessions.',ic:'clock',t:600,v:s=>s.mins},
  {id:'focus1500',n:'Twenty-five hours',d:'Focus for 1500 minutes in total',x:'Twenty-five hours of deep focus. That is a lot of real work.',ic:'clock',t:1500,v:s=>s.mins},
  {id:'planner25',n:'Master planner',d:'Give 25 tasks a due date',x:'Twenty-five tasks scheduled. You plan ahead like a pro.',ic:'list',t:25,v:s=>tasks.filter(t=>t.date).length},
  {id:'timed',n:'On the clock',d:'Set a time on 10 tasks',x:'Ten tasks have a set time. Precision planning.',ic:'clock',t:10,v:s=>tasks.filter(t=>t.time).length},
  {id:'prio',n:'Priorities straight',d:'Set a priority on 10 tasks',x:'Ten tasks have a priority. You know what matters most.',ic:'flag',t:10,v:s=>tasks.filter(t=>t.priority).length},
  {id:'high5',n:'Big hitter',d:'Complete 5 high-priority tasks',x:'Five high-priority tasks done. You tackle the important stuff first.',ic:'flag',t:5,v:s=>tasks.filter(t=>t.status==='done'&&t.priority==='high').length},
  {id:'cats3',n:'Organized',d:'Use 3 different categories',x:'Three categories in use. Your list is neatly sorted.',ic:'tag',t:3,v:s=>new Set(tasks.map(t=>t.cat).filter(Boolean)).size},
  {id:'notes5',n:'Detail oriented',d:'Add notes to 5 tasks',x:'Five tasks have notes. You like to keep the details handy.',ic:'note',t:5,v:s=>tasks.filter(t=>t.notes&&t.notes.trim()).length},
  {id:'repeat',n:'Creature of habit',d:'Create a repeating task',x:'You set a task to repeat. Routines run themselves.',ic:'loop',t:1,v:s=>tasks.filter(t=>t.repeat).length},
  {id:'repeat5',n:'Routine builder',d:'Have 5 repeating tasks',x:'Five repeating tasks. Your routines are well established.',ic:'loop',t:5,v:s=>tasks.filter(t=>t.repeat).length},
  {id:'big',n:'Full board',d:'Have 20 tasks on your list at once',x:'Twenty tasks on your list. Ambitious. Time to start crossing them off.',ic:'list',t:20,v:s=>tasks.length},
  {id:'clean',n:'Clean slate',d:'Finish every task on a list of 3 or more',x:'Every task on a list of three or more is checked off. A truly clear list.',ic:'star',t:1,v:()=>tasks.length>=3&&tasks.every(t=>t.status==='done')?1:0}
];

let achDone={},achReady=false,achQ=[],achT=0;

function loadAch(){
  try{
    const d=JSON.parse(localStorage.getItem('my-tasks-ach'));
    if(d&&typeof d==='object'&&!Array.isArray(d)){achDone=d;return}
  }catch(e){}
  achDone={};
}

function saveAch(){
  try{localStorage.setItem('my-tasks-ach',JSON.stringify(achDone))}catch(e){warnSave()}
}

function loadPomoTotals(){
  try{
    const d=JSON.parse(localStorage.getItem('my-tasks-pomo-total'));
    if(d){
      pomo.tSess=+d.sessions||0;
      pomo.tMin=+d.minutes||0;
      return;
    }
  }catch(e){}
  pomo.tSess=pomo.sessions;
  pomo.tMin=pomo.focusMin;
}

function savePomoTotals(){
  try{
    localStorage.setItem('my-tasks-pomo-total',JSON.stringify({sessions:pomo.tSess,minutes:pomo.tMin}));
  }catch(e){
    warnSave();
  }
}

function logStats(){
  const counts={};
  log.forEach(e=>{
    const k=dkey(new Date(e.at));
    counts[k]=(counts[k]||0)+1;
  });

  const nums=[...new Set(Object.keys(counts).map(k=>{
    const[y,m,d]=k.split('-').map(Number);
    return dnum(new Date(y,m-1,d));
  }))].sort((a,b)=>a-b);

  let best=0,run=0;
  nums.forEach((v,i)=>{
    run=i&&v===nums[i-1]+1?run+1:1;
    if(run>best)best=run;
  });

  const t=new Date();
  t.setHours(0,0,0,0);
  const tn=dnum(t),set=new Set(nums);
  let cur=0,c=set.has(tn)?tn:tn-1;
  while(set.has(c)){cur++;c--}

  return{best,cur,bestDay:Math.max(0,...Object.values(counts))};
}

const achStats=()=>{
  const o=Object.assign(
    {done:log.length,sess:pomo.tSess,mins:pomo.tMin},
    logStats()
  );
  let early=0,late=0,wknd=0;
  const days=new Set();
  log.forEach(e=>{
    const d=new Date(e.at),h=d.getHours(),w=d.getDay();
    if(h<9)early++;
    if(h>=21)late++;
    if(w===0||w===6)wknd++;
    days.add(dkey(d));
  });
  o.early=early;o.late=late;o.wknd=wknd;o.days=days.size;
  return o;
};

function checkAch(silent){
  if(!achReady&&!silent)return;

  const s=achStats(),newly=[];
  ACH.forEach(a=>{
    if(!achDone[a.id]&&a.v(s)>=a.t){
      achDone[a.id]=Date.now();
      newly.push(a);
    }
  });

  if(!newly.length)return;
  saveAch();
  if(silent)return;

  achQ.push(...newly.map(a=>a.n));
  clearTimeout(achT);
  achT=setTimeout(()=>{
    const q=achQ;
    achQ=[];
    sfx.pomo();
    toast('Achievement unlocked: '+q[0]+(q.length>1?' (+'+(q.length-1)+' more)':''),undo);
    render();
  },600);
}

function badgesHTML(){
  const got=ACH.filter(a=>achDone[a.id]).length;

  const items=ACH.map(a=>{
    const on=!!achDone[a.id];
    const tip=a.d+(on?' · Unlocked '+new Date(achDone[a.id]).toLocaleDateString('en',{month:'short',day:'numeric',year:'numeric'}):' · Locked');
    return '<div class="badge'+(on?' on':'')+'" data-ach="'+a.id+'" role="button" tabindex="0" title="'+esc(tip)+'"><span class="bdg-ic">'+AIC[a.ic]+'</span><span class="bdg-n">'+esc(a.n)+'</span></div>';
  }).join('');

  return '<div class="panel"><div class="phead"><h3>Badges</h3><span class="sub">'+got+' of '+ACH.length+' earned</span></div><div class="badges">'+items+'</div></div>';
}

let achFrom=null;

function closeAch(){
  const el=$('amodal');
  if(!el)return;
  el.remove();
  ['.nav','main','.foot'].forEach(sel=>{
    const n=document.querySelector(sel);
    if(n)n.inert=false;
  });
  if(!openId&&!cmOpen())document.body.classList.remove('lock');
  if(achFrom&&achFrom.isConnected)achFrom.focus();
  achFrom=null;
}

function openAch(id,from){
  const a=ACH.find(x=>x.id===id);
  if(!a)return;
  closeAch();

  const s=achStats();
  const on=!!achDone[a.id];
  const v=Math.min(a.v(s),a.t);
  const p=Math.round(v/a.t*100);

  const foot=on?
    '<p class="ac-when">Unlocked on '+new Date(achDone[a.id]).toLocaleDateString('en',{weekday:'long',month:'long',day:'numeric',year:'numeric'})+'</p>':
    '<div class="ac-prog"><i style="width:'+p+'%"></i></div><p class="ac-num">'+v+' / '+a.t+'</p>';

  const el=document.createElement('div');
  el.className='backdrop';
  el.id='amodal';
  el.innerHTML='<div class="editor pop acard'+(on?' on':'')+'" role="dialog" aria-modal="true" aria-label="'+esc(a.n)+'">'
    +'<button type="button" class="x ac-close" data-ac="close" aria-label="Close">&times;</button>'
    +'<span class="ac-ic">'+AIC[a.ic]+'</span>'
    +'<span class="ac-state">'+(on?'Unlocked':'Locked')+'</span>'
    +'<h2>'+esc(a.n)+'</h2>'
    +'<p class="ac-t">'+esc(a.x)+'</p>'
    +'<p class="ac-g">Goal: '+esc(a.d)+'</p>'
    +foot
    +'<button type="button" class="close" data-ac="close">Got it</button>'
    +'</div>';

  el.addEventListener('click',e=>{
    if(e.target===el||e.target.closest('[data-ac]'))closeAch();
  });

  achFrom=from||null;
  document.body.appendChild(el);
  document.body.classList.add('lock');
  ['.nav','main','.foot'].forEach(sel=>{
    const n=document.querySelector(sel);
    if(n)n.inert=true;
  });

  const b=el.querySelector('.close');
  if(b)b.focus();
}

['achSec','hist'].forEach(id=>{
  const host=$(id);
  if(!host)return;

  host.addEventListener('click',e=>{
    const c=e.target.closest('[data-ach]');
    if(c)openAch(c.dataset.ach,c);
  });

  host.addEventListener('keydown',e=>{
    if(e.key!=='Enter'&&e.key!==' ')return;
    const c=e.target.closest('[data-ach]');
    if(!c)return;
    e.preventDefault();
    openAch(c.dataset.ach,c);
  });
});

document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&$('amodal')){
    e.stopImmediatePropagation();
    closeAch();
  }
},true);

function achHTML(){
  const s=achStats();
  const got=ACH.filter(a=>achDone[a.id]).length;
  const pct=Math.round(got/ACH.length*100);

  const head='<div class="ach-head"><div><b>'+got+' / '+ACH.length+'</b><span>Achievements unlocked</span></div><div class="ach-bar"><i style="width:'+pct+'%"></i></div></div>';

  const card=a=>{
    const on=!!achDone[a.id];
    const v=Math.min(a.v(s),a.t);
    const p=Math.round(v/a.t*100);
    const foot=on?
      '<span class="ach-when">Unlocked '+new Date(achDone[a.id]).toLocaleDateString('en',{month:'short',day:'numeric',year:'numeric'})+'</span>':
      '<div class="ach-prog"><i style="width:'+p+'%"></i></div><span class="ach-num">'+v+' / '+a.t+'</span>';

    return '<div class="ach-card'+(on?' on':'')+'" data-ach="'+a.id+'" role="button" tabindex="0"><span class="ach-ic">'+AIC[a.ic]+'</span><div class="ach-tx"><h4>'+esc(a.n)+'</h4><p>'+esc(a.d)+'</p>'+foot+'</div></div>';
  };

  const list=ACH.filter(a=>achDone[a.id]).concat(ACH.filter(a=>!achDone[a.id]));

  return head+'<div class="ach-grid">'+list.map(card).join('')+'</div>';
}

function nameGet(){
  try{return localStorage.getItem('my-tasks-name')}catch(e){return null}
}

function nameSet(v){
  try{localStorage.setItem('my-tasks-name',v)}catch(e){}
}

let userName=nameGet()||'',nameFrom=null;

function renderGreet(){
  const el=$('greet');
  if(!el)return;
  const h=new Date().getHours();
  const g=h<12?'Good morning':h<18?'Good afternoon':'Good evening';
  el.innerHTML='<span class="gtxt">'+esc(g)+(userName?', <span class="gname">'+esc(userName)+'</span>':'')+'</span>';
}

function closeName(){
  const el=$('nmodal');
  if(!el)return;
  el.remove();
  ['.nav','main','.foot'].forEach(sel=>{
    const n=document.querySelector(sel);
    if(n)n.inert=false;
  });
  if(!openId&&!cmOpen()&&!$('amodal'))document.body.classList.remove('lock');
  if(nameFrom&&nameFrom.isConnected)nameFrom.focus();
  nameFrom=null;
}

function openName(first,from){
  closeName();

  const el=document.createElement('div');
  el.className='backdrop';
  el.id='nmodal';
  el.dataset.first=first?'1':'';
  el.innerHTML='<div class="editor pop nmcard" role="dialog" aria-modal="true" aria-label="Your name">'
    +'<h2>'+(first?'Welcome!':'Your name')+'</h2>'
    +'<p class="nm-t">'+(first?'What should we call you?':'Update the name you are greeted with.')+'</p>'
    +'<input id="nameInput" maxlength="24" autocomplete="given-name" placeholder="Your name" aria-label="Your name" value="'+esc(userName)+'">'
    +'<div class="nm-act"><button type="button" class="nm-skip" data-nm="skip">'+(first?'Skip':'Cancel')+'</button><button type="button" class="close" data-nm="save">'+(first?'Continue':'Save')+'</button></div>'
    +'</div>';

  const input=el.querySelector('#nameInput');

  const save=()=>{
    const v=input.value.trim().replace(/\s+/g,' ').slice(0,24);
    if(!v&&first){
      input.focus();
      return;
    }
    userName=v;
    nameSet(v);
    renderGreet();
    closeName();
    if(v)toast('Nice to meet you, '+v+'!');
  };

  const skip=()=>{
    if(first){
      userName='';
      nameSet('');
      renderGreet();
    }
    closeName();
  };

  el.addEventListener('click',e=>{
    const b=e.target.closest('[data-nm]');
    if(b){
      if(b.dataset.nm==='save')save();
      else skip();
      return;
    }
    if(e.target===el&&!first)closeName();
  });

  input.addEventListener('keydown',e=>{
    if(e.key==='Enter'){
      e.preventDefault();
      save();
    }
  });

  nameFrom=from||null;
  document.body.appendChild(el);
  document.body.classList.add('lock');
  ['.nav','main','.foot'].forEach(sel=>{
    const n=document.querySelector(sel);
    if(n)n.inert=true;
  });

  input.focus();
  input.select();
}

$('greet').addEventListener('click',e=>openName(false,e.currentTarget));

document.addEventListener('keydown',e=>{
  const el=$('nmodal');
  if(e.key!=='Escape'||!el)return;
  e.stopImmediatePropagation();
  if(el.dataset.first){
    userName='';
    nameSet('');
    renderGreet();
  }
  closeName();
},true);

const fmtTime=t=>{
  if(!t)return'';
  const[h,m]=t.split(':').map(Number);
  return(h%12||12)+':'+String(m).padStart(2,'0')+' '+(h<12?'AM':'PM');
};

const fmtDate=d=>{
  if(!d)return'';
  const[y,m,da]=d.split('-').map(Number);
  const dt=new Date(y,m-1,da),now=new Date();
  const diff=Math.round((dt-new Date(now.getFullYear(),now.getMonth(),now.getDate()))/864e5);
  if(diff===0)return'Today';
  if(diff===1)return'Tomorrow';
  if(diff===-1)return'Yesterday';
  const o={month:'short',day:'numeric'};
  if(y!==now.getFullYear())o.year='numeric';
  return dt.toLocaleDateString('en',o);
};

const when=t=>[fmtDate(t.date),t.time&&fmtTime(t.time)].filter(Boolean).join(' · ')||'Anytime';

const esc=s=>String(s||'').replace(/[&<>\"]/g,c=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'
}[c]));

function load(){
  try{
    const s=localStorage.getItem('my-tasks');
    if(s){
      tasks=JSON.parse(s);
      return;
    }
  }catch(e){}

  tasks=[];
}

let saveWarned=false;
function warnSave(){
  if(saveWarned)return;
  saveWarned=true;
  toast('Could not save. Browser storage may be full or blocked.');
}

function save(){
  setTimeout(checkAch,0);
  try{
    localStorage.setItem('my-tasks',JSON.stringify(tasks));
  }catch(e){
    warnSave();
  }
}

let typeT=0;
function queueSave(){
  clearTimeout(typeT);
  typeT=setTimeout(()=>{typeT=0;save();render()},200);
}
function flushSave(){
  if(typeT){
    clearTimeout(typeT);
    typeT=0;
    save();
  }
}
window.addEventListener('pagehide',flushSave);

const PR={low:'Low',med:'Medium',high:'High'};
const PRN={'':0,low:1,med:2,high:3};

const cleanId=(v,fallback)=>{
  const c=String(v==null?'':v).replace(/[^\w-]/g,'').slice(0,40);
  return c||fallback;
};
const cleanDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(v||'')?v:'';
const cleanTime=v=>/^\d{2}:\d{2}$/.test(v||'')?v:'';
const cleanPrio=v=>PRN[v]?v:'';

const REP={daily:'Daily',weekdays:'Weekdays',weekly:'Weekly'};
const REP_ORDER=['','daily','weekdays','weekly'];
const cleanRep=v=>REP[v]?v:'';
let newRep='';

const nextDue=(d,r)=>{
  const today=dkey(new Date());
  const[y,m,da]=(d||today).split('-').map(Number);
  const dt=new Date(y,m-1,da);
  const step=()=>{
    dt.setDate(dt.getDate()+(r==='weekly'?7:1));
    if(r==='weekdays'){
      while(dt.getDay()===0||dt.getDay()===6)dt.setDate(dt.getDate()+1);
    }
  };
  step();
  while(dkey(dt)<=today)step();
  return dkey(dt);
};

const dueAt=t=>{
  if(!t.date)return null;
  const[y,m,d]=t.date.split('-').map(Number);
  const hm=(t.time||'23:59').split(':').map(Number);
  return new Date(y,m-1,d,hm[0],hm[1]).getTime();
};

const dueSort=t=>{
  const d=dueAt(t);
  if(d!==null)return d;
  if(t.time){
    const n=new Date(),hm=t.time.split(':').map(Number);
    return new Date(n.getFullYear(),n.getMonth(),n.getDate(),hm[0],hm[1]).getTime();
  }
  return Infinity;
};

const inToday=t=>{
  if(t.status==='done')return false;
  const now=dkey(new Date()),next=new Date();
  next.setDate(next.getDate()+7);
  const end=dkey(next);
  if(t.date)return t.date<=end;   
  return !!t.time;                
};

const isLate=t=>{
  if(t.status==='done')return false;
  const d=dueAt(t);
  return d!==null&&d<Date.now();
};

const created=t=>t.created||+String(t.id).replace(/\D/g,'')||0;

const ptag=t=>t.priority?
  '<span class="ptag p-'+esc(t.priority)+'">'+esc(PR[t.priority]||'')+'</span>':'';

const DEFCATS=[
  {id:'work',name:'Work'},
  {id:'personal',name:'Personal'},
  {id:'health',name:'Health'},
  {id:'study',name:'Study'}
];

function loadCats(){
  try{
    const s=JSON.parse(localStorage.getItem('my-tasks-cats'));
    if(Array.isArray(s)&&s.every(c=>c&&typeof c.id==='string'&&typeof c.name==='string')){
      cats=s.map(c=>({
        id:c.id,
        name:c.name
      }));
      return;
    }
  }catch(e){}
  cats=DEFCATS.map(c=>({...c}));
}

function saveCats(){
  try{
    localStorage.setItem('my-tasks-cats',JSON.stringify(cats));
  }catch(e){
    warnSave();
  }
}

const catOf=id=>id?cats.find(c=>c.id===id)||null:null;

const ctag=t=>{
  const c=catOf(t.cat);
  return c?'<span class="ctag">'+esc(c.name)+'</span>':'';
};

const EMP={
  all:['Ready for adventure!','Type a mission above and hit Add—XP awaits!'],
  todo:['Inbox zero feels good','Nothing waiting. Add something fun or important.'],
  prog:['No active missions','Flag a task to put it in progress and focus.'],
  done:['No wins yet today','Finish a task and it will show up here.'],
  search:['No matches','Nothing matches “'+'Q'+'”. Try another word.']
};

const emptyHTML=k=>{
  const e=EMP[k]||EMP.all;
  const sub=k==='search'?e[1].replace('Q',esc(query.trim())):e[1];
  return '<li class="empty"><b>'+e[0]+'</b><span>'+sub+'</span></li>';
};

const rtag=t=>REP[t.repeat]?'<span class="ctag">↻ '+REP[t.repeat]+'</span>':'';

const meta=t=>when(t)+(isLate(t)?'<span class="latetag">Overdue</span>':'')+ptag(t)+ctag(t)+rtag(t);

const itemHTML=t=>
  '<li class="item '+(t.status==='prog'?'prog-s':t.status)+(openId===t.id?' open':'')+(justId===t.id?' just':'')+(enterId===t.id?' enter':'')+(isLate(t)?' late-item':'')+(focusId===t.id?' focused':'')+(focusId&&focusId!==t.id?' dimmed':'')+'" data-id="'+esc(t.id)+'"'+(focusId&&focusId!==t.id?' inert aria-disabled="true"':'')+'>'
  +'<div class="swl"><span>'+(t.status==='done'?'Reopen':'Done')+'</span></div><div class="swr"><span>Delete</span></div>'
  +'<div class="sw"><div class="row">'
  +(sortBy==='manual'?'<button class="grip" data-a="grip" aria-label="Drag to reorder, or use arrow keys">'+IC.grip+'</button>':'')
  +'<button class="chk" data-a="done" aria-label="Mark done" aria-pressed="'+(t.status==='done')+'">'+IC.check+'</button>'
  +'<button class="body" data-a="open" aria-expanded="'+(openId===t.id)+'"><span class="title">'+esc(t.title)+'</span><span class="time'+(isLate(t)?' late':'')+'">'+meta(t)+'</span>'+noteLine(t)+'</button>'
  +'<button class="focus-btn'+(focusId===t.id?' on':'')+'" data-a="focus" aria-label="'+(focusId===t.id?'Exit focus':'Focus on this task')+'" title="'+(focusId===t.id?'Exit focus':'Focus')+'">'+IC.focus+'</button>'
  +'<button class="flag" data-a="prog" aria-label="Mark in progress">'+IC.flag+'</button>'
  +'<button class="del-btn" data-a="del" aria-label="Delete task" title="Delete">'+IC.trash+'</button></div></div></li>';

const noteLine=t=>
  (t.notes&&t.notes.trim()?'<span class="notel"><span class="nt">'+esc(t.notes.trim())+'</span></span>':'');

const catField=t=>cats.length?
  cats.map(c=>'<button type="button" class="sg cc'+(t.cat===c.id?' on':'')+'" data-a="cat" data-c="'+esc(c.id)+'">'+esc(c.name)+'</button>').join(''):
  '<button type="button" class="sg" data-a="cats">+ Create a category</button>';

const editor=t=>
  '<div class="backdrop" data-a="close"><div class="editor pop" role="dialog" aria-modal="true" aria-label="Edit task" data-id="'+esc(t.id)+'">'
  +'<div class="ehead"><h2>Edit Mission</h2><button class="x" data-a="close" aria-label="Close">&times;</button></div>'
  +'<label class="fld"><span>Title</span><input class="et" data-k="title" maxlength="120" value="'+esc(t.title)+'"></label>'
  +'<div class="two">'
  +'<div class="fld"><span>Date</span><button type="button" class="tbtn'+(t.date?'':' empty')+'" id="mdate" data-a="date" aria-label="Set date"><span class="tl">'+(t.date?fmtDate(t.date):'Set date')+'</span></button></div>'
  +'<div class="fld"><span>Time</span><button type="button" class="tbtn'+(t.time?'':' empty')+'" id="mtime" data-a="time" aria-label="Set time"><span class="tl">'+(t.time?fmtTime(t.time):'Set time')+'</span></button></div>'
  +'</div>'
  +'<div class="fld"><span>Repeat</span><div class="seg" id="mrep">'+['daily','weekdays','weekly'].map(r=>'<button type="button" class="sg'+(t.repeat===r?' on':'')+'" data-a="rep" data-r="'+r+'">'+REP[r]+'</button>').join('')+'</div></div>'
  +'<div class="fld"><span>Priority</span><div class="seg" id="mprio">'+['low','med','high'].map(p=>'<button type="button" class="sg p-'+p+(t.priority===p?' on':'')+'" data-a="prio" data-p="'+p+'">'+PR[p]+'</button>').join('')+'</div></div>'
  +'<div class="fld"><div class="fh"><span>Category</span><button type="button" class="lnk" data-a="cats">Edit</button></div><div class="seg cats" id="mcat">'+catField(t)+'</div></div>'
  +'<label class="fld"><span>Notes</span><textarea class="ta" data-k="notes" rows="3" placeholder="Add notes...">'+esc(t.notes||'')+'</textarea></label>'
  +'<div class="eact"><div class="elinks"><button class="lnk" data-a="when">Clear date &amp; time</button><button class="lnk dng" data-a="rm">Delete task</button></div><button class="close" data-a="close">Done</button></div>'
  +'</div></div>';

function syncInert(){
  const catsOn=!!$('cmodal').innerHTML,editOn=!!openId;
  ['.nav','main','.foot'].forEach(sel=>{
    const el=document.querySelector(sel);
    if(el)el.inert=editOn||catsOn;
  });
  $('modal').inert=catsOn;
}

function openTask(id){
  const t=tasks.find(x=>x.id===id);
  if(!t)return;
  openId=id;
  $('modal').innerHTML=editor(t);
  document.body.classList.add('lock');
  syncInert();
  render();
  const ta=document.querySelector('#modal .ta');
  if(ta)ta.focus();
}

function closeTask(){
  closeTP();
  closeDP();
  flushSave();
  const id=openId;
  openId=null;
  $('modal').innerHTML='';
  document.body.classList.remove('lock');
  syncInert();
  render();
  const b=document.querySelector('.item[data-id="'+id+'"] .body');
  if(b)b.focus();
}

const n=s=>tasks.filter(t=>t.status===s).length;

function saveLog(){
  try{
    localStorage.setItem('my-tasks-log',JSON.stringify(log));
  }catch(e){
    warnSave();
  }
}

function loadLog(){
  let fresh=true;
  try{
    const s=localStorage.getItem('my-tasks-log');
    if(s!==null){
      log=JSON.parse(s);
      fresh=false;
    }
  }catch(e){}

  if(fresh){
    log=tasks.filter(t=>t.status==='done').map(t=>({
      id:t.id,title:t.title,at:t.doneAt||Date.now()
    }));
    saveLog();
  }
}

function syncLog(t){
  const has=log.some(x=>x.id===t.id);
  if(t.status==='done'&&!has){
    log.push({id:t.id,title:t.title,at:Date.now()});
  }else if(t.status!=='done'&&has){
    log=log.filter(x=>x.id!==t.id);
  }
  saveLog();
}

const dkey=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const dnum=d=>Math.round(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())/864e5);
const timeOf=ms=>{
  const d=new Date(ms),h=d.getHours();
  return(h%12||12)+':'+pad(d.getMinutes())+' '+(h<12?'AM':'PM');
};

function histHTML(){
  const today=new Date();
  today.setHours(0,0,0,0);

  const counts={};
  log.forEach(e=>{
    const k=dkey(new Date(e.at));
    counts[k]=(counts[k]||0)+1;
  });

  const nums=[...new Set(Object.keys(counts).map(k=>{
    const[y,m,d]=k.split('-').map(Number);
    return dnum(new Date(y,m-1,d));
  }))].sort((a,b)=>a-b);

  let best=0,run=0;
  nums.forEach((v,i)=>{
    run=i&&v===nums[i-1]+1?run+1:1;
    if(run>best)best=run;
  });

  const set=new Set(nums),tn=dnum(today);
  let cur=0,c=set.has(tn)?tn:tn-1;
  while(set.has(c)){cur++;c--}

  const week=log.filter(e=>dnum(new Date(e.at))>tn-7).length;

  const stats='<div class="hstats"><div class="stat g"><b>'+log.length+'</b><span>Completed</span></div><div class="stat"><b>'+week+'</b><span>Last 7 days</span></div><div class="stat a"><b>'+cur+'</b><span>Day streak</span></div><div class="stat"><b>'+best+'</b><span>Best streak</span></div></div>';

  const W=26,start=new Date(today);
  start.setDate(start.getDate()-start.getDay()-(W-1)*7);

  let cells='',months='',prev=-1;

  for(let w=0;w<W;w++){
    const wd=new Date(start);
    wd.setDate(start.getDate()+w*7);

    months+='<span>'+(wd.getMonth()!==prev?wd.toLocaleDateString('en',{month:'short'}):'')+'</span>';
    prev=wd.getMonth();

    for(let d=0;d<7;d++){
      const day=new Date(wd);
      day.setDate(wd.getDate()+d);

      if(day>today){
        cells+='<i class="cell x"></i>';
        continue;
      }

      const k=counts[dkey(day)]||0;
      const lv=k===0?0:k===1?1:k===2?2:k<5?3:4;

      cells+='<i class="cell l'+lv+'" data-t="'+k+' task'+(k===1?'':'s')+' · '+day.toLocaleDateString('en',{weekday:'short',month:'short',day:'numeric',year:'numeric'})+'"></i>';
    }
  }

  const heat='<div class="panel"><div class="phead"><h3>Activity</h3><span class="sub">Last 6 months</span></div><div class="hm"><div class="hm-days"><span></span><span>Mon</span><span></span><span>Wed</span><span></span><span>Fri</span><span></span></div><div class="hm-scroll" id="hmscroll" style="--w:'+W+'"><div class="hm-months">'+months+'</div><div class="hm-grid">'+cells+'</div></div></div><div class="hm-foot"><span id="hmtip">Hover or tap a square</span><span class="legend">Less<i class="cell l0"></i><i class="cell l1"></i><i class="cell l2"></i><i class="cell l3"></i><i class="cell l4"></i>More</span></div></div>';

  const days=[];
  for(let i=6;i>=0;i--){
    const d=new Date(today);
    d.setDate(d.getDate()-i);
    days.push({d,c:counts[dkey(d)]||0});
  }

  const mx=Math.max(1,...days.map(x=>x.c));

  const bars='<div class="panel"><div class="phead"><h3>This week</h3><span class="sub">Tasks completed per day</span></div><div class="bars">'+days.map(x=>'<div class="bar"><span class="bn">'+x.c+'</span><div class="bt"><i style="height:'+(x.c?Math.max(8,x.c/mx*100):0)+'%"></i></div><span class="bl">'+x.d.toLocaleDateString('en',{weekday:'short'})+'</span></div>').join('')+'</div></div>';

  const sorted=[...log].sort((a,b)=>b.at-a.at),groups=[];

  sorted.forEach(e=>{
    const k=dkey(new Date(e.at));
    let g=groups[groups.length-1];
    if(!g||g.k!==k){
      g={k,at:e.at,items:[]};
      groups.push(g);
    }
    g.items.push(e);
  });

  const label=ms=>{
    const d=new Date(ms);
    d.setHours(0,0,0,0);
    const df=tn-dnum(d);
    if(df===0)return'Today';
    if(df===1)return'Yesterday';
    const o={weekday:'short',month:'short',day:'numeric'};
    if(d.getFullYear()!==today.getFullYear())o.year='numeric';
    return d.toLocaleDateString('en',o);
  };

  const listH=groups.length?
    groups.map(g=>'<div class="hgroup"><h4>'+label(g.at)+'<small>'+g.items.length+'</small></h4><ul class="hl">'+g.items.map(e=>'<li class="hi"><span class="hchk">'+IC.check+'</span><span class="ht">'+esc(e.title)+'</span><span class="hw">'+timeOf(e.at)+'</span><button class="hx" data-a="hrm" data-id="'+esc(e.id)+'" aria-label="Remove from history">&times;</button></li>').join('')+'</ul></div>').join(''):
    '<p class="hempty">Nothing completed yet. Finish a task and it will show up here.</p>';

  const done='<div class="panel"><div class="phead"><h3>Completed tasks</h3>'+(log.length?'<button class="lnk" data-a="hclear">Clear history</button>':'')+'</div>'+listH+'</div>';

  return stats+badgesHTML()+heat+bars+done;
}

function render(){
  renderGreet();
  lateSig=tasks.filter(isLate).map(t=>t.id).join();

  $('date').textContent=new Date().toLocaleDateString('en',{
    weekday:'long',month:'long',day:'numeric',year:'numeric'
  });

  const dn=n('done');
  const pct=tasks.length?Math.round(dn/tasks.length*100):0;

  $('stats').innerHTML=
    '<div class="stat"><b>'+pct+'%</b><span>Progress</span></div>'+
    '<div class="stat"><b>'+n('todo')+'</b><span>To do</span></div>'+
    '<div class="stat a"><b>'+n('prog')+'</b><span>In progress</span></div>'+
    '<div class="stat g"><b>'+n('done')+'</b><span>Done</span></div>';


  if($('quote')&&!$('quote').dataset.set){
    $('quote').textContent=FUN_QUOTES[Math.floor(Math.random()*FUN_QUOTES.length)];
    $('quote').dataset.set='1';
  }

  document.body.classList.toggle('focus-mode',!!focusId);

  const list=view();
  const kind=query.trim()?'search':filter==='today'?'all':filter;

  const special=filter==='hist'||filter==='pomo'||filter==='ach';
  $('list').innerHTML=special?'':list.length?
    list.map(itemHTML).join(''):emptyHTML(kind);

  $('filters').hidden=special;
  $('list').hidden=special;
  if($('hist'))$('hist').hidden=filter!=='hist';
  if($('pomoSec'))$('pomoSec').hidden=filter!=='pomo';
  if($('achSec'))$('achSec').hidden=filter!=='ach';

  if(filter==='hist'){
    $('hist').innerHTML=histHTML();
    const sc=$('hmscroll');
    if(sc)sc.scrollLeft=sc.scrollWidth;
  }
  if(filter==='pomo')updatePomoUI();
  if(filter==='ach'&&$('achSec'))$('achSec').innerHTML=achHTML();

  const tabLabels={all:'All',today:'Today / Upcoming',todo:'To Do',prog:'In Progress',done:'Done',hist:'History',pomo:'Timer',ach:'Achievements'};
  document.querySelectorAll('.tab').forEach(b=>{
    const f=b.dataset.f,on=f===filter;
    b.classList.toggle('on',on);
    b.setAttribute('aria-selected',on);
    b.tabIndex=on?0:-1;
    const count=
      f==='all'?tasks.length:
      f==='hist'?log.length:
      f==='pomo'?pomo.sessions:
      f==='ach'?ACH.filter(a=>achDone[a.id]).length:
      f==='today'?tasks.filter(inToday).length:n(f);
    b.innerHTML=(tabLabels[f]||f)+'<small>'+count+'</small>';
  });
}

function pills(){
  const d=$('newdate').value,t=$('newtime').value;

  $('ldate').textContent=d?fmtDate(d):'Date';
  $('ltime').textContent=t?fmtTime(t):'Time';

  $('pdate').classList.toggle('set',!!d);
  $('ptime').classList.toggle('set',!!t);

  $('lrep').textContent=newRep?REP[newRep]:'Repeat';
  $('prep').classList.toggle('set',!!newRep);

  $('lprio').textContent=newPrio?PR[newPrio]:'Priority';
  $('pprio').className='pill'+(newPrio?' set p-'+newPrio:'');

  if(newCat&&!catOf(newCat))newCat='';

  const nc=catOf(newCat);

  $('lcat').textContent=nc?nc.name:'Category';
  $('pcat').className='pill'+(nc?' set':'');
}

const tp={el:null,anchor:null,cb:null,h:9,m:0,ap:'AM',touched:false};
const pad=n=>String(n).padStart(2,'0');

function closeTP(){
  if(tp.el){
    tp.el.remove();
    tp.el=null;
    tp.anchor=null;
    tp.cb=null;
  }
}

function tpVal(){
  let h=tp.h%12;
  if(tp.ap==='PM')h+=12;
  return pad(h)+':'+pad(tp.m);
}

function tpSync(){
  if(!tp.el)return;

  tp.el.querySelectorAll('.tcol button').forEach(b=>{
    const c=b.dataset.c,v=b.dataset.v;
    b.classList.toggle('on',
      c==='h'?+v===tp.h:
      c==='m'?+v===tp.m:v===tp.ap
    );
  });
}

function tpScroll(){
  tp.el.querySelectorAll('.tcol').forEach(col=>{
    const b=col.querySelector('.on');
    if(b)col.scrollTop=b.offsetTop-col.clientHeight/2+b.offsetHeight/2;
  });
}

function openTP(anchor,val,cb){
  if(tp.el&&tp.anchor===anchor){
    closeTP();
    return;
  }

  closeTP();
  closeDP();

  if(val){
    const[H,M]=val.split(':').map(Number);
    tp.h=H%12||12;
    tp.m=M;
    tp.ap=H<12?'AM':'PM';
  }else{
    tp.h=9;
    tp.m=0;
    tp.ap='AM';
  }

  tp.anchor=anchor;
  tp.cb=cb;
  tp.touched=false;

  const col=(k,items)=>
    '<div class="tcol" data-c="'+k+'">'+
    items.map(([v,l])=>'<button type="button" data-c="'+k+'" data-v="'+v+'">'+l+'</button>').join('')+
    '</div>';

  const el=document.createElement('div');
  el.className='tp';
  el.setAttribute('role','dialog');
  el.setAttribute('aria-label','Pick a time');

  el.innerHTML='<div class="tcols">'+
    col('h',Array.from({length:12},(_,i)=>[i+1,pad(i+1)]))+
    col('m',Array.from({length:60},(_,i)=>[i,pad(i)]))+
    col('p',[['AM','AM'],['PM','PM']])+
    '</div><div class="tfoot"><button type="button" class="lnk" data-a="clear">Clear</button><button type="button" class="close" data-a="ok">Done</button></div>';

  document.body.appendChild(el);
  tp.el=el;

  el.addEventListener('click',e=>{
    const b=e.target.closest('button');
    if(!b)return;

    if(b.dataset.c){
      const v=b.dataset.v;
      if(b.dataset.c==='h')tp.h=+v;
      else if(b.dataset.c==='m')tp.m=+v;
      else tp.ap=v;

      tp.touched=true;
      tpSync();
      tp.cb&&tp.cb(tpVal());

    }else if(b.dataset.a==='clear'){
      tp.cb&&tp.cb('');
      closeTP();
    }else if(b.dataset.a==='ok'){
      closeTP();
    }
  });

  tpSync();

  const r=anchor.getBoundingClientRect();
  const w=el.offsetWidth,hh=el.offsetHeight;

  let top=r.bottom+8;
  if(top+hh>innerHeight-12)top=Math.max(12,r.top-hh-8);

  el.style.left=Math.min(Math.max(12,r.left),Math.max(12,innerWidth-w-12))+'px';
  el.style.top=top+'px';

  tpScroll();
}

const outside=e=>{
  [[tp,closeTP],[dp,closeDP]].forEach(([p,close])=>{
    if(p.el&&!p.el.contains(e.target)&&!p.anchor.contains(e.target))close();
  });
};

document.addEventListener('mousedown',outside);
document.addEventListener('touchstart',outside,{passive:true});

window.addEventListener('resize',()=>{
  closeTP();
  closeDP();
});

document.addEventListener('scroll',e=>{
  [[tp,closeTP],[dp,closeDP]].forEach(([p,close])=>{
    if(p.el&&!p.el.contains(e.target))close();
  });
},true);

$('ptime').onclick=()=>openTP($('ptime'),$('newtime').value,v=>{
  $('newtime').value=v;
  pills();
});

const dp={el:null,anchor:null,cb:null,y:0,m:0,sel:''};

function closeDP(){
  if(dp.el){
    dp.el.remove();
    dp.el=null;
    dp.anchor=null;
    dp.cb=null;
  }
}

function dpDraw(){
  const first=new Date(dp.y,dp.m,1);
  const start=new Date(dp.y,dp.m,1-first.getDay());
  const nowK=dkey(new Date());

  let cells='';

  for(let i=0;i<42;i++){
    const d=new Date(start);
    d.setDate(start.getDate()+i);
    const k=dkey(d);

    cells+='<button type="button" class="dday'+
      (d.getMonth()!==dp.m?' out':'')+
      (k===nowK?' now':'')+
      (k===dp.sel?' on':'')+
      '" data-d="'+k+'">'+d.getDate()+'</button>';
  }

  dp.el.querySelector('.dtitle').textContent=
    first.toLocaleDateString('en',{month:'long',year:'numeric'});

  dp.el.querySelector('.dgrid').innerHTML=cells;
}

function openDP(anchor,val,cb){
  if(dp.el&&dp.anchor===anchor){
    closeDP();
    return;
  }

  closeTP();
  closeDP();

  const base=val?
    (()=>{
      const[y,m,d]=val.split('-').map(Number);
      return new Date(y,m-1,d);
    })():new Date();

  dp.y=base.getFullYear();
  dp.m=base.getMonth();
  dp.sel=val||'';
  dp.anchor=anchor;
  dp.cb=cb;

  const el=document.createElement('div');
  el.className='tp dp';
  el.setAttribute('role','dialog');
  el.setAttribute('aria-label','Pick a date');

  el.innerHTML='<div class="dhead">'+
    '<button type="button" class="dnav" data-n="-1" aria-label="Previous month">&lt;</button>'+
    '<span class="dtitle"></span>'+
    '<button type="button" class="dnav" data-n="1" aria-label="Next month">&gt;</button>'+
    '</div>'+
    '<div class="dwk">'+['Su','Mo','Tu','We','Th','Fr','Sa'].map(x=>'<span>'+x+'</span>').join('')+'</div>'+
    '<div class="dgrid"></div>'+
    '<div class="tfoot"><button type="button" class="lnk" data-a="clear">Clear</button><button type="button" class="lnk" data-a="today">Today</button></div>';

  document.body.appendChild(el);
  dp.el=el;

  el.addEventListener('click',e=>{
    const b=e.target.closest('button');
    if(!b)return;

    if(b.dataset.n){
      const d=new Date(dp.y,dp.m+ +b.dataset.n,1);
      dp.y=d.getFullYear();
      dp.m=d.getMonth();
      dpDraw();
    }else if(b.dataset.d){
      const f=dp.cb;
      closeDP();
      f&&f(b.dataset.d);
    }else if(b.dataset.a==='today'){
      const f=dp.cb;
      closeDP();
      f&&f(dkey(new Date()));
    }else if(b.dataset.a==='clear'){
      const f=dp.cb;
      closeDP();
      f&&f('');
    }
  });

  dpDraw();

  const r=anchor.getBoundingClientRect();
  const w=el.offsetWidth,hh=el.offsetHeight;

  let top=r.bottom+8;
  if(top+hh>innerHeight-12)top=Math.max(12,r.top-hh-8);

  el.style.left=Math.min(Math.max(12,r.left),Math.max(12,innerWidth-w-12))+'px';
  el.style.top=top+'px';
}

$('pdate').onclick=()=>openDP($('pdate'),$('newdate').value,v=>{
  $('newdate').value=v;
  pills();
});

(function ideaButton(){
  const input=$('new'),button=$('ideaBtn');
  if(!input||!button)return;

  const ideas=[
    'Take a 10-minute dance break',
    'Drink a refreshing glass of water',
    'Organize your workspace desk',
    'Read 5 pages of an exciting book',
    'Listen to your absolute favorite song',
    'Do 15 fun jumping jacks',
    'Stretch and breathe deeply for 3 minutes',
    'Send a kind text to a friend',
    'Plan a fun weekend reward for yourself',
    'Learn one cool fun fact online',
    'Clear 10 unnecessary camera roll photos',
    'Write down 3 things you are grateful for'
  ];

  let previous=-1;

  button.addEventListener('click',()=>{
    let i=Math.floor(Math.random()*ideas.length);
    if(ideas.length>1&&i===previous)i=(i+1)%ideas.length;
    previous=i;
    input.value=ideas[i];
    input.focus();
    input.setSelectionRange(input.value.length,input.value.length);

    const addBox=input.closest('.add');
    addBox.classList.remove('idea-pop');
    void addBox.offsetWidth;
    addBox.classList.add('idea-pop');

    button.innerHTML='<span>Another idea</span>';
  });
})();

function add(){
  const v=$('new').value.trim();

  if(!v){
    $('new').focus();
    return;
  }

  if(filter==='hist'||filter==='pomo'||filter==='ach')filter='all';

  if(query){
    query='';
    $('q').value='';
    $('qx').hidden=true;
    $('q').closest('.search').classList.remove('has');
  }

  const id=uid('t');

  tasks.push({
    id:id,
    created:Date.now(),
    title:v,
    date:$('newdate').value,
    time:$('newtime').value,
    priority:newPrio,
    cat:newCat,
    repeat:newRep,
    status:'todo'
  });

  enterId=id;

  setTimeout(()=>{
    enterId='';
  },700);

  $('new').value='';
  $('newdate').value='';
  $('newtime').value='';
  newPrio='';
  newCat='';
  newRep='';

  pills();
  save();
  sfx.add();
  render();

  if($('ideaBtn')){
    $('ideaBtn').innerHTML='<span>Surprise me</span>';
  }

  toast('Mission added! Let’s crush it');
}

$('go').onclick=add;

$('new').addEventListener('keydown',e=>{
  if(e.key==='Enter')add();
});

$('tabs').onclick=e=>{
  const b=e.target.closest('.tab');
  if(b){
    filter=b.dataset.f;
    render();
  }
};

$('tabs').addEventListener('keydown',e=>{
  const k=e.key;
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(k))return;
  const bs=[...document.querySelectorAll('#tabs .tab')];
  let i=bs.indexOf(document.activeElement);
  if(i<0)return;
  e.preventDefault();
  i=k==='Home'?0:k==='End'?bs.length-1:(i+(k==='ArrowRight'?1:-1)+bs.length)%bs.length;
  filter=bs[i].dataset.f;
  render();
  bs[i].focus();
});

$('list').onclick=e=>{
  if(swiped)return;

  const b=e.target.closest('[data-a]');
  if(!b)return;

  const id=b.closest('.item').dataset.id;
  const a=b.dataset.a;

  if(focusId&&id!==focusId)return;

  if(a==='grip')return;
  if(a==='open'){openTask(id);return}
  if(a==='del'){
    leave(b.closest('.item'),()=>removeTask(id));
    return;
  }
  if(a==='focus'){
    focusId=focusId===id?null:id;
    render();
    return;
  }

  toggleStatus(id,a,b);
};

$('modal').addEventListener('click',e=>{
  const b=e.target.closest('[data-a]');
  if(!b)return;

  const action=b.dataset.a;

  if(action==='close'){
    if(b.classList.contains('backdrop')&&e.target!==b)return;
    closeTask();
    return;
  }

  if(action==='cats'){
    openCats();
    return;
  }

  if(action==='prio'){
    const t=tasks.find(x=>x.id===openId);
    if(!t)return;

    const p=b.dataset.p;
    t.priority=t.priority===p?'':p;

    save();
    render();

    document.querySelectorAll('#mprio .sg').forEach(x=>
      x.classList.toggle('on',x.dataset.p===t.priority)
    );
    return;
  }

  if(action==='rep'){
    const t=tasks.find(x=>x.id===openId);
    if(!t)return;

    const r=b.dataset.r;
    t.repeat=t.repeat===r?'':r;

    save();
    render();

    document.querySelectorAll('#mrep .sg').forEach(x=>
      x.classList.toggle('on',x.dataset.r===t.repeat)
    );
    return;
  }

  if(action==='cat'){
    const t=tasks.find(x=>x.id===openId);
    if(!t)return;

    const c=b.dataset.c;
    t.cat=t.cat===c?'':c;

    save();
    render();

    document.querySelectorAll('#mcat .sg').forEach(x=>
      x.classList.toggle('on',x.dataset.c===t.cat)
    );
    return;
  }

  if(action==='rm'){
    const id=openId;
    closeTask();
    removeTask(id);
    return;
  }

  if(action==='date'){
    const t=tasks.find(x=>x.id===openId);
    if(!t)return;

    openDP(b,t.date,v=>{
      t.date=v;
      save();
      openTask(t.id);
    });
    return;
  }

  if(action==='time'){
    const t=tasks.find(x=>x.id===openId);
    if(!t)return;

    openTP(b,t.time,v=>{
      t.time=v;
      save();
      openTask(t.id);
    });
    return;
  }

  if(action==='when'){
    closeTP();
    closeDP();

    const t=tasks.find(x=>x.id===openId);
    if(!t)return;

    t.date='';
    t.time='';

    save();
    openTask(t.id);
  }
});

$('modal').addEventListener('input',e=>{
  const f=e.target.closest('[data-k]');
  if(!f)return;

  const t=tasks.find(x=>x.id===openId);
  if(!t)return;

  const k=f.dataset.k;

  if(k==='title'){
    if(!f.value.trim())return;
    t.title=f.value;
    const le=log.find(x=>x.id===t.id);
    if(le){
      le.title=t.title;
      saveLog();
    }
  }else{
    t[k]=f.value;
  }

  queueSave();
});

$('modal').addEventListener('focusout',e=>{
  const f=e.target.closest('.et');
  if(!f)return;

  const t=tasks.find(x=>x.id===openId);
  if(!t)return;

  if(!f.value.trim()){
    f.value=t.title;
  }else{
    t.title=f.value.trim();
    f.value=t.title;
    save();
    render();
  }
});

$('modal').addEventListener('keydown',e=>{
  if(e.key==='Enter'&&e.target.classList.contains('et')){
    e.preventDefault();
    e.target.blur();
  }
});

document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    if(mn.el)closeMenu();
    else if(tp.el||dp.el){
      closeTP();
      closeDP();
    }else if(cmOpen())closeCats();
    else if(openId)closeTask();
  }
});

const tipOf=e=>{
  const c=e.target.closest('.cell[data-t]');
  if(c)$('hmtip').textContent=c.dataset.t;
  return !!c;
};

$('hist').addEventListener('mouseover',tipOf);

$('hist').addEventListener('click',e=>{
  if(tipOf(e))return;

  const b=e.target.closest('[data-a]');
  if(!b)return;

  if(b.dataset.a==='hrm'){
    log=log.filter(x=>x.id!==b.dataset.id);
  }else if(b.dataset.a==='hclear'){
    if(!confirm('Clear all completed history?'))return;
    log=[];
  }else{
    return;
  }

  saveLog();
  render();
});

function view(){
  const q=query.trim().toLowerCase(),l=[];

  tasks.forEach((t,i)=>{
    if(['all','today'].indexOf(filter)<0&&t.status!==filter)return;

    if(filter==='today'&&!inToday(t))return;

    if(q&&
      !t.title.toLowerCase().includes(q)&&
      !(t.notes||'').toLowerCase().includes(q)
    )return;

    l.push([t,i]);
  });

  const by={
    newest:(a,b)=>created(b[0])-created(a[0]),
    due:(a,b)=>{
      const x=dueSort(a[0]),y=dueSort(b[0]);
      return x===y?0:x<y?-1:1;
    },
    priority:(a,b)=>
      PRN[b[0].priority||'']-PRN[a[0].priority||''],
    az:(a,b)=>
      a[0].title.localeCompare(b[0].title,undefined,{sensitivity:'base'})
  }[sortBy];

  l.sort((a,b)=>(by?by(a,b):0)||a[1]-b[1]);

  return l.map(x=>x[0]);
}

$('q').addEventListener('input',e=>{
  query=e.target.value;
  $('qx').hidden=!query;
  $('q').closest('.search').classList.toggle('has',!!query);
  render();
});

$('q').addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    $('q').value='';
    query='';
    $('qx').hidden=true;
    $('q').closest('.search').classList.remove('has');
    render();
    $('q').blur();
  }
});

$('qx').onclick=()=>{
  $('q').value='';
  query='';
  $('qx').hidden=true;
  $('q').closest('.search').classList.remove('has');
  render();
  $('q').focus();
};

const mn={el:null,anchor:null};

function closeMenu(){
  if(!mn.el)return;
  const a=mn.anchor;
  mn.el.remove();
  mn.el=null;
  mn.anchor=null;
  if(a)a.setAttribute('aria-expanded','false');
}

function openMenu(anchor,items,sel,pick,o){
  if(mn.el&&mn.anchor===anchor){
    closeMenu();
    return;
  }

  closeMenu();
  closeTP();
  closeDP();

  o=o||{};

  const el=document.createElement('div');
  el.className='mnu';
  el.setAttribute('role','listbox');

  el.innerHTML=items.map((it,i)=>
    it.sep?'<i class="msep" role="separator"></i>':
    '<button type="button" role="option" class="mi'+
    (it.cls?' '+it.cls:'')+
    (it.act?' act':'')+
    (it.v===sel?' on':'')+
    '" data-i="'+i+'" aria-selected="'+(it.v===sel)+'">'+
    '<span>'+esc(it.l)+'</span></button>'
  ).join('');

  const r=anchor.getBoundingClientRect();
  el.style.minWidth=Math.max(190,r.width)+'px';

  document.body.appendChild(el);

  mn.el=el;
  mn.anchor=anchor;
  anchor.setAttribute('aria-expanded','true');

  const w=el.offsetWidth,h=el.offsetHeight;
  let left=o.align==='right'?r.right-w:r.left;
  left=Math.min(Math.max(12,left),Math.max(12,innerWidth-w-12));

  let top=r.bottom+8;
  if(top+h>innerHeight-12){
    const up=r.top-h-8;
    if(up>=12){
      top=up;
      el.style.transformOrigin='bottom';
    }else{
      top=Math.max(12,innerHeight-h-12);
    }
  }

  el.style.left=left+'px';
  el.style.top=top+'px';

  const first=el.querySelector('.mi.on')||el.querySelector('.mi');
  if(first)first.focus({preventScroll:true});

  el.addEventListener('click',e=>{
    const b=e.target.closest('.mi');
    if(!b)return;

    const it=items[+b.dataset.i],a=mn.anchor;
    closeMenu();
    if(a)a.focus({preventScroll:true});
    pick(it.v,it);
  });

  el.addEventListener('mousemove',e=>{
    const b=e.target.closest('.mi');
    if(b&&b!==document.activeElement)b.focus({preventScroll:true});
  });

  el.addEventListener('keydown',e=>{
    const bs=[...el.querySelectorAll('.mi')];
    const i=bs.indexOf(document.activeElement);
    const k=e.key;

    if(k==='ArrowDown'){
      e.preventDefault();
      bs[(i+1)%bs.length].focus();
    }else if(k==='ArrowUp'){
      e.preventDefault();
      bs[(i-1+bs.length)%bs.length].focus();
    }else if(k==='Home'){
      e.preventDefault();
      bs[0].focus();
    }else if(k==='End'){
      e.preventDefault();
      bs[bs.length-1].focus();
    }else if(k==='Tab'){
      closeMenu();
    }else if(k==='Escape'){
      e.preventDefault();
      e.stopPropagation();
      const a=mn.anchor;
      closeMenu();
      if(a)a.focus();
    }
  });
}

const outsideM=e=>{
  if(mn.el&&!mn.el.contains(e.target)&&!mn.anchor.contains(e.target))closeMenu();
};

document.addEventListener('mousedown',outsideM);
document.addEventListener('touchstart',outsideM,{passive:true});
window.addEventListener('resize',closeMenu);

document.addEventListener('scroll',e=>{
  if(mn.el&&!mn.el.contains(e.target))closeMenu();
},true);

const SORTS=[
  ['manual','Manual order'],
  ['newest','Newest first'],
  ['due','Due date'],
  ['priority','Priority'],
  ['az','A to Z']
];

try{
  const s=localStorage.getItem('my-tasks-sort');
  if(SORTS.some(x=>x[0]===s))sortBy=s;
}catch(e){}

const sortLabel=()=>{
  const l=SORTS.find(x=>x[0]===sortBy)[1];
  $('sortlab').textContent=l;
  $('sortbtn').setAttribute('aria-label','Sort tasks: '+l);
};

sortLabel();

$('sortbtn').onclick=()=>openMenu(
  $('sortbtn'),
  SORTS.map(([v,l])=>({v,l})),
  sortBy,
  v=>{
    sortBy=v;
    try{localStorage.setItem('my-tasks-sort',sortBy)}catch(e){}
    sortLabel();
    render();
  },
  {align:'right'}
);

$('prep').onclick=()=>{
  newRep=REP_ORDER[(REP_ORDER.indexOf(newRep)+1)%REP_ORDER.length];
  pills();
};

$('pprio').onclick=()=>{
  newPrio={'':'low',low:'med',med:'high',high:''}[newPrio];
  pills();
};

const snap=withCats=>({
  t:JSON.stringify(tasks),
  l:JSON.stringify(log),
  c:withCats?JSON.stringify(cats):null
});

function hideToast(){
  clearTimeout(undoT);
  undo=null;
  $('toast').hidden=true;
  $('toast').classList.remove('show');
}

function toast(msg,s){
  undo=s;
  $('tmsg').textContent=msg;
  $('tundo').style.display=s?'':'none';

  const el=$('toast');
  el.hidden=false;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');

  clearTimeout(undoT);
  undoT=setTimeout(hideToast,5000);
}

function removeTask(id){
  const s=snap();
  tasks=tasks.filter(x=>x.id!==id);
  save();
  sfx.delete();
  render();
  toast('Mission deleted',s);
}

$('tundo').onclick=()=>{
  if(undo){
    tasks=JSON.parse(undo.t);
    log=JSON.parse(undo.l);
    if(undo.c){
      cats=JSON.parse(undo.c);
      saveCats();
    }
    save();
    saveLog();
    refreshCats();
  }
  hideToast();
};

const clearDone=()=>{
  if(!tasks.some(t=>t.status==='done'))return;

  const s=snap();
  tasks=tasks.filter(t=>t.status!=='done');

  save();
  render();
  toast('Completed tasks cleared',s);
};

let sw=null;
const SWT=80;

$('list').addEventListener('pointerdown',e=>{
  if(e.pointerType!=='touch'||busy)return;

  const it=e.target.closest('.item');
  if(!it||it.classList.contains('dimmed')||e.target.closest('.grip'))return;

  sw={
    it,
    id:e.pointerId,
    x:e.clientX,
    y:e.clientY,
    dx:0,
    on:false,
    w:it.getBoundingClientRect().width,
    box:it.querySelector('.sw'),
    l:it.querySelector('.swl'),
    r:it.querySelector('.swr')
  };
});

$('list').addEventListener('pointermove',e=>{
  if(!sw||e.pointerId!==sw.id)return;

  const dx=e.clientX-sw.x,dy=e.clientY-sw.y;

  if(!sw.on){
    if(Math.abs(dx)<10||Math.abs(dy)>Math.abs(dx))return;
    sw.on=true;
    sw.it.classList.add('swiping');
    try{sw.it.setPointerCapture(e.pointerId)}catch(_){}
  }

  sw.dx=dx;
  sw.box.style.transform='translateX('+dx+'px)';
  sw.l.style.width=Math.max(0,dx)+'px';
  sw.r.style.width=Math.max(0,-dx)+'px';
  sw.it.classList.toggle('arm',Math.abs(dx)>=SWT);
});

function swEnd(e){
  if(!sw||e.pointerId!==sw.id)return;

  const s=sw;
  sw=null;

  if(!s.on)return;

  swiped=true;
  setTimeout(()=>{swiped=false},80);

  s.it.classList.remove('swiping','arm');
  s.it.classList.add('snap');

  const go=e.type==='pointerup'&&Math.abs(s.dx)>=SWT?
    (s.dx>0?'done':'del'):'';

  if(go==='del'){
    s.box.style.transform='translateX('+(-s.w)+'px)';
    s.r.style.width=s.w+'px';
    setTimeout(()=>removeTask(s.it.dataset.id),190);
  }else{
    s.box.style.transform='';
    s.l.style.width='0px';
    s.r.style.width='0px';
    if(go==='done'){
      setTimeout(()=>toggleStatus(s.it.dataset.id,'done',s.it),190);
    }
  }
}

['pointerup','pointercancel'].forEach(t=>
  $('list').addEventListener(t,swEnd)
);

let dr=null;

function reorder(ids){
  const slots=[];
  tasks.forEach((t,i)=>{
    if(ids.includes(t.id))slots.push(i);
  });

  const byId={};
  tasks.forEach(t=>{byId[t.id]=t});

  const next=tasks.slice();

  slots.forEach((s,k)=>{
    next[s]=byId[ids[k]];
  });

  tasks=next;
  save();
}

function dragFrame(){
  if(!dr)return;

  const it=dr.it,list=$('list');
  dr.ty=dr.cy-dr.y0+(scrollY-dr.sy0);
  it.style.transform='translateY('+dr.ty+'px)';

  for(let n=0;n<8;n++){
    const r=it.getBoundingClientRect();
    const c=r.top+r.height/2;
    const p=it.previousElementSibling;
    const nx=it.nextElementSibling;

    let moved=false;

    if(p&&c<p.getBoundingClientRect().top+p.getBoundingClientRect().height/2){
      list.insertBefore(it,p);
      moved=true;
    }else if(nx&&c>nx.getBoundingClientRect().top+nx.getBoundingClientRect().height/2){
      list.insertBefore(nx,it);
      moved=true;
    }

    if(!moved)break;

    it.style.transform='';
    dr.ty=r.top-it.getBoundingClientRect().top;
    dr.y0=dr.cy-dr.ty;
    dr.sy0=scrollY;
    it.style.transform='translateY('+dr.ty+'px)';
  }

  if(dr.cy<70)scrollBy(0,-14);
  else if(dr.cy>innerHeight-70)scrollBy(0,14);

  dr.raf=requestAnimationFrame(dragFrame);
}

$('list').addEventListener('pointerdown',e=>{
  const g=e.target.closest('.grip');

  if(!g||e.button>0||dr||g.closest('.item').classList.contains('dimmed'))return;

  e.preventDefault();

  const it=g.closest('.item');

  dr={
    it,g,
    id:e.pointerId,
    cy:e.clientY,
    y0:e.clientY,
    sy0:scrollY,
    ty:0
  };

  busy=true;
  it.classList.add('dragging');
  $('list').classList.add('sorting');

  try{g.setPointerCapture(e.pointerId)}catch(_){}

  dr.raf=requestAnimationFrame(dragFrame);
});

$('list').addEventListener('pointermove',e=>{
  if(dr&&e.pointerId===dr.id)dr.cy=e.clientY;
});

function dragEnd(e){
  if(!dr||e.pointerId!==dr.id)return;

  const d=dr;
  dr=null;

  cancelAnimationFrame(d.raf);

  d.it.style.transform='';
  d.it.classList.remove('dragging');
  $('list').classList.remove('sorting');

  busy=false;

  if(e.type==='pointerup'){
    reorder([...$('list').children].map(li=>li.dataset.id).filter(Boolean));
  }

  render();
}

['pointerup','pointercancel'].forEach(t=>
  $('list').addEventListener(t,dragEnd)
);

$('list').addEventListener('keydown',e=>{
  const g=e.target.closest&&e.target.closest('.grip');

  if(!g||(e.key!=='ArrowUp'&&e.key!=='ArrowDown'))return;

  e.preventDefault();

  const id=g.closest('.item').dataset.id;
  const ids=view().map(t=>t.id);
  const i=ids.indexOf(id);
  const j=i+(e.key==='ArrowUp'?-1:1);

  if(j<0||j>=ids.length)return;

  [ids[i],ids[j]]=[ids[j],ids[i]];

  reorder(ids);
  render();

  const ng=document.querySelector('.item[data-id="'+id+'"] .grip');
  if(ng)ng.focus();
});

document.addEventListener('keydown',e=>{
  if(e.metaKey||e.ctrlKey||e.altKey||openId||tp.el||dp.el||mn.el||cmOpen()||$('amodal')||$('nmodal'))return;

  const el=e.target;
  if(el.matches&&el.matches('input,textarea,select,[contenteditable]'))return;

  const k=e.key;

  if(k==='n'||k==='N'){
    e.preventDefault();
    $('new').focus();
  }else if(k==='/'){
    e.preventDefault();
    $('q').focus();
  }else if(/^[1-8]$/.test(k)){
    filter=['all','today','todo','prog','done','hist','pomo','ach'][+k-1];
    render();
  }
});

setInterval(()=>{
  if(busy||openId||sw||dr)return;
  if(tasks.filter(isLate).map(t=>t.id).join()!==lateSig)render();
},30000);

let lastDay=dkey(new Date());

function rollDay(){
  if(dr||sw)return;
  lastDay=dkey(new Date());
  pomoDayCheck();
  render();
  updatePomoUI();
}

setInterval(()=>{
  if(dkey(new Date())!==lastDay)rollDay();
},60000);

document.addEventListener('visibilitychange',()=>{
  if(!document.hidden&&dkey(new Date())!==lastDay)rollDay();
});
window.addEventListener('storage',e=>{
  if(e.storageArea!==localStorage)return;
  if(!['my-tasks','my-tasks-log','my-tasks-cats'].includes(e.key))return;
  if(dr||sw)return;

  loadCats();
  load();
  loadLog();
  if(openId&&!tasks.some(t=>t.id===openId))closeTask();
  pills();
  render();
});

const REDUCE=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;

function leave(li,cb){
  if(!li||REDUCE()){
    cb();
    return;
  }

  const gap=getComputedStyle($('list')).rowGap||'14px';

  li.style.height=li.offsetHeight+'px';
  li.style.transition='height .26s ease,opacity .22s ease,padding .26s ease,margin .26s ease,border-width .26s ease';

  void li.offsetHeight;

  li.style.height='0';
  li.style.opacity='0';
  li.style.paddingTop='0';
  li.style.paddingBottom='0';
  li.style.borderWidth='0';
  li.style.marginBottom='-'+gap;

  setTimeout(cb,270);
}

function toggleStatus(id,a,el){
  const t=tasks.find(x=>x.id===id);
  if(!t)return;

  const to=t.status===a?'todo':a;
  const li=document.querySelector('.item[data-id="'+id+'"]');

  const before=snap();
  const apply=()=>{
    const wasDone=(t.status==='done');
    t.status=to;
    syncLog(t);

    let nextNote='';
    if(to==='done'&&!wasDone&&t.repeat&&!(t.spawned&&tasks.some(x=>x.id===t.spawned))){
      const nt={
        id:uid('t'),
        created:Date.now(),
        title:t.title,
        date:nextDue(t.date,t.repeat),
        time:t.time||'',
        priority:t.priority||'',
        cat:t.cat||'',
        notes:t.notes||'',
        repeat:t.repeat,
        status:'todo'
      };
      t.spawned=nt.id;
      tasks.splice(tasks.indexOf(t)+1,0,nt);
      nextNote=' Next: '+fmtDate(nt.date)+'.';
    }

    save();

    if(to==='done'&&!wasDone){
      sfx.complete();
      toast(CELEBRATIONS[Math.floor(Math.random()*CELEBRATIONS.length)]+nextNote,before);
      if(focusId===id)focusId=null;
    }

    justId=to==='done'?id:'';
    render();
    setTimeout(()=>{justId=''},800);

    if(to==='done'&&tasks.length&&tasks.every(x=>x.status==='done')){
      sfx.pomo();
      toast("That's the list. Enjoy the rest of the day.",before);
    }
  };

  if(li&&filter!=='all'&&filter!==to){
    leave(li,apply);
  }else{
    apply();
  }
}

$('pcat').onclick=()=>{
  const items=[
    {v:'',l:'No category'}
  ].concat(
    cats.map(c=>({v:c.id,l:c.name})),
    [{sep:1},{v:'__edit',l:'Edit categories…',act:1}]
  );

  openMenu($('pcat'),items,newCat,(v,it)=>{
    if(it.act){
      openCats();
      return;
    }
    newCat=v;
    pills();
  });
};

const cmOpen=()=>!!$('cmodal').innerHTML;

const cmList=()=>cats.length?cats.map(c=>{
  const k=tasks.filter(t=>t.cat===c.id).length;
  const op=ccOpen===c.id;

  return '<div class="crow'+(op?' open':'')+'" data-id="'+esc(c.id)+'"><div class="chead">'+
    '<input class="cname" maxlength="20" value="'+esc(c.name)+'" aria-label="Category name">'+
    '<span class="ccount">'+k+(k===1?' task':' tasks')+'</span>'+
    '<button type="button" class="cdel" data-a="cdel" aria-label="Delete '+esc(c.name)+'">Delete</button></div>'+
    '</div>';
}).join(''):'<p class="cempty">No categories yet. Add your first one below.</p>';

const cmHTML=()=>'<div class="backdrop" data-a="cclose"><div class="editor cman pop" role="dialog" aria-modal="true" aria-label="Edit categories">'+
  '<div class="ehead"><h2>Categories</h2><button class="x" data-a="cclose" aria-label="Close">&times;</button></div>'+
  '<p class="chint">Create your own categories.</p>'+
  '<div class="clist" id="clist">'+cmList()+'</div>'+
  '<div class="cnew"><input id="cnew" maxlength="20" placeholder="New category name..." aria-label="New category name"><button type="button" class="close" data-a="cadd">Add</button></div>'+
  '</div></div>';

function syncCatViews(){
  pills();
  render();

  const m=$('mcat');
  const t=openId&&tasks.find(x=>x.id===openId);
  if(m&&t)m.innerHTML=catField(t);
}

function refreshCats(){
  syncCatViews();
  const l=$('clist');
  if(l)l.innerHTML=cmList();
}

function openCats(){
  closeMenu();
  closeTP();
  closeDP();

  catsFrom=document.activeElement;

  $('cmodal').innerHTML=cmHTML();
  document.body.classList.add('lock');
  syncInert();

  const i=$('cnew');
  if(i)i.focus();
}

function closeCats(){
  $('cmodal').innerHTML='';
  ccOpen='';
  syncInert();

  if(!openId)document.body.classList.remove('lock');

  if(catsFrom&&catsFrom.isConnected)catsFrom.focus();
  catsFrom=null;
}

function addCat(){
  const i=$('cnew');
  const v=i.value.trim();

  if(!v){
    i.focus();
    return;
  }

  cats.push({
    id:'c'+Date.now().toString(36),
    name:v
  });

  i.value='';
  saveCats();
  refreshCats();

  const l=$('clist');
  l.scrollTop=l.scrollHeight;
  i.focus();
}

$('cmodal').addEventListener('click',e=>{
  const b=e.target.closest('[data-a]');
  if(!b)return;

  const a=b.dataset.a;

  if(a==='cclose'){
    if(b.classList.contains('backdrop')&&e.target!==b)return;
    closeCats();
    return;
  }

  if(a==='cadd'){
    addCat();
    return;
  }

  const row=b.closest('.crow');
  const c=row&&catOf(row.dataset.id);

  if(!c)return;

  if(a==='cdel'){
    const s=snap(true);

    cats=cats.filter(x=>x.id!==c.id);
    tasks.forEach(t=>{
      if(t.cat===c.id)t.cat='';
    });

    if(newCat===c.id)newCat='';
    if(ccOpen===c.id)ccOpen='';

    saveCats();
    save();
    refreshCats();
    toast('Category deleted',s);
  }
});

$('cmodal').addEventListener('input',e=>{
  const i=e.target.closest('.cname');
  if(!i)return;

  const c=catOf(i.closest('.crow').dataset.id);
  const v=i.value.trim();

  if(!c||!v)return;

  c.name=v;
  saveCats();
  syncCatViews();
});

$('cmodal').addEventListener('focusout',e=>{
  const i=e.target.closest('.cname');
  if(!i)return;

  const c=catOf(i.closest('.crow').dataset.id);
  if(c&&!i.value.trim())i.value=c.name;
});

$('cmodal').addEventListener('keydown',e=>{
  if(e.key!=='Enter')return;

  if(e.target.id==='cnew'){
    e.preventDefault();
    addCat();
  }else if(e.target.classList.contains('cname')){
    e.target.blur();
  }
});

const ACC=['forest','ocean','sunset','candy'];
const LEGACY={green:'forest',blue:'ocean',purple:'candy',pink:'candy'};
const mq=matchMedia('(prefers-color-scheme: dark)');

let themePref='auto',accent='forest';

try{
  themePref=localStorage.getItem('my-tasks-theme')||'auto';
  accent=localStorage.getItem('my-tasks-accent')||'forest';
}catch(e){}

if(!['auto','light','dark'].includes(themePref))themePref='auto';

accent=LEGACY[accent]||accent;
if(!ACC.includes(accent))accent='forest';

function applyTheme(){
  const d=document.documentElement;

  d.dataset.theme=themePref==='auto'?
    (mq.matches?'dark':'light'):themePref;

  d.dataset.accent=accent;

  try{
    const meta=document.querySelector('meta[name="theme-color"]');
    const c=getComputedStyle(d).getPropertyValue('--page').trim();
    if(meta&&c)meta.setAttribute('content',c);
  }catch(e){}

  document.querySelectorAll('#apop [data-theme-pref]').forEach(b=>{
    const on=b.dataset.themePref===themePref;
    b.classList.toggle('on',on);
    b.setAttribute('aria-pressed',on);
  });

  document.querySelectorAll('#apop [data-acc]').forEach(b=>{
    const on=b.dataset.acc===accent;
    b.classList.toggle('on',on);
    b.setAttribute('aria-pressed',on);
  });
}

if(mq.addEventListener){
  mq.addEventListener('change',()=>{
    if(themePref==='auto')applyTheme();
  });
}

$('abtn').onclick=()=>{
  const open=$('apop').hidden;
  $('apop').hidden=!open;
  $('abtn').setAttribute('aria-expanded',open);
};

$('apop').addEventListener('click',e=>{
  const b=e.target.closest('button');
  if(!b)return;

  if(b.dataset.themePref){
    themePref=b.dataset.themePref;
    try{localStorage.setItem('my-tasks-theme',themePref)}catch(_){}
  }

  if(b.dataset.acc){
    accent=b.dataset.acc;
    try{localStorage.setItem('my-tasks-accent',accent)}catch(_){}
  }

  applyTheme();
});

const outsideA=e=>{
  if(!$('apop').hidden&&!$('apop').contains(e.target)&&!$('abtn').contains(e.target)){
    $('apop').hidden=true;
    $('abtn').setAttribute('aria-expanded','false');
  }
};

document.addEventListener('mousedown',outsideA);
document.addEventListener('touchstart',outsideA,{passive:true});

document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&!$('apop').hidden){
    $('apop').hidden=true;
    $('abtn').setAttribute('aria-expanded','false');
    $('abtn').focus();
  }
});

applyTheme();
loadCats();
load();
loadLog();
loadPomoStats();
loadPomoTotals();
loadAch();
checkAch(true);
achReady=true;
restorePomo();
render();
updatePomoUI();
if(nameGet()===null)openName(true);

$('pomoStart')&&$('pomoStart').addEventListener('click',()=>{
  try{
    if(!pomo.running&&'Notification' in window&&Notification.permission==='default'){
      const p=Notification.requestPermission();
      if(p&&p.catch)p.catch(()=>{});
    }
  }catch(e){}
  startPomo();
});
$('pomoReset')&&$('pomoReset').addEventListener('click',()=>resetPomo());
document.querySelectorAll('.pomo-mode').forEach(b=>{
  b.addEventListener('click',()=>resetPomo(+b.dataset.mins,b.dataset.label));
});

const applyCustomPomo=()=>{
  const input=$('pomoCustom');
  if(!input)return;
  const mins=Math.round(parseFloat(input.value));
  if(!mins||mins<1||mins>180){
    toast('Enter 1–180 minutes');
    input.focus();
    return;
  }
  resetPomo(mins,'Custom');
  document.querySelectorAll('.pomo-mode').forEach(b=>b.classList.remove('on'));
  toast('Timer set to '+mins+' min');
};

$('pomoSetCustom')&&$('pomoSetCustom').addEventListener('click',applyCustomPomo);
$('pomoCustom')&&$('pomoCustom').addEventListener('keydown',e=>{
  if(e.key==='Enter'){e.preventDefault();applyCustomPomo()}
});

['pointerdown','keydown'].forEach(ev=>document.addEventListener(ev,()=>ensureAudio(),{once:true,passive:true}));

(()=>{
  let ok=true;
  try{
    localStorage.setItem('my-tasks-test','1');
    localStorage.removeItem('my-tasks-test');
  }catch(e){
    ok=false;
  }

  const f=document.querySelector('.foot');
  if(!ok&&f){
    f.textContent='Saving is blocked in this browser, so tasks will be lost when you close the page.';
  }

  try{
    if(ok&&navigator.storage&&navigator.storage.persist){
      navigator.storage.persist();
    }
  }catch(e){}
})();

function downloadBlob(name,content,type){
  const blob=new Blob([content],{type});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');

  a.href=url;
  a.download=name;
  a.click();

  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function parseCSV(text){
  text=text.replace(/^\ufeff/,'');
  const rows=[];
  let row=[],f='',q=false;

  for(let i=0;i<text.length;i++){
    const c=text[i];

    if(q){
      if(c==='"'){
        if(text[i+1]==='"'){f+='"';i++}
        else q=false;
      }else f+=c;
    }else if(c==='"'){
      q=true;
    }else if(c===','){
      row.push(f);f='';
    }else if(c==='\n'||c==='\r'){
      if(c==='\r'&&text[i+1]==='\n')i++;
      row.push(f);f='';
      if(row.some(x=>x!==''))rows.push(row);
      row=[];
    }else f+=c;
  }

  row.push(f);
  if(row.some(x=>x!==''))rows.push(row);
  return rows;
}

function exportData(format){
  if(format==='csv'){
    const cols=['title','date','time','status','priority','category','notes','repeat'];
    const q=v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"';

    const csv=[
      cols.join(','),
      ...tasks.map(t=>{
        const c=catOf(t.cat);
        return cols.map(k=>q(k==='category'?(c?c.name:''):t[k])).join(',');
      })
    ].join('\r\n');
    downloadBlob(
      'my-tasks-'+dkey(new Date())+'.csv',
      '\ufeff'+csv,
      'text/csv;charset=utf-8'
    );
  }else{
    const payload={
      version:1,
      exportedAt:new Date().toISOString(),
      tasks,
      categories:cats,
      history:log
    };

    downloadBlob(
      'my-tasks-backup-'+dkey(new Date())+'.json',
      JSON.stringify(payload,null,2),
      'application/json'
    );
  }
}

const REM_KEY='my-tasks-remind';
let remindOn=false;
try{remindOn=localStorage.getItem(REM_KEY)==='1'}catch(e){}

const remindDue=t=>{
  if(t.status==='done'||!t.time)return null;
  const[y,m,d]=(t.date||dkey(new Date())).split('-').map(Number);
  const hm=t.time.split(':').map(Number);
  return new Date(y,m-1,d,hm[0],hm[1]).getTime();
};

function notifyDue(list){
  const one=list.length===1;
  const title=one?list[0].title:list.length+' tasks are due';
  toast(one?'Due now: '+list[0].title:list.length+' tasks are due now');
  if(!document.hidden||!('Notification' in window)||Notification.permission!=='granted')return;
  const opts={
    body:one?'Due '+fmtTime(list[0].time):list.slice(0,3).map(t=>t.title).join(', '),
    tag:'my-tasks-due',
    icon:'icon-192.png'
  };
  const fallback=()=>{try{new Notification(title,opts)}catch(e){}};
  if(navigator.serviceWorker&&navigator.serviceWorker.getRegistration){
    navigator.serviceWorker.getRegistration()
      .then(r=>r?r.showNotification(title,opts):fallback())
      .catch(fallback);
  }else{
    fallback();
  }
}

function checkReminders(){
  if(!remindOn)return;
  const now=Date.now(),fresh=[];
  let changed=false;
  tasks.forEach(t=>{
    const due=remindDue(t);
    if(due===null||due>now||t.reminded===due)return;
    t.reminded=due;
    changed=true;
    if(now-due<=15*60000)fresh.push(t);
  });
  if(changed)save();
  if(fresh.length)notifyDue(fresh);
}

function toggleRemind(){
  if(remindOn){
    remindOn=false;
    try{localStorage.setItem(REM_KEY,'0')}catch(e){}
    toast('Reminders off');
    return;
  }
  remindOn=true;
  try{localStorage.setItem(REM_KEY,'1')}catch(e){}
  const done=p=>{
    toast(p==='granted'?
      'Reminders on. You will be alerted when a timed task is due.':
      'Reminders on inside the app. Allow notifications to also get alerts when this tab is hidden.');
    checkReminders();
  };
  if(!('Notification' in window)){
    done('unsupported');
    return;
  }
  Promise.resolve(Notification.requestPermission()).then(done,()=>done('denied'));
}

setInterval(checkReminders,20000);

document.addEventListener('visibilitychange',()=>{
  if(!document.hidden)checkReminders();
});

let installEv=null;

window.addEventListener('beforeinstallprompt',e=>{
  e.preventDefault();
  installEv=e;
});

window.addEventListener('appinstalled',()=>{
  installEv=null;
  toast('App installed');
});

function installApp(){
  if(!installEv)return;
  const ev=installEv;
  installEv=null;
  ev.prompt();
}

$('moreBtn').addEventListener('click',()=>{
  openMenu(
    $('moreBtn'),
    [
      {v:'json',l:'Export backup (JSON)'},
      {v:'csv',l:'Export spreadsheet (CSV)'},
      {sep:1},
      {v:'import',l:'Import tasks…'},
      {v:'clear',l:'Clear completed'},
      {sep:1},
      {v:'remind',l:remindOn?'Turn off reminders':'Turn on reminders'}
    ].concat(
      installEv?[{v:'install',l:'Install app'}]:[],
      [{sep:1},{v:'name',l:'Change name…'}]
    ),
    '',
    v=>{
      if(v==='import')$('importFile').click();
      else if(v==='clear')clearDone();
      else if(v==='name')openName(false,$('moreBtn'));
      else if(v==='remind')toggleRemind();
      else if(v==='install')installApp();
      else exportData(v);
    },
    {align:'right'}
  );
});

$('importFile').addEventListener('change',async e=>{
  const f=e.target.files&&e.target.files[0];
  if(!f)return;

  try{
    const raw=await f.text();
    let data;

    if(f.name.toLowerCase().endsWith('.csv')){
      const rows=parseCSV(raw);
      if(!rows.length)throw new Error('This CSV file is empty.');

      const head=rows.shift().map(x=>x.trim().toLowerCase());
      const ix=k=>head.indexOf(k);
      const get=(r,k)=>ix(k)<0?'':(r[ix(k)]||'');

      data={
        tasks:rows.map(r=>({
          title:get(r,'title'),
          date:get(r,'date'),
          time:get(r,'time'),
          status:get(r,'status')||'todo',
          priority:get(r,'priority'),
          repeat:get(r,'repeat'),
          notes:get(r,'notes'),
          _cat:get(r,'category').trim()
        }))
      };
    }else{
      data=JSON.parse(raw);
    }

    const incoming=Array.isArray(data)?data:data&&data.tasks;

    if(!Array.isArray(incoming)||!incoming.every(t=>t&&typeof t.title==='string')){
      throw new Error('This file does not contain a valid task list.');
    }

    if(!confirm(
      'Import '+incoming.length+' tasks? This replaces the tasks currently saved in this browser (you can undo right after).'
    ))return;

    const before=snap(true);
    if(data&&Array.isArray(data.categories)){
      cats=data.categories
        .filter(c=>c&&typeof c.name==='string'&&typeof c.id==='string')
        .map(c=>({id:cleanId(c.id,uid('c')),name:c.name.slice(0,20)}));
    }
    const seen=new Set(),idMap={};

    tasks=incoming.map(t=>{
      let id=cleanId(t.id,uid('imp'));
      while(seen.has(id))id=uid('imp');
      seen.add(id);
      idMap[String(t.id)]=id;

      let cat=typeof t.cat==='string'?t.cat:'';
      if(t._cat){
        let c=cats.find(x=>x.name.toLowerCase()===t._cat.toLowerCase());
        if(!c){
          c={id:uid('c'),name:t._cat.slice(0,20)};
          cats.push(c);
        }
        cat=c.id;
      }
      if(!cats.some(x=>x.id===cat))cat='';

      const out={
        id,
        created:+t.created||Date.now(),
        title:String(t.title).slice(0,500),
        date:cleanDate(t.date),
        time:cleanTime(t.time),
        priority:cleanPrio(t.priority),
        repeat:cleanRep(t.repeat),
        cat,
        notes:typeof t.notes==='string'?t.notes:'',
        status:['todo','prog','done'].includes(t.status)?t.status:'todo'
      };
      if(+t.doneAt)out.doneAt=+t.doneAt;
      return out;
    });

    saveCats();

    if(data&&Array.isArray(data.history)){
      log=data.history
        .filter(x=>x&&typeof x.title==='string')
        .map(x=>({
          id:idMap[String(x.id)]||cleanId(x.id,uid('h')),
          title:x.title,
          at:+x.at||Date.now()
        }));
    }else{
      log=tasks.filter(t=>t.status==='done').map(t=>({
        id:t.id,
        title:t.title,
        at:t.doneAt||Date.now()
      }));
    }
    saveLog();

    save();
    filter='all';
    refreshCats();
    toast('Imported '+tasks.length+' tasks',before);
  }catch(err){
    alert('Could not import this file: '+err.message);
  }

  e.target.value='';
});

if('serviceWorker' in navigator&&location.protocol!=='file:'){
  const hadController=!!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(hadController)$('upd').hidden=false;
  });
  window.addEventListener('load',()=>{
    navigator.serviceWorker.register('./sw.js').then(reg=>{
      document.addEventListener('visibilitychange',()=>{
        if(!document.hidden)reg.update().catch(()=>{});
      });
    }).catch(()=>{});
  });
}

$('updgo').addEventListener('click',()=>location.reload());
$('updx').addEventListener('click',()=>{
  $('upd').hidden=true;
});

try{
  if(navigator.storage&&navigator.storage.persist)navigator.storage.persist().catch(()=>{});
}catch(e){}

checkReminders();

try{
  if(new URLSearchParams(location.search).get('new')==='1'){
    window.addEventListener('load',()=>{const n=$('new');if(n)n.focus()});
  }
}catch(e){}