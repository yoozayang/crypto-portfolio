import {reconciledPortfolio,marketValue} from './calculations.js?v=20260907-1525';

const STORAGE_KEY='cryptoPortfolioV1';
const fmt=(n,d=2)=>Number.isFinite(+n)?(+n).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const qty=n=>Number.isFinite(+n)?(+n).toLocaleString('en-US',{maximumFractionDigits:8}):'—';
const signed=n=>`${n>=0?'+':''}${fmt(n)} U`;
const noQtyAsset=a=>['STABLE','OTHER','CASH'].includes(a);
const assetLabel=p=>p.label||({STABLE:'USDT/USDC',OTHER:'其他小額資產',CASH:'USDT/USDC'}[p.asset]||p.asset);

function merge(ps,prices){
  const m=new Map();
  for(const p of ps){
    const k=`${p.warehouse}|${p.asset}`;
    const x=m.get(k)||{warehouse:p.warehouse,asset:p.asset,label:p.label,totalQty:0,totalMarket:0,trackedQty:0,trackedCost:0,trackedMarket:0,hasTracked:false,hasLegacy:false};
    x.totalQty+=+p.qty||0;
    x.totalMarket+=marketValue(p,prices);
    if(p.legacy)x.hasLegacy=true;
    else if(Number.isFinite(+p.cost)){
      x.hasTracked=true;
      x.trackedQty+=+p.qty||0;
      x.trackedCost+=+p.cost||0;
      x.trackedMarket+=marketValue(p,prices);
    }
    m.set(k,x);
  }
  return [...m.values()];
}

function cardHtml(p){
  const avg=p.hasTracked&&p.trackedQty?p.trackedCost/p.trackedQty:null;
  const u=p.hasTracked?p.trackedMarket-p.trackedCost:null;
  const nq=noQtyAsset(p.asset);
  return `<div class="holding-card"><div class="holding-card-top"><strong>${assetLabel(p)}</strong>${p.hasLegacy?'<span class="chip">含歷史差額</span>':''}</div><div class="holding-value">${fmt(p.totalMarket)} U</div><div class="holding-meta">${nq?'只管理金額':`數量 ${qty(p.totalQty)}`}${p.hasTracked?` · 成本 ${fmt(p.trackedCost)} U${avg!=null?` · 均價 ${fmt(avg)} U`:''}`:''}</div>${u==null?'':`<div class="holding-pnl ${u>=0?'good':'bad'}">${signed(u)}</div>`}</div>`;
}

function tableHtml(rows){
  return `<div class="table-wrap"><table><thead><tr><th>倉位</th><th>資產</th><th>數量</th><th>成本U</th><th>均價U</th><th>現價U</th><th>市值U</th><th>未實現</th></tr></thead><tbody>${rows.map(p=>{const avg=p.hasTracked&&p.trackedQty?p.trackedCost/p.trackedQty:null,u=p.hasTracked?p.trackedMarket-p.trackedCost:null,nq=noQtyAsset(p.asset);return `<tr><td>${p.warehouse}</td><td>${assetLabel(p)}${p.hasLegacy?' <span class="subtle">含歷史差額</span>':''}</td><td>${nq?'—':qty(p.totalQty)}</td><td>${p.hasTracked?fmt(p.trackedCost):'—'}</td><td>${avg==null?'—':`${fmt(avg)}${p.hasLegacy?' <span class="subtle">已登記</span>':''}`}</td><td>${nq?'—':fmt((window.__avgCostPrices||{})[p.asset]||0)}</td><td>${fmt(p.totalMarket)}</td><td class="${u==null?'':u>=0?'good':'bad'}">${u==null?'—':signed(u)}</td></tr>`}).join('')}</tbody></table></div>`;
}

let updating=false;
function apply(){
  if(updating)return;
  const dashboard=document.querySelector('#dashboard');
  if(!dashboard||!dashboard.children.length)return;
  let state;
  try{state=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null')}catch{return}
  if(!state)return;
  const c=reconciledPortfolio(state),prices=state.prices||{};
  window.__avgCostPrices=prices;
  const first=merge(c.warehouses.第一倉||[],prices),second=merge(c.warehouses.第二倉||[],prices),all=[...first,...second];
  updating=true;
  for(const details of dashboard.querySelectorAll('details.fold-card')){
    const name=details.querySelector('summary h2')?.textContent?.trim();
    if(name!=='第一倉'&&name!=='第二倉')continue;
    const body=details.querySelector('.fold-body');
    if(body)body.innerHTML=`<div class="holding-grid">${(name==='第一倉'?first:second).map(cardHtml).join('')}</div>`;
  }
  const allHeading=[...dashboard.querySelectorAll('.card.section h2')].find(h=>h.textContent.trim()==='全部持倉');
  const allCard=allHeading?.closest('.card.section');
  if(allCard){const old=allCard.querySelector('.table-wrap');if(old)old.outerHTML=tableHtml(all)}
  dashboard.dataset.avgCostUi='1';
  updating=false;
}

const observer=new MutationObserver(()=>queueMicrotask(apply));
observer.observe(document.documentElement,{subtree:true,childList:true});
window.addEventListener('load',apply);
queueMicrotask(apply);
