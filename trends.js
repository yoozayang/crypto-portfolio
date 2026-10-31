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
 const root=document.querySelector('#trends');if(!root)return;window.__trendState=state;
 const portfolio=reconciledPortfolio(state),positions=[...portfolio.warehouses.第一倉,...portfolio.warehouses.第二倉],assets=new Map();
 for(const p of positions){const v=marketValue(p,state.prices);if(v>0)assets.set(p.asset,(assets.get(p.asset)||0)+v)}
 const total=portfolio.displayMarket||0,ranked=[...assets].map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value),wh=[{name:'第一倉',value:portfolio.firstMarket??portfolio.warehouses.第一倉.reduce((s,p)=>s+marketValue(p,state.prices),0)},{name:'第二倉',value:portfolio.secondMarket??portfolio.warehouses.第二倉.reduce((s,p)=>s+marketValue(p,state.prices),0)}],concentration=total?ranked.slice(0,2).reduce((s,x)=>s+x.value,0)/total*100:0;
 const ledger=[...(state.ledgerEntries||[])].sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))),deposits=ledger.filter(e=>e.type==='deposit').reduce((s,e)=>s+Number(e.amountU||0),0),withdrawals=ledger.filter(e=>e.type==='withdraw').reduce((s,e)=>s+Number(e.amountU||0),0);
 const snapshots=[...(state.snapshots||[])].sort((a,b)=>String(a.date||a.asOf||'').localeCompare(String(b.date||b.asOf||'')));
 const history=snapshots.map(s=>({date:String(s.date||s.asOf||'').slice(0,10),value:snapshotValue(s,state.prices)}));
 const changes=ledger.filter(e=>e.type==='deposit'||e.type==='withdraw').map(e=>({date:e.date||'',label:e.type==='deposit'?'入金':'出金',value:Number(e.amountU||0)})).reverse().slice(0,12);
 root.innerHTML='<div class="trend-head"><h2>資產趨勢</h2><p>追蹤資產配置與資金流向 · 單位U</p></div>'+
 trendChartMarkup(ledger)+
 '<div class="grid"><div class="card kpi"><div class="label">目前總資產</div><div class="value">'+fmt(total)+' U</div></div><div class="card kpi"><div class="label">前兩大資產占比</div><div class="value">'+fmt(concentration,1)+'%</div></div><div class="card kpi"><div class="label">累積入金</div><div class="value">'+fmt(deposits)+' U</div></div><div class="card kpi"><div class="label">累積出金</div><div class="value">'+fmt(withdrawals)+' U</div></div></div>'+
 '<div class="trend-grid section"><div class="card"><h2>目前資產組成</h2>'+(total?composition(ranked,total):'<p class="subtle">沒有資產資料</p>')+'</div><div class="card"><h2>倉位配置</h2>'+(total?composition(wh,total):'<p class="subtle">沒有倉位資料</p>')+'</div></div>'+
 '<div class="card section"><h2>最近資金流向</h2><p class="subtle">只列入金／出金，不將倉內轉帳算成新投入</p>'+(changes.length?'<div class="trend-flows">'+changes.map(x=>'<div><span>'+esc(x.date)+'</span><span>'+x.label+'</span><strong>'+fmt(x.value)+' U</strong></div>').join('')+'</div>':'<p class="subtle">尚無入出金記錄</p>')+'</div>';
}

