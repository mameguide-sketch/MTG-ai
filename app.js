'use strict';
window.addEventListener('error', (event) => {
  const el = document.getElementById('status');
  if (el) el.textContent = 'エラーが発生しました：' + (event.message || '不明なエラー');
});
window.addEventListener('unhandledrejection', (event) => {
  const el = document.getElementById('status');
  if (el) el.textContent = '通信または処理エラー：' + (event.reason?.message || event.reason || '不明なエラー');
});

const API='https://api.scryfall.com';const $=x=>document.getElementById(x);let pool=[],deck=[],recs=[],singleRecs=[],poolLoading=null,jpLoading=null,displayLang=localStorage.getItem('lunchForgeLang')||'ja';const sleep=x=>new Promise(r=>setTimeout(r,x));
window.addEventListener('error',e=>{const el=document.getElementById('status');if(el)el.textContent='画面エラー：'+(e.message||'不明なエラー');});
const JP={W:'白',U:'青',B:'黒',R:'赤',G:'緑'};function colors(a=[]){return a.length?a.map(x=>JP[x]).join(''):'無色'}function esc(s=''){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}function type(c){return [c.type_line,...(c.card_faces||[]).map(x=>x.type_line)].filter(Boolean).join(' // ')}function text(c){return [c.oracle_text,...(c.card_faces||[]).map(x=>x.oracle_text)].filter(Boolean).join('\n').toLowerCase()}function img(c){return c.image_uris?.normal||c.card_faces?.[0]?.image_uris?.normal||''}function unique(a){return [...new Set(a.filter(Boolean))]}
function toast(message){const el=$('toast');if(!el)return;el.textContent=message;el.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),2400)}
function oracle(c){return c.oracle_text||c.card_faces?.map(f=>f.oracle_text).filter(Boolean).join('\n\n')||''}
function manaCost(c){return c.mana_cost||c.card_faces?.map(f=>f.mana_cost).filter(Boolean).join(' // ')||'—'}
function localizedCard(c){return c?.jp||null}
function displayName(c){const j=localizedCard(c);return displayLang==='ja'?(j?.printed_name||c.printed_name||c.name):c.name}
function displayType(c){const j=localizedCard(c);return displayLang==='ja'?(j?.printed_type_line||c.printed_type_line||type(c)):type(c)}
function displayOracle(c){const j=localizedCard(c);if(displayLang==='ja')return j?.printed_text||c.printed_text||oracle(c);return oracle(c)}
function displayImg(c){const j=localizedCard(c);if(displayLang==='ja')return j?.image_uris?.normal||j?.card_faces?.[0]?.image_uris?.normal||img(c);return img(c)}
function hasJapanese(c){return !!(c?.jp?.printed_name||c?.printed_name)}
function englishSubName(c){return displayLang==='ja'&&displayName(c)!==c.name?`<div class="englishName">${esc(c.name)}</div>`:''}
function mergeJapaneseCards(cards){
  const map=new Map(cards.filter(c=>c.oracle_id).map(c=>[c.oracle_id,c]));
  let count=0;
  pool=pool.map(c=>{const j=map.get(c.oracle_id);if(!j)return c;count++;const faceNames=j.card_faces?.map(f=>f.printed_name).filter(Boolean).join(' // '),faceTypes=j.card_faces?.map(f=>f.printed_type_line).filter(Boolean).join(' // '),faceTexts=j.card_faces?.map(f=>f.printed_text).filter(Boolean).join('\n\n');return {...c,jp:{printed_name:j.printed_name||faceNames||j.name,printed_type_line:j.printed_type_line||faceTypes||j.type_line,printed_text:j.printed_text||faceTexts||j.oracle_text||'',image_uris:j.image_uris||null,card_faces:j.card_faces||null,set_name:j.set_name||'',released_at:j.released_at||'',collector_number:j.collector_number||''}}});
  return count;
}
async function fetchJapanese(force=false){
  if(jpLoading)return jpLoading;
  jpLoading=(async()=>{
    let cached=null;
    try{cached=JSON.parse(localStorage.getItem('mtgStdJaV2')||'null')}catch{localStorage.removeItem('mtgStdJaV2')}
    if(!pool.length){const ok=await fetchPool(false);if(!ok)return false}
    if(!force&&cached&&Date.now()-cached.time<1000*60*60*24*14&&cached.cards?.length){
      try{
        const n=mergeJapaneseCards(cached.cards);
        if(n>0){finishJapanese(`${n.toLocaleString()}種類の日本語データを保存データから結合`);return true}
        localStorage.removeItem('mtgStdJaV2');
      }catch(error){console.warn('Japanese cache was ignored',error);localStorage.removeItem('mtgStdJaV2')}
    }
    const btn=$('jpLoadBtn');if(btn){btn.disabled=true;btn.textContent='日本語取得中…'}
    let cards=[];let page=0;
    const collect=async query=>{
      let url=API+'/cards/search?order=name&unique=cards&include_multilingual=true&q='+encodeURIComponent(query);
      while(url){
        page++;loadStatus(`日本語カード取得中：${page}ページ目`,Math.min(95,page*8));
        const j=await fetchJson(url,45000,4);
        cards.push(...j.data.filter(c=>!c.digital&&c.lang==='ja'&&c.legalities?.standard==='legal'));
        url=j.has_more?j.next_page:null;if(url)await sleep(350);
      }
    };
    try{
      await collect('f:standard game:paper lang:ja');
      if(!cards.length){page=0;await collect('legal:standard game:paper lang:ja')}
      if(!cards.length)throw Error('日本語版カードが見つかりませんでした')
      cards=[...new Map(cards.filter(c=>c.oracle_id).map(c=>[c.oracle_id,c])).values()];
      const n=mergeJapaneseCards(cards);
      if(!n)throw Error('英語カードと日本語カードを照合できませんでした。英語データを再取得してからお試しください')
      try{localStorage.setItem('mtgStdJaV2',JSON.stringify({time:Date.now(),cards}))}catch{}
      try{localStorage.setItem('mtgStdPoolV5',JSON.stringify({time:Date.now(),cards:pool}))}catch{}
      finishJapanese(`${n.toLocaleString()}種類の日本語データを結合`);return true;
    }catch(e){
      if(cached?.cards?.length){
        try{const n=mergeJapaneseCards(cached.cards);if(n>0){finishJapanese(`${n.toLocaleString()}種類の保存済み日本語データを使用（オンライン取得失敗：${e.message}）`);return true}}catch{}
      }
      loadStatus('日本語データ取得に失敗しました：'+e.message,0);
      if($('dbStatus'))$('dbStatus').textContent='英語カードは利用できます。日本語データ取得に失敗：'+e.message;
      return false;
    }finally{if(btn){btn.disabled=false;btn.textContent='日本語データ再取得'}}
  })();
  try{return await jpLoading}finally{jpLoading=null}
}
function finishJapanese(message){loadStatus(message,100);if($('dbStatus'))$('dbStatus').textContent=`${pool.length.toLocaleString()}種類中、${pool.filter(hasJapanese).length.toLocaleString()}種類を日本語表示できます。`;populateCardNames();renderDatabase();if(recs.length)renderResults();}

