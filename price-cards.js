const PAIRS={BTC:'BTCUSDT',ETH:'ETHUSDT',BNB:'BNBUSDT',ADA:'ADAUSDT',SOL:'SOLUSDT',ONDO:'ONDOUSDT',ZRO:'ZROUSDT'};
let changeCache={};
let lastFetch=0;
let fetching=null;

async function loadChanges(){
  if(Date.now()-lastFetch<60000&&Object.keys(changeCache).length)return changeCache;
  if(fetching)return fetching;
  fetching=(async()=>{
    const next={...changeCache};
    await Promise.all(Object.entries(PAIRS).map(async([asset,symbol])=>{
      try{const r=await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`);if(!r.ok)return;const j=await r.json();const pct=Number(j.priceChangePercent);if(Number.isFinite(pct))next[asset]=pct;}catch{}
    }));
    changeCache=next;lastFetch=Date.now();fetching=null;return changeCache;
  })();return fetching;
}
function changeHtml(asset,changes){const pct=changes[asset];if(!Number.isFinite(pct))return '<span class="price-change price-flat">24h —</span>';if(pct>0)return `<span class="price-change price-up">↑ ${pct.toFixed(2)}%</span>`;if(pct<0)return `<span class="price-change price-down">↓ ${Math.abs(pct).toFixed(2)}%</span>`;return '<span class="price-change price-flat">→ 0.00%</span>';}
const noteFor=asset=>({ETH:'WBETH 併入 ETH 曝險',MSTR:'Binance MSTRB / USDT'}[asset]||'\u00a0');
async function mountPriceCards(){
  const pane=document.querySelector('#prices'),table=pane?.querySelector('table');if(!pane||!table||pane.dataset.priceCardsMounted==='1')return;pane.dataset.priceCardsMounted='1';
  const rows=[...table.querySelectorAll('tbody tr')];if(!rows.length)return;const changes=await loadChanges();if(!document.body.contains(pane))return;
  const outer=document.createElement('div');outer.className='card price-panel';outer.innerHTML='<div class="price-panel-head"><h2>價格</h2><span class="muted">24h 漲跌來自 Binance；抓不到就不顯示數值</span></div><div class="price-card-grid"></div>';const grid=outer.querySelector('.price-card-grid');
  rows.forEach(row=>{const cells=row.cells,label=(cells[0]?.childNodes[0]?.textContent||cells[0]?.textContent||'').trim().split(/\s/)[0],input=cells[1]?.querySelector('input[data-price]');if(!input)return;const asset=input.dataset.price||label,card=document.createElement('div');card.className=`price-card asset-border-${asset}`;card.innerHTML=`<div class="price-card-top"><strong>${asset}</strong>${changeHtml(asset,changes)}</div><div class="price-card-note">${noteFor(asset)}</div><label class="price-card-input"><span>價格 U</span></label>`;card.querySelector('.price-card-input').appendChild(input);grid.appendChild(card);});pane.replaceChildren(outer);
}
const observer=new MutationObserver(()=>mountPriceCards());observer.observe(document.documentElement,{childList:true,subtree:true});mountPriceCards();
