import {reconciledPortfolio,marketValue} from './calculations.js';
const fmt=(v,d=2)=>Number(v||0).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const palette=['#f2a900','#7f8cff','#f3ba2f','#3b82f6','#9b5de5','#27c8b8','#ef476f','#8aa2bf'];
function bars(items,total){return '<div class="trend-stack">'+items.map((x,i)=>'<span title="'+esc(x.name+' '+fmt(x.value)+' U')+'" style="width:'+Math.max(0,x.value/total*100)+'%;background:'+palette[i%palette.length]+'"></span>').join('')+'</div>'}
function composition(items,total){return bars(items,total)+'<div class="trend-legend">'+items.map((x,i)=>'<div><i style="background:'+palette[i%palette.length]+'"></i><strong>'+esc(x.name)+'</strong><span>'+fmt(x.value/total*100,1)+'%</span><small>'+fmt(x.value)+' U</small></div>').join('')+'</div>'}
function snapshotValue(s,prices){let total=0;for(const [a,p] of Object.entries(s.holdings||{})){if(a==='CASH'||a==='STABLE'||a==='OTHER')total+=Number(p?.value||0);else total+=Number(p?.qty||0)*Number(prices?.[a]||0)}return total}
let dailyHistory=[];
export async function loadDailyHistory(){
 const r=await fetch('https://uyxfppzinqnyofuwshye.supabase.co/rest/v1/portfolio_daily_snapshots?select=snapshot_date,total_value,deposit_total,withdrawal_total&order=snapshot_date.asc&limit=1000',{headers:{apikey:'sb_publishable_bx9oTbaaOgMrpRfqQ4fYKQ_3EU7JqKG'}});
 if(!r.ok)throw Error('讀取每日資產快照失敗：'+r.status);
 dailyHistory=await r.json();
}
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
 '<div class="card section"><h2>每日總資產走勢</h2><p class="subtle">每日00:10台灣時間記錄當時市值，入出金事件以標籤顯示；同日內部轉帳不計入金</p>'+
 (dailyHistory.length?'<div class="trend-history">'+dailyHistory.map(x=>{const val=Number(x.total_value),max=Math.max(1,...dailyHistory.map(h=>Number(h.total_value)));const events=changes.filter(e=>String(e.date).slice(0,10)===x.snapshot_date);return '<div><span>'+esc(x.snapshot_date)+'</span><div class="trend-bar"><i style="width:'+Math.max(0,val/max*100)+'%"></i></div><strong>'+fmt(val)+' U</strong></div>'+(events.length?'<div class="trend-tags">'+events.map(e=>'<span class="trend-tag '+(e.label==='入金'?'in':'out')+'">'+esc(e.label)+' '+(e.label==='入金'?'+':'−')+fmt(e.value)+' U</span>').join('')+'</div>':'')}).join('')+'</div>':'<div class="notice">尚無每日快照，排程成功執行後會開始累積真實市值歷史</div>')+
 (dailyHistory.length>1?'<p class="subtle">期間淨入金調整後變化：'+fmt(Number(dailyHistory.at(-1).total_value)-Number(dailyHistory[0].total_value)-(Number(dailyHistory.at(-1).deposit_total)-Number(dailyHistory[0].deposit_total))+(Number(dailyHistory.at(-1).withdrawal_total)-Number(dailyHistory[0].withdrawal_total)))+' U</p>':'')+'</div>'+
 '<div class="card section"><h2>最近資金流向</h2><p class="subtle">只列入金／出金，不將倉內轉帳算成新投入</p>'+(changes.length?'<div class="trend-flows">'+changes.map(x=>'<div><span>'+esc(x.date)+'</span><span>'+x.label+'</span><strong>'+fmt(x.value)+' U</strong></div>').join('')+'</div>':'<p class="subtle">尚無入出金記錄</p>')+'</div>';
}
