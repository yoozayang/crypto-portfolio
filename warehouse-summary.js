import {STORAGE_KEY} from './records.js';
import {ledgerMetrics,reconciledPortfolio} from './calculations.js';
function updateWarehouseSummaries(){
  const state=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');
  const metrics=ledgerMetrics(state);
  const portfolio=reconciledPortfolio(state);
  document.querySelectorAll('#dashboard .fold-card').forEach(card=>{
    const title=card.querySelector('.fold-title h2')?.textContent?.trim();
    if(!['第一倉','第二倉'].includes(title)) return;
    const meta=card.querySelector('.fold-meta');
    if(!meta) return;
    const fmt=n=>Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
    const basis=title==='第一倉'?['投入本金',metrics.firstCapital]:['期初資產基準',metrics.secondOpeningAssetBaseline];
    if(!card.querySelector('.warehouse-metrics')){
      const box=document.createElement('div');box.className='warehouse-metrics';
      box.innerHTML='<div class="warehouse-metric"><span class="warehouse-metric-label"></span><strong class="warehouse-metric-value"></strong></div><div class="warehouse-metric"><span class="warehouse-metric-label">目前市值</span><strong class="warehouse-metric-value"></strong></div><div class="warehouse-metric"><span class="warehouse-metric-label">可計算未實現損益</span><strong class="warehouse-metric-value"></strong></div>';
      card.querySelector('.fold-body')?.prepend(box);
    }
    const box=card.querySelector('.warehouse-metrics');
    const items=box?.querySelectorAll('.warehouse-metric');
    if(!items||items.length!==3)return;
    const first=title==='第一倉';
    const positions=portfolio.warehouses?.[title]||[];
    const market=positions.reduce((sum,p)=>sum+(p.marketValue??((+p.qty||0)*(+state.prices?.[p.asset]||0))),0);
    const firstCost=positions.reduce((sum,p)=>sum+(p.cost==null?0:(+p.cost||0)),0);
    const comparison=first?market-firstCost:market-(metrics.secondOpeningAssetBaseline+metrics.postBaselineNetFlow);
    items[2].querySelector('.warehouse-metric-label').textContent=first?'目前持倉損益':'資產增減';
    items[2].title=first?'目前持有資產市值減去其已知買入成本':'第二倉目前市值減去期初資產基準及後續淨入金；非完整歷史投資報酬';
    items[0].querySelector('.warehouse-metric-label').textContent=basis[0];
    items[0].querySelector('.warehouse-metric-value').textContent=fmt(basis[1])+' U';
    items[1].querySelector('.warehouse-metric-value').textContent=fmt(market)+' U';
    const pnl=items[2].querySelector('.warehouse-metric-value');
    pnl.textContent=(comparison>=0?'+':'')+fmt(comparison)+' U';
    pnl.classList.toggle('good',comparison>0);
    pnl.classList.toggle('bad',comparison<0);
    meta.textContent='';

  });
}
let scheduled=false;
const observer=new MutationObserver(()=>{
  if(scheduled)return;
  scheduled=true;
  requestAnimationFrame(()=>{
    observer.disconnect();
    updateWarehouseSummaries();
    observer.observe(document.querySelector('#dashboard'),{childList:true,subtree:true});
    scheduled=false;
  });
});
const dashboard=document.querySelector('#dashboard');
if(dashboard){observer.observe(dashboard,{childList:true,subtree:true});updateWarehouseSummaries();}