const RX={token_make:/create[s]? (?:one|two|three|a|an|x|that many|\d+)[^\.]{0,80} token|food token|treasure token|clue token|blood token/i,token_payoff:/whenever (?:one or more )?(?:tokens?|artifacts?)|sacrifice (?:a|another) token|tokens? you control get/i,counter_make:/put (?:a|one|two|three|x|that many|\d+)[^\.]{0,40} counters?|proliferate/i,counter_payoff:/if [^\.]{0,50}counter|for each [^\.]{0,30}counter|remove [^\.]{0,30}counter|modified creature/i,grave_fill:/mill |surveil|put the top [^\.]+ into your graveyard|discard a card/i,grave_payoff:/from your graveyard|cards? in your graveyard|descend|delirium|collect evidence|exile [^\.]+ from your graveyard/i,sac_outlet:/sacrifice another|sacrifice a creature|sacrifice an artifact/i,death_payoff:/whenever (?:another )?[^\.]{0,35} dies|creature died|permanent was put into a graveyard/i,draw:/draw (?:a|one|two|three|x|that many|\d+) cards?|investigate/i,removal:/destroy target|exile target|deals? \d+ damage to target|target creature gets -|counter target spell|return target [^\.]+ to its owner's hand/i,ramp:/add \{|search your library for (?:a|up to one) (?:basic )?land|treasure token|additional land/i,protection:/hexproof|indestructible|phasing|protection from|ward \{|return target [^\.]+ you control to its owner's hand/i,finisher:/double strike|trample|can't be blocked|each opponent loses|extra turn|you win the game/i,life_make:/you gain|lifelink/i,life_payoff:/whenever you gain life|if you gained life/i,spell_payoff:/whenever you cast (?:an? )?(?:instant|sorcery|noncreature|spell)|prowess/i,artifact_payoff:/artifacts? you control|whenever an artifact|for each artifact/i,enchant_payoff:/enchantments? you control|whenever an enchantment|constellation/i,land_payoff:/landfall|whenever a land enters|for each land/i,attack_payoff:/whenever [^\.]{0,40} attacks|attacking creature|combat damage to a player/i,blink:/exile [^\.]{0,80} then return|return [^\.]{0,80} to the battlefield/i};
const labels={token_make:'トークン生成',token_payoff:'トークン利用',counter_make:'カウンター付与',counter_payoff:'カウンター利用',grave_fill:'墓地を肥やす',grave_payoff:'墓地利用',sac_outlet:'生け贄手段',death_payoff:'死亡誘発',draw:'ドロー',removal:'除去／妨害',ramp:'マナ加速',protection:'保護',finisher:'勝ち手段',life_make:'ライフゲイン',life_payoff:'ライフゲイン利用',spell_payoff:'呪文誘発',artifact_payoff:'アーティファクト利用',enchant_payoff:'エンチャント利用',land_payoff:'土地誘発',attack_payoff:'攻撃誘発',blink:'明滅'};
const pairs=[['token_make','token_payoff'],['token_make','sac_outlet'],['sac_outlet','death_payoff'],['grave_fill','grave_payoff'],['counter_make','counter_payoff'],['life_make','life_payoff'],['blink','death_payoff'],['ramp','finisher']];
function features(c){let o=text(c),t=type(c).toLowerCase();let roles=Object.keys(RX).filter(k=>RX[k].test(o));let subs=(t.split('—')[1]||'').replace(/\/\//g,' ').split(/\s+/).map(x=>x.replace(/[^a-z]/g,'')).filter(x=>x.length>3);return{roles,subs:unique(subs),o,t,cmc:+c.cmc||0,colors:c.color_identity||[]}}
function parseDeck(s){let side=false,out=[];for(let raw of s.split(/\r?\n/)){let line=raw.trim();if(!line||/^(deck|companion)$/i.test(line))continue;if(/^sideboard$/i.test(line)){side=true;continue}let m=line.match(/^(?:SB:\s*)?(\d+)x?\s+(.+?)(?:\s+\([A-Z0-9]+\)\s+\d+)?$/i);if(!m)m=[null,'1',line];out.push({qty:+m[1],name:m[2].trim(),side})}return out}
function status(s,p){const main=$('status');if(main)main.textContent=s;if(p!=null&&$('bar'))$('bar').style.width=p+'%'}
function loadStatus(message,p){status(message,p);if($('dbStatus'))$('dbStatus').textContent=message;if($('singleStatus')&&!pool.length)$('singleStatus').textContent=message;}
async function fetchJson(url,timeoutMs=30000,maxRetries=3){
  let lastError=null;
  for(let attempt=0;attempt<=maxRetries;attempt++){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      const r=await fetch(url,{signal:controller.signal,headers:{'Accept':'application/json;q=0.9,*/*;q=0.8'}});
      if(r.ok)return await r.json();
      let detail='';try{detail=(await r.json()).details||''}catch{}
      const err=Error(`API ${r.status}${detail?'：'+detail:''}`);err.status=r.status;
      if((r.status===429||r.status>=500)&&attempt<maxRetries){
        const retryAfter=Number(r.headers.get('Retry-After'))||0;
        await sleep(Math.max(retryAfter*1000,1000*(2**attempt)));
        lastError=err;continue;
      }
      throw err;
    }catch(e){
      const err=e.name==='AbortError'?Error(`通信が${Math.round(timeoutMs/1000)}秒以内に完了しませんでした`):e;
      lastError=err;
      const retryable=e.name==='AbortError'||e instanceof TypeError;
      if(retryable&&attempt<maxRetries){await sleep(1000*(2**attempt));continue}
      throw err;
    }finally{clearTimeout(timer)}
  }
  throw lastError||Error('通信に失敗しました');
}
async function fetchPool(force=false){
  if(poolLoading)return poolLoading;
  poolLoading=(async()=>{
    let cached;
    try{cached=JSON.parse(localStorage.getItem('mtgStdPoolV5')||'null')}catch{}
    if(!force&&cached&&Date.now()-cached.time<1000*60*60*24*3&&cached.cards?.length){pool=cached.cards;finishPool('保存データから');return true}
    pool=[];
    ['loadBtn','dbLoadBtn'].forEach(id=>{if($(id))$(id).disabled=true});
    if($('dbLoadBtn'))$('dbLoadBtn').textContent='取得中…';
    let url=API+'/cards/search?order=name&unique=cards&q='+encodeURIComponent('f:standard game:paper');
    let n=0;
    try{
      while(url){
        n++;
        loadStatus(`スタンダードカード取得中：${n}ページ目`,Math.min(94,n*5));
        const j=await fetchJson(url);
        pool.push(...j.data.filter(c=>!c.digital&&c.legalities?.standard==='legal'));
        url=j.has_more?j.next_page:null;
        await sleep(120);
      }
      pool=[...new Map(pool.map(c=>[c.oracle_id||c.id,c])).values()];
      try{localStorage.setItem('mtgStdPoolV5',JSON.stringify({time:Date.now(),cards:pool}))}catch{}
      finishPool('オンラインから');
      return true;
    }catch(e){
      loadStatus('カード取得に失敗しました：'+e.message,0);
      if($('dbResults'))$('dbResults').innerHTML='<div class="empty">通信に失敗しました。「再取得」を押してください。広告ブロックや社内ネットワークで api.scryfall.com が遮断されている場合もあります。</div>';
      return false;
    }finally{
      ['loadBtn','dbLoadBtn'].forEach(id=>{if($(id))$(id).disabled=false});
      if($('dbLoadBtn'))$('dbLoadBtn').textContent=pool.length?'カードデータ再取得':'カードデータを取得';
    }
  })();
  try{return await poolLoading}finally{poolLoading=null}
}
function populateSetFilter(){const el=$('dbSet');if(!el)return;const current=el.value;const sets=[...new Map(pool.map(c=>[c.set,c.set_name||String(c.set||'').toUpperCase()])).entries()].sort((a,b)=>String(a[1]).localeCompare(String(b[1]),'ja'));el.innerHTML='<option value="">全セット</option>'+sets.map(([code,name])=>`<option value="${esc(code)}">${esc(name)} (${esc(String(code).toUpperCase())})</option>`).join('');if(sets.some(([code])=>code===current))el.value=current;}
function finishPool(src){populateSetFilter();loadStatus(`${src} ${pool.length.toLocaleString()}種類を読み込みました。`,100);if($('loadBtn'))$('loadBtn').disabled=false;if($('analyzeBtn'))$('analyzeBtn').disabled=false;if($('singleBtn'))$('singleBtn').disabled=false;if($('singleStatus'))$('singleStatus').textContent=`${pool.length.toLocaleString()}種類を使用可能`;populateCardNames();if($('dbStatus')){$('dbStatus').textContent=`${pool.length.toLocaleString()}種類を検索できます。日本語データを確認中…`;renderDatabase();}if(displayLang==='ja'&&!pool.some(hasJapanese))setTimeout(()=>fetchJapanese(false),50)}
async function named(name){let key=String(name).toLowerCase();let exact=pool.find(c=>c.name.toLowerCase()===key||String(c.jp?.printed_name||c.printed_name||'').toLowerCase()===key);if(exact)return exact;let r=await fetch(API+'/cards/named?fuzzy='+encodeURIComponent(name));return r.ok?r.json():null}
function deckStats(cards){let main=cards.filter(x=>!x.side&&x.card),total=main.reduce((s,x)=>s+x.qty,0),lands=main.filter(x=>type(x.card).includes('Land')).reduce((s,x)=>s+x.qty,0),non=main.filter(x=>!type(x.card).includes('Land')),avg=non.reduce((s,x)=>s+x.qty*(x.card.cmc||0),0)/Math.max(1,non.reduce((s,x)=>s+x.qty,0)),cols=unique(main.flatMap(x=>x.card.color_identity||[])),counts={};for(let x of non)for(let r of features(x.card).roles)counts[r]=(counts[r]||0)+x.qty;let curve=Array(8).fill(0);for(let x of non)curve[Math.min(7,Math.floor(x.card.cmc||0))]+=x.qty;return{main,total,lands,avg,cols,counts,curve}}
function diagnosis(s){let a=[];if(s.total<60)a.push(['bad',`メインが${s.total}枚（60枚未満）`]);else if(s.total>60)a.push(['warn',`メインが${s.total}枚（60枚超）`]);else a.push(['good','メイン60枚']);if(s.lands<20)a.push(['bad',`土地${s.lands}枚：かなり少ない`]);else if(s.lands<23)a.push(['warn',`土地${s.lands}枚：軽量デッキ向け`]);else if(s.lands>28)a.push(['warn',`土地${s.lands}枚：多め`]);else a.push(['good',`土地${s.lands}枚`]);if((s.counts.removal||0)<4)a.push(['bad','除去／妨害が不足']);if((s.counts.draw||0)<3)a.push(['warn','継続的な手札補充が少ない']);if((s.counts.protection||0)<2)a.push(['warn','主力を守る手段が少ない']);if((s.counts.finisher||0)<3&&s.avg>2.5)a.push(['warn','明確な勝ち手段が少ない']);if(s.curve[2]+s.curve[3]<10)a.push(['warn','2～3マナ域が薄い']);return a}
function scoreCard(c,stats,strategy,seedCards){let f=features(c),score=0,why=[];let outside=f.colors.filter(x=>!stats.cols.includes(x));if(outside.length){score-=35*outside.length}else{score+=9;why.push('デッキ色に適合')}let deckRoles=stats.counts;for(let [maker,payoff] of pairs){if((deckRoles[maker]||0)>0&&f.roles.includes(payoff)){score+=14;why.push(`${labels[maker]}を${labels[payoff]}で活用`)}if((deckRoles[payoff]||0)>0&&f.roles.includes(maker)){score+=12;why.push(`${labels[payoff]}を支える${labels[maker]}`)}}let needs={removal:4,draw:4,ramp:3,protection:2,finisher:3};for(let [r,n] of Object.entries(needs))if((deckRoles[r]||0)<n&&f.roles.includes(r)){score+=13;why.push(`不足している${labels[r]}を補完`)}let avg=stats.avg||3,d=Math.abs(f.cmc-avg);score+=Math.max(0,7-d*2);let band=Math.min(7,Math.floor(f.cmc));if(stats.curve[band]<4){score+=6;why.push(`${band===7?'7+':band}マナ域を補完`)}else if(stats.curve[band]>10)score-=4;let deckSubs=seedCards.flatMap(x=>features(x.card).subs);let shared=f.subs.filter(x=>deckSubs.includes(x));if(shared.length){score+=strategy==='tribal'?18:9;why.push(`${shared[0]}タイプ連携`)}if(strategy==='engine'&&why.some(x=>x.includes('活用')||x.includes('支える')))score+=8;if(strategy==='support'&&f.roles.some(x=>['removal','draw','ramp','protection'].includes(x)))score+=6;if(strategy==='curve'&&stats.curve[band]<4)score+=7;if(type(c).includes('Land')&&stats.lands>=25)score-=8;score+=Math.min(5,f.roles.length);return{card:c,score:Math.round(score*10)/10,why:unique(why).slice(0,6),f}}
async function analyze(){if(!pool.length){status('先にカードデータを取得します。',3);await fetchPool();if(!pool.length)return;}let parsed=parseDeck($('deckInput').value);if(!parsed.length){status('デッキを入力してください。');return}$('analyzeBtn').disabled=true;deck=[];for(let i=0;i<parsed.length;i++){status(`カード特定中 ${i+1}/${parsed.length}`,10+55*i/parsed.length);let c=await named(parsed[i].name);if(c)deck.push({...parsed[i],card:c});else deck.push({...parsed[i],card:null});await sleep(80)}let resolved=deck.filter(x=>x.card),stats=deckStats(deck);renderStats(stats,parsed.length,resolved.length);let present=new Set(resolved.map(x=>x.card.name));recs=pool.filter(c=>!present.has(c.name)).map(c=>scoreCard(c,stats,$('strategy').value,resolved.filter(x=>!x.side))).filter(x=>x.score>8).sort((a,b)=>b.score-a.score);status(`${resolved.length}/${parsed.length}種類を特定し、${recs.length.toLocaleString()}候補を採点しました。`,100);renderResults();$('analyzeBtn').disabled=false}
function renderStats(s,all,res){$('mCards').textContent=s.total;$('mLands').textContent=s.lands;$('mColors').textContent=colors(s.cols);$('mAvg').textContent=s.avg.toFixed(2);$('mResolved').textContent=Math.round(res/Math.max(1,all)*100)+'%';let ds=diagnosis(s),base=100-ds.filter(x=>x[0]==='bad').length*18-ds.filter(x=>x[0]==='warn').length*7;$('mScore').textContent=Math.max(0,base);$('diagnostics').innerHTML=ds.map(x=>`<span class="tag ${x[0]}">${esc(x[1])}</span>`).join('');let max=Math.max(1,...s.curve);$('curve').innerHTML=s.curve.map((v,i)=>`<div class="manaCol"><div class="manaBar" style="height:${Math.max(2,95*v/max)}px"></div><small>${i===7?'7+':i}<br>${v}</small></div>`).join('');let roles=Object.entries(s.counts).sort((a,b)=>b[1]-a[1]);$('roles').innerHTML=roles.length?roles.map(([r,n])=>`<div class="deckcard"><span class="qty">${n}</span><span>${labels[r]||r}</span><span class="tiny">枚</span></div>`).join(''):'<span class="notice">役割を検出できませんでした。</span>';$('resolvedDeck').innerHTML=deck.map(x=>`<div>${x.qty} ${esc(x.card?.name||x.name)} ${x.card?'':'<span class="tag bad">未特定</span>'}</div>`).join('')}
function renderResults(){let q=$('search').value.toLowerCase(),tf=$('typeFilter').value,rf=$('roleFilter').value,cf=$('colorFilter').value,lim=+$('recLimit').value;let arr=recs.filter(x=>(!q||(x.card.name+' '+type(x.card)+' '+text(x.card)).toLowerCase().includes(q))&&(!tf||type(x.card).includes(tf))&&(!rf||x.f.roles.includes(rf))&&(!cf||(cf==='C'?!x.f.colors.length:x.f.colors.includes(cf)))).slice(0,lim);$('results').innerHTML=arr.length?arr.map(x=>cardHTML(x)).join(''):'<div class="empty">条件に合う候補がありません。</div>'}
function cardHTML(x){return `<article class="result"><button class="imageButton" data-detail="${esc(x.card.name)}" aria-label="${esc(x.card.name)}の詳細">${displayImg(x.card)?`<img loading="lazy" src="${displayImg(x.card)}" alt="${esc(displayName(x.card))}">`:''}</button><div><h3><button class="textButton" data-detail="${esc(x.card.name)}">${esc(displayName(x.card))}</button></h3>${englishSubName(x.card)}<div class="meta">${esc(displayType(x.card))} ・ MV ${x.card.cmc||0} ・ ${colors(x.f.colors)}</div><div class="tags">${x.why.map(w=>`<span class="tag good">${esc(w)}</span>`).join('')}${x.f.roles.slice(0,4).map(r=>`<span class="tag">${labels[r]||r}</span>`).join('')}</div><div class="oracle">${esc(displayOracle(x.card))}</div><div class="inlineActions"><button class="smallBtn primary" data-deckadd="${esc(x.card.name)}">デッキへ追加</button><button class="smallBtn" data-detail="${esc(x.card.name)}">詳細を見る</button></div></div><div><div class="score">${x.score}</div><div class="tiny">適合点</div></div></article>`}
async function singleAnalyze(){if(!pool.length){$('singleStatus').textContent='先にカードデータを取得します。';await fetchPool();if(!pool.length)return;}let name=$('singleName').value.trim();if(!name)return;let c=await named(name);if(!c){$('singleStatus').textContent='カードを特定できませんでした。';return}let fake=[{qty:4,side:false,card:c}],stats=deckStats(fake);singleRecs=pool.filter(x=>x.name!==c.name).map(x=>scoreCard(x,stats,'engine',fake)).sort((a,b)=>b.score-a.score).slice(0,40);$('singleSeed').innerHTML=`<div class="mini"><h3>${esc(c.name)}</h3><div class="tags">${features(c).roles.map(r=>`<span class="tag">${labels[r]||r}</span>`).join('')}</div></div>`;$('singleResults').innerHTML=singleRecs.map(cardHTML).join('');$('singleStatus').textContent='相性候補を表示しました。'}


function populateCardNames(){
  const dl=$('cardNames');if(!dl)return;
  dl.innerHTML=pool.slice().sort((a,b)=>displayName(a).localeCompare(displayName(b),'ja')).map(c=>`<option value="${esc(displayName(c))}" label="${esc(c.name)}"></option>`).join('');
}
function cardSearchText(c){return `${c.name} ${c.jp?.printed_name||''} ${type(c)} ${c.jp?.printed_type_line||''} ${text(c)} ${c.jp?.printed_text||''} ${(c.keywords||[]).join(' ')}`.toLowerCase()}
function renderDatabase(){
  if(!pool.length){$('dbResults').innerHTML='<div class="empty">「カードデータを準備」を押してください。</div>';$('dbSummary').textContent='0件';return;}
  const q=$('dbQuery').value.trim().toLowerCase();
  const terms=(q.match(/"[^"]+"|\S+/g)||[]).map(x=>x.replace(/^"|"$/g,''));
  const semantic=typeof matchIntent==='function'?matchIntent(q):{tags:[],matched:[]};
  const tf=$('dbType').value,rf=$('dbRole').value,cf=$('dbColor').value,set=$('dbSet')?.value||'',mv=$('dbMv').value,sort=$('dbSort').value;
  let arr=pool.filter(c=>{
    const f=features(c),cm=Math.floor(+c.cmc||0);
    const hay=cardSearchText(c);
    const p=typeof knowledgeProfile==='function'?knowledgeProfile(c):{tags:[]};
    const textMatch=!terms.length||terms.every(term=>hay.includes(term));
    const semanticMatch=semantic.tags.length&&semantic.tags.some(tag=>p.tags.includes(tag));
    return ((!terms.length&&!semantic.tags.length)||textMatch||semanticMatch)&&(!tf||type(c).includes(tf))&&(!rf||f.roles.includes(rf))&&(!cf||(cf==='C'?!f.colors.length:f.colors.includes(cf)))&&(!set||c.set===set)&&(!mv||(mv==='7'?cm>=7:cm===+mv));
  });
  if(sort==='mv')arr.sort((a,b)=>(a.cmc||0)-(b.cmc||0)||displayName(a).localeCompare(displayName(b),'ja'));
  else if(sort==='new')arr.sort((a,b)=>(b.released_at||'').localeCompare(a.released_at||'')||displayName(a).localeCompare(displayName(b),'ja'));
  else arr.sort((a,b)=>displayName(a).localeCompare(displayName(b),'ja'));
  $('dbSummary').textContent=`${arr.length.toLocaleString()}件中、先頭${Math.min(80,arr.length)}件を表示${semantic.matched.length?' ・ 意味解析：'+semantic.matched.map(x=>x.name).join('／'):''}`;
  $('dbResults').innerHTML=arr.length?arr.slice(0,80).map(databaseCardHTML).join(''):'<div class="empty">条件に合うカードがありません。</div>';
}
function databaseCardHTML(c){
  const f=features(c),oracle=c.oracle_text||c.card_faces?.map(x=>x.oracle_text).filter(Boolean).join('\n')||'';
  return `<article class="galleryCard">${displayImg(c)?`<img loading="lazy" src="${displayImg(c)}" alt="${esc(displayName(c))}">`:''}<div class="galleryBody"><h3>${esc(displayName(c))}</h3>${englishSubName(c)}<div class="meta">${esc(displayType(c))}<br>MV ${c.cmc||0} ・ ${colors(f.colors)}</div><div class="tags">${f.roles.slice(0,3).map(r=>`<span class="tag">${labels[r]||r}</span>`).join('')}</div><div class="galleryText">${esc(oracle)}</div><div class="galleryActions"><button class="smallBtn primary" data-synergy="${esc(c.name)}">相性を見る</button><button class="smallBtn" data-deckadd="${esc(c.name)}">追加</button><button class="smallBtn" data-detail="${esc(c.name)}">詳細</button></div></div></article>`;
}
async function prepareDatabase(force=false){
  if(!pool.length||force){const ok=await fetchPool(force);if(!ok)return;}
  populateCardNames();renderDatabase();$('dbStatus').textContent=`${pool.length.toLocaleString()}種類を検索できます。`;
}
function addCardToDeck(name){
  const ta=$('deckInput'),current=ta.value.trim();
  ta.value=(current?current+'\n':'Deck\n')+'1 '+name;
  document.querySelector('[data-view="analyzer"]').click();
  status(`${name} をデッキ入力へ追加しました。`);toast(`${name} をデッキへ追加しました`);
}

function findPoolCard(name){const key=String(name).toLowerCase();return pool.find(c=>c.name===name)||pool.find(c=>c.name.toLowerCase()===key||String(c.jp?.printed_name||c.printed_name||'').toLowerCase()===key)}
function showCardDetail(name){
  const c=findPoolCard(name);if(!c)return;
  const f=features(c),legal=c.legalities?.standard==='legal';
  $('dialogContent').innerHTML=`<div class="dialogGrid"><div>${displayImg(c)?`<img class="dialogImage" src="${displayImg(c)}" alt="${esc(displayName(c))}">`:''}</div><div><div class="dialogEyebrow">${legal?'スタンダード使用可':'スタンダード対象外'}</div><h2>${esc(displayName(c))}${hasJapanese(c)&&displayLang==='ja'?'<span class="langBadge">日本語</span>':''}</h2>${englishSubName(c)}<div class="manaCost">${esc(manaCost(c))}</div><div class="meta">${esc(displayType(c))} ・ MV ${c.cmc||0} ・ ${colors(f.colors)}</div><div class="tags dialogTags">${f.roles.length?f.roles.map(r=>`<span class="tag">${labels[r]||r}</span>`).join(''):'<span class="tag">役割未分類</span>'}</div><div class="dialogOracle">${esc(displayOracle(c))}</div>${c.power!=null?`<div class="statLine">P/T：${esc(c.power)} / ${esc(c.toughness)}</div>`:''}<div class="dialogActions"><button class="btn" data-deckadd="${esc(c.name)}">1枚デッキへ追加</button><button class="btn secondary" data-synergy="${esc(c.name)}">このカードの相性を見る</button></div><div class="tiny">収録：${esc(c.set_name||'—')} ${c.released_at?`・ ${esc(c.released_at)}`:''}</div></div></div>`;
  $('cardDialog').showModal();
}
function closeDialog(){if($('cardDialog')?.open)$('cardDialog').close()}
function bindActionContainer(root){root.addEventListener('click',e=>{const detail=e.target.closest('[data-detail]'),add=e.target.closest('[data-deckadd]'),syn=e.target.closest('[data-synergy]');if(detail)showCardDetail(detail.dataset.detail);if(add){addCardToDeck(add.dataset.deckadd);toast(`${add.dataset.deckadd} を追加しました`)}if(syn){closeDialog();$('singleName').value=syn.dataset.synergy;document.querySelector('[data-view="single"]').click();singleAnalyze();}})}
function saves(){try{return JSON.parse(localStorage.getItem('mtgSavedDecks')||'[]')}catch{return[]}}function renderSaves(){let a=saves();$('savedDecks').innerHTML=a.length?a.map((x,i)=>`<div class="savedItem"><div><b>${esc(x.name)}</b><div class="tiny">${new Date(x.time).toLocaleString('ja-JP')}</div></div><div><button class="btn ghost" onclick="loadSave(${i})">開く</button> <button class="btn ghost" onclick="delSave(${i})">削除</button></div></div>`).join(''):'<div class="empty">保存デッキはありません。</div>'}window.loadSave=i=>{let x=saves()[i];$('deckInput').value=x.text;document.querySelector('[data-view="analyzer"]').click()};window.delSave=i=>{let a=saves();a.splice(i,1);localStorage.setItem('mtgSavedDecks',JSON.stringify(a));renderSaves()};
$('saveBtn').onclick=()=>{let text=$('deckInput').value.trim();if(!text)return;let name=prompt('保存名','マイデッキ');if(!name)return;let a=saves();a.unshift({name,text,time:Date.now()});localStorage.setItem('mtgSavedDecks',JSON.stringify(a.slice(0,30)));renderSaves()};
$('sampleBtn').onclick=()=>{$('deckInput').value='Deck\n4 Llanowar Elves\n4 Mossborn Hydra\n4 Innkeeper\'s Talent\n4 Snakeskin Veil\n4 Bushwhack\n4 Pawpatch Formation\n4 Bristly Bill, Spine Sower\n4 Railway Brawler\n2 Archdruid\'s Charm\n2 Nissa, Ascended Animist\n24 Forest'};
$('loadBtn').onclick=()=>fetchPool(true);if($('jpLoadBtn'))$('jpLoadBtn').onclick=()=>fetchJapanese(true);if($('languageSelect')){$('languageSelect').value=displayLang;$('languageSelect').onchange=e=>{displayLang=e.target.value;localStorage.setItem('lunchForgeLang',displayLang);populateCardNames();renderDatabase();if(recs.length)renderResults();toast(displayLang==='ja'?'日本語優先表示に変更しました':'英語表示に変更しました')}};$('analyzeBtn').onclick=analyze;$('singleBtn').onclick=singleAnalyze;$('dbLoadBtn').onclick=()=>prepareDatabase(true);['dbQuery','dbType','dbRole','dbColor','dbSet','dbMv','dbSort'].forEach(id=>$(id).addEventListener('input',renderDatabase));bindActionContainer($('dbResults'));bindActionContainer($('results'));bindActionContainer($('singleResults'));bindActionContainer($('dialogContent'));['search','typeFilter','roleFilter','colorFilter','recLimit'].forEach(id=>$(id).addEventListener('input',renderResults));$('dialogClose').onclick=closeDialog;$('cardDialog').addEventListener('click',e=>{if(e.target===$('cardDialog'))closeDialog()});$('copyDeckBtn').onclick=async()=>{const text=$('deckInput').value.trim();if(!text)return toast('コピーするデッキがありません');try{await navigator.clipboard.writeText(text);toast('デッキリストをコピーしました')}catch{toast('コピーできませんでした。手動で選択してください')}};$('clearDeckBtn').onclick=()=>{if(!$('deckInput').value.trim()||confirm('デッキ入力を消去しますか？')){$('deckInput').value='';toast('デッキ入力を消去しました')}};document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{$('dialogClose').onclick=closeDialog;$('cardDialog').addEventListener('click',e=>{if(e.target===$('cardDialog'))closeDialog()});$('copyDeckBtn').onclick=async()=>{const text=$('deckInput').value.trim();if(!text)return toast('コピーするデッキがありません');try{await navigator.clipboard.writeText(text);toast('デッキリストをコピーしました')}catch{toast('コピーできませんでした。手動で選択してください')}};$('clearDeckBtn').onclick=()=>{if(!$('deckInput').value.trim()||confirm('デッキ入力を消去しますか？')){$('deckInput').value='';toast('デッキ入力を消去しました')}};document.querySelectorAll('.tab').forEach(x=>x.classList.remove('on'));document.querySelectorAll('.view').forEach(x=>x.classList.remove('on'));b.classList.add('on');$(b.dataset.view).classList.add('on');if(b.dataset.view==='library')renderSaves();if(b.dataset.view==='database'&&!pool.length)prepareDatabase(false);if(b.dataset.view==='inspector'){if(!pool.length)prepareDatabase(false);populateCardNames();renderRecentInspector();}});renderSaves();

try{const cached=JSON.parse(localStorage.getItem('mtgStdPoolV5')||'null');if(cached?.cards?.length){pool=cached.cards;$('dbStatus').textContent=`保存データ ${pool.length.toLocaleString()}種類（日本語 ${pool.filter(hasJapanese).length.toLocaleString()}種類）を読み込みました。カード検索を開くと一覧を準備します。`;if(displayLang==='ja'&&!pool.some(hasJapanese))setTimeout(()=>fetchJapanese(false),300);}}catch{}
setTimeout(()=>{const el=$('status');if(el&&!pool.length)el.textContent='JavaScript動作確認済み。デッキを入力して「デッキを分析」を押してください。';},100);

/* ===== Lunch Forge v0.3.0: Card Knowledge Base / Inspector ===== */
const KNOWLEDGE_TAGS = {
  treasure_make:{label:'宝物生成',group:'生成',rx:/create[^.]{0,90}treasure token/i},
  food_make:{label:'食物生成',group:'生成',rx:/create[^.]{0,90}food token/i},
  clue_make:{label:'手掛かり生成',group:'生成',rx:/create[^.]{0,90}clue token|investigate/i},
  creature_token_make:{label:'クリーチャー・トークン生成',group:'生成',rx:/create[^.]{0,100}(?:creature|soldier|goblin|spirit|zombie|human|beast|angel|dragon)[^.]{0,50}token/i},
  token_double:{label:'トークン倍化',group:'利用',rx:/twice that many tokens|additional token|double the number of tokens/i},
  token_buff:{label:'トークン強化',group:'利用',rx:/tokens? you control get|creature tokens? you control/i},
  artifact_sac:{label:'アーティファクト生け贄',group:'利用',rx:/sacrifice (?:an?|another) artifact/i},
  creature_sac:{label:'クリーチャー生け贄',group:'利用',rx:/sacrifice (?:an?|another) creature/i},
  death_trigger:{label:'死亡誘発',group:'誘発',rx:/whenever (?:another )?[^.]{0,45} dies|creature died this turn/i},
  counter_plus:{label:'+1/+1カウンター付与',group:'生成',rx:/put [^.]{0,45}\+1\/\+1 counters?/i},
  counter_any:{label:'カウンター付与',group:'生成',rx:/put [^.]{0,55} counters? on|proliferate/i},
  counter_use:{label:'カウンター利用',group:'利用',rx:/remove [^.]{0,50} counters?|for each [^.]{0,35} counter|modified creature/i},
  mill:{label:'切削',group:'生成',rx:/mill \d+|mill that many|surveil/i},
  discard:{label:'手札を捨てる',group:'生成',rx:/discard (?:a|one|two|three|x|that many) cards?/i},
  grave_cast:{label:'墓地から唱える',group:'利用',rx:/cast [^.]{0,80} from your graveyard|play [^.]{0,80} from your graveyard/i},
  reanimate:{label:'墓地から戦場へ戻す',group:'利用',rx:/return target [^.]{0,80} from your graveyard to the battlefield/i},
  grave_value:{label:'墓地参照',group:'利用',rx:/cards? in your graveyard|from your graveyard|delirium|descend|collect evidence/i},
  single_removal:{label:'単体除去',group:'妨害',rx:/destroy target|exile target|target creature gets -\d+\/-\d+|deals? \d+ damage to target/i},
  board_wipe:{label:'全体除去',group:'妨害',rx:/destroy all|exile all|all creatures get -|deals? \d+ damage to each creature/i},
  counterspell:{label:'打ち消し',group:'妨害',rx:/counter target spell/i},
  bounce:{label:'バウンス',group:'妨害',rx:/return target [^.]{0,65} to its owner's hand/i},
  draw_cards:{label:'カードを引く',group:'補助',rx:/draw (?:a|one|two|three|four|x|that many|\d+) cards?/i},
  impulse:{label:'衝動的ドロー',group:'補助',rx:/exile the top [^.]{0,80}you may (?:play|cast)/i},
  tutor:{label:'サーチ',group:'補助',rx:/search your library for/i},
  mana_add:{label:'マナ加速',group:'補助',rx:/add \{|treasure token|search your library for (?:a|up to one) (?:basic )?land/i},
  extra_land:{label:'追加の土地プレイ',group:'補助',rx:/play an additional land|additional land on each of your turns/i},
  landfall:{label:'土地誘発',group:'誘発',rx:/landfall|whenever a land enters/i},
  protection:{label:'保護',group:'補助',rx:/hexproof|indestructible|phasing|protection from|ward \{/i},
  blink:{label:'明滅',group:'補助',rx:/exile [^.]{0,100} then return|return [^.]{0,100} to the battlefield under/i},
  etb:{label:'戦場に出た時',group:'誘発',rx:/when(?:ever)? [^.]{0,55} enters/i},
  attack:{label:'攻撃誘発',group:'誘発',rx:/whenever [^.]{0,60} attacks/i},
  combat_damage:{label:'戦闘ダメージ誘発',group:'誘発',rx:/combat damage to (?:a player|an opponent)/i},
  life_gain:{label:'ライフゲイン',group:'生成',rx:/you gain \d+ life|you gain that much life|lifelink/i},
  life_payoff:{label:'ライフゲイン利用',group:'利用',rx:/whenever you gain life|if you gained life/i},
  spell_payoff:{label:'呪文誘発',group:'誘発',rx:/whenever you cast [^.]{0,50}(?:spell|instant|sorcery)|prowess/i},
  go_wide:{label:'横並べ',group:'戦略',rx:/creatures? you control get|for each creature you control|create [^.]{0,90} creature token/i},
  go_tall:{label:'一点強化',group:'戦略',rx:/target creature gets \+|double target creature's power|put [^.]{0,45}\+1\/\+1 counter/i},
  evasion:{label:'回避能力',group:'勝ち筋',rx:/flying|menace|can't be blocked|trample/i},
  direct_damage:{label:'直接ダメージ',group:'勝ち筋',rx:/damage to each opponent|target opponent loses|each opponent loses/i},
  alternate_win:{label:'特殊勝利',group:'勝ち筋',rx:/you win the game|opponent loses the game/i}
};
const INTENT_DICTIONARY = [
  {name:'宝物を作る',terms:['宝物','treasure'],tags:['treasure_make']},
  {name:'トークンを作る',terms:['トークン生成','トークンを作る','token'],tags:['creature_token_make','treasure_make','food_make','clue_make']},
  {name:'トークンを強化',terms:['トークン強化','横並べ'],tags:['token_buff','token_double','go_wide']},
  {name:'墓地を肥やす',terms:['墓地を肥やす','切削','mill','捨てる'],tags:['mill','discard']},
  {name:'墓地を使う',terms:['墓地利用','墓地を使う','リアニメイト'],tags:['grave_cast','reanimate','grave_value']},
  {name:'+1/+1カウンター',terms:['+1/+1','カウンター付与'],tags:['counter_plus','counter_any']},
  {name:'カウンターを利用',terms:['カウンター利用','カウンターを使う'],tags:['counter_use']},
  {name:'クリーチャー除去',terms:['除去','クリーチャー除去','破壊','追放'],tags:['single_removal']},
  {name:'全体除去',terms:['全体除去','一掃','wipe'],tags:['board_wipe']},
  {name:'カードを引く',terms:['ドロー','カードを引く','手札補充'],tags:['draw_cards','impulse']},
  {name:'マナ加速',terms:['マナ加速','ランプ','土地を伸ばす'],tags:['mana_add','extra_land']},
  {name:'クリーチャーを守る',terms:['守る','保護','除去耐性'],tags:['protection']},
  {name:'土地デッキ',terms:['土地誘発','上陸','土地を置く'],tags:['landfall','extra_land','mana_add']},
  {name:'ライフゲイン',terms:['ライフゲイン','回復'],tags:['life_gain','life_payoff']},
  {name:'打ち消し',terms:['打ち消し','カウンター呪文'],tags:['counterspell']},
  {name:'明滅',terms:['明滅','ブリンク'],tags:['blink','etb']}
];
const TAG_CONNECTIONS = [
  ['treasure_make','artifact_sac',20,'宝物を生け贄コストとして利用'],
  ['creature_token_make','token_buff',20,'生成したトークンを全体強化'],
  ['creature_token_make','token_double',18,'トークン生成数を増加'],
  ['creature_token_make','creature_sac',15,'生成物を生け贄資源に変換'],
  ['creature_sac','death_trigger',20,'生け贄で死亡誘発を能動的に起動'],
  ['mill','grave_cast',20,'墓地へ送ったカードを唱える'],
  ['mill','reanimate',20,'墓地へ送ったクリーチャーを戻す'],
  ['discard','grave_value',15,'捨てたカードを墓地資源として利用'],
  ['counter_plus','counter_use',20,'付与したカウンターを能力へ変換'],
  ['life_gain','life_payoff',20,'回復を誘発報酬へ変換'],
  ['blink','etb',18,'戦場に出た時の能力を再利用'],
  ['mana_add','alternate_win',8,'重い勝ち手段へ到達'],
  ['mana_add','evasion',7,'大型の攻撃役へ早く到達'],
  ['extra_land','landfall',20,'追加土地で土地誘発を増やす'],
  ['draw_cards','spell_payoff',7,'呪文連鎖を維持']
];
function knowledgeProfile(c){
  const raw=(oracle(c)+' '+type(c)).toLowerCase();
  const tags=Object.entries(KNOWLEDGE_TAGS).filter(([,v])=>v.rx.test(raw)).map(([k])=>k);
  const grouped={};
  for(const tag of tags){const g=KNOWLEDGE_TAGS[tag].group;(grouped[g]??=[]).push(KNOWLEDGE_TAGS[tag].label)}
  const cmc=+c.cmc||0;
  const pace=cmc<=2?'序盤':cmc<=4?'中盤':'終盤';
  const cardType=type(c).toLowerCase();
  const strengths=[];
  if(tags.includes('draw_cards')||tags.includes('tutor'))strengths.push('手札・選択肢を増やす');
  if(tags.includes('single_removal')||tags.includes('board_wipe'))strengths.push('盤面へ干渉できる');
  if(tags.includes('protection'))strengths.push('主力を守れる');
  if(tags.includes('evasion')||tags.includes('direct_damage')||tags.includes('alternate_win'))strengths.push('勝ち筋になり得る');
  if(tags.some(t=>KNOWLEDGE_TAGS[t].group==='生成'))strengths.push('後続カードの資源を作る');
  const needs=[];
  if(tags.some(t=>['treasure_make','creature_token_make','counter_plus','mill','life_gain'].includes(t)))needs.push('生成物を活用するカード');
  if(tags.some(t=>['token_buff','counter_use','grave_cast','death_trigger','life_payoff'].includes(t)))needs.push('誘発条件や資源を安定して供給するカード');
  if(cardType.includes('creature')&&!tags.includes('protection'))needs.push('除去から守る手段');
  return {tags,grouped,pace,strengths:unique(strengths),needs:unique(needs)};
}
function matchIntent(query){
  const q=String(query||'').trim().toLowerCase();
  const matched=INTENT_DICTIONARY.filter(x=>x.terms.some(t=>q.includes(t.toLowerCase())||t.toLowerCase().includes(q)));
  const tags=unique(matched.flatMap(x=>x.tags));
  return {matched,tags};
}
function knowledgeScore(c,queryTags,query){
  const p=knowledgeProfile(c);let score=0;const why=[];
  for(const tag of queryTags){if(p.tags.includes(tag)){score+=24;why.push(KNOWLEDGE_TAGS[tag].label)}}
  const words=String(query||'').toLowerCase().split(/\s+/).filter(Boolean);
  const hay=cardSearchText(c);
  if(words.length&&words.every(w=>hay.includes(w))){score+=18;why.push('カード本文・タイプが検索語に一致')}
  score+=Math.min(8,p.tags.length);
  if(c.legalities?.standard==='legal')score+=5;
  return {card:c,score,why:unique(why),profile:p};
}
function compatibility(seed,c){
  const a=knowledgeProfile(seed),b=knowledgeProfile(c);let raw=12;const why=[],cautions=[];
  const seedColors=seed.color_identity||[],candColors=c.color_identity||[];
  const outside=candColors.filter(x=>!seedColors.includes(x));
  if(!outside.length){raw+=10;why.push('色アイデンティティが一致')}else{raw-=outside.length*12;cautions.push(`追加色が必要：${colors(outside)}`)}
  for(const [from,to,pts,label] of TAG_CONNECTIONS){
    if(a.tags.includes(from)&&b.tags.includes(to)){raw+=pts;why.push(`${KNOWLEDGE_TAGS[from].label} → ${KNOWLEDGE_TAGS[to].label}：${label}`)}
    if(a.tags.includes(to)&&b.tags.includes(from)){raw+=Math.max(8,pts-3);why.push(`${KNOWLEDGE_TAGS[from].label}を供給して${KNOWLEDGE_TAGS[to].label}を支える`)}
  }
  const shared=a.tags.filter(t=>b.tags.includes(t));
  if(shared.length){raw+=Math.min(16,shared.length*4);why.push(`共通テーマ：${shared.slice(0,3).map(t=>KNOWLEDGE_TAGS[t].label).join('・')}`)}
  const af=features(seed),bf=features(c);const subtype=bf.subs.find(x=>af.subs.includes(x));
  if(subtype){raw+=12;why.push(`${subtype}タイプ連携`)}
  if(Math.abs((+seed.cmc||0)-(+c.cmc||0))<=1){raw+=4;why.push('近いマナ域で展開しやすい')}
  if(!why.length)cautions.push('明確な方向性シナジーを検出できませんでした');
  return {card:c,score:Math.max(0,Math.min(100,Math.round(raw))),why:unique(why).slice(0,6),cautions:unique(cautions),profile:b,f:features(c)};
}
function profileBoxes(p){
  const groups=['生成','利用','誘発','補助','妨害','戦略','勝ち筋'];
  return groups.filter(g=>p.grouped[g]?.length).map(g=>`<div class="profileBox"><h4>${g}</h4><div class="tags">${p.grouped[g].map(x=>`<span class="tag">${esc(x)}</span>`).join('')}</div></div>`).join('');
}
function knowledgeCardHTML(x){
  const c=x.card,p=x.profile;
  return `<article class="knowledgeCard"><button class="imageButton" data-detail="${esc(c.name)}">${displayImg(c)?`<img loading="lazy" src="${displayImg(c)}" alt="${esc(displayName(c))}">`:''}</button><div><h3><button class="textButton" data-detail="${esc(c.name)}">${esc(displayName(c))}</button></h3>${englishSubName(c)}<div class="meta">${esc(displayType(c))} ・ MV ${c.cmc||0} ・ ${colors(c.color_identity||[])} ・ ${p.pace}</div><div class="knowledgeSections">${profileBoxes(p)}</div>${x.why.length?`<ul class="explainList">${x.why.map(w=>`<li>${esc(w)}</li>`).join('')}</ul>`:''}<div class="inlineActions"><button class="smallBtn primary" data-deckadd="${esc(c.name)}">デッキへ追加</button><button class="smallBtn" data-synergy="${esc(c.name)}">相性を見る</button><button class="smallBtn" data-detail="${esc(c.name)}">詳細</button></div></div><div class="knowledgeScore"><strong>${x.score}</strong><span class="tiny">知識一致点</span></div></article>`;
}
async function renderKnowledge(){
  if(!pool.length){$('knowledgeStatus').textContent='スタンダードカードを取得しています。';await fetchPool();if(!pool.length)return;}
  const q=$('knowledgeQuery').value.trim();if(!q){$('knowledgeResults').innerHTML='<div class="empty">目的を入力してください。</div>';$('knowledgeCount').textContent='0件';return;}
  const intent=matchIntent(q);
  let arr=pool.map(c=>knowledgeScore(c,intent.tags,q)).filter(x=>x.score>12).sort((a,b)=>b.score-a.score||displayName(a.card).localeCompare(displayName(b.card),'ja')).slice(0,60);
  $('knowledgeCount').textContent=`${arr.length}件`;
  $('knowledgeStatus').textContent=intent.matched.length?`「${intent.matched.map(x=>x.name).join('・')}」として解析しました。`:'カード本文との一致を中心に検索しました。';
  $('knowledgeResults').innerHTML=arr.length?arr.map(knowledgeCardHTML).join(''):'<div class="empty">該当するカードがありません。別の表現も試してください。</div>';
}
function setupKnowledge(){
  if(!$('knowledgeSearchBtn'))return;
  const chips=['宝物を作る','トークンを強化','墓地を肥やす','墓地を使う','+1/+1カウンター','クリーチャー除去','全体除去','カードを引く','マナ加速','クリーチャーを守る','土地デッキ','ライフゲイン'];
  $('quickIntents').innerHTML=chips.map(x=>`<button class="intentChip" data-intent="${esc(x)}">${esc(x)}</button>`).join('');
  $('knowledgeSearchBtn').onclick=renderKnowledge;
  $('knowledgeClearBtn').onclick=()=>{$('knowledgeQuery').value='';$('knowledgeResults').innerHTML='<div class="empty">左で目的を入力してください。</div>';$('knowledgeCount').textContent='0件';$('knowledgeStatus').textContent='検索条件をクリアしました。'};
  $('knowledgeQuery').addEventListener('keydown',e=>{if(e.key==='Enter')renderKnowledge()});
  $('quickIntents').addEventListener('click',e=>{const b=e.target.closest('[data-intent]');if(!b)return;$('knowledgeQuery').value=b.dataset.intent;renderKnowledge()});
  bindActionContainer($('knowledgeResults'));
}
function showCardDetail(name){
  const c=findPoolCard(name);if(!c)return;
  const f=features(c),p=knowledgeProfile(c),legal=c.legalities?.standard==='legal';
  $('dialogContent').innerHTML=`<div class="dialogGrid"><div>${displayImg(c)?`<img class="dialogImage" src="${displayImg(c)}" alt="${esc(displayName(c))}">`:''}</div><div><div class="dialogEyebrow">${legal?'スタンダード使用可':'スタンダード対象外'}</div><h2>${esc(displayName(c))}${hasJapanese(c)&&displayLang==='ja'?'<span class="langBadge">日本語</span>':''}</h2>${englishSubName(c)}<div class="manaCost">${esc(manaCost(c))}</div><div class="meta">${esc(displayType(c))} ・ MV ${c.cmc||0} ・ ${colors(f.colors)} ・ 主な使用帯：${p.pace}</div><div class="tags dialogTags">${f.roles.length?f.roles.map(r=>`<span class="tag">${labels[r]||r}</span>`).join(''):'<span class="tag">従来役割未分類</span>'}</div><div class="dialogOracle">${esc(displayOracle(c))}</div>${c.power!=null?`<div class="statLine">P/T：${esc(c.power)} / ${esc(c.toughness)}</div>`:''}<h3 class="section">Lunch Forge 知識プロフィール</h3><div class="profileGrid">${profileBoxes(p)||'<div class="profileBox"><h4>分類</h4><span class="notice">知識タグを検出できませんでした。</span></div>'}</div>${p.strengths.length?`<div class="profileBox"><h4>このカードが得意なこと</h4><ul class="explainList">${p.strengths.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:''}${p.needs.length?`<div class="profileBox section"><h4>組み合わせたい支援</h4><ul class="explainList">${p.needs.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:''}<div class="dialogActions"><button class="btn" data-deckadd="${esc(c.name)}">1枚デッキへ追加</button><button class="btn secondary" data-synergy="${esc(c.name)}">このカードの相性を見る</button></div><div class="tiny">収録：${esc(c.set_name||'—')} ${c.released_at?`・ ${esc(c.released_at)}`:''}</div></div></div>`;
  $('cardDialog').showModal();
}
async function singleAnalyze(){
  if(!pool.length){$('singleStatus').textContent='先にカードデータを取得します。';await fetchPool();if(!pool.length)return;}
  const name=$('singleName').value.trim();if(!name)return;
  const c=await named(name);if(!c){$('singleStatus').textContent='カードを特定できませんでした。';return}
  const p=knowledgeProfile(c);
  singleRecs=pool.filter(x=>x.name!==c.name).map(x=>compatibility(c,x)).filter(x=>x.score>=18).sort((a,b)=>b.score-a.score).slice(0,40);
  $('singleSeed').innerHTML=`<div class="mini"><h3>${esc(displayName(c))}</h3>${englishSubName(c)}<div class="meta">${esc(displayType(c))} ・ MV ${c.cmc||0}</div><div class="profileGrid">${profileBoxes(p)}</div>${p.needs.length?`<div class="notice">相性探索の重点：${p.needs.map(esc).join('／')}</div>`:''}</div>`;
  $('singleResults').innerHTML=singleRecs.length?singleRecs.map(x=>`<article class="result"><button class="imageButton" data-detail="${esc(x.card.name)}">${displayImg(x.card)?`<img loading="lazy" src="${displayImg(x.card)}" alt="${esc(displayName(x.card))}">`:''}</button><div><h3><button class="textButton" data-detail="${esc(x.card.name)}">${esc(displayName(x.card))}</button></h3>${englishSubName(x.card)}<div class="meta">${esc(displayType(x.card))} ・ MV ${x.card.cmc||0} ・ ${colors(x.card.color_identity||[])}</div><div class="tags">${x.profile.tags.slice(0,5).map(t=>`<span class="tag">${KNOWLEDGE_TAGS[t].label}</span>`).join('')}</div><ul class="explainList">${x.why.map(w=>`<li>${esc(w)}</li>`).join('')}</ul>${x.cautions.length?`<div class="tiny caution">注意：${x.cautions.map(esc).join('／')}</div>`:''}<div class="inlineActions"><button class="smallBtn primary" data-deckadd="${esc(x.card.name)}">デッキへ追加</button><button class="smallBtn" data-detail="${esc(x.card.name)}">詳細</button></div></div><div><div class="score">${x.score}</div><div class="tiny">相性点</div></div></article>`).join(''):'<div class="empty">明確な相性候補を検出できませんでした。</div>';
  $('singleStatus').textContent=`${pool.length.toLocaleString()}種類から方向性シナジーを採点しました。`;
}
setupKnowledge();


/* ===== Card Inspector v0.3.0 ===== */
function cardWeaknesses(c,p){
  const t=type(c).toLowerCase(), weaknesses=[];
  if(t.includes('creature')&&!p.tags.includes('protection'))weaknesses.push('単体除去を受けやすいため、保護呪文や再利用手段が有効');
  if((+c.cmc||0)>=5)weaknesses.push('高マナ域のため、マナ加速や序盤の防御が必要');
  if(p.tags.some(x=>['token_buff','counter_use','grave_cast','life_payoff','death_trigger'].includes(x)))weaknesses.push('単体では機能しにくく、条件を供給するカードが必要');
  if((c.color_identity||[]).length>=3)weaknesses.push('多色カードのため、土地配分と色事故に注意');
  if(!p.tags.some(x=>['single_removal','board_wipe','draw_cards','protection','evasion','direct_damage','alternate_win'].includes(x)))weaknesses.push('即座に盤面や手札へ影響しない可能性がある');
  return unique(weaknesses).slice(0,4);
}
function inspectorCompatibility(seed,limit=8){
  return pool.filter(c=>c.name!==seed.name).map(c=>compatibility(seed,c)).filter(x=>x.score>=24).sort((a,b)=>b.score-a.score||displayName(a.card).localeCompare(displayName(b.card),'ja')).slice(0,limit);
}
function inspectorMiniCard(x){
  const c=x.card;
  return `<article class="inspectorRelated"><button class="imageButton" data-detail="${esc(c.name)}">${displayImg(c)?`<img loading="lazy" src="${displayImg(c)}" alt="${esc(displayName(c))}">`:''}</button><div><b>${esc(displayName(c))}</b>${englishSubName(c)}<div class="scoreLine"><span>${x.score}点</span><small>${esc(x.why[0]||'共通テーマ')}</small></div><div class="inlineActions"><button class="smallBtn" data-detail="${esc(c.name)}">詳細</button><button class="smallBtn primary" data-deckadd="${esc(c.name)}">追加</button></div></div></article>`;
}
function saveRecentInspector(name){
  let a=[];try{a=JSON.parse(localStorage.getItem('lunchForgeRecentInspector')||'[]')}catch{}
  a=[name,...a.filter(x=>x!==name)].slice(0,8);localStorage.setItem('lunchForgeRecentInspector',JSON.stringify(a));renderRecentInspector();
}
function renderRecentInspector(){
  const el=$('recentInspector');if(!el)return;let a=[];try{a=JSON.parse(localStorage.getItem('lunchForgeRecentInspector')||'[]')}catch{}
  el.innerHTML=a.length?a.map(name=>{const c=findPoolCard(name);return c?`<button class="recentCardBtn" data-inspect="${esc(c.name)}">${esc(displayName(c))}</button>`:''}).join(''):'<span class="tiny">まだありません。</span>';
}
async function renderInspector(name){
  const statusEl=$('inspectorStatus');
  try{
    if(!pool.length){statusEl.textContent='カードデータを取得しています。';await prepareDatabase(false);if(!pool.length){statusEl.textContent='カードデータを取得できませんでした。カード検索タブの「再取得」をお試しください。';return;}}
    const raw=String(name||$('inspectorName').value||'').trim();
    if(!raw){statusEl.textContent='カード名を入力するか、入力候補から選択してください。';return;}
    statusEl.textContent=`「${raw}」を検索しています…`;
    let c=findPoolCard(raw);
    if(!c){
      const key=raw.toLowerCase();
      const candidates=pool.filter(x=>x.name.toLowerCase().includes(key)||String(x.jp?.printed_name||x.printed_name||'').toLowerCase().includes(key));
      if(candidates.length===1)c=candidates[0];
      else if(candidates.length>1){
        $('inspectorResult').innerHTML=`<div class="profileBox"><h3>候補を選択してください</h3><div class="candidateList">${candidates.slice(0,20).map(x=>`<button class="recentCardBtn" data-inspect="${esc(x.name)}">${esc(displayName(x))}${x.name!==displayName(x)?`<small>${esc(x.name)}</small>`:''}</button>`).join('')}</div></div>`;
        statusEl.textContent=`${candidates.length}件の候補が見つかりました。カードを選択してください。`;
        return;
      }
    }
    if(!c)c=await named(raw);
    if(!c){statusEl.textContent='カードを特定できませんでした。正式な日本語名または英語名を入力してください。';return;}
  $('inspectorName').value=displayName(c);saveRecentInspector(c.name);
  const p=knowledgeProfile(c),weak=cardWeaknesses(c,p),related=inspectorCompatibility(c,8),f=features(c);
  const roleCount=p.tags.length;
  $('inspectorResult').innerHTML=`<div class="inspectorHero"><div>${displayImg(c)?`<img class="inspectorImage" src="${displayImg(c)}" alt="${esc(displayName(c))}">`:''}</div><div><div class="dialogEyebrow">Lunch Forge Card Profile</div><h2>${esc(displayName(c))}${hasJapanese(c)&&displayLang==='ja'?'<span class="langBadge">日本語</span>':''}</h2>${englishSubName(c)}<div class="meta">${esc(displayType(c))} ・ MV ${c.cmc||0} ・ ${colors(c.color_identity||[])} ・ ${p.pace}</div><div class="inspectorMetrics"><div><strong>${roleCount}</strong><span>知識タグ</span></div><div><strong>${related.length}</strong><span>強い相性候補</span></div><div><strong>${c.legalities?.standard==='legal'?'使用可':'対象外'}</strong><span>スタンダード</span></div></div><div class="dialogOracle">${esc(displayOracle(c))}</div><div class="dialogActions"><button class="btn" data-deckadd="${esc(c.name)}">デッキへ追加</button><button class="btn secondary" data-synergy="${esc(c.name)}">ランキング表示</button></div></div></div>
  <div class="inspectorColumns section"><section><h3>知識プロフィール</h3><div class="profileGrid">${profileBoxes(p)||'<div class="profileBox"><h4>分類</h4><span class="notice">タグを検出できませんでした。</span></div>'}</div></section><section><h3>使い方の要点</h3>${p.strengths.length?`<div class="profileBox"><h4>得意なこと</h4><ul class="explainList">${p.strengths.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:''}${p.needs.length?`<div class="profileBox"><h4>組み合わせたい支援</h4><ul class="explainList">${p.needs.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:''}${weak.length?`<div class="profileBox warningBox"><h4>注意点</h4><ul class="explainList">${weak.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:''}</section></div>
  <section class="section"><div class="knowledgeHeader"><div><h3>相性の良いカード</h3><p class="notice">カードの生成・利用・誘発方向を照合した候補です。</p></div><span class="knowledgeCount">上位${related.length}件</span></div><div class="inspectorRelatedGrid">${related.length?related.map(inspectorMiniCard).join(''):'<div class="empty">明確な候補を検出できませんでした。</div>'}</div></section>`;
  statusEl.textContent=`${pool.length.toLocaleString()}種類から「${displayName(c)}」を解析しました。`;
  }catch(error){
    console.error(error);
    statusEl.textContent='カード解析中にエラーが発生しました：'+(error?.message||error);
  }
}
function setupInspector(){
  if(!$('inspectorBtn'))return;
  $('inspectorBtn').disabled=false;
  $('inspectorBtn').onclick=()=>renderInspector();
  $('inspectorName').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();renderInspector();}});
  $('recentInspector').addEventListener('click',e=>{const b=e.target.closest('[data-inspect]');if(b)renderInspector(b.dataset.inspect)});
  $('inspectorResult').addEventListener('click',e=>{const b=e.target.closest('[data-inspect]');if(b){e.preventDefault();renderInspector(b.dataset.inspect);}});
  bindActionContainer($('inspectorResult'));renderRecentInspector();
}
setupInspector();

/* ===== Lunch Forge v0.4.0: Knowledge Engine α ===== */
let engineProfiles=[];
function profileConfidence(c,p){
  let score=18;
  score+=Math.min(48,p.tags.length*9);
  if(p.grouped['生成']?.length&&p.grouped['利用']?.length)score+=10;
  if(p.strengths.length)score+=8;
  if(p.needs.length)score+=6;
  if(displayOracle(c).trim().length<8)score=Math.min(score,35);
  return Math.max(5,Math.min(100,Math.round(score)));
}
function buildEngineProfiles(){
  engineProfiles=pool.map(card=>{const profile=knowledgeProfile(card);return{card,profile,confidence:profileConfidence(card,profile)}});
  return engineProfiles;
}
function confidenceClass(n){return n>=70?'high':n>=40?'mid':'low'}
function renderEngineSummary(){
  if(!engineProfiles.length)buildEngineProfiles();
  const tagged=engineProfiles.filter(x=>x.profile.tags.length);
  const avg=engineProfiles.reduce((s,x)=>s+x.profile.tags.length,0)/Math.max(1,engineProfiles.length);
  $('engineTotal').textContent=engineProfiles.length.toLocaleString();
  $('engineProfiled').textContent=Math.round(tagged.length/Math.max(1,engineProfiles.length)*100)+'%';
  $('engineTags').textContent=Object.keys(KNOWLEDGE_TAGS).length;
  $('engineAverage').textContent=avg.toFixed(1);
  const counts={};for(const x of engineProfiles)for(const t of x.profile.tags)counts[t]=(counts[t]||0)+1;
  const top=Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,15),max=Math.max(1,...top.map(x=>x[1]));
  $('engineTagChart').innerHTML=top.length?top.map(([t,n])=>`<div class="tagBarRow"><span>${esc(KNOWLEDGE_TAGS[t].label)}</span><div class="tagBarTrack"><div class="tagBarFill" style="width:${Math.round(n/max*100)}%"></div></div><b>${n}</b></div>`).join(''):'<div class="empty">タグを検出できませんでした。</div>';
  const high=engineProfiles.filter(x=>x.confidence>=70).length,mid=engineProfiles.filter(x=>x.confidence>=40&&x.confidence<70).length,low=engineProfiles.filter(x=>x.confidence<40).length,none=engineProfiles.length-tagged.length;
  $('engineQuality').innerHTML=`<div class="qualityItem"><span>高信頼度</span><b>${high.toLocaleString()}枚</b></div><div class="qualityItem"><span>中信頼度</span><b>${mid.toLocaleString()}枚</b></div><div class="qualityItem"><span>要確認</span><b>${low.toLocaleString()}枚</b></div><div class="qualityItem"><span>未分類</span><b>${none.toLocaleString()}枚</b></div>`;
}
function renderEngineResults(){
  if(!engineProfiles.length)buildEngineProfiles();
  const q=String($('engineQuery')?.value||'').trim().toLowerCase(),group=$('engineGroup')?.value||'',sort=$('engineSort')?.value||'confidence';
  let arr=engineProfiles.filter(x=>{
    const labels=x.profile.tags.map(t=>KNOWLEDGE_TAGS[t].label).join(' '),hay=(displayName(x.card)+' '+x.card.name+' '+labels).toLowerCase();
    const groupOk=!group||(group==='未分類'?!x.profile.tags.length:!!x.profile.grouped[group]?.length);
    return groupOk&&(!q||hay.includes(q));
  });
  if(sort==='tags')arr.sort((a,b)=>b.profile.tags.length-a.profile.tags.length||b.confidence-a.confidence);
  else if(sort==='name')arr.sort((a,b)=>displayName(a.card).localeCompare(displayName(b.card),'ja'));
  else arr.sort((a,b)=>a.confidence-b.confidence||a.profile.tags.length-b.profile.tags.length);
  $('engineCount').textContent=`${arr.length.toLocaleString()}件`;
  $('engineResults').innerHTML=arr.slice(0,120).map(x=>`<article class="engineRow"><button class="imageButton" data-detail="${esc(x.card.name)}">${displayImg(x.card)?`<img class="engineThumb" loading="lazy" src="${displayImg(x.card)}" alt="${esc(displayName(x.card))}">`:''}</button><div><h3><button class="textButton" data-detail="${esc(x.card.name)}">${esc(displayName(x.card))}</button></h3>${englishSubName(x.card)}<div class="meta">${esc(displayType(x.card))} ・ MV ${x.card.cmc||0}</div><div class="tags">${x.profile.tags.length?x.profile.tags.slice(0,10).map(t=>`<span class="tag">${esc(KNOWLEDGE_TAGS[t].label)}</span>`).join(''):'<span class="tag bad">未分類</span>'}</div></div><div class="confidence ${confidenceClass(x.confidence)}">${x.confidence}<small>解析信頼度</small></div></article>`).join('')||'<div class="empty">条件に合うカードがありません。</div>';
}
async function prepareEngine(force=false){
  if(!pool.length){$('engineStatus').textContent='スタンダードカードを取得しています。';await fetchPool(force);if(!pool.length)return;}
  $('engineStatus').textContent='知識プロフィールを集計しています…';
  buildEngineProfiles();renderEngineSummary();renderEngineResults();
  $('engineStatus').textContent=`${pool.length.toLocaleString()}種類のカードを、${Object.keys(KNOWLEDGE_TAGS).length}種類の知識タグで解析しました。`;
}
function exportKnowledgeData(){
  if(!engineProfiles.length)buildEngineProfiles();
  const data={version:'0.5.4b',createdAt:new Date().toISOString(),format:'Standard',tagDefinitions:Object.fromEntries(Object.entries(KNOWLEDGE_TAGS).map(([k,v])=>[k,{label:v.label,group:v.group}])),cards:engineProfiles.map(x=>({oracleId:x.card.oracle_id,name:x.card.name,japaneseName:x.card.jp?.printed_name||null,manaValue:x.card.cmc||0,colorIdentity:x.card.color_identity||[],tags:x.profile.tags,groups:x.profile.grouped,strengths:x.profile.strengths,needs:x.profile.needs,confidence:x.confidence}))};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='lunch-forge-knowledge-v0.5.4b.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),500);toast('知識データを書き出しました');
}
function setupEngine(){
  if(!$('engineRefreshBtn'))return;
  $('engineRefreshBtn').onclick=()=>prepareEngine(false);$('engineExportBtn').onclick=exportKnowledgeData;
  ['engineQuery','engineGroup','engineSort'].forEach(id=>$(id).addEventListener('input',renderEngineResults));
  bindActionContainer($('engineResults'));
  const engineTab=document.querySelector('[data-view="engine"]');if(engineTab)engineTab.addEventListener('click',()=>setTimeout(()=>prepareEngine(false),0));
}
setupEngine();


/* ===== Lunch Forge v0.5.0: Card Synergy Advisor α ===== */
function advisorStars(score){const n=score>=72?5:score>=56?4:3;return '★'.repeat(n)+'☆'.repeat(5-n)}
function advisorCategory(seedProfile,candidate){
  const p=candidate.profile;
  const supportTags=['single_removal','board_wipe','counterspell','draw_cards','impulse','protection','mana_add','extra_land'];
  const engineTags=['token_buff','token_double','counter_use','grave_cast','reanimate','grave_value','death_trigger','life_payoff','spell_payoff','landfall'];
  if(p.tags.some(t=>supportTags.includes(t)))return '弱点を補う支援';
  if(p.tags.some(t=>engineTags.includes(t)))return 'シナジーを伸ばす利用役';
  if(p.tags.some(t=>KNOWLEDGE_TAGS[t]?.group==='生成'))return 'シナジーを供給する生成役';
  return '同じゲームプランの候補';
}
function advisorRoleSummary(c,p){
  const roles=[];
  if(p.grouped['生成']?.length)roles.push('資源を作る');
  if(p.grouped['利用']?.length)roles.push('資源を利益に変える');
  if(p.grouped['妨害']?.length)roles.push('相手へ干渉する');
  if(p.grouped['補助']?.length)roles.push('展開を安定させる');
  if(p.grouped['勝ち筋']?.length)roles.push('勝ち筋を担う');
  if(!roles.length)roles.push(type(c).includes('Creature')?'盤面を作る':'専門的な役割を持つ');
  return unique(roles).slice(0,3);
}
function advisorNeeds(c,p){
  const needs=[...p.needs];
  if(type(c).includes('Creature')&&!p.tags.includes('protection'))needs.push('主力を守る保護または再利用');
  if((+c.cmc||0)>=5&&!p.tags.includes('mana_add'))needs.push('序盤を支えるカードやマナ加速');
  if(!p.tags.some(t=>['single_removal','board_wipe','counterspell'].includes(t)))needs.push('相手の脅威へ触る妨害');
  if(!p.tags.some(t=>['draw_cards','impulse','tutor'].includes(t)))needs.push('手札を維持するドロー');
  return unique(needs).slice(0,4);
}
function advisorCandidateHTML(x){
  const c=x.card,cat=advisorCategory(null,x),reason=x.why.slice(0,3);
  return `<article class="advisorCandidate"><button class="imageButton" data-detail="${esc(c.name)}">${displayImg(c)?`<img loading="lazy" src="${displayImg(c)}" alt="${esc(displayName(c))}">`:''}</button><div><div class="advisorCategory">${esc(cat)}</div><h3><button class="textButton" data-detail="${esc(c.name)}">${esc(displayName(c))}</button></h3>${englishSubName(c)}<div class="meta">${esc(displayType(c))} ・ MV ${c.cmc||0} ・ ${colors(c.color_identity||[])}</div><div class="advisorStars" aria-label="推奨度">${advisorStars(x.score)}</div><ul class="explainList">${reason.map(r=>`<li>${esc(r)}</li>`).join('')}</ul>${x.cautions.length?`<div class="tiny caution">条件：${x.cautions.map(esc).join('／')}</div>`:''}<div class="inlineActions"><button class="smallBtn primary" data-deckadd="${esc(c.name)}">デッキへ追加</button><button class="smallBtn" data-inspect="${esc(c.name)}">このカードも解析</button><button class="smallBtn" data-detail="${esc(c.name)}">詳細</button></div></div></article>`;
}
async function renderAdvisor(name){
  const statusEl=$('advisorStatus');
  try{
    if(!pool.length){statusEl.textContent='カードデータを取得しています。';await fetchPool(false);if(!pool.length)return;}
    const raw=String(name||$('advisorName').value||'').trim();if(!raw){statusEl.textContent='カード名を入力してください。';return;}
    let c=findPoolCard(raw)||await named(raw);if(!c){statusEl.textContent='カードを特定できませんでした。';return;}
    $('advisorName').value=displayName(c);
    const p=knowledgeProfile(c),mode=$('advisorMode').value;
    let related=pool.filter(x=>x.name!==c.name).map(x=>compatibility(c,x));
    related.forEach(x=>{if(mode==='support'&&['弱点を補う支援'].includes(advisorCategory(p,x)))x.score+=10;if(mode==='engine'&&advisorCategory(p,x).includes('シナジー'))x.score+=10;if(mode==='curve'&&Math.abs((+c.cmc||0)-(+x.card.cmc||0))<=1)x.score+=7;});
    related=related.filter(x=>x.score>=32).sort((a,b)=>b.score-a.score).slice(0,12);
    const roles=advisorRoleSummary(c,p),needs=advisorNeeds(c,p),weak=cardWeaknesses(c,p);
    $('advisorResult').innerHTML=`<div class="advisorHero"><div>${displayImg(c)?`<img class="advisorSeedImage" src="${displayImg(c)}" alt="${esc(displayName(c))}">`:''}</div><div><div class="dialogEyebrow">構築の中心カード</div><h2>${esc(displayName(c))}</h2>${englishSubName(c)}<div class="meta">${esc(displayType(c))} ・ MV ${c.cmc||0} ・ ${colors(c.color_identity||[])} ・ ${p.pace}</div><div class="advisorSummaryGrid"><section><h3>主な役割</h3>${roles.map(x=>`<div class="advisorPoint goodPoint">✓ ${esc(x)}</div>`).join('')}</section><section><h3>得意なこと</h3>${(p.strengths.length?p.strengths:['カード本文から明確な強みを追加解析中']).map(x=>`<div class="advisorPoint">${esc(x)}</div>`).join('')}</section><section><h3>必要な支援</h3>${needs.map(x=>`<div class="advisorPoint needPoint">□ ${esc(x)}</div>`).join('')}</section></div>${weak.length?`<div class="advisorWarning"><b>構築時の注意</b><ul class="explainList">${weak.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:''}</div></div><section class="section"><div class="knowledgeHeader"><div><h2>理由付きおすすめカード</h2><p class="notice">単なる共通タグではなく、「何を供給し、何を利用するか」の方向で並べています。</p></div><span class="knowledgeCount">${related.length}候補</span></div><div class="advisorCandidates">${related.length?related.map(advisorCandidateHTML).join(''):'<div class="empty">明確な候補を検出できませんでした。</div>'}</div></section>`;
    statusEl.textContent=`${pool.length.toLocaleString()}種類から「${displayName(c)}」の構築支援候補を整理しました。`;
  }catch(error){console.error(error);statusEl.textContent='相談結果の作成中にエラーが発生しました：'+(error?.message||error);}
}
function setupAdvisor(){
  if(!$('advisorBtn'))return;
  $('advisorBtn').onclick=()=>renderAdvisor();
  $('advisorName').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();renderAdvisor();}});
  $('advisorMode').addEventListener('change',()=>{if($('advisorName').value.trim())renderAdvisor();});
  $('advisorResult').addEventListener('click',e=>{const b=e.target.closest('[data-inspect]');if(b){document.querySelector('[data-view="inspector"]').click();setTimeout(()=>renderInspector(b.dataset.inspect),0);}});
  bindActionContainer($('advisorResult'));
}
setupAdvisor();

/* ===== Lunch Forge v0.5.1: Double-faced card display ===== */
const DOUBLE_FACE_LAYOUTS=new Set(['transform','modal_dfc','reversible_card','double_faced_token']);
function cardFaces(c){return Array.isArray(c?.card_faces)&&c.card_faces.length?c.card_faces:[c]}
function localizedFace(c,index){if(Array.isArray(c?.jp?.card_faces))return c.jp.card_faces[index]||null;return index===0?(c?.jp||null):null}
function isDoubleFaced(c){
  const faces=cardFaces(c);
  if(faces.length<2)return false;
  return DOUBLE_FACE_LAYOUTS.has(c?.layout)||faces.filter(f=>f?.image_uris?.normal).length>=2||((c?.jp?.card_faces||[]).filter(f=>f?.image_uris?.normal).length>=2);
}
function faceDisplayData(c,index=0){
  const faces=cardFaces(c),face=faces[index]||faces[0]||c,jface=localizedFace(c,index),ja=displayLang==='ja';
  const englishName=face?.name||c?.name||'—';
  const name=ja?(jface?.printed_name||jface?.name||face?.printed_name||englishName):englishName;
  const typeLine=ja?(jface?.printed_type_line||jface?.type_line||face?.printed_type_line||face?.type_line||c?.type_line||'—'):(face?.type_line||c?.type_line||'—');
  const oracleText=ja?(jface?.printed_text||jface?.oracle_text||face?.printed_text||face?.oracle_text||''):(face?.oracle_text||'');
  const image=(ja?(jface?.image_uris?.normal||null):null)||face?.image_uris?.normal||(index===0?((ja?c?.jp?.image_uris?.normal:null)||c?.image_uris?.normal):null)||'';
  return {
    index,name,englishName,typeLine,oracleText,image,
    manaCost:face?.mana_cost||'—',
    power:face?.power??null,toughness:face?.toughness??null,
    loyalty:face?.loyalty??null,defense:face?.defense??null,
    colors:face?.colors||c?.colors||[]
  };
}
function displayName(c){
  if(displayLang!=='ja')return c?.name||'—';
  const j=localizedCard(c);
  if(Array.isArray(j?.card_faces)&&j.card_faces.length){
    const names=j.card_faces.map((f,i)=>f?.printed_name||f?.name||c?.card_faces?.[i]?.name).filter(Boolean);
    const localized=j.card_faces.some((f,i)=>f?.printed_name&&f.printed_name!==c?.card_faces?.[i]?.name);
    if(names.length&&localized)return names.join(' // ');
  }
  if(j?.printed_name)return j.printed_name;
  if(c?.printed_name)return c.printed_name;
  return c?.name||'—';
}
function displayType(c){
  if(displayLang!=='ja')return type(c);
  const j=localizedCard(c);
  if(j?.printed_type_line)return j.printed_type_line;
  if(c?.printed_type_line)return c.printed_type_line;
  if(Array.isArray(j?.card_faces)&&j.card_faces.length){
    const values=j.card_faces.map((f,i)=>f?.printed_type_line||f?.type_line||c?.card_faces?.[i]?.type_line).filter(Boolean);
    if(values.length)return values.join(' // ');
  }
  return type(c);
}
function displayOracle(c){
  if(displayLang!=='ja')return oracle(c);
  const j=localizedCard(c);
  if(j?.printed_text)return j.printed_text;
  if(c?.printed_text)return c.printed_text;
  if(Array.isArray(c?.card_faces)&&c.card_faces.length){
    return c.card_faces.map((f,i)=>localizedFace(c,i)?.printed_text||localizedFace(c,i)?.oracle_text||f?.printed_text||f?.oracle_text).filter(Boolean).join('\n\n');
  }
  return oracle(c);
}
function displayImg(c,faceIndex=0){return faceDisplayData(c,faceIndex).image||img(c)}
function hasJapanese(c){return !!(c?.jp?.printed_name||c?.printed_name||c?.jp?.card_faces?.some(f=>f?.printed_name||f?.printed_text||f?.image_uris?.normal))}
function englishSubName(c){return displayLang==='ja'&&displayName(c)!==c.name?`<div class="englishName">${esc(c.name)}</div>`:''}
function faceEnglishSubName(face){return displayLang==='ja'&&face.name!==face.englishName?`<div class="englishName">${esc(face.englishName)}</div>`:''}
function faceStatsHTML(face){
  const stats=[];
  if(face.power!=null||face.toughness!=null)stats.push(`P/T：${esc(face.power??'—')} / ${esc(face.toughness??'—')}`);
  if(face.loyalty!=null)stats.push(`忠誠度：${esc(face.loyalty)}`);
  if(face.defense!=null)stats.push(`守備値：${esc(face.defense)}`);
  return stats.length?`<div class="statLine">${stats.join(' ・ ')}</div>`:'';
}
function faceImageHTML(face,label){
  return face.image?`<figure class="dialogFaceFigure"><img class="dialogImage" src="${face.image}" alt="${esc(face.name)}"><figcaption>${esc(label)}：${esc(face.name)}</figcaption></figure>`:`<div class="dialogImageMissing">${esc(label)}の画像はありません</div>`;
}
function faceToolbarHTML(c,mode,index){
  if(!isDoubleFaced(c))return '';
  const faces=cardFaces(c);
  const faceButtons=faces.map((_,i)=>{
    const face=faceDisplayData(c,i),label=i===0?'表面':i===1?'裏面':`面${i+1}`;
    return `<button type="button" class="faceSwitchBtn ${mode==='single'&&index===i?'on':''}" data-face-index="${i}" title="${esc(face.name)}">${label}</button>`;
  }).join('');
  return `<div class="faceToolbar" role="group" aria-label="カード面の表示切り替え"><span class="faceToolbarLabel">カード面</span>${faceButtons}<button type="button" class="faceSwitchBtn ${mode==='both'?'on':''}" data-face-mode="both">両面を並べる</button></div>`;
}
function cardProfileHTML(c){
  const f=features(c),p=knowledgeProfile(c),legal=c.legalities?.standard==='legal';
  return `<div class="dialogCardProfile"><div class="dialogEyebrow">${legal?'スタンダード使用可':'スタンダード対象外'}</div><h3 class="section">Lunch Forge 知識プロフィール</h3><div class="tags dialogTags">${f.roles.length?f.roles.map(r=>`<span class="tag">${labels[r]||r}</span>`).join(''):'<span class="tag">従来役割未分類</span>'}</div><div class="profileGrid">${profileBoxes(p)||'<div class="profileBox"><h4>分類</h4><span class="notice">知識タグを検出できませんでした。</span></div>'}</div>${p.strengths.length?`<div class="profileBox"><h4>このカードが得意なこと</h4><ul class="explainList">${p.strengths.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:''}${p.needs.length?`<div class="profileBox section"><h4>組み合わせたい支援</h4><ul class="explainList">${p.needs.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:''}<div class="dialogActions"><button class="btn" data-deckadd="${esc(c.name)}">1枚デッキへ追加</button><button class="btn secondary" data-synergy="${esc(c.name)}">このカードの相性を見る</button></div><div class="tiny">収録：${esc(c.set_name||'—')} ${c.released_at?`・ ${esc(c.released_at)}`:''}</div></div>`;
}
function singleFaceDetailHTML(c,index){
  const face=faceDisplayData(c,index),label=isDoubleFaced(c)?(index===0?'表面':index===1?'裏面':`面${index+1}`):'カード';
  return `<div class="dialogGrid"><div>${faceImageHTML(face,label)}</div><div><div class="dialogEyebrow">${isDoubleFaced(c)?label:'カード詳細'}</div><h2>${esc(face.name)}${hasJapanese(c)&&displayLang==='ja'?'<span class="langBadge">日本語</span>':''}</h2>${faceEnglishSubName(face)}<div class="manaCost">${esc(face.manaCost)}</div><div class="meta">${esc(face.typeLine)} ・ MV ${c.cmc||0} ・ ${colors(c.color_identity||[])}</div><div class="dialogOracle">${esc(face.oracleText||'ルール文章はありません。')}</div>${faceStatsHTML(face)}${cardProfileHTML(c)}</div></div>`;
}
function bothFacesDetailHTML(c){
  const faces=cardFaces(c).map((_,i)=>faceDisplayData(c,i));
  const cards=faces.map((face,i)=>{
    const label=i===0?'表面':i===1?'裏面':`面${i+1}`;
    return `<article class="dialogFaceCard">${faceImageHTML(face,label)}<div class="dialogFaceBody"><div class="dialogEyebrow">${label}</div><h2>${esc(face.name)}</h2>${faceEnglishSubName(face)}<div class="manaCost">${esc(face.manaCost)}</div><div class="meta">${esc(face.typeLine)}</div><div class="dialogOracle">${esc(face.oracleText||'ルール文章はありません。')}</div>${faceStatsHTML(face)}</div></article>`;
  }).join('');
  return `<div class="dialogBothFaces">${cards}</div>${cardProfileHTML(c)}`;
}
function renderCardDetailFaces(c,mode='single',index=0){
  const dialog=$('cardDialog'),content=$('dialogContent');if(!dialog||!content)return;
  const faces=cardFaces(c),safeIndex=Math.max(0,Math.min(index,faces.length-1));
  dialog.dataset.cardName=c.name;dialog.dataset.faceMode=mode;dialog.dataset.faceIndex=String(safeIndex);
  content.innerHTML=`${faceToolbarHTML(c,mode,safeIndex)}${mode==='both'&&isDoubleFaced(c)?bothFacesDetailHTML(c):singleFaceDetailHTML(c,safeIndex)}`;
}
function showCardDetail(name){
  const c=findPoolCard(name);if(!c)return;
  renderCardDetailFaces(c,'single',0);
  if(!$('cardDialog').open)$('cardDialog').showModal();
}
if($('dialogContent'))$('dialogContent').addEventListener('click',e=>{
  const button=e.target.closest('.faceSwitchBtn');if(!button)return;
  const dialog=$('cardDialog'),c=findPoolCard(dialog?.dataset.cardName||'');if(!c)return;
  if(button.dataset.faceMode==='both')renderCardDetailFaces(c,'both',Number(dialog.dataset.faceIndex)||0);
  else if(button.dataset.faceIndex!=null)renderCardDetailFaces(c,'single',Number(button.dataset.faceIndex)||0);
});

const databaseTabV051=document.querySelector('[data-view="database"]');
if(databaseTabV051)databaseTabV051.addEventListener('click',()=>{if(pool.length){populateCardNames();renderDatabase();}});


/* ===== Lunch Forge v0.5.3: Relationship scoring & verified synergy cases ===== */
const RELATION_DEFS_V053={
  SYNERGY:{label:'Synergy',ja:'相乗効果',className:'synergy'},
  ENABLE:{label:'Enable',ja:'成立支援',className:'enable'},
  ENGINE:{label:'Engine',ja:'循環エンジン',className:'engine'},
  SUPPORT:{label:'Support',ja:'安定化支援',className:'support'},
  COVERAGE:{label:'Coverage',ja:'弱点補完',className:'coverage'}
};
let verifiedSynergyCasesV053=[];
let verifiedSynergyPromiseV053=null;
let cardNamesReadyV053=false;

function normalizeCardNameV053(value){return String(value||'').normalize('NFKC').toLowerCase().replace(/[\s,，・'’"“”/\\:\-—_]/g,'')}
function cardNameVariantsV053(c){
  return unique([
    c?.name,c?.printed_name,c?.jp?.printed_name,
    ...(c?.card_faces||[]).map(f=>f?.name),
    ...(c?.jp?.card_faces||[]).flatMap(f=>[f?.name,f?.printed_name])
  ]).map(normalizeCardNameV053);
}
function caseContainsCardV053(testCase,c){
  const names=(testCase?.cards||[]).flatMap(x=>[x?.nameJa,x?.nameEn]).map(normalizeCardNameV053);
  return cardNameVariantsV053(c).some(v=>names.includes(v));
}
async function loadVerifiedSynergiesV053(force=false){
  if(verifiedSynergyCasesV053.length&&!force)return verifiedSynergyCasesV053;
  if(verifiedSynergyPromiseV053&&!force)return verifiedSynergyPromiseV053;
  verifiedSynergyPromiseV053=(async()=>{
    try{
      const indexUrl=new URL('data/verified-synergies.json',document.baseURI);
      const index=await fetchJson(indexUrl.href,12000,1);
      const loaded=[];
      for(const entry of index.cases||[]){
        try{const caseUrl=new URL(entry.file,indexUrl);loaded.push(await fetchJson(caseUrl.href,12000,1));}catch(error){console.warn('Verified synergy case load failed',entry,error)}
      }
      verifiedSynergyCasesV053=loaded;
      return loaded;
    }catch(error){console.warn('Verified synergy index load failed',error);return []}
    finally{verifiedSynergyPromiseV053=null}
  })();
  return verifiedSynergyPromiseV053;
}
function verifiedCasesForCardV053(c){return verifiedSynergyCasesV053.filter(testCase=>caseContainsCardV053(testCase,c))}
function relationBadgesHTMLV053(relations=[]){
  return unique(relations).map(key=>{const def=RELATION_DEFS_V053[key];return def?`<span class="relationBadge ${def.className}" title="${esc(def.label)}">${esc(def.label)}：${esc(def.ja)}</span>`:''}).join('');
}
function verifiedCaseHTMLV053(testCase){
  const title=testCase.titleJa||(testCase.cards||[]).map(x=>x.nameJa||x.nameEn).join('＋');
  const steps=testCase.explainStepsJa||[];
  const risks=testCase.risksJa||[];
  return `<article class="verifiedCase"><div class="verifiedCaseHead"><div><div class="verifiedLabel">✓ 公式カード文章確認済み</div><h3>${esc(title)}</h3></div><div class="relationRow">${relationBadgesHTMLV053(testCase.relations||[])}</div></div><p class="verifiedSummary">${esc(testCase.summaryJa||'検証済みのカード相互作用です。')}</p>${steps.length?`<ol class="synergyFlow">${steps.map(step=>`<li>${esc(step)}</li>`).join('')}</ol>`:''}${risks.length?`<details class="verifiedRisks"><summary>成立条件と妨害される箇所</summary><ul class="explainList">${risks.map(r=>`<li>${esc(r)}</li>`).join('')}</ul></details>`:''}</article>`;
}
function verifiedSectionHTMLV053(c){
  const cases=verifiedCasesForCardV053(c);if(!cases.length)return '';
  return `<section class="verifiedSection"><div class="knowledgeHeader"><div><h2>検証済みシナジー</h2><p class="notice">手動でカード文章と状態遷移を確認した事例です。自動推薦より優先して表示します。</p></div><span class="knowledgeCount">${cases.length}件</span></div>${cases.map(verifiedCaseHTMLV053).join('')}</section>`;
}
function candidateCoverageV053(seedProfile,candidateProfile,candidateCard){
  const relations=[],why=[];
  const has=t=>candidateProfile.tags.includes(t),seedHas=t=>seedProfile.tags.includes(t);
  if(!seedHas('protection')&&has('protection')){relations.push('COVERAGE','SUPPORT');why.push('主力を除去から守る手段を補う')}
  if(!seedHas('draw_cards')&&!seedHas('impulse')&&(has('draw_cards')||has('impulse')||has('tutor'))){relations.push('COVERAGE','SUPPORT');why.push('不足しやすい手札・選択肢を補う')}
  if(!seedHas('single_removal')&&!seedHas('board_wipe')&&!seedHas('counterspell')&&(has('single_removal')||has('board_wipe')||has('counterspell'))){relations.push('COVERAGE','SUPPORT');why.push('相手の脅威へ触る手段を補う')}
  if((+candidateCard.cmc||0)<=3&&(has('mana_add')||has('extra_land'))){relations.push('SUPPORT');why.push('展開を安定させるマナ支援')}
  return {relations:unique(relations),why:unique(why)};
}
function compatibility(seed,c){
  const a=knowledgeProfile(seed),b=knowledgeProfile(c),relations=new Set();let raw=4;const why=[],cautions=[];
  const seedColors=seed.color_identity||[],candColors=c.color_identity||[];
  const outside=candColors.filter(x=>!seedColors.includes(x));
  if(outside.length){raw-=outside.length*18;cautions.push(`採用には追加色が必要：${colors(outside)}`)}
  for(const [from,to,pts,label] of TAG_CONNECTIONS){
    if(a.tags.includes(from)&&b.tags.includes(to)){
      raw+=pts;relations.add('SYNERGY');why.push(`${KNOWLEDGE_TAGS[from].label} → ${KNOWLEDGE_TAGS[to].label}：${label}`);
      if(['reanimate','grave_cast','death_trigger','landfall','life_payoff','counter_use','token_double'].includes(to))relations.add('ENGINE');
    }
    if(b.tags.includes(from)&&a.tags.includes(to)){
      raw+=Math.max(10,pts-2);relations.add('ENABLE');why.push(`${displayName(c)}の${KNOWLEDGE_TAGS[from].label}が、${displayName(seed)}の${KNOWLEDGE_TAGS[to].label}を成立させる`);
      if(['reanimate','grave_cast','death_trigger','landfall','life_payoff','counter_use','token_double'].includes(to))relations.add('ENGINE');
    }
  }
  const coverage=candidateCoverageV053(a,b,c);coverage.relations.forEach(x=>relations.add(x));why.push(...coverage.why);raw+=coverage.why.length*9;
  const shared=a.tags.filter(t=>b.tags.includes(t));
  if(shared.length){raw+=Math.min(6,shared.length*2);why.push(`補助的な共通テーマ：${shared.slice(0,3).map(t=>KNOWLEDGE_TAGS[t].label).join('・')}`)}
  const af=features(seed),bf=features(c),subtype=bf.subs.find(x=>af.subs.includes(x));
  if(subtype){raw+=8;relations.add('SYNERGY');why.push(`${subtype}タイプを直接共有`)}
  if(Math.abs((+seed.cmc||0)-(+c.cmc||0))<=1)raw+=1;
  if(!why.length)cautions.push('明確な効果接続を検出できませんでした');
  return {card:c,score:Math.max(0,Math.min(100,Math.round(raw))),why:unique(why).slice(0,6),cautions:unique(cautions),relations:[...relations],profile:b,f:features(c)};
}
function scoreCard(c,stats,strategy,seedCards){
  const f=features(c),relations=new Set();let score=0,why=[];
  const outside=f.colors.filter(x=>!stats.cols.includes(x));
  if(outside.length)score-=35*outside.length;
  const deckRoles=stats.counts;
  for(const [maker,payoff] of pairs){
    if((deckRoles[maker]||0)>0&&f.roles.includes(payoff)){score+=14;relations.add('SYNERGY');why.push(`${labels[maker]}を${labels[payoff]}で活用`)}
    if((deckRoles[payoff]||0)>0&&f.roles.includes(maker)){score+=12;relations.add('ENABLE');why.push(`${labels[payoff]}を支える${labels[maker]}`)}
  }
  const needs={removal:4,draw:4,ramp:3,protection:2,finisher:3};
  for(const [r,n] of Object.entries(needs))if((deckRoles[r]||0)<n&&f.roles.includes(r)){score+=13;relations.add('COVERAGE');relations.add('SUPPORT');why.push(`不足している${labels[r]}を補完`)}
  const avg=stats.avg||3,d=Math.abs(f.cmc-avg);score+=Math.max(0,5-d*1.5);
  const band=Math.min(7,Math.floor(f.cmc));
  if(stats.curve[band]<4){score+=5;relations.add('SUPPORT');why.push(`${band===7?'7+':band}マナ域を補完`)}else if(stats.curve[band]>10)score-=4;
  const deckSubs=seedCards.flatMap(x=>features(x.card).subs),shared=f.subs.filter(x=>deckSubs.includes(x));
  if(shared.length){score+=strategy==='tribal'?18:8;relations.add('SYNERGY');why.push(`${shared[0]}タイプ連携`)}
  if(strategy==='engine'&&relations.has('SYNERGY'))score+=8;
  if(strategy==='support'&&(relations.has('SUPPORT')||relations.has('COVERAGE')))score+=6;
  if(strategy==='curve'&&stats.curve[band]<4)score+=7;
  if(type(c).includes('Land')&&stats.lands>=25)score-=8;
  return {card:c,score:Math.round(score*10)/10,why:unique(why).slice(0,6),relations:[...relations],f};
}
function cardHTML(x){
  return `<article class="result"><button class="imageButton" data-detail="${esc(x.card.name)}" aria-label="${esc(x.card.name)}の詳細">${displayImg(x.card)?`<img loading="lazy" src="${displayImg(x.card)}" alt="${esc(displayName(x.card))}">`:''}</button><div><h3><button class="textButton" data-detail="${esc(x.card.name)}">${esc(displayName(x.card))}</button></h3>${englishSubName(x.card)}<div class="meta">${esc(displayType(x.card))} ・ MV ${x.card.cmc||0} ・ ${colors(x.f.colors)}</div><div class="relationRow">${relationBadgesHTMLV053(x.relations||[])}</div>${x.why.length?`<ul class="explainList">${x.why.map(w=>`<li>${esc(w)}</li>`).join('')}</ul>`:''}${x.cautions?.length?`<div class="tiny caution">注意：${x.cautions.map(esc).join('／')}</div>`:''}<div class="tags">${x.f.roles.slice(0,4).map(r=>`<span class="tag">${labels[r]||r}</span>`).join('')}</div><div class="oracle">${esc(displayOracle(x.card))}</div><div class="inlineActions"><button class="smallBtn primary" data-deckadd="${esc(x.card.name)}">デッキへ追加</button><button class="smallBtn" data-detail="${esc(x.card.name)}">詳細を見る</button></div></div><div><div class="score">${x.score}</div><div class="tiny">効果適合点</div></div></article>`;
}
function candidateResultHTMLV053(x){
  return `<article class="result"><button class="imageButton" data-detail="${esc(x.card.name)}">${displayImg(x.card)?`<img loading="lazy" src="${displayImg(x.card)}" alt="${esc(displayName(x.card))}">`:''}</button><div><h3><button class="textButton" data-detail="${esc(x.card.name)}">${esc(displayName(x.card))}</button></h3>${englishSubName(x.card)}<div class="meta">${esc(displayType(x.card))} ・ MV ${x.card.cmc||0} ・ ${colors(x.card.color_identity||[])}</div><div class="relationRow">${relationBadgesHTMLV053(x.relations)}</div><div class="tags">${x.profile.tags.slice(0,5).map(t=>`<span class="tag">${KNOWLEDGE_TAGS[t].label}</span>`).join('')}</div><ul class="explainList">${x.why.map(w=>`<li>${esc(w)}</li>`).join('')}</ul>${x.cautions.length?`<div class="tiny caution">注意：${x.cautions.map(esc).join('／')}</div>`:''}<div class="inlineActions"><button class="smallBtn primary" data-deckadd="${esc(x.card.name)}">デッキへ追加</button><button class="smallBtn" data-detail="${esc(x.card.name)}">詳細</button></div></div><div><div class="score">${x.score}</div><div class="tiny">効果接続点</div></div></article>`;
}
async function singleAnalyze(){
  if(!pool.length){$('singleStatus').textContent='先にカードデータを取得します。';await fetchPool();if(!pool.length)return;}
  const name=$('singleName').value.trim();if(!name)return;
  const c=findPoolCard(name)||await named(name);if(!c){$('singleStatus').textContent='カードを特定できませんでした。';return;}
  $('singleName').value=displayName(c);await loadVerifiedSynergiesV053(false);
  const p=knowledgeProfile(c),verified=verifiedCasesForCardV053(c);
  singleRecs=pool.filter(x=>x.name!==c.name).map(x=>compatibility(c,x)).filter(x=>x.score>=18&&x.why.length).sort((a,b)=>b.score-a.score||displayName(a.card).localeCompare(displayName(b.card),'ja')).slice(0,40);
  $('singleSeed').innerHTML=`<div class="mini"><h3>${esc(displayName(c))}</h3>${englishSubName(c)}<div class="meta">${esc(displayType(c))} ・ MV ${c.cmc||0}</div><div class="profileGrid">${profileBoxes(p)}</div>${p.needs.length?`<div class="notice">相性探索の重点：${p.needs.map(esc).join('／')}</div>`:''}</div>`;
  const auto=`<section class="automaticSection"><div class="knowledgeHeader"><div><h2>自動探索候補</h2><p class="notice">色一致では加点せず、効果の供給・利用・条件成立・弱点補完で採点します。</p></div><span class="knowledgeCount">${singleRecs.length}件</span></div>${singleRecs.length?singleRecs.map(candidateResultHTMLV053).join(''):'<div class="empty">明確な効果接続を検出できませんでした。</div>'}</section>`;
  $('singleResults').innerHTML=verifiedSectionHTMLV053(c)+auto;
  $('singleStatus').textContent=`${pool.length.toLocaleString()}種類から効果接続を採点しました。検証済み事例：${verified.length}件。`;
}
function advisorCategory(seedProfile,candidate){
  const r=candidate.relations||[];
  if(r.includes('COVERAGE'))return 'Coverage：弱点補完';
  if(r.includes('ENGINE'))return 'Engine：循環エンジン';
  if(r.includes('ENABLE'))return 'Enable：成立支援';
  if(r.includes('SYNERGY'))return 'Synergy：相乗効果';
  if(r.includes('SUPPORT'))return 'Support：安定化支援';
  return '効果接続を追加確認';
}
function advisorCandidateHTML(x){
  const c=x.card,cat=advisorCategory(null,x),reason=x.why.slice(0,4);
  return `<article class="advisorCandidate"><button class="imageButton" data-detail="${esc(c.name)}">${displayImg(c)?`<img loading="lazy" src="${displayImg(c)}" alt="${esc(displayName(c))}">`:''}</button><div><div class="advisorCategory">${esc(cat)}</div><h3><button class="textButton" data-detail="${esc(c.name)}">${esc(displayName(c))}</button></h3>${englishSubName(c)}<div class="meta">${esc(displayType(c))} ・ MV ${c.cmc||0} ・ ${colors(c.color_identity||[])}</div><div class="relationRow">${relationBadgesHTMLV053(x.relations)}</div><div class="advisorStars" aria-label="推奨度">${advisorStars(x.score)}</div><ul class="explainList">${reason.map(r=>`<li>${esc(r)}</li>`).join('')}</ul>${x.cautions.length?`<div class="tiny caution">条件：${x.cautions.map(esc).join('／')}</div>`:''}<div class="inlineActions"><button class="smallBtn primary" data-deckadd="${esc(c.name)}">デッキへ追加</button><button class="smallBtn" data-inspect="${esc(c.name)}">このカードも解析</button><button class="smallBtn" data-detail="${esc(c.name)}">詳細</button></div></div></article>`;
}
async function renderAdvisor(name){
  const statusEl=$('advisorStatus');
  try{
    if(!pool.length){statusEl.textContent='カードデータを取得しています。';await fetchPool(false);if(!pool.length)return;}
    const raw=String(name||$('advisorName').value||'').trim();if(!raw){statusEl.textContent='カード名を入力してください。';return;}
    const c=findPoolCard(raw)||await named(raw);if(!c){statusEl.textContent='カードを特定できませんでした。';return;}
    $('advisorName').value=displayName(c);await loadVerifiedSynergiesV053(false);
    const p=knowledgeProfile(c),mode=$('advisorMode').value;
    let related=pool.filter(x=>x.name!==c.name).map(x=>compatibility(c,x));
    related.forEach(x=>{if(mode==='support'&&(x.relations.includes('SUPPORT')||x.relations.includes('COVERAGE')))x.score+=10;if(mode==='engine'&&(x.relations.includes('SYNERGY')||x.relations.includes('ENABLE')||x.relations.includes('ENGINE')))x.score+=10;if(mode==='curve'&&Math.abs((+c.cmc||0)-(+x.card.cmc||0))<=1)x.score+=7;});
    related=related.filter(x=>x.score>=25&&x.why.length).sort((a,b)=>b.score-a.score).slice(0,12);
    const roles=advisorRoleSummary(c,p),needs=advisorNeeds(c,p),weak=cardWeaknesses(c,p),verified=verifiedCasesForCardV053(c);
    $('advisorResult').innerHTML=`<div class="advisorHero"><div>${displayImg(c)?`<img class="advisorSeedImage" src="${displayImg(c)}" alt="${esc(displayName(c))}">`:''}</div><div><div class="dialogEyebrow">構築の中心カード</div><h2>${esc(displayName(c))}</h2>${englishSubName(c)}<div class="meta">${esc(displayType(c))} ・ MV ${c.cmc||0} ・ ${colors(c.color_identity||[])} ・ ${p.pace}</div><div class="advisorSummaryGrid"><section><h3>主な役割</h3>${roles.map(x=>`<div class="advisorPoint goodPoint">✓ ${esc(x)}</div>`).join('')}</section><section><h3>得意なこと</h3>${(p.strengths.length?p.strengths:['カード本文から明確な強みを追加解析中']).map(x=>`<div class="advisorPoint">${esc(x)}</div>`).join('')}</section><section><h3>必要な支援</h3>${needs.map(x=>`<div class="advisorPoint needPoint">□ ${esc(x)}</div>`).join('')}</section></div>${weak.length?`<div class="advisorWarning"><b>構築時の注意</b><ul class="explainList">${weak.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:''}</div></div>${verifiedSectionHTMLV053(c)}<section class="section"><div class="knowledgeHeader"><div><h2>理由付きおすすめカード</h2><p class="notice">色一致では加点せず、Synergy・Enable・Engine・Support・Coverageに分けて表示します。</p></div><span class="knowledgeCount">${related.length}候補</span></div><div class="advisorCandidates">${related.length?related.map(advisorCandidateHTML).join(''):'<div class="empty">明確な効果接続を検出できませんでした。</div>'}</div></section>`;
    statusEl.textContent=`${pool.length.toLocaleString()}種類から「${displayName(c)}」を解析しました。検証済み事例：${verified.length}件。`;
  }catch(error){console.error(error);statusEl.textContent='相談結果の作成中にエラーが発生しました：'+(error?.message||error);}
}
function populateCardNames(){
  const dl=$('cardNames');if(!dl||cardNamesReadyV053)return;
  dl.innerHTML=pool.slice().sort((a,b)=>displayName(a).localeCompare(displayName(b),'ja')).map(c=>`<option value="${esc(displayName(c))}" label="${esc(c.name)}"></option>`).join('');
  cardNamesReadyV053=true;
}
function ensureCardNamesV053(){if(pool.length&&!cardNamesReadyV053)populateCardNames()}
document.querySelectorAll('input[list="cardNames"]').forEach(input=>input.addEventListener('focus',ensureCardNamesV053,{once:true}));
const databaseTabV053=document.querySelector('[data-view="database"]');if(databaseTabV053)databaseTabV053.addEventListener('click',()=>{ensureCardNamesV053();if(pool.length)renderDatabase();});
setTimeout(()=>loadVerifiedSynergiesV053(false),500);


/* ===== Lunch Forge v0.5.4: Deck Intelligence ===== */
let currentDeckKnowledgeV054=null;

function clampV054(n,min=0,max=100){return Math.max(min,Math.min(max,n))}
function deckKnowledgeProfileV054(entries){
  const main=entries.filter(x=>!x.side&&x.card),tagCounts={},tagCards={},groupCounts={};
  for(const entry of main){
    const p=knowledgeProfile(entry.card),qty=Math.max(1,+entry.qty||1);
    for(const tag of p.tags){
      tagCounts[tag]=(tagCounts[tag]||0)+qty;
      (tagCards[tag]??=[]).push({name:displayName(entry.card),englishName:entry.card.name,qty});
      const group=KNOWLEDGE_TAGS[tag]?.group||'未分類';groupCounts[group]=(groupCounts[group]||0)+qty;
    }
  }
  const connections=TAG_CONNECTIONS.map(([from,to,points,label])=>{
    const fromCount=tagCounts[from]||0,toCount=tagCounts[to]||0;
    return {from,to,points,label,fromCount,toCount,strength:Math.min(fromCount,toCount)};
  }).filter(x=>x.fromCount&&x.toCount).sort((a,b)=>(b.points+b.strength)-(a.points+a.strength));
  const producers=new Set(TAG_CONNECTIONS.map(x=>x[0])),consumers=new Set(TAG_CONNECTIONS.map(x=>x[1]));
  const supplies=Object.entries(tagCounts).filter(([tag])=>KNOWLEDGE_TAGS[tag]?.group==='生成'||producers.has(tag)).sort((a,b)=>b[1]-a[1]);
  const uses=Object.entries(tagCounts).filter(([tag])=>['利用','誘発','勝ち筋'].includes(KNOWLEDGE_TAGS[tag]?.group)||consumers.has(tag)).sort((a,b)=>b[1]-a[1]);
  const gaps=[];
  for(const [tag,count] of supplies){
    const routes=TAG_CONNECTIONS.filter(x=>x[0]===tag);
    if(count>=2&&routes.length&&!routes.some(x=>(tagCounts[x[1]]||0)>0))gaps.push({kind:'consumer',tag,count,label:`${KNOWLEDGE_TAGS[tag].label}を活用する受け口が少ない`});
  }
  for(const [tag,count] of uses){
    const routes=TAG_CONNECTIONS.filter(x=>x[1]===tag);
    if(count>=2&&routes.length&&!routes.some(x=>(tagCounts[x[0]]||0)>0))gaps.push({kind:'supplier',tag,count,label:`${KNOWLEDGE_TAGS[tag].label}を安定して成立させる供給源が少ない`});
  }
  const utilityDefs=[
    {code:'interaction',label:'相手の脅威へ触る手段',tags:['single_removal','board_wipe','counterspell','bounce'],target:4},
    {code:'cards',label:'手札・選択肢を増やす手段',tags:['draw_cards','impulse','tutor'],target:4},
    {code:'protection',label:'主力を守る手段',tags:['protection'],target:2},
    {code:'mana',label:'展開を支えるマナ加速',tags:['mana_add','extra_land','treasure_make'],target:3},
    {code:'win',label:'明確な勝ち筋',tags:['evasion','direct_damage','alternate_win','go_wide','go_tall'],target:3}
  ];
  const utility=utilityDefs.map(def=>({...def,count:def.tags.reduce((sum,t)=>sum+(tagCounts[t]||0),0)}));
  for(const item of utility)if(item.count<item.target)gaps.push({kind:'coverage',code:item.code,count:item.count,target:item.target,tags:item.tags,label:`${item.label}が少ない（目安 ${item.target}枚）`});
  const topConnection=connections[0];
  const topStrategy=Object.entries(groupCounts).sort((a,b)=>b[1]-a[1])[0];
  const plan=topConnection?`${KNOWLEDGE_TAGS[topConnection.from].label} → ${KNOWLEDGE_TAGS[topConnection.to].label}`:topStrategy?`${topStrategy[0]}を中心とした構成`:'効果接続を追加確認';
  const supportRate=utility.reduce((sum,x)=>sum+Math.min(1,x.count/Math.max(1,x.target)),0)/utility.length;
  const connectionValue=Math.min(55,connections.reduce((sum,x)=>sum+Math.min(13,7+x.strength),0));
  const engineScore=clampV054(Math.round(20+connectionValue+supportRate*25-Math.min(28,gaps.length*4)));
  return {main,tagCounts,tagCards,groupCounts,connections,supplies,uses,gaps,utility,plan,engineScore};
}
function examplesForTagV054(profile,tag){
  const cards=profile.tagCards[tag]||[],seen=new Set(),out=[];
  for(const x of cards){if(seen.has(x.englishName))continue;seen.add(x.englishName);out.push(`${x.name}×${x.qty}`);if(out.length>=2)break;}
  return out.join('、');
}
function deckTagRowsHTMLV054(profile,items,emptyText){
  return items.length?items.slice(0,8).map(([tag,count])=>`<div class="deckIntelRow"><div><b>${esc(KNOWLEDGE_TAGS[tag]?.label||tag)}</b><small>${esc(examplesForTagV054(profile,tag))}</small></div><span>${count}枚</span></div>`).join(''):`<div class="deckIntelEmpty">${esc(emptyText)}</div>`;
}
function completeVerifiedCasesV054(profile){
  return verifiedSynergyCasesV053.filter(testCase=>(testCase.cards||[]).every(card=>profile.main.some(entry=>{
    const variants=cardNameVariantsV053(entry.card);return [card.nameJa,card.nameEn].map(normalizeCardNameV053).some(name=>variants.includes(name));
  })));
}
function renderDeckIntelligenceV054(profile){
  const el=$('deckIntelligence');if(!el)return;
  const verified=completeVerifiedCasesV054(profile);
  const connectionHTML=profile.connections.length?profile.connections.slice(0,7).map(x=>`<div class="deckConnection"><div class="deckConnectionArrow"><span>${esc(KNOWLEDGE_TAGS[x.from].label)}</span><b>→</b><span>${esc(KNOWLEDGE_TAGS[x.to].label)}</span></div><small>${esc(x.label)}・供給${x.fromCount}枚／利用${x.toCount}枚</small></div>`).join(''):'<div class="deckIntelEmpty">明確な供給→利用の接続をまだ検出できません。</div>';
  const gapHTML=profile.gaps.length?profile.gaps.slice(0,8).map(x=>`<div class="deckGap"><span>!</span><div>${esc(x.label)}</div></div>`).join(''):'<div class="deckIntelGood">✓ 主要な不足・孤立は検出されませんでした。</div>';
  const verifiedHTML=verified.length?`<section class="deckVerified section"><div class="knowledgeHeader"><div><h3>デッキ内で成立する検証済み事例</h3><p class="notice">必要カードがすべてメインデッキに含まれています。</p></div><span class="knowledgeCount">${verified.length}件</span></div>${verified.map(verifiedCaseHTMLV053).join('')}</section>`:'';
  el.innerHTML=`<div class="deckIntelHead"><div><div class="dialogEyebrow">Deck Intelligence v0.5.4</div><h2>デッキの効果構造</h2><p class="notice">カードを「何を供給するか」「何に利用するか」「何が不足しているか」で集計します。</p></div><div class="deckIntelScore"><strong>${profile.engineScore}</strong><span>効果構造点</span></div></div><div class="deckPlan"><span>推定ゲームプラン</span><b>${esc(profile.plan)}</b></div><div class="deckIntelGrid"><section><h3>供給しているもの</h3>${deckTagRowsHTMLV054(profile,profile.supplies,'明確な生成・供給タグがありません。')}</section><section><h3>利用・誘発・勝ち筋</h3>${deckTagRowsHTMLV054(profile,profile.uses,'明確な利用先・誘発条件がありません。')}</section><section><h3>成立している接続</h3>${connectionHTML}</section><section><h3>不足・孤立</h3>${gapHTML}</section></div>${verifiedHTML}`;
}
function gapCoverageForCandidateV054(profile,candidateProfile){
  const why=[],relations=[];
  for(const gap of profile.gaps){
    if(gap.kind==='consumer'){
      for(const [from,to] of TAG_CONNECTIONS)if(from===gap.tag&&candidateProfile.tags.includes(to)){why.push(`${KNOWLEDGE_TAGS[gap.tag].label}の活用先として${KNOWLEDGE_TAGS[to].label}を追加`);relations.push('COVERAGE','SYNERGY');}
    }else if(gap.kind==='supplier'){
      for(const [from,to] of TAG_CONNECTIONS)if(to===gap.tag&&candidateProfile.tags.includes(from)){why.push(`${KNOWLEDGE_TAGS[gap.tag].label}に必要な${KNOWLEDGE_TAGS[from].label}を供給`);relations.push('COVERAGE','ENABLE');}
    }else if(gap.kind==='coverage'&&gap.tags.some(t=>candidateProfile.tags.includes(t))){why.push(`不足している${gap.label.replace(/が少ない.*$/,'')}を補完`);relations.push('COVERAGE','SUPPORT');}
  }
  return {why:unique(why),relations:unique(relations)};
}
function scoreCard(c,stats,strategy,seedCards){
  const f=features(c),p=knowledgeProfile(c),profile=currentDeckKnowledgeV054||deckKnowledgeProfileV054(seedCards),relations=new Set();let score=0;const why=[],cautions=[];
  const outside=f.colors.filter(x=>!stats.cols.includes(x));if(outside.length){score-=35*outside.length;cautions.push(`採用には追加色が必要：${colors(outside)}`);}
  for(const [from,to,points,label] of TAG_CONNECTIONS){
    const fromCount=profile.tagCounts[from]||0,toCount=profile.tagCounts[to]||0;
    if(fromCount&&p.tags.includes(to)){score+=points+Math.min(8,Math.floor(fromCount/2));relations.add('SYNERGY');why.push(`デッキの${KNOWLEDGE_TAGS[from].label}（${fromCount}枚）を${KNOWLEDGE_TAGS[to].label}で活用：${label}`);}
    if(toCount&&p.tags.includes(from)){score+=Math.max(10,points-2)+Math.min(8,Math.floor(toCount/2));relations.add('ENABLE');why.push(`デッキの${KNOWLEDGE_TAGS[to].label}（${toCount}枚）に${KNOWLEDGE_TAGS[from].label}を供給`);}
  }
  const coverage=gapCoverageForCandidateV054(profile,p);coverage.relations.forEach(x=>relations.add(x));why.push(...coverage.why);score+=coverage.why.length*14;
  if(coverage.why.length&&relations.has('SYNERGY')&&relations.has('ENABLE'))relations.add('ENGINE');
  const band=Math.min(7,Math.floor(+c.cmc||0));
  if(stats.curve[band]<4){score+=4;relations.add('SUPPORT');why.push(`${band===7?'7+':band}マナ域の薄さを補う`)}else if(stats.curve[band]>10)score-=4;
  const deckSubs=seedCards.flatMap(x=>features(x.card).subs),shared=f.subs.filter(x=>deckSubs.includes(x));
  if(shared.length){score+=strategy==='tribal'?16:6;relations.add('SYNERGY');why.push(`${shared[0]}タイプをデッキと共有`)}
  if(strategy==='engine'&&(relations.has('SYNERGY')||relations.has('ENABLE')||relations.has('ENGINE')))score+=9;
  if(strategy==='support'&&(relations.has('SUPPORT')||relations.has('COVERAGE')))score+=8;
  if(strategy==='curve'&&stats.curve[band]<4)score+=7;
  if(type(c).includes('Land')&&stats.lands>=25)score-=8;
  if(!why.length)score-=10;
  return {card:c,score:Math.round(score*10)/10,why:unique(why).slice(0,7),cautions:unique(cautions),relations:[...relations],profile:p,f};
}
async function analyze(){
  if(!pool.length){status('先にカードデータを取得します。',3);await fetchPool();if(!pool.length)return;}
  const parsed=parseDeck($('deckInput').value);if(!parsed.length){status('デッキを入力してください。');return;}
  $('analyzeBtn').disabled=true;deck=[];
  try{
    for(let i=0;i<parsed.length;i++){
      status(`カード特定中 ${i+1}/${parsed.length}`,10+52*i/parsed.length);
      const c=findPoolCard(parsed[i].name)||await named(parsed[i].name);
      deck.push({...parsed[i],card:c||null});await sleep(60);
    }
    const resolved=deck.filter(x=>x.card),mainResolved=resolved.filter(x=>!x.side),stats=deckStats(deck);
    currentDeckKnowledgeV054=deckKnowledgeProfileV054(mainResolved);await loadVerifiedSynergiesV053(false);
    renderStats(stats,parsed.length,resolved.length,currentDeckKnowledgeV054);
    const present=new Set(resolved.map(x=>x.card.name));
    recs=pool.filter(c=>!present.has(c.name)).map(c=>scoreCard(c,stats,$('strategy').value,mainResolved)).filter(x=>x.score>=12&&x.why.length).sort((a,b)=>b.score-a.score||displayName(a.card).localeCompare(displayName(b.card),'ja'));
    status(`${resolved.length}/${parsed.length}種類を特定。効果接続${currentDeckKnowledgeV054.connections.length}件、不足・孤立${currentDeckKnowledgeV054.gaps.length}件、推薦${recs.length.toLocaleString()}件。`,100);
    renderResults();
  }catch(error){console.error(error);status('デッキ分析中にエラーが発生しました：'+(error?.message||error),0);}
  finally{$('analyzeBtn').disabled=false;}
}
function renderStats(s,all,res,profile=currentDeckKnowledgeV054){
  $('mCards').textContent=s.total;$('mLands').textContent=s.lands;$('mColors').textContent=colors(s.cols);$('mAvg').textContent=s.avg.toFixed(2);$('mResolved').textContent=Math.round(res/Math.max(1,all)*100)+'%';
  const ds=diagnosis(s),structure=clampV054(100-ds.filter(x=>x[0]==='bad').length*18-ds.filter(x=>x[0]==='warn').length*7),effect=profile?.engineScore??50,combined=Math.round(structure*.58+effect*.42);
  $('mScore').textContent=combined;if($('mConnections'))$('mConnections').textContent=profile?.connections.length||0;if($('mGaps'))$('mGaps').textContent=profile?.gaps.length||0;
  const gapWarnings=(profile?.gaps||[]).slice(0,3).map(x=>['warn',x.label]);$('diagnostics').innerHTML=[...ds,...gapWarnings].map(x=>`<span class="tag ${x[0]}">${esc(x[1])}</span>`).join('');
  const max=Math.max(1,...s.curve);$('curve').innerHTML=s.curve.map((v,i)=>`<div class="manaCol"><div class="manaBar" style="height:${Math.max(2,95*v/max)}px"></div><small>${i===7?'7+':i}<br>${v}</small></div>`).join('');
  const roles=profile?Object.entries(profile.tagCounts).sort((a,b)=>b[1]-a[1]).slice(0,12):Object.entries(s.counts).sort((a,b)=>b[1]-a[1]);
  $('roles').innerHTML=roles.length?roles.map(([r,n])=>`<div class="deckcard"><span class="qty">${n}</span><span>${esc(KNOWLEDGE_TAGS[r]?.label||labels[r]||r)}</span><span class="tiny">枚</span></div>`).join(''):'<span class="notice">役割を検出できませんでした。</span>';
  $('resolvedDeck').innerHTML=deck.map(x=>`<div>${x.qty} ${esc(x.card?displayName(x.card):x.name)} ${x.card?'':'<span class="tag bad">未特定</span>'}</div>`).join('');
  if(profile)renderDeckIntelligenceV054(profile);
}
function cardHTML(x){
  const primary=(x.relations||[]).includes('COVERAGE')?'不足補完':(x.relations||[]).includes('ENGINE')?'エンジン形成':(x.relations||[]).includes('ENABLE')?'成立支援':(x.relations||[]).includes('SYNERGY')?'効果接続':'安定化';
  return `<article class="result"><button class="imageButton" data-detail="${esc(x.card.name)}" aria-label="${esc(x.card.name)}の詳細">${displayImg(x.card)?`<img loading="lazy" src="${displayImg(x.card)}" alt="${esc(displayName(x.card))}">`:''}</button><div><div class="candidatePurpose">${esc(primary)}</div><h3><button class="textButton" data-detail="${esc(x.card.name)}">${esc(displayName(x.card))}</button></h3>${englishSubName(x.card)}<div class="meta">${esc(displayType(x.card))} ・ MV ${x.card.cmc||0} ・ ${colors(x.f.colors)}</div><div class="relationRow">${relationBadgesHTMLV053(x.relations||[])}</div>${x.why.length?`<ul class="explainList">${x.why.map(w=>`<li>${esc(w)}</li>`).join('')}</ul>`:''}${x.cautions?.length?`<div class="tiny caution">注意：${x.cautions.map(esc).join('／')}</div>`:''}<div class="tags">${x.f.roles.slice(0,4).map(r=>`<span class="tag">${labels[r]||r}</span>`).join('')}</div><div class="oracle">${esc(displayOracle(x.card))}</div><div class="inlineActions"><button class="smallBtn primary" data-deckadd="${esc(x.card.name)}">デッキへ追加</button><button class="smallBtn" data-detail="${esc(x.card.name)}">詳細を見る</button></div></div><div><div class="score">${x.score}</div><div class="tiny">デッキ接続点</div></div></article>`;
}


/* ===== Lunch Forge v0.5.4b: Japanese Data Completion Hotfix ===== */
let japaneseOverridesV054a=[];
let japaneseOverridesLoadedV054a=false;
let japaneseAuditV054a=null;
const JAPANESE_COMPLETION_VERSION_V054A='0.5.4b';

function normalizedCardKeyV054a(value){return String(value||'').trim().toLowerCase().replace(/\s+/g,' ')}
function hasOwnV054a(obj,key){return Object.prototype.hasOwnProperty.call(obj||{},key)}
function nonEmptyV054a(value){return value!==undefined&&value!==null&&String(value).trim()!==''}
function japaneseTextLikeV054a(value){return /[ぁ-んァ-ヶ一-龠々ー]/.test(String(value||''))}
function englishFaceV054a(c,index){return cardFaces(c)[index]||cardFaces(c)[0]||c}
function japaneseFaceV054a(c,index){return localizedFace(c,index)||null}
function faceJapaneseNameAvailableV054a(c,index){
  const e=englishFaceV054a(c,index),j=japaneseFaceV054a(c,index),value=j?.printed_name||(index===0?c?.jp?.printed_name:'')||'';
  if(c?.jp?._availability?.faces?.[index]?.name===true||c?.jp?._override_fields?.faces?.[index]?.name===true)return true;
  if(c?.jp?._availability?.faces?.[index]?.name===false)return false;
  return !!value&&(value!==e?.name||japaneseTextLikeV054a(value));
}
function faceJapaneseTextAvailableV054a(c,index){
  const e=englishFaceV054a(c,index),j=japaneseFaceV054a(c,index),value=j?.printed_text||(index===0?c?.jp?.printed_text:'')||'';
  if(!String(e?.oracle_text||'').trim())return true;
  if(c?.jp?._availability?.faces?.[index]?.text===true||c?.jp?._override_fields?.faces?.[index]?.text===true)return true;
  if(c?.jp?._availability?.faces?.[index]?.text===false)return false;
  return !!value&&value!==e?.oracle_text;
}
function faceJapaneseImageAvailableV054a(c,index){
  const e=englishFaceV054a(c,index),j=japaneseFaceV054a(c,index),value=j?.image_uris?.normal||(index===0?c?.jp?.image_uris?.normal:'')||'';
  if(!e?.image_uris?.normal&&!(index===0&&c?.image_uris?.normal))return true;
  if(c?.jp?._availability?.faces?.[index]?.image===true||c?.jp?._override_fields?.faces?.[index]?.image===true)return true;
  if(c?.jp?._availability?.faces?.[index]?.image===false)return false;
  return !!value;
}
function hasJapanese(c){
  const faces=cardFaces(c);
  return faces.some((_,i)=>faceJapaneseNameAvailableV054a(c,i)||faceJapaneseTextAvailableV054a(c,i)||faceJapaneseImageAvailableV054a(c,i));
}

function sanitizeJapaneseFaceV054a(face){
  if(!face)return null;
  return {
    name:face.name||'',
    printed_name:face.printed_name||'',
    printed_type_line:face.printed_type_line||'',
    printed_text:face.printed_text||'',
    image_uris:face.image_uris||null
  };
}
function mergeJapaneseCardsWithAvailabilityV054a(cards){
  const map=new Map(cards.filter(c=>c.oracle_id).map(c=>[c.oracle_id,c]));
  let count=0;
  pool=pool.map(c=>{
    const j=map.get(c.oracle_id);if(!j)return c;count++;
    const rawFaces=Array.isArray(j.card_faces)?j.card_faces:[];
    const localizedFaces=rawFaces.map(sanitizeJapaneseFaceV054a);
    const faceNames=rawFaces.map(f=>f.printed_name).filter(Boolean).join(' // ');
    const faceTypes=rawFaces.map(f=>f.printed_type_line).filter(Boolean).join(' // ');
    const faceTexts=rawFaces.map(f=>f.printed_text).filter(Boolean).join('\n\n');
    const availabilityFaces=(c.card_faces?.length?c.card_faces:[c]).map((face,i)=>({
      name:!!(rawFaces[i]?.printed_name||(i===0&&j.printed_name)),
      text:!String(face?.oracle_text||'').trim()||!!(rawFaces[i]?.printed_text||(i===0&&j.printed_text)),
      image:!(face?.image_uris?.normal||(i===0&&c.image_uris?.normal))||!!(rawFaces[i]?.image_uris?.normal||(i===0&&j.image_uris?.normal))
    }));
    return {...c,jp:{
      printed_name:j.printed_name||faceNames||'',
      printed_type_line:j.printed_type_line||faceTypes||'',
      printed_text:j.printed_text||faceTexts||'',
      image_uris:j.image_uris||null,
      card_faces:localizedFaces.length?localizedFaces:null,
      set_name:j.set_name||'',released_at:j.released_at||'',collector_number:j.collector_number||'',
      _availability:{faces:availabilityFaces}
    }};
  });
  return count;
}

function mergeOverrideFaceV054a(base,override,flags){
  const out={...(base||{})};
  if(nonEmptyV054a(override?.printed_name)){out.printed_name=override.printed_name;flags.name=true}
  if(nonEmptyV054a(override?.printed_type_line))out.printed_type_line=override.printed_type_line;
  if(nonEmptyV054a(override?.printed_text)){out.printed_text=override.printed_text;flags.text=true}
  const imageUrl=override?.image_url||override?.image_uris?.normal;
  if(nonEmptyV054a(imageUrl)){out.image_uris={...(base?.image_uris||{}),...(override?.image_uris||{}),normal:imageUrl};flags.image=true}
  return out;
}
function mergeJapaneseOverrideV054a(base,override,c){
  const out={...(base||{})},fields={name:false,text:false,image:false,faces:[]};
  if(nonEmptyV054a(override.printed_name)){out.printed_name=override.printed_name;fields.name=true}
  if(nonEmptyV054a(override.printed_type_line))out.printed_type_line=override.printed_type_line;
  if(nonEmptyV054a(override.printed_text)){out.printed_text=override.printed_text;fields.text=true}
  const imageUrl=override.image_url||override.image_uris?.normal;
  if(nonEmptyV054a(imageUrl)){out.image_uris={...(base?.image_uris||{}),...(override.image_uris||{}),normal:imageUrl};fields.image=true}
  if(Array.isArray(override.card_faces)){
    const byIndex=new Map(override.card_faces.map((face,i)=>[Number.isInteger(face?.face_index)?face.face_index:i,face||{}]));
    const highest=byIndex.size?Math.max(...byIndex.keys())+1:0;
    const max=Math.max(cardFaces(c).length,base?.card_faces?.length||0,highest);
    out.card_faces=Array.from({length:max},(_,i)=>{
      const flags={name:false,text:false,image:false};
      const merged=mergeOverrideFaceV054a(base?.card_faces?.[i],byIndex.get(i)||{},flags);fields.faces[i]=flags;return merged;
    });
  }
  if(!fields.faces.length)fields.faces=(cardFaces(c)).map((_,i)=>({name:i===0&&fields.name,text:i===0&&fields.text,image:i===0&&fields.image}));
  out._override_fields=fields;
  out._override_note=override.note||'';
  return out;
}
function restoreJapaneseOverrideBaseV054a(){
  pool=pool.map(c=>{
    if(!hasOwnV054a(c,'__jpOverrideBaseV054a'))return c;
    const restored={...c,jp:c.__jpOverrideBaseV054a};return restored;
  });
}
function applyJapaneseOverridesV054a(){
  const byOracle=new Map(),byName=new Map();
  for(const item of japaneseOverridesV054a){
    if(item?.oracle_id)byOracle.set(String(item.oracle_id),item);
    if(item?.name_en)byName.set(normalizedCardKeyV054a(item.name_en),item);
  }
  let applied=0;
  pool=pool.map(c=>{
    const base=hasOwnV054a(c,'__jpOverrideBaseV054a')?c.__jpOverrideBaseV054a:(c.jp||null);
    const override=byOracle.get(String(c.oracle_id||''))||byName.get(normalizedCardKeyV054a(c.name));
    if(!override){if(hasOwnV054a(c,'__jpOverrideBaseV054a'))return {...c,jp:base};return c}
    const merged={...c,jp:mergeJapaneseOverrideV054a(base,override,c)};
    Object.defineProperty(merged,'__jpOverrideBaseV054a',{value:base,enumerable:false,configurable:true});
    applied++;return merged;
  });
  if($('jpOverrideCount'))$('jpOverrideCount').textContent=applied.toLocaleString();
  return applied;
}
async function loadJapaneseOverridesV054a(force=false){
  if(japaneseOverridesLoadedV054a&&!force)return applyJapaneseOverridesV054a();
  try{
    const suffix=force?`?v=${Date.now()}`:`?v=${JAPANESE_COMPLETION_VERSION_V054A}`;
    const response=await fetch(`data/card-overrides.json${suffix}`,{cache:force?'no-store':'default'});
    if(!response.ok)throw Error(`補完JSON ${response.status}`);
    const json=await response.json();
    japaneseOverridesV054a=Array.isArray(json)?json:(Array.isArray(json.cards)?json.cards:[]);
    japaneseOverridesLoadedV054a=true;
    const applied=applyJapaneseOverridesV054a();
    if($('jpAuditStatus'))$('jpAuditStatus').textContent=`補完データ ${japaneseOverridesV054a.length.toLocaleString()}件を読み込み、${applied.toLocaleString()}種類へ適用しました。`;
    return applied;
  }catch(error){
    japaneseOverridesV054a=[];japaneseOverridesLoadedV054a=true;
    if($('jpAuditStatus'))$('jpAuditStatus').textContent=`補完データを読み込めませんでした：${error.message}`;
    return 0;
  }
}
function japaneseAuditEntryV054a(c){
  const faces=cardFaces(c),missingFaces=[];
  faces.forEach((face,index)=>{
    const fields=[];
    if(!faceJapaneseNameAvailableV054a(c,index))fields.push('name');
    if(!faceJapaneseTextAvailableV054a(c,index))fields.push('text');
    if(!faceJapaneseImageAvailableV054a(c,index))fields.push('image');
    if(fields.length)missingFaces.push({index,label:index===0?'表面':index===1?'裏面':`面${index+1}`,name_en:face?.name||c.name,missing:fields});
  });
  const missing=unique(missingFaces.flatMap(x=>x.missing));
  return {
    oracle_id:c.oracle_id||'',name_en:c.name||'',current_name_ja:displayName(c)!==c.name?displayName(c):'',layout:c.layout||'normal',set:c.set||'',collector_number:c.collector_number||'',
    missing,missing_faces:missingFaces,is_double_faced:faces.length>1,partially_missing_faces:faces.length>1&&missingFaces.length>0&&missingFaces.length<faces.length,
    override_applied:hasOwnV054a(c,'__jpOverrideBaseV054a')
  };
}
function buildJapaneseAuditV054a(){
  const cards=pool.map(japaneseAuditEntryV054a),incomplete=cards.filter(x=>x.missing.length);
  const complete=cards.length-incomplete.length;
  return {
    version:'1.0',app_version:JAPANESE_COMPLETION_VERSION_V054A,generated_at:new Date().toISOString(),pool_size:cards.length,
    summary:{complete,missing_any:incomplete.length,missing_name:cards.filter(x=>x.missing.includes('name')).length,missing_text:cards.filter(x=>x.missing.includes('text')).length,missing_image:cards.filter(x=>x.missing.includes('image')).length,partial_double_faced:cards.filter(x=>x.partially_missing_faces).length,overrides_applied:cards.filter(x=>x.override_applied).length},
    cards:incomplete
  };
}
function auditLabelV054a(field){return ({name:'日本語名',text:'ルール文章',image:'日本語画像'})[field]||field}
function filteredJapaneseAuditCardsV054a(){
  if(!japaneseAuditV054a)return [];
  const q=normalizedCardKeyV054a($('jpAuditQuery')?.value||''),filter=$('jpAuditFilter')?.value||'all';
  return japaneseAuditV054a.cards.filter(x=>(!q||normalizedCardKeyV054a(`${x.name_en} ${x.current_name_ja}`).includes(q))&&(filter==='all'||(filter==='faces'?x.partially_missing_faces:x.missing.includes(filter))));
}
function renderJapaneseAuditV054a(){
  if(!japaneseAuditV054a)return;
  const s=japaneseAuditV054a.summary;
  const ids={jpAuditComplete:s.complete,jpAuditMissingName:s.missing_name,jpAuditMissingText:s.missing_text,jpAuditMissingImage:s.missing_image,jpAuditPartialFaces:s.partial_double_faced,jpOverrideCount:s.overrides_applied};
  Object.entries(ids).forEach(([id,value])=>{if($(id))$(id).textContent=Number(value||0).toLocaleString()});
  const cards=filteredJapaneseAuditCardsV054a(),el=$('jpAuditResults');if(!el)return;
  if($('jpAuditStatus'))$('jpAuditStatus').textContent=`${japaneseAuditV054a.pool_size.toLocaleString()}種類を監査。不足あり ${japaneseAuditV054a.summary.missing_any.toLocaleString()}種類、現在の表示 ${cards.length.toLocaleString()}種類。`;
  if(!japaneseAuditV054a.cards.length){el.innerHTML='<div class="jpAuditOk">✓ 日本語名・ルール文章・画像の不足は検出されませんでした。</div>';return}
  if(!cards.length){el.innerHTML='<div class="empty">現在の絞り込み条件に一致する不足カードはありません。</div>';return}
  el.innerHTML=cards.slice(0,120).map(x=>{
    const faceTags=x.missing_faces.length>1||x.is_double_faced?x.missing_faces.map(face=>`<span class="jpAuditTag face">${esc(face.label)}：${face.missing.map(auditLabelV054a).join('・')}</span>`).join(''):'';
    return `<article class="jpAuditRow"><div><h4>${esc(x.current_name_ja||x.name_en)}</h4>${x.current_name_ja?`<div class="jpAuditEnglish">${esc(x.name_en)}</div>`:''}<div class="jpAuditMissing">${x.missing.map(f=>`<span class="jpAuditTag">${esc(auditLabelV054a(f))}不足</span>`).join('')}${faceTags}</div>${x.override_applied?'<div class="jpAuditNote">手動補完を適用済みですが、まだ不足項目があります。</div>':''}</div><div class="jpAuditMeta"><b>${esc(String(x.set||'').toUpperCase())} #${esc(x.collector_number||'—')}</b>${x.is_double_faced?'両面カード':'通常カード'}</div></article>`;
  }).join('')+(cards.length>120?`<div class="notice">先頭120件を表示しています。監査JSONには全${cards.length.toLocaleString()}件を収録します。</div>`:'');
}
async function runJapaneseAuditV054a(){
  if(!pool.length){if($('jpAuditStatus'))$('jpAuditStatus').textContent='カードデータを取得しています…';const ok=await fetchPool(false);if(!ok)return null}
  await loadJapaneseOverridesV054a(false);
  japaneseAuditV054a=buildJapaneseAuditV054a();renderJapaneseAuditV054a();return japaneseAuditV054a;
}
function downloadJsonV054a(data,filename){
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),500);
}
async function downloadJapaneseAuditV054a(){const audit=japaneseAuditV054a||await runJapaneseAuditV054a();if(audit){downloadJsonV054a(audit,'card-data-audit.json');toast('日本語データ監査JSONを保存しました')}}
async function downloadOverrideTemplateV054a(){
  const audit=japaneseAuditV054a||await runJapaneseAuditV054a();if(!audit)return;
  const targets=filteredJapaneseAuditCardsV054a();
  const template={version:'1.0',updated_at:new Date().toISOString().slice(0,10),description:'不足項目だけを入力してください。oracle_idまたはname_enでカードを照合します。',cards:targets.map(x=>({oracle_id:x.oracle_id,name_en:x.name_en,printed_name:'',printed_type_line:'',printed_text:'',image_uris:{normal:''},card_faces:x.is_double_faced?x.missing_faces.map(face=>({face_index:face.index,name_en:face.name_en,printed_name:'',printed_type_line:'',printed_text:'',image_uris:{normal:''}})):[],note:''}))};
  downloadJsonV054a(template,'card-overrides-template.json');toast(`${targets.length}件の補完テンプレートを保存しました`);
}
async function initializeJapaneseCompletionV054a(force=false){
  if(!pool.length)return;
  await loadJapaneseOverridesV054a(force);
  japaneseAuditV054a=buildJapaneseAuditV054a();renderJapaneseAuditV054a();
  populateCardNames();renderDatabase();if(recs.length)renderResults();
}

const finishPoolBaseV054b=finishPool;
finishPool=function(src){
  finishPoolBaseV054b(src);
  setTimeout(()=>initializeJapaneseCompletionV054a(false).catch(error=>{
    console.error('Japanese completion initialization failed',error);
    if($('jpAuditStatus'))$('jpAuditStatus').textContent='日本語補完の初期化に失敗しました：'+(error?.message||error);
  }),0);
};
const finishJapaneseBaseV054b=finishJapanese;
finishJapanese=function(message){
  finishJapaneseBaseV054b(message);
  localStorage.setItem('lfJaCompletionVersion',JAPANESE_COMPLETION_VERSION_V054A);
  setTimeout(()=>initializeJapaneseCompletionV054a(false).catch(error=>{
    console.error('Japanese completion initialization failed',error);
    if($('jpAuditStatus'))$('jpAuditStatus').textContent='日本語補完の初期化に失敗しました：'+(error?.message||error);
  }),0);
};

function setupJapaneseCompletionV054a(){
  if($('jpAuditBtn'))$('jpAuditBtn').onclick=runJapaneseAuditV054a;
  if($('jpOverrideReloadBtn'))$('jpOverrideReloadBtn').onclick=async()=>{japaneseOverridesLoadedV054a=false;restoreJapaneseOverrideBaseV054a();await initializeJapaneseCompletionV054a(true);toast('補完データを再読み込みしました')};
  if($('jpAuditDownloadBtn'))$('jpAuditDownloadBtn').onclick=downloadJapaneseAuditV054a;
  if($('jpOverrideTemplateBtn'))$('jpOverrideTemplateBtn').onclick=downloadOverrideTemplateV054a;
  if($('jpAuditQuery'))$('jpAuditQuery').addEventListener('input',renderJapaneseAuditV054a);
  if($('jpAuditFilter'))$('jpAuditFilter').addEventListener('change',renderJapaneseAuditV054a);
  if(pool.length){
    const migrated=localStorage.getItem('lfJaCompletionVersion')===JAPANESE_COMPLETION_VERSION_V054A;
    if(!migrated&&displayLang==='ja')setTimeout(()=>fetchJapanese(false),80);
    else setTimeout(()=>initializeJapaneseCompletionV054a(false),20);
  }
}
setupJapaneseCompletionV054a();
