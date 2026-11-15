/* 撥雲見日 rule-based follow-up question ladders — no AI */
(function(root){
const Q={
zh:{
 business:{
  1:["誰會第一個願意為這個付錢？","誰最痛？描述一個具體的人","想像第一位用戶，他幾歲、在做什麼？","這個點子最想幫到的是誰？"],
  2:["他們現在都怎麼解決這個問題？","現有的做法，哪裡最讓人不爽？","如果沒有你，他們會用什麼替代？","為什麼這件事到現在還沒被好好解決？"],
  3:["最簡單的版本長什麼樣？一句話就好","如果只能做一個功能，會是哪一個？","不寫程式的話，你能怎麼先試試看？","畫在一張紙上，第一個畫面是什麼？"],
  4:["這週能做的一小步是什麼？","找誰聊 10 分鐘，就能驗證它？","週末花 1 小時，你會先做哪件事？","明天下班後，能做的最小動作是？"]},
 mood:{
  1:["這個感覺是從哪一刻開始的？","最近一次有這種感覺，是什麼時候？","當時你在哪裡、在做什麼？","是什麼事情觸發了它？"],
  2:["你覺得它想告訴你什麼？","這個感覺背後，你真正在乎的是什麼？","如果它會說話，會說哪一句？","它在提醒你需要什麼？"],
  3:["如果是好朋友遇到這件事，你會怎麼跟他說？","一年後的你回頭看，會怎麼形容現在？","換個角度看，這件事有沒有一點點好處？","你會怎麼溫柔地對自己說這件事？"],
  4:["現在能為自己做的一件小事是什麼？","今晚可以怎麼好好照顧自己？","明天可以試的一個小改變？","寫下一件會讓你感覺好一點的事"]},
 general:{
  1:["這個點子讓你想到哪個畫面？","它會出現在什麼場景？","你是在什麼時候想到它的？","描述一個用到它的瞬間"],
  2:["誰會因為它而開心？","它最能幫到誰？","如果只能分享給一個人，你會給誰？","誰會說「我早就需要這個」？"],
  3:["如果反過來做，會變成什麼？","放大十倍會怎樣？","如果只能留下一個部分，你會留哪個？","把它跟你最喜歡的東西結合，會變成什麼？"],
  4:["這週能做的一小步是什麼？","要讓它更具體，下一步是？","你可以先跟誰說這個點子？","明天可以花 10 分鐘做什麼？"]}},
en:{
 business:{
  1:["Who would be the first to pay for this?","Who feels this pain the most? Describe one real person.","Picture your first user — how old, what are they doing?","Who is this idea really for?"],
  2:["How do they solve this today?","What's most annoying about the current way?","Without you, what would they use instead?","Why hasn't this been solved well yet?"],
  3:["What does the simplest version look like? One sentence.","If you could build only one feature, which one?","How could you test it without writing code?","Sketch it on paper — what's the first screen?"],
  4:["What's one small step you can take this week?","Who could you talk to for 10 minutes to validate it?","With one hour this weekend, what would you do first?","What's the tiniest action you can take tomorrow after work?"]},
 mood:{
  1:["When did this feeling start?","When was the last time you felt this way?","Where were you, and what were you doing?","What triggered it?"],
  2:["What do you think it's trying to tell you?","Underneath this feeling, what do you really care about?","If it could speak, what would it say?","What is it reminding you that you need?"],
  3:["If a good friend felt this, what would you tell them?","Looking back a year from now, how would you describe today?","Is there even a tiny upside, seen from another angle?","How would you say this to yourself, gently?"],
  4:["What's one small kind thing you can do for yourself now?","How can you take care of yourself tonight?","One small change you could try tomorrow?","Write down one thing that would make you feel a bit better."]},
 general:{
  1:["What scene does this idea bring to mind?","Where would this show up in real life?","When did this idea come to you?","Describe one moment of someone using it."],
  2:["Who would be happy because of it?","Who would it help the most?","If you could share it with just one person, who?","Who would say “I've needed this forever”?"],
  3:["What if you flipped it upside down?","What happens if you make it 10x bigger?","If you could keep only one part, which?","Mix it with something you love — what do you get?"],
  4:["What's one small step you can take this week?","What's the next step to make it more concrete?","Who could you tell about this first?","What could you do in 10 minutes tomorrow?"]}}};
const KQ={
 zh:{business:{1:["「{k}」裡，誰最痛？","說到「{k}」，誰會第一個掏錢？"],3:["「{k}」最簡單的版本長什麼樣？"]},
     mood:{1:["「{k}」的感覺，是從哪一刻開始的？"],2:["「{k}」背後，你真正在乎的是什麼？"]}},
 en:{business:{1:["When it comes to \"{k}\", who feels the pain most?","Who'd be first to pay for the \"{k}\" part?"],3:["What's the simplest version of the \"{k}\" idea?"]},
     mood:{1:["When did the \"{k}\" feeling start?"]}}};
const STARTERS={
 zh:["今天最煩的一件事是什麼？","如果有個 app 幫你做一件事，你希望是什麼？","最近讓你眼睛一亮的東西？","這週有什麼讓你會心一笑的瞬間？","你最常跟朋友抱怨的是什麼？","有什麼事你做了很多次，覺得應該更簡單？","最近一次覺得「如果有人做這個就好了」是什麼時候？","工作上最浪費時間的是哪件事？","你想送給十年前的自己什麼？","如果明天放假一天，你最想做什麼？","身邊誰最近很辛苦？你能幫他什麼？","有什麼小習慣，你一直想開始？","最近學到最有趣的一件事？","你最想被誰誇獎？為什麼？","通勤路上，你都在想什麼？","你家裡哪個東西最不好用？","如果你開一家小店，會賣什麼？","最近讓你感動的一句話？","客戶最常問你的問題是什麼？","你覺得自己最被低估的能力是？","有什麼東西你願意每個月付錢訂閱？","今天想對自己說聲謝謝的理由？","最近一次失眠，在想什麼？","有什麼事你很想做，但一直沒開始？","如果只能改變生活中的一件小事，會是什麼？"],
 en:["What annoyed you most today?","If an app could do one thing for you, what would it be?","What caught your eye recently?","What made you smile this week?","What do you complain about most with friends?","What do you do over and over that should be easier?","When did you last think “someone should build this”?","What wastes the most time at work?","What would you tell yourself ten years ago?","If you had tomorrow off, what would you do?","Who around you is struggling? How could you help?","What small habit do you keep meaning to start?","What's the most interesting thing you learned lately?","What would you happily pay for every month?","What's one small thing you'd change in your daily life?"]};
const CLOSURE={zh:["你把一個念頭挖成一條路了","從一個點子走到一個行動，好厲害","這條線完整了，霧散得更開了"],en:["You turned one thought into a path.","From a spark to a first step — amazing.","This thread is complete. The mist just lifted more."]};
const recent=[];
function pick(arr){let i,t=0;do{i=Math.floor(Math.random()*arr.length);t++;}while(recent.includes(arr[i])&&t<8);recent.push(arr[i]);if(recent.length>12)recent.shift();return arr[i];}
function question(lang,cat,level,kw){
  lang=lang==="en"?"en":"zh";cat=Q[lang][cat]?cat:"general";level=Math.max(1,Math.min(4,level));
  const kq=kw&&KQ[lang][cat]&&KQ[lang][cat][level];
  if(kq&&Math.random()<0.5)return pick(kq).replace("{k}",kw);
  return pick(Q[lang][cat][level]);
}
function starter(lang){return pick(STARTERS[lang==="en"?"en":"zh"]);}
function closure(lang){return pick(CLOSURE[lang==="en"?"en":"zh"]);}
const api={question,starter,closure,Q,STARTERS,MAX_LEVEL:4};
if(typeof module!=="undefined"&&module.exports)module.exports=api;else root.Questions=api;
})(this);
