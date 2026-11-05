import {STORAGE_KEY} from './records.js';
import {ledgerMetrics,reconciledPortfolio,marketValue} from './calculations.js';

const fmt=(n,d=2)=>Number(n).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
const FALLBACK_FX=31.582;
let currentFx=null,loadingFx=false,fxFallback=false;
try{
  const cached=JSON.parse(localStorage.getItem('cryptoPortfolioUsdTwdFx')||'null');
  if(cached&&Number.isFinite(+cached.rate)&&+cached.rate>0&&Date.now()-(+cached.at||0)<86400000)currentFx=+cached.rate;
}catch{}
async function loadFx(){
  if(currentFx||loadingFx)return;
  loadingFx=true;
  const sources=[
    async()=>{const r=await fetch('https://open.er-api.com/v6/latest/USD',{cache:'no-store'});if(!r.ok)throw Error('FX '+r.status);const j=await r.json();return Number(j.rates?.TWD)},
    async()=>{const r=await fetch('https://api.frankfurter.dev/v1/latest?base=USD&symbols=TWD',{cache:'no-store'});if(!r.ok)throw Error('FX '+r.status);const j=await r.json();return Number(j.rates?.TWD)}
  ];
  for(const source of sources){
    try{
      const rate=await Promise.race([source(),new Promise((_,reject)=>setTimeout(()=>reject(Error('FX timeout')),5000))]);
      if(Number.isFinite(rate)&&rate>0){currentFx=rate;break}
    }catch(e){console.warn('Warehouse FX source failed',e)}
  }
  if(!currentFx){currentFx=FALLBACK_FX;fxFallback=true}
  else try{localStorage.setItem('cryptoPortfolioUsdTwdFx',JSON.stringify({rate:currentFx,at:Date.now()}))}catch{}
  loadingFx=false;
  updateWarehouseSummaries();
}
function metric(label,value,twdText,extraClass=''){
  return `<div class="warehouse-metric"><span class="warehouse-metric-label">${label}</span><strong class="warehouse-metric-value ${extraClass}">${value}</strong>${twdText?`<small class="subtle" style="display:block;font-size:11px;margin-top:4px">${twdText}</small>`:''}</div>`;
}
function updateWarehouseSummaries(){
  const dashboard=document.querySelector('#dashboard');
  if(!dashboard)return;
  const state=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');
  const metrics=ledgerMetrics(state),portfolio=reconciledPortfolio(state);
  dashboard.querySelectorAll('.fold-card').forEach(card=>{
    const title=card.querySelector('.fold-title h2')?.textContent?.trim();
    if(title!=='第一倉'&&title!=='第二倉')return;
    const first=title==='第一倉',positions=portfolio.warehouses?.[title]||[];
    const market=positions.reduce((sum,p)=>sum+marketValue(p,state.prices),0);
    const principal=metrics.firstCapital;
    const currentTwd=currentFx?market*currentFx:null;
    const money=v=>v==null?'台幣換算中…':'約 NT$'+fmt(v,0)+(fxFallback?'（參考匯率）':'');
    const html=first?
      metric('投入本金',fmt(principal)+' U',null)+
      metric('目前市值',fmt(market)+' U',money(currentTwd)):
      metric('期初資產基準',fmt(metrics.secondOpeningAssetBaseline)+' U',null)+
      metric('目前市值',fmt(market)+' U',money(currentTwd));
    let box=card.querySelector('.warehouse-metrics');
    if(!box){box=document.createElement('div');box.className='warehouse-metrics';card.querySelector('.fold-body')?.prepend(box)}
    if(box&&box.innerHTML!==html)box.innerHTML=html;
    const meta=card.querySelector('.fold-meta');
    if(meta&&meta.textContent!=='')meta.textContent='';
  });
  if(!currentFx)void loadFx();
}
let scheduled=false;
const dashboard=document.querySelector('#dashboard');
if(dashboard){
  const observer=new MutationObserver(()=>{
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(()=>{
      observer.disconnect();
      updateWarehouseSummaries();
      observer.observe(dashboard,{childList:true,subtree:true});
      scheduled=false;
    });
  });
  observer.observe(dashboard,{childList:true,subtree:true});
  updateWarehouseSummaries();
}
