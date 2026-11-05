// Lazy-loaded market context; public endpoints may rate-limit, so fail visibly.
const ids={BTC:'bitcoin',ETH:'ethereum',BNB:'binancecoin',ADA:'cardano',SOL:'solana',SUI:'sui',ONDO:'ondo-finance',ZRO:'layerzero'};
const names={BTC:'Bitcoin',ETH:'Ethereum',BNB:'BNB',ADA:'Cardano',SOL:'Solana',SUI:'Sui',ONDO:'Ondo',ZRO:'LayerZero'};
const cache=new Map(),ttl=10*60*1000;
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pct=n=>Number.isFinite(n)?(n>=0?'+':'')+n.toFixed(2)+'%':'—';
const fetchJSON=async url=>{const r=await fetch(url,{headers:{Accept:'application/json'}});if(!r.ok)throw Error('HTTP '+r.status);return r.json()};
async function market(code){
 const id=ids[code];if(!id)return {error:'此資產尚無可對應的加密貨幣市場資料'};
 const key='market:'+id,old=cache.get(key);if(old&&Date.now()-old.at<ttl)return old.value;
 const [markets,trending]=await Promise.allSettled([
 fetchJSON('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids='+encodeURIComponent(id)+'&price_change_percentage=7d'),
 fetchJSON('https://api.coingecko.com/api/v3/search/trending')]);
 const coin=markets.status==='fulfilled'?markets.value?.[0]:null;
 const rank=trending.status==='fulfilled'?(trending.value.coins||[]).findIndex(x=>x.item?.id===id):-1;
 const value={coin,trendingRank:rank<0?null:rank+1,marketError:markets.status==='rejected',trendingError:trending.status==='rejected'};
 cache.set(key,{at:Date.now(),value});return value;
}
async function news(code){
 const query=names[code]||code;
 const key='news:'+query,old=cache.get(key);if(old&&Date.now()-old.at<ttl)return old.value;
 const j=await fetchJSON('https://cryptocurrency.cv/api/search?q='+encodeURIComponent(query)+'&limit=5');
 const rows=Array.isArray(j)?j:Array.isArray(j.articles)?j.articles:Array.isArray(j.data)?j.data:[];
 const value=rows.filter(x=>x.title&&(x.link||x.url)).slice(0,4);
 cache.set(key,{at:Date.now(),value});return value;
}
function marketHTML(v){
 if(v.error)return '<p class="subtle">'+safe(v.error)+'</p>';
 const c=v.coin;
 return '<div class="market-context-stats"><div>市值排名<strong>'+(c?.market_cap_rank?'#'+c.market_cap_rank:'暫無資料')+'</strong></div><div>7日漲跌<strong class="'+(c?.price_change_percentage_7d_in_currency>=0?'good':'bad')+'">'+pct(c?.price_change_percentage_7d_in_currency)+'</strong></div><div>市場熱度<strong>'+(v.trendingRank?'熱門搜尋 #'+v.trendingRank:v.trendingError?'暫無資料':'未進熱門榜')+'</strong></div></div>'+(v.marketError?'<p class="subtle">市場資料暫時無法取得，稍後重試</p>':'')+'<div class="market-context-source">市值／7日：CoinGecko；熱度：CoinGecko熱門搜尋排名（非買賣情緒）</div>';
}
function newsHTML(rows){return rows.length?'<div class="market-context-news">'+rows.map(x=>{const url=x.link||x.url;let valid=false;try{valid=new URL(url).protocol==='https:'}catch{}return valid?'<a href="'+safe(url)+'" target="_blank" rel="noopener noreferrer">'+safe(x.title)+'</a>':''}).join('')+'</div>':'<p class="subtle">目前沒有找到相關新聞</p>'}
async function expand(card){
 const code=card.querySelector('[data-market-coin]')?.dataset.marketCoin;if(!code)return;
 let panel=card.querySelector('.market-context');
 if(panel){panel.remove();card.classList.remove('market-expanded');card.setAttribute('aria-expanded','false');return}
 panel=document.createElement('div');panel.className='market-context';panel.innerHTML='<div class="subtle">正在取得市場資訊與新聞…</div>';
 card.append(panel);card.classList.add('market-expanded');card.setAttribute('aria-expanded','true');
 const [m,n]=await Promise.allSettled([market(code),news(code)]);
 if(!panel.isConnected)return;
 panel.innerHTML='<h4>市場概況</h4>'+(m.status==='fulfilled'?marketHTML(m.value):'<p class="subtle">市場資訊暫時無法取得</p>')+'<h4>相關新聞／事件</h4>'+(n.status==='fulfilled'?newsHTML(n.value):'<p class="subtle">新聞來源暫時無法取得</p>')+'<div class="market-context-source">新聞為第三方來源，點擊標題閱讀原文</div>';
}
document.addEventListener('click',e=>{
 const card=e.target.closest('#prices .price-box');if(!card||e.target.closest('button,a,input'))return;expand(card);
});
document.addEventListener('keydown',e=>{if(e.key!=='Enter'&&e.key!==' ')return;const card=e.target.closest('#prices .price-box');if(card&&e.target===card){e.preventDefault();expand(card)}});
