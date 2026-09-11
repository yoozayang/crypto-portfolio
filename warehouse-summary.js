function updateWarehouseSummaries(){
  document.querySelectorAll('#dashboard .fold-card').forEach(card=>{
    const title=card.querySelector('.fold-title h2')?.textContent?.trim();
    if(!['第一倉','第二倉'].includes(title)) return;
    const meta=card.querySelector('.fold-meta');
    if(!meta) return;
    let market=0, unrealized=0, hasKnown=false;
    card.querySelectorAll('.holding-card').forEach(h=>{
      if(h.querySelector('.chip')?.textContent?.includes('歷史差額')) return;
      const valueText=h.querySelector('.holding-value')?.textContent||'';
      const pnlText=h.querySelector('.holding-pnl')?.textContent||'';
      const value=parseFloat(valueText.replace(/[^0-9.-]/g,''));
      const pnl=parseFloat(pnlText.replace(/[^0-9.+-]/g,''));
      if(Number.isFinite(value)) market+=value;
      if(Number.isFinite(pnl)){unrealized+=pnl;hasKnown=true;}
    });
    if(!hasKnown){meta.textContent='';return;}
    const cost=market-unrealized;
    const pct=cost?unrealized/cost*100:0;
    const fmt=n=>n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
    meta.textContent=`市值 ${fmt(market)} U · 未實現 ${unrealized>=0?'+':''}${fmt(unrealized)} U（${pct>=0?'+':''}${pct.toFixed(2)}%）`;
    meta.classList.toggle('good',unrealized>0);
    meta.classList.toggle('bad',unrealized<0);
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
