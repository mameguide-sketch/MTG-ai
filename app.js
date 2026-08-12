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

/* Large card datasets exceed the practical localStorage quota in many browsers.
   Keep them in IndexedDB and retain localStorage only as a legacy fallback. */
const LF_CACHE_DB_V054C='LunchForgeCacheV1';
const LF_CACHE_STORE_V054C='datasets';
function openLargeCacheV054c(){
  return new Promise((resolve,reject)=>{
    if(!('indexedDB' in window))return reject(Error('IndexedDBを利用できません'));
    const request=indexedDB.open(LF_CACHE_DB_V054C,1);
    request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(LF_CACHE_STORE_V054C))db.createObjectStore(LF_CACHE_STORE_V054C)};
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||Error('IndexedDBを開けません'));
    request.onblocked=()=>reject(Error('IndexedDBが別タブで使用中です'));
  });
}
async function largeCacheGetV054c(key){
  const db=await openLargeCacheV054c();
  try{return await new Promise((resolve,reject)=>{const tx=db.transaction(LF_CACHE_STORE_V054C,'readonly'),req=tx.objectStore(LF_CACHE_STORE_V054C).get(key);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error||Error('キャッシュを読み込めません'))})}
  finally{db.close()}
}
async function largeCacheSetV054c(key,value){
  const db=await openLargeCacheV054c();
  try{return await new Promise((resolve,reject)=>{const tx=db.transaction(LF_CACHE_STORE_V054C,'readwrite');tx.objectStore(LF_CACHE_STORE_V054C).put(value,key);tx.oncomplete=()=>resolve(true);tx.onerror=()=>reject(tx.error||Error('キャッシュを保存できません'));tx.onabort=()=>reject(tx.error||Error('キャッシュ保存が中断されました'))})}
  finally{db.close()}
}
function legacyCacheGetV054c(key){try{return JSON.parse(localStorage.getItem(key)||'null')}catch{try{localStorage.removeItem(key)}catch{}return null}}
async function readDatasetCacheV054c(indexedKey,legacyKey){
  try{const cached=await largeCacheGetV054c(indexedKey);if(cached?.cards?.length)return cached}catch(error){console.warn('IndexedDB cache read failed',error)}
  const legacy=legacyCacheGetV054c(legacyKey);
  if(legacy?.cards?.length){try{await largeCacheSetV054c(indexedKey,legacy)}catch{}return legacy}
  return null;
}
async function writeDatasetCacheV054c(indexedKey,legacyKey,value){
  let indexedSaved=false;
  try{await largeCacheSetV054c(indexedKey,value);indexedSaved=true}catch(error){console.warn('IndexedDB cache write failed',error)}
  try{
    const raw=JSON.stringify(value);
    if(raw.length<=3500000)localStorage.setItem(legacyKey,raw);
    else if(indexedSaved)localStorage.removeItem(legacyKey);
  }catch(error){console.warn('Legacy cache write skipped',error)}
  return indexedSaved;
}

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
    let cached=await readDatasetCacheV054c('standard-ja','mtgStdJaV2');
    if(!pool.length){const ok=await fetchPool(false);if(!ok)return false}
    if(!force&&cached&&Date.now()-cached.time<1000*60*60*24*14&&cached.cards?.length){
      try{
        const n=mergeJapaneseCards(cached.cards);
        if(n>0){finishJapanese(`${n.toLocaleString()}種類の日本語データを保存データから結合`);return true}
        try{localStorage.removeItem('mtgStdJaV2')}catch{}
      }catch(error){console.warn('Japanese cache was ignored',error);try{localStorage.removeItem('mtgStdJaV2')}catch{}}
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
      await writeDatasetCacheV054c('standard-ja','mtgStdJaV2',{time:Date.now(),cards});
      await writeDatasetCacheV054c('standard-pool','mtgStdPoolV5',{time:Date.now(),cards:pool});
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
    let cached=await readDatasetCacheV054c('standard-pool','mtgStdPoolV5');
    const previousPool=Array.isArray(pool)&&pool.length?pool.slice():[];
    const cachedCards=Array.isArray(cached?.cards)&&cached.cards.length?cached.cards:[];
    const fallbackCards=previousPool.length?previousPool:cachedCards;
    if(!force&&cached&&Date.now()-cached.time<1000*60*60*24*3&&cachedCards.length){pool=cachedCards;finishPool('保存データから');return true}
    ['loadBtn','dbLoadBtn'].forEach(id=>{if($(id))$(id).disabled=true});
    if($('dbLoadBtn'))$('dbLoadBtn').textContent='取得中…';
    let url=API+'/cards/search?order=name&unique=cards&q='+encodeURIComponent('f:standard game:paper');
    let n=0,freshPool=[];
    try{
      while(url){
        n++;
        loadStatus(`スタンダードカード取得中：${n}ページ目`,Math.min(94,n*5));
        const j=await fetchJson(url);
        freshPool.push(...j.data.filter(c=>!c.digital&&c.legalities?.standard==='legal'));
        url=j.has_more?j.next_page:null;
        if(url)await sleep(180);
      }
      freshPool=[...new Map(freshPool.map(c=>[c.oracle_id||c.id,c])).values()];
      if(!freshPool.length)throw Error('取得結果が0件でした');
      pool=freshPool;
      await writeDatasetCacheV054c('standard-pool','mtgStdPoolV5',{time:Date.now(),cards:pool});
      finishPool('オンラインから');
      return true;
    }catch(e){
      if(fallbackCards.length){
        pool=fallbackCards;
        finishPool('保存データから復旧');
        const message=`オンライン再取得に失敗したため、保存済みの${pool.length.toLocaleString()}種類を使用しています（${e.message}）`;
        loadStatus(message,100);
        if($('dbResults'))renderDatabase();
        return true;
      }
      pool=[];
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

async function restorePersistentPoolV054c(){
  if(pool.length)return true;
  const cached=await readDatasetCacheV054c('standard-pool','mtgStdPoolV5');
  if(!cached?.cards?.length)return false;
  pool=cached.cards;
  if($('dbStatus'))$('dbStatus').textContent=`保存データ ${pool.length.toLocaleString()}種類（日本語 ${pool.filter(hasJapanese).length.toLocaleString()}種類）を読み込みました。カード検索を開くと一覧を準備します。`;
  if(displayLang==='ja'&&!pool.some(hasJapanese))setTimeout(()=>fetchJapanese(false),300);
  return true;
}
setTimeout(()=>restorePersistentPoolV054c().catch(error=>console.warn('Persistent cache restore failed',error)),0);
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
  const data={version:'0.5.4c',createdAt:new Date().toISOString(),format:'Standard',tagDefinitions:Object.fromEntries(Object.entries(KNOWLEDGE_TAGS).map(([k,v])=>[k,{label:v.label,group:v.group}])),cards:engineProfiles.map(x=>({oracleId:x.card.oracle_id,name:x.card.name,japaneseName:x.card.jp?.printed_name||null,manaValue:x.card.cmc||0,colorIdentity:x.card.color_identity||[],tags:x.profile.tags,groups:x.profile.grouped,strengths:x.profile.strengths,needs:x.profile.needs,confidence:x.confidence}))};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='lunch-forge-knowledge-v0.5.4c.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),500);toast('知識データを書き出しました');
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
  el.innerHTML=`<div class="deckIntelHead"><div><div class="dialogEyebrow">Deck Intelligence v0.5.5</div><h2>デッキの効果構造</h2><p class="notice">カードを「何を供給するか」「何に利用するか」「何が不足しているか」で集計します。</p></div><div class="deckIntelScore"><strong>${profile.engineScore}</strong><span>効果構造点</span></div></div><div class="deckPlan"><span>推定ゲームプラン</span><b>${esc(profile.plan)}</b></div><div class="deckIntelGrid"><section><h3>供給しているもの</h3>${deckTagRowsHTMLV054(profile,profile.supplies,'明確な生成・供給タグがありません。')}</section><section><h3>利用・誘発・勝ち筋</h3>${deckTagRowsHTMLV054(profile,profile.uses,'明確な利用先・誘発条件がありません。')}</section><section><h3>成立している接続</h3>${connectionHTML}</section><section><h3>不足・孤立</h3>${gapHTML}</section></div>${verifiedHTML}`;
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


/* ===== Lunch Forge v0.5.4c: Card Pool Recovery Hotfix ===== */
let japaneseOverridesV054a=[];
let japaneseOverridesLoadedV054a=false;
let japaneseAuditV054a=null;
const JAPANESE_COMPLETION_VERSION_V054A='0.5.4c';

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


/* ===== Lunch Forge v0.5.5: Swap Planner ===== */
let currentSwapRecommendationsV055=[];

function primaryTypeV055(card){
  const value=type(card);
  for(const key of ['Land','Creature','Planeswalker','Battle','Artifact','Enchantment','Instant','Sorcery'])if(value.includes(key))return key;
  return 'Other';
}
function isBasicLandV055(card){return /\bBasic\b/i.test(type(card))&&/\bLand\b/i.test(type(card))}
function normalizeDeckNameV055(value){return String(value||'').trim().toLowerCase().replace(/\s+/g,' ')}
function entryMatchesCardV055(entry,card){
  const source=findPoolCard(entry.name),left=source?.oracle_id||source?.name||normalizeDeckNameV055(entry.name),right=card?.oracle_id||card?.name;
  return left===right||normalizeDeckNameV055(entry.name)===normalizeDeckNameV055(card?.name)||normalizeDeckNameV055(entry.name)===normalizeDeckNameV055(displayName(card));
}
function verifiedCoreNamesV055(profile){
  const names=new Set();
  for(const testCase of completeVerifiedCasesV054(profile))for(const card of testCase.cards||[]){if(card.nameEn)names.add(normalizeCardNameV053(card.nameEn));if(card.nameJa)names.add(normalizeCardNameV053(card.nameJa));}
  return names;
}
function cutCandidateV055(entry,stats,profile){
  if(!entry?.card||entry.side||entry.qty<1)return null;
  const card=entry.card,p=knowledgeProfile(card),cardType=primaryTypeV055(card),isLand=cardType==='Land';
  if(isBasicLandV055(card)&&stats.lands<=26)return null;
  if(isLand&&stats.lands<=24)return null;
  const connectedTags=new Set(profile.connections.flatMap(x=>[x.from,x.to]));
  const coreNames=verifiedCoreNamesV055(profile),variants=cardNameVariantsV053(card);
  const isVerifiedCore=variants.some(x=>coreNames.has(x));
  const reasons=[];let score=0;
  const relevantGaps=profile.gaps.filter(g=>g.tag&&p.tags.includes(g.tag));
  if(!p.tags.length){score+=18;reasons.push('現在の知識タグでは、主要な効果接続を確認できない');}
  if(relevantGaps.length){score+=12+Math.min(8,relevantGaps.length*3);reasons.push('カードの役割がデッキ内で孤立している');}
  const connected=p.tags.filter(t=>connectedTags.has(t));
  if(!connected.length&&p.tags.length){score+=10;reasons.push('成立中の供給→利用接続への参加が少ない');}
  else score-=Math.min(16,connected.length*5);
  const dominant=Object.entries(profile.tagCounts).filter(([,n])=>n>=8).map(([tag])=>tag);
  const redundant=p.tags.filter(t=>dominant.includes(t));
  if(redundant.length){score+=Math.min(12,redundant.length*4);reasons.push(`${KNOWLEDGE_TAGS[redundant[0]]?.label||redundant[0]}の枠が多め`);}
  const band=Math.min(7,Math.floor(+card.cmc||0));
  if(!isLand&&stats.curve[band]>=9){score+=8;reasons.push(`${band===7?'7+':band}マナ域が過密`);}
  if(!isLand&&(+card.cmc||0)>(stats.avg||0)+1.6){score+=5;reasons.push('平均マナ総量より重く、展開速度を圧迫しやすい');}
  for(const utility of profile.utility){
    if(utility.count<=utility.target&&utility.tags.some(t=>p.tags.includes(t))){score-=18;reasons.push(`${utility.label}の少ない枠を担っているため、減らし過ぎに注意`);break;}
  }
  if(p.tags.includes('alternate_win')||p.tags.includes('go_wide')||p.tags.includes('go_tall'))score-=8;
  if(isVerifiedCore){score-=40;reasons.push('検証済みシナジーの構成カード');}
  if(entry.qty>=4)score+=5;
  if(entry.qty===1)score-=5;
  let maxCut=entry.qty>=4?2:1;
  if(isLand)maxCut=Math.max(0,Math.min(maxCut,stats.lands-24));
  if(maxCut<1||score<-5)return null;
  return {entry,card,p,score,maxCut,reasons:unique(reasons).slice(0,4),cardType,isLand,band};
}
function slotCompatibilityV055(rec,cut,stats){
  const candidateType=primaryTypeV055(rec.card),candidateLand=candidateType==='Land';let score=0;
  if(candidateLand!==cut.isLand){
    if(candidateLand&&stats.lands<23)score+=12;
    else if(!candidateLand&&stats.lands>26)score+=12;
    else return -60;
  }else if(candidateType===cut.cardType)score+=9;
  else if(!candidateLand&&candidateType==='Creature'&&cut.cardType==='Creature')score+=7;
  const diff=Math.abs((+rec.card.cmc||0)-(+cut.card.cmc||0));
  if(diff<=1)score+=8;else if(diff<=2)score+=4;else if(diff>=4)score-=8;
  if((rec.relations||[]).includes('COVERAGE'))score+=6;
  if((rec.relations||[]).includes('ENGINE'))score+=5;
  return score;
}
function simulateSwapEntriesV055(entries,cutCard,addCard,qty){
  const out=[];let remaining=qty;
  for(const source of entries){
    const entry={...source};
    if(!entry.side&&entry.card&&entryMatchesCardV055(entry,cutCard)&&remaining>0){
      const take=Math.min(entry.qty,remaining);entry.qty-=take;remaining-=take;
    }
    if(entry.qty>0)out.push(entry);
  }
  const existing=out.find(x=>!x.side&&x.card&&entryMatchesCardV055(x,addCard));
  if(existing)existing.qty+=qty;else out.push({qty,name:addCard.name,side:false,card:addCard});
  return out;
}
function buildSwapRecommendationsV055(stats,profile,recommendations,mainResolved){
  const cuts=mainResolved.map(x=>cutCandidateV055(x,stats,profile)).filter(Boolean).sort((a,b)=>b.score-a.score);
  if(!cuts.length||!recommendations.length)return [];
  const proposals=[];
  for(const rec of recommendations.slice(0,32)){
    let best=null;
    for(const cut of cuts.slice(0,28)){
      const compatibility=slotCompatibilityV055(rec,cut,stats);if(compatibility<=-50)continue;
      const qty=Math.min(cut.maxCut,rec.score>=38?2:1);
      const simulated=simulateSwapEntriesV055(deck,cut.card,rec.card,qty),afterStats=deckStats(simulated),afterProfile=deckKnowledgeProfileV054(simulated.filter(x=>!x.side&&x.card));
      const deltaEngine=afterProfile.engineScore-profile.engineScore;
      const deltaConnections=afterProfile.connections.length-profile.connections.length;
      const deltaGaps=profile.gaps.length-afterProfile.gaps.length;
      const landDelta=afterStats.lands-stats.lands;
      const pairScore=rec.score+cut.score+compatibility+deltaEngine*2.8+deltaConnections*7+deltaGaps*6;
      const item={add:rec,cut,qty,pairScore,afterStats,afterProfile,deltaEngine,deltaConnections,deltaGaps,landDelta};
      if(!best||item.pairScore>best.pairScore)best=item;
    }
    if(best)proposals.push(best);
  }
  proposals.sort((a,b)=>b.pairScore-a.pairScore);
  const result=[],usedAdds=new Set(),cutUse=new Map();
  for(const item of proposals){
    const addKey=item.add.card.oracle_id||item.add.card.name,cutKey=item.cut.card.oracle_id||item.cut.card.name;
    if(usedAdds.has(addKey)||(cutUse.get(cutKey)||0)>=2)continue;
    if(item.deltaEngine<-8&&item.deltaConnections<0&&item.deltaGaps<=0)continue;
    usedAdds.add(addKey);cutUse.set(cutKey,(cutUse.get(cutKey)||0)+1);result.push(item);if(result.length>=6)break;
  }
  return result;
}
function metricClassV055(before,after,direction='up'){
  if(before===after)return 'neutral';
  const improved=direction==='down'?after<before:after>before;return improved?'improved':'declined';
}
function swapConfidenceV055(item){
  const gain=item.deltaEngine+item.deltaConnections*4+item.deltaGaps*3;
  if(item.pairScore>=75&&gain>=5)return '高';if(item.pairScore>=48)return '中';return '参考';
}
function swapMetricHTMLV055(label,before,after,direction='up',digits=0){
  const format=v=>Number(v).toFixed(digits);
  return `<div class="swapMetric ${metricClassV055(before,after,direction)}"><span>${esc(label)}</span><b>${format(before)} <i>→</i> ${format(after)}</b></div>`;
}
function swapCardPanelV055(card,qty,mode){
  const p=knowledgeProfile(card);return `<div class="swapCard ${mode}"><div class="swapCardSign">${mode==='add'?'+':'−'}${qty}</div>${displayImg(card)?`<button class="imageButton" data-detail="${esc(card.name)}"><img loading="lazy" src="${displayImg(card)}" alt="${esc(displayName(card))}"></button>`:''}<div><small>${mode==='add'?'追加候補':'減らす候補'}</small><h3><button class="textButton" data-detail="${esc(card.name)}">${esc(displayName(card))}</button></h3>${englishSubName(card)}<div class="meta">${esc(primaryTypeV055(card))}・MV ${card.cmc||0}</div><div class="tags">${p.tags.slice(0,3).map(t=>`<span class="tag">${esc(KNOWLEDGE_TAGS[t]?.label||t)}</span>`).join('')}</div></div></div>`;
}
function swapCardPanelV055(card,qty,mode){
  const p=knowledgeProfile(card);return `<div class="swapCard ${mode}"><div class="swapCardSign">${mode==='add'?'+':'−'}${qty}</div>${displayImg(card)?`<button class="imageButton" data-detail="${esc(card.name)}"><img loading="lazy" src="${displayImg(card)}" alt="${esc(displayName(card))}"></button>`:''}<div><small>${mode==='add'?'追加候補':'減らす候補'}</small><h3><button class="textButton" data-detail="${esc(card.name)}">${esc(displayName(card))}</button></h3>${englishSubName(card)}<div class="meta">${esc(primaryTypeV055(card))}・MV ${card.cmc||0}・${esc(rarityLabelV056(card.rarity))}</div><div class="tags">${p.tags.slice(0,3).map(t=>`<span class="tag">${esc(KNOWLEDGE_TAGS[t]?.label||t)}</span>`).join('')}</div></div></div>`;
}
function renderSwapRecommendationsV055(){
  const root=$('swapRecommendations'),count=$('swapCount');if(!root)return;
  if(count)count.textContent=`${currentSwapRecommendationsV055.length}件`;
  if(!currentSwapRecommendationsV055.length){root.innerHTML='<div class="empty">安全に提案できる入れ替えを検出できませんでした。追加候補とデッキ内容を確認してください。</div>';return;}
  const beforeStats=deckStats(deck),beforeProfile=currentDeckKnowledgeV054;
  root.innerHTML=currentSwapRecommendationsV055.map((item,index)=>{
    const addReasons=item.add.why.slice(0,3),cutReasons=item.cut.reasons.slice(0,3),confidence=swapConfidenceV055(item);
    const landMetric=item.landDelta?swapMetricHTMLV055('土地',beforeStats.lands,item.afterStats.lands,'up',0):'';
    return `<article class="swapProposal"><div class="swapProposalHead"><div><span class="swapRank">提案 ${index+1}</span><h3>${esc(displayName(item.cut.card))} → ${esc(displayName(item.add.card))}</h3></div><span class="swapConfidence confidence${confidence}">確度 ${confidence}</span></div><div class="swapPair">${swapCardPanelV055(item.add.card,item.qty,'add')}<div class="swapExchange" aria-hidden="true">⇄</div>${swapCardPanelV055(item.cut.card,item.qty,'cut')}</div><div class="swapReasonGrid"><section><h4>追加する理由</h4><ul class="explainList">${addReasons.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></section><section><h4>減らす理由</h4><ul class="explainList">${cutReasons.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></section></div><div class="swapMetrics">${swapMetricHTMLV055('効果構造点',beforeProfile.engineScore,item.afterProfile.engineScore,'up',0)}${swapMetricHTMLV055('不足・孤立',beforeProfile.gaps.length,item.afterProfile.gaps.length,'down',0)}${swapMetricHTMLV055('効果接続',beforeProfile.connections.length,item.afterProfile.connections.length,'up',0)}${swapMetricHTMLV055('平均MV',beforeStats.avg,item.afterStats.avg,'down',2)}${landMetric}</div><div class="swapActions"><button class="btn" data-swapapply="${index}">${item.qty}枚入れ替えて再分析</button><button class="btn secondary" data-deckadd="${esc(item.add.card.name)}">追加だけ行う</button><button class="btn ghost" data-detail="${esc(item.add.card.name)}">追加カードの詳細</button></div></article>`;
  }).join('');
}
function rebuildDeckTextV055(entries){
  const main=entries.filter(x=>!x.side&&x.qty>0),side=entries.filter(x=>x.side&&x.qty>0);
  let text='Deck\n'+main.map(x=>`${x.qty} ${x.name}`).join('\n');
  if(side.length)text+='\n\nSideboard\n'+side.map(x=>`${x.qty} ${x.name}`).join('\n');
  return text;
}
function applySwapProposalV055(index){
  const item=currentSwapRecommendationsV055[index];if(!item)return;
  const parsed=parseDeck($('deckInput').value),entries=parsed.map(x=>({...x}));let remaining=item.qty;
  for(const entry of entries){
    if(entry.side||remaining<=0)continue;
    const card=findPoolCard(entry.name);if(card&&entryMatchesCardV055(entry,item.cut.card)){
      const take=Math.min(entry.qty,remaining);entry.qty-=take;remaining-=take;
    }
  }
  const existing=entries.find(x=>!x.side&&entryMatchesCardV055(x,item.add.card));
  if(existing)existing.qty+=item.qty;else entries.push({qty:item.qty,name:item.add.card.name,side:false});
  $('deckInput').value=rebuildDeckTextV055(entries.filter(x=>x.qty>0));
  toast(`${displayName(item.cut.card)}を${item.qty}枚減らし、${displayName(item.add.card)}を${item.qty}枚追加しました`);
  setTimeout(()=>analyze(),80);
}

async function analyze(){
  if(!pool.length){status('先にカードデータを取得します。',3);await fetchPool();if(!pool.length)return;}
  const parsed=parseDeck($('deckInput').value);if(!parsed.length){status('デッキを入力してください。');return;}
  $('analyzeBtn').disabled=true;deck=[];currentSwapRecommendationsV055=[];renderSwapRecommendationsV055();
  try{
    for(let i=0;i<parsed.length;i++){
      status(`カード特定中 ${i+1}/${parsed.length}`,10+48*i/parsed.length);
      const c=findPoolCard(parsed[i].name)||await named(parsed[i].name);
      deck.push({...parsed[i],card:c||null});await sleep(55);
    }
    const resolved=deck.filter(x=>x.card),mainResolved=resolved.filter(x=>!x.side),stats=deckStats(deck);
    currentDeckKnowledgeV054=deckKnowledgeProfileV054(mainResolved);await loadVerifiedSynergiesV053(false);
    renderStats(stats,parsed.length,resolved.length,currentDeckKnowledgeV054);
    const present=new Set(resolved.map(x=>x.card.name));
    recs=pool.filter(c=>!present.has(c.name)).map(c=>scoreCard(c,stats,$('strategy').value,mainResolved)).filter(x=>x.score>=12&&x.why.length).sort((a,b)=>b.score-a.score||displayName(a.card).localeCompare(displayName(b.card),'ja'));
    currentSwapRecommendationsV055=buildSwapRecommendationsV055(stats,currentDeckKnowledgeV054,recs,mainResolved);
    renderSwapRecommendationsV055();renderResults();
    status(`${resolved.length}/${parsed.length}種類を特定。効果接続${currentDeckKnowledgeV054.connections.length}件、不足・孤立${currentDeckKnowledgeV054.gaps.length}件、入れ替え提案${currentSwapRecommendationsV055.length}件。`,100);
  }catch(error){console.error(error);status('デッキ分析中にエラーが発生しました：'+(error?.message||error),0);}
  finally{$('analyzeBtn').disabled=false;}
}

const swapRootV055=$('swapRecommendations');
if(swapRootV055){
  bindActionContainer(swapRootV055);
  swapRootV055.addEventListener('click',event=>{const button=event.target.closest('[data-swapapply]');if(button)applySwapProposalV055(+button.dataset.swapapply);});
}


/* ===== Lunch Forge v0.5.6: Proposal Controls ===== */
const SWAP_SETTINGS_KEY_V056='lunchForgeSwapSettingsV056';
const SWAP_HISTORY_KEY_V056='lunchForgeSwapHistoryV056';
const SWAP_DEFAULTS_V056={policy:'balanced',maxChanges:2,rarityCap:'all',keepLands:true,ownedOnly:false,ownedCards:'',locked:[]};
let swapSettingsV056=loadSwapSettingsV056();
let swapHistoryV056=loadSwapHistoryV056();
let swapRefreshTimerV056=0;

function loadSwapSettingsV056(){
  try{return {...SWAP_DEFAULTS_V056,...JSON.parse(localStorage.getItem(SWAP_SETTINGS_KEY_V056)||'{}')}}catch{return {...SWAP_DEFAULTS_V056}}
}
function saveSwapSettingsV056(){
  swapSettingsV056.locked=[...new Set(swapSettingsV056.locked||[])];
  localStorage.setItem(SWAP_SETTINGS_KEY_V056,JSON.stringify(swapSettingsV056));
}
function loadSwapHistoryV056(){
  try{const value=JSON.parse(sessionStorage.getItem(SWAP_HISTORY_KEY_V056)||'[]');return Array.isArray(value)?value.slice(0,10):[]}catch{return []}
}
function saveSwapHistoryV056(){sessionStorage.setItem(SWAP_HISTORY_KEY_V056,JSON.stringify(swapHistoryV056.slice(0,10)));updateSwapUndoV056()}
function cardKeyV056(card){return String(card?.oracle_id||card?.name||'').toLowerCase()}
function lockedSetV056(){return new Set(swapSettingsV056.locked||[])}
function isCardLockedV056(card){return lockedSetV056().has(cardKeyV056(card))}
function rarityRankV056(value){return ({common:0,uncommon:1,rare:2,mythic:3,special:3,bonus:3}[String(value||'').toLowerCase()]??3)}
function rarityLabelV056(value){return ({common:'コモン',uncommon:'アンコモン',rare:'レア',mythic:'神話レア',special:'特殊',bonus:'ボーナス'}[String(value||'').toLowerCase()]||'不明')}
function policyLabelV056(){return ({balanced:'総合バランス',aggressive:'攻撃的',stable:'安定性重視',synergy:'シナジー重視'})[swapSettingsV056.policy]||'総合バランス'}
function ownedNamesV056(){
  const out=new Set();
  for(let raw of String(swapSettingsV056.ownedCards||'').split(/\r?\n|,/)){
    let line=raw.trim();if(!line)continue;
    line=line.replace(/^\d+\s+/,'').replace(/\s+\([A-Za-z0-9]+\)\s+\d+[A-Za-z]?\s*$/,'').trim();
    if(!line)continue;
    out.add(normalizeDeckNameV055(line));
    const card=findPoolCard(line);if(card){out.add(normalizeDeckNameV055(card.name));out.add(normalizeDeckNameV055(displayName(card)));out.add(cardKeyV056(card));}
  }
  return out;
}
function isOwnedCardV056(card){
  if(!swapSettingsV056.ownedOnly)return true;
  const owned=ownedNamesV056();if(!owned.size)return false;
  return owned.has(cardKeyV056(card))||owned.has(normalizeDeckNameV055(card?.name))||owned.has(normalizeDeckNameV055(displayName(card)));
}
function rarityAllowedV056(card){
  if(swapSettingsV056.rarityCap==='all')return true;
  return rarityRankV056(card?.rarity)<=rarityRankV056(swapSettingsV056.rarityCap);
}
function recommendationAllowedV056(card){return isOwnedCardV056(card)&&rarityAllowedV056(card)}
function countCardInDeckV056(card){return deck.filter(x=>!x.side&&x.card&&entryMatchesCardV055(x,card)).reduce((sum,x)=>sum+x.qty,0)}
function policyBonusV056(rec,cut,stats,profile){
  const p=knowledgeProfile(rec.card),cmc=+rec.card.cmc||0,relations=rec.relations||[];let score=0,reason='';
  if(swapSettingsV056.policy==='aggressive'){
    score+=Math.max(-5,(4-cmc)*3);
    if(p.tags.some(t=>['go_wide','go_tall','direct_damage','evasion','attack_trigger'].includes(t))){score+=12;reason='早く勝ち切る役割を優先';}
    if(cmc<=2){score+=5;reason=reason||'低マナ域を優先';}
  }else if(swapSettingsV056.policy==='stable'){
    if(p.tags.some(t=>['single_removal','board_wipe','counterspell','draw_cards','impulse','protection','mana_add','extra_land'].includes(t))){score+=12;reason='除去・ドロー・保護などの安定枠を優先';}
    if(relations.includes('COVERAGE')||relations.includes('SUPPORT'))score+=7;
    if(cmc>=6)score-=5;
  }else if(swapSettingsV056.policy==='synergy'){
    if(relations.some(x=>['SYNERGY','ENGINE','ENABLE'].includes(x))){score+=14;reason='供給→利用のシナジー接続を優先';}
    const connected=new Set(profile.connections.flatMap(x=>[x.from,x.to]));
    score+=Math.min(10,p.tags.filter(t=>connected.has(t)).length*3);
  }else{
    if(relations.includes('COVERAGE')){score+=4;reason='不足補完と効果接続のバランスを優先';}
  }
  return {score,reason};
}

const cutCandidateBaseV056=cutCandidateV055;
cutCandidateV055=function(entry,stats,profile){
  if(entry?.card&&isCardLockedV056(entry.card))return null;
  const result=cutCandidateBaseV056(entry,stats,profile);if(!result)return null;
  let maxCut=Math.min(entry.qty,Math.max(1,+swapSettingsV056.maxChanges||2));
  if(!isBasicLandV055(entry.card))maxCut=Math.min(maxCut,4);
  if(result.isLand)maxCut=Math.max(0,Math.min(maxCut,stats.lands-20));
  if(maxCut<1)return null;
  result.maxCut=maxCut;return result;
};
const slotCompatibilityBaseV056=slotCompatibilityV055;
slotCompatibilityV055=function(rec,cut,stats){
  const candidateLand=primaryTypeV055(rec.card)==='Land';
  if(swapSettingsV056.keepLands&&candidateLand!==cut.isLand)return -100;
  return slotCompatibilityBaseV056(rec,cut,stats);
};

function buildSwapRecommendationsV055(stats,profile,recommendations,mainResolved){
  const allowed=recommendations.filter(x=>recommendationAllowedV056(x.card));
  const cuts=mainResolved.map(x=>cutCandidateV055(x,stats,profile)).filter(Boolean).sort((a,b)=>b.score-a.score);
  if(!cuts.length||!allowed.length)return [];
  const proposals=[],maxSetting=Math.max(1,+swapSettingsV056.maxChanges||2);
  for(const rec of allowed.slice(0,56)){
    let best=null;
    for(const cut of cuts.slice(0,36)){
      const compatibility=slotCompatibilityV055(rec,cut,stats);if(compatibility<=-50)continue;
      const existing=countCardInDeckV056(rec.card),legalMax=isBasicLandV055(rec.card)?maxSetting:Math.max(0,4-existing);if(legalMax<1)continue;
      let confidenceQty=rec.score>=52?4:rec.score>=36?2:1;
      if(swapSettingsV056.policy==='aggressive'&&(+rec.card.cmc||0)<=2&&rec.score>=28)confidenceQty=Math.max(confidenceQty,4);
      const qty=Math.min(cut.maxCut,maxSetting,legalMax,confidenceQty);if(qty<1)continue;
      const simulated=simulateSwapEntriesV055(deck,cut.card,rec.card,qty),afterStats=deckStats(simulated),afterProfile=deckKnowledgeProfileV054(simulated.filter(x=>!x.side&&x.card));
      const deltaEngine=afterProfile.engineScore-profile.engineScore,deltaConnections=afterProfile.connections.length-profile.connections.length,deltaGaps=profile.gaps.length-afterProfile.gaps.length,landDelta=afterStats.lands-stats.lands;
      if(swapSettingsV056.keepLands&&landDelta!==0)continue;
      const policy=policyBonusV056(rec,cut,stats,profile);
      const pairScore=rec.score+cut.score+compatibility+deltaEngine*2.8+deltaConnections*7+deltaGaps*6+policy.score;
      const item={add:rec,cut,qty,pairScore,afterStats,afterProfile,deltaEngine,deltaConnections,deltaGaps,landDelta,policyReason:policy.reason};
      if(!best||item.pairScore>best.pairScore)best=item;
    }
    if(best)proposals.push(best);
  }
  proposals.sort((a,b)=>b.pairScore-a.pairScore);
  const result=[],usedAdds=new Set(),cutUse=new Map();
  for(const item of proposals){
    const addKey=cardKeyV056(item.add.card),cutKey=cardKeyV056(item.cut.card);
    if(usedAdds.has(addKey)||(cutUse.get(cutKey)||0)>=2)continue;
    if(item.deltaEngine<-8&&item.deltaConnections<0&&item.deltaGaps<=0)continue;
    usedAdds.add(addKey);cutUse.set(cutKey,(cutUse.get(cutKey)||0)+1);result.push(item);if(result.length>=8)break;
  }
  return result;
}

function renderSwapLockListV056(mainResolved){
  const root=$('swapLockListV056'),counter=$('swapLockCountV056');if(!root)return;
  const map=new Map();for(const entry of mainResolved||[]){const key=cardKeyV056(entry.card);if(!map.has(key))map.set(key,{card:entry.card,qty:0});map.get(key).qty+=entry.qty;}
  const cards=[...map.values()].sort((a,b)=>(primaryTypeV055(a.card)==='Land')-(primaryTypeV055(b.card)==='Land')||displayName(a.card).localeCompare(displayName(b.card),'ja'));
  const valid=new Set(cards.map(x=>cardKeyV056(x.card)));swapSettingsV056.locked=(swapSettingsV056.locked||[]).filter(x=>valid.has(x));saveSwapSettingsV056();
  if(counter)counter.textContent=`${swapSettingsV056.locked.length}種類固定`;
  root.innerHTML=cards.length?cards.map(({card,qty})=>`<label class="swapLockItemV056"><input type="checkbox" data-swaplock="${esc(cardKeyV056(card))}" ${isCardLockedV056(card)?'checked':''}><span>${qty} ${esc(displayName(card))}</span></label>`).join(''):'<span class="tiny">解析済みのメインデッキがありません。</span>';
}
function renderSwapCompareV056(){
  const root=$('swapCompareV056');if(!root)return;
  if(!currentSwapRecommendationsV055.length){root.innerHTML='<div class="empty">現在の条件では比較できる提案がありません。</div>';return;}
  root.innerHTML=currentSwapRecommendationsV055.slice(0,3).map((item,index)=>`<button class="swapCompareCardV056" data-swapfocus="${index}"><small>案 ${index+1}・${item.qty}枚変更</small><strong>${esc(displayName(item.cut.card))} → ${esc(displayName(item.add.card))}</strong><div class="swapCompareMetricsV056"><span>構造 ${item.deltaEngine>=0?'+':''}${item.deltaEngine}</span><span>接続 ${item.deltaConnections>=0?'+':''}${item.deltaConnections}</span><span>不足 ${item.deltaGaps>0?'-'+item.deltaGaps:item.deltaGaps===0?'±0':'+'+Math.abs(item.deltaGaps)}</span></div></button>`).join('');
}
function renderSwapRecommendationsV055(){
  const root=$('swapRecommendations'),count=$('swapCount');if(!root)return;
  if(count)count.textContent=`${currentSwapRecommendationsV055.length}件`;
  if(!currentSwapRecommendationsV055.length){root.innerHTML='<div class="empty">現在の固定・所有・レアリティ条件では、安全に提案できる入れ替えを検出できませんでした。</div>';renderSwapCompareV056();return;}
  const beforeStats=deckStats(deck),beforeProfile=currentDeckKnowledgeV054;
  root.innerHTML=currentSwapRecommendationsV055.map((item,index)=>{
    const addReasons=unique([item.policyReason,...item.add.why]).filter(Boolean).slice(0,3),cutReasons=item.cut.reasons.slice(0,3),confidence=swapConfidenceV055(item),landMetric=item.landDelta?swapMetricHTMLV055('土地',beforeStats.lands,item.afterStats.lands,'up',0):'';
    const ownedBadge=swapSettingsV056.ownedOnly?'<span class="swapOwnedBadgeV056">所有確認済み</span>':'';
    return `<article class="swapProposal" id="swapProposalV056-${index}"><div class="swapProposalHead"><div><div class="swapProposalHeadTagsV056"><span class="swapRank">提案 ${index+1}</span><span class="swapPolicyBadgeV056">${esc(policyLabelV056())}</span>${ownedBadge}</div><h3>${esc(displayName(item.cut.card))} → ${esc(displayName(item.add.card))}</h3></div><span class="swapConfidence confidence${confidence}">確度 ${confidence}</span></div><div class="swapPair">${swapCardPanelV055(item.add.card,item.qty,'add')}<div class="swapExchange" aria-hidden="true">⇄</div>${swapCardPanelV055(item.cut.card,item.qty,'cut')}</div><div class="swapReasonGrid"><section><h4>追加する理由</h4><ul class="explainList">${addReasons.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></section><section><h4>減らす理由</h4><ul class="explainList">${cutReasons.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></section></div><div class="swapMetrics">${swapMetricHTMLV055('効果構造点',beforeProfile.engineScore,item.afterProfile.engineScore,'up',0)}${swapMetricHTMLV055('不足・孤立',beforeProfile.gaps.length,item.afterProfile.gaps.length,'down',0)}${swapMetricHTMLV055('効果接続',beforeProfile.connections.length,item.afterProfile.connections.length,'up',0)}${swapMetricHTMLV055('平均MV',beforeStats.avg,item.afterStats.avg,'down',2)}${landMetric}</div><div class="swapActions"><button class="btn" data-swapapply="${index}">${item.qty}枚入れ替えて再分析</button><button class="btn secondary" data-deckadd="${esc(item.add.card.name)}">追加だけ行う</button><button class="btn ghost" data-detail="${esc(item.add.card.name)}">追加カードの詳細</button><button class="smallBtn" data-lockcut="${esc(cardKeyV056(item.cut.card))}">この削減候補を固定</button></div></article>`;
  }).join('');renderSwapCompareV056();
}
function updateSwapUndoV056(){const button=$('swapUndoV056');if(button){button.disabled=!swapHistoryV056.length;button.textContent=swapHistoryV056.length?`直前の入れ替えを戻す（${swapHistoryV056.length}）`:'直前の入れ替えを戻す';}}
function pushSwapHistoryV056(label){const text=$('deckInput').value;if(!text.trim())return;swapHistoryV056.unshift({text,label,at:new Date().toISOString()});swapHistoryV056=swapHistoryV056.slice(0,10);saveSwapHistoryV056()}
function undoSwapV056(){
  const item=swapHistoryV056.shift();if(!item)return toast('戻せる入れ替えがありません');
  $('deckInput').value=item.text;saveSwapHistoryV056();toast(`入れ替え前へ戻しました${item.label?'：'+item.label:''}`);setTimeout(()=>analyze(),60);
}
function applySwapProposalV055(index){
  const item=currentSwapRecommendationsV055[index];if(!item)return;if(isCardLockedV056(item.cut.card))return toast('固定カードは減らせません');
  pushSwapHistoryV056(`${displayName(item.cut.card)} → ${displayName(item.add.card)}`);
  const parsed=parseDeck($('deckInput').value),entries=parsed.map(x=>({...x}));let remaining=item.qty;
  for(const entry of entries){if(entry.side||remaining<=0)continue;const card=findPoolCard(entry.name);if(card&&entryMatchesCardV055(entry,item.cut.card)){const take=Math.min(entry.qty,remaining);entry.qty-=take;remaining-=take;}}
  const existing=entries.find(x=>!x.side&&entryMatchesCardV055(x,item.add.card));if(existing)existing.qty+=item.qty;else entries.push({qty:item.qty,name:item.add.card.name,side:false});
  $('deckInput').value=rebuildDeckTextV055(entries.filter(x=>x.qty>0));toast(`${displayName(item.cut.card)}を${item.qty}枚減らし、${displayName(item.add.card)}を${item.qty}枚追加しました`);setTimeout(()=>analyze(),80);
}
function readSwapControlsV056(){
  swapSettingsV056.policy=$('swapPolicyV056')?.value||'balanced';swapSettingsV056.maxChanges=+($('swapMaxChangesV056')?.value||2);swapSettingsV056.rarityCap=$('swapRarityCapV056')?.value||'all';swapSettingsV056.keepLands=!!$('swapKeepLandsV056')?.checked;swapSettingsV056.ownedOnly=!!$('swapOwnedOnlyV056')?.checked;swapSettingsV056.ownedCards=$('swapOwnedCardsV056')?.value||'';saveSwapSettingsV056();if($('swapOwnedCardsV056'))$('swapOwnedCardsV056').disabled=!swapSettingsV056.ownedOnly;
}
function syncSwapControlsV056(){
  if($('swapPolicyV056'))$('swapPolicyV056').value=swapSettingsV056.policy;if($('swapMaxChangesV056'))$('swapMaxChangesV056').value=String(swapSettingsV056.maxChanges);if($('swapRarityCapV056'))$('swapRarityCapV056').value=swapSettingsV056.rarityCap;if($('swapKeepLandsV056'))$('swapKeepLandsV056').checked=swapSettingsV056.keepLands;if($('swapOwnedOnlyV056'))$('swapOwnedOnlyV056').checked=swapSettingsV056.ownedOnly;if($('swapOwnedCardsV056')){$('swapOwnedCardsV056').value=swapSettingsV056.ownedCards;$('swapOwnedCardsV056').disabled=!swapSettingsV056.ownedOnly;}updateSwapUndoV056();
}
function refreshSwapPlannerV056(showMessage=false){
  clearTimeout(swapRefreshTimerV056);swapRefreshTimerV056=setTimeout(()=>{
    readSwapControlsV056();
    if(!deck.length||!currentDeckKnowledgeV054){if(showMessage)toast('先にデッキを分析してください');return;}
    const mainResolved=deck.filter(x=>!x.side&&x.card),stats=deckStats(deck);
    currentSwapRecommendationsV055=buildSwapRecommendationsV055(stats,currentDeckKnowledgeV054,recs,mainResolved);renderSwapRecommendationsV055();renderSwapLockListV056(mainResolved);
    const allowed=recs.filter(x=>recommendationAllowedV056(x.card)).length;
    if($('swapControlStatusV056'))$('swapControlStatusV056').textContent=`${policyLabelV056()}・最大${swapSettingsV056.maxChanges}枚・追加候補${allowed.toLocaleString()}件から、${currentSwapRecommendationsV055.length}案を作成しました。`;
    if(showMessage)toast('提案条件を反映しました');
  },80);
}
function resetSwapControlsV056(){swapSettingsV056={...SWAP_DEFAULTS_V056};saveSwapSettingsV056();syncSwapControlsV056();refreshSwapPlannerV056(true)}
function setupSwapControlsV056(){
  syncSwapControlsV056();
  ['swapPolicyV056','swapMaxChangesV056','swapRarityCapV056','swapKeepLandsV056','swapOwnedOnlyV056'].forEach(id=>{const el=$(id);if(el)el.addEventListener('change',()=>refreshSwapPlannerV056(false));});
  if($('swapOwnedCardsV056'))$('swapOwnedCardsV056').addEventListener('input',()=>refreshSwapPlannerV056(false));
  if($('swapUndoV056'))$('swapUndoV056').onclick=undoSwapV056;if($('swapResetV056'))$('swapResetV056').onclick=resetSwapControlsV056;
  if($('swapLockListV056'))$('swapLockListV056').addEventListener('change',event=>{const input=event.target.closest('[data-swaplock]');if(!input)return;const set=lockedSetV056();if(input.checked)set.add(input.dataset.swaplock);else set.delete(input.dataset.swaplock);swapSettingsV056.locked=[...set];saveSwapSettingsV056();refreshSwapPlannerV056(false);});
  if($('swapRecommendations'))$('swapRecommendations').addEventListener('click',event=>{const lock=event.target.closest('[data-lockcut]');if(!lock)return;const set=lockedSetV056();set.add(lock.dataset.lockcut);swapSettingsV056.locked=[...set];saveSwapSettingsV056();refreshSwapPlannerV056(true);});
  if($('swapCompareV056'))$('swapCompareV056').addEventListener('click',event=>{const button=event.target.closest('[data-swapfocus]');if(!button)return;document.querySelectorAll('.swapProposal.focusV056').forEach(x=>x.classList.remove('focusV056'));const card=$(`swapProposalV056-${button.dataset.swapfocus}`);if(card){card.classList.add('focusV056');card.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(()=>card.classList.remove('focusV056'),1800);}});
}
setupSwapControlsV056();

async function analyze(){
  if(!pool.length){status('先にカードデータを取得します。',3);await fetchPool();if(!pool.length)return;}
  const parsed=parseDeck($('deckInput').value);if(!parsed.length){status('デッキを入力してください。');return;}
  $('analyzeBtn').disabled=true;deck=[];currentSwapRecommendationsV055=[];renderSwapRecommendationsV055();
  try{
    for(let i=0;i<parsed.length;i++){status(`カード特定中 ${i+1}/${parsed.length}`,10+48*i/parsed.length);const c=findPoolCard(parsed[i].name)||await named(parsed[i].name);deck.push({...parsed[i],card:c||null});await sleep(55);}
    const resolved=deck.filter(x=>x.card),mainResolved=resolved.filter(x=>!x.side),stats=deckStats(deck);currentDeckKnowledgeV054=deckKnowledgeProfileV054(mainResolved);await loadVerifiedSynergiesV053(false);renderStats(stats,parsed.length,resolved.length,currentDeckKnowledgeV054);
    const present=new Set(resolved.map(x=>x.card.name));recs=pool.filter(c=>!present.has(c.name)).map(c=>scoreCard(c,stats,$('strategy').value,mainResolved)).filter(x=>x.score>=12&&x.why.length).sort((a,b)=>b.score-a.score||displayName(a.card).localeCompare(displayName(b.card),'ja'));
    renderSwapLockListV056(mainResolved);currentSwapRecommendationsV055=buildSwapRecommendationsV055(stats,currentDeckKnowledgeV054,recs,mainResolved);renderSwapRecommendationsV055();renderResults();
    const allowed=recs.filter(x=>recommendationAllowedV056(x.card)).length;if($('swapControlStatusV056'))$('swapControlStatusV056').textContent=`${policyLabelV056()}・最大${swapSettingsV056.maxChanges}枚・追加候補${allowed.toLocaleString()}件から、${currentSwapRecommendationsV055.length}案を作成しました。`;
    status(`${resolved.length}/${parsed.length}種類を特定。効果接続${currentDeckKnowledgeV054.connections.length}件、不足・孤立${currentDeckKnowledgeV054.gaps.length}件、条件適用後の入れ替え提案${currentSwapRecommendationsV055.length}件。`,100);
  }catch(error){console.error(error);status('デッキ分析中にエラーが発生しました：'+(error?.message||error),0);}finally{$('analyzeBtn').disabled=false;}
}


// ===== Rule Kernel alpha v0.6.0 =====
const RULE_EVENT_LABELS_V060={
  DISCARD_CARD:'カードを捨てる',MILL_CARD:'切削する',SACRIFICE_PERMANENT:'パーマネントを生け贄に捧げる',CREATURE_DIED:'クリーチャーが死亡する',PERMANENT_TO_GRAVEYARD:'パーマネント・カードが墓地へ置かれる',ENTER_BATTLEFIELD:'戦場に出る',LAND_ENTERED_BATTLEFIELD:'土地が戦場に出る',RETURN_FROM_GRAVEYARD:'墓地から戻す',EXILE_PERMANENT:'追放する',DRAW_CARD:'カードを引く',ATTACH_EQUIPMENT:'装備する',ADD_COUNTER:'カウンターを置く',REMOVE_COUNTER:'カウンターを取り除く',BEGIN_COMBAT:'戦闘開始',ATTACK:'攻撃する',DAMAGE_DEALT:'ダメージを与える',SEARCH_LIBRARY:'ライブラリーを探す',UNTAP_PERMANENT:'アンタップする',TYPE_CHANGE:'カード・タイプを変更する'
};
const RULE_STATE_LABELS_V060={CARD_IN_GRAVEYARD:'カードが墓地にある',POWER_GTE_4:'パワー4以上のクリーチャーをコントロール',IS_EQUIPPED:'装備されている',IS_LAND_CREATURE:'土地・クリーチャーである',LAND_ETB_COUNT:'土地の戦場入り回数が増える',HAS_COUNTER:'カウンターが置かれている',HAS_HASTE:'速攻を持つ',CARD_ON_BATTLEFIELD:'カードが戦場にある'};
function ruleTextV060(card){return [card.oracle_text||'',...(card.card_faces||[]).map(f=>f.oracle_text||'')].filter(Boolean).join('\n');}
function rulePushV060(arr,id,evidence,kind='event',confidence='Parsed'){if(!arr.some(x=>x.id===id&&x.evidence===evidence))arr.push({id,evidence,kind,confidence});}
function parseRuleCardV060(card){
  const text=ruleTextV060(card),low=text.toLowerCase(),events=[],states=[],conditions=[],costs=[],unsupported=[];
  const hit=(re)=>re.test(low);
  if(hit(/discard (a|one|your) card|discard cards?/))rulePushV060(events,'DISCARD_CARD','discard');
  if(hit(/mill\s+\d+|mills?\s+\d+/))rulePushV060(events,'MILL_CARD','mill');
  if(hit(/sacrifice (a|an|another|this|target|one or more)/))rulePushV060(events,'SACRIFICE_PERMANENT','sacrifice');
  if(hit(/dies|died/))rulePushV060(events,'CREATURE_DIED','dies');
  if(hit(/permanent card.*put into your graveyard|permanent cards?.*your graveyard/))rulePushV060(events,'PERMANENT_TO_GRAVEYARD','permanent card to graveyard');
  if(hit(/enters the battlefield|enter the battlefield/))rulePushV060(events,'ENTER_BATTLEFIELD','enters the battlefield');
  if(hit(/land enters the battlefield|lands? entered the battlefield/))rulePushV060(events,'LAND_ENTERED_BATTLEFIELD','land enters');
  if(hit(/return .* from your graveyard|return .* card from .*graveyard|from your graveyard to the battlefield/))rulePushV060(events,'RETURN_FROM_GRAVEYARD','return from graveyard');
  if(hit(/exile target|exile it|exile that/))rulePushV060(events,'EXILE_PERMANENT','exile');
  if(hit(/draw a card|draw \d+ cards?/))rulePushV060(events,'DRAW_CARD','draw');
  if(hit(/equip|attach .* equipment/))rulePushV060(events,'ATTACH_EQUIPMENT','equip');
  if(hit(/put .* counter|put a \+1\/\+1 counter|put .* counters/))rulePushV060(events,'ADD_COUNTER','put counter');
  if(hit(/remove .* counter|remove a -1\/-1 counter/))rulePushV060(events,'REMOVE_COUNTER','remove counter');
  if(hit(/beginning of combat/))rulePushV060(events,'BEGIN_COMBAT','beginning of combat');
  if(hit(/whenever .* attacks|attacks? this turn/))rulePushV060(events,'ATTACK','attack');
  if(hit(/deals? .* damage/))rulePushV060(events,'DAMAGE_DEALT','damage');
  if(hit(/search your library/))rulePushV060(events,'SEARCH_LIBRARY','search library');
  if(hit(/untap (it|that|target)/))rulePushV060(events,'UNTAP_PERMANENT','untap');
  if(hit(/becomes? a .* creature|is a .* creature in addition/))rulePushV060(events,'TYPE_CHANGE','becomes creature');
  if(hit(/from your graveyard/))rulePushV060(states,'CARD_IN_GRAVEYARD','from your graveyard','state');
  if(hit(/power 4 or greater|power of 4 or greater/)){rulePushV060(states,'POWER_GTE_4','power 4 or greater','state');rulePushV060(conditions,'POWER_GTE_4','requires power 4+','condition');}
  if(hit(/equipped creature|becomes equipped/))rulePushV060(states,'IS_EQUIPPED','equipped','state');
  if(hit(/land creature/))rulePushV060(states,'IS_LAND_CREATURE','land creature','state');
  if(hit(/land enters the battlefield/))rulePushV060(states,'LAND_ETB_COUNT','landfall window','state');
  if(hit(/counter on it|counter on ~|with .* counter/))rulePushV060(states,'HAS_COUNTER','has counter','state');
  if(hit(/haste/))rulePushV060(states,'HAS_HASTE','haste','state');
  if(hit(/at the beginning of combat on your turn/))rulePushV060(conditions,'YOUR_BEGIN_COMBAT','自分のターンの戦闘開始時','condition');
  if(hit(/if you control a creature with power 4 or greater/))rulePushV060(conditions,'CONTROL_POWER_GTE_4','パワー4以上をコントロール','condition');
  if(hit(/activate only as a sorcery/))rulePushV060(conditions,'SORCERY_TIMING','ソーサリー・タイミング限定','condition');
  if(hit(/discard a card[:;,]|discard a card\./))rulePushV060(costs,'DISCARD_CARD','カードを捨てる','cost');
  if(hit(/sacrifice ~|sacrifice this permanent/))rulePushV060(costs,'SACRIFICE_SELF','自身を生け贄','cost');
  if(hit(/\{t\}|tap this permanent/))rulePushV060(costs,'TAP_SELF','自身をタップ','cost');
  if(hit(/counter target spell|copy target|replacement effect|instead/))unsupported.push('打ち消し・コピー・置換効果は現段階では完全追跡しません。');
  return {card,text,events,states,conditions,costs,unsupported,confidence:events.length||states.length?'Parsed':'Unsupported'};
}
function ruleLabelV060(x){if(x.kind==='state')return RULE_STATE_LABELS_V060[x.id]||x.id;if(x.kind==='condition'){const m={YOUR_BEGIN_COMBAT:'自分のターンの戦闘開始時',CONTROL_POWER_GTE_4:'パワー4以上をコントロール',SORCERY_TIMING:'ソーサリー・タイミング限定',POWER_GTE_4:'パワー4以上'};return m[x.id]||x.id;}if(x.kind==='cost'){const m={DISCARD_CARD:'カードを捨てる',SACRIFICE_SELF:'自身を生け贄に捧げる',TAP_SELF:'自身をタップする'};return m[x.id]||x.id;}return RULE_EVENT_LABELS_V060[x.id]||x.id;}
function ruleChipV060(x){return `<span class="ruleNode ${x.kind}" title="根拠: ${esc(x.evidence)}">${esc(ruleLabelV060(x))}</span>`;}
function knownRuleCaseV060(cards){
  const names=cards.flatMap(c=>cardNameVariantsV053(c).map(normalizeCardNameV053));
  const has=(s)=>names.some(n=>n.includes(normalizeCardNameV053(s)));
  if(has('Moonshadow')&&has('Bloodthorn Flail')&&has('Flamewake Phoenix'))return {title:'月影＋血茨のフレイル＋炎跡のフェニックス',confidence:'Verified',steps:['炎跡のフェニックスをフレイルの装備コストで捨てる','パーマネント・カードが墓地へ置かれ、月影の能力が誘発','－1/－1カウンターを1個取り除き、月影が実効2/2になる','フレイルが装備され、月影が実効4/3になる','自分の戦闘開始時にパワー4以上の条件を満たす','{R}を支払い、フェニックスを墓地から戦場へ戻す'],risks:['装備能力や月影の誘発を妨害される','戦闘開始前に月影を除去または弱体化される','墓地対策でフェニックスを移動される']};
  if(has('Badgermole Cub')&&has('Fabled Passage'))return {title:'アナグマモグラの仔＋寓話の小道',confidence:'Verified',steps:['土の技1で寓話の小道を1/1の土地・クリーチャーにする','寓話の小道をタップし、生け贄にして能力を起動','土地・クリーチャーが死亡し、土の技の遅延誘発が発生','遅延誘発が先に解決し、寓話の小道がタップ状態で戻る','既にスタックにある寓話の小道の能力が解決し、基本土地を出す','土地の戦場入りが合計2回発生する'],risks:['墓地対策で寓話の小道を移動される','遅延誘発型能力を打ち消される','戻った寓話の小道はタップ状態']};
  return null;
}
function inferredRuleLinksV060(profiles){
  const links=[];const add=(from,to,label,reason)=>{if(!links.some(x=>x.from===from&&x.to===to&&x.label===label))links.push({from,to,label,reason,confidence:'Inferred'});};
  profiles.forEach((a,i)=>profiles.forEach((b,j)=>{if(i===j)return;
    const ae=new Set(a.events.map(x=>x.id)),be=new Set(b.events.map(x=>x.id)),bs=new Set(b.states.map(x=>x.id)),bc=new Set(b.conditions.map(x=>x.id));
    if(ae.has('DISCARD_CARD')&&bs.has('CARD_IN_GRAVEYARD'))add(i,j,'墓地へ準備','捨てる処理が墓地利用カードを墓地へ置けます。');
    if((ae.has('MILL_CARD')||ae.has('PERMANENT_TO_GRAVEYARD'))&&bs.has('CARD_IN_GRAVEYARD'))add(i,j,'墓地利用を準備','墓地へカードを置く処理が利用条件を作ります。');
    if(ae.has('ADD_COUNTER')&&bc.has('POWER_GTE_4'))add(i,j,'パワー条件を支援','カウンターによる強化がパワー条件を満たす可能性があります。');
    if(ae.has('ATTACH_EQUIPMENT')&&bc.has('CONTROL_POWER_GTE_4'))add(i,j,'パワー条件を支援','装備修整の具体値を確認する必要があります。');
    if(ae.has('LAND_ENTERED_BATTLEFIELD')&&bs.has('LAND_ETB_COUNT'))add(i,j,'上陸を誘発','土地の戦場入りを利用します。');
    if(ae.has('SACRIFICE_PERMANENT')&&be.has('CREATURE_DIED'))add(i,j,'死亡誘発を供給','生け贄対象がクリーチャーなら死亡イベントになります。');
    if(ae.has('TYPE_CHANGE')&&ae.has('SACRIFICE_PERMANENT')&&be.has('CREATURE_DIED'))add(i,j,'タイプ変更から死亡','土地などをクリーチャー化して死亡イベントへ接続できます。');
  }));return links.slice(0,12);
}
function ruleProfileHTMLV060(p,index){
  const sections=[['conditions','条件'],['costs','コスト'],['events','イベント'],['states','状態']];
  return `<article class="ruleCardProfile"><div class="ruleCardHead">${displayImg(p.card)?`<img src="${displayImg(p.card)}" alt="${esc(displayName(p.card))}">`:''}<div><span class="ruleIndex">${index+1}</span><h3>${esc(displayName(p.card))}</h3>${englishSubName(p.card)}<div class="meta">${esc(displayType(p.card))} ・ ${p.confidence}</div></div></div>${sections.map(([key,label])=>`<section><h4>${label}</h4><div class="ruleNodeList">${p[key].length?p[key].map(ruleChipV060).join(''):'<span class="tiny">検出なし</span>'}</div></section>`).join('')}${p.unsupported.length?`<div class="ruleWarning">${p.unsupported.map(esc).join('<br>')}</div>`:''}<details><summary>解析対象のOracle文章</summary><pre class="ruleOracle">${esc(p.text||'文章なし')}</pre></details></article>`;
}
function ruleSequenceHTMLV060(testCase){return `<section class="ruleVerified"><div class="knowledgeHeader"><div><div class="dialogEyebrow">${testCase.confidence}</div><h2>${esc(testCase.title)}</h2></div><span class="ruleConfidence verified">検証済み</span></div><ol class="ruleSteps">${testCase.steps.map(x=>`<li>${esc(x)}</li>`).join('')}</ol><details><summary>成立条件と妨害点</summary><ul class="explainList">${testCase.risks.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></details></section>`;}
async function analyzeRulesV060(){
  const statusEl=$('ruleStatus'),result=$('ruleResult');if(!statusEl||!result)return;
  if(!pool.length){statusEl.textContent='カードデータを取得しています。';await prepareDatabase(false);if(!pool.length){statusEl.textContent='カードデータを取得できませんでした。';return;}}
  const raw=['ruleCard1','ruleCard2','ruleCard3'].map(id=>$(id)?.value.trim()).filter(Boolean);if(!raw.length){statusEl.textContent='カードを1枚以上入力してください。';return;}
  const cards=[];for(const name of raw){const c=findPoolCard(name)||await named(name);if(c&&!cards.some(x=>x.oracle_id===c.oracle_id))cards.push(c);}
  if(!cards.length){statusEl.textContent='カードを特定できませんでした。';return;}
  const profiles=cards.map(parseRuleCardV060),verified=knownRuleCaseV060(cards),links=inferredRuleLinksV060(profiles);
  const linksHTML=links.length?links.map(x=>`<article class="ruleLink"><div><b>${esc(displayName(cards[x.from]))}</b><span>→</span><b>${esc(displayName(cards[x.to]))}</b></div><strong>${esc(x.label)}</strong><p>${esc(x.reason)}</p><span class="ruleConfidence inferred">${x.confidence}</span></article>`).join(''):'<div class="empty">現在の辞書では明確な接続を検出できませんでした。相互作用がないとは限りません。</div>';
  result.innerHTML=`${verified?ruleSequenceHTMLV060(verified):''}<section><div class="knowledgeHeader"><div><h2>カード文章の構造化</h2><p class="notice">Oracle文章から直接読み取れる要素です。</p></div><span class="knowledgeCount">${cards.length}枚</span></div><div class="ruleProfiles">${profiles.map(ruleProfileHTMLV060).join('')}</div></section><section class="section"><div class="knowledgeHeader"><div><h2>効果の接続候補</h2><p class="notice">イベントの出力と、別カードが要求する状態・条件を接続します。</p></div><span class="knowledgeCount">${links.length}件</span></div><div class="ruleLinks">${linksHTML}</div></section><div class="ruleDisclaimer"><b>現在の限界：</b>対象選択、スタック上の全順序、置換効果、種類別適用順、状況起因処理、最後の情報はまだ完全には計算しません。Verified以外は候補として扱ってください。</div>`;
  statusEl.textContent=`${cards.length}枚を解析しました。直接抽出${profiles.reduce((n,p)=>n+p.events.length+p.states.length+p.conditions.length+p.costs.length,0)}項目、接続候補${links.length}件${verified?'、検証済み事例1件':''}。`;
}
function setupRuleKernelV060(){
  if($('ruleAnalyzeBtn'))$('ruleAnalyzeBtn').onclick=analyzeRulesV060;
  if($('ruleClearBtn'))$('ruleClearBtn').onclick=()=>{['ruleCard1','ruleCard2','ruleCard3'].forEach(id=>{if($(id))$(id).value='';});$('ruleResult').innerHTML='<div class="empty">左でカードを選ぶと、ルール構造と接続候補を表示します。</div>';$('ruleStatus').textContent='カードを1～3枚入力してください。';};
  ['ruleCard1','ruleCard2','ruleCard3'].forEach(id=>{if($(id))$(id).addEventListener('keydown',e=>{if(e.key==='Enter')analyzeRulesV060();});});
  const tab=document.querySelector('[data-view="rules"]');if(tab)tab.addEventListener('click',()=>{if(!pool.length)prepareDatabase(false);populateCardNames();});
}
setupRuleKernelV060();


/* Rule Engine beta-1 / Event Graph Engine v0.6.2 */
const EVENT_DICTIONARY_V061={
  CAST_SPELL:{ja:'呪文を唱える',group:'spell'},SPELL_RESOLVED:{ja:'呪文が解決する',group:'spell'},COUNTER_SPELL:{ja:'呪文を打ち消す',group:'spell'},COPY_SPELL:{ja:'呪文をコピーする',group:'spell'},
  ACTIVATE_ABILITY:{ja:'能力を起動する',group:'ability'},TRIGGER_ABILITY:{ja:'能力が誘発する',group:'ability'},ABILITY_RESOLVED:{ja:'能力が解決する',group:'ability'},DELAYED_TRIGGER:{ja:'遅延誘発を作る',group:'ability'},
  ENTER_BATTLEFIELD:{ja:'戦場に出る',group:'zone'},LEAVE_BATTLEFIELD:{ja:'戦場を離れる',group:'zone'},CREATURE_DIED:{ja:'クリーチャーが死亡する',group:'zone'},PERMANENT_TO_GRAVEYARD:{ja:'パーマネント・カードが墓地へ置かれる',group:'zone'},RETURN_FROM_GRAVEYARD:{ja:'墓地から戻る',group:'zone'},RETURN_TO_HAND:{ja:'手札に戻る',group:'zone'},EXILE_PERMANENT:{ja:'追放する',group:'zone'},
  DRAW_CARD:{ja:'カードを引く',group:'card'},DISCARD_CARD:{ja:'カードを捨てる',group:'card'},MILL_CARD:{ja:'切削する',group:'card'},SURVEIL:{ja:'諜報する',group:'card'},SEARCH_LIBRARY:{ja:'ライブラリーを探す',group:'card'},SHUFFLE_LIBRARY:{ja:'ライブラリーを切り直す',group:'card'},REVEAL_CARD:{ja:'カードを公開する',group:'card'},
  SACRIFICE_PERMANENT:{ja:'パーマネントを生け贄に捧げる',group:'permanent'},DESTROY_PERMANENT:{ja:'パーマネントを破壊する',group:'permanent'},TAP_PERMANENT:{ja:'パーマネントをタップする',group:'permanent'},UNTAP_PERMANENT:{ja:'パーマネントをアンタップする',group:'permanent'},ATTACH_EQUIPMENT:{ja:'装備品をつける',group:'permanent'},TYPE_CHANGE:{ja:'カード・タイプを変更する',group:'permanent'},
  ADD_COUNTER:{ja:'カウンターを置く',group:'state'},REMOVE_COUNTER:{ja:'カウンターを取り除く',group:'state'},POWER_BUFF:{ja:'パワーを上げる',group:'state'},TOUGHNESS_BUFF:{ja:'タフネスを上げる',group:'state'},POWER_GTE_4:{ja:'パワー4以上になる',group:'state'},GAIN_ABILITY:{ja:'能力を得る',group:'state'},LOSE_ABILITY:{ja:'能力を失う',group:'state'},
  LAND_ENTERED_BATTLEFIELD:{ja:'土地が戦場に出る',group:'land'},PLAY_LAND:{ja:'土地をプレイする',group:'land'},LAND_SACRIFICED:{ja:'土地を生け贄に捧げる',group:'land'},CREATE_MANA:{ja:'マナを加える',group:'land'},LANDFALL:{ja:'上陸条件を満たす',group:'land'},
  CREATE_TOKEN:{ja:'トークンを生成する',group:'token'},TOKEN_DIED:{ja:'トークンが死亡する',group:'token'},
  BEGIN_COMBAT:{ja:'戦闘開始',group:'combat'},ATTACK:{ja:'攻撃する',group:'combat'},BLOCK:{ja:'ブロックする',group:'combat'},DAMAGE_DEALT:{ja:'ダメージを与える',group:'combat'},COMBAT_DAMAGE:{ja:'戦闘ダメージを与える',group:'combat'},FIGHT:{ja:'格闘する',group:'combat'},
  LIFE_GAIN:{ja:'ライフを得る',group:'life'},LIFE_LOSS:{ja:'ライフを失う',group:'life'},PAY_LIFE:{ja:'ライフを支払う',group:'life'},
  TRANSFORM:{ja:'変身する',group:'special'},EXPLORE:{ja:'探検する',group:'special'},DISCOVER:{ja:'発見を行う',group:'special'},PROLIFERATE:{ja:'増殖を行う',group:'special'},
  TARGET_SELECTED:{ja:'対象を選ぶ',group:'rules'},REPLACEMENT_APPLIED:{ja:'置換効果を適用する',group:'rules'},STATE_BASED_ACTION:{ja:'状況起因処理を行う',group:'rules'},STACK_OBJECT_CREATED:{ja:'スタックに置く',group:'rules'}
};
const EVENT_BRIDGES_V061=[
 {from:'DISCARD_CARD',to:'PERMANENT_TO_GRAVEYARD',w:5,label:'捨てたパーマネント・カードが墓地へ置かれる'},
 {from:'MILL_CARD',to:'PERMANENT_TO_GRAVEYARD',w:4,label:'切削したパーマネント・カードが墓地へ置かれる'},
 {from:'SACRIFICE_PERMANENT',to:'CREATURE_DIED',w:5,label:'クリーチャーを生け贄にすると死亡する'},
 {from:'SACRIFICE_PERMANENT',to:'PERMANENT_TO_GRAVEYARD',w:5,label:'生け贄にしたパーマネントが墓地へ置かれる'},
 {from:'CREATURE_DIED',to:'PERMANENT_TO_GRAVEYARD',w:5,label:'死亡は戦場から墓地への移動'},
 {from:'REMOVE_COUNTER',to:'POWER_BUFF',w:4,label:'－1/－1カウンター除去などで実効パワーが上がる'},
 {from:'POWER_BUFF',to:'POWER_GTE_4',w:5,label:'修整によりパワー4条件へ到達できる'},
 {from:'ATTACH_EQUIPMENT',to:'POWER_BUFF',w:4,label:'装備品の継続的修整を適用する'},
 {from:'RETURN_FROM_GRAVEYARD',to:'ENTER_BATTLEFIELD',w:5,label:'墓地から戦場へ戻ることで戦場入りする'},
 {from:'ENTER_BATTLEFIELD',to:'TRIGGER_ABILITY',w:4,label:'戦場に出たとき能力が誘発する'},
 {from:'LAND_ENTERED_BATTLEFIELD',to:'LANDFALL',w:5,label:'土地の戦場入りで上陸が誘発する'},
 {from:'LAND_SACRIFICED',to:'SACRIFICE_PERMANENT',w:5,label:'土地の生け贄はパーマネントの生け贄でもある'},
 {from:'TYPE_CHANGE',to:'CREATURE_DIED',w:3,label:'クリーチャー化した土地は死亡イベントを起こせる'},
 {from:'BEGIN_COMBAT',to:'TRIGGER_ABILITY',w:4,label:'戦闘開始時能力が誘発する'},
 {from:'DAMAGE_DEALT',to:'LIFE_LOSS',w:3,label:'プレイヤーへのダメージはライフ減少を生む'}
];
function eventLabelV061(id){return EVENT_DICTIONARY_V061[id]?.ja||RULE_EVENT_LABELS_V060[id]||RULE_STATE_LABELS_V060[id]||id;}
function addEventV061(set,id,source){if(EVENT_DICTIONARY_V061[id]&&!set.has(id))set.set(id,{id,source});}
function eventIOV061(card,base){
 const text=ruleTextV060(card),low=text.toLowerCase(),input=new Map(),output=new Map();
 base.events.forEach(x=>addEventV061(output,x.id,x.evidence));
 const match=(r)=>r.test(low);
 // Outputs that v0.6.0 did not yet expose.
 [[/create(s)? .* token|create a .* token/,'CREATE_TOKEN'],[/gain(s)? .* life/,'LIFE_GAIN'],[/lose(s)? .* life/,'LIFE_LOSS'],[/return .* to (its|their|your) owner'?s hand/,'RETURN_TO_HAND'],[/destroy target|destroy all/,'DESTROY_PERMANENT'],[/surveil/,'SURVEIL'],[/explore/,'EXPLORE'],[/transform/,'TRANSFORM'],[/add \{[wubrgc]/,'CREATE_MANA'],[/cast .* spell|whenever you cast/,'CAST_SPELL'],[/counter target spell/,'COUNTER_SPELL'],[/proliferate/,'PROLIFERATE'],[/becomes? .* creature/,'TYPE_CHANGE'],[/gets? \+[0-9x*]+\/\+[0-9x*]+|equipped creature gets/,'POWER_BUFF']].forEach(([r,id])=>{if(match(r))addEventV061(output,id,r.source)});
 // Events/states consumed as triggers or conditions.
 [[/whenever .* enters|when .* enters/,'ENTER_BATTLEFIELD'],[/whenever .* dies|when .* dies/,'CREATURE_DIED'],[/whenever .* discard|if .* discarded/,'DISCARD_CARD'],[/whenever .* card.*graveyard|permanent card.*graveyard/,'PERMANENT_TO_GRAVEYARD'],[/whenever .* sacrifice|if you sacrificed/,'SACRIFICE_PERMANENT'],[/whenever .* draw|second card.*draw/,'DRAW_CARD'],[/whenever .* cast/,'CAST_SPELL'],[/whenever .* attacks|when .* attacks/,'ATTACK'],[/whenever a land enters|land enters .* under your control/,'LAND_ENTERED_BATTLEFIELD'],[/at the beginning of combat/,'BEGIN_COMBAT'],[/power 4 or greater|power of 4 or greater/,'POWER_GTE_4'],[/from your graveyard/,'PERMANENT_TO_GRAVEYARD']].forEach(([r,id])=>{if(match(r))addEventV061(input,id,r.source)});
 // Cost events are outputs because paying them changes game state.
 base.costs.forEach(x=>{if(x.id==='DISCARD_CARD')addEventV061(output,'DISCARD_CARD','cost');if(x.id==='SACRIFICE_SELF'){addEventV061(output,'SACRIFICE_PERMANENT','cost');if(/land/i.test(card.type_line||''))addEventV061(output,'LAND_SACRIFICED','cost');}if(x.id==='TAP_SELF')addEventV061(output,'TAP_PERMANENT','cost');});
 // Explicit state requirements.
 base.conditions.forEach(x=>{if(x.id==='POWER_GTE_4'||x.id==='CONTROL_POWER_GTE_4')addEventV061(input,'POWER_GTE_4','condition');if(x.id==='YOUR_BEGIN_COMBAT')addEventV061(input,'BEGIN_COMBAT','condition');});
 if(output.has('ENTER_BATTLEFIELD')&&/land/i.test(card.type_line||''))addEventV061(output,'LAND_ENTERED_BATTLEFIELD','land ETB');
 if(output.has('SACRIFICE_PERMANENT')&&/land/i.test(text))addEventV061(output,'LAND_SACRIFICED','land sacrifice');
 return {input:[...input.values()],output:[...output.values()]};
}
function graphEdgesV061(cards,profiles,ios){
 const edges=[];
 for(let a=0;a<cards.length;a++)for(let b=0;b<cards.length;b++)if(a!==b){
  for(const out of ios[a].output){
   for(const inp of ios[b].input){
    if(out.id===inp.id)edges.push({from:a,to:b,event:out.id,w:5,label:`${eventLabelV061(out.id)}を直接利用`});
    for(const bridge of EVENT_BRIDGES_V061)if(bridge.from===out.id&&bridge.to===inp.id)edges.push({from:a,to:b,event:`${out.id}>${inp.id}`,w:bridge.w,label:bridge.label});
   }
  }
 }
 const seen=new Set();return edges.filter(e=>{const k=`${e.from}|${e.to}|${e.event}`;if(seen.has(k))return false;seen.add(k);return true;}).sort((a,b)=>b.w-a.w);
}
function eventPillV061(e,kind){return `<span class="eventPillV061 ${kind}" title="${esc(e.source||'')}" data-event="${esc(e.id)}">${esc(eventLabelV061(e.id))}<small>${esc(e.id)}</small></span>`;}
function eventDictionaryHTMLV061(){
 const groups={};Object.entries(EVENT_DICTIONARY_V061).forEach(([id,v])=>(groups[v.group]??=[]).push({id,...v}));
 return `<details class="eventDictionaryV061"><summary>Event辞書 ${Object.keys(EVENT_DICTIONARY_V061).length}種類</summary><div class="eventDictionaryGridV061">${Object.entries(groups).map(([g,items])=>`<section><h4>${esc(g)}</h4>${items.map(x=>`<span title="${esc(x.id)}">${esc(x.ja)}</span>`).join('')}</section>`).join('')}</div></details>`;
}
function eventGraphHTMLV061(cards,ios,edges,verified){
 const nodes=cards.map((c,i)=>`<article class="eventCardV061"><header><b>${i+1}</b><div><h3>${esc(displayName(c))}</h3>${englishSubName(c)}</div></header><div class="eventIOV061"><section><h4>INPUT</h4>${ios[i].input.length?ios[i].input.map(e=>eventPillV061(e,'input')).join(''):'<span class="tiny">明示条件なし</span>'}</section><section><h4>OUTPUT</h4>${ios[i].output.length?ios[i].output.map(e=>eventPillV061(e,'output')).join(''):'<span class="tiny">抽出なし</span>'}</section></div></article>`).join('');
 const edgeHTML=edges.length?edges.map(e=>`<article class="eventEdgeV061 strength${e.w}"><div><b>${esc(displayName(cards[e.from]))}</b><span>→</span><b>${esc(displayName(cards[e.to]))}</b></div><p>${esc(e.label)}</p><small>${'★'.repeat(e.w)}${'☆'.repeat(5-e.w)} ・ ${verified?'Verified / Inferred':'Inferred'}</small></article>`).join(''):'<div class="empty">イベント入出力の直接接続は見つかりませんでした。これは相互作用がないという断定ではありません。</div>';
 return `<section class="eventExplorerV061"><div class="knowledgeHeader"><div><div class="dialogEyebrow">Event Graph Engine</div><h2>イベント入出力</h2><p class="notice">カード文章を、消費するイベント（INPUT）と発生させるイベント（OUTPUT）へ変換します。</p></div><span class="knowledgeCount">${edges.length}接続</span></div><div class="eventCardsV061">${nodes}</div><div class="eventFlowTitleV061"><h3>イベントチェーン</h3><span>強度はルール上の直接性を示します</span></div><div class="eventEdgesV061">${edgeHTML}</div>${eventDictionaryHTMLV061()}</section>`;
}
async function analyzeRulesV061(){
 const statusEl=$('ruleStatus'),result=$('ruleResult');if(!statusEl||!result)return;
 if(!pool.length){statusEl.textContent='カードデータを取得しています。';await prepareDatabase(false);if(!pool.length){statusEl.textContent='カードデータを取得できませんでした。';return;}}
 const raw=['ruleCard1','ruleCard2','ruleCard3'].map(id=>$(id)?.value.trim()).filter(Boolean);if(!raw.length){statusEl.textContent='カードを1枚以上入力してください。';return;}
 const cards=[];for(const name of raw){const c=findPoolCard(name)||await named(name);if(c&&!cards.some(x=>x.oracle_id===c.oracle_id))cards.push(c);}
 if(!cards.length){statusEl.textContent='カードを特定できませんでした。';return;}
 const profiles=cards.map(parseRuleCardV060),verified=knownRuleCaseV060(cards),links=inferredRuleLinksV060(profiles),ios=cards.map((c,i)=>eventIOV061(c,profiles[i])),edges=graphEdgesV061(cards,profiles,ios);
 const linksHTML=links.length?links.map(x=>`<article class="ruleLink"><div><b>${esc(displayName(cards[x.from]))}</b><span>→</span><b>${esc(displayName(cards[x.to]))}</b></div><strong>${esc(x.label)}</strong><p>${esc(x.reason)}</p><span class="ruleConfidence inferred">${x.confidence}</span></article>`).join(''):'<div class="empty">現在の辞書では明確な状態接続を検出できませんでした。</div>';
 result.innerHTML=`${verified?ruleSequenceHTMLV060(verified):''}${eventGraphHTMLV061(cards,ios,edges,!!verified)}<section class="section"><div class="knowledgeHeader"><div><h2>カード文章の構造化</h2><p class="notice">条件・コスト・イベント・状態の直接抽出結果です。</p></div><span class="knowledgeCount">${cards.length}枚</span></div><div class="ruleProfiles">${profiles.map(ruleProfileHTMLV060).join('')}</div></section><section class="section"><div class="knowledgeHeader"><div><h2>状態接続候補</h2><p class="notice">旧Rule Kernelの状態・条件接続も併記します。</p></div><span class="knowledgeCount">${links.length}件</span></div><div class="ruleLinks">${linksHTML}</div></section><div class="ruleDisclaimer"><b>β-1の限界：</b>イベント辞書と入出力グラフの初版です。スタック上の全順序、対象適正、置換効果、種類別適用順、状況起因処理、最後の情報はまだ完全計算しません。Verified以外は候補として扱ってください。</div>`;
 const direct=ios.reduce((n,x)=>n+x.input.length+x.output.length,0);statusEl.textContent=`${cards.length}枚を解析：イベント入出力${direct}項目、イベント接続${edges.length}件${verified?'、検証済み事例1件':''}。`;
}


/* Stack & Trigger Engine beta-2 v0.6.2 */
const STACK_KIND_LABELS_V062={activated:'起動型能力',triggered:'誘発型能力',spell:'呪文',delayed:'遅延誘発型能力'};
function abilityLinesV062(card){
  const text=ruleTextV060(card)||'';
  return text.split(/\n+/).map(x=>x.trim()).filter(Boolean);
}
function classifyAbilitiesV062(card){
  const abilities=[];
  for(const line of abilityLinesV062(card)){
    const low=line.toLowerCase();
    if(/^(when|whenever|at the beginning|at the end|if .* would)/.test(low))abilities.push({kind:'triggered',text:line,source:card});
    else if(line.includes(':'))abilities.push({kind:'activated',text:line,source:card,cost:line.split(':')[0].trim(),effect:line.split(':').slice(1).join(':').trim()});
    else if(/you may cast|counter target spell|destroy target|return target|draw \d|create .* token/i.test(line))abilities.push({kind:'spell',text:line,source:card});
  }
  return abilities;
}
function stackItemV062(kind,source,label,controller='A',extra={}){return {id:`stk-${Math.random().toString(36).slice(2)}`,kind,source:displayName(source),label,controller,...extra};}
function snapshotV062(stack){return stack.slice().reverse().map((x,i)=>({...x,position:i+1}));}
function traceStepV062(trace,type,title,detail,stack,state=''){
  trace.push({n:trace.length+1,type,title,detail,stack:snapshotV062(stack),state});
}
function verifiedStackTraceV062(cards,known){
  if(!known)return null;
  const names=cards.flatMap(c=>cardNameVariantsV053(c).map(normalizeCardNameV053));
  const has=s=>names.some(n=>n.includes(normalizeCardNameV053(s)));
  const trace=[],stack=[];
  if(has('Moonshadow')&&has('Bloodthorn Flail')&&has('Flamewake Phoenix')){
    traceStepV062(trace,'state','初期状態','月影は7/7に－1/－1カウンター6個が置かれ、実効1/1。炎跡のフェニックスは手札。血茨のフレイルは戦場。',stack,'月影 1/1');
    stack.push(stackItemV062('activated',cards.find(c=>cardNameVariantsV053(c).some(n=>/Bloodthorn Flail/i.test(n))),'月影を対象にした装備能力'));
    traceStepV062(trace,'activate','装備能力を起動','対象を月影に決め、代替コストとして炎跡のフェニックスを捨てます。コストの支払いはスタックを使いません。',stack,'フェニックス：手札→墓地');
    stack.push(stackItemV062('triggered',cards.find(c=>cardNameVariantsV053(c).some(n=>/Moonshadow/i.test(n))),'パーマネント・カードが墓地へ置かれた誘発'));
    traceStepV062(trace,'trigger','月影の能力が誘発','装備能力の起動完了後、誘発型能力をスタックの一番上に置きます。',stack);
    stack.pop();traceStepV062(trace,'resolve','月影の誘発を解決','－1/－1カウンターを1個取り除きます。',stack,'月影 2/2');
    stack.pop();traceStepV062(trace,'resolve','装備能力を解決','血茨のフレイルを月影につけ、継続的修整＋2/＋1を適用します。',stack,'月影 4/3');
    traceStepV062(trace,'event','戦闘開始ステップ','パワー4以上のクリーチャーをコントロールしているため、墓地のフェニックスの能力が誘発します。',stack);
    stack.push(stackItemV062('triggered',cards.find(c=>cardNameVariantsV053(c).some(n=>/Flamewake Phoenix/i.test(n))),'炎跡のフェニックスを戻す誘発'));
    traceStepV062(trace,'trigger','フェニックスの能力をスタックへ','誘発型能力がスタックへ置かれます。',stack);
    stack.pop();traceStepV062(trace,'resolve','フェニックスの誘発を解決','{R}を支払うことを選び、墓地から戦場へ戻します。',stack,'フェニックス：墓地→戦場');
    return {confidence:'Verified',trace,notes:['装備コストとして捨てる処理は能力解決前に完了します。','誘発型能力は元の装備能力より上に置かれるため、先に解決します。']};
  }
  if(has('Badgermole Cub')&&has('Fabled Passage')){
    traceStepV062(trace,'event','アナグマモグラの仔が戦場に出る','戦場に出たときの土の技1が誘発します。',stack);
    stack.push(stackItemV062('triggered',cards.find(c=>cardNameVariantsV053(c).some(n=>/Badgermole Cub/i.test(n))),'土の技1'));
    traceStepV062(trace,'trigger','土の技1をスタックへ','寓話の小道を対象として選びます。',stack);
    stack.pop();traceStepV062(trace,'resolve','土の技1を解決','寓話の小道を速攻を持つ0/0の土地・クリーチャーにし、＋1/＋1カウンターを置き、死亡・追放時の遅延誘発を作ります。',stack,'寓話の小道 1/1・土地クリーチャー');
    stack.push(stackItemV062('activated',cards.find(c=>cardNameVariantsV053(c).some(n=>/Fabled Passage/i.test(n))),'基本土地を探す起動型能力'));
    traceStepV062(trace,'activate','寓話の小道の能力を起動','タップして自身を生け贄に捧げます。コストは即座に支払われ、小道はクリーチャーとして死亡します。',stack,'寓話の小道：戦場→墓地');
    stack.push(stackItemV062('delayed',cards.find(c=>cardNameVariantsV053(c).some(n=>/Badgermole Cub/i.test(n))),'土の技が作った帰還の遅延誘発'));
    traceStepV062(trace,'trigger','遅延誘発をスタックへ','すでにある寓話の小道の起動型能力より上に置かれます。',stack);
    stack.pop();traceStepV062(trace,'resolve','遅延誘発を解決','寓話の小道を墓地からタップ状態で戦場へ戻します。',stack,'土地の戦場入り：1回目');
    stack.pop();traceStepV062(trace,'resolve','寓話の小道の能力を解決','ライブラリーから基本土地を探し、タップ状態で戦場へ出します。',stack,'土地の戦場入り：2回目');
    return {confidence:'Verified',trace,notes:['スタック上の能力は、その発生源が領域を移動しても独立して存在します。','遅延誘発は起動型能力より後にスタックへ置かれるため先に解決します。']};
  }
  return null;
}
function genericStackTraceV062(cards,profiles,order='input'){
  const trace=[],stack=[],all=[];
  cards.forEach((card,i)=>classifyAbilitiesV062(card).forEach((a,j)=>all.push({...a,cardIndex:i,abilityIndex:j})));
  const activated=all.filter(a=>a.kind==='activated'),triggered=all.filter(a=>a.kind==='triggered');
  if(activated.length){
    const a=activated[0];stack.push(stackItemV062('activated',a.source,a.effect||a.text,'A',{raw:a.text}));
    traceStepV062(trace,'activate',`${displayName(a.source)}の能力を起動`,a.cost?`コスト「${a.cost}」を支払い、能力をスタックへ置きます。`:'能力をスタックへ置きます。',stack);
  }else{
    const spell=all.find(a=>a.kind==='spell');if(spell){stack.push(stackItemV062('spell',spell.source,spell.text));traceStepV062(trace,'cast',`${displayName(spell.source)}を唱える`,'コストを支払い、呪文をスタックへ置きます。',stack);}
  }
  let ordered=triggered.slice();if(order==='reverse')ordered.reverse();
  ordered.slice(0,5).forEach(a=>{stack.push(stackItemV062('triggered',a.source,a.text));traceStepV062(trace,'trigger',`${displayName(a.source)}の誘発を検出`,'誘発条件が満たされたと仮定し、次に優先権が発生する前にスタックへ置きます。',stack);});
  while(stack.length){const top=stack.pop();traceStepV062(trace,'resolve',`${top.source} — ${STACK_KIND_LABELS_V062[top.kind]||top.kind}を解決`,top.label,stack);}
  if(!trace.length)traceStepV062(trace,'unsupported','スタック対象を抽出できませんでした','現在の簡易パーサーで起動型・誘発型・呪文能力を特定できませんでした。',stack);
  return {confidence:'Inferred',trace,notes:['選択対象、支払えるコスト、介在するif節、対戦相手の応答は完全には検証していません。','同時誘発の順番は選択設定に従う仮置きです。']};
}
function stackSnapshotHTMLV062(items){
  if(!items.length)return '<div class="stackEmptyV062">スタックは空です</div>';
  return `<div class="stackColumnV062">${items.map(x=>`<div class="stackItemV062 kind-${esc(x.kind)}"><span>${x.position}</span><div><b>${esc(x.source)}</b><small>${esc(STACK_KIND_LABELS_V062[x.kind]||x.kind)} ・ ${esc(x.controller||'A')}</small><p>${esc(x.label)}</p></div></div>`).join('')}</div>`;
}
function stackTraceHTMLV062(sim){
  return `<section class="stackEngineV062"><div class="knowledgeHeader"><div><div class="dialogEyebrow">Stack & Trigger Engine β-2</div><h2>スタック処理シミュレーション</h2><p class="notice">コスト支払い、誘発検出、スタック投入、上からの解決を時系列で表示します。</p></div><span class="ruleConfidence ${sim.confidence==='Verified'?'verified':'inferred'}">${esc(sim.confidence)}</span></div><div class="stackTimelineV062">${sim.trace.map(step=>`<article class="stackStepV062 type-${esc(step.type)}"><div class="stackStepHeadV062"><b>${step.n}</b><div><h3>${esc(step.title)}</h3><p>${esc(step.detail)}</p>${step.state?`<strong>${esc(step.state)}</strong>`:''}</div></div><div class="stackSnapshotV062"><h4>この時点のスタック（上が先に解決）</h4>${stackSnapshotHTMLV062(step.stack)}</div></article>`).join('')}</div><details class="stackNotesV062"><summary>判定上の注意</summary><ul>${sim.notes.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></details></section>`;
}
async function analyzeRulesV062(){
 const statusEl=$('ruleStatus'),result=$('ruleResult');if(!statusEl||!result)return;
 if(!pool.length){statusEl.textContent='カードデータを取得しています。';await prepareDatabase(false);if(!pool.length){statusEl.textContent='カードデータを取得できませんでした。';return;}}
 const raw=['ruleCard1','ruleCard2','ruleCard3'].map(id=>$(id)?.value.trim()).filter(Boolean);if(!raw.length){statusEl.textContent='カードを1枚以上入力してください。';return;}
 const cards=[];for(const name of raw){const c=findPoolCard(name)||await named(name);if(c&&!cards.some(x=>x.oracle_id===c.oracle_id))cards.push(c);}
 if(!cards.length){statusEl.textContent='カードを特定できませんでした。';return;}
 const profiles=cards.map(parseRuleCardV060),verified=knownRuleCaseV060(cards),links=inferredRuleLinksV060(profiles),ios=cards.map((c,i)=>eventIOV061(c,profiles[i])),edges=graphEdgesV061(cards,profiles,ios);
 const order=$('ruleTriggerOrder')?.value||'input';const stackSim=verifiedStackTraceV062(cards,verified)||genericStackTraceV062(cards,profiles,order);
 const linksHTML=links.length?links.map(x=>`<article class="ruleLink"><div><b>${esc(displayName(cards[x.from]))}</b><span>→</span><b>${esc(displayName(cards[x.to]))}</b></div><strong>${esc(x.label)}</strong><p>${esc(x.reason)}</p><span class="ruleConfidence inferred">${x.confidence}</span></article>`).join(''):'<div class="empty">現在の辞書では明確な状態接続を検出できませんでした。</div>';
 result.innerHTML=`${verified?ruleSequenceHTMLV060(verified):''}${stackTraceHTMLV062(stackSim)}${eventGraphHTMLV061(cards,ios,edges,!!verified)}<section class="section"><div class="knowledgeHeader"><div><h2>カード文章の構造化</h2><p class="notice">条件・コスト・イベント・状態の直接抽出結果です。</p></div><span class="knowledgeCount">${cards.length}枚</span></div><div class="ruleProfiles">${profiles.map(ruleProfileHTMLV060).join('')}</div></section><section class="section"><div class="knowledgeHeader"><div><h2>状態接続候補</h2><p class="notice">旧Rule Kernelの状態・条件接続も併記します。</p></div><span class="knowledgeCount">${links.length}件</span></div><div class="ruleLinks">${linksHTML}</div></section><div class="ruleDisclaimer"><b>β-2の限界：</b>スタック投入とLIFO解決の初版です。対象適正、対戦相手の応答、介在するif節、置換効果、種類別適用順、状況起因処理、最後の情報は完全計算していません。Verified以外は仮説として扱ってください。</div>`;
 const direct=ios.reduce((n,x)=>n+x.input.length+x.output.length,0);statusEl.textContent=`${cards.length}枚を解析：スタック処理${stackSim.trace.length}段階、イベント入出力${direct}項目、イベント接続${edges.length}件${verified?'、検証済み事例1件':''}。`;
}
function setupEventGraphV061(){
 if($('ruleAnalyzeBtn'))$('ruleAnalyzeBtn').onclick=analyzeRulesV062;
 ['ruleCard1','ruleCard2','ruleCard3'].forEach(id=>{const el=$(id);if(el)el.addEventListener('keydown',e=>{if(e.key==='Enter'){e.stopImmediatePropagation();analyzeRulesV062();}},true);});
}
setupEventGraphV061();

/* State, Zone & Replacement Engine beta-3 v0.6.3 */
const ZONE_LABELS_V063={library:'ライブラリー',hand:'手札',battlefield:'戦場',graveyard:'墓地',exile:'追放',stack:'スタック',command:'統率領域',unknown:'不明'};
const SBA_CATALOG_V063=[
 {id:'TOUGHNESS_ZERO',label:'タフネス0以下',detail:'タフネスが0以下のクリーチャーをオーナーの墓地へ置く。'},
 {id:'LETHAL_DAMAGE',label:'致死ダメージ',detail:'致死ダメージを負ったクリーチャーを破壊する（破壊不能などは別途考慮）。'},
 {id:'ZERO_LOYALTY',label:'忠誠度0',detail:'忠誠カウンターが0のプレインズウォーカーを墓地へ置く。'},
 {id:'LEGEND_RULE',label:'レジェンド・ルール',detail:'同名の伝説のパーマネントを複数コントロールしている場合に1つを残す。'},
 {id:'TOKEN_ZONE',label:'トークンの領域',detail:'戦場以外の領域にあるトークンは存在しなくなる。'},
 {id:'AURA_ILLEGAL',label:'不正なオーラ',detail:'適正なオブジェクトやプレイヤーにつけられていないオーラを墓地へ置く。'}
];
function ruleTextJoinedV063(card){return (ruleTextV060(card)||'').replace(/\s+/g,' ').trim();}
function replacementEffectsV063(card){
 const out=[];for(const line of abilityLinesV062(card)){
  const l=line.toLowerCase();let kind='';
  if(/\binstead\b/.test(l))kind='REPLACE_INSTEAD';
  else if(/^if .* would /.test(l)||/if .* would .* instead/.test(l))kind='WOULD_REPLACE';
  else if(/\bas .* enters( the battlefield)?\b/.test(l))kind='ENTER_REPLACEMENT';
  else if(/enters? .* with .* counter/.test(l))kind='ENTER_WITH_COUNTERS';
  else if(/skip .* (step|phase|turn)/.test(l))kind='SKIP_EVENT';
  if(kind)out.push({kind,text:line,source:displayName(card)});
 }
 return out;
}
function delayedTriggersV063(card){
 const out=[];for(const line of abilityLinesV062(card)){
  const l=line.toLowerCase();
  if(/at the beginning of (the )?(next|your next|end step)/.test(l)||/when (it|that|this|the .*?) (dies|is exiled|leaves the battlefield)/.test(l)||/until .*\. when /.test(l))out.push({kind:'DELAYED_TRIGGER',text:line,source:displayName(card)});
 }
 return out;
}
function lkiNeedsV063(card){
 const out=[];for(const line of abilityLinesV062(card)){
  const l=line.toLowerCase();
  if(/\bdies\b|put into a graveyard from the battlefield|leaves the battlefield|last known/.test(l))out.push({event:/dies|graveyard from the battlefield/.test(l)?'DIES':'LEAVES_BATTLEFIELD',text:line,source:displayName(card),reason:'発生源が戦場を離れた後の特性を参照する可能性があるため、最後の情報（LKI）候補として保持します。'});
 }
 return out;
}
function parseZoneMovesFromTextV063(card){
 const t=ruleTextJoinedV063(card).toLowerCase(),moves=[];const src=displayName(card);
 const add=(from,to,event,reason)=>moves.push({from,to,event,reason,source:src});
 if(/discard/.test(t))add('hand','graveyard','DISCARD','カードを捨てる処理');
 if(/mill/.test(t))add('library','graveyard','MILL','切削による領域移動');
 if(/return .* from (your |a )?graveyard to the battlefield|return .* card from .* graveyard to the battlefield/.test(t))add('graveyard','battlefield','RETURN_TO_BATTLEFIELD','墓地から戦場へ戻す');
 if(/return .* to (its owner's |their )?hand/.test(t))add('battlefield','hand','RETURN_TO_HAND','戦場から手札へ戻す');
 if(/exile target|exile .* card|exile it|exile that/.test(t))add('unknown','exile','EXILE','追放効果');
 if(/destroy target|destroy .* creature|destroy .* permanent/.test(t))add('battlefield','graveyard','DESTROY','破壊による戦場→墓地の候補');
 if(/sacrifice/.test(t))add('battlefield','graveyard','SACRIFICE','生け贄による戦場→墓地');
 if(/put .* from .* hand onto the battlefield/.test(t))add('hand','battlefield','PUT_ONTO_BATTLEFIELD','手札から戦場へ置く');
 return moves;
}
function verifiedStateModelV063(cards,known){
 if(!known)return null;const names=cards.flatMap(c=>cardNameVariantsV053(c).map(normalizeCardNameV053));const has=s=>names.some(n=>n.includes(normalizeCardNameV053(s)));
 if(has('Moonshadow')&&has('Bloodthorn Flail')&&has('Flamewake Phoenix'))return {
  confidence:'Verified',
  zones:[
   {n:1,object:'炎跡のフェニックス',from:'hand',to:'graveyard',event:'DISCARD',reason:'血茨のフレイルの代替装備コストを支払う'},
   {n:2,object:'炎跡のフェニックス',from:'graveyard',to:'battlefield',event:'RETURN_TO_BATTLEFIELD',reason:'戦闘開始時の誘発型能力を解決し{R}を支払う'}
  ],
  delayed:[],replacements:[],lki:[],sba:[{id:'TOUGHNESS_ZERO',status:'pass',detail:'月影は各段階でタフネスが0以下にならないため該当しません。'}],
  notes:['領域を移動したカードは原則として新しいオブジェクトとして扱う前提で履歴を分離します。']
 };
 if(has('Badgermole Cub')&&has('Fabled Passage'))return {
  confidence:'Verified',
  zones:[
   {n:1,object:'寓話の小道',from:'battlefield',to:'graveyard',event:'SACRIFICE',reason:'自身の起動型能力のコストとして生け贄に捧げる'},
   {n:2,object:'寓話の小道',from:'graveyard',to:'battlefield',event:'RETURN_TO_BATTLEFIELD',reason:'土の技が作った遅延誘発型能力を解決'},
   {n:3,object:'基本土地',from:'library',to:'battlefield',event:'SEARCH_LIBRARY',reason:'寓話の小道の起動型能力を解決'}
  ],
  delayed:[{source:'アナグマモグラの仔',kind:'DELAYED_TRIGGER',text:'対象の土地がこのターンに死亡するか追放されたとき、それをあなたのコントロール下でタップ状態で戦場に戻す。',status:'created_then_fired'}],
  replacements:[],
  lki:[{source:'寓話の小道',event:'DIES',text:'土地・クリーチャーとして戦場から墓地へ移動した事実を、誘発条件判定に使用。',reason:'死亡直前の戦場でクリーチャーだったという最後の情報を保持します。'}],
  sba:[{id:'TOUGHNESS_ZERO',status:'pass',detail:'＋1/＋1カウンターにより1/1のため、0/0化直後のSBAでは墓地へ置かれません。'}],
  notes:['遅延誘発は土の技の解決時に作成され、その後の死亡イベントを監視します。','寓話の小道は墓地へ移動した後は新しいオブジェクトですが、誘発条件は必要に応じて直前の情報を参照します。']
 };
 return null;
}
function genericStateModelV063(cards,profiles){
 const zones=cards.flatMap(parseZoneMovesFromTextV063).map((x,i)=>({n:i+1,object:x.source,...x}));
 const replacements=cards.flatMap(replacementEffectsV063),delayed=cards.flatMap(delayedTriggersV063),lki=cards.flatMap(lkiNeedsV063);
 const sba=[];
 const allText=cards.map(ruleTextJoinedV063).join(' ').toLowerCase();
 if(/-\d+\/-\d+|gets? -\d+\/-\d+|damage/.test(allText))sba.push({id:'TOUGHNESS_ZERO',status:'candidate',detail:'タフネス減少またはダメージがあるため、解決後にタフネス0以下・致死ダメージを再検査する必要があります。'});
 if(/legendary/.test(cards.map(c=>c.type_line||'').join(' ').toLowerCase()))sba.push({id:'LEGEND_RULE',status:'candidate',detail:'伝説のパーマネントが含まれます。同名が複数同時に戦場に存在する盤面ではレジェンド・ルールを検査します。'});
 return {confidence:'Inferred',zones,delayed,replacements,lki,sba,notes:['β-3の一般解析はカード文章から必要なルール監視点を抽出する段階です。盤面全体の数値状態まではまだ完全計算しません。']};
}
function zoneLedgerHTMLV063(zones){
 if(!zones.length)return '<div class="empty">明示的な領域移動を抽出できませんでした。</div>';
 return `<div class="zoneLedgerV063">${zones.map(z=>`<article class="zoneMoveV063"><span class="zoneMoveNumV063">${z.n}</span><div><b>${esc(z.object||z.source||'カード')}</b><div class="zoneFlowV063"><span>${esc(ZONE_LABELS_V063[z.from]||z.from)}</span><strong>→</strong><span>${esc(ZONE_LABELS_V063[z.to]||z.to)}</span></div><small>${esc(z.event||'ZONE_CHANGE')}</small><p>${esc(z.reason||'')}</p></div></article>`).join('')}</div>`;
}
function replacementHTMLV063(items){
 if(!items.length)return '<div class="empty">この組み合わせから置換効果候補は検出されませんでした。</div>';
 return `<div class="replacementListV063">${items.map(x=>`<article><span class="ruleBadge result">${esc(x.kind)}</span><b>${esc(x.source)}</b><p>${esc(x.text)}</p><small>イベントを実行する前に適用可否を判定します。</small></article>`).join('')}</div>`;
}
function delayedHTMLV063(items){
 if(!items.length)return '<div class="empty">遅延誘発の登録候補はありません。</div>';
 return `<div class="replacementListV063">${items.map(x=>`<article><span class="ruleBadge event">DELAYED</span><b>${esc(x.source)}</b><p>${esc(x.text)}</p>${x.status?`<small>${esc(x.status)}</small>`:''}</article>`).join('')}</div>`;
}
function lkiHTMLV063(items){
 if(!items.length)return '<div class="empty">LKI保持が必要な候補はありません。</div>';
 return `<div class="replacementListV063">${items.map(x=>`<article><span class="ruleBadge state">LKI</span><b>${esc(x.source)}</b><p>${esc(x.text)}</p><small>${esc(x.reason||'')}</small></article>`).join('')}</div>`;
}
function sbaHTMLV063(items){
 const map=new Map(items.map(x=>[x.id,x]));return `<div class="sbaGridV063">${SBA_CATALOG_V063.map(s=>{const hit=map.get(s.id),status=hit?.status||'idle';return `<article class="sbaItemV063 ${esc(status)}"><div><b>${esc(s.label)}</b><span>${status==='candidate'?'要検査':status==='pass'?'確認済み':'待機'}</span></div><p>${esc(hit?.detail||s.detail)}</p></article>`}).join('')}</div>`;
}
function stateEngineHTMLV063(model){
 return `<section class="stateEngineV063"><div class="knowledgeHeader"><div><div class="dialogEyebrow">State, Zone & Replacement Engine β-3</div><h2>領域・置換・状況起因処理</h2><p class="notice">イベントを即座に確定せず、置換効果→領域移動→LKI保持→誘発登録→状況起因処理の順で監視します。</p></div><span class="ruleConfidence ${model.confidence==='Verified'?'verified':'inferred'}">${esc(model.confidence)}</span></div><div class="stateGridV063"><section class="mini"><h3>領域移動履歴</h3>${zoneLedgerHTMLV063(model.zones)}</section><section class="mini"><h3>置換効果候補</h3>${replacementHTMLV063(model.replacements)}</section><section class="mini"><h3>遅延誘発レジストリ</h3>${delayedHTMLV063(model.delayed)}</section><section class="mini"><h3>最後の情報（LKI）</h3>${lkiHTMLV063(model.lki)}</section></div><section class="mini section"><h3>状況起因処理チェック</h3>${sbaHTMLV063(model.sba)}</section><details class="stackNotesV062"><summary>β-3の判定上の注意</summary><ul>${model.notes.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></details></section>`;
}
async function analyzeRulesV063(){
 const statusEl=$('ruleStatus'),result=$('ruleResult');if(!statusEl||!result)return;
 if(!pool.length){statusEl.textContent='カードデータを取得しています。';await prepareDatabase(false);if(!pool.length){statusEl.textContent='カードデータを取得できませんでした。';return;}}
 const raw=['ruleCard1','ruleCard2','ruleCard3'].map(id=>$(id)?.value.trim()).filter(Boolean);if(!raw.length){statusEl.textContent='カードを1枚以上入力してください。';return;}
 const cards=[];for(const name of raw){const c=findPoolCard(name)||await named(name);if(c&&!cards.some(x=>x.oracle_id===c.oracle_id))cards.push(c);}
 if(!cards.length){statusEl.textContent='カードを特定できませんでした。';return;}
 const profiles=cards.map(parseRuleCardV060),verified=knownRuleCaseV060(cards),links=inferredRuleLinksV060(profiles),ios=cards.map((c,i)=>eventIOV061(c,profiles[i])),edges=graphEdgesV061(cards,profiles,ios);
 const order=$('ruleTriggerOrder')?.value||'input';const stackSim=verifiedStackTraceV062(cards,verified)||genericStackTraceV062(cards,profiles,order);
 const stateModel=verifiedStateModelV063(cards,verified)||genericStateModelV063(cards,profiles);
 const linksHTML=links.length?links.map(x=>`<article class="ruleLink"><div><b>${esc(displayName(cards[x.from]))}</b><span>→</span><b>${esc(displayName(cards[x.to]))}</b></div><strong>${esc(x.label)}</strong><p>${esc(x.reason)}</p><span class="ruleConfidence inferred">${x.confidence}</span></article>`).join(''):'<div class="empty">現在の辞書では明確な状態接続を検出できませんでした。</div>';
 result.innerHTML=`${verified?ruleSequenceHTMLV060(verified):''}${stackTraceHTMLV062(stackSim)}${stateEngineHTMLV063(stateModel)}${eventGraphHTMLV061(cards,ios,edges,!!verified)}<section class="section"><div class="knowledgeHeader"><div><h2>カード文章の構造化</h2><p class="notice">条件・コスト・イベント・状態の直接抽出結果です。</p></div><span class="knowledgeCount">${cards.length}枚</span></div><div class="ruleProfiles">${profiles.map(ruleProfileHTMLV060).join('')}</div></section><section class="section"><div class="knowledgeHeader"><div><h2>状態接続候補</h2><p class="notice">Rule Kernelの状態・条件接続も併記します。</p></div><span class="knowledgeCount">${links.length}件</span></div><div class="ruleLinks">${linksHTML}</div></section><div class="ruleDisclaimer"><b>β-3の限界：</b>領域履歴、置換効果候補、遅延誘発レジストリ、LKI、主要な状況起因処理の監視点を追加しました。複数の置換効果の選択順、全パーマネントの数値状態、優先権応答、依存関係を含む継続的効果の種類別適用はまだ完全計算しません。Verified以外は仮説として扱ってください。</div>`;
 const direct=ios.reduce((n,x)=>n+x.input.length+x.output.length,0);statusEl.textContent=`${cards.length}枚を解析：スタック${stackSim.trace.length}段階、領域移動${stateModel.zones.length}件、置換候補${stateModel.replacements.length}件、遅延誘発${stateModel.delayed.length}件、LKI候補${stateModel.lki.length}件、イベント接続${edges.length}件${verified?'、検証済み事例1件':''}。`;
}
if($('ruleAnalyzeBtn'))$('ruleAnalyzeBtn').onclick=analyzeRulesV063;
['ruleCard1','ruleCard2','ruleCard3'].forEach(id=>{const el=$(id);if(el)el.addEventListener('keydown',e=>{if(e.key==='Enter'){e.stopImmediatePropagation();analyzeRulesV063();}},true);});

/* Priority & Response Engine beta-4 v0.6.4a */
const PRIORITY_PHASES_V064=[
 {id:'MAIN',label:'メイン・フェイズ',sorcery:true},
 {id:'BEGIN_COMBAT',label:'戦闘開始',sorcery:false},
 {id:'DECLARE_ATTACKERS',label:'攻撃クリーチャー指定後',sorcery:false},
 {id:'DECLARE_BLOCKERS',label:'ブロック・クリーチャー指定後',sorcery:false},
 {id:'END_STEP',label:'終了ステップ',sorcery:false}
];
function responseCapabilitiesV064(card){
 const text=ruleTextV060(card)||'', low=text.toLowerCase(), out=[];
 if((card.type_line||'').toLowerCase().includes('instant'))out.push({kind:'INSTANT',label:'インスタント',canRespond:true,reason:'通常、優先権があるときに唱えられます。'});
 if(/flash/.test(low))out.push({kind:'FLASH',label:'瞬速',canRespond:true,reason:'瞬速によりインスタントを唱えられるタイミングで唱えられます。'});
 const acts=abilityLinesV062(card).filter(x=>x.includes(':'));
 if(acts.length)out.push({kind:'ACTIVATED',label:'起動型能力',canRespond:true,reason:'マナ能力などの例外を除き、通常は優先権があるときに起動できます。'});
 if(/activate only as a sorcery/i.test(text))out.push({kind:'SORCERY_ONLY',label:'ソーサリー・タイミング限定',canRespond:false,reason:'自分のメイン・フェイズ、スタックが空で優先権がある場合に限られます。'});
 if(!out.length)out.push({kind:'NO_FAST_ACTION',label:'即時応答を抽出せず',canRespond:false,reason:'カード文章・タイプから一般的な応答手段を抽出できませんでした。'});
 return out;
}
function priorityWindowsV064(cards,stackSim){
 const active=$('ruleActivePlayer')?.value||'A', nonactive=active==='A'?'B':'A', auto=$('ruleAutoPass')?.checked!==false;
 const windows=[]; let n=1;
 const add=(cause,stack,detail)=>windows.push({n:n++,cause,holder:active,order:[active,nonactive],stack:(stack||[]).map(x=>({...x})),auto,detail});
 for(const step of (stackSim.trace||[])){
   if(['activate','cast','trigger'].includes(step.type)) add(step.title,step.stack,'スタックへオブジェクトを置いた後、状況起因処理と待機中の誘発を処理してからアクティブ・プレイヤーが優先権を得る想定です。');
   if(step.type==='resolve') add(step.title,step.stack,'スタック最上段の解決後、状況起因処理と誘発を処理した後にアクティブ・プレイヤーが優先権を得ます。');
 }
 if(!windows.length)add('現在のゲーム状態',[],'処理を開始できる優先権窓として表示します。');
 return {active,nonactive,auto,windows};
}
function priorityHTMLV064(cards,model){
 const caps=cards.map(c=>({card:c,items:responseCapabilitiesV064(c)}));
 return `<section class="priorityEngineV064"><div class="knowledgeHeader"><div><div class="dialogEyebrow">Priority & Response Engine β-4</div><h2>優先権・応答タイミング</h2><p class="notice">スタックの各節目で、誰が先に優先権を得るか、どの種類の応答が可能かを分離して表示します。</p></div><span class="ruleConfidence inferred">Inferred</span></div>
 <div class="prioritySummaryV064"><article><b>AP</b><strong>プレイヤー${esc(model.active)}</strong><small>アクティブ・プレイヤー</small></article><article><b>NAP</b><strong>プレイヤー${esc(model.nonactive)}</strong><small>非アクティブ・プレイヤー</small></article><article><b>PASS</b><strong>${model.auto?'自動パス':'手動想定'}</strong><small>${model.auto?'全員連続パスで最上段を解決':'応答候補を確認してから解決'}</small></article></div>
 <div class="priorityTimelineV064">${model.windows.map(w=>`<article class="priorityWindowV064"><div class="priorityNumV064">${w.n}</div><div><h3>${esc(w.cause)}</h3><p>${esc(w.detail)}</p><div class="priorityFlowV064"><span>プレイヤー${esc(w.order[0])}</span><strong>→</strong><span>プレイヤー${esc(w.order[1])}</span><strong>→</strong><span>${w.auto?'両者パス：解決/次のステップ':'応答またはパス'}</span></div>${stackSnapshotHTMLV062(w.stack)}</div></article>`).join('')}</div>
 <section class="mini section"><h3>選択カードの応答能力</h3><div class="responseGridV064">${caps.map(x=>`<article><b>${esc(displayName(x.card))}</b>${x.items.map(i=>`<div class="responseItemV064 ${i.canRespond?'yes':'no'}"><span>${esc(i.label)}</span><p>${esc(i.reason)}</p></div>`).join('')}</article>`).join('')}</div></section>
 <section class="mini section"><h3>タイミング窓の基準</h3><div class="timingGridV064">${PRIORITY_PHASES_V064.map(p=>`<article><b>${esc(p.label)}</b><span>${p.sorcery?'ソーサリー・タイミング成立候補':'インスタント速度の応答窓'}</span></article>`).join('')}</div></section>
 <div class="ruleDisclaimer"><b>β-4の限界：</b>2人対戦を前提とした優先権窓の初版です。実際に唱えられるか・起動できるかは、マナ、対象、個別のタイミング制限、特別な処理、マナ能力、フェイズ/ステップの詳細なゲーム状態を追加確認する必要があります。</div></section>`;
}
async function analyzeRulesV064(){
 const statusEl=$('ruleStatus'),result=$('ruleResult');if(!statusEl||!result)return;
 if(!pool.length){statusEl.textContent='カードデータを取得しています。';await prepareDatabase(false);if(!pool.length){statusEl.textContent='カードデータを取得できませんでした。';return;}}
 const raw=['ruleCard1','ruleCard2','ruleCard3'].map(id=>$(id)?.value.trim()).filter(Boolean);if(!raw.length){statusEl.textContent='カードを1枚以上入力してください。';return;}
 const cards=[];for(const name of raw){const c=findPoolCard(name)||await named(name);if(c&&!cards.some(x=>x.oracle_id===c.oracle_id))cards.push(c);} if(!cards.length){statusEl.textContent='カードを特定できませんでした。';return;}
 const profiles=cards.map(parseRuleCardV060),verified=knownRuleCaseV060(cards),links=inferredRuleLinksV060(profiles),ios=cards.map((c,i)=>eventIOV061(c,profiles[i])),edges=graphEdgesV061(cards,profiles,ios);
 const order=$('ruleTriggerOrder')?.value||'input', stackSim=verifiedStackTraceV062(cards,verified)||genericStackTraceV062(cards,profiles,order), stateModel=verifiedStateModelV063(cards,verified)||genericStateModelV063(cards,profiles), priorityModel=priorityWindowsV064(cards,stackSim);
 const linksHTML=links.length?links.map(x=>`<article class="ruleLink"><div><b>${esc(displayName(cards[x.from]))}</b><span>→</span><b>${esc(displayName(cards[x.to]))}</b></div><strong>${esc(x.label)}</strong><p>${esc(x.reason)}</p><span class="ruleConfidence inferred">${x.confidence}</span></article>`).join(''):'<div class="empty">現在の辞書では明確な状態接続を検出できませんでした。</div>';
 result.innerHTML=`${verified?ruleSequenceHTMLV060(verified):''}${stackTraceHTMLV062(stackSim)}${priorityHTMLV064(cards,priorityModel)}${stateEngineHTMLV063(stateModel)}${eventGraphHTMLV061(cards,ios,edges,!!verified)}<section class="section"><div class="knowledgeHeader"><div><h2>カード文章の構造化</h2><p class="notice">条件・コスト・イベント・状態の直接抽出結果です。</p></div><span class="knowledgeCount">${cards.length}枚</span></div><div class="ruleProfiles">${profiles.map(ruleProfileHTMLV060).join('')}</div></section><section class="section"><div class="knowledgeHeader"><div><h2>状態接続候補</h2><p class="notice">Rule Kernelの状態・条件接続も併記します。</p></div><span class="knowledgeCount">${links.length}件</span></div><div class="ruleLinks">${linksHTML}</div></section>`;
 statusEl.textContent=`${cards.length}枚を解析：優先権窓${priorityModel.windows.length}件、スタック${stackSim.trace.length}段階、領域移動${stateModel.zones.length}件、イベント接続${edges.length}件${verified?'、検証済み事例1件':''}。`;
}
if($('ruleAnalyzeBtn'))$('ruleAnalyzeBtn').onclick=analyzeRulesV064;
['ruleCard1','ruleCard2','ruleCard3'].forEach(id=>{const el=$(id);if(el)el.addEventListener('keydown',e=>{if(e.key==='Enter'){e.stopImmediatePropagation();analyzeRulesV064();}},true);});


/* v0.6.4aa hotfix: unify Rule Engine bindings and remove legacy listener competition */
function bindUnifiedRuleEngineV064a(){
  const btn=$('ruleAnalyzeBtn');
  if(btn){
    const fresh=btn.cloneNode(true);
    btn.replaceWith(fresh);
    fresh.onclick=analyzeRulesV064;
  }
  ['ruleCard1','ruleCard2','ruleCard3'].forEach(id=>{
    const el=$(id); if(!el)return;
    const fresh=el.cloneNode(true);
    fresh.value=el.value;
    el.replaceWith(fresh);
    fresh.addEventListener('keydown',e=>{
      if(e.key==='Enter'){
        e.preventDefault();
        e.stopPropagation();
        analyzeRulesV064();
      }
    });
  });
  const clear=$('ruleClearBtn');
  if(clear){
    const fresh=clear.cloneNode(true);
    clear.replaceWith(fresh);
    fresh.onclick=()=>{
      ['ruleCard1','ruleCard2','ruleCard3'].forEach(id=>{const el=$(id);if(el)el.value='';});
      const r=$('ruleResult'); if(r)r.innerHTML='<div class="empty">左でカードを選ぶと、Rule Engine β-4aでルール構造・スタック・優先権・状態遷移を統合表示します。</div>';
      const st=$('ruleStatus'); if(st)st.textContent='カードを1～3枚入力してください。';
    };
  }
  const status=$('ruleStatus');
  if(status && !status.dataset.v064a){
    status.dataset.v064a='1';
    status.textContent='Rule Engine β-4a：カードを1～3枚入力してください。';
  }
}
bindUnifiedRuleEngineV064a();

/* Rule Path Synergy Engine beta-5 v0.6.5 */
function verifiedPairCaseV065(seed,candidate){
  try{return (verifiedSynergyCasesV053||[]).find(tc=>caseContainsCardV053(tc,seed)&&caseContainsCardV053(tc,candidate))||null}catch{return null}
}
function ruleInterruptionHintsV065(cards){
  const joined=cards.map(c=>ruleTextV060(c)||'').join('\n').toLowerCase(),out=[];
  if(/return .* from .*graveyard|return .* graveyard .* battlefield|墓地.*戦場/.test(joined))out.push('墓地から戻る処理の解決前に墓地へ干渉されると、経路が途切れる可能性があります。');
  if(/target|対象/.test(joined))out.push('対象を取る処理は、解決時に対象が不適正になると結果が変わる可能性があります。');
  if(/whenever|when |at the beginning|誘発/.test(joined))out.push('誘発型能力がスタックに置かれた後は、相手に応答の優先権が発生します。');
  if(/:/.test(joined))out.push('起動型能力は、コスト支払い後・解決前に相手が応答できる場合があります。');
  if(/sacrifice|生け贄/.test(joined))out.push('生け贄がコストなら、応答してそのコスト支払い自体を取り消すことはできません。');
  return unique(out).slice(0,4);
}
function rulePairEvaluationV065(seed,candidate){
  const cards=[seed,candidate],profiles=cards.map(parseRuleCardV060),ios=cards.map((c,i)=>eventIOV061(c,profiles[i]));
  const edges=graphEdgesV061(cards,profiles,ios),links=inferredRuleLinksV060(profiles),verified=verifiedPairCaseV065(seed,candidate);
  const weights=edges.map(e=>+e.w||0),maxW=weights.length?Math.max(...weights):0,sumW=weights.reduce((a,b)=>a+b,0);
  let score=verified?100:Math.min(92,Math.round(maxW*13+Math.min(20,(sumW-maxW)*5)+Math.min(18,links.length*6)));
  if(!verified&&!edges.length&&links.length)score=Math.min(42,18+links.length*7);
  const steps=[];
  if(verified&&Array.isArray(verified.steps))steps.push(...verified.steps.slice(0,4));
  else{
    edges.sort((a,b)=>b.w-a.w).slice(0,4).forEach(e=>steps.push(`${displayName(cards[e.from])} → ${displayName(cards[e.to])}：${e.label}`));
    if(!steps.length)links.slice(0,3).forEach(x=>steps.push(`${displayName(cards[x.from])} → ${displayName(cards[x.to])}：${x.label}`));
  }
  const requirements=unique(profiles.flatMap(p=>[...(p.conditions||[]),...(p.costs||[])])).slice(0,5);
  const confidence=verified?'Verified':score>=65?'Rule-connected':score>=35?'Inferred':'Weak';
  return {score,confidence,verified:!!verified,steps,requirements,interruptions:ruleInterruptionHintsV065(cards),edges,links};
}
function enhanceCandidateV065(seed,x){
  const rp=rulePairEvaluationV065(seed,x.card); let bonus=0;
  if(rp.verified)bonus=30;else if(rp.score>=70)bonus=20;else if(rp.score>=50)bonus=12;else if(rp.score>=30)bonus=5;
  const structural=(x.relations||[]).some(r=>['SYNERGY','ENABLE','ENGINE'].includes(r));
  const supportOnly=(x.relations||[]).some(r=>['SUPPORT','COVERAGE'].includes(r))&&!structural;
  if(structural&&!supportOnly&&rp.score<20)bonus-=10;
  return {...x,baseScore:x.score,score:Math.max(0,Math.min(100,Math.round(x.score+bonus))),rulePath:rp};
}
function rulePathBadgeHTMLV065(rp){
  if(!rp)return '';
  const cls=rp.verified?'verified':rp.score>=65?'good':rp.score>=35?'warn':'weak';
  return `<div class="rulePathBadgeV065 ${cls}"><b>Rule Path ${rp.score}/100</b><span>${esc(rp.confidence)}</span></div>`;
}
function rulePathMiniHTMLV065(rp){
  if(!rp)return '';
  const steps=rp.steps?.length?`<ol class="rulePathMiniStepsV065">${rp.steps.slice(0,3).map(s=>`<li>${esc(s)}</li>`).join('')}</ol>`:'<div class="tiny">明確なイベント経路は未確認です。</div>';
  const req=rp.requirements?.length?`<div class="tiny caution">成立条件候補：${rp.requirements.slice(0,3).map(esc).join('／')}</div>`:'';
  return `<div class="rulePathMiniV065">${rulePathBadgeHTMLV065(rp)}${steps}${req}</div>`;
}
function candidateResultHTMLV053(x){
  return `<article class="result"><button class="imageButton" data-detail="${esc(x.card.name)}">${displayImg(x.card)?`<img loading="lazy" src="${displayImg(x.card)}" alt="${esc(displayName(x.card))}">`:''}</button><div><h3><button class="textButton" data-detail="${esc(x.card.name)}">${esc(displayName(x.card))}</button></h3>${englishSubName(x.card)}<div class="meta">${esc(displayType(x.card))} ・ MV ${x.card.cmc||0} ・ ${colors(x.card.color_identity||[])}</div><div class="relationRow">${relationBadgesHTMLV053(x.relations)}</div>${rulePathMiniHTMLV065(x.rulePath)}<div class="tags">${x.profile.tags.slice(0,5).map(t=>`<span class="tag">${KNOWLEDGE_TAGS[t].label}</span>`).join('')}</div><ul class="explainList">${x.why.map(w=>`<li>${esc(w)}</li>`).join('')}</ul>${x.cautions.length?`<div class="tiny caution">注意：${x.cautions.map(esc).join('／')}</div>`:''}<div class="inlineActions"><button class="smallBtn primary" data-deckadd="${esc(x.card.name)}">デッキへ追加</button><button class="smallBtn" data-detail="${esc(x.card.name)}">詳細</button></div></div><div><div class="score">${x.score}</div><div class="tiny">統合適合点</div></div></article>`;
}
function advisorCandidateHTML(x){
  const c=x.card,cat=advisorCategory(null,x),reason=x.why.slice(0,4);
  return `<article class="advisorCandidate"><button class="imageButton" data-detail="${esc(c.name)}">${displayImg(c)?`<img loading="lazy" src="${displayImg(c)}" alt="${esc(displayName(c))}">`:''}</button><div><div class="advisorCategory">${esc(cat)}</div><h3><button class="textButton" data-detail="${esc(c.name)}">${esc(displayName(c))}</button></h3>${englishSubName(c)}<div class="meta">${esc(displayType(c))} ・ MV ${c.cmc||0} ・ ${colors(c.color_identity||[])}</div><div class="relationRow">${relationBadgesHTMLV053(x.relations)}</div>${rulePathMiniHTMLV065(x.rulePath)}<div class="advisorStars" aria-label="推奨度">${advisorStars(x.score)}</div><ul class="explainList">${reason.map(r=>`<li>${esc(r)}</li>`).join('')}</ul>${x.cautions.length?`<div class="tiny caution">条件：${x.cautions.map(esc).join('／')}</div>`:''}<div class="inlineActions"><button class="smallBtn primary" data-deckadd="${esc(c.name)}">デッキへ追加</button><button class="smallBtn" data-inspect="${esc(c.name)}">このカードも解析</button><button class="smallBtn" data-detail="${esc(c.name)}">詳細</button></div></div></article>`;
}
async function singleAnalyze(){
  if(!pool.length){$('singleStatus').textContent='先にカードデータを取得します。';await fetchPool();if(!pool.length)return;}
  const name=$('singleName').value.trim();if(!name)return;const c=findPoolCard(name)||await named(name);if(!c){$('singleStatus').textContent='カードを特定できませんでした。';return;}
  $('singleName').value=displayName(c);await loadVerifiedSynergiesV053(false);const p=knowledgeProfile(c),verified=verifiedCasesForCardV053(c);
  let base=pool.filter(x=>x.name!==c.name).map(x=>compatibility(c,x)).filter(x=>x.score>=14&&x.why.length).sort((a,b)=>b.score-a.score).slice(0,260);
  singleRecs=base.map(x=>enhanceCandidateV065(c,x)).filter(x=>x.score>=18).sort((a,b)=>b.score-a.score||b.rulePath.score-a.rulePath.score||displayName(a.card).localeCompare(displayName(b.card),'ja')).slice(0,40);
  $('singleSeed').innerHTML=`<div class="mini"><h3>${esc(displayName(c))}</h3>${englishSubName(c)}<div class="meta">${esc(displayType(c))} ・ MV ${c.cmc||0}</div><div class="profileGrid">${profileBoxes(p)}</div>${p.needs.length?`<div class="notice">相性探索の重点：${p.needs.map(esc).join('／')}</div>`:''}</div>`;
  const auto=`<section class="automaticSection"><div class="knowledgeHeader"><div><div class="dialogEyebrow">Rule Path Synergy Engine β-5</div><h2>ルール経路付き自動探索候補</h2><p class="notice">タグ一致だけでなく、Event Graph・状態接続・検証済み事例から実際のルール経路を加点します。</p></div><span class="knowledgeCount">${singleRecs.length}件</span></div>${singleRecs.length?singleRecs.map(candidateResultHTMLV053).join(''):'<div class="empty">明確な効果接続を検出できませんでした。</div>'}</section>`;
  $('singleResults').innerHTML=verifiedSectionHTMLV053(c)+auto;$('singleStatus').textContent=`${pool.length.toLocaleString()}種類から候補を絞り、Rule Pathを再評価しました。検証済み事例：${verified.length}件。`;
}
async function renderAdvisor(name){
  const statusEl=$('advisorStatus');try{
    if(!pool.length){statusEl.textContent='カードデータを取得しています。';await fetchPool(false);if(!pool.length)return;}
    const raw=String(name||$('advisorName').value||'').trim();if(!raw){statusEl.textContent='カード名を入力してください。';return;}
    const c=findPoolCard(raw)||await named(raw);if(!c){statusEl.textContent='カードを特定できませんでした。';return;}
    $('advisorName').value=displayName(c);await loadVerifiedSynergiesV053(false);const p=knowledgeProfile(c),mode=$('advisorMode').value;
    let base=pool.filter(x=>x.name!==c.name).map(x=>compatibility(c,x));
    base.forEach(x=>{if(mode==='support'&&(x.relations.includes('SUPPORT')||x.relations.includes('COVERAGE')))x.score+=10;if(mode==='engine'&&(x.relations.includes('SYNERGY')||x.relations.includes('ENABLE')||x.relations.includes('ENGINE')))x.score+=10;if(mode==='curve'&&Math.abs((+c.cmc||0)-(+x.card.cmc||0))<=1)x.score+=7;});
    base=base.filter(x=>x.score>=20&&x.why.length).sort((a,b)=>b.score-a.score).slice(0,220);
    let related=base.map(x=>enhanceCandidateV065(c,x)).filter(x=>x.score>=28).sort((a,b)=>b.score-a.score||b.rulePath.score-a.rulePath.score).slice(0,12);
    const roles=advisorRoleSummary(c,p),needs=advisorNeeds(c,p),weak=cardWeaknesses(c,p),verified=verifiedCasesForCardV053(c);
    $('advisorResult').innerHTML=`<div class="advisorHero"><div>${displayImg(c)?`<img class="advisorSeedImage" src="${displayImg(c)}" alt="${esc(displayName(c))}">`:''}</div><div><div class="dialogEyebrow">構築の中心カード</div><h2>${esc(displayName(c))}</h2>${englishSubName(c)}<div class="meta">${esc(displayType(c))} ・ MV ${c.cmc||0} ・ ${colors(c.color_identity||[])} ・ ${p.pace}</div><div class="advisorSummaryGrid"><section><h3>主な役割</h3>${roles.map(x=>`<div class="advisorPoint goodPoint">✓ ${esc(x)}</div>`).join('')}</section><section><h3>得意なこと</h3>${(p.strengths.length?p.strengths:['カード本文から明確な強みを追加解析中']).map(x=>`<div class="advisorPoint">${esc(x)}</div>`).join('')}</section><section><h3>必要な支援</h3>${needs.map(x=>`<div class="advisorPoint needPoint">□ ${esc(x)}</div>`).join('')}</section></div>${weak.length?`<div class="advisorWarning"><b>構築時の注意</b><ul class="explainList">${weak.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:''}</div></div>${verifiedSectionHTMLV053(c)}<section class="section"><div class="knowledgeHeader"><div><div class="dialogEyebrow">Rule Path Synergy Engine β-5</div><h2>理由付きおすすめカード</h2><p class="notice">効果タグに加えて、ルール上のイベント経路・状態接続・Verified事例を推薦順位へ反映します。</p></div><span class="knowledgeCount">${related.length}候補</span></div><div class="advisorCandidates">${related.length?related.map(advisorCandidateHTML).join(''):'<div class="empty">明確な効果接続を検出できませんでした。</div>'}</div></section>`;
    statusEl.textContent=`${pool.length.toLocaleString()}種類から「${displayName(c)}」をRule Path込みで解析しました。検証済み事例：${verified.length}件。`;
  }catch(error){console.error(error);statusEl.textContent='相談結果の作成中にエラーが発生しました：'+(error?.message||error);}
}
function rulePathModelV065(cards,profiles,ios,edges,links,verified,priorityModel){
  const edgeScore=edges.reduce((n,e)=>n+(+e.w||0),0),maxW=edges.length?Math.max(...edges.map(e=>+e.w||0)):0;
  const needed=Math.max(0,cards.length-1),connectedPairs=new Set(edges.map(e=>[e.from,e.to].sort().join('-'))).size;
  let score=verified?100:Math.min(94,Math.round(maxW*12+Math.min(28,edgeScore*4)+Math.min(18,links.length*5)));
  if(cards.length===1)score=Math.min(score,45);if(cards.length>1&&connectedPairs<needed&&!verified)score=Math.min(score,64);
  const status=verified?'Verified':cards.length>1&&connectedPairs>=needed&&score>=65?'Connected':edges.length||links.length?'Partial':'Unconfirmed';
  const steps=verified?.steps?.slice(0,8)||edges.sort((a,b)=>b.w-a.w).slice(0,8).map(e=>`${displayName(cards[e.from])} → ${displayName(cards[e.to])}：${e.label}`);
  const requirements=unique(profiles.flatMap(p=>[...(p.conditions||[]),...(p.costs||[])])).slice(0,8);
  const interruption=ruleInterruptionHintsV065(cards);if(priorityModel.windows.length)interruption.unshift(`優先権窓を${priorityModel.windows.length}箇所検出。相手が応答できる区間を個別確認してください。`);
  return {score,status,steps,requirements,interruption:unique(interruption).slice(0,6),connectedPairs,needed};
}
function rulePathPanelHTMLV065(model){
  const cls=model.status==='Verified'?'verified':model.status==='Connected'?'good':model.status==='Partial'?'warn':'weak';
  return `<section class="rulePathEngineV065"><div class="knowledgeHeader"><div><div class="dialogEyebrow">Rule Path Synergy Engine β-5</div><h2>シナジー成立経路</h2><p class="notice">Event Graph、状態接続、スタック、優先権をまとめ、カード間の「実際につながる経路」を評価します。</p></div><span class="rulePathScoreV065 ${cls}">${model.score}<small>/100</small></span></div><div class="rulePathStatusV065"><b>${esc(model.status)}</b><span>接続ペア ${model.connectedPairs}/${model.needed}</span></div><div class="rulePathColumnsV065"><section><h3>検出した経路</h3>${model.steps.length?`<ol>${model.steps.map(s=>`<li>${esc(s)}</li>`).join('')}</ol>`:'<div class="empty">現在の辞書では連続するルール経路を確認できませんでした。</div>'}</section><section><h3>成立条件・コスト</h3>${model.requirements.length?`<ul>${model.requirements.map(s=>`<li>${esc(s)}</li>`).join('')}</ul>`:'<div class="empty">追加条件を抽出できませんでした。</div>'}</section><section><h3>妨害・中断ポイント</h3>${model.interruption.length?`<ul>${model.interruption.map(s=>`<li>${esc(s)}</li>`).join('')}</ul>`:'<div class="empty">明確な中断ポイントを抽出できませんでした。</div>'}</section></div><div class="ruleDisclaimer"><b>β-5の意味：</b>この点数は勝率ではありません。ルール上の接続がどれだけ明示的かを示す「経路信頼度」です。実戦価値・必要枚数・引ける確率・マナ効率は今後のStrategy Engineで別評価します。</div></section>`;
}
async function analyzeRulesV065(){
  const statusEl=$('ruleStatus'),result=$('ruleResult');if(!statusEl||!result)return;if(!pool.length){statusEl.textContent='カードデータを取得しています。';await prepareDatabase(false);if(!pool.length){statusEl.textContent='カードデータを取得できませんでした。';return;}}
  const raw=['ruleCard1','ruleCard2','ruleCard3'].map(id=>$(id)?.value.trim()).filter(Boolean);if(!raw.length){statusEl.textContent='カードを1枚以上入力してください。';return;}
  const cards=[];for(const name of raw){const c=findPoolCard(name)||await named(name);if(c&&!cards.some(x=>x.oracle_id===c.oracle_id))cards.push(c);}if(!cards.length){statusEl.textContent='カードを特定できませんでした。';return;}
  const profiles=cards.map(parseRuleCardV060),verified=knownRuleCaseV060(cards),links=inferredRuleLinksV060(profiles),ios=cards.map((c,i)=>eventIOV061(c,profiles[i])),edges=graphEdgesV061(cards,profiles,ios);
  const order=$('ruleTriggerOrder')?.value||'input',stackSim=verifiedStackTraceV062(cards,verified)||genericStackTraceV062(cards,profiles,order),stateModel=verifiedStateModelV063(cards,verified)||genericStateModelV063(cards,profiles),priorityModel=priorityWindowsV064(cards,stackSim),pathModel=rulePathModelV065(cards,profiles,ios,edges,links,verified,priorityModel);
  const linksHTML=links.length?links.map(x=>`<article class="ruleLink"><div><b>${esc(displayName(cards[x.from]))}</b><span>→</span><b>${esc(displayName(cards[x.to]))}</b></div><strong>${esc(x.label)}</strong><p>${esc(x.reason)}</p><span class="ruleConfidence inferred">${x.confidence}</span></article>`).join(''):'<div class="empty">現在の辞書では明確な状態接続を検出できませんでした。</div>';
  result.innerHTML=`${verified?ruleSequenceHTMLV060(verified):''}${rulePathPanelHTMLV065(pathModel)}${stackTraceHTMLV062(stackSim)}${priorityHTMLV064(cards,priorityModel)}${stateEngineHTMLV063(stateModel)}${eventGraphHTMLV061(cards,ios,edges,!!verified)}<section class="section"><div class="knowledgeHeader"><div><h2>カード文章の構造化</h2><p class="notice">条件・コスト・イベント・状態の直接抽出結果です。</p></div><span class="knowledgeCount">${cards.length}枚</span></div><div class="ruleProfiles">${profiles.map(ruleProfileHTMLV060).join('')}</div></section><section class="section"><div class="knowledgeHeader"><div><h2>状態接続候補</h2><p class="notice">Rule Kernelの状態・条件接続も併記します。</p></div><span class="knowledgeCount">${links.length}件</span></div><div class="ruleLinks">${linksHTML}</div></section>`;
  statusEl.textContent=`${cards.length}枚を解析：Rule Path ${pathModel.score}/100（${pathModel.status}）、優先権窓${priorityModel.windows.length}件、スタック${stackSim.trace.length}段階、イベント接続${edges.length}件${verified?'、検証済み事例1件':''}。`;
}
function bindRuleEngineV065(){
  const btn=$('ruleAnalyzeBtn');if(btn){const fresh=btn.cloneNode(true);btn.replaceWith(fresh);fresh.onclick=analyzeRulesV065;}
  ['ruleCard1','ruleCard2','ruleCard3'].forEach(id=>{const el=$(id);if(!el)return;const fresh=el.cloneNode(true);fresh.value=el.value;el.replaceWith(fresh);fresh.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();e.stopPropagation();analyzeRulesV065();}});});
  const status=$('ruleStatus');if(status)status.textContent='Rule Engine β-5：カードを1～3枚入力してください。';
}
bindRuleEngineV065();

/* Strategy Value Engine beta-6 v0.6.6 */
function strategyModelV066(cards,pathModel,priorityModel,profiles,verified){
  const pieces=cards.length;
  const mana=cards.reduce((n,c)=>n+(Number(c.cmc)||0),0);
  const reqCount=unique(profiles.flatMap(p=>[...(p.conditions||[]),...(p.costs||[])])).length;
  const windows=priorityModel?.windows?.length||0;
  const setupPenalty=Math.max(0,(pieces-2)*10)+Math.min(18,reqCount*3);
  const manaPenalty=Math.min(24,Math.max(0,mana-4)*3);
  const interactionPenalty=Math.min(18,windows*3);
  let score=Math.round((pathModel?.score||0)*0.62+38-setupPenalty-manaPenalty-interactionPenalty);
  if(verified)score+=12;
  score=Math.max(0,Math.min(100,score));
  const grade=score>=80?'A':score>=65?'B':score>=50?'C':score>=35?'D':'E';
  const positives=[]; const risks=[];
  if((pathModel?.score||0)>=80)positives.push('ルール経路が明確');
  if(pieces<=2)positives.push('必要カード枚数が少ない');
  if(mana<=4)positives.push('カードの合計マナ総量が比較的軽い');
  if(verified)positives.push('検証済みシナジー事例');
  if(pieces>=3)risks.push(`${pieces}枚のカードを揃える必要があります。`);
  if(reqCount>=3)risks.push(`成立条件・コスト候補を${reqCount}件検出しています。`);
  if(mana>=7)risks.push(`カードの合計マナ総量が${mana}で、展開速度に負荷がかかる可能性があります。`);
  if(windows>=3)risks.push(`相手が応答できる優先権窓を${windows}箇所検出しています。`);
  if((pathModel?.status||'')==='Partial')risks.push('Rule Pathが部分接続のため、実際の成立条件を追加確認する必要があります。');
  return {score,grade,pieces,mana,reqCount,windows,positives:unique(positives),risks:unique(risks)};
}
function strategyPanelHTMLV066(m){
  return `<section class="strategyEngineV066"><div class="knowledgeHeader"><div><div class="dialogEyebrow">Strategy Value Engine β-6</div><h2>実戦成立性の一次評価</h2><p class="notice">Rule Pathとは別に、必要枚数・マナ負荷・条件数・相手の応答窓から「使いやすさ」を暫定評価します。</p></div><span class="strategyScoreV066">${m.score}<small>/100</small><b>${m.grade}</b></span></div><div class="strategyMetricsV066"><div><b>${m.pieces}</b><span>必要カード</span></div><div><b>${m.mana}</b><span>合計MV</span></div><div><b>${m.reqCount}</b><span>条件・コスト</span></div><div><b>${m.windows}</b><span>応答窓</span></div></div><div class="rulePathColumnsV065"><section><h3>プラス要因</h3>${m.positives.length?`<ul>${m.positives.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:'<div class="empty">明確な加点要因は未検出です。</div>'}</section><section><h3>実戦上の負荷</h3>${m.risks.length?`<ul>${m.risks.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:'<div class="empty">大きな負荷候補は未検出です。</div>'}</section></div><div class="ruleDisclaimer"><b>β-6の注意：</b>これは勝率予測ではありません。カードを引く確率、デッキ内枚数、実際のマナ基盤、メタゲーム、対戦データはまだ評価していません。</div></section>`;
}
const analyzeRulesV065Base=analyzeRulesV065;
analyzeRulesV065=async function(){
  await analyzeRulesV065Base();
  const result=$('ruleResult'); if(!result||!result.innerHTML||result.querySelector('.strategyEngineV066'))return;
  const raw=['ruleCard1','ruleCard2','ruleCard3'].map(id=>$(id)?.value.trim()).filter(Boolean); if(!raw.length)return;
  const cards=[]; for(const name of raw){const c=findPoolCard(name)||await named(name);if(c&&!cards.some(x=>x.oracle_id===c.oracle_id))cards.push(c);} if(!cards.length)return;
  const profiles=cards.map(parseRuleCardV060),verified=knownRuleCaseV060(cards),links=inferredRuleLinksV060(profiles),ios=cards.map((c,i)=>eventIOV061(c,profiles[i])),edges=graphEdgesV061(cards,profiles,ios);
  const stackSim=verifiedStackTraceV062(cards,verified)||genericStackTraceV062(cards,profiles,$('ruleTriggerOrder')?.value||'input');
  const priorityModel=priorityWindowsV064(cards,stackSim),pathModel=rulePathModelV065(cards,profiles,ios,edges,links,verified,priorityModel),strategy=strategyModelV066(cards,pathModel,priorityModel,profiles,verified);
  const path=result.querySelector('.rulePathEngineV065'); if(path)path.insertAdjacentHTML('afterend',strategyPanelHTMLV066(strategy)); else result.insertAdjacentHTML('afterbegin',strategyPanelHTMLV066(strategy));
  const st=$('ruleStatus'); if(st)st.textContent+=` Strategy ${strategy.score}/100（${strategy.grade}）。`;
};
function bindRuleEngineV066(){
 const btn=$('ruleAnalyzeBtn');if(btn){const fresh=btn.cloneNode(true);btn.replaceWith(fresh);fresh.onclick=analyzeRulesV065;}
 ['ruleCard1','ruleCard2','ruleCard3'].forEach(id=>{const el=$(id);if(!el)return;const fresh=el.cloneNode(true);fresh.value=el.value;el.replaceWith(fresh);fresh.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();e.stopPropagation();analyzeRulesV065();}});});
 const status=$('ruleStatus');if(status)status.textContent='Rule Engine β-6：カードを1～3枚入力してください。';
}
bindRuleEngineV066();

/* Consistency & Timing Engine beta-7a v0.6.7a */
function logChooseV067(n,k){
  if(k<0||k>n)return -Infinity;
  k=Math.min(k,n-k);let s=0;
  for(let i=1;i<=k;i++)s+=Math.log(n-k+i)-Math.log(i);
  return s;
}
function combinationRatioV067(n,k,N){
  if(k<0||k>N||n<k)return 0;
  if(n===N)return 1;
  return Math.exp(logChooseV067(n,k)-logChooseV067(N,k));
}
function allPiecesProbabilityV067(deckSize,copies,seen){
  const N=Math.max(0,Math.floor(deckSize)),n=Math.max(0,Math.min(N,Math.floor(seen)));
  if(!N||!copies.length||copies.some(x=>x<=0))return 0;
  let p=0,limit=1<<copies.length;
  for(let mask=0;mask<limit;mask++){
    let removed=0,bits=0;
    for(let i=0;i<copies.length;i++)if(mask&(1<<i)){removed+=copies[i];bits++;}
    const ratio=combinationRatioV067(N-removed,n,N);
    p+=(bits%2?-1:1)*ratio;
  }
  return Math.max(0,Math.min(1,p));
}
function hypergeomAtLeastV067(N,K,n,minK){
  N=Math.floor(N);K=Math.max(0,Math.min(N,Math.floor(K)));n=Math.max(0,Math.min(N,Math.floor(n)));minK=Math.max(0,Math.floor(minK));
  if(minK<=0)return 1;if(K<minK||n<minK)return 0;
  const den=logChooseV067(N,n);let p=0,maxK=Math.min(K,n);
  for(let k=minK;k<=maxK;k++){
    const other=n-k;if(other<0||other>N-K)continue;
    p+=Math.exp(logChooseV067(K,k)+logChooseV067(N-K,other)-den);
  }
  return Math.max(0,Math.min(1,p));
}
function cardsSeenByTurnV067(turn,onDraw){return Math.max(0,7+Math.max(0,turn-(onDraw?0:1)));}
function rawDeckContextV067(cards){
  const useDeck=$('ruleUseDeckContext')?.checked!==false;
  const sourceText=useDeck?String($('deckInput')?.value||''):'';
  const parsed=useDeck?parseDeck(sourceText).filter(x=>!x.side):[];
  const hasDeck=parsed.length>0;
  const deckSize=hasDeck?parsed.reduce((s,x)=>s+(+x.qty||0),0):60;
  const entries=parsed.map(x=>({...x,card:findPoolCard(x.name)||null}));
  const copies=cards.map(card=>{
    if(!hasDeck)return 4;
    return entries.reduce((sum,e)=>sum+(entryMatchesCardV055(e,card)?(+e.qty||0):0),0);
  });
  const missing=cards.filter((c,i)=>copies[i]===0).map(displayName);
  const lands=hasDeck?entries.filter(e=>e.card&&/\bLand\b/i.test(type(e.card))).reduce((s,e)=>s+e.qty,0):24;
  return {useDeck,hasDeck,source:hasDeck?'現在のデッキ入力':'60枚・各4枚の仮定',deckSize,copies,entries,missing,lands};
}
function manaCostForCardV067(card){
  if(card?.mana_cost)return String(card.mana_cost);
  const faces=typeof cardFaces==='function'?cardFaces(card):[];
  return String(faces?.find(f=>f?.mana_cost)?.mana_cost||'');
}
function coloredPipsV067(cards){
  const req={W:0,U:0,B:0,R:0,G:0};let hybrid=0;
  for(const c of cards){
    const cost=manaCostForCardV067(c);
    for(const m of cost.matchAll(/\{([^}]+)\}/g)){
      const sym=m[1].toUpperCase();
      if(/^[WUBRG]$/.test(sym))req[sym]++;
      else if(/[WUBRG].*\//.test(sym)||/\/[WUBRG]/.test(sym))hybrid++;
    }
  }
  return {req,hybrid};
}
function producedColorsV067(card){
  let a=Array.isArray(card?.produced_mana)?card.produced_mana.filter(x=>'WUBRG'.includes(x)):[];
  if(a.length)return unique(a);
  const tl=type(card||{});
  if(/\bPlains\b/i.test(tl))a.push('W');if(/\bIsland\b/i.test(tl))a.push('U');if(/\bSwamp\b/i.test(tl))a.push('B');if(/\bMountain\b/i.test(tl))a.push('R');if(/\bForest\b/i.test(tl))a.push('G');
  if(!a.length&&/\bLand\b/i.test(tl))a.push(...(card?.color_identity||[]).filter(x=>'WUBRG'.includes(x)));
  return unique(a);
}
function colorDifficultyV067(cards,ctx){
  const {req,hybrid}=coloredPipsV067(cards),sources={W:0,U:0,B:0,R:0,G:0};
  if(ctx.hasDeck){
    for(const e of ctx.entries){
      if(!e.card)continue;
      const p=knowledgeProfile(e.card),isMana=/\bLand\b/i.test(type(e.card))||p.tags.includes('mana_add');
      if(!isMana)continue;
      for(const col of producedColorsV067(e.card))sources[col]+=e.qty;
    }
  }
  const active=Object.entries(req).filter(([,n])=>n>0);
  if(!active.length)return {level:'低',penalty:0,req,sources,hybrid,detail:'固定色シンボルなし'};
  if(!ctx.hasDeck)return {level:'未評価',penalty:0,req,sources,hybrid,detail:'デッキ入力がないため色源数は未評価'};
  let worst=0,details=[];
  for(const [col,pips] of active){
    const src=sources[col]||0,scale=Math.max(.5,ctx.deckSize/60),need=(pips>=3?15:pips===2?12:8)*scale;
    let severity=src<=0?3:src<need*.7?3:src<need?2:src<need+3*scale?1:0;
    worst=Math.max(worst,severity);details.push(`${col}:${src}源/${pips}シンボル`);
  }
  const levels=['低','低～中','中','高'];
  return {level:levels[worst],penalty:[0,3,8,16][worst],req,sources,hybrid,detail:details.join('・')};
}
function accessSupportV067(ctx,cards){
  if(!ctx.hasDeck)return {draw:0,tutor:0,impulse:0,mill:0,bonus:0,total:0,graveRelevant:false};
  let draw=0,tutor=0,impulse=0,mill=0;
  for(const e of ctx.entries){
    if(!e.card)continue;const tags=knowledgeProfile(e.card).tags;
    if(tags.includes('draw_cards'))draw+=e.qty;if(tags.includes('tutor'))tutor+=e.qty;if(tags.includes('impulse'))impulse+=e.qty;if(tags.includes('mill'))mill+=e.qty;
  }
  const graveRelevant=cards.some(c=>/graveyard|墓地/i.test(ruleTextV060(c)||''));
  const bonus=Math.min(12,draw*.35+tutor*1.2+impulse*.35+(graveRelevant?mill*.25:0));
  return {draw,tutor,impulse,mill,bonus,total:draw+tutor+impulse+(graveRelevant?mill:0),graveRelevant};
}
function standaloneRiskV067(cards){
  const payoff=new Set(['token_buff','artifact_sac','creature_sac','death_trigger','counter_use','grave_cast','reanimate','grave_value','life_payoff','spell_payoff','artifact_payoff','enchant_payoff','landfall']);
  const enabling=new Set(['treasure_make','creature_token_make','counter_plus','counter_any','mill','discard','draw_cards','impulse','tutor','mana_add','single_removal','protection','evasion','direct_damage']);
  let points=0,names=[];
  for(const c of cards){
    const p=knowledgeProfile(c),pay=p.tags.filter(t=>payoff.has(t)).length,en=p.tags.filter(t=>enabling.has(t)).length;
    let r=0;if(pay>0&&en===0)r+=2;if((p.needs||[]).length>=2)r++;if((+c.cmc||0)>=5&&pay>0)r++;
    if(r>=2)names.push(displayName(c));points+=r;
  }
  const avg=cards.length?points/cards.length:0,level=avg>=2?'高':avg>=1?'中':'低';
  return {level,penalty:level==='高'?10:level==='中'?5:0,names};
}
/* v0.6.7a: timing must follow the actual Rule Path, not simply sum printed mana values. */
function knownManaPlanV067a(cards){
  const names=cards.flatMap(c=>cardNameVariantsV053(c).map(normalizeCardNameV053));
  const has=s=>names.some(n=>n.includes(normalizeCardNameV053(s)));
  const printedTotal=cards.reduce((n,c)=>n+Math.max(0,Math.ceil(+c.cmc||0)),0);
  const maxCost=Math.max(0,...cards.map(c=>Math.max(0,Math.ceil(+c.cmc||0))));
  if(has('Moonshadow')&&has('Bloodthorn Flail')&&has('Flamewake Phoenix'))return {
    turn:2,total:3,printedTotal,maxCost,landNeed:2,source:'verified_rule_path',
    label:'Verified Rule Path',
    plan:[
      '1T：月影を{B}で唱える。',
      '2T：血茨のフレイルを{B}で唱える。',
      '装備はマナではなく炎跡のフェニックスを捨てる代替コストを選ぶ。',
      '戦闘開始時、パワー4以上を満たしたフェニックスの誘発で{R}を支払う。'
    ]
  };
  if(has('Badgermole Cub')&&has('Fabled Passage'))return {
    turn:3,total:2,printedTotal,maxCost,landNeed:3,source:'verified_rule_path',
    label:'Verified Rule Path',
    plan:[
      '1T：マナを出せる土地を置く。',
      '2T：寓話の小道を置いて戦場に残す。',
      '3T：別のマナ源を置き、{1}{G}でアナグマモグラの仔を唱える。',
      '土の技1の解決後、寓話の小道を生け贄にして既知のRule Pathへ入る。'
    ]
  };
  return null;
}
function theoreticalManaTurnV067(cards){
  const known=knownManaPlanV067a(cards);if(known)return known;
  const costs=cards.map(c=>Math.max(0,Math.ceil(+c.cmc||0))),printedTotal=costs.reduce((a,b)=>a+b,0),maxCost=Math.max(0,...costs);
  for(let t=1;t<=10;t++)if(t>=maxCost&&t*(t+1)/2>=printedTotal)return {turn:t,total:printedTotal,printedTotal,maxCost,landNeed:t,source:'printed_mv_fallback',label:'印刷MVベース（暫定）',plan:[]};
  return {turn:10,total:printedTotal,printedTotal,maxCost,landNeed:10,source:'printed_mv_fallback',label:'印刷MVベース（暫定）',plan:[]};
}
function reachLabelV067(p){const n=p*100;return n>=55?'高':n>=30?'中':n>=15?'低～中':'低';}
function consistencyModelV067(cards,strategy){
  const ctx=rawDeckContextV067(cards),onDraw=($('rulePlayDraw')?.value||'play')==='draw';
  const probs={};for(const t of [3,4,5,6])probs[t]=allPiecesProbabilityV067(ctx.deckSize,ctx.copies,cardsSeenByTurnV067(t,onDraw));
  const mana=theoreticalManaTurnV067(cards),manaSeen=cardsSeenByTurnV067(mana.turn,onDraw),landNeed=mana.total>0?(mana.landNeed??mana.turn):0,landReady=ctx.hasDeck?hypergeomAtLeastV067(ctx.deckSize,ctx.lands,manaSeen,landNeed):null;
  const color=colorDifficultyV067(cards,ctx),access=accessSupportV067(ctx,cards),standalone=standaloneRiskV067(cards);
  const p4=probs[4]*100,p5=probs[5]*100;
  let score=25+p4*.22+p5*.58+access.bonus-color.penalty-standalone.penalty-Math.max(0,mana.turn-4)*5;
  if(ctx.hasDeck&&ctx.missing.length)score=Math.min(score,12);
  if(strategy?.score>=75)score+=4;else if(strategy?.score<40)score-=4;
  if(landReady!=null)score+=(landReady*100-65)*.08;
  score=Math.max(0,Math.min(100,Math.round(score)));
  const grade=score>=80?'A':score>=65?'B':score>=50?'C':score>=35?'D':'E';
  let turn25=null;for(let t=Math.max(1,mana.turn);t<=8;t++){const p=allPiecesProbabilityV067(ctx.deckSize,ctx.copies,cardsSeenByTurnV067(t,onDraw));if(p>=.25){turn25=t;break;}}
  const timing=ctx.hasDeck&&ctx.missing.length?'成立不可（未採用パーツあり）':turn25?`${turn25}T前後から現実的`:`${mana.turn}T以降・低再現性`;
  return {score,grade,ctx,onDraw,probs,mana,landReady,color,access,standalone,timing,reach4:reachLabelV067(probs[4])};
}
function pctV067(p){return `${(Math.max(0,Math.min(1,p))*100).toFixed(1)}%`;}
function consistencyPanelHTMLV067(m){
  const copyRows=m.ctx.copies.map((n,i)=>`<li><b>${esc(String(i+1))}</b> ${esc(n+'枚採用')}</li>`).join('');
  const missing=m.ctx.missing.length?`<div class="consistencyWarningV067"><b>未採用パーツ：</b>${m.ctx.missing.map(esc).join('／')}</div>`:'';
  const landText=m.landReady==null?'未評価':pctV067(m.landReady);
  const accessBits=[];if(m.access.draw)accessBits.push(`ドロー${m.access.draw}枚`);if(m.access.tutor)accessBits.push(`サーチ${m.access.tutor}枚`);if(m.access.impulse)accessBits.push(`衝動的ドロー${m.access.impulse}枚`);if(m.access.graveRelevant&&m.access.mill)accessBits.push(`切削${m.access.mill}枚`);
  return `<section class="consistencyEngineV067"><div class="knowledgeHeader"><div><div class="dialogEyebrow">Consistency & Timing Engine β-7</div><h2>再現性・成立ターン評価</h2><p class="notice">現在のデッキ採用枚数から自然ドロー確率を計算し、マナ・色拘束・アクセス補助・単体依存度を別々に評価します。</p></div><span class="consistencyScoreV067">${m.score}<small>/100</small><b>${m.grade}</b></span></div>${missing}<div class="consistencyContextV067"><b>${esc(m.ctx.source)}</b><span>${m.ctx.deckSize}枚デッキ</span><span>${m.onDraw?'後攻':'先攻'}</span><span>${esc(m.timing)}</span></div><div class="consistencyMetricsV067"><div><b>${pctV067(m.probs[3])}</b><span>3T自然到達</span></div><div><b>${pctV067(m.probs[4])}</b><span>4T自然到達</span></div><div><b>${pctV067(m.probs[5])}</b><span>5T自然到達</span></div><div><b>${m.mana.turn}T</b><span>マナ上の理論最速</span></div><div><b>${landText}</b><span>最速時の土地到達</span></div><div><b>${esc(m.color.level)}</b><span>色マナ難度</span></div></div><div class="rulePathColumnsV065"><section><h3>必要パーツ採用枚数</h3><ul class="consistencyCopiesV067">${copyRows}</ul><p class="tiny">4Tまでの自然到達性：${esc(m.reach4)}</p></section><section><h3>アクセス補助</h3>${accessBits.length?`<ul>${accessBits.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:'<div class="empty">明確なドロー・サーチ補助を集計できませんでした。</div>'}<p class="tiny">補助手段はConsistency点への定性的補正のみ。上の自然到達率には加算していません。</p></section><section><h3>マナ・単体依存</h3><ul><li>印刷MV合計：${m.mana.printedTotal??m.mana.total}</li><li>経路上の実支払い目安：${m.mana.total}</li><li>最速判定：${esc(m.mana.label||'暫定')}</li><li>色源：${esc(m.color.detail)}</li><li>単体依存度：${esc(m.standalone.level)}${m.standalone.names.length?`（${m.standalone.names.map(esc).join('／')}）`:''}</li></ul>${m.mana.plan?.length?`<div class="manaPlanV067a"><b>最速経路</b><ol>${m.mana.plan.map(x=>`<li>${esc(x)}</li>`).join('')}</ol></div>`:''}</section></div><div class="ruleDisclaimer"><b>β-7の注意：</b>自然到達率は初手7枚からの通常ドローだけを用いた超幾何分布ベースの値で、マリガン、追加ドロー、サーチ、切削、占術、相手の妨害は含みません。「マナ上の理論最速」は各ターンに土地を置ける前提の楽観的な下限です。勝率ではありません。</div></section>`;
}
const analyzeRulesV066Base=analyzeRulesV065;
analyzeRulesV065=async function(){
  await analyzeRulesV066Base();
  const result=$('ruleResult');if(!result||!result.innerHTML||result.querySelector('.consistencyEngineV067'))return;
  const raw=['ruleCard1','ruleCard2','ruleCard3'].map(id=>$(id)?.value.trim()).filter(Boolean);if(!raw.length)return;
  const cards=[];for(const name of raw){const c=findPoolCard(name)||await named(name);if(c&&!cards.some(x=>x.oracle_id===c.oracle_id))cards.push(c);}if(!cards.length)return;
  const profiles=cards.map(parseRuleCardV060),verified=knownRuleCaseV060(cards),links=inferredRuleLinksV060(profiles),ios=cards.map((c,i)=>eventIOV061(c,profiles[i])),edges=graphEdgesV061(cards,profiles,ios);
  const stackSim=verifiedStackTraceV062(cards,verified)||genericStackTraceV062(cards,profiles,$('ruleTriggerOrder')?.value||'input'),priorityModel=priorityWindowsV064(cards,stackSim),pathModel=rulePathModelV065(cards,profiles,ios,edges,links,verified,priorityModel),strategy=strategyModelV066(cards,pathModel,priorityModel,profiles,verified),consistency=consistencyModelV067(cards,strategy);
  const strategyEl=result.querySelector('.strategyEngineV066'),pathEl=result.querySelector('.rulePathEngineV065');
  if(strategyEl)strategyEl.insertAdjacentHTML('afterend',consistencyPanelHTMLV067(consistency));else if(pathEl)pathEl.insertAdjacentHTML('afterend',consistencyPanelHTMLV067(consistency));else result.insertAdjacentHTML('afterbegin',consistencyPanelHTMLV067(consistency));
  const st=$('ruleStatus');if(st)st.textContent+=` Consistency ${consistency.score}/100（${consistency.grade}）、4T自然到達${pctV067(consistency.probs[4])}。`;
};
function bindRuleEngineV067(){
  const btn=$('ruleAnalyzeBtn');if(btn){const fresh=btn.cloneNode(true);btn.replaceWith(fresh);fresh.onclick=analyzeRulesV065;}
  ['ruleCard1','ruleCard2','ruleCard3'].forEach(id=>{const el=$(id);if(!el)return;const fresh=el.cloneNode(true);fresh.value=el.value;el.replaceWith(fresh);fresh.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();e.stopPropagation();analyzeRulesV065();}});});
  const clear=$('ruleClearBtn');if(clear){const freshClear=clear.cloneNode(true);clear.replaceWith(freshClear);freshClear.onclick=()=>{['ruleCard1','ruleCard2','ruleCard3'].forEach(id=>{const el=$(id);if(el)el.value='';});const r=$('ruleResult');if(r)r.innerHTML='<div class="empty">左でカードを選ぶと、Rule Engine β-7でRule Path・Strategy・Consistencyまで統合表示します。</div>';const st=$('ruleStatus');if(st)st.textContent='Rule Engine β-7：カードを1～3枚入力してください。';};}
  const status=$('ruleStatus');if(status)status.textContent='Rule Engine β-7：カードを1～3枚入力してください。';
}
bindRuleEngineV067();

/* Game Plan Engine beta-8 v0.6.8 */
const GAME_PLAN_ROLE_DEFS_V068={
  FINISHER:{label:'フィニッシャー',order:6},ENGINE:{label:'主エンジン',order:5},PAYOFF:{label:'利益変換',order:4},ENABLER:{label:'成立支援',order:3},INTERACTION:{label:'妨害',order:2},SUPPORT:{label:'安定化支援',order:1},THREAT:{label:'盤面要員',order:1},FLEX:{label:'補助要員',order:0}
};
const GP_FINISH_TAGS_V068=new Set(['evasion','direct_damage','alternate_win','go_wide','go_tall']);
const GP_SUPPORT_TAGS_V068=new Set(['draw_cards','impulse','tutor','mana_add','extra_land','protection']);
const GP_INTERACTION_TAGS_V068=new Set(['single_removal','board_wipe','counterspell','bounce']);
const GP_PRODUCER_TAGS_V068=new Set(['treasure_make','food_make','clue_make','creature_token_make','counter_plus','counter_any','mill','discard','life_gain','extra_land']);
const GP_PAYOFF_TAGS_V068=new Set(['token_double','token_buff','artifact_sac','creature_sac','death_trigger','counter_use','grave_cast','reanimate','grave_value','landfall','life_payoff','spell_payoff','etb','attack','combat_damage']);
function gpClampV068(n,min=0,max=100){return Math.max(min,Math.min(max,n));}
function gpGradeV068(score){return score>=80?'A':score>=65?'B':score>=50?'C':score>=35?'D':'E';}
function gpTagLabelsV068(tags){return unique(tags.map(t=>KNOWLEDGE_TAGS[t]?.label||t));}
function gamePlanRoleV068(card){
  const p=knowledgeProfile(card),tags=p.tags||[],has=t=>tags.some(x=>t.has(x));
  const producer=has(GP_PRODUCER_TAGS_V068),payoff=has(GP_PAYOFF_TAGS_V068),finish=has(GP_FINISH_TAGS_V068),support=has(GP_SUPPORT_TAGS_V068),interaction=has(GP_INTERACTION_TAGS_V068);
  let primary='FLEX';
  if(finish)primary='FINISHER';else if(producer&&payoff)primary='ENGINE';else if(payoff)primary='PAYOFF';else if(producer)primary='ENABLER';else if(interaction)primary='INTERACTION';else if(support)primary='SUPPORT';else if(/Creature/i.test(type(card)))primary='THREAT';
  const mv=+card.cmc||0,phase=mv<=2?'序盤':mv<=4?'中盤':'終盤';
  let standalone=42,reasons=[];
  const directUtility=tags.filter(t=>GP_SUPPORT_TAGS_V068.has(t)||GP_INTERACTION_TAGS_V068.has(t)).length;
  standalone+=Math.min(24,directUtility*7);
  if(finish){standalone+=8;reasons.push('単体でも勝ち筋へ寄与');}
  if(producer&&payoff){standalone+=12;reasons.push('自身で供給と利用を兼ねる');}
  if(producer&&!payoff){standalone+=5;reasons.push('後続へ資源を供給できる');}
  if(payoff&&!producer){standalone-=12;reasons.push('他カードの供給・条件に依存');}
  if(interaction){standalone+=8;reasons.push('単体で相手へ干渉できる');}
  if(support){standalone+=5;reasons.push('単体で安定化へ寄与');}
  if(/Creature/i.test(type(card)))standalone+=4;
  if(mv>=6)standalone-=7;
  if(/if you control|if there (?:is|are)|cards? in your graveyard|for each .* you control/i.test(ruleTextV060(card)||'')){standalone-=5;reasons.push('盤面・墓地などの前提条件あり');}
  standalone=gpClampV068(Math.round(standalone));
  const standaloneLevel=standalone>=70?'高':standalone>=50?'中':'低';
  return {primary,label:GAME_PLAN_ROLE_DEFS_V068[primary].label,phase,tags,producer,payoff,finish,support,interaction,standalone,standaloneLevel,reasons:unique(reasons)};
}
function gamePlanDeckContextV068(cards){
  const ctx=rawDeckContextV067(cards),entries=ctx.entries.filter(e=>e.card),profile=ctx.hasDeck?deckKnowledgeProfileV054(entries):null;
  const roleCounts={},phaseCounts={序盤:0,中盤:0,終盤:0};
  for(const e of entries){const r=gamePlanRoleV068(e.card),q=Math.max(1,+e.qty||1);roleCounts[r.primary]=(roleCounts[r.primary]||0)+q;phaseCounts[r.phase]=(phaseCounts[r.phase]||0)+q;}
  const winEntries=entries.filter(e=>gamePlanRoleV068(e.card).finish).sort((a,b)=>(+a.card.cmc||0)-(+b.card.cmc||0));
  return {...ctx,entries,profile,roleCounts,phaseCounts,winEntries};
}
function gamePlanRedundancyV068(cards,deckCtx){
  return cards.map(c=>{
    const role=gamePlanRoleV068(c),copies=deckCtx.hasDeck?deckCtx.entries.reduce((s,e)=>s+(entryMatchesCardV055(e,c)?(+e.qty||0):0),0):0;
    const roleTotal=deckCtx.roleCounts[role.primary]||0,alternatives=Math.max(0,roleTotal-copies);
    const level=!deckCtx.hasDeck?'未評価':alternatives>=8?'高':alternatives>=4?'中':'低';
    return {card:c,role,copies,alternatives,level};
  });
}
function gamePlanWinPathV068(cards,pathModel,deckCtx){
  const direct=cards.filter(c=>gamePlanRoleV068(c).finish);
  const pathSteps=(pathModel?.steps||[]).slice(0,4);
  if(direct.length){
    const end=direct.map(c=>`${displayName(c)}：${gpTagLabelsV068(gamePlanRoleV068(c).tags.filter(t=>GP_FINISH_TAGS_V068.has(t))).join('・')||'勝ち筋'}`).join('／');
    return {kind:'Direct',label:'直接勝ち筋へ接続',steps:[...pathSteps,`→ ${end}`].slice(0,5),confidence:pathModel?.status==='Verified'?'Verified':'Parsed / Inferred'};
  }
  if(deckCtx.hasDeck&&deckCtx.winEntries.length){
    const finishers=deckCtx.winEntries.slice(0,2).map(e=>`${displayName(e.card)}×${e.qty}`).join('／');
    return {kind:'Indirect',label:'デッキ内フィニッシャーへ接続',steps:[...pathSteps.slice(0,3),'→ このシナジーで盤面・資源優位を作る',`→ ${finishers}へ引き継いで勝ち筋へ`].slice(0,5),confidence:'Inferred'};
  }
  return {kind:'Open',label:'勝ち筋への終端未検出',steps:[...pathSteps.slice(0,3),'→ 最終的にゲームを終わらせるカード／経路が別途必要'].slice(0,4),confidence:'Incomplete'};
}
function gamePlanModelV068(cards,pathModel,strategy,consistency){
  const deckCtx=gamePlanDeckContextV068(cards),roles=cards.map(gamePlanRoleV068),redundancy=gamePlanRedundancyV068(cards,deckCtx),combinedTags=unique(roles.flatMap(r=>r.tags));
  const internalConnections=TAG_CONNECTIONS.filter(([from,to])=>combinedTags.includes(from)&&combinedTags.includes(to));
  const deckConnections=deckCtx.profile?(deckCtx.profile.connections||[]).slice(0,5).filter(x=>combinedTags.includes(x.from)||combinedTags.includes(x.to)):[];
  const winPath=gamePlanWinPathV068(cards,pathModel,deckCtx),standaloneAvg=Math.round(roles.reduce((s,r)=>s+r.standalone,0)/Math.max(1,roles.length));
  const uniqueRoles=unique(roles.map(r=>r.primary)),phases=unique(roles.map(r=>r.phase));
  const uniqueContribution=redundancy.filter(x=>x.level==='低').length;
  const highRedundancy=redundancy.filter(x=>x.level==='高').length;
  let score=18;
  score+=Math.min(24,internalConnections.length*12);
  score+=Math.min(14,deckConnections.length*5);
  score+=winPath.kind==='Direct'?24:winPath.kind==='Indirect'?14:0;
  score+=Math.min(14,uniqueContribution*6);
  score+=Math.round((standaloneAvg-40)*.22);
  score+=Math.min(8,phases.length*3);
  score+=Math.round((pathModel?.score||0)*.08);
  score-=highRedundancy*7;
  if(winPath.kind==='Open')score-=8;
  if(deckCtx.hasDeck&&deckCtx.missing.length)score-=15;
  score=gpClampV068(Math.round(score));
  const grade=gpGradeV068(score);
  const strongButOptional=(pathModel?.score||0)>=70&&deckCtx.hasDeck&&winPath.kind!=='Direct'&&highRedundancy>0&&deckConnections.length===0;
  let verdict=score>=78?'主ゲームプラン候補':score>=62?'ゲームプランに適合':score>=45?'補助プランとして有効':'優先度は低め';
  if(strongButOptional)verdict='強いシナジーだが、このデッキでは優先度低め';
  const stage={
    early:roles.filter(r=>r.phase==='序盤').map(r=>`${r.label}：${displayName(cards[roles.indexOf(r)])}`),
    mid:roles.filter(r=>r.phase==='中盤').map(r=>`${r.label}：${displayName(cards[roles.indexOf(r)])}`),
    late:roles.filter(r=>r.phase==='終盤').map(r=>`${r.label}：${displayName(cards[roles.indexOf(r)])}`)
  };
  const reasons=[];
  if(internalConnections.length)reasons.push(`組み合わせ内部で${internalConnections.length}本の供給→利用接続を形成`);
  if(deckConnections.length)reasons.push(`現在のデッキ主要接続に${deckConnections.length}箇所参加`);
  if(winPath.kind==='Direct')reasons.push('組み合わせ自身が勝ち筋まで持つ');
  else if(winPath.kind==='Indirect')reasons.push('デッキ内の既存フィニッシャーへ価値を引き継げる');
  if(uniqueContribution)reasons.push(`${uniqueContribution}枚がデッキ内で代替の少ない役割を担当`);
  const concerns=[];
  if(highRedundancy)concerns.push(`${highRedundancy}枚は同役割の代替が多く、役割重複が大きい`);
  if(standaloneAvg<50)concerns.push('パーツ単体価値が低く、シナジー不成立時の手札負担が大きい');
  if(winPath.kind==='Open')concerns.push('この組み合わせだけでは勝ち筋の終端を確認できない');
  if(strongButOptional)concerns.push('Rule Pathは強い一方、現在のデッキ構造では追加採用の必然性が弱い');
  return {score,grade,verdict,strongButOptional,deckCtx,roles,redundancy,internalConnections,deckConnections,winPath,standaloneAvg,uniqueRoles,phases,stage,reasons:unique(reasons),concerns:unique(concerns),strategyScore:strategy?.score??null,consistencyScore:consistency?.score??null};
}
function gamePlanPanelHTMLV068(m,cards){
  const stageBox=(title,items,fallback)=>`<article><b>${title}</b>${items.length?`<ul>${items.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:`<p>${esc(fallback)}</p>`}</article>`;
  const roleRows=m.roles.map((r,i)=>`<div class="gpRoleRowV068"><div><b>${esc(displayName(cards[i]))}</b><span>${esc(r.label)}・${esc(r.phase)}</span></div><strong>${r.standalone}</strong><small>単体価値 ${esc(r.standaloneLevel)}</small></div>`).join('');
  const redRows=m.redundancy.map(x=>`<li><b>${esc(displayName(x.card))}</b>：${esc(x.role.label)}／代替${x.level==='未評価'?'未評価':x.alternatives+'枚'}${x.level!=='未評価'?`（重複 ${esc(x.level)}）`:''}</li>`).join('');
  const plan=m.deckCtx.profile?.plan||'デッキ未入力：組み合わせ単体で評価';
  return `<section class="gamePlanEngineV068"><div class="knowledgeHeader"><div><div class="dialogEyebrow">Game Plan Engine β-8</div><h2>デッキ全体への貢献度</h2><p class="notice">「成立するか」ではなく、この組み合わせが序盤・中盤・終盤のどこを担当し、最終的な勝ち筋までどう寄与するかを評価します。</p></div><span class="gamePlanScoreV068">${m.score}<small>/100</small><b>${m.grade}</b></span></div><div class="gpVerdictV068 ${m.strongButOptional?'optional':''}"><b>${esc(m.verdict)}</b><span>推定ゲームプラン：${esc(plan)}</span></div><div class="gpStageGridV068">${stageBox('序盤',m.stage.early,'この組み合わせ単体では序盤担当を検出せず')}${stageBox('中盤',m.stage.mid,'中盤は既存デッキへ依存')}${stageBox('終盤',m.stage.late,m.winPath.kind==='Open'?'別途フィニッシャーが必要':'既存の勝ち筋へ接続')}</div><div class="gpMainGridV068"><section><h3>各カードの役割 / 単体価値</h3><div class="gpRoleListV068">${roleRows}</div></section><section><h3>役割重複</h3>${m.deckCtx.hasDeck?`<ul>${redRows}</ul>`:'<div class="empty">デッキ入力がないため役割重複は未評価です。</div>'}<p class="tiny">同じ役割のカードが多いほど、「強いがこのデッキには不要」の候補として減点します。</p></section><section><h3>勝ち筋までの経路</h3><div class="gpWinHeadV068"><b>${esc(m.winPath.label)}</b><span>${esc(m.winPath.confidence)}</span></div><ol>${m.winPath.steps.map(x=>`<li>${esc(x)}</li>`).join('')}</ol></section></div><div class="rulePathColumnsV065"><section><h3>採用する理由</h3>${m.reasons.length?`<ul>${m.reasons.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:'<div class="empty">明確なゲームプラン上の加点要因は未検出です。</div>'}</section><section><h3>採用を見送る理由</h3>${m.concerns.length?`<ul>${m.concerns.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:'<div class="empty">大きな役割競合は検出されませんでした。</div>'}</section></div><div class="ruleDisclaimer"><b>β-8の注意：</b>Game Plan scoreは勝率ではありません。現在の効果タグ、デッキ内役割、Rule Path、単体依存度から「デッキの勝ち方への寄与」を評価する一次モデルです。戦闘盤面、対戦相手、メタゲーム、サイドボード後の価値はまだ含みません。</div></section>`;
}
function pairGamePlanFitV068(seed,candidate,rp){
  const a=gamePlanRoleV068(seed),b=gamePlanRoleV068(candidate),tags=unique([...a.tags,...b.tags]);
  const connections=TAG_CONNECTIONS.filter(([from,to])=>tags.includes(from)&&tags.includes(to));
  const complement=a.primary!==b.primary,finisher=a.finish||b.finish,standalone=Math.round((a.standalone+b.standalone)/2);
  let score=22+Math.round((rp?.score||0)*.28)+Math.min(24,connections.length*12)+(complement?10:2)+(finisher?10:0)+Math.round((standalone-45)*.18);
  if(a.primary===b.primary&&['SUPPORT','INTERACTION','THREAT'].includes(a.primary))score-=8;
  score=gpClampV068(Math.round(score));
  const bonus=score>=78?10:score>=65?6:score>=50?2:score<35?-10:score<45?-5:0;
  const verdict=score>=78?'勝ち筋・エンジンへ強く寄与':score>=65?'ゲームプランに適合':score>=50?'補助的に適合':score>=35?'用途限定':'プラン接続が弱い';
  return {score,grade:gpGradeV068(score),bonus,verdict,roles:[a,b],connections,standalone};
}
function gamePlanMiniHTMLV068(m){
  if(!m)return '';
  const cls=m.score>=65?'good':m.score>=45?'warn':'weak';
  return `<div class="gamePlanMiniV068 ${cls}"><b>Game Plan ${m.score}/100</b><span>${esc(m.verdict)}</span></div>`;
}
const enhanceCandidateV065BaseV068=enhanceCandidateV065;
enhanceCandidateV065=function(seed,x){
  const y=enhanceCandidateV065BaseV068(seed,x),gp=pairGamePlanFitV068(seed,y.card,y.rulePath);y.gamePlan=gp;y.score=gpClampV068(Math.round(y.score+gp.bonus));
  if(gp.score>=65)y.why=unique([...(y.why||[]),`ゲームプラン適合：${gp.verdict}`]).slice(0,7);
  else if(gp.score<45)y.cautions=unique([...(y.cautions||[]),'Rule Pathとは別に、勝ち筋・役割面の接続が弱い']);
  return y;
};
candidateResultHTMLV053=function(x){
  return `<article class="result"><button class="imageButton" data-detail="${esc(x.card.name)}">${displayImg(x.card)?`<img loading="lazy" src="${displayImg(x.card)}" alt="${esc(displayName(x.card))}">`:''}</button><div><h3><button class="textButton" data-detail="${esc(x.card.name)}">${esc(displayName(x.card))}</button></h3>${englishSubName(x.card)}<div class="meta">${esc(displayType(x.card))} ・ MV ${x.card.cmc||0} ・ ${colors(x.card.color_identity||[])}</div><div class="relationRow">${relationBadgesHTMLV053(x.relations)}</div>${rulePathMiniHTMLV065(x.rulePath)}${gamePlanMiniHTMLV068(x.gamePlan)}<div class="tags">${x.profile.tags.slice(0,5).map(t=>`<span class="tag">${KNOWLEDGE_TAGS[t].label}</span>`).join('')}</div><ul class="explainList">${x.why.map(w=>`<li>${esc(w)}</li>`).join('')}</ul>${x.cautions.length?`<div class="tiny caution">注意：${x.cautions.map(esc).join('／')}</div>`:''}<div class="inlineActions"><button class="smallBtn primary" data-deckadd="${esc(x.card.name)}">デッキへ追加</button><button class="smallBtn" data-detail="${esc(x.card.name)}">詳細</button></div></div><div><div class="score">${x.score}</div><div class="tiny">統合適合点</div></div></article>`;
};
advisorCandidateHTML=function(x){
  const c=x.card,cat=advisorCategory(null,x),reason=x.why.slice(0,4);
  return `<article class="advisorCandidate"><button class="imageButton" data-detail="${esc(c.name)}">${displayImg(c)?`<img loading="lazy" src="${displayImg(c)}" alt="${esc(displayName(c))}">`:''}</button><div><div class="advisorCategory">${esc(cat)}</div><h3><button class="textButton" data-detail="${esc(c.name)}">${esc(displayName(c))}</button></h3>${englishSubName(c)}<div class="meta">${esc(displayType(c))} ・ MV ${c.cmc||0} ・ ${colors(c.color_identity||[])}</div><div class="relationRow">${relationBadgesHTMLV053(x.relations)}</div>${rulePathMiniHTMLV065(x.rulePath)}${gamePlanMiniHTMLV068(x.gamePlan)}<div class="advisorStars" aria-label="推奨度">${advisorStars(x.score)}</div><ul class="explainList">${reason.map(r=>`<li>${esc(r)}</li>`).join('')}</ul>${x.cautions.length?`<div class="tiny caution">条件：${x.cautions.map(esc).join('／')}</div>`:''}<div class="inlineActions"><button class="smallBtn primary" data-deckadd="${esc(c.name)}">デッキへ追加</button><button class="smallBtn" data-inspect="${esc(c.name)}">このカードも解析</button><button class="smallBtn" data-detail="${esc(c.name)}">詳細</button></div></div></article>`;
};
function deckCandidateGamePlanV068(card,stats,seedCards,profile){
  const role=gamePlanRoleV068(card),p=knowledgeProfile(card),prof=profile||deckKnowledgeProfileV054(seedCards),coverage=gapCoverageForCandidateV054(prof,p);
  const top=(prof.connections||[]).slice(0,4),connectionHits=top.filter(x=>p.tags.includes(x.from)||p.tags.includes(x.to)).length;
  const winUtility=(prof.utility||[]).find(x=>x.code==='win'),needsWin=!!winUtility&&winUtility.count<winUtility.target;
  let sameRole=0;for(const e of seedCards){if(!e.card)continue;if(gamePlanRoleV068(e.card).primary===role.primary)sameRole+=Math.max(1,+e.qty||1);}
  let score=42,bonus=0,reasons=[],concerns=[];
  if(coverage.why.length){score+=18;bonus+=7;reasons.push('現在のデッキ不足を直接補完');}
  if(connectionHits){score+=Math.min(18,connectionHits*7);bonus+=Math.min(6,connectionHits*3);reasons.push('主要エンジンの供給／利用側に参加');}
  if(role.finish&&needsWin){score+=20;bonus+=9;reasons.push('不足している勝ち筋を追加');}
  if(role.standalone>=70){score+=8;bonus+=2;reasons.push('シナジー不成立時にも単体価値が高い');}
  if(sameRole>=10&&!coverage.why.length&&!(role.finish&&needsWin)){score-=18;bonus-=9;concerns.push(`${role.label}がすでに${sameRole}枚あり役割重複が大きい`);}
  if(!coverage.why.length&&!connectionHits&&!role.finish&&role.primary!=='INTERACTION'&&role.primary!=='SUPPORT'){score-=12;bonus-=6;concerns.push('現在の主ゲームプランとの直接接続が弱い');}
  score=gpClampV068(Math.round(score));bonus=Math.max(-12,Math.min(12,Math.round(bonus)));
  const verdict=score>=75?'優先候補':score>=60?'プラン適合':score>=45?'用途次第':'優先度低め';
  return {score,grade:gpGradeV068(score),bonus,verdict,role,sameRole,reasons,concerns};
}
const scoreCardBaseV068=scoreCard;
scoreCard=function(c,stats,strategy,seedCards){
  const x=scoreCardBaseV068(c,stats,strategy,seedCards),gp=deckCandidateGamePlanV068(c,stats,seedCards,currentDeckKnowledgeV054);x.gamePlanDeck=gp;x.score=Math.round((x.score+gp.bonus)*10)/10;
  if(gp.reasons.length)x.why=unique([...(x.why||[]),...gp.reasons.map(r=>`ゲームプラン：${r}`)]).slice(0,7);
  if(gp.concerns.length)x.cautions=unique([...(x.cautions||[]),...gp.concerns]);
  return x;
};
cardHTML=function(x){
  const primary=(x.relations||[]).includes('COVERAGE')?'不足補完':(x.relations||[]).includes('ENGINE')?'エンジン形成':(x.relations||[]).includes('ENABLE')?'成立支援':(x.relations||[]).includes('SYNERGY')?'効果接続':'安定化';
  return `<article class="result"><button class="imageButton" data-detail="${esc(x.card.name)}" aria-label="${esc(x.card.name)}の詳細">${displayImg(x.card)?`<img loading="lazy" src="${displayImg(x.card)}" alt="${esc(displayName(x.card))}">`:''}</button><div><div class="candidatePurpose">${esc(primary)}</div><h3><button class="textButton" data-detail="${esc(x.card.name)}">${esc(displayName(x.card))}</button></h3>${englishSubName(x.card)}<div class="meta">${esc(displayType(x.card))} ・ MV ${x.card.cmc||0} ・ ${colors(x.f.colors)}</div><div class="relationRow">${relationBadgesHTMLV053(x.relations||[])}</div>${x.gamePlanDeck?gamePlanMiniHTMLV068({score:x.gamePlanDeck.score,verdict:x.gamePlanDeck.verdict}):''}${x.why.length?`<ul class="explainList">${x.why.map(w=>`<li>${esc(w)}</li>`).join('')}</ul>`:''}${x.cautions?.length?`<div class="tiny caution">注意：${x.cautions.map(esc).join('／')}</div>`:''}<div class="tags">${x.f.roles.slice(0,4).map(r=>`<span class="tag">${labels[r]||r}</span>`).join('')}</div><div class="oracle">${esc(displayOracle(x.card))}</div><div class="inlineActions"><button class="smallBtn primary" data-deckadd="${esc(x.card.name)}">デッキへ追加</button><button class="smallBtn" data-detail="${esc(x.card.name)}">詳細を見る</button></div></div><div><div class="score">${x.score}</div><div class="tiny">デッキ接続点</div></div></article>`;
};
const analyzeRulesV067BaseV068=analyzeRulesV065;
analyzeRulesV065=async function(){
  await analyzeRulesV067BaseV068();
  const result=$('ruleResult');if(!result||!result.innerHTML||result.querySelector('.gamePlanEngineV068'))return;
  const raw=['ruleCard1','ruleCard2','ruleCard3'].map(id=>$(id)?.value.trim()).filter(Boolean);if(!raw.length)return;
  const cards=[];for(const name of raw){const c=findPoolCard(name)||await named(name);if(c&&!cards.some(x=>x.oracle_id===c.oracle_id))cards.push(c);}if(!cards.length)return;
  const profiles=cards.map(parseRuleCardV060),verified=knownRuleCaseV060(cards),links=inferredRuleLinksV060(profiles),ios=cards.map((c,i)=>eventIOV061(c,profiles[i])),edges=graphEdgesV061(cards,profiles,ios);
  const stackSim=verifiedStackTraceV062(cards,verified)||genericStackTraceV062(cards,profiles,$('ruleTriggerOrder')?.value||'input'),priorityModel=priorityWindowsV064(cards,stackSim),pathModel=rulePathModelV065(cards,profiles,ios,edges,links,verified,priorityModel),strategy=strategyModelV066(cards,pathModel,priorityModel,profiles,verified),consistency=consistencyModelV067(cards,strategy),gamePlan=gamePlanModelV068(cards,pathModel,strategy,consistency);
  const consistencyEl=result.querySelector('.consistencyEngineV067'),strategyEl=result.querySelector('.strategyEngineV066');
  if(consistencyEl)consistencyEl.insertAdjacentHTML('afterend',gamePlanPanelHTMLV068(gamePlan,cards));else if(strategyEl)strategyEl.insertAdjacentHTML('afterend',gamePlanPanelHTMLV068(gamePlan,cards));else result.insertAdjacentHTML('afterbegin',gamePlanPanelHTMLV068(gamePlan,cards));
  const st=$('ruleStatus');if(st)st.textContent+=` Game Plan ${gamePlan.score}/100（${gamePlan.grade}：${gamePlan.verdict}）。`;
};
function bindRuleEngineV068(){
  const btn=$('ruleAnalyzeBtn');if(btn){const fresh=btn.cloneNode(true);btn.replaceWith(fresh);fresh.onclick=analyzeRulesV065;}
  ['ruleCard1','ruleCard2','ruleCard3'].forEach(id=>{const el=$(id);if(!el)return;const fresh=el.cloneNode(true);fresh.value=el.value;el.replaceWith(fresh);fresh.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();e.stopPropagation();analyzeRulesV065();}});});
  const clear=$('ruleClearBtn');if(clear){const fresh=clear.cloneNode(true);clear.replaceWith(fresh);fresh.onclick=()=>{['ruleCard1','ruleCard2','ruleCard3'].forEach(id=>{const el=$(id);if(el)el.value='';});const r=$('ruleResult');if(r)r.innerHTML='<div class="empty">左でカードを選ぶと、Rule Engine β-8でRule Path・Strategy・Consistency・Game Planまで統合表示します。</div>';const st=$('ruleStatus');if(st)st.textContent='Rule Engine β-8：カードを1～3枚入力してください。';};}
  const status=$('ruleStatus');if(status)status.textContent='Rule Engine β-8：カードを1～3枚入力してください。';
}
bindRuleEngineV068();

/* Recommendation Decision Engine beta-9 v0.6.9 */
const RECOMMENDATION_WEIGHTS_V069={rulePath:.28,strategy:.22,consistency:.23,gamePlan:.27};
function rdClampV069(n,min=0,max=100){return Math.max(min,Math.min(max,Number.isFinite(+n)?+n:0));}
function rdGradeV069(score){return score>=80?'A':score>=65?'B':score>=50?'C':score>=35?'D':'E';}
function rdAxisLabelV069(key){return {rulePath:'Rule Path',strategy:'Strategy',consistency:'Consistency',gamePlan:'Game Plan'}[key]||key;}
function rdScoreOfV069(model,fallback=0){return rdClampV069(model&&Number.isFinite(+model.score)?+model.score:fallback);}
function recommendationDecisionV069({rulePath,strategy,consistency,gamePlan,verified=false,estimated=false,context='rules'}={}){
  const axes={
    rulePath:rdScoreOfV069(rulePath),
    strategy:rdScoreOfV069(strategy),
    consistency:rdScoreOfV069(consistency),
    gamePlan:rdScoreOfV069(gamePlan)
  };
  const pairs=Object.entries(axes),minPair=pairs.reduce((a,b)=>b[1]<a[1]?b:a,pairs[0]||['rulePath',0]);
  const weighted=pairs.reduce((s,[k,v])=>s+v*(RECOMMENDATION_WEIGHTS_V069[k]||0),0);
  let score=weighted*.78+minPair[1]*.22;
  let penalty=0;
  for(const [,v] of pairs){if(v<35)penalty+=(35-v)*.34;else if(v<50)penalty+=(50-v)*.08;}
  if(minPair[1]<20)penalty+=8;
  const missing=consistency?.ctx?.missing||[];
  const hasDeck=!!consistency?.ctx?.hasDeck;
  if(consistency?.color?.level==='高')penalty+=6;
  if(estimated)penalty+=2;
  score-=penalty;
  if(verified&&minPair[1]>=35)score+=4;
  if(axes.rulePath<30)score=Math.min(score,45);if(axes.rulePath<20)score=Math.min(score,35);
  if(axes.consistency<30)score=Math.min(score,48);if(axes.consistency<20)score=Math.min(score,38);
  if(axes.gamePlan<30)score=Math.min(score,50);if(axes.gamePlan<20)score=Math.min(score,40);
  if(axes.strategy<30)score=Math.min(score,52);if(axes.strategy<20)score=Math.min(score,42);
  if(missing.length)score=Math.min(score,18);
  score=rdClampV069(Math.round(score));
  const grade=rdGradeV069(score);
  let verdict=score>=84?'採用優先度：非常に高い':score>=72?'採用優先度：高い':score>=58?'採用候補':score>=42?'条件付き候補':'採用優先度：低い';
  if(missing.length)verdict='現デッキでは成立不可';
  const confidence=verified?(hasDeck?'Verified + Deck':'Verified'):estimated?'Inferred':hasDeck?'Integrated':'Reference';
  const reasons=[];
  if(axes.rulePath>=75)reasons.push('ルール上の接続経路が明確');
  if(axes.strategy>=65)reasons.push('必要枚数・マナ・応答窓の負荷が比較的小さい');
  if(axes.consistency>=65)reasons.push('現在の採用枚数と到達性から再現性が高い');
  if((consistency?.probs?.[4]||0)>=.3)reasons.push(`4Tまでの自然到達率が${pctV067(consistency.probs[4])}`);
  if(axes.gamePlan>=65)reasons.push('現在のゲームプランへ明確に貢献');
  if(gamePlan?.reasons?.length)reasons.push(...gamePlan.reasons.slice(0,2));
  if(verified)reasons.unshift('検証済みRule Pathを含む');
  const concerns=[];
  if(axes.rulePath<45)concerns.push('ルール経路の接続信頼度が低い');
  if(axes.strategy<45)concerns.push('成立条件・マナ・応答窓の負荷が大きい');
  if(axes.consistency<45)concerns.push('必要パーツへの到達性またはマナ再現性が低い');
  if(axes.gamePlan<45)concerns.push('デッキの勝ち筋・役割への接続が弱い');
  if(missing.length)concerns.push(`未採用パーツ：${missing.join('／')}`);
  if(consistency?.color?.level==='高')concerns.push(`色マナ難度が高い（${consistency.color.detail||'色源不足候補'}）`);
  if(gamePlan?.concerns?.length)concerns.push(...gamePlan.concerns.slice(0,2));
  if(rulePath?.interruptions?.length)concerns.push(rulePath.interruptions[0]);
  if(!hasDeck&&context==='rules')concerns.push('デッキ未入力のためConsistencyは60枚・各4枚仮定の参考値');
  const bottleneck={key:minPair[0],label:rdAxisLabelV069(minPair[0]),score:minPair[1]};
  const recommendationBonus=score>=84?12:score>=72?8:score>=58?4:score<35?-12:score<45?-7:0;
  return {score,grade,verdict,confidence,axes,bottleneck,weighted:Math.round(weighted),penalty:Math.round(penalty),reasons:unique(reasons).slice(0,6),concerns:unique(concerns).slice(0,6),verified,estimated,hasDeck,missing,recommendationBonus};
}
function recommendationAxisHTMLV069(label,score){
  const n=Math.round(rdClampV069(score));
  const cls=n>=70?'good':n>=50?'mid':n>=35?'warn':'weak';
  return `<article class="rdAxisV069 ${cls}"><div><b>${esc(label)}</b><strong>${n}</strong></div><div class="rdAxisTrackV069"><span style="width:${n}%"></span></div></article>`;
}
function recommendationDecisionPanelHTMLV069(m){
  const reasons=m.reasons.length?`<ul>${m.reasons.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:'<div class="empty">明確な採用理由を追加抽出できませんでした。</div>';
  const concerns=m.concerns.length?`<ul>${m.concerns.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:'<div class="empty">重大な懸念は検出されませんでした。</div>';
  return `<section class="recommendationEngineV069"><div class="knowledgeHeader"><div><div class="dialogEyebrow">Recommendation Decision Engine β-9</div><h2>最終推薦判定</h2><p class="notice">4つの評価軸を統合しつつ、単純平均では埋もれる「重大な弱点」をボトルネックとして減点・上限制御します。</p></div><span class="recommendationScoreV069">${m.score}<small>/100</small><b>${m.grade}</b></span></div><div class="rdVerdictV069"><div><b>${esc(m.verdict)}</b><span>${esc(m.confidence)}</span></div><p>最大のボトルネック：<strong>${esc(m.bottleneck.label)} ${Math.round(m.bottleneck.score)}/100</strong></p></div><div class="rdAxisGridV069">${recommendationAxisHTMLV069('Rule Path',m.axes.rulePath)}${recommendationAxisHTMLV069('Strategy',m.axes.strategy)}${recommendationAxisHTMLV069('Consistency',m.axes.consistency)}${recommendationAxisHTMLV069('Game Plan',m.axes.gamePlan)}</div><div class="rdReasonGridV069"><section><h3>推薦する理由</h3>${reasons}</section><section><h3>採用前に確認する点</h3>${concerns}</section></div><div class="ruleDisclaimer"><b>β-9の注意：</b>Recommendation scoreは勝率や大会結果の予測ではありません。Rule Path・実戦成立性・再現性・ゲームプラン適合度を統合した構築判断用スコアです。対戦相手、メタゲーム、サイドボード後の勝率はまだ含みません。</div></section>`;
}
function recommendationMiniHTMLV069(m){
  if(!m)return '';
  const cls=m.score>=72?'good':m.score>=58?'mid':m.score>=42?'warn':'weak';
  return `<div class="recommendationMiniV069 ${cls}"><b>Recommendation ${m.score}/100</b><span>${esc(m.verdict)}</span><small>弱点：${esc(m.bottleneck.label)} ${Math.round(m.bottleneck.score)}</small></div>`;
}
function pairStrategyProxyV069(seed,candidate,rp){
  const cards=[seed,candidate],profiles=cards.map(parseRuleCardV060);
  const reqCount=unique(profiles.flatMap(p=>[...(p.conditions||[]),...(p.costs||[])])).length;
  let windows=Math.max(0,(rp?.interruptions||[]).length);
  for(const p of profiles){if((p.costs||[]).length)windows++;if((p.events||[]).some(x=>/trigger|誘発/i.test(String(x))))windows++;}
  windows=Math.min(6,windows);
  const path={score:rp?.score||0,status:rp?.verified?'Verified':(rp?.score||0)>=65?'Connected':(rp?.score||0)>=35?'Partial':'Unconfirmed'};
  const priority={windows:Array.from({length:windows},()=>({}))};
  const m=strategyModelV066(cards,path,priority,profiles,rp?.verified?{}:null);
  m.reqCount=Math.max(m.reqCount||0,reqCount);
  return m;
}
function pairConsistencyProxyV069(cards,strategy){
  const base=rawDeckContextV067(cards),onDraw=($('rulePlayDraw')?.value||'play')==='draw';
  const copies=base.hasDeck?base.copies.map((n,i)=>i===cards.length-1?4:(n>0?n:4)):cards.map(()=>4);
  const ctx={...base,copies,missing:[],source:base.hasDeck?'現在のデッキ＋候補4枚採用仮定':base.source};
  const probs={};for(const t of [3,4,5,6])probs[t]=allPiecesProbabilityV067(ctx.deckSize,copies,cardsSeenByTurnV067(t,onDraw));
  const mana=theoreticalManaTurnV067(cards),manaSeen=cardsSeenByTurnV067(mana.turn,onDraw),landNeed=mana.total>0?(mana.landNeed??mana.turn):0,landReady=ctx.hasDeck?hypergeomAtLeastV067(ctx.deckSize,ctx.lands,manaSeen,landNeed):null;
  const color=colorDifficultyV067(cards,ctx),access=accessSupportV067(ctx,cards),standalone=standaloneRiskV067(cards),p4=probs[4]*100,p5=probs[5]*100;
  let score=25+p4*.22+p5*.58+access.bonus-color.penalty-standalone.penalty-Math.max(0,mana.turn-4)*5;
  if(strategy?.score>=75)score+=4;else if(strategy?.score<40)score-=4;if(landReady!=null)score+=(landReady*100-65)*.08;score=rdClampV069(Math.round(score));
  const grade=rdGradeV069(score);return {score,grade,ctx,onDraw,probs,mana,landReady,color,access,standalone,timing:`候補4枚採用時の比較値`,reach4:reachLabelV067(probs[4])};
}
function pairRecommendationDecisionV069(seed,candidate,rp,gp){
  const strategy=pairStrategyProxyV069(seed,candidate,rp),consistency=pairConsistencyProxyV069([seed,candidate],strategy);
  const gamePlan={score:gp?.score||0,grade:gp?.grade,verdict:gp?.verdict,reasons:gp?.score>=65?[gp.verdict]:[],concerns:gp?.score<45?[gp.verdict]:[]};
  const decision=recommendationDecisionV069({rulePath:rp,strategy,consistency,gamePlan,verified:!!rp?.verified,context:'pair'});
  return {decision,strategy,consistency,gamePlan};
}
const enhanceCandidateV065BaseV069=enhanceCandidateV065;
enhanceCandidateV065=function(seed,x){
  const y=enhanceCandidateV065BaseV069(seed,x),bundle=pairRecommendationDecisionV069(seed,y.card,y.rulePath,y.gamePlan);y.recommendationDecision=bundle.decision;y.recommendationStrategy=bundle.strategy;y.recommendationConsistency=bundle.consistency;
  y.score=rdClampV069(Math.round(y.score*.46+bundle.decision.score*.54));
  if(bundle.decision.score>=72)y.why=unique([...(y.why||[]),`最終推薦：${bundle.decision.verdict}`]).slice(0,7);
  if(bundle.decision.score<42)y.cautions=unique([...(y.cautions||[]),`最終判定のボトルネック：${bundle.decision.bottleneck.label} ${Math.round(bundle.decision.bottleneck.score)}`]);
  return y;
};
function deckCandidateDecisionV069(x,stats,seedCards){
  const rel=x.relations||[];
  let rp=28;if(rel.includes('ENGINE'))rp=72;else if(rel.includes('ENABLE'))rp=66;else if(rel.includes('SYNERGY'))rp=62;else if(rel.includes('COVERAGE'))rp=52;else if(rel.includes('SUPPORT'))rp=46;
  const mv=+x.card.cmc||0,roleCount=x.f?.roles?.length||0;
  let strategy=54+Math.min(14,roleCount*3)-Math.max(0,mv-4)*5;if(x.cautions?.length)strategy-=Math.min(12,x.cautions.length*3);strategy=rdClampV069(strategy);
  let consistency=mv<=2?76:mv===3?69:mv===4?61:mv===5?52:mv===6?44:38;
  const outside=(x.f?.colors||[]).filter(c=>!(stats?.cols||[]).includes(c));if(outside.length)consistency-=22;
  if((x.f?.roles||[]).includes('draw')||(x.f?.roles||[]).includes('ramp'))consistency+=5;consistency=rdClampV069(consistency);
  const gp=x.gamePlanDeck||{score:50,verdict:'未評価'};
  const rulePath={score:rp,confidence:'Inferred',interruptions:[]},strategyM={score:strategy},consistencyM={score:consistency,ctx:{hasDeck:true,missing:[]},color:{level:outside.length?'高':'低',detail:outside.length?'デッキ外色候補':'デッキ色内'},probs:{}},gamePlan={score:gp.score,reasons:gp.reasons||[],concerns:gp.concerns||[]};
  return recommendationDecisionV069({rulePath,strategy:strategyM,consistency:consistencyM,gamePlan,estimated:true,context:'deck'});
}
const scoreCardBaseV069=scoreCard;
scoreCard=function(c,stats,strategy,seedCards){
  const x=scoreCardBaseV069(c,stats,strategy,seedCards),decision=deckCandidateDecisionV069(x,stats,seedCards);x.recommendationDecision=decision;
  x.score=Math.round((x.score*.76+decision.score*.24)*10)/10;
  if(decision.score>=72)x.why=unique([...(x.why||[]),`最終推薦：${decision.verdict}`]).slice(0,7);
  if(decision.score<42)x.cautions=unique([...(x.cautions||[]),`推薦判定の弱点：${decision.bottleneck.label}`]);
  return x;
};
candidateResultHTMLV053=function(x){
  return `<article class="result"><button class="imageButton" data-detail="${esc(x.card.name)}">${displayImg(x.card)?`<img loading="lazy" src="${displayImg(x.card)}" alt="${esc(displayName(x.card))}">`:''}</button><div><h3><button class="textButton" data-detail="${esc(x.card.name)}">${esc(displayName(x.card))}</button></h3>${englishSubName(x.card)}<div class="meta">${esc(displayType(x.card))} ・ MV ${x.card.cmc||0} ・ ${colors(x.card.color_identity||[])}</div><div class="relationRow">${relationBadgesHTMLV053(x.relations)}</div>${rulePathMiniHTMLV065(x.rulePath)}${gamePlanMiniHTMLV068(x.gamePlan)}${recommendationMiniHTMLV069(x.recommendationDecision)}<div class="tags">${x.profile.tags.slice(0,5).map(t=>`<span class="tag">${KNOWLEDGE_TAGS[t].label}</span>`).join('')}</div><ul class="explainList">${x.why.map(w=>`<li>${esc(w)}</li>`).join('')}</ul>${x.cautions.length?`<div class="tiny caution">注意：${x.cautions.map(esc).join('／')}</div>`:''}<div class="inlineActions"><button class="smallBtn primary" data-deckadd="${esc(x.card.name)}">デッキへ追加</button><button class="smallBtn" data-detail="${esc(x.card.name)}">詳細</button></div></div><div><div class="score">${x.score}</div><div class="tiny">推薦統合点</div></div></article>`;
};
advisorCandidateHTML=function(x){
  const c=x.card,cat=advisorCategory(null,x),reason=x.why.slice(0,4);
  return `<article class="advisorCandidate"><button class="imageButton" data-detail="${esc(c.name)}">${displayImg(c)?`<img loading="lazy" src="${displayImg(c)}" alt="${esc(displayName(c))}">`:''}</button><div><div class="advisorCategory">${esc(cat)}</div><h3><button class="textButton" data-detail="${esc(c.name)}">${esc(displayName(c))}</button></h3>${englishSubName(c)}<div class="meta">${esc(displayType(c))} ・ MV ${c.cmc||0} ・ ${colors(c.color_identity||[])}</div><div class="relationRow">${relationBadgesHTMLV053(x.relations)}</div>${rulePathMiniHTMLV065(x.rulePath)}${gamePlanMiniHTMLV068(x.gamePlan)}${recommendationMiniHTMLV069(x.recommendationDecision)}<div class="advisorStars" aria-label="推奨度">${advisorStars(x.score)}</div><ul class="explainList">${reason.map(r=>`<li>${esc(r)}</li>`).join('')}</ul>${x.cautions.length?`<div class="tiny caution">条件：${x.cautions.map(esc).join('／')}</div>`:''}<div class="inlineActions"><button class="smallBtn primary" data-deckadd="${esc(c.name)}">デッキへ追加</button><button class="smallBtn" data-inspect="${esc(c.name)}">このカードも解析</button><button class="smallBtn" data-detail="${esc(c.name)}">詳細</button></div></div></article>`;
};
cardHTML=function(x){
  const primary=(x.relations||[]).includes('COVERAGE')?'不足補完':(x.relations||[]).includes('ENGINE')?'エンジン形成':(x.relations||[]).includes('ENABLE')?'成立支援':(x.relations||[]).includes('SYNERGY')?'効果接続':'安定化';
  return `<article class="result"><button class="imageButton" data-detail="${esc(x.card.name)}" aria-label="${esc(x.card.name)}の詳細">${displayImg(x.card)?`<img loading="lazy" src="${displayImg(x.card)}" alt="${esc(displayName(x.card))}">`:''}</button><div><div class="candidatePurpose">${esc(primary)}</div><h3><button class="textButton" data-detail="${esc(x.card.name)}">${esc(displayName(x.card))}</button></h3>${englishSubName(x.card)}<div class="meta">${esc(displayType(x.card))} ・ MV ${x.card.cmc||0} ・ ${colors(x.f.colors)}</div><div class="relationRow">${relationBadgesHTMLV053(x.relations||[])}</div>${x.gamePlanDeck?gamePlanMiniHTMLV068({score:x.gamePlanDeck.score,verdict:x.gamePlanDeck.verdict}):''}${recommendationMiniHTMLV069(x.recommendationDecision)}${x.why.length?`<ul class="explainList">${x.why.map(w=>`<li>${esc(w)}</li>`).join('')}</ul>`:''}${x.cautions?.length?`<div class="tiny caution">注意：${x.cautions.map(esc).join('／')}</div>`:''}<div class="tags">${x.f.roles.slice(0,4).map(r=>`<span class="tag">${labels[r]||r}</span>`).join('')}</div><div class="oracle">${esc(displayOracle(x.card))}</div><div class="inlineActions"><button class="smallBtn primary" data-deckadd="${esc(x.card.name)}">デッキへ追加</button><button class="smallBtn" data-detail="${esc(x.card.name)}">詳細を見る</button></div></div><div><div class="score">${x.score}</div><div class="tiny">推薦統合点</div></div></article>`;
};
const analyzeRulesV068BaseV069=analyzeRulesV065;
analyzeRulesV065=async function(){
  await analyzeRulesV068BaseV069();
  const result=$('ruleResult');if(!result||!result.innerHTML||result.querySelector('.recommendationEngineV069'))return;
  const raw=['ruleCard1','ruleCard2','ruleCard3'].map(id=>$(id)?.value.trim()).filter(Boolean);if(!raw.length)return;
  const cards=[];for(const name of raw){const c=findPoolCard(name)||await named(name);if(c&&!cards.some(x=>x.oracle_id===c.oracle_id))cards.push(c);}if(!cards.length)return;
  const profiles=cards.map(parseRuleCardV060),verified=knownRuleCaseV060(cards),links=inferredRuleLinksV060(profiles),ios=cards.map((c,i)=>eventIOV061(c,profiles[i])),edges=graphEdgesV061(cards,profiles,ios);
  const stackSim=verifiedStackTraceV062(cards,verified)||genericStackTraceV062(cards,profiles,$('ruleTriggerOrder')?.value||'input'),priorityModel=priorityWindowsV064(cards,stackSim),pathModel=rulePathModelV065(cards,profiles,ios,edges,links,verified,priorityModel),strategy=strategyModelV066(cards,pathModel,priorityModel,profiles,verified),consistency=consistencyModelV067(cards,strategy),gamePlan=gamePlanModelV068(cards,pathModel,strategy,consistency);
  pathModel.interruptions=ruleInterruptionHintsV065(cards);
  const decision=recommendationDecisionV069({rulePath:pathModel,strategy,consistency,gamePlan,verified:!!verified,context:'rules'});
  const gp=result.querySelector('.gamePlanEngineV068'),cons=result.querySelector('.consistencyEngineV067');if(gp)gp.insertAdjacentHTML('afterend',recommendationDecisionPanelHTMLV069(decision));else if(cons)cons.insertAdjacentHTML('afterend',recommendationDecisionPanelHTMLV069(decision));else result.insertAdjacentHTML('afterbegin',recommendationDecisionPanelHTMLV069(decision));
  const st=$('ruleStatus');if(st)st.textContent+=` Recommendation ${decision.score}/100（${decision.grade}：${decision.verdict}）。`;
};
function bindRuleEngineV069(){
  const btn=$('ruleAnalyzeBtn');if(btn){const fresh=btn.cloneNode(true);btn.replaceWith(fresh);fresh.onclick=analyzeRulesV065;}
  ['ruleCard1','ruleCard2','ruleCard3'].forEach(id=>{const el=$(id);if(!el)return;const fresh=el.cloneNode(true);fresh.value=el.value;el.replaceWith(fresh);fresh.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();e.stopPropagation();analyzeRulesV065();}});});
  const clear=$('ruleClearBtn');if(clear){const fresh=clear.cloneNode(true);clear.replaceWith(fresh);fresh.onclick=()=>{['ruleCard1','ruleCard2','ruleCard3'].forEach(id=>{const el=$(id);if(el)el.value='';});const r=$('ruleResult');if(r)r.innerHTML='<div class="empty">左でカードを選ぶと、Rule Engine β-9でRule Path・Strategy・Consistency・Game Plan・Recommendationまで統合表示します。</div>';const st=$('ruleStatus');if(st)st.textContent='Rule Engine β-9：カードを1～3枚入力してください。';};}
  const status=$('ruleStatus');if(status)status.textContent='Rule Engine β-9：カードを1～3枚入力してください。';
}
bindRuleEngineV069();

/* Deck Analysis Foundation v0.6.10 */
const APP_VERSION_V0610='0.6.10';

function isLandCardV0610(card){return /\bLand\b/i.test(type(card||{}));}
function isTrueLandAccelerationV0610(card){
  if(!isLandCardV0610(card))return false;
  const o=String(oracle(card)||text(card)||'').toLowerCase();
  return /add (?:two|three|four|five|x) mana/.test(o)
    || /add \{[wubrgc]\}\{[wubrgc]\}/i.test(o)
    || /untap (?:another |target )?land/.test(o)
    || /whenever [^.]{0,80} land [^.]{0,80} add an additional/.test(o)
    || /you may play an additional land/.test(o);
}
function isRampCardV0610(card){
  if(!card)return false;
  if(isLandCardV0610(card))return isTrueLandAccelerationV0610(card);
  const o=String(oracle(card)||text(card)||'').toLowerCase();
  return /add \{|treasure token|search your library for (?:a|up to one) (?:basic )?land|play an additional land|additional land on each of your turns/i.test(o);
}

/* Lands are mana base by default. Normal mana-producing lands must not be counted as Ramp. */
if(KNOWLEDGE_TAGS&&!KNOWLEDGE_TAGS.mana_base){KNOWLEDGE_TAGS.mana_base={label:'マナ基盤',group:'補助',rx:/$a/};}
const featuresBaseV0610=features;
features=function(card){
  const f=featuresBaseV0610(card),roles=[...(f.roles||[])];
  if(isLandCardV0610(card)&&!isTrueLandAccelerationV0610(card)){
    const i=roles.indexOf('ramp');if(i>=0)roles.splice(i,1);
  }
  return {...f,roles};
};
const knowledgeProfileBaseV0610=knowledgeProfile;
knowledgeProfile=function(card){
  const p=knowledgeProfileBaseV0610(card),tags=[...(p.tags||[])];
  if(isLandCardV0610(card)){
    if(!tags.includes('mana_base'))tags.push('mana_base');
    if(!isTrueLandAccelerationV0610(card)){
      const i=tags.indexOf('mana_add');if(i>=0)tags.splice(i,1);
    }
  }
  const grouped={};
  for(const tag of tags){const def=KNOWLEDGE_TAGS[tag];if(!def)continue;(grouped[def.group]??=[]).push(def.label);}
  return {...p,tags,grouped};
};

function parseDeckTextV0610(text,forceSide=false){
  let side=!!forceSide,out=[];
  for(const raw of String(text||'').split(/\r?\n/)){
    let line=raw.trim();if(!line)continue;
    if(/^(deck|main(?: deck)?)$/i.test(line)){if(!forceSide)side=false;continue;}
    if(/^(sideboard|side)$/i.test(line)){side=true;continue;}
    const sbPrefix=/^SB:\s*/i.test(line);if(sbPrefix){side=true;line=line.replace(/^SB:\s*/i,'');}
    if(/^companion$/i.test(line))continue;
    let m=line.match(/^(\d+)x?\s+(.+?)(?:\s+\([A-Z0-9]+\)\s+\d+)?$/i);
    if(!m)m=[null,'1',line];
    out.push({qty:+m[1],name:m[2].trim(),side:forceSide?true:side});
  }
  return out;
}
parseDeck=function(text){return parseDeckTextV0610(text,false);};
function mergeDeckEntriesV0610(entries){
  const map=new Map();
  for(const e of entries){
    if(!e?.name||!(+e.qty>0))continue;const key=(e.side?'S|':'M|')+normalizeCardNameV053(e.name);
    if(map.has(key))map.get(key).qty+=+e.qty;else map.set(key,{qty:+e.qty,name:e.name,side:!!e.side});
  }
  return [...map.values()];
}
function rebuildMainTextV0610(entries){
  const main=mergeDeckEntriesV0610(entries.filter(e=>!e.side&&e.qty>0));
  return main.length?'Deck\n'+main.map(e=>`${e.qty} ${e.name}`).join('\n'):'';
}
function rebuildSideTextV0610(entries){
  const side=mergeDeckEntriesV0610(entries.filter(e=>e.side&&e.qty>0));
  return side.map(e=>`${e.qty} ${e.name}`).join('\n');
}
function deckInputsV0610({normalize=false}={}){
  const mainText=String($('deckInput')?.value||''),sideText=String($('sideboardInput')?.value||'');
  const parsedMain=parseDeckTextV0610(mainText,false);
  const embeddedSide=parsedMain.filter(e=>e.side);
  const main=parsedMain.filter(e=>!e.side).map(e=>({...e,side:false}));
  const side=(embeddedSide.length?embeddedSide:parseDeckTextV0610(sideText,true)).map(e=>({...e,side:true}));
  const merged=mergeDeckEntriesV0610([...main,...side]);
  if(normalize&&embeddedSide.length&&$('sideboardInput')){
    $('deckInput').value=rebuildMainTextV0610(merged);
    $('sideboardInput').value=rebuildSideTextV0610(merged);
  }
  return merged;
}

/* Consistency always uses Main Deck only. */
rawDeckContextV067=function(cards){
  const useDeck=$('ruleUseDeckContext')?.checked!==false;
  const parsed=useDeck?deckInputsV0610().filter(x=>!x.side):[];
  const hasDeck=parsed.length>0,deckSize=hasDeck?parsed.reduce((s,x)=>s+(+x.qty||0),0):60;
  const entries=parsed.map(x=>({...x,card:findPoolCard(x.name)||null}));
  const copies=cards.map(card=>hasDeck?entries.reduce((sum,e)=>sum+(entryMatchesCardV055(e,card)?(+e.qty||0):0),0):4);
  const missing=cards.filter((c,i)=>copies[i]===0).map(displayName);
  const lands=hasDeck?entries.filter(e=>e.card&&isLandCardV0610(e.card)).reduce((s,e)=>s+e.qty,0):24;
  return {useDeck,hasDeck,source:hasDeck?'現在のメインデッキ':'60枚・各4枚の仮定',deckSize,copies,entries,missing,lands};
};

function sideCountV0610(){return deck.filter(e=>e.side).reduce((s,e)=>s+(+e.qty||0),0);}
const renderStatsBaseV0610=renderStats;
renderStats=function(s,all,res,profile=currentDeckKnowledgeV054){
  renderStatsBaseV0610(s,all,res,profile);
  if($('mSide'))$('mSide').textContent=sideCountV0610();
  if($('resolvedDeck')){
    const main=deck.filter(e=>!e.side),side=deck.filter(e=>e.side);
    const rows=arr=>arr.length?arr.map(x=>`<div>${x.qty} ${esc(x.card?displayName(x.card):x.name)} ${x.card?'':'<span class="tag bad">未特定</span>'}</div>`).join(''):'<span class="tiny">なし</span>';
    $('resolvedDeck').innerHTML=`<div class="resolvedGroupsV0610"><section class="resolvedGroupV0610"><h4>メイン ${s.total}枚</h4>${rows(main)}</section><section class="resolvedGroupV0610"><h4>サイド ${sideCountV0610()}枚</h4>${rows(side)}<span class="tiny">メイン分析・Consistencyには含めません。</span></section></div>`;
  }
};

function roleCountsV0610(entries,profile){
  const main=entries.filter(e=>!e.side&&e.card),stats=deckStats(entries);
  const qtyWithTags=tags=>main.filter(e=>{const p=knowledgeProfile(e.card);return tags.some(t=>(p.tags||[]).includes(t));}).reduce((sum,e)=>sum+e.qty,0);
  const creatures=main.filter(e=>/\bCreature\b/i.test(type(e.card))).reduce((sum,e)=>sum+e.qty,0);
  const high=main.filter(e=>!isLandCardV0610(e.card)&&(+e.card.cmc||0)>=5).reduce((sum,e)=>sum+e.qty,0);
  return {
    removal:qtyWithTags(['single_removal','board_wipe','counterspell','bounce']),
    draw:qtyWithTags(['draw_cards','impulse']),
    ramp:main.filter(e=>isRampCardV0610(e.card)).reduce((sum,e)=>sum+e.qty,0),
    protection:qtyWithTags(['protection']),
    finisher:qtyWithTags(['direct_damage','alternate_win','evasion']),
    creatures,high,stats
  };
}
function roleTargetsV0610(rc){
  return {removal:4,draw:rc.stats.avg>=2.5?3:2,ramp:(rc.stats.avg>=3.35||rc.high>=7)?2:0,protection:rc.creatures>=16?1:0,finisher:rc.stats.avg>=2.6?2:1};
}
function deckFoundationModelV0610(entries){
  const main=entries.filter(e=>!e.side&&e.card),stats=deckStats(entries),profile=deckKnowledgeProfileV054(main),rc=roleCountsV0610(entries,profile),targets=roleTargetsV0610(rc),deficits=[],excess=[];
  const labelsMap={removal:'除去／妨害',draw:'手札補充',ramp:'マナ加速',protection:'保護',finisher:'勝ち筋'};
  let roleScore=100;
  for(const k of Object.keys(targets)){
    const n=rc[k]||0,t=targets[k]||0;if(t>0&&n<t){deficits.push({key:k,label:labelsMap[k],count:n,target:t});roleScore-=Math.min(24,(t-n)*9);}else if(t>0&&n>t+5){excess.push({key:k,label:labelsMap[k],count:n,target:t});roleScore-=Math.min(10,(n-t-5)*2);}
  }
  let landPenalty=0;const minLand=stats.avg<2.1?20:stats.avg<2.8?22:stats.avg<3.6?23:24,maxLand=stats.avg<2.1?24:stats.avg<2.8?26:stats.avg<3.6?27:28;
  if(stats.lands<minLand)landPenalty=(minLand-stats.lands)*6;else if(stats.lands>maxLand)landPenalty=(stats.lands-maxLand)*4;
  const curveCore=(stats.curve[1]||0)+(stats.curve[2]||0)+(stats.curve[3]||0);const curvePenalty=curveCore<18?Math.min(18,(18-curveCore)*1.4):0;
  const sizePenalty=Math.min(20,Math.abs(stats.total-60)*2.5);
  const structure=rdClampV069(100-landPenalty-curvePenalty-sizePenalty);
  const effect=rdClampV069(profile.engineScore||0),gapScore=rdClampV069(100-(profile.gaps?.length||0)*8),connectionScore=rdClampV069(45+Math.min(55,(profile.connections?.length||0)*7));
  const score=Math.round(structure*.26+roleScore*.25+effect*.23+gapScore*.14+connectionScore*.12);
  return {score:rdClampV069(score),stats,profile,rc,targets,deficits,excess,structure:Math.round(structure),roleScore:Math.round(roleScore),gapScore,connectionScore};
}
function candidateFillsDeficitV0610(rec,model){
  const p=knowledgeProfile(rec.card),tags=p.tags||[],f=features(rec.card),keys=[];
  if(tags.some(t=>['single_removal','board_wipe','counterspell','bounce'].includes(t))||f.roles.includes('removal'))keys.push('removal');
  if(tags.some(t=>['draw_cards','impulse'].includes(t))||f.roles.includes('draw'))keys.push('draw');
  if((tags.includes('mana_add')||tags.includes('extra_land'))&&!isLandCardV0610(rec.card)||isTrueLandAccelerationV0610(rec.card))keys.push('ramp');
  if(tags.includes('protection')||f.roles.includes('protection'))keys.push('protection');
  if(tags.some(t=>['direct_damage','alternate_win','evasion'].includes(t))||f.roles.includes('finisher'))keys.push('finisher');
  return model.deficits.filter(d=>keys.includes(d.key));
}
function replacementRoleLossV0610(cut,rec,beforeModel,afterModel){
  const before=beforeModel.rc,after=afterModel.rc,targets=beforeModel.targets,loss=[];
  for(const k of Object.keys(targets)){
    if((after[k]||0)<(before[k]||0)&&(before[k]||0)<=Math.max(1,(targets[k]||0)+1))loss.push(k);
  }
  return loss;
}

const buildSwapRecommendationsBaseV0610=buildSwapRecommendationsV055;
buildSwapRecommendationsV055=function(stats,profile,recommendations,mainResolved){
  const raw=buildSwapRecommendationsBaseV0610(stats,profile,recommendations,mainResolved),before=deckFoundationModelV0610(deck),out=[];
  for(const item of raw){
    if(item.add?.recommendationDecision&&item.add.recommendationDecision.score<50)continue;
    const simulated=simulateSwapEntriesV055(deck,item.cut.card,item.add.card,item.qty),after=deckFoundationModelV0610(simulated),delta=after.score-before.score;
    const fills=candidateFillsDeficitV0610(item.add,before),roleLoss=replacementRoleLossV0610(item.cut,item.add,before,after);
    const addTags=new Set(knowledgeProfile(item.add.card).tags||[]),cutTags=(knowledgeProfile(item.cut.card).tags||[]),shared=cutTags.filter(t=>addTags.has(t)&&t!=='mana_base');
    const strongRelation=(item.add.relations||[]).some(r=>['ENGINE','COVERAGE','ENABLE','SYNERGY'].includes(r));
    if(roleLoss.length&&!fills.length)continue;
    if(delta<=0)continue;
    if(item.deltaConnections<0&&item.deltaGaps<=0&&fills.length===0)continue;
    if(!shared.length&&!strongRelation&&!fills.length)continue;
    const notes=[];
    if(fills.length)notes.push(`不足している${fills.map(x=>x.label).join('・')}を補う`);
    if(shared.length)notes.push(`削減カードの役割を${shared.slice(0,2).map(t=>KNOWLEDGE_TAGS[t]?.label||t).join('・')}で引き継ぐ`);
    if(item.deltaConnections>0)notes.push(`効果接続が${item.deltaConnections}件増える`);
    if(item.deltaGaps>0)notes.push(`不足・孤立が${item.deltaGaps}件減る`);
    notes.push(`デッキ全体評価 ${before.score} → ${after.score}`);
    item.foundationBefore=before;item.foundationAfter=after;item.deltaFoundation=delta;item.balanceNotes=unique(notes);item.pairScore+=(delta*8)+(fills.length*8)-(roleLoss.length*18);
    out.push(item);
  }
  return out.sort((a,b)=>b.pairScore-a.pairScore||b.deltaFoundation-a.deltaFoundation).slice(0,6);
};

renderSwapRecommendationsV055=function(){
  const root=$('swapRecommendations'),count=$('swapCount');if(!root)return;if(count)count.textContent=`${currentSwapRecommendationsV055.length}件`;
  if(!currentSwapRecommendationsV055.length){root.innerHTML='<div class="empty">交換後のデッキ全体評価が改善する案を検出できませんでした。無理に入れ替えず、条件やデッキ構成を確認してください。</div>';renderSwapCompareV056();return;}
  const beforeStats=deckStats(deck),beforeProfile=currentDeckKnowledgeV054;
  root.innerHTML=currentSwapRecommendationsV055.map((item,index)=>{
    const addReasons=unique([...(item.balanceNotes||[]),...(item.add.why||[])]).slice(0,4),cutReasons=item.cut.reasons.slice(0,3),confidence=swapConfidenceV055(item),landMetric=item.landDelta?swapMetricHTMLV055('土地',beforeStats.lands,item.afterStats.lands,'up',0):'';
    const ownedBadge=swapSettingsV056.ownedOnly?'<span class="swapOwnedBadgeV056">所有確認済み</span>':'';
    const fb=item.foundationBefore,fa=item.foundationAfter;
    return `<article class="swapProposal" id="swapProposalV056-${index}"><div class="swapProposalHead"><div><div class="swapProposalHeadTagsV056"><span class="swapRank">提案 ${index+1}</span><span class="swapPolicyBadgeV056">${esc(policyLabelV056())}</span>${ownedBadge}</div><h3>${esc(displayName(item.cut.card))} → ${esc(displayName(item.add.card))}</h3></div><span class="swapConfidence confidence${confidence}">確度 ${confidence}</span></div><div class="swapFoundationSummaryV0610"><div><span>交換後のデッキ全体評価</span><strong>${fb?.score??'—'} → ${fa?.score??'—'}</strong></div><b>+${item.deltaFoundation||0}</b></div><div class="swapPair">${swapCardPanelV055(item.add.card,item.qty,'add')}<div class="swapExchange" aria-hidden="true">⇄</div>${swapCardPanelV055(item.cut.card,item.qty,'cut')}</div><div class="swapReasonGrid"><section><h4>追加する理由</h4><ul class="explainList">${addReasons.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></section><section><h4>減らす理由</h4><ul class="explainList">${cutReasons.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></section></div><div class="swapMetrics">${swapMetricHTMLV055('デッキ全体評価',fb?.score||0,fa?.score||0,'up',0)}${swapMetricHTMLV055('効果構造点',beforeProfile.engineScore,item.afterProfile.engineScore,'up',0)}${swapMetricHTMLV055('不足・孤立',beforeProfile.gaps.length,item.afterProfile.gaps.length,'down',0)}${swapMetricHTMLV055('効果接続',beforeProfile.connections.length,item.afterProfile.connections.length,'up',0)}${swapMetricHTMLV055('平均MV',beforeStats.avg,item.afterStats.avg,'down',2)}${landMetric}</div><div class="swapActions"><button class="btn" data-swapapply="${index}">${item.qty}枚入れ替えて再分析</button><button class="btn secondary" data-deckadd="${esc(item.add.card.name)}">追加だけ行う</button><button class="btn ghost" data-detail="${esc(item.add.card.name)}">追加カードの詳細</button><button class="smallBtn" data-lockcut="${esc(cardKeyV056(item.cut.card))}">この削減候補を固定</button></div></article>`;
  }).join('');renderSwapCompareV056();
};

pushSwapHistoryV056=function(label){
  const main=$('deckInput')?.value||'',side=$('sideboardInput')?.value||'';if(!main.trim())return;
  swapHistoryV056.unshift({text:main,sideText:side,label,at:new Date().toISOString()});swapHistoryV056=swapHistoryV056.slice(0,10);saveSwapHistoryV056();
};
undoSwapV056=function(){
  const item=swapHistoryV056.shift();if(!item)return toast('戻せる入れ替えがありません');
  $('deckInput').value=item.text||'';if($('sideboardInput'))$('sideboardInput').value=item.sideText||'';saveSwapHistoryV056();toast(`入れ替え前へ戻しました${item.label?'：'+item.label:''}`);setTimeout(()=>analyze(),60);
};
applySwapProposalV055=function(index){
  const item=currentSwapRecommendationsV055[index];if(!item)return;if(isCardLockedV056(item.cut.card))return toast('固定カードは減らせません');
  pushSwapHistoryV056(`${displayName(item.cut.card)} → ${displayName(item.add.card)}`);
  const entries=parseDeckTextV0610($('deckInput')?.value||'',false).filter(e=>!e.side).map(e=>({...e,side:false}));let remaining=item.qty;
  for(const entry of entries){if(remaining<=0)continue;const card=findPoolCard(entry.name);if(card&&entryMatchesCardV055(entry,item.cut.card)){const take=Math.min(entry.qty,remaining);entry.qty-=take;remaining-=take;}}
  const existing=entries.find(e=>entryMatchesCardV055(e,item.add.card));if(existing)existing.qty+=item.qty;else entries.push({qty:item.qty,name:item.add.card.name,side:false});
  $('deckInput').value=rebuildMainTextV0610(entries.filter(e=>e.qty>0));toast(`${displayName(item.cut.card)}を${item.qty}枚減らし、${displayName(item.add.card)}を${item.qty}枚追加しました。サイドボードは変更していません。`);setTimeout(()=>analyze(),80);
};

addCardToDeck=function(name){
  const entries=parseDeckTextV0610($('deckInput')?.value||'',false).filter(e=>!e.side).map(e=>({...e,side:false}));
  const existing=entries.find(e=>normalizeCardNameV053(e.name)===normalizeCardNameV053(name));if(existing)existing.qty++;else entries.push({qty:1,name,side:false});
  $('deckInput').value=rebuildMainTextV0610(entries);document.querySelector('[data-view="analyzer"]')?.click();status(`${name} をメインデッキへ追加しました。`);
};

function markSideboardCandidateV0610(x,sideNames){
  if(sideNames.has(normalizeCardNameV053(x.card.name))||sideNames.has(normalizeCardNameV053(displayName(x.card))))x.cautions=unique([...(x.cautions||[]),'サイドボードに採用済み']);return x;
}
analyze=async function(){
  if(!pool.length){status('先にカードデータを取得します。',3);await fetchPool();if(!pool.length)return;}
  const beforeMain=$('deckInput')?.value||'',parsed=deckInputsV0610({normalize:true});
  if(!parsed.filter(e=>!e.side).length){status('メインデッキを入力してください。');return;}
  const migrated=beforeMain!==($('deckInput')?.value||'');$('analyzeBtn').disabled=true;deck=[];currentSwapRecommendationsV055=[];renderSwapRecommendationsV055();
  try{
    for(let i=0;i<parsed.length;i++){status(`カード特定中 ${i+1}/${parsed.length}`,10+48*i/parsed.length);const c=findPoolCard(parsed[i].name)||await named(parsed[i].name);deck.push({...parsed[i],card:c||null});await sleep(45);}
    const resolved=deck.filter(x=>x.card),mainResolved=resolved.filter(x=>!x.side),sideResolved=resolved.filter(x=>x.side),stats=deckStats(deck);currentDeckKnowledgeV054=deckKnowledgeProfileV054(mainResolved);await loadVerifiedSynergiesV053(false);renderStats(stats,parsed.length,resolved.length,currentDeckKnowledgeV054);
    const presentMain=new Set(mainResolved.map(x=>x.card.name)),sideNames=new Set(sideResolved.flatMap(x=>[normalizeCardNameV053(x.card.name),normalizeCardNameV053(displayName(x.card))]));
    recs=pool.filter(c=>!presentMain.has(c.name)).map(c=>markSideboardCandidateV0610(scoreCard(c,stats,$('strategy').value,mainResolved),sideNames)).filter(x=>x.score>=12&&x.why.length).sort((a,b)=>b.score-a.score||displayName(a.card).localeCompare(displayName(b.card),'ja'));
    renderSwapLockListV056(mainResolved);currentSwapRecommendationsV055=buildSwapRecommendationsV055(stats,currentDeckKnowledgeV054,recs,mainResolved);renderSwapRecommendationsV055();renderResults();
    const allowed=recs.filter(x=>recommendationAllowedV056(x.card)).length;if($('swapControlStatusV056'))$('swapControlStatusV056').textContent=`${policyLabelV056()}・最大${swapSettingsV056.maxChanges}枚・追加候補${allowed.toLocaleString()}件から、デッキ全体が改善する${currentSwapRecommendationsV055.length}案を表示。`;
    const foundation=deckFoundationModelV0610(deck),rampCount=foundation.rc.ramp||0;
    status(`${migrated?'Sideboardを別欄へ自動分離。':''}メイン${stats.total}枚／サイド${sideCountV0610()}枚。マナ加速${rampCount}枚（通常土地は除外）。全体評価${foundation.score}/100、入れ替え提案${currentSwapRecommendationsV055.length}件。`,100);
  }catch(error){console.error(error);status('デッキ分析中にエラーが発生しました：'+(error?.message||error),0);}finally{$('analyzeBtn').disabled=false;}
};

function combinedDeckExportV0610(){
  const entries=deckInputsV0610(),main=rebuildMainTextV0610(entries),side=rebuildSideTextV0610(entries);return main+(side?'\n\nSideboard\n'+side:'');
}
function bindDeckInputControlsV0610(){
  if($('analyzeBtn'))$('analyzeBtn').onclick=analyze;
  if($('sampleBtn'))$('sampleBtn').onclick=()=>{$('deckInput').value='Deck\n4 Llanowar Elves\n4 Mossborn Hydra\n4 Innkeeper\'s Talent\n4 Snakeskin Veil\n4 Bushwhack\n4 Pawpatch Formation\n4 Bristly Bill, Spine Sower\n4 Railway Brawler\n2 Archdruid\'s Charm\n2 Nissa, Ascended Animist\n24 Forest';if($('sideboardInput'))$('sideboardInput').value='2 Pick Your Poison\n2 Soul-Guide Lantern';};
  if($('saveBtn'))$('saveBtn').onclick=()=>{const text=$('deckInput').value.trim(),sideText=$('sideboardInput')?.value.trim()||'';if(!text)return;const name=prompt('保存名','マイデッキ');if(!name)return;const a=saves();a.unshift({name,text,sideText,time:Date.now()});localStorage.setItem('mtgSavedDecks',JSON.stringify(a.slice(0,30)));renderSaves();};
  window.loadSave=i=>{const x=saves()[i];$('deckInput').value=x?.text||'';if($('sideboardInput'))$('sideboardInput').value=x?.sideText||'';document.querySelector('[data-view="analyzer"]')?.click();};
  if($('copyDeckBtn'))$('copyDeckBtn').onclick=async()=>{const text=combinedDeckExportV0610().trim();if(!text)return toast('コピーするデッキがありません');try{await navigator.clipboard.writeText(text);toast('メイン＋サイドをArena形式でコピーしました')}catch{toast('コピーできませんでした。手動で選択してください')}};
  if($('clearDeckBtn'))$('clearDeckBtn').onclick=()=>{const has=($('deckInput')?.value||'').trim()||($('sideboardInput')?.value||'').trim();if(!has||confirm('メインデッキとサイドボードの入力を消去しますか？')){$('deckInput').value='';if($('sideboardInput'))$('sideboardInput').value='';toast('メインとサイドの入力を消去しました')}};
  if($('swapUndoV056'))$('swapUndoV056').onclick=undoSwapV056;
}
bindDeckInputControlsV0610();
document.querySelectorAll('.tab').forEach(tab=>tab.addEventListener('click',()=>setTimeout(bindDeckInputControlsV0610,0)));

/* Surface the corrected categorization immediately in card/deck views. */
if($('status'))$('status').textContent='v0.6.10：メインとサイドを分離し、通常土地をマナ加速から除外して分析します。';

renderSwapCompareV056=function(){
  const root=$('swapCompareV056');if(!root)return;if(!currentSwapRecommendationsV055.length){root.innerHTML='<div class="empty">比較できる改善案がありません。</div>';return;}
  root.innerHTML=currentSwapRecommendationsV055.slice(0,3).map((item,index)=>`<button class="swapCompareCardV056" data-swapfocus="${index}"><small>案 ${index+1}・${item.qty}枚変更</small><strong>${esc(displayName(item.cut.card))} → ${esc(displayName(item.add.card))}</strong><div class="swapCompareMetricsV056"><span>全体 +${item.deltaFoundation||0}</span><span>接続 ${item.deltaConnections>=0?'+':''}${item.deltaConnections}</span><span>不足 ${item.deltaGaps>0?'-'+item.deltaGaps:item.deltaGaps===0?'±0':'+'+Math.abs(item.deltaGaps)}</span></div></button>`).join('');
};

/* Deck Optimization Engine alpha v0.7.0 */
const APP_VERSION_V070='0.7.0';
let currentDeckOptimizationV070=null;

function mainResolvedEntriesV070(entries=deck){return (entries||[]).filter(e=>!e.side&&e.card&&(+e.qty||0)>0);}
function availableCopiesV070(entries,card){return mainResolvedEntriesV070(entries).filter(e=>entryMatchesCardV055(e,card)).reduce((s,e)=>s+(+e.qty||0),0);}
function removeCopiesV070(entries,card,qty=1){
  const out=(entries||[]).map(e=>({...e}));let remaining=Math.max(0,+qty||0);
  for(const e of out){if(remaining<=0)break;if(e.side||!e.card||!entryMatchesCardV055(e,card))continue;const take=Math.min(+e.qty||0,remaining);e.qty-=take;remaining-=take;}
  return remaining>0?null:out.filter(e=>(+e.qty||0)>0);
}
function applyProposalEntriesV070(entries,item){
  if(!item?.cut?.card||!item?.add?.card||!(+item.qty>0))return null;
  if(availableCopiesV070(entries,item.cut.card)<item.qty)return null;
  let out=removeCopiesV070(entries,item.cut.card,item.qty);if(!out)return null;
  const existing=out.find(e=>!e.side&&e.card&&entryMatchesCardV055(e,item.add.card));
  if(existing)existing.qty+=item.qty;else out.push({qty:item.qty,name:item.add.card.name,side:false,card:item.add.card});
  return out;
}
function deficitUnitsV070(model){return (model?.deficits||[]).reduce((s,d)=>s+Math.max(0,(+d.target||0)-(+d.count||0)),0);}
function cardRoleKeysV070(card){
  const p=knowledgeProfile(card),tags=p.tags||[],f=features(card),keys=[];
  if(tags.some(t=>['single_removal','board_wipe','counterspell','bounce'].includes(t))||(f.roles||[]).includes('removal'))keys.push('removal');
  if(tags.some(t=>['draw_cards','impulse','tutor'].includes(t))||(f.roles||[]).includes('draw'))keys.push('draw');
  if(isRampCardV0610(card))keys.push('ramp');
  if(tags.includes('protection')||(f.roles||[]).includes('protection'))keys.push('protection');
  if(tags.some(t=>['direct_damage','alternate_win','evasion','go_wide','go_tall'].includes(t))||(f.roles||[]).includes('finisher'))keys.push('finisher');
  return unique(keys);
}
function dependencyLabelV070(key){return ({removal:'除去／妨害',draw:'手札補充',ramp:'マナ加速',protection:'保護',finisher:'勝ち筋'})[key]||key;}
function cardDependencyV070(entry,beforeModel,entries=deck){
  if(!entry?.card)return {level:'none',score:0,reasons:[],verified:false};
  const coreNames=verifiedCoreNamesV055(beforeModel?.profile||currentDeckKnowledgeV054||deckKnowledgeProfileV054(mainResolvedEntriesV070(entries)));
  const verified=cardNameVariantsV053(entry.card).some(x=>coreNames.has(x));
  const reduced=removeCopiesV070(entries,entry.card,1);if(!reduced)return {level:'none',score:0,reasons:[],verified};
  const after=deckFoundationModelV0610(reduced),before=beforeModel||deckFoundationModelV0610(entries);
  const connectionLoss=Math.max(0,(before.profile?.connections?.length||0)-(after.profile?.connections?.length||0));
  const gapIncrease=Math.max(0,(after.profile?.gaps?.length||0)-(before.profile?.gaps?.length||0));
  const foundationLoss=Math.max(0,(before.score||0)-(after.score||0));
  const scarceRoles=[];for(const key of cardRoleKeysV070(entry.card)){const target=before.targets?.[key]||0,count=before.rc?.[key]||0;if(target>0&&count<=target+1)scarceRoles.push(key);}
  let score=foundationLoss+connectionLoss*6+gapIncrease*5+scarceRoles.length*5+(verified?40:0);
  const reasons=[];
  if(verified)reasons.push('検証済みシナジーの構成カード');
  if(connectionLoss)reasons.push(`1枚減らすと効果接続が${connectionLoss}件減る`);
  if(gapIncrease)reasons.push(`1枚減らすと不足・孤立が${gapIncrease}件増える`);
  if(scarceRoles.length)reasons.push(`${scarceRoles.map(dependencyLabelV070).join('・')}の必要枠を担う`);
  if(foundationLoss>=4)reasons.push(`単独削減で全体評価 -${foundationLoss}`);
  const level=verified||score>=18?'high':score>=8?'medium':'low';
  return {level,score:Math.round(score),reasons:unique(reasons).slice(0,3),verified,connectionLoss,gapIncrease,foundationLoss,scarceRoles};
}
function optimizationIssuesV070(model){
  const issues=[];
  for(const d of model.deficits||[])issues.push({kind:'deficit',key:d.key,label:`${d.label}が不足`,detail:`${d.count}/${d.target}枚`,priority:95+Math.max(0,d.target-d.count)*4});
  for(const g of (model.profile?.gaps||[]).slice(0,6))issues.push({kind:'gap',key:g.code||g.tag||'',label:g.label,detail:g.kind==='coverage'?'役割不足':'効果経路が未接続',priority:g.kind==='coverage'?82:76});
  const s=model.stats||{};const minLand=s.avg<2.1?20:s.avg<2.8?22:s.avg<3.6?23:24,maxLand=s.avg<2.1?24:s.avg<2.8?26:s.avg<3.6?27:28;
  if(s.lands<minLand)issues.push({kind:'structure',key:'lands',label:'土地枚数が少ない',detail:`${s.lands}枚 / 目安${minLand}枚以上`,priority:100});
  if(s.lands>maxLand)issues.push({kind:'structure',key:'lands',label:'土地枚数が多い',detail:`${s.lands}枚 / 目安${maxLand}枚以下`,priority:72});
  const core=(s.curve?.[1]||0)+(s.curve?.[2]||0)+(s.curve?.[3]||0);if(core<18)issues.push({kind:'curve',key:'early',label:'1～3マナ域が薄い',detail:`現在${core}枚`,priority:68});
  for(const e of model.excess||[])issues.push({kind:'excess',key:e.key,label:`${e.label}が過剰気味`,detail:`${e.count}枚 / 基準${e.target}枚`,priority:58});
  return issues.sort((a,b)=>b.priority-a.priority).slice(0,8);
}
function optimizerObjectiveForProposalV070(item,before){
  const fills=candidateFillsDeficitV0610(item.add,before),keys=cardRoleKeysV070(item.add.card),notes=[];let boost=0;
  if(fills.length){boost+=fills.length*12;notes.push(`${fills.map(x=>x.label).join('・')}不足を直接補う`);}
  if(item.deltaGaps>0){boost+=item.deltaGaps*7;notes.push(`不足・孤立を${item.deltaGaps}件減らす`);}
  if(item.deltaConnections>0){boost+=item.deltaConnections*5;notes.push(`効果接続を${item.deltaConnections}件増やす`);}
  const deficitKeys=new Set((before.deficits||[]).map(x=>x.key));if(keys.some(k=>deficitKeys.has(k)))boost+=8;
  return {boost,notes:unique(notes)};
}

const buildSwapRecommendationsBaseV070=buildSwapRecommendationsV055;
buildSwapRecommendationsV055=function(stats,profile,recommendations,mainResolved){
  const before=deckFoundationModelV0610(deck),dependencyCache=new Map();
  const raw=buildSwapRecommendationsBaseV070(stats,profile,recommendations,mainResolved),out=[];
  for(const item of raw){
    const key=item.cut.card.oracle_id||item.cut.card.name;let dep=dependencyCache.get(key);
    if(!dep){const entry=mainResolved.find(e=>entryMatchesCardV055(e,item.cut.card));dep=cardDependencyV070(entry,before,deck);dependencyCache.set(key,dep);}
    item.cutDependencyV070=dep;
    if(dep.verified)continue;
    if(dep.level==='high'&&(item.deltaFoundation<5||item.deltaConnections<0||item.deltaGaps<0))continue;
    if(dep.level==='medium'&&item.deltaFoundation<3&&item.deltaConnections<=0&&item.deltaGaps<=0)continue;
    const objective=optimizerObjectiveForProposalV070(item,before);item.optimizerObjectiveV070=objective;
    item.pairScore+=(objective.boost||0)-(dep.level==='high'?12:dep.level==='medium'?5:0);
    out.push(item);
  }
  return out.sort((a,b)=>b.pairScore-a.pairScore||b.deltaFoundation-a.deltaFoundation).slice(0,6);
};

function evaluateOptimizationPlanV070(items,before){
  let entries=deck.map(e=>({...e}));
  for(const item of items){entries=applyProposalEntriesV070(entries,item);if(!entries)return null;}
  const after=deckFoundationModelV0610(entries),changes=items.reduce((s,x)=>s+(+x.qty||0),0);
  const deficitGain=deficitUnitsV070(before)-deficitUnitsV070(after),gapGain=(before.profile.gaps?.length||0)-(after.profile.gaps?.length||0),connectionGain=(after.profile.connections?.length||0)-(before.profile.connections?.length||0),delta=after.score-before.score;
  const newDeficitKeys=(after.deficits||[]).filter(x=>!(before.deficits||[]).some(y=>y.key===x.key)).map(x=>x.label);
  const protectedCuts=items.filter(x=>x.cutDependencyV070?.level==='high').length;
  if(delta<=0)return null;
  if(newDeficitKeys.length&&delta<7)return null;
  if(connectionGain<0&&gapGain<=0&&deficitGain<=0)return null;
  const reasons=[];if(delta>0)reasons.push(`デッキ全体評価 +${delta}`);if(deficitGain>0)reasons.push(`不足役割を${deficitGain}枠改善`);if(gapGain>0)reasons.push(`不足・孤立を${gapGain}件改善`);if(connectionGain>0)reasons.push(`効果接続を${connectionGain}件追加`);
  const concerns=[];if(connectionGain<0)concerns.push(`効果接続 ${connectionGain}`);if(after.stats.avg>before.stats.avg+0.25)concerns.push(`平均MV +${(after.stats.avg-before.stats.avg).toFixed(2)}`);if(newDeficitKeys.length)concerns.push(`新しい不足：${newDeficitKeys.join('・')}`);if(protectedCuts)concerns.push('依存度の高いカードを変更');
  const score=Math.round(delta*10+deficitGain*14+gapGain*6+connectionGain*5-changes*1.5-protectedCuts*10);
  return {items,entries,before,after,changes,delta,deficitGain,gapGain,connectionGain,newDeficitKeys,reasons,concerns,score};
}
function buildOptimizationPlansV070(before){
  const maxChanges=Math.max(1,+swapSettingsV056.maxChanges||2),source=(currentSwapRecommendationsV055||[]).slice(0,6),plans=[];
  const seen=new Set();
  function add(items){
    const sig=items.map(x=>`${x.cut.card.oracle_id||x.cut.card.name}>${x.add.card.oracle_id||x.add.card.name}:${x.qty}`).sort().join('|');if(seen.has(sig))return;seen.add(sig);
    const p=evaluateOptimizationPlanV070(items,before);if(p&&p.changes<=maxChanges)plans.push(p);
  }
  source.forEach(x=>{if(x.qty<=maxChanges)add([x]);});
  for(let i=0;i<source.length;i++)for(let j=i+1;j<source.length;j++){const a=source[i],b=source[j];if(a.qty+b.qty<=maxChanges)add([a,b]);}
  if(maxChanges>=3){for(let i=0;i<Math.min(5,source.length);i++)for(let j=i+1;j<Math.min(5,source.length);j++)for(let k=j+1;k<Math.min(5,source.length);k++){const group=[source[i],source[j],source[k]];if(group.reduce((s,x)=>s+x.qty,0)<=maxChanges)add(group);}}
  return plans.sort((a,b)=>b.score-a.score||b.delta-a.delta||a.changes-b.changes).slice(0,3);
}
function buildDeckOptimizationV070(){
  if(!deck.length||!mainResolvedEntriesV070().length)return null;
  const before=deckFoundationModelV0610(deck),issues=optimizationIssuesV070(before),protectedCards=[];
  for(const entry of mainResolvedEntriesV070()){
    const dep=cardDependencyV070(entry,before,deck);if(dep.level==='high'||dep.level==='medium')protectedCards.push({entry,dep});
  }
  protectedCards.sort((a,b)=>b.dep.score-a.dep.score);
  const plans=buildOptimizationPlansV070(before),objective=issues[0]||{label:'明確な不足なし',detail:'構造を壊さず接続と効率を改善',priority:0};
  return {before,issues,protectedCards:protectedCards.slice(0,8),plans,objective,maxChanges:Math.max(1,+swapSettingsV056.maxChanges||2),policy:policyLabelV056()};
}
function optimizerIssueHTMLV070(issue){const cls=issue.priority>=90?'critical':issue.priority>=70?'warn':'soft';return `<div class="optimizerIssueV070 ${cls}"><div><b>${esc(issue.label)}</b><small>${esc(issue.detail||'')}</small></div><span>${issue.priority>=90?'優先':issue.priority>=70?'注意':'監視'}</span></div>`;}
function optimizerProtectedHTMLV070(x){return `<div class="optimizerProtectedV070"><div><b>${esc(displayName(x.entry.card))} ×${x.entry.qty}</b><small>${esc((x.dep.reasons||[]).join('／')||'効果接続への依存度が高い')}</small></div><span>${x.dep.level==='high'?'保護':'注意'}</span></div>`;}
function optimizerPlanHTMLV070(plan,index){
  const changes=plan.items.map(x=>`<div class="optimizerSwapRowV070"><span class="out">OUT ${x.qty}</span><button class="textButton" data-detail="${esc(x.cut.card.name)}">${esc(displayName(x.cut.card))}</button><b>→</b><span class="in">IN ${x.qty}</span><button class="textButton" data-detail="${esc(x.add.card.name)}">${esc(displayName(x.add.card))}</button></div>`).join('');
  const reasons=plan.reasons.length?plan.reasons.map(x=>`<span class="optimizerChipV070 good">${esc(x)}</span>`).join(''):'<span class="optimizerChipV070">構造維持</span>';
  const concerns=plan.concerns.length?`<div class="optimizerConcernsV070"><b>トレードオフ</b>${plan.concerns.map(x=>`<span>${esc(x)}</span>`).join('')}</div>`:'<div class="optimizerConcernsV070 good"><b>重大な悪化を検出せず</b></div>';
  return `<article class="optimizerPlanV070"><div class="optimizerPlanHeadV070"><div><span>最適化案 ${index+1}</span><h3>${plan.changes}枚変更</h3></div><div class="optimizerDeltaV070"><small>全体評価</small><strong>${plan.before.score} → ${plan.after.score}</strong><b>+${plan.delta}</b></div></div><div class="optimizerSwapListV070">${changes}</div><div class="optimizerChipsV070">${reasons}</div>${concerns}<div class="swapActions"><button class="btn" data-optapply="${index}">この最適化案を適用</button></div></article>`;
}
function renderDeckOptimizerV070(){
  const root=$('deckOptimizerV070'),count=$('optimizerPlanCountV070');if(!root)return;
  currentDeckOptimizationV070=buildDeckOptimizationV070();const m=currentDeckOptimizationV070;
  if(!m){root.innerHTML='<div class="empty">デッキ分析後、優先課題・保護すべき構成要素・複数枚を含む最適化案を表示します。</div>';if(count)count.textContent='0案';return;}
  if(count)count.textContent=`${m.plans.length}案`;
  const issues=m.issues.length?m.issues.map(optimizerIssueHTMLV070).join(''):'<div class="deckIntelGood">✓ 現在の基礎構造に大きな不足は検出されませんでした。</div>';
  const protectedHTML=m.protectedCards.length?m.protectedCards.map(optimizerProtectedHTMLV070).join(''):'<div class="tiny">自動保護が必要な高依存カードは検出されませんでした。</div>';
  const plans=m.plans.length?m.plans.map(optimizerPlanHTMLV070).join(''):'<div class="empty">現在の条件では、全体評価を改善する安全な最適化案を作れませんでした。無理な交換は提案しません。</div>';
  root.innerHTML=`<div class="optimizerSummaryV070"><div><span>現在のDeck Foundation</span><strong>${m.before.score}<small>/100</small></strong></div><div><span>最優先課題</span><b>${esc(m.objective.label)}</b><small>${esc(m.objective.detail||'')}</small></div><div><span>探索条件</span><b>${esc(m.policy)}</b><small>最大${m.maxChanges}枚変更</small></div></div><div class="optimizerGridV070"><section><h3>優先課題</h3>${issues}</section><section><h3>自動保護する構成要素</h3><p class="tiny">検証済みシナジーや、1枚減らすだけで接続・不足が悪化するカードを優先的に守ります。</p>${protectedHTML}</section></div><section class="optimizerPlansV070"><div class="knowledgeHeader"><div><h3>デッキ全体の最適化案</h3><p class="notice">単体評価ではなく、OUT→INを適用した後のメインデッキ全体を再計算しています。</p></div></div>${plans}</section><div class="ruleDisclaimer"><b>α版の注意：</b>最適化点は勝率予測ではありません。現在のカード本文、役割、Rule/Knowledge接続、マナカーブ、Deck Foundationを使った構築支援です。メタゲームと対戦相手別サイドプランはまだ含みません。</div>`;
  bindActionContainer(root);
}
function applyOptimizationPlanV070(index){
  const plan=currentDeckOptimizationV070?.plans?.[index];if(!plan)return toast('適用できる最適化案がありません');
  pushSwapHistoryV056(`Deck Optimization案 ${index+1}`);
  let entries=parseDeckTextV0610($('deckInput')?.value||'',false).filter(e=>!e.side).map(e=>({...e,side:false,card:findPoolCard(e.name)||null}));
  for(const item of plan.items){const next=applyProposalEntriesV070(entries,item);if(!next){toast('現在のデッキ内容が変わったため、最適化案を再計算してください');return;}entries=next;}
  $('deckInput').value=rebuildMainTextV0610(entries.filter(e=>!e.side&&e.qty>0));toast(`最適化案${index+1}を適用しました。サイドボードは変更していません。`);setTimeout(()=>analyze(),80);
}
function bindDeckOptimizerV070(){
  const root=$('deckOptimizerV070');if(root&&!root.dataset.boundV070){root.dataset.boundV070='1';root.addEventListener('click',e=>{const b=e.target.closest('[data-optapply]');if(b)applyOptimizationPlanV070(+b.dataset.optapply);});}
  const recalc=$('optimizerRecalcV070');if(recalc)recalc.onclick=()=>{if(!deck.length)return toast('先にデッキを分析してください');renderDeckOptimizerV070();toast('最適化案を再計算しました');};
  if($('analyzeBtn'))$('analyzeBtn').onclick=analyze;
}

const analyzeBaseV070=analyze;
analyze=async function(){await analyzeBaseV070();renderDeckOptimizerV070();bindDeckOptimizerV070();};
const refreshSwapPlannerBaseV070=refreshSwapPlannerV056;
refreshSwapPlannerV056=function(showMessage=false){refreshSwapPlannerBaseV070(showMessage);setTimeout(()=>{renderDeckOptimizerV070();bindDeckOptimizerV070();},180);};

bindDeckOptimizerV070();
document.querySelectorAll('.tab').forEach(tab=>tab.addEventListener('click',()=>setTimeout(bindDeckOptimizerV070,0)));
if($('status'))$('status').textContent='v0.7.0：Deck Optimization Engine α。優先課題からOUT→INを選び、交換後のデッキ全体を再評価します。';

/* Deck Optimization Candidate Search hotfix v0.7.0a
   v0.7.0 combined the already-generated Swap Planner candidates, so the visible
   OUT→IN pairs could remain unchanged. v0.7.0a searches candidates from the
   diagnosed deck issues first, then evaluates the resulting deck state. */
function issueGapV070a(issue,before){
  return (before?.profile?.gaps||[]).find(g=>String(g.code||g.tag||'')===String(issue?.key||''))||null;
}
function issueMatchV070a(card,issue,before){
  if(!card||!issue)return 0;
  const p=knowledgeProfile(card),tags=p.tags||[],roles=cardRoleKeysV070(card),land=isLandCardV0610(card),cmc=+card.cmc||0;
  if(issue.kind==='deficit')return roles.includes(issue.key)?56:0;
  if(issue.kind==='gap'){
    const g=issueGapV070a(issue,before);if(!g)return 0;
    if(g.kind==='coverage')return (g.tags||[]).some(t=>tags.includes(t))?48:0;
    if(g.kind==='consumer'){
      const wanted=TAG_CONNECTIONS.filter(x=>x[0]===g.tag).map(x=>x[1]);
      return wanted.some(t=>tags.includes(t))?50:0;
    }
    if(g.kind==='supplier'){
      const wanted=TAG_CONNECTIONS.filter(x=>x[1]===g.tag).map(x=>x[0]);
      return wanted.some(t=>tags.includes(t))?50:0;
    }
  }
  if(issue.kind==='structure'&&issue.key==='lands'){
    const tooFew=(before?.stats?.lands||0)<22;return tooFew?(land?60:0):(land?0:26);
  }
  if(issue.kind==='curve'&&issue.key==='early')return !land&&cmc>=1&&cmc<=3?36:0;
  if(issue.kind==='excess')return roles.includes(issue.key)?0:14;
  return 0;
}
function connectionPotentialV070a(card,before){
  const tags=new Set(knowledgeProfile(card).tags||[]),deckTags=before?.profile?.tagCounts||{};let n=0;
  for(const [from,to] of TAG_CONNECTIONS){
    if(tags.has(from)&&(deckTags[to]||0)>0)n++;
    if(tags.has(to)&&(deckTags[from]||0)>0)n++;
  }
  return n;
}
function directedCandidateScoreV070a(rec,before,issues){
  const card=rec.card,stats=before.stats||{},f=features(card),outside=(f.colors||[]).filter(x=>!(stats.cols||[]).includes(x));
  if(outside.length)return -999;
  const land=isLandCardV0610(card),landIssue=(issues||[]).find(x=>x.kind==='structure'&&x.key==='lands');
  if(land&&!landIssue)return -120; // utility-land swaps are deferred; avoid noisy land proposals.
  let score=Math.max(0,+rec.score||0)*.45;
  (issues||[]).slice(0,5).forEach((issue,i)=>{const m=issueMatchV070a(card,issue,before);if(m)score+=m*Math.max(.45,1-i*.14);});
  const cp=connectionPotentialV070a(card,before);score+=Math.min(36,cp*7);
  const rd=rec.recommendationDecision?.score;if(Number.isFinite(rd))score+=(rd-50)*.35;
  if((rec.relations||[]).includes('ENGINE'))score+=10;
  if((rec.relations||[]).includes('SYNERGY'))score+=7;
  if((rec.relations||[]).includes('COVERAGE'))score+=8;
  return score;
}
function directedCandidatePoolV070a(stats,before,mainResolved,recommendations){
  const issues=optimizationIssuesV070(before),present=new Set((mainResolved||[]).map(e=>e.card?.oracle_id||e.card?.name)),map=new Map();
  function addRec(rec){
    if(!rec?.card||!recommendationAllowedV056(rec.card))return;
    const key=rec.card.oracle_id||rec.card.name;if(present.has(key))return;
    const s=directedCandidateScoreV070a(rec,before,issues);if(s<=0)return;
    const old=map.get(key);if(!old||s>old.directedScoreV070a)map.set(key,{...rec,directedScoreV070a:s});
  }
  // Existing recommendation list remains useful, but it no longer defines the search space.
  (recommendations||[]).slice(0,260).forEach(addRec);
  // Explicitly search the whole legal pool for cards that directly answer a diagnosed issue.
  for(const card of pool){
    const key=card.oracle_id||card.name;if(present.has(key)||map.has(key)||!recommendationAllowedV056(card))continue;
    let direct=0;for(const issue of issues.slice(0,5))direct=Math.max(direct,issueMatchV070a(card,issue,before));
    if(direct<=0)continue;
    const rec=scoreCard(card,stats,$('strategy')?.value||'balanced',mainResolved||[]);
    if(!(rec.why||[]).length)rec.why=[`デッキ診断の「${issues.find(x=>issueMatchV070a(card,x,before)>0)?.label||'優先課題'}」に直接対応`];
    addRec(rec);
  }
  return [...map.values()].sort((a,b)=>b.directedScoreV070a-a.directedScoreV070a||(+b.score||0)-(+a.score||0)).slice(0,64);
}
function cutPriorityV070a(cut,before,issues,dep){
  let score=+cut.score||0;
  if(dep?.verified)return -999;
  if(dep?.level==='high')score-=42;else if(dep?.level==='medium')score-=16;else score+=8;
  const roles=cardRoleKeysV070(cut.card),land=isLandCardV0610(cut.card),cmc=+cut.card.cmc||0;
  for(const issue of (issues||[]).slice(0,5)){
    if(issue.kind==='excess'&&roles.includes(issue.key))score+=30;
    if(issue.kind==='structure'&&issue.key==='lands'&&land&&(before.stats?.lands||0)>26)score+=38;
    if(issue.kind==='curve'&&issue.key==='early'&&!land&&cmc>=4)score+=10;
  }
  return score;
}
function buildDirectedSwapsV070a(stats,before,mainResolved,recommendations){
  const issues=optimizationIssuesV070(before),candidatePool=directedCandidatePoolV070a(stats,before,mainResolved,recommendations),cuts=[];
  for(const entry of mainResolved||[]){
    const cut=cutCandidateV055(entry,stats,before.profile);if(!cut)continue;
    const dep=cardDependencyV070(entry,before,deck),priority=cutPriorityV070a(cut,before,issues,dep);if(priority<=-100)continue;
    cut.cutDependencyV070=dep;cut.directedCutScoreV070a=priority;cuts.push(cut);
  }
  cuts.sort((a,b)=>b.directedCutScoreV070a-a.directedCutScoreV070a);
  const proposals=[],maxSetting=Math.max(1,+swapSettingsV056.maxChanges||2);
  for(const rec of candidatePool.slice(0,48)){
    let best=null;
    for(const cut of cuts.slice(0,26)){
      const candidateLand=isLandCardV0610(rec.card);if(swapSettingsV056.keepLands&&candidateLand!==cut.isLand)continue;
      const existing=countCardInDeckV056(rec.card),legalMax=isBasicLandV055(rec.card)?maxSetting:Math.max(0,4-existing);if(legalMax<1)continue;
      let qty=1;
      const fills=candidateFillsDeficitV0610(rec,before),needed=fills.reduce((m,d)=>Math.max(m,(+d.target||0)-(+d.count||0)),0);
      if(needed>=2&&rec.directedScoreV070a>=55)qty=2;
      qty=Math.min(qty,cut.maxCut,maxSetting,legalMax);if(qty<1)continue;
      const simulated=simulateSwapEntriesV055(deck,cut.card,rec.card,qty),after=deckFoundationModelV0610(simulated),delta=after.score-before.score;
      const deficitGain=deficitUnitsV070(before)-deficitUnitsV070(after),gapGain=(before.profile.gaps?.length||0)-(after.profile.gaps?.length||0),connectionGain=(after.profile.connections?.length||0)-(before.profile.connections?.length||0);
      const newDeficits=(after.deficits||[]).filter(d=>!(before.deficits||[]).some(b=>b.key===d.key));
      if(delta<=0)continue;
      if(newDeficits.length&&delta<8)continue;
      if(connectionGain<0&&gapGain<=0&&deficitGain<=0)continue;
      const compatibility=slotCompatibilityV055(rec,cut,stats);if(compatibility<=-50&&!fills.length)continue;
      const issueBoost=(issues||[]).slice(0,4).reduce((s,issue,i)=>s+issueMatchV070a(rec.card,issue,before)*Math.max(.35,.8-i*.12),0);
      const dep=cut.cutDependencyV070||{level:'low'};
      const depPenalty=dep.level==='high'?35:dep.level==='medium'?12:0;
      const pairScore=delta*16+deficitGain*20+gapGain*9+connectionGain*7+issueBoost+(+rec.directedScoreV070a||0)*.35+(+cut.directedCutScoreV070a||0)-depPenalty;
      const notes=[];
      if(fills.length)notes.push(`優先課題：${fills.map(x=>x.label).join('・')}不足を補う`);
      const matched=issues.find(x=>issueMatchV070a(rec.card,x,before)>0);if(matched)notes.push(`診断課題「${matched.label}」から候補を探索`);
      if(deficitGain>0)notes.push(`不足役割を${deficitGain}枠改善`);
      if(gapGain>0)notes.push(`不足・孤立を${gapGain}件改善`);
      if(connectionGain>0)notes.push(`効果接続を${connectionGain}件追加`);
      notes.push(`デッキ全体評価 ${before.score} → ${after.score}`);
      const item={add:rec,cut,qty,pairScore,afterStats:after.stats,afterProfile:after.profile,deltaEngine:(after.profile.engineScore||0)-(before.profile.engineScore||0),deltaConnections:connectionGain,deltaGaps:gapGain,landDelta:(after.stats.lands||0)-(before.stats.lands||0),foundationBefore:before,foundationAfter:after,deltaFoundation:delta,balanceNotes:unique(notes),cutDependencyV070:dep,optimizerObjectiveV070:{boost:issueBoost,notes:unique(notes)},directedV070a:true};
      if(!best||item.pairScore>best.pairScore)best=item;
    }
    if(best)proposals.push(best);
  }
  proposals.sort((a,b)=>b.pairScore-a.pairScore||b.deltaFoundation-a.deltaFoundation);
  const out=[],usedAdds=new Set(),cutUse=new Map();
  for(const item of proposals){
    const ak=cardKeyV056(item.add.card),ck=cardKeyV056(item.cut.card);if(usedAdds.has(ak)||(cutUse.get(ck)||0)>=2)continue;
    usedAdds.add(ak);cutUse.set(ck,(cutUse.get(ck)||0)+1);out.push(item);if(out.length>=8)break;
  }
  return out;
}

const buildSwapRecommendationsBaseV070a=buildSwapRecommendationsV055;
buildSwapRecommendationsV055=function(stats,profile,recommendations,mainResolved){
  const before=deckFoundationModelV0610(deck),directed=buildDirectedSwapsV070a(stats,before,mainResolved,recommendations);
  if(directed.length)return directed.slice(0,6);
  return buildSwapRecommendationsBaseV070a(stats,profile,recommendations,mainResolved);
};

buildOptimizationPlansV070=function(before){
  const maxChanges=Math.max(1,+swapSettingsV056.maxChanges||2),stats=before.stats||deckStats(deck),main=mainResolvedEntriesV070(),source=buildDirectedSwapsV070a(stats,before,main,recs||[]).slice(0,8),plans=[],seen=new Set();
  function add(items){
    const sig=items.map(x=>`${x.cut.card.oracle_id||x.cut.card.name}>${x.add.card.oracle_id||x.add.card.name}:${x.qty}`).sort().join('|');if(seen.has(sig))return;seen.add(sig);
    const p=evaluateOptimizationPlanV070(items,before);if(p&&p.changes<=maxChanges){p.searchModeV070a='課題起点探索';plans.push(p);}
  }
  source.forEach(x=>{if(x.qty<=maxChanges)add([x]);});
  for(let i=0;i<source.length;i++)for(let j=i+1;j<source.length;j++){const a=source[i],b=source[j];if(a.qty+b.qty<=maxChanges)add([a,b]);}
  if(maxChanges>=3){for(let i=0;i<Math.min(6,source.length);i++)for(let j=i+1;j<Math.min(6,source.length);j++)for(let k=j+1;k<Math.min(6,source.length);k++){const g=[source[i],source[j],source[k]];if(g.reduce((s,x)=>s+x.qty,0)<=maxChanges)add(g);}}
  return plans.sort((a,b)=>b.score-a.score||b.delta-a.delta||a.changes-b.changes).slice(0,3);
};

const renderDeckOptimizerBaseV070a=renderDeckOptimizerV070;
renderDeckOptimizerV070=function(){
  renderDeckOptimizerBaseV070a();
  const root=$('deckOptimizerV070');if(!root)return;
  const h=root.querySelector('.optimizerPlansV070 .knowledgeHeader .notice');
  if(h)h.textContent='v0.7.0a：既存の入れ替え候補を並べ替えるのではなく、デッキ診断の優先課題から全カード候補を再探索し、OUT→IN後のメインデッキ全体を再計算します。';
};

if($('status'))$('status').textContent='v0.7.0a：Deck Optimization候補探索を課題起点へ修正。既存Swap候補の再利用だけではなく、診断結果からIN候補を再探索します。';
