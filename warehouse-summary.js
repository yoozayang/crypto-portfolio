import {STORAGE_KEY} from './records.js';
import {ledgerMetrics} from './calculations.js';
function updateWarehouseSummaries(){
  const metrics=ledgerMetrics(JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}'));
  document.querySelectorAll('#dashboard .fold-card').forEach(card=>{
    const title=card.querySelector('.fold-title h2')?.textContent?.trim();
    if(!['第一倉','第二倉'].includes(title)) return;
    const meta=card.querySelector('.fold-meta');
    if(!meta) return;
    const fmt=n=>Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
    const basis=title==='第一倉'?['投入本金',metrics.firstCapital]:['期初資產基準',metrics.secondOpeningAssetBaseline];
    const original=meta.textContent||'';
    if(!card.querySelector('.warehouse-metrics')){
      const box=document.createElement('div');box.className='warehouse-metrics';
      box.innerHTML='<div class="warehouse-metric"><span class="warehouse-metric-label"></span><strong class="warehouse-metric-value"></strong></div><div class="warehouse-metric"><span class="warehouse-metric-label">目前市值</span><strong class="warehouse-metric-value"></strong></div><div class="warehouse-metric"><span class="warehouse-metric-label">可計算未實現損益</span><strong class="warehouse-metric-value"></strong></div>';
      card.querySelector('.fold-body')?.prepend(box);
    }
    const box=card.querySelector('.warehouse-metrics');
    const items=box?.querySelectorAll('.warehouse-metric');
    if(!items||items.length!==3)return;
    const market=Array.from(card.querySelectorAll('.holding-card')).reduce((sum,h)=>{
      const t=h.querySelector('.holding-value')?.textContent||'';
      return sum+(Number(t.replace(/[^0-9.-]/g,''))||0);
    },0);
    let unrealized=0,known=false;
    card.querySelectorAll('.holding-pnl').forEach(el=>{const n=Number((el.textContent||'').split('U')[0].replace(/[^0-9.+-]/g,''));if(Number.isFinite(n)){unrealized+=n;known=true;}});
    items[0].querySelector('.warehouse-metric-label').textContent=basis[0];
    items[0].querySelector('.warehouse-metric-value').textContent=fmt(basis[1])+' U';
    items[1].querySelector('.warehouse-metric-value').textContent=fmt(market)+' U';
    const pnl=items[2].querySelector('.warehouse-metric-value');
    pnl.textContent=known?(unrealized>=0?'+':'')+fmt(unrealized)+' U':'—';
    pnl.classList.toggle('good',known&&unrealized>0);
    pnl.classList.toggle('bad',known&&unrealized<0);
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
