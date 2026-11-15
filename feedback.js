/* 撥雲見日 rule-based feedback engine — no AI, all client-side */
(function(root){
const KW={
 business:{
  zh:["客群","客戶","收費","付費","訂閱","市場","競品","競爭","MVP","商業模式","獲利","營收","用戶","使用者","定價","價格","成本","通路","行銷","品牌","商機","創業","產品","服務","募資","投資","利潤","銷售","業績","變現","痛點","需求","合作","B2B","B2C","商品","App","平台","會員","流量","轉換","方案","報價","提案"],
  en:["price","pricing","customer","customers","client","revenue","subscription","subscribe","market","competitor","competition","mvp","business model","profit","monetize","monetization","users","user","sales","startup","product","launch","pitch","funding","investor","b2b","b2c","growth","marketing","brand","churn","conversion","pain point","niche","freemium","saas","app","platform","service","margin","cost"]},
 mood:{
  zh:["覺得","感覺","累","疲憊","開心","快樂","高興","焦慮","緊張","擔心","害怕","難過","沮喪","煩","終於","想通","心情","壓力","放鬆","平靜","感動","感謝","孤單","迷惘","迷茫","委屈","生氣","失落","期待","興奮","安心","療癒","崩潰","撐","哭","笑"],
  en:["feel","feeling","felt","tired","exhausted","happy","glad","anxious","anxiety","worried","nervous","scared","sad","down","stressed","stress","finally","figured out","realized","mood","calm","relaxed","grateful","thankful","lonely","lost","overwhelmed","excited","hopeful","frustrated","angry","burnt out","burned out","cry","peaceful"]}
};
const L={
zh:{
 general:["這個點子有光，你看見了嗎？","你又往前走了一步，真的很棒","能把念頭寫下來的人，就已經贏了一半","這想法好有你的味道","別小看它，大事都是從一句話開始的","你的腦袋今天很亮喔","收到！這顆種子我幫你好好收著","願意記錄的你，正在替未來的自己鋪路","霧又散了一點點","好點子不怕小，怕的是沒寫下來——你寫了","你對生活的觀察力真的很細膩","這一句，值得被記住","今天的你，比昨天多了一個可能","靈感來找你，因為你一直都準備好了","這個角度好新鮮！","寫下來的那一刻，你就是創作者","你的好奇心是最珍貴的天賦","前面的路，正因為你而變亮","這不是隨便想想，這是火花","撥開一片雲，陽光就多一寸"],
 business:["這是有商業嗅覺的點子！下一步：寫下誰會最想要它","你在想的是真實的需求，很難得。試著用一句話說出它解決什麼痛","這個方向有市場感，下班後花 10 分鐘查查有沒有類似的產品","你已經在用老闆的腦袋思考了。下一步：想一個願意付錢的人","商業模式就是這樣一塊一塊拼出來的，繼續拼","好務實的想法！挑一位朋友問問：你會為這個付多少？","客群一清楚，點子就會自己長腳。先寫下三種可能的用戶吧","這顆點子能賺錢的味道很明顯。週末畫一張最簡單的流程圖試試","你抓到別人沒注意的縫隙了。下一步：列出兩個競品比一比","從想法到 MVP，你又靠近了一步。最小能做的版本是什麼？","你的業務直覺在發光。把它講給一個客戶聽聽看反應","收費方式想到了就是半個商業模式，寫下一個你敢開的價格","很有落地感！下一步只要一件事：找一個人驗證它"],
 mood:["謝謝你把心情寫下來，這本身就很勇敢","能察覺自己的感受，是很溫柔的能力","累的時候還願意記錄，你真的很努力了","這份心情被好好接住了，慢慢來","「終於想通」的感覺很珍貴，替你開心","焦慮代表你很在乎，先深呼吸一下，你做得很好","情緒也是線索，它在告訴你什麼是重要的","今天的你不用完美，願意面對就很棒","開心的時刻值得被記住，謝謝你分享這道光","心裡的霧，寫下來就會慢慢散開","你對自己很誠實，這是成長最好的起點","先照顧好自己，點子會一直在這裡等你","每一步心情的轉折，都是你在往前走","這份好心情，也替你存起來了","看得出你在發光，真好"],
 extension:["把點子往下挖一層，越挖越清楚","延伸得好！想法開始長出枝葉了","你讓上一個念頭變得更立體了","這就是思考的深度，一層一層撥開","點子串起來了，看得出你在認真琢磨","從一個點到一條線，很漂亮的延伸","再往前一步，輪廓又更清楚了","你在幫點子長大，它會記得你的","這一層挖得好，答案就在下面幾層","好的延伸，讓原本的想法更站得住腳"]},
en:{
 general:["This idea has a light in it — can you see it?","Another step forward. Really well done.","Writing it down is half the win, and you did it.","This sounds so much like you.","Big things start with one sentence. This could be one.","Your mind is shining today.","Got it! I'll keep this seed safe for you.","Future you will thank you for this note.","The mist just cleared a little more.","Small ideas count. Unwritten ones don't — and you wrote it.","You notice things others miss.","This line deserves to be remembered.","You're one possibility richer than yesterday.","Inspiration found you because you were ready.","What a fresh angle!"],
 business:["That's real business instinct! Next: write down who would want this most.","You're spotting a real need. Try saying the pain it solves in one sentence.","This has market energy. Spend 10 minutes tonight checking similar products.","You're thinking like a founder. Next: picture one person who'd pay for it.","Business models are built piece by piece — keep stacking.","So practical! Ask one friend: what would you pay for this?","Once the customer is clear, the idea starts walking. List three possible users.","There's a revenue scent here. Sketch the simplest flow this weekend.","You found a gap others overlooked. Next: compare two competitors.","One step closer to an MVP. What's the smallest version you could ship?","Your sales instinct is glowing. Pitch it to one customer and watch their face.","A pricing idea is half a business model. Write down a price you'd dare to charge.","Very grounded! Just one next step: validate it with one person."],
 mood:["Thank you for writing this feeling down. That takes courage.","Noticing how you feel is a gentle kind of strength.","Even tired, you still showed up to write. That matters.","This feeling has been heard. Take your time.","That 'finally figured it out' moment is precious. So happy for you.","Anxiety means you care. Breathe — you're doing well.","Feelings are clues; they point to what matters to you.","You don't have to be perfect today. Showing up is enough.","Happy moments deserve to be kept. Thanks for sharing this light.","The fog inside clears a little once it's on paper.","You're honest with yourself — the best place to grow from.","Take care of you first. Your ideas will wait right here.","Every shift in your mood is still a step forward.","Saving this good mood for you too.","You're glowing — love to see it."],
 extension:["You dug one layer deeper — it's getting clearer.","Great extension! The idea is growing branches.","You just made the last thought more three-dimensional.","This is depth: peeling back one layer at a time.","The ideas are linking up. You're really chewing on this.","From a dot to a line — beautiful.","One more step, and the outline is sharper.","You're helping this idea grow up.","Nice layer. The answer is just a few layers down.","A strong extension makes the original idea stand taller."]}
};
const STREAK={zh:["第 {n} 個了，手感正熱","連續第 {n} 個！靈感在排隊","{n} 連發，腦袋開機中","第 {n} 個，停不下來了吧","思緒在流動，第 {n} 個收下"],
              en:["That's #{n} — you're on a roll","#{n} in a row! Ideas are lining up","{n} straight — your brain is warmed up","Number {n}. Can't stop now, huh?","Flow mode: #{n} saved"]};
const SUMMARY={zh:["剛剛一口氣記了 {n} 個，好猛","{n} 個點子一次到位，今天腦袋超亮","這一波 {n} 個，森林都被你照亮了","連記 {n} 個，這就是心流"],
               en:["You just captured {n} ideas in one go. Amazing.","{n} ideas in one burst — your mind is bright today.","That wave of {n} lit up the whole forest.","{n} in a row. That's what flow feels like."]};
const KWNOTE={business:{zh:"「{k}」這條線，值得再挖",en:"\"{k}\" is a thread worth pulling"}};
function detectLang(text){
  const s=String(text||"");
  const cjk=(s.match(/[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff]/g)||[]).length;
  const lat=(s.match(/[A-Za-z]/g)||[]).length;
  if(lat===0) return "zh";
  if(cjk===0) return "en";
  // mixed → zh unless Latin overwhelmingly dominates (letters vs characters, ~4 letters per word)
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
const POS={zh:["開心","快樂","高興","終於","想通","感動","感謝","興奮","期待","安心","療癒","平靜","放鬆","笑"],en:["happy","glad","excited","grateful","thankful","finally","figured out","realized","hopeful","calm","relaxed","peaceful"]};
const TONE={neu:[0,1,3,6,10,12],pos:[4,8,13,14],neg:[2,5,7,9,11]};
function moodIdx(text){
  const p=findKw(text,POS.zh.concat(POS.en)).length, all=findKw(text,KW.mood.zh.concat(KW.mood.en)).length, n=all-p;
  if(p&&!n) return TONE.neu.concat(TONE.pos);
  if(n&&!p) return TONE.neu.concat(TONE.neg);
  return TONE.neu.concat([4],TONE.neg); // mixed: e.g. tired but finally figured it out
}
const recent=[];
function pick(arr,rand){rand=rand||Math.random;
  let i,tries=0; do{i=Math.floor(rand()*arr.length);tries++;}while(recent.includes(arr[i])&&tries<6);
  recent.push(arr[i]); if(recent.length>8) recent.shift(); return arr[i];}
/* opts: {isExtension, streak (n ideas in current streak), rand} */
function feedback(text,opts){
  opts=opts||{}; const lang=detectLang(text); const d=detectCategory(text,lang);
  const cat=opts.isExtension?"extension":d.cat;
  const pool=cat==="mood"?moodIdx(text).map(i=>L[lang].mood[i]):L[lang][cat];
  const line=pick(pool,opts.rand);
  let note=null;
  if(d.kw&&KWNOTE[d.cat]&&(cat===d.cat)&&((opts.rand||Math.random)()<0.6)) note=KWNOTE[d.cat][lang].replace("{k}",d.kw);
  let streak=null;
  if(opts.streak>=2) streak=pick(STREAK[lang],opts.rand).replace("{n}",opts.streak);
  return {lang,cat,kw:d.kw,line,note,streak};
}
function summary(n,lang){return pick(SUMMARY[lang||"zh"]).replace("{n}",n);}
const api={detectLang,detectCategory,feedback,summary,LINES:L};
if(typeof module!=="undefined"&&module.exports) module.exports=api; else root.Feedback=api;
})(this);
