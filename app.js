(()=>{
const $=s=>document.getElementById(s);
const F=window.Feedback, QN=window.Questions;
const SUB={zh:["這裡替你記住了","收進這個安靜的地方了","路上又亮了一點"],en:["This place will remember it","Kept safe in the quiet","A little more light along the way"]};
const STAGES=["霧還很濃","有一點光","路漸漸清楚","風停了","豁然開朗"];
// one line per stage, each a little more open; shown in the language of the latest idea ([0] is the start, never a step up)
const CONGRATS={zh:["霧還很濃，但你已經開始了","霧散開一點，透進第一道光","路漸漸清楚了","風停了，四周很靜","雲散開了，你看見遠方"],
  en:["The mist is still thick, but you've begun","The mist thins, and the first light comes through","The way is growing clear","The wind has stilled; all is quiet","The clouds part, and you can see far away"]};
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
  if(ctx&&!introOn){   // while the intro plays, it chooses the sounds
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
    busy=false;showCenter(CONGRATS[(st.ideas[0]&&st.ideas[0].lang)==="en"?"en":"zh"][to],STAGES[to],3200);
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
const O_=$("onb");
function showOv(el){el.classList.add("on");requestAnimationFrame(()=>requestAnimationFrame(()=>el.classList.add("vis")));}
function hideOv(el,ms){el.classList.remove("vis");setTimeout(()=>el.classList.remove("on"),ms||900);}
let oStep=0,oPicked={};
function startOnb(){
  oStep=0;oPicked={};O_.classList.remove("ending");$("oEnd").classList.remove("on");
  document.querySelectorAll(".ocard").forEach(c=>c.classList.toggle("sel",false));$("oNext").classList.remove("show");
  goStep(0);showOv(O_);}
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
// ---------- first open: the journey of one drop (Kumoma 雲間 intro) ----------
// One canvas, drawn as a pure function of time t, so tapping ahead, skipping and reduced motion are all just "which t to draw".
// The same drop is the subject throughout; every scene starts where the previous one left it.
const I_=$("intro"),icv=$("introCv"),ix=icv.getContext("2d"),ibuf=document.createElement("canvas"),ilay=document.createElement("canvas");
const ZH=(document.documentElement.lang||"zh").toLowerCase().startsWith("zh");
const IT={start:[0,2.4,4.8,7.2,12.2,16.6],title:16.9,tag:17.4,btn:18.0,hold:19.4};
const ICAP=[[.3,2.3,"雲裡，有什麼正在凝聚","In the clouds, something begins to gather."],
  [2.65,4.7,"隨雨落下，在葉尖停了一下","Falling with the rain, it pauses on a leaf's tip."],
  [5.05,7.1,"在高處結成雪，又靜靜化開","High above, it turns to snow, then quietly melts."],
  [7.4,9.2,"從山縫滴下，隨溪流入海","Dripping from the mountain, flowing with the stream into the sea."],
  [9.3,10.7,"越沉越深，直到最靜的地方","Deeper and deeper, down to the stillest place."],
  [12.6,16.4,"遇光而升，穿過雲間，觸到星空的靜","Meeting the light, it rises through the clouds and touches the silence of the stars."]];
// reduced motion: one still per moment, cross-faded (segment start -> the instant shown)
const IREP=[[0,1.9],[2.4,3.6],[4.8,5.9],[7.2,8.5],[9.25,10.2],[11.2,11.7],[12.2,15.3],[16.6,99]];
let X=ix,IW=0,IH=0,iRaf=0,iBase=0,iAt=0,iOn=false,iThen="onb",iSilent=false,iCapI=-1,iCapEl=null,iRep=-1,iTick=0,iLast=0,iRock=null,iStars=null,iRidge=null,uwG=null;
var introOn=false;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),sm=(a,b,v)=>{const x=clamp((v-a)/(b-a));return x*x*(3-2*x);};
const rnd=i=>{const s=Math.sin(i*127.1+311.7)*43758.5453;return s-Math.floor(s);};
const iNow=()=>iBase+(performance.now()-iAt)/1000,setT=t=>{iBase=t;iAt=performance.now();};
const sceneOf=t=>{let i=0;for(let k=0;k<6;k++)if(t>=IT.start[k])i=k;return i;};
// ---- painting helpers (draw into X, which is the screen or the cross-fade buffer) ----
function vgrad(stops,y0=0,y1=IH){const a=Math.max(0,y0),b=Math.min(IH,y1);if(b<=a)return;const g=X.createLinearGradient(0,y0,0,y1);for(const[p,c]of stops)g.addColorStop(p,c);X.fillStyle=g;X.fillRect(0,a,IW,b-a);}
function soft(x,y,r,col,a,add){if(a<.005||r<.5)return;if(add)X.globalCompositeOperation="lighter";const g=X.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,`rgba(${col},${a})`);g.addColorStop(1,`rgba(${col},0)`);X.fillStyle=g;X.fillRect(x-r,y-r,2*r,2*r);X.globalCompositeOperation="source-over";}
function cloudSprites(n,seed,y0,speed,alpha,u){   // drifting / rushing cloud puffs, positions from t only
  for(let i=0;i<n;i++){const k=seed+i,w=IW*(.9+rnd(k+5)*1.1),h=w*.5;
    let y=((rnd(k+3)*1.7-.35)+y0)%1.7;if(y<0)y+=1.7;y-=.35;
    const x=(rnd(k)*1.4-.2)*IW+u*(rnd(k+9)-.5)*24;X.globalAlpha=clamp(alpha*(.45+.55*rnd(k+7)));
    X.drawImage(SPR[k%SPR.length],x-w/2,y*IH-h/2,w,h);}
  X.globalAlpha=1;}
function drop(x,y,r,st,a,cold){
  if(r<.4||a<.01)return;soft(x,y,r*4.5,cold?"190,215,235":"235,240,235",.16*a,true);
  X.save();X.globalAlpha=a;X.translate(x,y);X.scale(1,1+st);
  X.beginPath();X.moveTo(0,-r*1.9);X.bezierCurveTo(r*.55,-r*1.1,r,-r*.4,r,r*.12);X.arc(0,r*.12,r,0,Math.PI);X.bezierCurveTo(-r,-r*.4,-r*.55,-r*1.1,0,-r*1.9);X.closePath();
  const g=X.createRadialGradient(-r*.3,-r*.25,r*.1,0,0,r*1.6);
  g.addColorStop(0,"rgba(255,255,255,.7)");g.addColorStop(.45,cold?"rgba(175,200,222,.42)":"rgba(196,210,214,.38)");g.addColorStop(1,cold?"rgba(90,120,150,.75)":"rgba(105,125,130,.72)");
  X.fillStyle=g;X.fill();X.strokeStyle="rgba(255,255,255,.4)";X.lineWidth=.8;X.stroke();
  X.fillStyle="rgba(255,255,255,.9)";X.beginPath();X.ellipse(-r*.38,-r*.28,r*.22,r*.3,-.5,0,6.283);X.fill();
  X.strokeStyle="rgba(255,255,255,.35)";X.lineWidth=1;X.beginPath();X.arc(0,r*.12,r*.72,.35,Math.PI-.35);X.stroke();
  X.restore();}
function flake(x,y,s,rot,a){
  if(a<.01)return;soft(x,y,s*2.4,"220,232,250",.18*a,true);
  X.save();X.translate(x,y);X.rotate(rot);X.globalAlpha=a;X.strokeStyle="rgba(244,248,255,.95)";X.lineCap="round";
  for(let k=0;k<6;k++){X.rotate(Math.PI/3);X.lineWidth=1.3;X.beginPath();X.moveTo(0,0);X.lineTo(0,-s);
    for(const[p,l]of[[.42,.28],[.68,.2]]){X.moveTo(0,-s*p);X.lineTo(s*l,-s*(p+l*.8));X.moveTo(0,-s*p);X.lineTo(-s*l,-s*(p+l*.8));}X.lineWidth=.9;X.stroke();}
  X.restore();}
function sea(seaY,a,u,gap){       // the sea of cloud below; gap = width of the opening in the middle (scene 6)
  if(a<.01)return;const L=ilay.getContext("2d");L.setTransform(1,0,0,1,0,0);L.clearRect(0,0,ilay.width,ilay.height);const d=ilay.width/IW;L.setTransform(d,0,0,d,0,0);
  const w=IW*2,h=IH*.5,y=IH*seaY-IH*.07,sx=(u*5)%w;L.drawImage(seaCv,-sx,y,w,h);L.drawImage(seaCv,w-sx,y,w,h);
  if(gap>1){L.globalCompositeOperation="destination-out";const cy=IH*seaY+IH*.035;L.save();L.translate(IW/2,cy);L.scale(1,.34);
    const g=L.createRadialGradient(0,0,0,0,0,gap);g.addColorStop(0,"rgba(0,0,0,1)");g.addColorStop(.55,"rgba(0,0,0,.85)");g.addColorStop(1,"rgba(0,0,0,0)");L.fillStyle=g;L.fillRect(-gap,-gap,2*gap,2*gap);L.restore();L.globalCompositeOperation="source-over";}
  X.globalAlpha=a;X.drawImage(ilay,0,0,IW,IH);X.globalAlpha=1;}
function iPrep(){
  for(const c of[ibuf,ilay]){c.width=icv.width;c.height=icv.height;}
  const d=icv.width/IW;
  iStars=document.createElement("canvas");iStars.width=IW*d;iStars.height=IH*.72*d;{const g=iStars.getContext("2d");g.scale(d,d);
    for(let i=0,n=Math.round(IW*IH/2300);i<n;i++){const y=Math.pow(rnd(i*3+1),1.3)*IH*.72;g.globalAlpha=(.2+.7*rnd(i*3+2))*(1-y/(IH*.8));g.fillStyle=rnd(i)<.2?"#dfe6ff":"#fff";g.beginPath();g.arc(rnd(i*3)*IW,y,rnd(i*7)<.07?1.15:.5+.4*rnd(i*5),0,6.283);g.fill();}}
  iRidge=[0,1].map(r=>Array.from({length:26},(_,i)=>{const p=i/25;return Math.sin(p*7+r*2)*.35+Math.sin(p*17+r)*.18+rnd(i+r*40)*.3;}));
  // rock face with a crack, where the drop comes out
  iRock=document.createElement("canvas");iRock.width=IW*d;iRock.height=IH*.7*d;{const g=iRock.getContext("2d");g.scale(d,d);const H=IH*.7;
    const f=g.createLinearGradient(0,0,0,H);f.addColorStop(0,"#2c3234");f.addColorStop(1,"#171b1d");g.fillStyle=f;g.fillRect(0,0,IW,H);
    for(let i=0;i<140;i++){const x=rnd(i)*IW,y=rnd(i+1)*H,r=12+rnd(i+2)*60,gr=g.createRadialGradient(x,y,0,x,y,r),c=rnd(i+3)<.45?"255,255,255,.05":"0,0,0,.28";   // weathered patches
      gr.addColorStop(0,`rgba(${c})`);gr.addColorStop(1,"rgba(0,0,0,0)");g.fillStyle=gr;g.fillRect(x-r,y-r,2*r,2*r);}
    for(let i=0;i<16;i++){let x=rnd(i+300)*IW,y=rnd(i+301)*H;const dx=(rnd(i+302)-.5)*1.6;g.beginPath();g.moveTo(x,y);      // a few slanting fractures
      for(let k=0;k<5;k++){x+=dx*14+(rnd(i*9+k)-.5)*10;y+=10+rnd(i*7+k)*16;g.lineTo(x,y);}g.strokeStyle="rgba(0,0,0,.4)";g.lineWidth=.9;g.stroke();}
    g.globalCompositeOperation="destination-out";g.beginPath();g.moveTo(0,0);for(let i=0;i<=20;i++)g.lineTo(IW*i/20,IH*(.012+.03*rnd(i+90))*(Math.abs(i-10)<2?0.4:1));g.lineTo(IW,0);g.fill();g.globalCompositeOperation="source-over";
    let x=IW/2,y=IH*.03;g.beginPath();g.moveTo(x,y);while(y<H){y+=8+rnd(y)*16;x=IW/2+(rnd(y+1)-.5)*10;g.lineTo(x,y);}g.strokeStyle="#07090a";g.lineWidth=2.4;g.stroke();g.strokeStyle="rgba(255,255,255,.07)";g.lineWidth=.8;g.translate(1.4,0);g.stroke();}
}
// ---- the six moments ----
function s1(u){vgrad([[0,"#7d878b"],[.5,"#9aa2a5"],[1,"#5a6266"]]);cloudSprites(14,10,u*.004,0,.62,u);
  const cx=IW/2,cy=IH*.4;
  for(let i=0;i<26;i++){const p=sm(.15,2.0,u+rnd(i+50)*.35),ang=rnd(i+60)*6.283,R=IW*(.22+.25*rnd(i+70))*(1-p);soft(cx+Math.cos(ang)*R,cy+Math.sin(ang)*R*.8,3.5,"255,255,255",.5*Math.sin(Math.PI*p),true);}
  const r=7*sm(.45,2.05,u);soft(cx,cy,40*sm(.3,2.1,u),"255,255,250",.18,true);drop(cx,cy,r,0,sm(.4,1.2,u));}
const tipX=()=>IW*.5,tipY=()=>IH*.565;
function s2(u){vgrad([[0,"#4c5759"],[.6,"#384244"],[1,"#232a2c"]]);cloudSprites(8,30,0,0,.22,u);
  const ra=sm(0,.5,u);X.strokeStyle="rgba(210,222,230,1)";X.lineWidth=.8;
  for(let i=0;i<70;i++){const v=900+rnd(i+1)*500,l=16+rnd(i+2)*18,y=((rnd(i+3)*(IH+80)+u*v)%(IH+80))-40,x=rnd(i)*IW*1.3-IW*.15+y*.22;X.globalAlpha=(.1+.16*rnd(i+4))*ra;X.beginPath();X.moveTo(x,y);X.lineTo(x+l*.22,y+l);X.stroke();}
  X.globalAlpha=1;
  const sag=u<1.55?5*sm(.6,.85,u):5*Math.exp(-(u-1.55)*5)*Math.cos((u-1.55)*18);
  const tx=tipX(),ty=tipY()+sag;          // the leaf, reaching in from the right
  X.beginPath();X.moveTo(IW*1.08,IH*.47);X.quadraticCurveTo(IW*.78,IH*.47,tx,ty);X.quadraticCurveTo(IW*.8,IH*.6,IW*1.08,IH*.53);X.closePath();
  const lg=X.createLinearGradient(tx,0,IW,0);lg.addColorStop(0,"#4c604f");lg.addColorStop(1,"#26332a");X.fillStyle=lg;X.globalAlpha=sm(0,.4,u);X.fill();
  X.strokeStyle="rgba(200,220,190,.25)";X.lineWidth=1;X.beginPath();X.moveTo(IW*1.08,IH*.5);X.quadraticCurveTo(IW*.8,IH*.52,tx+3,ty);X.stroke();X.globalAlpha=1;
  const r=7;let x=IW/2,y,st=0;
  if(u<.7){const p=(u/.7)**2;y=lerp(IH*.4,ty+r,p);st=.25*p;}
  else if(u<1.55){y=ty+r*(1+.12*Math.sin((u-.7)*9));x+=Math.sin(u*38)*1.1*sm(.85,1.05,u)*(1-sm(1.35,1.55,u));}
  else{const p=((u-1.55)/.85)**2;y=lerp(tipY()+r,IH*.7,p);st=.3*p;}
  drop(x,y,r,st,1);}
function s3(u){vgrad([[0,"#6a7681"],[.55,"#535e69"],[1,"#323a43"]]);cloudSprites(8,50,0,0,.3,u);
  for(let i=0;i<34;i++){const y=((rnd(i+1)*IH+u*(14+rnd(i+2)*22))%IH),x=rnd(i)*IW+Math.sin(u*.8+i)*8;soft(x,y,1.6+rnd(i+3)*2.2,"240,245,255",.55*sm(0,.6,u),false);}
  const y=lerp(IH*.7,IH*.755,u/2.4),x=IW/2+Math.sin(u*1.7)*10*sm(.3,.8,u)*(1-sm(1.9,2.4,u));
  const m=sm(.2,.75,u)*(1-sm(1.55,2.1,u));
  drop(x,y,7*(1-m),0,1-m,true);flake(x,y,7+7*m,u*.55,m);}
function s4(u){
  const off=sm(.35,3.85,u)*3.2*IH,wy=y=>y*IH-off;
  vgrad([[0,"#3a4552"],[.62,"#6e7983"],[1,"#58626b"]],wy(0),wy(1.0));
  iRidge.forEach((pts,r)=>{const base=.6+r*.06,amp=IH*(.05+r*.025);X.fillStyle=r?"#3c454d":"#5a656e";X.beginPath();X.moveTo(0,wy(1.0));
    pts.forEach((h,i)=>X.lineTo(IW*i/25,wy(base)-h*amp));X.lineTo(IW,wy(1.0));X.fill();});
  X.drawImage(iRock,0,wy(.71),IW,IH*.7);
  vgrad([[0,"#22292b"],[.08,"#4b6367"],[1,"#38525a"]],wy(1.36),wy(1.72));                         // the stream
  X.strokeStyle="rgba(220,235,235,1)";X.lineWidth=1;
  for(let i=0;i<46;i++){const yy=wy(1.39+rnd(i+1)*.31),xx=((rnd(i)*(IW+60)+u*(50+rnd(i+2)*70))%(IW+60))-30,l=10+rnd(i+3)*26;X.globalAlpha=.1+.2*rnd(i+4);X.beginPath();X.moveTo(xx,yy);X.lineTo(xx+l,yy);X.stroke();}
  X.globalAlpha=1;
  vgrad([[0,"#2f5361"],[.18,"#173445"],[.42,"#0a1a27"],[.65,"#03080e"],[.85,"#000"],[1,"#000"]],wy(1.72),wy(4.4));   // into the sea
  X.fillStyle="rgba(200,222,232,.5)";X.fillRect(0,wy(1.72),IW,1.2);
  for(let k=0;k<4;k++){const x0=IW*(.15+.22*k);X.globalAlpha=.07*(1-sm(1.8,2.6,(off/IH)+.5));X.fillStyle="#cfe3ea";X.beginPath();X.moveTo(x0,wy(1.72));X.lineTo(x0+30,wy(1.72));X.lineTo(x0+150,wy(2.6));X.lineTo(x0+60,wy(2.6));X.fill();}
  X.globalAlpha=1;
  for(let i=0;i<50;i++){const w=1.8+rnd(i+1)*2.4,yy=wy(w);if(yy<-5||yy>IH+5)continue;soft(rnd(i)*IW,yy,1.6,"190,215,225",.35*(1-sm(2.2,3.6,w)),false);}
  const y=lerp(IH*.755,IH*.45,sm(.3,1.4,u)),depth=(y+off)/IH;
  drop(IW/2,y,7*(1+.06*Math.sin(u*3)*(1-sm(.2,.4,u))),u>.35&&u<1.4?.18:0,1-.92*sm(2.0,3.9,depth),depth>1.72);
  X.fillStyle=`rgba(0,0,0,${sm(3.65,4.0,u)})`;X.fillRect(0,0,IW,IH);}
function s5(u){
  const rise=sm(1.5,2.5,u),top=lerp(3.3,.9,rise);        // camera climbing back up through the water
  X.fillStyle="#000";X.fillRect(0,0,IW,IH);
  const wy=y=>(y-top)*IH;
  vgrad([[0,"#2f5361"],[.18,"#173445"],[.42,"#0a1a27"],[.65,"#03080e"],[.85,"#000"],[1,"#000"]],wy(1.72),wy(4.4));
  if(wy(1.72)>0){X.fillStyle="#97a2a8";X.fillRect(0,0,IW,wy(1.72));X.fillStyle="rgba(230,240,245,.7)";X.fillRect(0,wy(1.72)-1,IW,2);}
  const beam=sm(.15,1.0,u)*(1-sm(2.2,2.8,u));             // light from the surface
  if(beam>0){X.globalCompositeOperation="lighter";const g=X.createLinearGradient(0,0,0,IH*.85);g.addColorStop(0,`rgba(175,205,220,${.38*beam})`);g.addColorStop(1,"rgba(175,205,220,0)");
    X.fillStyle=g;X.beginPath();X.moveTo(IW*.44,0);X.lineTo(IW*.56,0);X.lineTo(IW*.8,IH*.85);X.lineTo(IW*.2,IH*.85);X.fill();X.globalCompositeOperation="source-over";}
  const c0=sm(2.15,2.45,u);                                  // above the water: into the clouds, then the dark blue
  if(c0>0){X.globalAlpha=c0;const k=sm(2.5,3.9,u),col=(a,b)=>`rgb(${lerp(a[0],b[0],k)|0},${lerp(a[1],b[1],k)|0},${lerp(a[2],b[2],k)|0})`;
    vgrad([[0,col([150,158,165],[10,16,34])],[.6,col([172,179,185],[30,42,72])],[1,col([140,148,156],[48,60,92])]]);X.globalAlpha=1;
    X.globalAlpha=sm(3.3,4.4,u);X.drawImage(iStars,0,0,IW,IH*.72);X.globalAlpha=1;
    sea(.72,sm(3.4,4.3,u),u,0);
    cloudSprites(18,80,3.4*sm(2.1,3.95,u),0,.95*c0*(1-sm(3.4,3.95,u)),u);}
  const x=IW/2,y=lerp(IH*.45,IH*.4,sm(1.0,2.2,u)),vap=sm(1.0,1.8,u);
  drop(x,y,7*(1-vap),0,sm(.35,.9,u)*(1-vap));
  for(let i=0;i<18;i++){const t0=1.0+rnd(i+200)*.9,a=u-t0;if(a<0||a>1.6)continue;soft(x+Math.sin(a*3+i)*10*a+(rnd(i+201)-.5)*12,y-a*(35+rnd(i+202)*40),2.5+a*3,"235,242,245",.45*(1-a/1.6),true);}
  soft(x,y,12,"255,246,225",.55*vap,true);soft(x,y,2,"255,255,255",.95*vap,true);}
function gapY(){return IH*.66+IH*.035;}
function s6(u){
  vgrad([[0,"#04060d"],[.45,"#0b1428"],[.64,"#1a2846"],[.7,"#2b3a5a"],[1,"#1b2438"]]);
  X.drawImage(iStars,0,0,IW,IH*.72);
  const seaY=lerp(.72,.66,sm(0,1.2,u)),gap=IW*(.05+.27*sm(.2,1.9,u)),br=.5+.5*Math.sin(u*1.5);
  soft(IW/2,IH*seaY+IH*.035,gap*1.6,"255,232,200",.22+.06*br,true);
  sea(seaY,1,u,gap);
  soft(IW/2,IH*seaY+IH*.035,gap*.9,"255,238,210",(.28+.08*br)*sm(.3,1.6,u),true);
  const p=sm(.15,1.6,u),y=lerp(IH*.4,IH*seaY+IH*.035,p);
  soft(IW/2,y,12,"255,246,225",.55*(1-sm(1.2,1.7,u)),true);soft(IW/2,y,2,"255,255,255",.95*(1-sm(1.2,1.7,u)),true);}
const SCN=[s1,s2,s3,s4,s5,s6];
function iDraw(t){
  const i=sceneOf(t),u=t-IT.start[i];X=ix;ix.globalAlpha=1;SCN[i](u);
  if(i>0&&i!==4&&u<.6){                                   // soft hand-over from the previous moment
    const bx=ibuf.getContext("2d"),d=ibuf.width/IW;bx.setTransform(d,0,0,d,0,0);X=bx;SCN[i-1](IT.start[i]-IT.start[i-1]);X=ix;
    ix.globalAlpha=1-sm(0,.6,u);ix.drawImage(ibuf,0,0,IW,IH);ix.globalAlpha=1;}
}
// ---- words ----
function iCaption(t){
  let k=-1;for(let j=0;j<ICAP.length;j++)if(t>=ICAP[j][0]&&t<ICAP[j][1])k=j;
  if(k===iCapI)return;iCapI=k;
  if(iCapEl){const o=iCapEl;o.classList.add("out");setTimeout(()=>o.remove(),600);iCapEl=null;}
  if(k<0)return;const el=document.createElement("div");el.className="icap";
  [...ICAP[k][ZH?2:3]].forEach((ch,j)=>{const s=document.createElement("span");s.textContent=ch;s.style.animationDelay=(j*(ZH?.06:.018))+"s";el.appendChild(s);});
  I_.appendChild(el);iCapEl=el;}
function iTitle(t){I_.classList.toggle("t1",t>=IT.title);I_.classList.toggle("t2",t>=IT.tag);I_.classList.toggle("t3",t>=IT.btn);}
// ---- sound: the existing beds, plus a live, very low underwater rumble ----
const IBEDS=["pad_ethereal","rain_soft","snow_hush","stream","reuniverse_hush"];
function iWant(t){
  if(iSilent)return{};const i=sceneOf(t),u=t-IT.start[i];
  if(i===0)return{pad_ethereal:.5};if(i===1)return{rain_soft:.9};if(i===2)return{snow_hush:1};
  if(i===3)return u<1.6?{stream:.7}:u<3.6?{uw:.9}:{};
  if(i===4)return u<1.4?(u>.2?{uw:.3}:{}):{reuniverse_hush:1};
  return{reuniverse_hush:.25};}
function uw(v){
  if(!ctx)return;
  if(!uwG){if(!v)return;const n=ctx.createBuffer(2,ctx.sampleRate*6,ctx.sampleRate);
    for(let c=0;c<2;c++){const d=n.getChannelData(c);let b=0;for(let i=0;i<d.length;i++){b=(b+.02*(Math.random()*2-1))/1.02;d[i]=b;}
      for(let i=0,f=ctx.sampleRate;i<f;i++){const w=i/f;d[i]*=w;d[d.length-1-i]*=w;}}   // soft ends, so the loop point is silent
    const s=ctx.createBufferSource();s.buffer=n;s.loop=true;const f=ctx.createBiquadFilter();f.type="lowpass";f.frequency.value=150;f.Q.value=.5;
    uwG=ctx.createGain();uwG.gain.value=0;s.connect(f);f.connect(uwG);uwG.connect(master);s.start();uwG.src=s;uwG.v=0;}
  if(Math.abs(uwG.v-v)>.01){uwG.v=v;fadeTo(uwG,v,1.2);}}
function iSound(t){
  if(!ctx)return;setFilter(4);const w=iWant(t);
  for(const n of IBEDS)setLoop(n,w[n]||0,1.2);uw(w.uw||0);}
// ---- clock ----
function iSize(){const d=Math.min(devicePixelRatio||1,1.5);IW=innerWidth;IH=innerHeight;icv.width=IW*d;icv.height=IH*d;ix.setTransform(d,0,0,d,0,0);iPrep();
  $("iGo").style.top=gapY()+"px";}
function iShow(t){
  if(!reduceMotion){iDraw(t);return;}
  let r=0;for(let k=0;k<IREP.length;k++)if(t>=IREP[k][0])r=k;
  if(r===iRep)return;const first=iRep<0;iRep=r;
  const paint=()=>{iDraw(IREP[r][1]);icv.style.opacity=1;};
  if(first)paint();else{icv.style.opacity=0;setTimeout(paint,450);}}
function iFrame(now){
  const t=iNow();
  if(t<IT.hold+1.5||now-iLast>=33){iShow(t);iLast=now;}   // after the title settles, 30 fps is plenty
  iCaption(t);iTitle(t);if(now-iTick>200){iTick=now;iSound(t);}
  iRaf=iOn?requestAnimationFrame(iFrame):0;}
function playIntro(o){
  iThen=o.then;iSilent=!!o.hold;introOn=true;iOn=true;iRep=-1;iCapI=-1;if(iCapEl){iCapEl.remove();iCapEl=null;}
  I_.classList.remove("through","t1","t2","t3","now");I_.classList.toggle("rm",reduceMotion);I_.classList.toggle("en",!ZH);
  $("iTag").textContent=ZH?"每個念頭，都是一滴回到雲間的水":"Every thought is a drop returning to the clouds.";
  $("iGo").textContent=ZH?"走進寧靜":"Into the quiet";$("iSkip").textContent=ZH?"略過":"Skip";
  icv.style.opacity=1;iSize();setT(o.hold?IT.hold:0);if(o.hold)I_.classList.add("now");
  showOv(I_);ta.blur();if(!iRaf)iRaf=requestAnimationFrame(iFrame);}
function endIntro(){
  iOn=false;introOn=false;
  if(uwG){const g=uwG;uwG=null;fadeTo(g,0,.8);setTimeout(()=>{try{g.src.stop();}catch(e){}g.disconnect();},1200);}
  if(ctx)for(const n of IBEDS)setLoop(n,0,1);
  setTimeout(syncAudio,50);}
I_.addEventListener("click",e=>{                         // tap anywhere: on to the next moment
  if(e.target.closest("#iGo,#iSkip")||I_.classList.contains("through"))return;
  const t=iNow(),nx=IT.start.find(s=>s>t+.05);if(nx!==undefined)setT(nx);});
$("iSkip").onclick=e=>{e.stopPropagation();iSilent=true;if(ctx){for(const n of IBEDS)setLoop(n,0,.6);uw(0);}
  setT(Math.max(iNow(),IT.hold));I_.classList.add("now");};
$("iGo").onclick=e=>{
  e.stopPropagation();unlock();saveTone(.8);iSilent=true;
  I_.classList.add("through");                            // through the gap in the clouds
  if(iThen==="onb")setTimeout(startOnb,800);
  setTimeout(()=>{hideOv(I_,700);setTimeout(endIntro,750);},1300);};
addEventListener("resize",()=>{if(iOn)iSize();});
window.__intro={get on(){return iOn},get t(){return Math.round(iNow()*100)/100},get scene(){return sceneOf(iNow())+1},get caption(){return iCapEl?iCapEl.textContent:""}};
$("reWelcome").onclick=()=>{close();setTimeout(()=>playIntro({hold:true,then:"onb"}),350);};
$("reIntro").onclick=()=>{close();setTimeout(()=>playIntro({hold:false,then:st.onboarded?"home":"onb"}),350);};
// the intro plays by itself once, on the very first open; until onboarding is done we come back to its last frame
if(!st.onboarded){const first=!st.introSeen;st.introSeen=true;persist();playIntro({hold:!first,then:"onb"});}
updateStarter();
})();
