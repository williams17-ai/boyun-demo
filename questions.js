/* 撥雲見日 rule-based question ladders — no AI.
   Research: one open question at a time; Clean Language (reuse the user's own words);
   mood: name the feeling first (affect labeling), then its source; last level looks forward. */
(function(root){
const Q={
zh:{
 business:{
  1:["誰會第一個想用它？","誰最被這件事困擾？說一個具體的人","想像第一位用的人，他幾歲、在做什麼？","這個念頭，最想幫到的是誰？"],
  2:["他們現在都怎麼處理這件事？","現在的做法，哪裡最讓人不順？","如果沒有它，他們會用什麼代替？","為什麼這件事到現在還沒被好好解決？"],
  3:["最簡單的樣子長什麼樣？一句話就好","如果只能留一個功能，會是哪一個？","不寫程式的話，可以怎麼先試試看？","用一句話，說給阿嬤聽聽看"],
  4:["這週能做的一小步是什麼？","找誰聊 10 分鐘，就能知道它行不行？","如果這件事成了，一年後的你在做什麼？","明天下班後，能做的最小一件事是？"]},
 mood:{
  1:["如果用一個詞形容現在的感覺，會是什麼？","此刻心裡最大的那個感覺，叫什麼名字？","用一個詞，說說現在的你"],
  2:["這個感覺，是從哪一刻開始的？","最近一次有這種感覺，是什麼時候？","當時你在哪裡、在做什麼？","是什麼事情碰到了它？"],
  3:["你覺得它想告訴你什麼？","這個感覺背後，你真正在乎的是什麼？","如果是好朋友遇到這件事，你會怎麼跟他說？","寫到這裡，你發現了什麼？"],
  4:["現在能為自己做的一件小事是什麼？","今晚可以怎麼好好照顧自己？","如果這件事慢慢好起來，一個月後的你會在做什麼？","寫下一件會讓你感覺好一點的事"]},
 general:{
  1:["這個念頭讓你想到哪個畫面？","它會出現在什麼場景？","你是在什麼時候想到它的？","描述一個用到它的瞬間"],
  2:["誰會因為它而開心？","它最能幫到誰？","如果只能分享給一個人，你會給誰？","誰會說「我一直需要這個」？"],
  3:["如果反過來做，會變成什麼？","放大十倍會怎樣？","如果只能留下一個部分，你會留哪個？","把它跟你喜歡的東西放在一起，會變成什麼？"],
  4:["這週能做的一小步是什麼？","要讓它更具體，下一步是？","你可以先跟誰說這個念頭？","如果它成了，一年後的你在做什麼？"]}},
en:{
 business:{
  1:["Who would want to use this first?","Who is most bothered by this? Describe one real person.","Picture the first person using it — how old, what are they doing?","Who is this really for?"],
  2:["How do they handle this today?","What's the most awkward part of the current way?","Without it, what would they use instead?","Why hasn't this been solved well yet?"],
  3:["What does the simplest version look like? One sentence.","If you could keep only one feature, which?","How could you try it without writing code?","Explain it in one sentence, as if to your grandma."],
  4:["What's one small step you can take this week?","Who could you talk to for 10 minutes to see if it works?","If this worked out, what would you be doing a year from now?","What's the tiniest thing you could do tomorrow after work?"]},
 mood:{
  1:["If you had one word for how you feel right now, what would it be?","What's the biggest feeling in you right now called?","One word for you, right now?"],
  2:["When did this feeling start?","When was the last time you felt this way?","Where were you, and what were you doing?","What touched it off?"],
  3:["What do you think it's trying to tell you?","Underneath this feeling, what do you really care about?","If a good friend felt this, what would you tell them?","Writing this, what have you noticed?"],
  4:["What's one small kind thing you can do for yourself now?","How can you take care of yourself tonight?","If this slowly gets better, what will you be doing a month from now?","Write down one thing that would make you feel a bit better."]},
 general:{
  1:["What scene does this bring to mind?","Where would this show up in real life?","When did this come to you?","Describe one moment of someone using it."],
  2:["Who would be happy because of it?","Who would it help the most?","If you could share it with just one person, who?","Who would say “I've always needed this”?"],
  3:["What if you flipped it around?","What happens if you make it 10x bigger?","If you could keep only one part, which?","Put it next to something you love — what do you get?"],
  4:["What's one small step you can take this week?","What's the next step to make it more concrete?","Who could you tell about this first?","If it worked out, what would you be doing a year from now?"]}}};
/* Clean Language: questions built from the user's own word */
const CLEAN={
 zh:{short:["當你說「{k}」，那是什麼樣的{k}？","「{k}」……那像什麼？","關於「{k}」，還有什麼？"],long:["關於「{k}」，還有什麼？","「{k}」這部分，可以多說一點嗎？"],
     mood2:["「{k}」是從哪一刻開始的？","「{k}」的時候，身體哪裡最有感覺？"]},
 en:{short:["When you say \"{k}\", what kind of {k} is that?","\"{k}\"… what is that like?","And is there anything else about \"{k}\"?"],long:["And is there anything else about \"{k}\"?","Could you say a little more about \"{k}\"?"],
     mood2:["When did \"{k}\" start?","When you feel \"{k}\", where do you notice it in your body?"]}};
const FEELINGS={zh:["失望","委屈","焦躁","累","悶","平靜","鬆一口氣","期待","開心"],en:["disappointed","hurt","restless","tired","heavy","calm","relieved","hopeful","happy"]};
const STARTERS={
 idea:{zh:["最近有什麼事，讓你覺得「應該有更好的做法」？","工作上最浪費時間的是哪件事？","客戶最常問你的問題是什麼？","有什麼東西，你願意每個月付錢用？","如果你開一家小店，會賣什麼？","身邊誰最近遇到麻煩？你能怎麼幫他？","有什麼事你做了很多次，覺得應該更簡單？","用三個字，說一個你想試的點子"],
       en:["What lately made you think “there must be a better way”?","What wastes the most time at work?","What do customers ask you most often?","What would you happily pay for every month?","If you opened a small shop, what would you sell?","Who around you is struggling? How could you help?","What do you do over and over that should be easier?"]},
 free:{zh:["今天最煩的一件事是什麼？","如果有個 app 幫你做一件事，你希望是什麼？","最近讓你眼睛一亮的東西？","這週有什麼讓你會心一笑的瞬間？","你最常跟朋友抱怨的是什麼？","你想跟十年前的自己說什麼？","如果明天放假一天，你最想做什麼？","有什麼小習慣，你一直想開始？","最近學到最有趣的一件事？","通勤路上，你都在想什麼？","你家裡哪個東西最不好用？","最近讓你感動的一句話？","今天想對自己說聲謝謝的理由？","有什麼事你很想做，但一直沒開始？","如果只能改變生活中的一件小事，會是什麼？","窗外現在是什麼樣子？","最近一次大笑是因為什麼？"],
       en:["What annoyed you most today?","If an app could do one thing for you, what would it be?","What caught your eye recently?","What made you smile this week?","What would you tell yourself ten years ago?","If you had tomorrow off, what would you do?","What small habit do you keep meaning to start?","What's the most interesting thing you learned lately?","What's one small thing you'd change in your daily life?","What's outside your window right now?"]}};
const CLOSURE={zh:["你把一個念頭走成了一條路","從一個念頭，走到一個行動了","這條線走完了，霧又散開了一些"],en:["You turned one thought into a path.","From a thought to a first step.","You followed this thread all the way. The mist lifted a little."]};
const PAUSE={zh:["先把這片霧記下來，改天再走","走到這裡也很好，路會等你","先停在這裡吧，風景不會跑掉","先放著，霧會自己散一點"],en:["Let's leave the mist here for now. We'll walk again another day.","This is a lovely place to rest. The path will wait.","Pause here — the view isn't going anywhere.","Leave it for now; the mist will thin on its own."]};
const recent=[];
function pick(arr){let i,t=0;do{i=Math.floor(Math.random()*arr.length);t++;}while(recent.includes(arr[i])&&t<8);recent.push(arr[i]);if(recent.length>12)recent.shift();return arr[i];}
const L_=l=>l==="en"?"en":"zh";
/* level 1..4; word = the user's own word from the answer just written (may be null) */
function question(lang,cat,level,word){
  lang=L_(lang);cat=Q[lang][cat]?cat:"general";level=Math.max(1,Math.min(4,level));
  if(word&&level<4&&!(cat==="mood"&&level===1)){
    const short=lang==="en"?word.split(/\s+/).length<=2&&word.length<=16:word.length<=4;
    if(cat==="mood"&&level===2&&Math.random()<0.6)return pick(CLEAN[lang].mood2).split("{k}").join(word);
    if(Math.random()<0.45)return pick(short?CLEAN[lang].short:CLEAN[lang].long).split("{k}").join(word);
  }
  return pick(Q[lang][cat][level]);
}
function starter(intent,lang){const p=STARTERS[intent==="idea"?"idea":"free"];return pick(p[L_(lang)]);}
function affect(lang){return pick(Q[L_(lang)].mood[1]);}
function feelings(lang){return FEELINGS[L_(lang)];}
function closure(lang){return pick(CLOSURE[L_(lang)]);}
function pause(lang){return pick(PAUSE[L_(lang)]);}
const api={question,starter,affect,feelings,closure,pause,Q,STARTERS,MAX_LEVEL:4};
if(typeof module!=="undefined"&&module.exports)module.exports=api;else root.Questions=api;
})(this);
