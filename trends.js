import {reconciledPortfolio,marketValue} from './calculations.js';
const fmt=(v,d=2)=>Number(v||0).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const palette=['#f2a900','#7f8cff','#f3ba2f','#3b82f6','#9b5de5','#27c8b8','#ef476f','#8aa2bf'];
function bars(items,total){return '<div class="trend-stack">'+items.map((x,i)=>'<span title="'+esc(x.name+' '+fmt(x.value)+' U')+'" style="width:'+Math.max(0,x.value/total*100)+'%;background:'+palette[i%palette.length]+'"></span>').join('')+'</div>'}
function composition(items,total){return bars(items,total)+'<div class="trend-legend">'+items.map((x,i)=>'<div><i style="background:'+palette[i%palette.length]+'"></i><strong>'+esc(x.name)+'</strong><span>'+fmt(x.value/total*100,1)+'%</span><small>'+fmt(x.value)+' U</small></div>').join('')+'</div>'}
function snapshotValue(s,prices){let total=0;for(const [a,p] of Object.entries(s.holdings||{})){if(a==='CASH'||a==='STABLE'||a==='OTHER')total+=Number(p?.value||0);else total+=Number(p?.qty||0)*Number(prices?.[a]||0)}return total}
export function renderTrends(state){
 const root=document.querySelector('#trends');if(!root)return;
 const portfolio=reconciledPortfolio(state),positions=[...portfolio.warehouses.第一倉,...portfolio.warehouses.第二倉],assets=new Map();
 for(const p of positions){const v=marketValue(p,state.prices);if(v>0)assets.set(p.asset,(assets.get(p.asset)||0)+v)}
 const total=portfolio.displayMarket||0,ranked=[...assets].map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value),wh=[{name:'第一倉',value:portfolio.firstMarket??portfolio.warehouses.第一倉.reduce((s,p)=>s+marketValue(p,state.prices),0)},{name:'第二倉',value:portfolio.secondMarket??portfolio.warehouses.第二倉.reduce((s,p)=>s+marketValue(p,state.prices),0)}],concentration=total?ranked.slice(0,2).reduce((s,x)=>s+x.value,0)/total*100:0;
 const ledger=[...(state.ledgerEntries||[])].sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))),deposits=ledger.filter(e=>e.type==='deposit').reduce((s,e)=>s+Number(e.amountU||0),0),withdrawals=ledger.filter(e=>e.type==='withdraw').reduce((s,e)=>s+Number(e.amountU||0),0);
 const snapshots=[...(state.snapshots||[])].sort((a,b)=>String(a.date||a.asOf||'').localeCompare(String(b.date||b.asOf||'')));
 const history=snapshots.map(s=>({date:String(s.date||s.asOf||'').slice(0,10),value:snapshotValue(s,state.prices)}));
 const changes=ledger.filter(e=>e.type==='deposit'||e.type==='withdraw').map(e=>({date:e.date||'',label:e.type==='deposit'?'入金':'出金',value:Number(e.amountU||0)})).reverse().slice(0,12);
 root.innerHTML='<div class="trend-head"><h2>資產趨勢</h2><p>追蹤資產配置與資金流向 · 單位U</p></div>'+
 '<div class="grid"><div class="card kpi"><div class="label">目前總資產</div><div class="value">'+fmt(total)+' U</div></div><div class="card kpi"><div class="label">前兩大資產占比</div><div class="value">'+fmt(concentration,1)+'%</div></div><div class="card kpi"><div class="label">累積入金</div><div class="value">'+fmt(deposits)+' U</div></div><div class="card kpi"><div class="label">累積出金</div><div class="value">'+fmt(withdrawals)+' U</div></div></div>'+
 '<div class="trend-grid section"><div class="card"><h2>目前資產組成</h2>'+(total?composition(ranked,total):'<p class="subtle">沒有資產資料</p>')+'</div><div class="card"><h2>倉位配置</h2>'+(total?composition(wh,total):'<p class="subtle">沒有倉位資料</p>')+'</div></div>'+
 '<div class="card section"><h2>總資產歷史</h2><p class="subtle">歷史快照數：'+history.length+' · 下表的快照估值採用目前價格，僅用來比較記錄的持倉數量，不是當時資產市值或投資報酬</p>'+
 (history.length?'<div class="trend-history">'+history.map(x=>'<div><span>'+esc(x.date)+'</span><div class="trend-bar"><i style="width:'+Math.min(100,x.value/Math.max(1,...history.map(h=>h.value))*100)+'%"></i></div><strong>'+fmt(x.value)+' U</strong></div>').join('')+'</div>':'<p>尚無歷史快照</p>')+
 '<p class="subtle">要建立真實的總資產走勢，需要定期保存每次的資產總值及幣種市值；目前不推算不存在的歷史價格</p></div>'+
 '<div class="card section"><h2>最近資金流向</h2><p class="subtle">只列入金／出金，不將倉內轉帳算成新投入</p>'+(changes.length?'<div class="trend-flows">'+changes.map(x=>'<div><span>'+esc(x.date)+'</span><span>'+x.label+'</span><strong>'+fmt(x.value)+' U</strong></div>').join('')+'</div>':'<p class="subtle">尚無入出金記錄</p>')+'</div>';
}
