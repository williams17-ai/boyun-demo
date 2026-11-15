(()=>{
const $=s=>document.getElementById(s);
const F=window.Feedback, QN=window.Questions;
const SUB={zh:["這裡替你記住了","收進這個安靜的地方了","路上又亮了一點"],en:["This place will remember it","Kept safe in the quiet","A little more light along the way"]};
const STAGES=["霧還很濃","有一點光","路漸漸清楚","風停了","豁然開朗"];
const CONGRATS=["","霧氣散開了，林間透進第一道光","腳下浮現一條小徑，繼續走吧","樹叢後面，是一整片開闊的天空","柳暗花明又一村——你走出來了"];
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
  if(s.v<4){s.ideas.forEach(x=>{if(x.done){x.closed=true;x.bonused=true;delete x.done;}});s.v=4;}
  if(s.v<5){
    s.scene=s.rain?"rain":"mist"; s.sound=s.rain?"rain":(s.amb?"forest":"rain"); s.muted=!(s.rain||s.amb);
    s.ideas.forEach(x=>{if(x.ql===undefined)x.ql=x.lvl||0;});
    delete s.rain; delete s.amb; s.v=5;
  }
  s.bonus=s.bonus|0; s.follow=s.follow!==false;
  s.test=!!s.test; s.pad=s.pad!==false; s.onboarded=!!s.onboarded; s.muted=!!s.muted;
  if(!["mist","rain","snow","reuniverse"].includes(s.scene))s.scene="mist";
  if(!["rain","stream","bowl","forest","snow","reuniverse","quiet"].includes(s.sound))s.sound="rain";
  if(!["idea","mood","free"].includes(s.intent))s.intent="free";
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
var sky=null;   // set up further down (升到雲上時)
function setBg(s,instant){
  if(sky)sky.stage(s,instant);
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
  // no counters — only a poetic hint when the next clearing is near
  let hint="";
  if(next===undefined)hint="這裡的風很輕";
  else if(stageOf(n)===shown){const left=next-n,span=next-t[shown];if(left<=1)hint="前方，好像有光透進來";else if(left<=Math.max(1,Math.ceil(span/3)))hint="前方的霧，好像薄了一點";}
  $("stageName").innerHTML="";$("stageName").appendChild(document.createTextNode(STAGES[shown]));
  const hc=document.createElement("span");hc.className="count";hc.textContent=hint;$("stageName").appendChild(hc);
}
setBg(shown,true);renderTop();

// ---------- audio (Web Audio, gapless loops, fades) ----------
const AC=window.AudioContext||window.webkitAudioContext;
// iOS 17+ (Safari 16.4+): play even when the side switch is on silent. Older browsers just ignore it.
function setSession(){try{const a=navigator.audioSession;if(a&&a.type!=="playback")a.type="playback";}catch(e){}}
// loops are loudness-matched (-23 LUFS) in a/v4 — see sfx/synth_v4.py
const SRC={rain_soft:"v5/rain_drizzle",stream:"v4/stream",bowl_ambient:"v4/bowl_ambient",pad_ethereal:"v4/pad_ethereal",
  insects_mist:"v4/insects_mist",snow_hush:"v5/snow_hush",reuniverse_hush:"v5/reuniverse_hush",insects_meadow:"v4/insects_meadow",sfx_save_tone:"v4/sfx_save_tone"};
// one low-pass over every loop, opening up as the mist clears (Hz per scenery stage; mirrors synth_v4.py)
const CUTOFF=[1000,1935,3740,7240,14000];
// make-up gain (dB) for loops with a lot of top end, so opening the filter brightens rather than just gets louder
// (measured loss in synth_v4 report, capped at 4 dB so the thickest mist still sounds a touch hushed)
const LP_COMP={reuniverse_hush:[0,-.5,-1.5,-3,-4.5],   // higher up = quieter
  rain_soft:[4,3.5,1.1,0,0],stream:[4,2.1,.4,0,0],insects_meadow:[2.6,2,.9,0,0]};
let ctx=null,master=null,bedBus=null,lp=null,lpAt=-1;const bufs={},loading={},tracks={};
function ensureCtx(){
  if(!AC)return null;
  setSession();
  if(!ctx){ctx=new AC();master=ctx.createGain();master.gain.value=1;master.connect(ctx.destination);
    lp=ctx.createBiquadFilter();lp.type="lowpass";lp.Q.value=.707;lp.frequency.value=CUTOFF[shown];lpAt=shown;
    bedBus=ctx.createGain();bedBus.connect(lp);lp.connect(master);
    const b=ctx.createBuffer(1,1,22050),s=ctx.createBufferSource();s.buffer=b;s.connect(ctx.destination);s.start(0);}
  if(ctx.state!=="running")ctx.resume().catch(()=>{});
  return ctx;
}
function setFilter(stage){
  if(!lp||stage===lpAt)return;lpAt=stage;
  const now=ctx.currentTime,p=lp.frequency;
  p.cancelScheduledValues(now);p.setValueAtTime(Math.max(20,p.value),now);
  p.exponentialRampToValueAtTime(CUTOFF[stage],now+5);          // exponential = even, slow opening to the ear
}
function load(name){
  if(bufs[name])return Promise.resolve(bufs[name]);
  if(loading[name])return loading[name];
  return loading[name]=fetch(`a/${SRC[name]||name}.mp3`).then(r=>r.arrayBuffer()).then(ab=>new Promise((res,rej)=>ctx.decodeAudioData(ab,res,rej))).then(b=>(bufs[name]=b));
}
function fadeTo(g,v,sec){const now=ctx.currentTime;g.gain.cancelScheduledValues(now);g.gain.setValueAtTime(g.gain.value,now);g.gain.linearRampToValueAtTime(v,now+sec);}
function setLoop(name,vol,sec){
  if(!ctx)return;sec=sec||2.5;
  let t=tracks[name];
  if(vol>0){
    if(t){if(Math.abs(t.want-vol)>1e-4){fadeTo(t.g,vol,sec);t.want=vol;}return;}
    tracks[name]=t={want:vol,g:ctx.createGain(),src:null};t.g.gain.value=0;t.g.connect(bedBus);
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
function sfx(name,vol,rate){
  if(!ensureCtx())return;
  load(name).then(b=>{const s=ctx.createBufferSource(),g=ctx.createGain();g.gain.value=vol||.8;s.buffer=b;if(rate)s.playbackRate.value=rate;s.connect(g);g.connect(master);s.start();}).catch(()=>{});
}
// saving an idea: the same soft tone, a different note of the pentatonic scale each time (never twice in a row)
const PENTA=[-5,-3,0,2,4,7];let lastNote=-1;
function saveTone(vol){
  let i;do{i=Math.floor(Math.random()*PENTA.length);}while(i===lastNote);lastNote=i;
  const semi=PENTA[i];sfx("sfx_save_tone",vol*Math.pow(2,-semi/48),Math.pow(2,semi/12));   // higher notes a hair softer
}
let unlocked=false;
function unlock(){if(unlocked)return;unlocked=true;ensureCtx();["sfx_save_tone","sfx_stage_up"].forEach(n=>load(n).catch(()=>{}));syncAudio();checkHeard();}
document.addEventListener("touchend",unlock,{passive:true});document.addEventListener("click",unlock);
document.addEventListener("visibilitychange",()=>{if(!ctx)return;if(document.hidden)ctx.suspend();else{setSession();ctx.resume();}});
// a gentle, one-time nudge when the phone may be keeping us silent
const isIOS=/iP(hone|ad|od)/.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
function checkHeard(){
  if(st.heardHint||!st.onboarded)return;
  setTimeout(()=>{
    if(st.heardHint||!soundOn())return;
    const silent=!ctx||ctx.state!=="running";
    if(silent||(isIOS&&!navigator.audioSession)){st.heardHint=true;persist();showToast("聽不到聲音嗎？","看看手機側邊的靜音鍵，或把音量調大一點");}
  },1800);
}
const BEDS={rain:"rain_soft",stream:"stream",bowl:"bowl_ambient",snow:"snow_hush",reuniverse:"reuniverse_hush"};
const bedVol=(name,base)=>base*Math.pow(10,((LP_COMP[name]||[])[shown]||0)/20);
function soundOn(){return !st.muted&&st.sound!=="quiet";}
function syncAudio(){
  const on=soundOn();
  if(ctx){
    setFilter(shown);
    for(const k in BEDS)setLoop(BEDS[k],on&&st.sound===k?bedVol(BEDS[k],1):0,2.5);
    setLoop("insects_mist",on&&st.sound==="forest"&&shown<=2?bedVol("insects_mist",1):0,3);
    setLoop("insects_meadow",on&&st.sound==="forest"&&shown>2?bedVol("insects_meadow",1):0,3);
    setLoop("pad_ethereal",on&&st.pad?.4:0,4);
  }
  $("btnSound").classList.toggle("on",on);$("btnRain").classList.toggle("on",st.scene!=="mist");
  $("sndIcon").innerHTML=on?'<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12"/>':'<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l5 6M22 9l-5 6"/>';
  document.querySelectorAll("[data-set]").forEach(b=>b.classList.toggle("sel",st[b.dataset.set]===b.dataset.v));
  $("swPad").classList.toggle("on",st.pad);$("swTest").classList.toggle("on",st.test);$("swFollow").classList.toggle("on",st.follow);
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
window.__audio=()=>Object.keys(tracks);window.__lp=()=>lp?Math.round(lp.frequency.value):null;
window.__fx={get running(){return !!rafId},get drops(){return drops.length},get beads(){return beads.length}};

// ---------- snow visuals (sparse, slow, with depth: near = big, fast, soft; far = small, slow) ----------
const sc=$("snowCv"),sx=sc.getContext("2d");
let flakes=[],snowRaf=0,snowVisible=false,snowT=0,SW=0,SH=0,snowStop;
const flakeSpr=[0,1,2].map(k=>{const c=document.createElement("canvas");c.width=c.height=64;const g=c.getContext("2d");
  const r=g.createRadialGradient(32,32,0,32,32,32),core=[.55,.35,.15][k];   // sharp far flakes, blurry near ones
  r.addColorStop(0,"rgba(255,255,255,.95)");r.addColorStop(core,"rgba(250,252,255,.8)");r.addColorStop(Math.min(.98,core+.35),"rgba(235,242,250,.18)");r.addColorStop(1,"rgba(235,242,250,0)");
  g.fillStyle=r;g.fillRect(0,0,64,64);return c;});
function newFlake(any){const z=Math.pow(Math.random(),1.8);    // most flakes far away
  return{z,x:Math.random()*SW,y:any?Math.random()*SH:-20-Math.random()*60,r:1+z*5.5,v:14+z*58,a:.45+z*.4,
    ph:Math.random()*6.28,sw:.25+Math.random()*.5,amp:6+z*22,spr:z<.35?0:z<.7?1:2};}
function sizeSnow(){
  const d=Math.min(devicePixelRatio||1,2);SW=innerWidth;SH=innerHeight;sc.width=SW*d;sc.height=SH*d;sx.setTransform(d,0,0,d,0,0);
  let n=Math.min(90,Math.round(SW*SH/5200));if(reduceMotion)n=Math.round(n/3);
  flakes=Array.from({length:n},()=>newFlake(true));drawSnow(0);
}
function drawSnow(dt){
  sx.clearRect(0,0,SW,SH);
  for(const f of flakes){
    if(dt){f.ph+=dt*f.sw;f.y+=f.v*dt;if(f.y>SH+20)Object.assign(f,newFlake(false));}
    const x=f.x+Math.sin(f.ph)*f.amp,s=f.r*2*(1+f.spr*.35);
    sx.globalAlpha=f.a;sx.drawImage(flakeSpr[f.spr],x-s/2,f.y-s/2,s,s);
  }
  sx.globalAlpha=1;
}
function snowFrame(t){const dt=Math.min(.05,(t-(snowT||t))/1000);snowT=t;drawSnow(dt);
  if(snowVisible)snowRaf=requestAnimationFrame(snowFrame);else snowRaf=0;}
function setSnowFx(on,instant){
  clearTimeout(snowStop);
  if(on){
    if(!SW)sizeSnow();
    if(instant){const els=[sc,...document.querySelectorAll(".bg,.snowveil")];for(const c of els)c.style.transition="none";requestAnimationFrame(()=>requestAnimationFrame(()=>{for(const c of els)c.style.transition="";}));}
    app.classList.add("snowing");snowVisible=true;
    if(reduceMotion)drawSnow(0);else if(!snowRaf){snowT=0;snowRaf=requestAnimationFrame(snowFrame);}
  }else{app.classList.remove("snowing");snowStop=setTimeout(()=>{snowVisible=false;},2600);}
}
addEventListener("resize",()=>{if(SW)sizeSnow();});
window.__snow={get running(){return !!snowRaf},get flakes(){return flakes.length},get y(){return flakes.slice(0,5).map(f=>Math.round(f.y))}};

// ---------- 升到雲上時: a canvas sky that climbs from ground fog, through cloud, above a sea of cloud, into deep space ----------
// muted, filmic colours; ~18 soft cloud sprites drifting downward (we are rising); drawn at ~30 fps, full rate only while rising
const kc=$("skyCv"),kx=kc.getContext("2d");
const SKY=[ // sky top / middle / bottom colour, where the middle sits, passing clouds (amount, screen band), drift px/s, cloud sea (amount, top edge), stars
  {t:[66,76,82],m:[104,112,114],b:[40,46,44],mp:.58,ca:.5,band:[-.2,.72],v:16,sea:0,seaY:.95,star:0},
  {t:[150,157,164],m:[174,180,186],b:[128,135,143],mp:.5,ca:.82,band:[-.3,1.3],v:30,sea:0,seaY:.95,star:0},
  {t:[24,40,68],m:[62,86,116],b:[118,136,156],mp:.6,ca:.3,band:[.25,1.3],v:22,sea:.15,seaY:.95,star:0},
  {t:[10,16,34],m:[44,50,78],b:[170,130,108],mp:.55,ca:.05,band:[.6,1.3],v:6,sea:1,seaY:.68,star:.3},
  {t:[3,5,11],m:[6,10,22],b:[18,32,60],mp:.8,ca:0,band:[.9,1.3],v:3,sea:.25,seaY:.95,star:1}];
const lerp=(a,b,u)=>a+(b-a)*u;
function skyAt(s){const i=Math.min(3,Math.floor(s)),u=s-i,A=SKY[i],B=SKY[i+1];const o={};
  for(const k in A)o[k]=Array.isArray(A[k])?A[k].map((v,j)=>lerp(v,B[k][j],u)):lerp(A[k],B[k],u);return o;}
function puff(g,x,y,r,col,a){const gr=g.createRadialGradient(x,y,0,x,y,r);gr.addColorStop(0,`rgba(${col},${a})`);gr.addColorStop(.55,`rgba(${col},${a*.4})`);gr.addColorStop(1,`rgba(${col},0)`);g.fillStyle=gr;g.fillRect(x-r,y-r,2*r,2*r);}
const SPR=[0,1,2,3].map(()=>{const c=document.createElement("canvas");c.width=320;c.height=160;const g=c.getContext("2d");
  for(let i=0;i<26;i++)puff(g,320*(.18+.64*Math.random()),160*(.38+.3*Math.random()),160*(.14+.22*Math.random()),"255,255,255",.16+.1*Math.random());return c;});
// the sea of cloud below us: a soft floor of flattened billows, tileable sideways, warm light grazing the top edge
function puffE(g,x,y,rx,ry,col,a){g.save();g.translate(x,y);g.scale(1,ry/rx);puff(g,0,0,rx,col,a);g.restore();}
const seaCv=(()=>{const W=1024,H=360,c=document.createElement("canvas");c.width=W;c.height=H;const g=c.getContext("2d");
  const at=(x,y,rx,ry,col,a)=>{for(const o of[-W,0,W])puffE(g,x+o,y,rx,ry,col,a);};
  const base=g.createLinearGradient(0,H*.16,0,H);base.addColorStop(0,"rgba(186,192,206,0)");base.addColorStop(.18,"rgba(186,192,206,.75)");base.addColorStop(1,"rgba(150,158,178,1)");
  g.fillStyle=base;g.fillRect(0,0,W,H);
  for(let i=0;i<90;i++){const y=H*(.16+.7*Math.random()),rx=60+Math.random()*150;at(Math.random()*W,y,rx,rx*(.28+.12*Math.random()),y<H*.4?"226,230,238":"200,206,220",.2);}
  for(let i=0;i<34;i++){const rx=140+Math.random()*200;at(Math.random()*W,H*(.15+.08*Math.random()),rx,rx*.16,"238,214,196",.1);}   // grazing light
  const sh=g.createLinearGradient(0,H*.45,0,H);sh.addColorStop(0,"rgba(58,66,92,0)");sh.addColorStop(1,"rgba(58,66,92,.45)");g.fillStyle=sh;g.fillRect(0,H*.45,W,H*.55);
  return c;})();
let starCv=null,clouds=[],KW=0,KH=0,kS=0,kTarget=0,kStar=-1,kSeaX=0,kRise=null,kRaf=0,kOn=false,kT=0,kAcc=0,kStop;
function makeStars(){const c=document.createElement("canvas"),d=Math.min(devicePixelRatio||1,1.5);c.width=KW*d;c.height=KH*.85*d;const g=c.getContext("2d");g.scale(d,d);
  const n=Math.round(KW*KH/2600);for(let i=0;i<n;i++){const y=Math.pow(Math.random(),1.4)*KH*.85,r=Math.random()<.08?1.1:.55+Math.random()*.35;
    g.globalAlpha=(.25+.6*Math.random())*(1-y/(KH*.85))*.9+.1;g.fillStyle=Math.random()<.2?"#dfe6ff":"#fff";g.beginPath();g.arc(Math.random()*KW,y,r,0,6.283);g.fill();}
  return c;}
function newCloud(any){return{x:Math.random(),y:any?Math.random()*1.6-.3:-.35-Math.random()*.25,w:.8+Math.random()*1.1,a:.55+Math.random()*.45,spr:(Math.random()*SPR.length)|0,dx:(Math.random()-.5)*.006};}
function sizeSky(){const d=Math.min(devicePixelRatio||1,1.5);KW=innerWidth;KH=innerHeight;kc.width=KW*d;kc.height=KH*d;kx.setTransform(d,0,0,d,0,0);
  starCv=makeStars();if(!clouds.length)clouds=Array.from({length:reduceMotion?8:18},()=>newCloud(true));if(kStar<0)kStar=SKY[kS].star;drawSky(0);}
const css=a=>`rgb(${a[0]|0},${a[1]|0},${a[2]|0})`;
function drawSky(dt){
  let rush=0;
  if(kRise){const r=kRise;r.t+=dt;const u=Math.min(1,r.t/r.d),e=u<.5?2*u*u:1-Math.pow(2-2*u,2)/2;
    kS=lerp(r.from,r.to,e);rush=Math.sin(Math.PI*u)*r.k;if(u>=1){kRise=null;kS=r.to;r.done&&setTimeout(r.done,0);}}
  else if(kS!==kTarget)kS=kS<kTarget?Math.min(kTarget,kS+dt*.5):Math.max(kTarget,kS-dt*.5);   // gentle settle
  const p=skyAt(kS),g=kx.createLinearGradient(0,0,0,KH),hz=Math.min(.999,p.seaY);
  g.addColorStop(0,css(p.t));g.addColorStop(Math.min(p.mp,hz-.04),css(p.m));g.addColorStop(hz,css(p.b));g.addColorStop(1,css(p.b));
  kx.globalAlpha=1;kx.fillStyle=g;kx.fillRect(0,0,KW,KH);
  kStar+=(p.star-kStar)*(1-Math.exp(-dt/5));                        // stars surface slowly, never pop
  if(kStar>.01){kx.globalAlpha=kStar;kx.drawImage(starCv,0,0,KW,KH*.85);}
  if(p.sea>.01){kSeaX=(kSeaX+dt*5)%(KW*2);const w=KW*2,h=KH*.5,y=KH*p.seaY-KH*.07;kx.globalAlpha=p.sea;kx.drawImage(seaCv,-kSeaX,y,w,h);kx.drawImage(seaCv,w-kSeaX,y,w,h);}
  const sp=p.v*(1+rush*16),ca=p.ca+rush*.6*(1-p.ca),[b0,b1]=p.band;
  for(const k of clouds){
    if(dt){k.y+=sp*dt/KH;k.x+=k.dx*dt;if(k.y>1.35)Object.assign(k,newCloud(false));}
    let m=Math.min(1,Math.max(0,(k.y-b0)/.15),Math.max(0,(b1-k.y)/.15));m+=(1-m)*Math.min(1,rush);
    const a=ca*k.a*m;if(a<.01)continue;
    const w=KW*k.w,h=w*.5;kx.globalAlpha=Math.min(1,a);kx.drawImage(SPR[k.spr],k.x*KW-w/2,k.y*KH-h/2,w,h);}
  kx.globalAlpha=1;
}
function skyFrame(t){const dt=Math.min(.1,(t-(kT||t))/1000);kT=t;kAcc+=dt;
  if(kRise||kAcc>=1/30){drawSky(Math.min(.1,kAcc));kAcc=0;}
  kRaf=kOn?requestAnimationFrame(skyFrame):0;}
function setSkyFx(on,instant){
  clearTimeout(kStop);
  if(on){
    if(!KW)sizeSky();
    if(instant){const els=[kc,...document.querySelectorAll(".bg")];for(const c of els)c.style.transition="none";requestAnimationFrame(()=>requestAnimationFrame(()=>{for(const c of els)c.style.transition="";}));}
    kS=kTarget=shown;kStar=SKY[shown].star;app.classList.add("ascending");kOn=true;
    if(reduceMotion)drawSky(0);else if(!kRaf){kT=0;kRaf=requestAnimationFrame(skyFrame);}
  }else{app.classList.remove("ascending");if(kRise){const d=kRise.done;kRise=null;kS=kTarget;d&&d();}kStop=setTimeout(()=>{kOn=false;},2600);}
}
sky={
  stage(s,instant){kTarget=s;if(instant&&!kRise)kS=s;if(KW&&!kRaf)drawSky(0);},
  rise(from,to,done){kTarget=to;if(!kOn||reduceMotion){kS=to;if(KW)drawSky(0);done();return;}
    kS=from;kRise={from,to,t:0,d:5.2,k:to<=3?1:.4,done};}       // clouds rush down past us = we are going up
};
addEventListener("resize",()=>{if(KW)sizeSky();});
window.__sky={get running(){return !!kRaf},get stage(){return Math.round(kS*100)/100},get star(){return Math.round(kStar*100)/100},get rising(){return !!kRise}};

function setScene(v){st.scene=v;if(v!=="mist")st.lastWeather=v;persist();unlock();setRainFx(v==="rain");setSnowFx(v==="snow");setSkyFx(v==="reuniverse");syncAudio();}
$("btnRain").onclick=()=>setScene(st.scene!=="mist"?"mist":(["snow","reuniverse"].includes(st.lastWeather)?st.lastWeather:"rain"));
$("btnSound").onclick=()=>{unlock();if(st.sound==="quiet"){st.sound=st.lastSound||"rain";st.muted=false;}else st.muted=!st.muted;persist();syncAudio();checkHeard();};
function setSound(v){unlock();if(v!=="quiet")st.lastSound=v;st.sound=v;st.muted=false;persist();syncAudio();checkHeard();}
document.querySelectorAll("[data-set]").forEach(b=>b.onclick=()=>{const k=b.dataset.set,v=b.dataset.v;
  if(k==="sound")setSound(v);else if(k==="scene")setScene(v);else{st[k]=v;persist();syncAudio();}});
$("swPad").onclick=()=>{unlock();st.pad=!st.pad;persist();syncAudio();};
$("swFollow").onclick=()=>{st.follow=!st.follow;persist();syncAudio();if(!st.follow)hideCard();};
$("swTest").onclick=()=>{st.test=!st.test;persist();shown=stageOf(total());setBg(shown);renderTop();syncAudio();};
syncAudio();
if(st.scene==="rain")setRainFx(true,true);
if(st.scene==="snow")setSnowFx(true,true);
if(st.scene==="reuniverse")setSkyFx(true,true);

// ---------- input ----------
const ta=$("ta"),save=$("save");let lastInput=0;
const fit=()=>{ta.style.height="auto";ta.style.height=Math.min(ta.scrollHeight,innerHeight*.4)+"px";save.disabled=!ta.value.trim();};
ta.addEventListener("input",()=>{fit();lastInput=Date.now();});
if(st.onboarded)setTimeout(()=>ta.focus(),300);
save.onclick=commit;
// desktop: Cmd/Ctrl+Enter saves straight away (not while an IME is still composing)
ta.addEventListener("keydown",e=>{if(e.key==="Enter"&&(e.metaKey||e.ctrlKey)&&!e.isComposing){e.preventDefault();commit();}});
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
  if(c){ if(c.kind==="manual"){const p=byId(c.parent);label=p?p.t.slice(0,26)+(p.t.length>26?"…":""):"";}
         else label=c.q; }
  $("extTxt").textContent=label;
  ta.placeholder=c?(c.kind==="manual"?"還想到什麼？慢慢說":"想到什麼就寫什麼，一句也好"):"有什麼點子冒出來了？";
  updateStarter();
}
function setExt(idea){setCx(idea?{kind:"manual",parent:idea.id,q:null,level:(idea.ql||0)+1}:null);if(idea){hideCard();setTimeout(()=>ta.focus(),350);}}
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
  $("qLabel").textContent=en?"Say a little more":"還想多說一點";
  $("qText").textContent=card.q;
  $("qSwap").setAttribute("aria-label",en?"Think from another angle":"換個方向想");
  $("qPause").style.display=card.kind==="follow"?"":"none";
  const chips=$("qChips");chips.innerHTML="";
  if(card.cat==="mood"&&card.level===1){for(const w of QN.feelings(card.lang)){const b=document.createElement("button");b.textContent=w;
    b.onclick=e=>{e.stopPropagation();const c0=card;if(!adoptCard())return;ta.value=ta.value.trim()?ta.value.trim()+"、"+w:w;fit();ta.focus();};chips.appendChild(b);}}
  chips.style.display=chips.childNodes.length?"":"none";
  $("qPause").textContent=en?"Stop here for now":"先到這裡";
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
  return {root,cat};
}
function showFollow(idea,force){
  if(!idea||(!force&&(!st.follow||busy||ta.value.trim()||cx)))return;
  const {root,cat}=chainInfo(idea);
  if(root.closed&&!force)return;
  const level=(idea.ql||0)+1; if(level>QN.MAX_LEVEL)return;
  const lang=idea.lang||"zh";
  card={kind:"follow",parent:idea.id,root:root.id,level,lang,cat,word:F.salient(idea.t,lang),minimized:false};
  card.q=QN.question(lang,cat,level,card.word);
  renderCard();sfx("sfx_question",.35);
}
function adoptCard(){
  if(!card||card.minimized)return false;
  card0=card;setCx({kind:card.kind,parent:card.parent,q:card.q,level:card.level,affect:!!card.affect});
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
$("qPause").onclick=e=>{e.stopPropagation();if(!card||card.kind!=="follow")return;const r=card.root;hideCard();closeChain(r,"pause");};
$("qX").onclick=e=>{e.stopPropagation();dismissCard();};
$("qSwap").onclick=e=>{e.stopPropagation();if(!card)return;card.q=card.affect?QN.affect(card.lang):card.kind==="starter"?QN.starter(st.intent,card.lang):QN.question(card.lang,card.cat,card.level,card.word);
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
function showStarter(){
  const last=st.ideas[0];const lang=last&&last.lang==="en"?"en":"zh";
  if(st.intent==="mood")card={kind:"starter",affect:true,parent:null,root:null,level:1,lang,cat:"mood",q:QN.affect(lang),minimized:false};
  else card={kind:"starter",parent:null,root:null,level:0,lang,cat:st.intent==="idea"?"business":"general",q:QN.starter(st.intent,lang),minimized:false};
  renderCard();sfx("sfx_question",.3);
}
stBtn.onclick=()=>{unlock();showStarter();};

// closure
function glow(){
  const g=document.createElement("div");g.className="glowring";document.body.appendChild(g);
  g.animate([{transform:"translate(-50%,-50%) scale(.2)",opacity:0},{transform:"translate(-50%,-50%) scale(1)",opacity:1,offset:.3},{transform:"translate(-50%,-50%) scale(2.6)",opacity:0}],{duration:2600,easing:"ease-out"}).onfinish=()=>g.remove();
  $("dots").animate([{filter:"drop-shadow(0 0 0 #ffe9b0)"},{filter:"drop-shadow(0 0 8px #ffe9b0)"},{filter:"drop-shadow(0 0 0 #ffe9b0)"}],{duration:2200});
}
function closeChain(rid,kind){
  const r=byId(rid);if(!r||r.closed)return;
  const ans=answersOf(rid),lang=(ans[0]||r).lang||"zh";
  const line=kind==="pause"?QN.pause(lang):QN.closure(lang);
  if(!ans.length){showCenter(line,null,2800);if(kind==="pause")sfx("sfx_pause",.5);return;}   // nothing written yet: just a gentle line
  const before=stageOf(total());
  r.closed=true;r.paused=kind==="pause";
  if(!r.bonused){r.bonused=true;st.bonus++;}
  persist();glow();if(kind==="pause")sfx("sfx_pause",.6);else saveTone(.7);
  showCenter(line,null,3200);
  renderTop();
  const after=stageOf(total());
  if(after>before)setTimeout(function go(){if(busy){setTimeout(go,800);return;}transition(after-1,after);},3400); // don't block typing while the line shows
}

// streak (root saves only, follow-up answers don't count)
var streak=0,streakLang="zh",summaryTimer=null,lastRootAt=0,lastRoot=null,pendingFollow=null;
function scheduleSummary(){
  clearTimeout(summaryTimer);
  summaryTimer=setTimeout(function check(){
    if(Date.now()-lastInput<5000||busy){summaryTimer=setTimeout(check,4000);return;}
    if(streak>=2){showCenter(F.summary(streak,streakLang),null,2800);
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
  const ql=isChain?(c.kind==="follow"&&c.level?c.level:(parent.ql||0)+1):(c&&c.affect?1:0);
  const root=isChain?(parent.root||parent.id):id;
  if(!isChain){streak=(now-lastRootAt<=STREAK_GAP&&streak>0)?streak+1:1;lastRootAt=now;}else{streak=0;lastRootAt=0;clearTimeout(summaryTimer);} // digging deeper ends a streak
  const fb=F.feedback(text,{isExtension:isChain,streak:isChain?0:streak});
  if(!isChain)streakLang=fb.lang;
  const before=stageOf(total());
  const cat=!isChain&&c&&c.affect?"mood":(!isChain&&fb.cat==="general"&&st.intent==="idea"&&c&&c.kind==="starter"?"business":fb.cat);
  const idea={id,t:text,at:now,p:isChain?parent.id:null,q:c&&c.q?c.q:null,lvl:level,ql,root,lang:fb.lang,cat};
  st.ideas.unshift(idea);persist();
  if(!isChain)lastRoot=idea;
  const after=stageOf(total());
  ta.value="";fit();card0=null;hideCard();setCx(null);
  // orb
  const r=$("card").getBoundingClientRect();
  const o=document.createElement("div");o.className="orb";o.style.left=(r.left+r.width/2-9)+"px";o.style.top=(r.top+30)+"px";document.body.appendChild(o);
  const dx=(Math.random()-.5)*120,ty=-(r.top+30-innerHeight*.22);
  o.animate([{transform:"translate(0,0) scale(.6)",opacity:0},{transform:"translate(0,-20px) scale(1.4)",opacity:1,offset:.15},{transform:`translate(${dx}px,${ty}px) scale(.5)`,opacity:0}],{duration:2200,easing:"cubic-bezier(.3,.6,.3,1)"}).onfinish=()=>o.remove();
  saveTone(.9);
  const cmp=$("composer");cmp.classList.add("sent");setTimeout(()=>cmp.classList.remove("sent"),650);
  const sub=fb.quiet||Math.random()<.5?null:SUB[fb.lang][Math.floor(Math.random()*3)];
  renderTop();
  const inStreak=!isChain&&streak>=2;
  const chainEnd=isChain&&ql>=QN.MAX_LEVEL;
  if(after>before){busy=true;if(st.follow&&!inStreak&&!chainEnd)pendingFollow=idea;
    setTimeout(()=>{showCenter(fb.line,sub,1300);setTimeout(()=>transition(after-1,after),1500);},500);
    if(chainEnd)setTimeout(()=>closeChain(root),13000);}
  else if(fb.streak&&!isChain){showToast(fb.streak,fb.line);}
  else{showCenter(fb.line,sub,fb.quiet?1500:2000);
    if(chainEnd)followT=setTimeout(()=>closeChain(root),2300);
    else if(st.follow&&!inStreak)followT=setTimeout(()=>showFollow(idea),2300);
    else followT=setTimeout(updateStarter,2300);}
  if(!isChain)scheduleSummary();
}
// transitions
const vw=$("vwrap"),vid=$("vid");let vDone=null,vTimer;
function transition(from,to){
  busy=true;
  if(st.scene!=="reuniverse"){vid.src=`a/t${from+1}${from+2}.mp4`;vid.currentTime=0;vw.classList.add("on");}
  const fin=()=>{if(!vDone)return;vDone=null;clearTimeout(vTimer);shown=to;setBg(to,true);renderTop();syncAudio();
    vw.classList.remove("on");setTimeout(()=>{vid.pause();},500);sfx("sfx_stage_up",.9);
    busy=false;showCenter(CONGRATS[to],STAGES[to],3200);
    if(pendingFollow){const pf=pendingFollow;pendingFollow=null;setTimeout(()=>showFollow(pf),3500);}else setTimeout(updateStarter,3500);};
  vDone=fin;vTimer=setTimeout(fin,9000);
  if(st.scene==="reuniverse"){sky.rise(from,to,fin);return;}       // no forest film: we rise through the clouds instead
  vid.onended=fin;
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
// ---------- list: groups, pin, delete, resume, export ----------
const descendants=rid=>{const out=[];const walk=id=>{st.ideas.filter(x=>x.p===id).sort((a,b)=>a.at-b.at).forEach(k=>{out.push(k);walk(k.id);});};walk(rid);return out;};
const answersOf=rid=>st.ideas.filter(x=>x.root===rid&&x.id!==rid);
function snack(msg){const n=$("snack");n.textContent=msg;n.classList.add("show");clearTimeout(snack.t);snack.t=setTimeout(()=>n.classList.remove("show"),2200);}
function fmtDay(at){const d=new Date(at);return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}`;}
function chainText(r,md){
  const en=r.lang==="en",ds=descendants(r.id),L=[];
  if(r.q)L.push(md?`*${r.q}*`:r.q);
  L.push((md?"## ":"")+"💡 "+r.t);L.push("");
  for(const n of ds){if(n.q)L.push(md?`> ${n.q}`:"— "+n.q);L.push(md?n.t:"   "+n.t);L.push("");}
  const step=ds.filter(n=>(n.ql??n.lvl)===4).pop();
  if(step)L.push((md?"**":"")+(en?"👣 Next step: ":"👣 下一步：")+step.t+(md?"**":""));
  L.push((md?"_":"")+fmtDay(r.at)+(md?"_":""));
  return L.join("\n").replace(/\n{3,}/g,"\n\n");
}
function allText(md){
  const roots=sortedRoots();
  return (md?"# ":"")+"雲間 · 我的點子\n"+fmtDay(Date.now())+"\n\n"+roots.map(r=>chainText(r,md)).join(md?"\n\n---\n\n":"\n\n———\n\n")+"\n";
}
function copyText(t){
  const ok=()=>snack("已複製，可以貼到任何地方");
  if(navigator.clipboard&&navigator.clipboard.writeText)return navigator.clipboard.writeText(t).then(ok).catch(()=>legacyCopy(t,ok));
  legacyCopy(t,ok);
}
function legacyCopy(t,ok){const a=document.createElement("textarea");a.value=t;a.setAttribute("readonly","");a.style.cssText="position:fixed;opacity:0";document.body.appendChild(a);a.select();try{document.execCommand("copy");ok();}catch(e){snack("請長按選取後複製");}a.remove();}
function shareText(title,t){
  if(navigator.share){navigator.share({title,text:t}).catch(e=>{if(e&&e.name!=="AbortError")copyText(t);});}
  else copyText(t);
}
function download(name,t){
  const b=new Blob([t],{type:"text/markdown;charset=utf-8"}),u=URL.createObjectURL(b),a=document.createElement("a");
  a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),3000);snack("已存成檔案");
}
$("shareAll").onclick=()=>{if(!st.ideas.length)return snack("還沒有點子可以分享");shareText("雲間",allText(false));};
$("dlAll").onclick=()=>{if(!st.ideas.length)return snack("還沒有點子可以存");const d=new Date();download(`雲間-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}.md`,allText(true));};
function removeIdea(x){
  const isRoot=!x.p||!byId(x.p);
  const msg=isRoot?"確定刪掉這個點子，和後面接著想的內容嗎？":"確定刪掉這段嗎？後面接著寫的也會一起刪掉。";
  if(!confirm(msg))return;
  const gone=new Set([x.id,...descendants(x.id).map(n=>n.id)]);
  st.ideas=st.ideas.filter(n=>!gone.has(n.id));persist();
  if(card&&(gone.has(card.parent)||gone.has(card.root)))hideCard();
  if(cx&&gone.has(cx.parent))setCx(null);
  renderList();renderTop();snack("刪掉了");
}
function resumeChain(r){
  const ds=answersOf(r.id);
  const deepest=[r,...ds].sort((a,b)=>(b.ql||0)-(a.ql||0)||b.at-a.at)[0];
  close();
  if((deepest.ql||0)>=QN.MAX_LEVEL){setExt(deepest);return;}
  r.closed=false;r.paused=false;persist();
  setCx(null);delete dismissed[r.id];
  setTimeout(()=>showFollow(deepest,true),380);
}
const walkedOut=r=>r.closed&&answersOf(r.id).length>0;
function sortedRoots(){
  const ids=new Set(st.ideas.map(x=>x.id));
  return st.ideas.filter(x=>!x.p||!ids.has(x.p)).sort((a,b)=>(b.pin?1:0)-(a.pin?1:0)||b.at-a.at);
}
const PIN_SVG='<svg class="pin" viewBox="0 0 24 24"><path d="M14 3l7 7-3 1-4 4 1 5-2 1-4-5-5 5-1-1 5-5-5-4 1-2 5 1 4-4z"/></svg>';
function renderList(){
  const L=$("list");L.innerHTML="";
  if(!st.ideas.length){L.innerHTML='<div class="empty">還沒有點子，寫下第一個吧</div>';return;}
  const roots=sortedRoots();
  const groups=[["還在想",roots.filter(r=>!walkedOut(r))],["已走出來",roots.filter(walkedOut)]];
  const row=(x,depth,root)=>{
    const d=document.createElement("div");d.className="item"+(depth?" child":"")+(!depth&&walkedOut(x)?" done":"");if(depth)d.style.setProperty("--ind",(Math.min(depth,3)*12)+"px");
    const m=document.createElement("div");m.className="meta";
    if(!depth){const tg=document.createElement("span");tg.className="cdot "+(x.cat||"general");tg.setAttribute("aria-hidden","true");m.appendChild(tg);}
    const tm=document.createElement("time");tm.textContent=fmt(x.at);m.appendChild(tm);
    if(!depth&&x.pin){const pi=document.createElement("span");pi.innerHTML=PIN_SVG;pi.style.display="inline-flex";m.appendChild(pi);}
    if(!depth){const eb=document.createElement("button");eb.className="extbtn";eb.textContent="接著想";eb.onclick=()=>resumeChain(x);m.appendChild(eb);}
    const mo=document.createElement("button");mo.className="more";mo.textContent="⋯";mo.setAttribute("aria-label","更多");m.appendChild(mo);
    d.appendChild(m);
    if(x.q){const q=document.createElement("div");q.className="qline";q.textContent=x.q;d.appendChild(q);}
    d.appendChild(document.createTextNode(x.t));
    const acts=document.createElement("div");acts.className="acts";
    const mk=(txt,fn,cls)=>{const b=document.createElement("button");b.textContent=txt;if(cls)b.className=cls;b.onclick=fn;acts.appendChild(b);};
    if(!depth){mk(x.pin?"取消置頂":"置頂",()=>{x.pin=!x.pin;persist();renderList();});
               mk("分享",()=>shareText("雲間",chainText(x,false)));}
    mk("刪除",()=>removeIdea(x),"del");
    d.appendChild(acts);
    mo.onclick=()=>acts.classList.toggle("on");
    L.appendChild(d);
    st.ideas.filter(k=>k.p===x.id).sort((a,b)=>a.at-b.at).forEach(k=>row(k,depth+1,root));
  };
  for(const [name,rs] of groups){
    if(!rs.length)continue;
    const h=document.createElement("div");h.className="ghead";h.textContent=name;L.appendChild(h);
    rs.forEach(r=>row(r,0,r));
  }
}
$("btnList").onclick=()=>{renderList();open($("listSheet"));};
$("btnSet").onclick=()=>{syncAudio();open($("setSheet"));};
const chips=$("chips");for(let i=0;i<4;i++){const b=document.createElement("button");b.className="chip";b.textContent=`▶ ${STAGES[i+1]}`;b.onclick=()=>{unlock();close();setBg(i,true);shown=i;renderTop();setTimeout(()=>transition(i,i+1),400);};chips.appendChild(b);}
const back0=document.createElement("button");back0.className="chip";back0.textContent="回到我現在的位置";back0.onclick=()=>{shown=stageOf(total());setBg(shown);renderTop();syncAudio();close();};chips.appendChild(back0);
$("reset").onclick=()=>{if(!confirm("確定要清除所有點子嗎？"))return;st.ideas=[];st.bonus=0;streak=0;hideCard();setCx(null);persist();shown=0;setBg(0);renderTop();syncAudio();close();};
// ---------- welcome + onboarding (first launch; again from settings) ----------
const W_=$("welcome"),O_=$("onb");
function showOv(el){el.classList.add("on");requestAnimationFrame(()=>requestAnimationFrame(()=>el.classList.add("vis")));}
function hideOv(el,ms){el.classList.remove("vis");setTimeout(()=>el.classList.remove("on"),ms||900);}
function showWelcome(){W_.classList.remove("through");showOv(W_);ta.blur();}
let oStep=0,oPicked={};
$("wGo").onclick=()=>{
  unlock();saveTone(.8);                         // first gesture: wake the audio, a soft tone
  W_.classList.add("through");                   // pass through the foliage
  setTimeout(()=>{oStep=0;oPicked={};O_.classList.remove("ending");$("oEnd").classList.remove("on");
    document.querySelectorAll(".ocard").forEach(c=>c.classList.toggle("sel",false));$("oNext").classList.remove("show");
    goStep(0);showOv(O_);},1250);
  setTimeout(()=>hideOv(W_,50),1900);
};
function goStep(i){
  oStep=i;
  document.querySelectorAll(".ostep").forEach(s=>s.classList.toggle("on",+s.dataset.step===i));
  document.querySelectorAll(".odots i").forEach((d,k)=>d.classList.toggle("on",k===i));
}
document.querySelectorAll(".ocard").forEach(c=>c.onclick=()=>{
  const k=c.dataset.k,v=c.dataset.v;
  document.querySelectorAll(`.ocard[data-k="${k}"]`).forEach(x=>x.classList.toggle("sel",x===c));
  oPicked[k]=v;
  if(k==="intent"){st.intent=v;persist();setTimeout(()=>goStep(1),550);}
  else if(k==="scene"){setScene(v);setTimeout(()=>{goStep(2);presetSound(v);},650);}
  else if(k==="sound"){setSound(v);$("oNext").classList.add("show");}   // live preview with a soft fade-in
});
// the sound step starts on the sound that belongs to the chosen scenery (still free to change)
const SCENE_SOUND={rain:"rain",snow:"snow",reuniverse:"reuniverse"};
function presetSound(scene){
  if(oPicked.sound)return;const v=SCENE_SOUND[scene];if(!v)return;
  const c=document.querySelector(`.ocard[data-k="sound"][data-v="${v}"]`);if(c)c.click();
}
$("oNext").onclick=finishOnb;
$("oSkip").onclick=()=>{
  if(oStep===0){if(!oPicked.intent){st.intent="free";persist();}goStep(1);}
  else if(oStep===1){if(!oPicked.scene)setScene("mist");goStep(2);presetSound(st.scene);}
  else{if(!oPicked.sound)setSound(SCENE_SOUND[st.scene]||"rain");finishOnb();}
};
function finishOnb(){
  st.onboarded=true;persist();syncAudio();setTimeout(checkHeard,2600);
  O_.classList.add("ending");setTimeout(()=>$("oEnd").classList.add("on"),300);
  setTimeout(()=>{hideOv(O_,1000);setTimeout(()=>{if(!card&&!cx&&!ta.value.trim())showStarter();},700);},2100);  // the first prompt is already waiting
}
$("reWelcome").onclick=()=>{close();setTimeout(showWelcome,350);};
if(!st.onboarded)showWelcome();
updateStarter();
})();
