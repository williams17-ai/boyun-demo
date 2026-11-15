/* 撥雲見日 rule-based feedback — no AI, all client-side.
   Research rules: specific & process-focused, quote the user's own word, low-key,
   never praise intelligence/talent, never compare, ~20% just a quiet acknowledgment. */
(function(root){
const KW={
 business:{
  zh:["客群","客戶","收費","付費","訂閱","市場","競品","競爭","MVP","商業模式","獲利","營收","用戶","使用者","定價","價格","成本","通路","行銷","品牌","商機","創業","產品","服務","募資","投資","利潤","銷售","業績","變現","痛點","需求","合作","B2B","B2C","商品","App","平台","會員","流量","轉換","方案","報價","提案","擺攤","市集","折扣","優惠","開店","小店","生意","接案","顧客","消費者","賣"],
  en:["price","pricing","customer","customers","client","revenue","subscription","subscribe","market","competitor","competition","mvp","business model","profit","monetize","monetization","users","user","sales","startup","product","launch","pitch","funding","investor","b2b","b2c","growth","marketing","brand","churn","conversion","pain point","niche","freemium","saas","app","platform","service","margin","cost","sell","selling","shop","store","discount","deal","side hustle","freelance"]},
 mood:{
  zh:["失望","委屈","焦躁","鬆一口氣","覺得","感覺","累","疲憊","開心","快樂","高興","焦慮","緊張","擔心","害怕","難過","沮喪","煩","終於","想通","心情","壓力","放鬆","平靜","感動","感謝","孤單","迷惘","迷茫","生氣","失落","期待","興奮","安心","療癒","崩潰","撐","哭","笑","空","悶","慌"],
  en:["feel","feeling","felt","tired","exhausted","happy","glad","anxious","anxiety","worried","nervous","scared","sad","down","stressed","stress","finally","figured out","realized","mood","calm","relaxed","grateful","thankful","lonely","lost","overwhelmed","excited","hopeful","frustrated","angry","burnt out","burned out","cry","peaceful","disappointed","relieved","restless","hurt"]}
};
const POS={zh:["開心","快樂","高興","終於","想通","感動","感謝","興奮","期待","安心","療癒","平靜","放鬆","笑","鬆一口氣"],en:["happy","glad","excited","grateful","thankful","finally","figured out","realized","hopeful","calm","relaxed","peaceful","relieved"]};
const QUIET={zh:["收到了","記下了","嗯，記下了","好，收著了","在這裡了"],en:["Got it.","Noted.","Kept it.","It's here now.","Mm, written down."]};
const L={
zh:{
 general:{plain:["你把它寫下來了，這一步最重要","記下來了，它不會再飄走","這個念頭，現在有地方放了","你注意到了一件小事，這很珍貴","慢慢寫就好，你已經開始了","霧又散了一點點","說出口之後，它就清楚一些了","這一句，值得被記住","好，這顆種子先種下","寫下來的那一刻，它就是你的了","寫得很實在，讀起來有畫面"],
          kw:["你寫到「{k}」，這個詞很有畫面","「{k}」——記下了，這是個好線頭","從「{k}」開始，已經很清楚了"]},
 business:{plain:["這是個可以動手試的念頭。下一步：想一個最可能用它的人","你在想一個真實的麻煩。試著用一句話說它解決什麼","下班後可以花 10 分鐘，查查有沒有類似的做法","一塊一塊拼起來就是方向，今天又多一塊","挑一位朋友問問：你會用這個嗎？","把想法寫成一句話很不容易，你做到了","週末可以畫一張最簡單的流程圖，看看它長什麼樣","下一步只要一件事：找一個人聊聊它","最小能先試的版本是什麼？不急，記著就好"],
           kw:["你寫到「{k}」，這是很好的切入點","「{k}」這條線，值得再想想","把「{k}」想清楚，整件事就清楚一半","你把「{k}」說出來了，接下來就好問下去"]},
 mood:{neu:["謝謝你把心情寫下來","能說出自己的感受，本身就不容易","這份心情，被好好接住了","情緒也是線索，它在告訴你什麼是重要的","你對自己很誠實","每一步心情的轉折，都是你在往前走"],
       neg:["今天能寫下來，就夠了","累的時候還願意寫，辛苦了","這很正常，很多人也卡過這裡","先深呼吸一下，不用急著好起來","心裡的霧，寫下來會慢慢散開","先照顧好自己，點子會一直在這裡等你","今天的你不用完美"],
       pos:["這份好心情，也替你存起來了","「終於想通」的感覺很珍貴","開心的時刻值得被記住，謝謝你分享"],
       kw:["「{k}」——你說得很清楚","你用「{k}」形容它，很準確","「{k}」，嗯，聽見了"]},
 extension:{plain:["你又往下想了一層，越來越清楚","你把它說得更具體了","這一層寫得很實在","點子開始長出枝葉了","從一個點走到一條線了","你在回答自己的問題，這很好","多想這一步，原本的想法更站得住腳","慢慢挖，答案就在下面"],
            kw:["「{k}」這個回答很具體","你用了「{k}」，一下就清楚了","有了「{k}」，輪廓更清楚了"]}},
en:{
 general:{plain:["You wrote it down — that's the most important step.","Noted. It won't drift away now.","This thought has a place to live now.","You noticed something small. That matters.","Take your time — you've already started.","The mist cleared a little.","Once it's said, it gets clearer.","This line is worth keeping.","Okay — this seed is planted.","The moment it's written, it's yours."],
          kw:["You wrote \"{k}\" — that word carries a picture.","\"{k}\" — noted. That's a good thread.","Starting from \"{k}\" already makes it clearer."]},
 business:{plain:["This is something you could try. Next: think of one person most likely to use it.","You're thinking about a real problem. Try saying what it solves in one sentence.","After work, spend 10 minutes checking for similar ideas.","Piece by piece it becomes a direction — one more piece today.","Ask one friend: would you use this?","Putting an idea into one sentence isn't easy. You did it.","This weekend, sketch the simplest flow and see what it looks like.","Only one next step: talk to one person about it.","What's the smallest version you could try? No rush — just keep it in mind."],
           kw:["You wrote \"{k}\" — that's a good way in.","\"{k}\" is a thread worth following.","Get \"{k}\" clear and half the picture is clear.","You named \"{k}\". Now it's easier to ask the next question."]},
 mood:{neu:["Thank you for writing this feeling down.","Putting a feeling into words isn't easy.","This feeling has been heard.","Feelings are clues; they point to what matters to you.","You're being honest with yourself.","Every shift in your mood is still a step forward."],
       neg:["Writing it down today is enough.","Even tired, you still wrote. That's a lot.","This is normal — many people get stuck here too.","Breathe. You don't have to feel better right away.","The fog inside clears a little once it's written.","Take care of you first. Your ideas will wait.","You don't have to be perfect today."],
       pos:["Keeping this good feeling safe for you too.","That 'finally figured it out' moment is precious.","Happy moments deserve to be kept. Thanks for sharing."],
       kw:["\"{k}\" — you said it clearly.","\"{k}\" is a precise word for it.","\"{k}\". Mm, heard."]},
 extension:{plain:["You went one layer deeper — it's getting clearer.","You made it more concrete.","This layer is very grounded.","The idea is growing branches.","From a dot to a line.","You're answering your own question. That's good.","One more step makes the first idea stand taller.","Keep digging slowly; the answer is just below."],
            kw:["\"{k}\" — a very concrete answer.","Using \"{k}\" made it click.","With \"{k}\", the outline is sharper."]}}};
const STREAK={zh:["第 {n} 個了，思緒正在流動","又一個，慢慢來也沒關係","{n} 個接連冒出來了","寫得很順，繼續","第 {n} 個，收好了"],
              en:["That's {n} — your thoughts are flowing.","Another one. No rush.","{n} in a row now.","It's flowing. Keep going.","Number {n}, kept."]};
const SUMMARY={zh:["剛剛一口氣記下了 {n} 個","這一段寫了 {n} 個，可以喘口氣了","{n} 個念頭，都收好了"],
               en:["You just wrote down {n} ideas in one go.","{n} thoughts, all kept safe.","That was {n} in a row. Take a breath."]};
const ZH_STOP=new Set("的了是我在有和要就也都很把被讓給跟與但而這那個一不會去來說想做到著過嗎呢吧啊喔".split(""));
const EN_STOP=new Set("the a an and or but if then this that these those with from into about for of to in on at by is are was were be been being have has had do does did will would can could should may might i me my we our you your it its they them their what when where which who how just really very some more most other than so not no yes there here also because".split(" "));
function detectLang(text){
  const s=String(text||"");
  const cjk=(s.match(/[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff]/g)||[]).length;
  const lat=(s.match(/[A-Za-z]/g)||[]).length;
  if(lat===0) return "zh"; if(cjk===0) return "en";
  return lat/4 > cjk*3 ? "en" : "zh";
}
function findKw(text,list){
  const low=String(text).toLowerCase(); const hits=[];
  for(const k of list){const kl=k.toLowerCase();
    if(/^[a-z ]+$/.test(kl)){ if(new RegExp("\\b"+kl.replace(/ /g,"\\s+")+"\\b").test(low)) hits.push(k);}
    else if(low.includes(kl)) hits.push(k);}
  return hits;
}
function detectCategory(text,lang){
  const o=(lang||detectLang(text))==="en"?["en","zh"]:["zh","en"];
  const b=findKw(text,KW.business[o[0]].concat(KW.business[o[1]]));
  const m=findKw(text,KW.mood[o[0]].concat(KW.mood[o[1]]));
  if(!b.length&&!m.length) return {cat:"general",kw:null};
  if(m.length>b.length) return {cat:"mood",kw:m[0]};
  return {cat:"business",kw:b[0]};
}
/* the user's own word, for quoting (Clean Language style) */
function salient(text,lang){
  const s=String(text||"").trim(); lang=lang||detectLang(s);
  const q=s.match(/[「『"“]([^」』"”]{1,12})[」』"”]/); if(q) return q[1].trim();
  const GENERIC=["覺得","感覺","心情","終於","feel","feeling","felt","mood","finally","user","users","app","賣","撐","笑","哭","空"];
  const o=lang==="en"?["en","zh"]:["zh","en"];
  const hits=findKw(s,KW.mood[o[0]].concat(KW.business[o[0]],KW.mood[o[1]],KW.business[o[1]])).filter(k=>!GENERIC.includes(k.toLowerCase()));
  if(hits.length) return hits.sort((a,b)=>b.length-a.length)[0];
  if(lang==="en"){
    const words=s.toLowerCase().match(/[a-z][a-z'-]+/g)||[];
    if(words.length&&words.length<=2) return s.replace(/[.!?。！？]+$/,"");
    const c=words.filter(w=>w.length>=5&&!EN_STOP.has(w)).sort((a,b)=>b.length-a.length); return c[0]||null;
  }
  const bare=s.replace(/[\s，。！？、,.!?…~～]/g,"");
  if(bare.length>=1&&bare.length<=5) return bare;            // a one-word feeling, a short phrase
  return null;
}
function moodTone(text){
  const p=findKw(text,POS.zh.concat(POS.en)).length, all=findKw(text,KW.mood.zh.concat(KW.mood.en)).length, n=all-p;
  return p&&!n?"pos":n&&!p?"neg":"mix";
}
const recent=[];
function pick(arr,rand){rand=rand||Math.random;
  let i,tries=0; do{i=Math.floor(rand()*arr.length);tries++;}while(recent.includes(arr[i])&&tries<8);
  recent.push(arr[i]); if(recent.length>10) recent.shift(); return arr[i];}
/* opts: {isExtension, streak, rand, quietRate} */
function feedback(text,opts){
  opts=opts||{}; const rand=opts.rand||Math.random;
  const lang=detectLang(text); const d=detectCategory(text,lang);
  const cat=opts.isExtension?"extension":d.cat;
  const word=salient(text,lang);
  let line,quiet=false,quoted=null;
  if(rand()<(opts.quietRate??0.2)){line=pick(QUIET[lang],rand);quiet=true;}
  else{
    const P=L[lang][cat];
    let pool;
    if(cat==="mood"){const t=moodTone(text);pool=P.neu.concat(t==="pos"?P.pos:t==="neg"?P.neg:P.neg.slice(0,3).concat(P.pos.slice(1,2)));}
    else pool=P.plain;
    if(word&&P.kw&&rand()<0.5&&word.length<=(lang==="en"?24:8)){line=pick(P.kw,rand).replace("{k}",word);quoted=word;}
    else line=pick(pool,rand);
  }
  let streak=null;
  if(opts.streak>=2) streak=pick(STREAK[lang],rand).replace("{n}",opts.streak);
  return {lang,cat,kw:d.kw,word,line,quiet,quoted,streak};
}
function summary(n,lang){return pick(SUMMARY[lang||"zh"]).replace("{n}",n);}
const api={detectLang,detectCategory,salient,feedback,summary,LINES:L,QUIET};
if(typeof module!=="undefined"&&module.exports) module.exports=api; else root.Feedback=api;
})(this);