let chartRange='all';
function trendChartMarkup(ledger){
 const all=dailyHistory.filter(x=>Number.isFinite(+x.total_value)).sort((a,b)=>a.snapshot_date.localeCompare(b.snapshot_date));
 const end=all.at(-1)?.snapshot_date;
 const cutoff=chartRange==='all'||!end?'':new Date(Date.parse(end+'T00:00:00Z')-Number(chartRange)*86400000).toISOString().slice(0,10);
 const rows=all.filter(x=>!cutoff||x.snapshot_date>=cutoff);
 const latest=rows.at(-1),first=rows[0],change=first&&latest?Number(latest.total_value)-Number(first.total_value):0;
 const netFlow=first&&latest?(Number(latest.deposit_total)-Number(first.deposit_total))-(Number(latest.withdrawal_total)-Number(first.withdrawal_total)):0;
 const adjusted=change-netFlow;
 const btns=[['7','7天'],['30','30天'],['90','90天'],['all','全部']].map(([key,label])=>'<button type="button" data-trend-range="'+key+'" class="'+(chartRange===key?'active':'')+'">'+label+'</button>').join('');
 let graph='<div class="notice">尚無每日快照，排程成功後會自動開始記錄</div>';
 if(rows.length){
  const width=800,height=260,pad={l:62,r:18,t:22,b:34},values=rows.map(x=>Number(x.total_value)),min=Math.min(...values),max=Math.max(...values),spread=Math.max(max-min,max*.02,1),lo=Math.max(0,min-spread*.25),hi=max+spread*.25;
  const x=i=>pad.l+(rows.length===1?.5:i/(rows.length-1))*(width-pad.l-pad.r),y=v=>pad.t+(hi-v)/(hi-lo)*(height-pad.t-pad.b);
  const points=rows.map((r,i)=>[x(i),y(Number(r.total_value))]),line=points.map(([px,py],i)=>(i?'L':'M')+px.toFixed(2)+' '+py.toFixed(2)).join(' ');
  const area=line+' L'+points.at(-1)[0]+' '+(height-pad.b)+' L'+points[0][0]+' '+(height-pad.b)+' Z';
  const grid=[0,.25,.5,.75,1].map(t=>{const v=lo+(hi-lo)*t,yy=y(v);return '<line x1="'+pad.l+'" x2="'+(width-pad.r)+'" y1="'+yy+'" y2="'+yy+'" stroke="#34415d" stroke-dasharray="3 5"/><text x="'+(pad.l-8)+'" y="'+(yy+4)+'" fill="#9aabc8" font-size="11" text-anchor="end">'+Math.round(v).toLocaleString('en-US')+'</text>'}).join('');
  const flow=ledger.filter(e=>['deposit','withdraw'].includes(e.type)&&rows.some(r=>r.snapshot_date===String(e.date).slice(0,10)));
  const marks=flow.map(e=>{const i=rows.findIndex(r=>r.snapshot_date===String(e.date).slice(0,10)),px=x(i),py=y(Number(rows[i].total_value));return '<circle cx="'+px+'" cy="'+py+'" r="6" fill="'+(e.type==='deposit'?'#5bd69c':'#ff7d8b')+'" stroke="#0b1020" stroke-width="2"><title>'+esc(e.date+' '+e.exchange+' '+(e.type==='deposit'?'+':'−')+fmt(e.amountU)+' U')+'</title></circle>'}).join('');
  const dots=rows.map((r,i)=>'<circle cx="'+points[i][0]+'" cy="'+points[i][1]+'" r="11" fill="transparent" data-trend-point="'+i+'" tabindex="0" role="button" aria-label="'+esc(r.snapshot_date+' '+fmt(r.total_value)+' U')+'"/>').join('');
  graph='<div class="trend-chart-wrap"><svg class="trend-svg" viewBox="0 0 800 260" role="img" aria-label="每日總資產市值曲線圖">'+grid+'<path d="'+area+'" fill="#74a7ff" fill-opacity=".12"/><path d="'+line+'" stroke="#74a7ff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'+marks+dots+'<text x="'+pad.l+'" y="255" fill="#9aabc8" font-size="12">'+esc(rows[0].snapshot_date.slice(5))+'</text><text x="'+(width-pad.r)+'" y="255" fill="#9aabc8" font-size="12" text-anchor="end">'+esc(rows.at(-1).snapshot_date.slice(5))+'</text></svg></div><div class="trend-chart-tooltip" id="trendChartTooltip" aria-live="polite">點選曲線查看當日市值</div>';
 }
 const card='<div class="card trend-primary"><div class="trend-chart-head"><h2>每日總資產</h2><div class="trend-range">'+btns+'</div></div><div class="trend-chart-kpis"><div><small>最新快照</small><strong>'+(latest?fmt(latest.total_value)+' U':'—')+'</strong></div><div><small>期間變化</small><strong class="'+(change>=0?'good':'bad')+'">'+(rows.length>1?(change>=0?'+':'')+fmt(change)+' U':'—')+'</strong></div><div><small>扣除淨入金</small><strong class="'+(adjusted>=0?'good':'bad')+'">'+(rows.length>1?(adjusted>=0?'+':'')+fmt(adjusted)+' U':'—')+'</strong></div></div>'+graph+'<p class="subtle">每日快照記錄當時市值，綠點入金、紅點出金；內部轉帳不計入資金流</p></div>';
 queueMicrotask(()=>{document.querySelectorAll('[data-trend-range]').forEach(b=>b.onclick=()=>{chartRange=b.dataset.trendRange;const state=window.__trendState;if(state)renderTrends(state)});document.querySelectorAll('[data-trend-point]').forEach(b=>{const show=()=>{const row=rows[Number(b.dataset.trendPoint)];const el=document.querySelector('#trendChartTooltip');if(el)el.textContent=row.snapshot_date+'　'+fmt(row.total_value)+' U'};b.addEventListener('click',show);b.addEventListener('focus',show)})});
 return card;
}
