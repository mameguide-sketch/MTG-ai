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
    try{cached=JSON.parse(localStorage.getItem('mtgStdJaV2')||'null')}catch{}
    if(!force&&cached&&Date.now()-cached.time<1000*60*60*24*14&&cached.cards?.length){
      const n=mergeJapaneseCards(cached.cards);finishJapanese(`${n.toLocaleString()}種類の日本語データを保存データから結合`);return true;
    }
    if(!pool.length){const ok=await fetchPool(false);if(!ok)return false}
    const btn=$('jpLoadBtn');if(btn){btn.disabled=true;btn.textContent='日本語取得中…'}
    let cards=[];let url=API+'/cards/search?order=name&unique=cards&include_multilingual=true&q='+encodeURIComponent('f:standard game:paper lang:ja');let page=0;
    try{
      while(url){page++;loadStatus(`日本語カード取得中：${page}ページ目`,Math.min(95,page*8));const j=await fetchJson(url,45000,4);cards.push(...j.data.filter(c=>!c.digital&&c.lang==='ja'&&c.legalities?.standard==='legal'));url=j.has_more?j.next_page:null;if(url)await sleep(300)}
      if(!cards.length)throw Error('日本語版カードが見つかりませんでした')
      cards=[...new Map(cards.filter(c=>c.oracle_id).map(c=>[c.oracle_id,c])).values()];
      try{localStorage.setItem('mtgStdJaV2',JSON.stringify({time:Date.now(),cards}))}catch{}
      const n=mergeJapaneseCards(cards);try{localStorage.setItem('mtgStdPoolV5',JSON.stringify({time:Date.now(),cards:pool}))}catch{}
      finishJapanese(`${n.toLocaleString()}種類の日本語データを結合`);return true;
    }catch(e){loadStatus('日本語データ取得に失敗しました：'+e.message,0);if($('dbStatus'))$('dbStatus').textContent='英語カードは利用できます。日本語データ取得に失敗：'+e.message;return false}
    finally{if(btn){btn.disabled=false;btn.textContent='日本語データ再取得'}}
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

try{const cached=JSON.parse(localStorage.getItem('mtgStdPoolV5')||'null');if(cached?.cards?.length){pool=cached.cards;populateCardNames();$('dbStatus').textContent=`キャッシュ済み ${pool.length.toLocaleString()}種類（日本語 ${pool.filter(hasJapanese).length.toLocaleString()}種類）`;renderDatabase();if(displayLang==='ja'&&!pool.some(hasJapanese))setTimeout(()=>fetchJapanese(false),80);}}catch{}
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
  const data={version:'0.5.1',createdAt:new Date().toISOString(),format:'Standard',tagDefinitions:Object.fromEntries(Object.entries(KNOWLEDGE_TAGS).map(([k,v])=>[k,{label:v.label,group:v.group}])),cards:engineProfiles.map(x=>({oracleId:x.card.oracle_id,name:x.card.name,japaneseName:x.card.jp?.printed_name||null,manaValue:x.card.cmc||0,colorIdentity:x.card.color_identity||[],tags:x.profile.tags,groups:x.profile.grouped,strengths:x.profile.strengths,needs:x.profile.needs,confidence:x.confidence}))};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='lunch-forge-knowledge-v0.5.1.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),500);toast('知識データを書き出しました');
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
