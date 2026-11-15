(()=>{
const $=s=>document.getElementById(s);
const F=window.Feedback, QN=window.Questions;
const SUB={zh:["— 誇誇團 —","收進你的森林了","＋1 道光"],en:["— your cheer squad —","Kept safe in your forest","+1 ray of light"]};
const STAGES=["迷霧叢林","林間微光","小徑初現","豁然開朗","柳暗花明"];
const CONGRATS=["","霧氣散開了，林間透進第一道光","腳下浮現一條小徑，繼續走吧","樹叢後面，是一整片開闊的天空","柳暗花明又一村——你走出來了"];
const CAT_ZH={business:"商業",mood:"心情",general:"靈感",extension:"延伸"};
const TH_REAL=[0,5,15,30,50], TH_TEST=[0,1,2,3,4];
const STREAK_GAP=180000, SUMMARY_IDLE=20000;
const K="boyun.v1";
const reduceMotion=matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- state + migration ----------
let st=JSON.parse(localStorage.getItem(K)||"null")||{};
function migrate(s){
  s.ideas=Array.isArray(s.ideas)?s.ideas:[];
  if(!s.v||s.v<2){
    s.ideas=s.ideas.map((x,i)=>({id:x.id||("i"+(x.at||Date.now())+"_"+i),t:x.t||"",at:x.at||Date.now(),p:x.p||null,lang:x.lang||F.detectLang(x.t||""),cat:x.cat||F.detectCategory(x.t||"").cat}));
    if(s.rain===undefined) s.rain=!!s.shower; delete s.shower;
    if(s.pad===undefined) s.pad=true;
    s.v=2;
  }
  if(s.v<3){
    const byId={};s.ideas.forEach(x=>byId[x.id]=x);
    const lv=x=>{let d=0,c=x;while(c.p&&byId[c.p]&&d<20){c=byId[c.p];d++;}return [d,c.id];};
    s.ideas.forEach(x=>{const [d,r]=lv(x);x.lvl=d;x.root=r;if(x.q===undefined)x.q=null;});
    if(s.bonus===undefined)s.bonus=0; if(s.follow===undefined)s.follow=true; s.v=3;
  }
  s.bonus=s.bonus|0; s.follow=s.follow!==false;
  s.test=!!s.test; s.amb=!!s.amb; s.rain=!!s.rain; s.pad=s.pad!==false;
  return s;
}
st=migrate(st);
const persist=()=>localStorage.setItem(K,JSON.stringify(st));
persist();
const th=()=>st.test?TH_TEST:TH_REAL;
const total=()=>st.ideas.length+st.bonus;
const stageOf=n=>{const t=th();let s=0;for(let i=0;i<5;i++)if(n>=t[i])s=i;return s;};
let shown=stageOf(total());
for(let i=1;i<=5;i++){const im=new Image();im.src=`a/s${i}.jpg`;}

// ---------- background ----------
let front=$("bgA"),back=$("bgB");
function setBg(s,instant){
  back.style.backgroundImage=`url(a/s${s+1}.jpg)`;
  if(instant){back.style.transition="none";front.style.transition="none";}
  back.classList.add("on");front.classList.remove("on");
  [front,back]=[back,front];
  if(instant)requestAnimationFrame(()=>{front.style.transition="";back.style.transition="";});
  $("mist").style.opacity=String(1-s*0.22);
}
function renderTop(){
  const d=$("dots");d.innerHTML="";
  for(let i=0;i<5;i++){const e=document.createElement("span");e.className="dot"+(i<shown?" done":"")+(i===shown?" cur":"");d.appendChild(e);}
  const n=total(),t=th(),next=t[shown+1];
  $("stageName").innerHTML=`${STAGES[shown]}<span class="count">${st.ideas.length} 個點子${st.bonus?` · ✦${st.bonus}`:""}${next!==undefined&&stageOf(n)===shown?` · 再 ${next-n} 步看見新風景`:""}</span>`;
  $("badge").classList.toggle("on",st.test);
}
setBg(shown,true);renderTop();

// ---------- audio (Web Audio, gapless loops, fades) ----------
const AC=window.AudioContext||window.webkitAudioContext;
let ctx=null,master=null;const bufs={},loading={},tracks={};
function ensureCtx(){
  if(!AC)return null;
  if(!ctx){ctx=new AC();master=ctx.createGain();master.gain.value=1;master.connect(ctx.destination);
    const b=ctx.createBuffer(1,1,22050),s=ctx.createBufferSource();s.buffer=b;s.connect(ctx.destination);s.start(0);}
  if(ctx.state!=="running")ctx.resume().catch(()=>{});
  return ctx;
}
function load(name){
  if(bufs[name])return Promise.resolve(bufs[name]);
  if(loading[name])return loading[name];
  return loading[name]=fetch(`a/${name}.mp3`).then(r=>r.arrayBuffer()).then(ab=>new Promise((res,rej)=>ctx.decodeAudioData(ab,res,rej))).then(b=>(bufs[name]=b));
}
function fadeTo(g,v,sec){const now=ctx.currentTime;g.gain.cancelScheduledValues(now);g.gain.setValueAtTime(g.gain.value,now);g.gain.linearRampToValueAtTime(v,now+sec);}
function setLoop(name,vol,sec){
  if(!ctx)return;sec=sec||2.5;
  let t=tracks[name];
  if(vol>0){
    if(t){fadeTo(t.g,vol,sec);t.want=vol;return;}
    tracks[name]=t={want:vol,g:ctx.createGain(),src:null};t.g.gain.value=0;t.g.connect(master);
    load(name).then(b=>{
      if(tracks[name]!==t)return;
      const src=ctx.createBufferSource();src.buffer=b;src.loop=true;
      // skip mp3 encoder padding at both ends for a gapless seam
      src.loopStart=0.05;src.loopEnd=b.duration-0.05;src.connect(t.g);src.start(0,0.05);t.src=src;
      fadeTo(t.g,t.want,sec);
    }).catch(()=>{});
  }else if(t){
    delete tracks[name];fadeTo(t.g,0,sec);
    setTimeout(()=>{try{t.src&&t.src.stop();}catch(e){}t.g.disconnect();},sec*1000+200);
  }
}
function sfx(name,vol){
  if(!ensureCtx())return;
  load(name).then(b=>{const s=ctx.createBufferSource(),g=ctx.createGain();g.gain.value=vol||.8;s.buffer=b;s.connect(g);g.connect(master);s.start();}).catch(()=>{});
}
let unlocked=false;
function unlock(){if(unlocked)return;unlocked=true;ensureCtx();["sfx_idea_saved","sfx_stage_up"].forEach(n=>load(n).catch(()=>{}));syncAudio();}
document.addEventListener("touchend",unlock,{passive:true});document.addEventListener("click",unlock);
document.addEventListener("visibilitychange",()=>{if(!ctx)return;if(document.hidden)ctx.suspend();else ctx.resume();});
function syncAudio(){
  if(ctx){
    const forest=st.amb?(st.rain?.18:.5):0;
    setLoop("ambience_misty_jungle",shown<=2?forest:0,3);
    setLoop("ambience_meadow",shown>2?forest:0,3);
    setLoop("rain_layered",st.rain?.8:0,2.5);
    setLoop("pad_ethereal",st.pad&&(st.rain||st.amb)?(st.rain?.28:.18):0,4);
  }
  $("btnSound").classList.toggle("on",st.amb);$("btnRain").classList.toggle("on",st.rain);
  $("sndIcon").innerHTML=st.amb?'<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12"/>':'<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l5 6M22 9l-5 6"/>';
  $("swAmb").classList.toggle("on",st.amb);$("swRain").classList.toggle("on",st.rain);$("swPad").classList.toggle("on",st.pad);$("swTest").classList.toggle("on",st.test);$("swFollow").classList.toggle("on",st.follow);
}

// ---------- rain visuals ----------
const app=$("app"),rc=$("rainCv"),gc=$("glassCv"),rx=rc.getContext("2d"),gx=gc.getContext("2d");
let W=0,H=0,DPR=1,drops=[],beads=[],sliders=[],rafId=0,rainVisible=false,lastT=0;
const sprite=document.createElement("canvas");sprite.width=sprite.height=48;
(()=>{const c=sprite.getContext("2d");const g=c.createRadialGradient(20,18,2,24,24,22);
  g.addColorStop(0,"rgba(255,255,255,.75)");g.addColorStop(.35,"rgba(210,225,235,.25)");g.addColorStop(.8,"rgba(30,45,55,.35)");g.addColorStop(1,"rgba(0,0,0,0)");
  c.fillStyle=g;c.beginPath();c.arc(24,24,22,0,Math.PI*2);c.fill();
  c.fillStyle="rgba(255,255,255,.85)";c.beginPath();c.ellipse(18,15,4,2.5,-.6,0,Math.PI*2);c.fill();
})();
function sizeFx(){
  DPR=Math.min(devicePixelRatio||1,2);W=innerWidth;H=innerHeight;
  for(const c of [rc,gc]){c.width=W*DPR;c.height=H*DPR;}
  rx.setTransform(DPR,0,0,DPR,0,0);gx.setTransform(DPR,0,0,DPR,0,0);
  const n=Math.min(220,Math.round(W*H/2600));
  drops=Array.from({length:n},()=>newDrop(true));
  beads=Array.from({length:Math.round(W*H/5000)},()=>({x:Math.random()*W,y:Math.random()*H,r:1.5+Math.random()*4}));
  sliders=Array.from({length:7},()=>newSlider(true));
  drawGlass();
}
function newDrop(any){const z=Math.random();return{x:Math.random()*(W+60)-30,y:any?Math.random()*H:-30-Math.random()*H*.3,l:10+z*22,v:600+z*900,a:.12+z*.3};}
function newSlider(any){return{x:Math.random()*W,y:any?Math.random()*H*.7:-10,r:3.5+Math.random()*3.5,v:0,pause:Math.random()*2,trail:[]};}
function drawGlass(){
  gx.clearRect(0,0,W,H);
  for(const b of beads)gx.drawImage(sprite,b.x-b.r,b.y-b.r,b.r*2,b.r*2.15);
  for(const s of sliders){
    for(const t of s.trail){gx.globalAlpha=t.a;gx.drawImage(sprite,t.x-t.r,t.y-t.r,t.r*2,t.r*2);}
    gx.globalAlpha=1;gx.drawImage(sprite,s.x-s.r,s.y-s.r*1.2,s.r*2,s.r*2.5);
  }
  gx.globalAlpha=1;
}
function frame(t){
  const dt=Math.min(.05,(t-(lastT||t))/1000);lastT=t;
  rx.clearRect(0,0,W,H);
  const wind=.18;
  rx.lineCap="round";
  for(let pass=0;pass<2;pass++){
    rx.beginPath();rx.lineWidth=pass?1.4:.8;rx.strokeStyle=pass?"rgba(225,235,245,.38)":"rgba(210,222,235,.22)";
    for(const d of drops){
      if((d.a>.27)!==!!pass)continue;
      rx.moveTo(d.x,d.y);rx.lineTo(d.x-d.l*wind,d.y+d.l);
    }
    rx.stroke();
  }
  for(const d of drops){d.y+=d.v*dt;d.x-=d.v*dt*wind;if(d.y>H+30||d.x<-40)Object.assign(d,newDrop(false));}
  for(const s of sliders){
    if(s.pause>0){s.pause-=dt;}else{s.v=Math.min(s.v+dt*140,90+s.r*12);s.y+=s.v*dt;s.x+=Math.sin(s.y*.05)*.15;
      if(Math.random()<dt*1.5){s.pause=.2+Math.random()*1.2;s.v=0;}
      if(Math.random()<dt*10)s.trail.push({x:s.x+(Math.random()-.5)*2,y:s.y-s.r,r:.8+Math.random()*1.4,a:.9});}
    for(const tr of s.trail)tr.a-=dt*.12;s.trail=s.trail.filter(tr=>tr.a>0);
    if(s.y>H+20)Object.assign(s,newSlider(false));
  }
  drawGlass();
  if(rainVisible)rafId=requestAnimationFrame(frame);else rafId=0;
}
let stopTimer;
function setRainFx(on,instant){
  clearTimeout(stopTimer);
  if(on){
    if(!W)sizeFx();
    if(instant){for(const c of [rc,gc,...document.querySelectorAll(".bg")])c.style.transition="none";requestAnimationFrame(()=>requestAnimationFrame(()=>{for(const c of [rc,gc,...document.querySelectorAll(".bg")])c.style.transition="";}));}
    app.classList.add("raining");rainVisible=true;
    if(reduceMotion){drawGlass();}else if(!rafId){lastT=0;rafId=requestAnimationFrame(frame);}
  }else{
    app.classList.remove("raining");
    stopTimer=setTimeout(()=>{rainVisible=false;},2100); // keep animating while it fades out (放晴)
  }
}
addEventListener("resize",()=>{if(W){sizeFx();}});
window.__fx={get running(){return !!rafId},get drops(){return drops.length},get beads(){return beads.length}};

function setRain(on){st.rain=on;persist();unlock();setRainFx(on);syncAudio();}
$("btnRain").onclick=()=>setRain(!st.rain);
$("swRain").onclick=()=>setRain(!st.rain);
$("btnSound").onclick=()=>{unlock();st.amb=!st.amb;persist();syncAudio();};
$("swAmb").onclick=()=>{unlock();st.amb=!st.amb;persist();syncAudio();};
$("swPad").onclick=()=>{unlock();st.pad=!st.pad;persist();syncAudio();};
$("swFollow").onclick=()=>{st.follow=!st.follow;persist();syncAudio();if(!st.follow)hideCard();};
$("swTest").onclick=()=>{st.test=!st.test;persist();shown=stageOf(total());setBg(shown);renderTop();syncAudio();};
syncAudio();
if(st.rain)setRainFx(true,true);

// ---------- input ----------
const ta=$("ta"),save=$("save");let lastInput=0;
const fit=()=>{ta.style.height="auto";ta.style.height=Math.min(ta.scrollHeight,innerHeight*.4)+"px";save.disabled=!ta.value.trim();};
ta.addEventListener("input",()=>{fit();lastInput=Date.now();});
setTimeout(()=>ta.focus(),300);
save.onclick=commit;
let sy=null;
$("card").addEventListener("touchstart",e=>{sy=e.touches[0].clientY;},{passive:true});
$("card").addEventListener("touchmove",e=>{if(sy===null||!ta.value.trim())return;const dy=sy-e.touches[0].clientY;if(dy>0)$("composer").style.transform=`translateY(${-Math.min(dy,80)*.5}px)`;},{passive:true});
$("card").addEventListener("touchend",e=>{if(sy===null)return;const dy=sy-e.changedTouches[0].clientY;$("composer").style.transform="";sy=null;if(dy>70&&ta.value.trim())commit();});

// ---------- context (what the next save attaches to) ----------
// cx: null | {kind:'follow'|'manual'|'starter', parent, q}
var cx=null;
const byId=id=>st.ideas.find(x=>x.id===id);
function setCx(c){
  cx=c;
  $("ext").classList.toggle("on",!!c);
  let label="";
  if(c){ if(c.kind==="manual"){const p=byId(c.parent);label="↳ 延伸：「"+(p?p.t.slice(0,22)+(p.t.length>22?"…":""):"")+"」";}
         else label=(c.kind==="starter"?"✎ ":"↳ ")+c.q; }
  $("extTxt").textContent=label;
  ta.placeholder=c?(c.kind==="manual"?"往下挖一層，還想到什麼？":"想到什麼就寫什麼，一句也好"):"有什麼點子冒出來了？";
  updateStarter();
}
function setExt(idea){setCx(idea?{kind:"manual",parent:idea.id,q:null}:null);if(idea){hideCard();setTimeout(()=>ta.focus(),350);}}
$("extX").onclick=()=>{
  const c=cx;setCx(null);
  if(c&&c.kind==="follow"&&card0){card=card0;card.minimized=false;dismissCard();}  // detaching counts as a dismiss
};

// ---------- follow-up / starter card ----------
var card=null,card0=null;const dismissed={};
const qc=$("qcard");
function renderCard(){
  if(!card){qc.classList.remove("show","mini");return;}
  const en=card.lang==="en";
  $("qLabel").textContent=card.minimized?(en?"Keep digging ›":"繼續挖 ›"):card.kind==="starter"?(en?"Prompt":"給你一個題目"):(en?`Follow-up · ${card.level}/4`:`追問 · ${card.level}/4`);
  $("qText").textContent=card.q;
  $("qSwap").textContent=en?"Another":"換一題";
  qc.classList.toggle("mini",!!card.minimized);
  requestAnimationFrame(()=>qc.classList.add("show"));
  updateStarter();
}
function hideCard(){card=null;qc.classList.remove("show");setTimeout(()=>{if(!card)qc.classList.remove("mini");},400);updateStarter();}
function chainInfo(idea){
  const root=byId(idea.root||idea.id)||idea;
  let cat=root.cat;
  if(cat==="general"||cat==="extension"){const d=F.detectCategory(idea.t);if(d.cat!=="general")cat=d.cat;}
  if(cat==="extension")cat="general";
  const kw=F.detectCategory(root.t).kw;
  return {root,cat,kw};
}
function showFollow(idea){
  if(!st.follow||!idea||busy||ta.value.trim()||cx)return;
  const {root,cat,kw}=chainInfo(idea);
  if(root.done)return;
  const level=(idea.lvl||0)+1; if(level>QN.MAX_LEVEL)return;
  card={kind:"follow",parent:idea.id,root:root.id,level,lang:idea.lang||"zh",cat,kw:level===1||level===3?kw:null,minimized:false};
  card.q=QN.question(card.lang,cat,level,card.kw);
  renderCard();
}
function adoptCard(){
  if(!card||card.minimized)return false;
  card0=card;setCx({kind:card.kind,parent:card.parent,q:card.q});
  card=null;qc.classList.remove("show");return true;
}
function dismissCard(){
  if(!card)return;
  if(card.kind==="starter"){hideCard();return;}
  const r=card.root;dismissed[r]=(dismissed[r]||0)+1;
  if(dismissed[r]===1){card.minimized=true;renderCard();return;}
  const depth=st.ideas.filter(x=>(x.root===r)&&x.lvl>0).length;
  hideCard();
  if(depth>=1)closeChain(r);
}
$("qText").onclick=()=>{if(adoptCard())ta.focus();};
$("qLabel").onclick=()=>{if(card&&card.minimized){card.minimized=false;renderCard();}else if(adoptCard())ta.focus();};
$("qX").onclick=e=>{e.stopPropagation();dismissCard();};
$("qSwap").onclick=e=>{e.stopPropagation();if(!card)return;card.q=card.kind==="starter"?QN.starter(card.lang):QN.question(card.lang,card.cat,card.level,card.kw);
  qc.animate([{opacity:.3,transform:"translateY(4px)"},{opacity:1,transform:"none"}],{duration:300});renderCard();};
let qx0=null;
qc.addEventListener("touchstart",e=>{qx0=e.touches[0].clientX;},{passive:true});
qc.addEventListener("touchmove",e=>{if(qx0===null)return;const dx=e.touches[0].clientX-qx0;if(Math.abs(dx)>10)qc.style.transform=`translateX(${dx}px)`;qc.style.opacity=String(1-Math.min(Math.abs(dx)/200,.8));},{passive:true});
qc.addEventListener("touchend",e=>{if(qx0===null)return;const dx=e.changedTouches[0].clientX-qx0;qx0=null;qc.style.transform="";qc.style.opacity="";if(Math.abs(dx)>80)dismissCard();});
ta.addEventListener("input",()=>{if(ta.value.trim()&&card&&!card.minimized&&!cx)adoptCard();updateStarter();});

// blank-page starter
var starterT;const stBtn=$("starter");
function updateStarter(){
  clearTimeout(starterT);stBtn.classList.remove("show");$("hint").classList.remove("hide");
  if(ta.value.trim()||card||cx||busy)return;
  starterT=setTimeout(()=>{if(ta.value.trim()||card||cx||busy)return;stBtn.classList.add("show");$("hint").classList.add("hide");},3000);
}
stBtn.onclick=()=>{unlock();const last=st.ideas[0];const lang=last&&last.lang==="en"?"en":"zh";
  card={kind:"starter",parent:null,root:null,level:0,lang,q:QN.starter(lang),minimized:false};renderCard();};

// closure
function glow(){
  const g=document.createElement("div");g.className="glowring";document.body.appendChild(g);
  g.animate([{transform:"translate(-50%,-50%) scale(.2)",opacity:0},{transform:"translate(-50%,-50%) scale(1)",opacity:1,offset:.3},{transform:"translate(-50%,-50%) scale(2.6)",opacity:0}],{duration:2600,easing:"ease-out"}).onfinish=()=>g.remove();
  $("dots").animate([{filter:"drop-shadow(0 0 0 #ffe9b0)"},{filter:"drop-shadow(0 0 8px #ffe9b0)"},{filter:"drop-shadow(0 0 0 #ffe9b0)"}],{duration:2200});
}
function closeChain(rid){
  const r=byId(rid);if(!r||r.done)return;
  const before=stageOf(total());r.done=true;st.bonus++;persist();
  const lang=(st.ideas.find(x=>x.root===rid&&x.lvl>0)||r).lang||"zh";
  glow();sfx("sfx_idea_saved",.6);
  showCenter(QN.closure(lang),lang==="en"?"✦ Path complete · +1 progress":"✦ 這條路完成了 · 進度 +1",3200);
  renderTop();
  const after=stageOf(total());
  if(after>before){busy=true;setTimeout(()=>transition(after-1,after),3400);}
}

// streak (root saves only, follow-up answers don't count)
var streak=0,streakLang="zh",summaryTimer=null,lastRootAt=0,lastRoot=null,pendingFollow=null;
function scheduleSummary(){
  clearTimeout(summaryTimer);
  summaryTimer=setTimeout(function check(){
    if(Date.now()-lastInput<5000||busy){summaryTimer=setTimeout(check,4000);return;}
    if(streak>=2){showCenter(F.summary(streak,streakLang),streakLang==="en"?"Take a breath and enjoy it":"喘口氣，享受一下",2800);
      const lr=lastRoot;streak=0;setTimeout(()=>showFollow(lr),3200);}
  },SUMMARY_IDLE);
}

var busy=false,praiseT,toastT;
function showCenter(main,sub,ms){
  const p=$("praise");clearTimeout(praiseT);p.innerHTML="";
  p.appendChild(document.createTextNode(main));
  if(sub){const sm=document.createElement("small");sm.textContent=sub;p.appendChild(sm);}
  requestAnimationFrame(()=>p.classList.add("show"));
  praiseT=setTimeout(()=>p.classList.remove("show"),ms||2400);
}
function showToast(head,line){
  const t=$("toast");clearTimeout(toastT);t.innerHTML="";
  const b=document.createElement("b");b.textContent=head;t.appendChild(b);t.appendChild(document.createTextNode(line));
  requestAnimationFrame(()=>t.classList.add("show"));toastT=setTimeout(()=>t.classList.remove("show"),2200);
}
var followT;
function commit(){
  const text=ta.value.trim();if(!text||busy)return;
  unlock();clearTimeout(followT);
  const now=Date.now(),c=cx;
  const isChain=!!(c&&c.parent&&byId(c.parent));
  const parent=isChain?byId(c.parent):null;
  const id="i"+now;
  const level=isChain?(parent.lvl||0)+1:0;
  const root=isChain?(parent.root||parent.id):id;
  if(!isChain){streak=(now-lastRootAt<=STREAK_GAP&&streak>0)?streak+1:1;lastRootAt=now;}else{streak=0;lastRootAt=0;clearTimeout(summaryTimer);} // digging deeper ends a streak
  const fb=F.feedback(text,{isExtension:isChain,streak:isChain?0:streak});
  if(!isChain)streakLang=fb.lang;
  const before=stageOf(total());
  const idea={id,t:text,at:now,p:isChain?parent.id:null,q:c&&c.q?c.q:null,lvl:level,root,lang:fb.lang,cat:fb.cat};
  st.ideas.unshift(idea);persist();
  if(!isChain)lastRoot=idea;
  const after=stageOf(total());
  ta.value="";fit();ta.blur();card0=null;hideCard();setCx(null);
  // orb
  const r=$("card").getBoundingClientRect();
  const o=document.createElement("div");o.className="orb";o.style.left=(r.left+r.width/2-9)+"px";o.style.top=(r.top+30)+"px";document.body.appendChild(o);
  const dx=(Math.random()-.5)*120,ty=-(r.top+30-innerHeight*.22);
  o.animate([{transform:"translate(0,0) scale(.6)",opacity:0},{transform:"translate(0,-20px) scale(1.4)",opacity:1,offset:.15},{transform:`translate(${dx}px,${ty}px) scale(.5)`,opacity:0}],{duration:2200,easing:"cubic-bezier(.3,.6,.3,1)"}).onfinish=()=>o.remove();
  sfx("sfx_idea_saved",.8);
  const cmp=$("composer");cmp.classList.add("sent");setTimeout(()=>cmp.classList.remove("sent"),650);
  const sub=fb.note||SUB[fb.lang][Math.floor(Math.random()*3)];
  renderTop();
  const inStreak=!isChain&&streak>=2;
  const chainEnd=isChain&&level>=QN.MAX_LEVEL;
  if(after>before){busy=true;if(st.follow&&!inStreak&&!chainEnd)pendingFollow=idea;
    setTimeout(()=>{showCenter(fb.line,sub,1300);setTimeout(()=>transition(after-1,after),1500);},500);
    if(chainEnd)setTimeout(()=>closeChain(root),13000);}
  else if(fb.streak&&!isChain){showToast(fb.streak,fb.line);}
  else{showCenter(fb.line,sub,2000);
    if(chainEnd)followT=setTimeout(()=>closeChain(root),2300);
    else if(st.follow&&!inStreak)followT=setTimeout(()=>showFollow(idea),2300);
    else followT=setTimeout(updateStarter,2300);}
  if(!isChain)scheduleSummary();
}
// transitions
const vw=$("vwrap"),vid=$("vid");let vDone=null,vTimer;
function transition(from,to){
  busy=true;vid.src=`a/t${from+1}${from+2}.mp4`;vid.currentTime=0;
  vw.classList.add("on");
  const fin=()=>{if(!vDone)return;vDone=null;clearTimeout(vTimer);shown=to;setBg(to,true);renderTop();syncAudio();
    vw.classList.remove("on");setTimeout(()=>{vid.pause();},500);sfx("sfx_stage_up",.9);
    busy=false;showCenter(CONGRATS[to],`第 ${to+1} 階段 · ${STAGES[to]}`,3200);
    if(pendingFollow){const pf=pendingFollow;pendingFollow=null;setTimeout(()=>showFollow(pf),3500);}else setTimeout(updateStarter,3500);};
  vDone=fin;vid.onended=fin;vTimer=setTimeout(fin,9000);
  const pr=vid.play();if(pr)pr.catch(()=>setTimeout(fin,600));
}
$("skip").onclick=()=>vDone&&vDone();

// mic
const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
if(SR){const mic=$("mic");mic.hidden=false;let rec=null;
  mic.onclick=()=>{unlock();if(rec){rec.stop();return;}
    rec=new SR();rec.lang="zh-TW";rec.interimResults=true;rec.continuous=false;const base=ta.value;
    rec.onresult=e=>{let s="";for(const r of e.results)s+=r[0].transcript;ta.value=(base?base+" ":"")+s;fit();};
    rec.onend=rec.onerror=()=>{mic.classList.remove("rec");rec=null;};
    mic.classList.add("rec");try{rec.start();}catch(e){mic.classList.remove("rec");rec=null;}};}

// sheets
const veil=$("veil");let openS=null;
function open(s){openS=s;veil.classList.add("on");s.classList.add("on");}
function close(){if(openS)openS.classList.remove("on");veil.classList.remove("on");openS=null;}
veil.onclick=close;
document.querySelectorAll(".sheet").forEach(s=>{let y0=null;s.addEventListener("touchstart",e=>{if(s.scrollTop<=0)y0=e.touches[0].clientY;},{passive:true});s.addEventListener("touchend",e=>{if(y0!==null&&e.changedTouches[0].clientY-y0>80)close();y0=null;});});
function fmt(at){const d=new Date(at);return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;}
function renderList(){
  const L=$("list");L.innerHTML="";
  if(!st.ideas.length){L.innerHTML='<div class="empty">還沒有點子，寫下第一個吧</div>';return;}
  const ids=new Set(st.ideas.map(x=>x.id)),kids={};
  for(const x of st.ideas)if(x.p&&ids.has(x.p))(kids[x.p]=kids[x.p]||[]).push(x);
  const roots=st.ideas.filter(x=>!x.p||!ids.has(x.p));
  const row=(x,depth)=>{
    const d=document.createElement("div");d.className="item"+(depth?" child":"")+(x.done?" done":"");if(depth)d.style.setProperty("--ind",(Math.min(depth,3)*12)+"px");
    const m=document.createElement("div");m.className="meta";
    const tm=document.createElement("time");tm.textContent=fmt(x.at);m.appendChild(tm);
    const tg=document.createElement("span");tg.className="tag "+(x.cat||"general");tg.textContent=CAT_ZH[x.cat]||"靈感";m.appendChild(tg);
    if(x.done){const dn=document.createElement("span");dn.className="tag donetag";dn.textContent="✦ 完成的路";m.appendChild(dn);}
    const eb=document.createElement("button");eb.className="extbtn";eb.textContent="延伸";eb.onclick=()=>{close();setExt(x);};m.appendChild(eb);
    d.appendChild(m);
    if(x.q){const q=document.createElement("div");q.className="qline";q.textContent=x.q;d.appendChild(q);}
    d.appendChild(document.createTextNode(x.t));L.appendChild(d);
    (kids[x.id]||[]).slice().sort((a,b)=>a.at-b.at).forEach(k=>row(k,depth+1));
  };
  roots.forEach(x=>row(x,0));
}
$("btnList").onclick=()=>{renderList();open($("listSheet"));};
$("btnSet").onclick=()=>{syncAudio();open($("setSheet"));};
const chips=$("chips");for(let i=0;i<4;i++){const b=document.createElement("button");b.className="chip";b.textContent=`▶ ${i+1}→${i+2}`;b.onclick=()=>{unlock();close();setBg(i,true);shown=i;renderTop();setTimeout(()=>transition(i,i+1),400);};chips.appendChild(b);}
const back0=document.createElement("button");back0.className="chip";back0.textContent="回到目前進度";back0.onclick=()=>{shown=stageOf(total());setBg(shown);renderTop();syncAudio();close();};chips.appendChild(back0);
$("reset").onclick=()=>{if(!confirm("確定要清除所有點子嗎？"))return;st.ideas=[];st.bonus=0;streak=0;hideCard();setCx(null);persist();shown=0;setBg(0);renderTop();syncAudio();close();};
updateStarter();
})();
