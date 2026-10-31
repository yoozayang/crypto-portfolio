import {reconciledPortfolio,marketValue} from './calculations.js';
const fmt=(v,d=2)=>Number(v||0).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const palette=['#f2a900','#7f8cff','#f3ba2f','#3b82f6','#9b5de5','#27c8b8','#ef476f','#8aa2bf'];
function bars(items,total){return '<div class="trend-stack">'+items.map((x,i)=>'<span title="'+esc(x.name+' '+fmt(x.value)+' U')+'" style="width:'+Math.max(0,x.value/total*100)+'%;background:'+palette[i%palette.length]+'"></span>').join('')+'</div>'}
function composition(items,total){return bars(items,total)+'<div class="trend-legend">'+items.map((x,i)=>'<div><i style="background:'+palette[i%palette.length]+'"></i><strong>'+esc(x.name)+'</strong><span>'+fmt(x.value/total*100,1)+'%</span><small>'+fmt(x.value)+' U</small></div>').join('')+'</div>'}
function snapshotValue(s,prices){let total=0;for(const [a,p] of Object.entries(s.holdings||{})){if(a==='CASH'||a==='STABLE'||a==='OTHER')total+=Number(p?.value||0);else total+=Number(p?.qty||0)*Number(prices?.[a]||0)}return total}
let dailyHistory=[];
export async function loadDailyHistory(){
 const r=await fetch('https://uyxfppzinqnyofuwshye.supabase.co/rest/v1/portfolio_daily_snapshots?select=snapshot_date,snapshot_slot,captured_at,total_value,deposit_total,withdrawal_total&order=captured_at.asc&limit=3000',{headers:{apikey:'sb_publishable_bx9oTbaaOgMrpRfqQ4fYKQ_3EU7JqKG'}});
 if(!r.ok)throw Error('讀取每日資產快照失敗：'+r.status);
 dailyHistory=await r.json();
 await loadMilestones();
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


let chartScale='day',chartWindow='all',milestones=[];
const key='sb_publishable_bx9oTbaaOgMrpRfqQ4fYKQ_3EU7JqKG',base='https://uyxfppzinqnyofuwshye.supabase.co/rest/v1/';
const head={apikey:key,Authorization:'Bearer '+key};
export async function loadMilestones(){
 const r=await fetch(base+'portfolio_events?select=payload&event_kind=eq.milestone&order=event_date.asc',{headers:head,cache:'no-store'});
 if(!r.ok)throw Error('大事件讀取失敗 '+r.status);
 milestones=(await r.json()).map(x=>x.payload);
}
const bucket=(date,scale)=>{const d=new Date(date+'T00:00:00Z');if(scale==='week'){d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);return d.toISOString().slice(0,10)}return scale==='month'?date.slice(0,7):date};
function trendChartMarkup(ledger){
 const all=[...dailyHistory].filter(x=>Number.isFinite(+x.total_value)).sort((a,b)=>String(a.captured_at).localeCompare(String(b.captured_at)));
 const latest=all.at(-1),days={day:30,week:90,month:365};
 const since=chartWindow==='all'||!latest?null:new Date(Date.parse(latest.captured_at)-Number(chartWindow)*86400000);
 const raw=all.filter(x=>!since||new Date(x.captured_at)>=since);
 // Daily: all 3 actual readings. Weekly/monthly: use the last captured valuation in each period.
 const rows=chartScale==='day'?raw:Object.values(raw.reduce((map,r)=>{map[bucket(r.snapshot_date,chartScale)]=r;return map},{}));
 const first=rows[0],last=rows.at(-1),change=first&&last?+last.total_value-(+first.total_value):0;
 const net=first&&last?(+last.deposit_total-(+first.deposit_total))-(+last.withdrawal_total-(+first.withdrawal_total)):0;
 const scales=[['day','日'],['week','週'],['month','月']].map(([v,label])=>'<button data-trend-scale="'+v+'" class="'+(chartScale===v?'active':'')+'">'+label+'</button>').join('');
 const windows=[['7','7天'],['30','30天'],['90','90天'],['all','全部']].map(([v,label])=>'<button data-trend-window="'+v+'" class="'+(chartWindow===v?'active':'')+'">'+label+'</button>').join('');
 let graph='<div class="notice">尚無歷史快照，GitHub Actions執行後開始累積</div>';
 if(rows.length){
  const w=800,h=260,l=65,r=20,t=20,b=30,vals=rows.map(x=>+x.total_value),min=Math.min(...vals),max=Math.max(...vals),delta=Math.max(1,max-min,max*.02),low=Math.max(0,min-delta*.3),high=max+delta*.3;
  const px=i=>l+(rows.length===1?.5:i/(rows.length-1))*(w-l-r),py=v=>t+(high-v)/(high-low)*(h-t-b);
  const points=rows.map((x,i)=>[px(i),py(+x.total_value)]);
  const path=points.map(([x,y],i)=>(i?'L':'M')+x.toFixed(1)+' '+y.toFixed(1)).join(' ');
  const grid=[0,.25,.5,.75,1].map(n=>{const y=py(low+(high-low)*n);return '<line x1="'+l+'" x2="'+(w-r)+'" y1="'+y+'" y2="'+y+'" stroke="#34415d" stroke-dasharray="3 5"/><text x="'+(l-7)+'" y="'+(y+4)+'" text-anchor="end" font-size="11" fill="#9aabc8">'+Math.round(low+(high-low)*n).toLocaleString('en-US')+'</text>'}).join('');
  const markers=[...ledger.filter(e=>e.type==='deposit'||e.type==='withdraw').map(e=>({date:e.date,label:(e.type==='deposit'?'入金 +':'出金 −')+fmt(e.amountU)+' U'+(e.exchange?' · '+e.exchange:''),kind:e.type})),...milestones.map(e=>({date:e.date,label:e.title,kind:'milestone'}))];
  const markHtml=markers.map((e,idx)=>{const target=bucket(e.date,chartScale),i=rows.findIndex(x=>bucket(x.snapshot_date,chartScale)===target);if(i<0)return '';const [x,y]=points[i],color=e.kind==='deposit'?'#5bd69c':e.kind==='withdraw'?'#ff7d8b':'#f2a900';return '<circle cx="'+(x+(idx%3-1)*3)+'" cy="'+(y-9-(idx%3)*3)+'" r="3.5" fill="'+color+'" stroke="#0b1020" stroke-width="1" data-trend-mark="'+idx+'" tabindex="0" role="button"><title>'+esc(e.date+' · '+e.label)+'</title></circle>'}).join('');
  const targets=rows.map((e,i)=>'<circle cx="'+points[i][0]+'" cy="'+points[i][1]+'" r="12" fill="transparent" tabindex="0" data-trend-point="'+i+'" role="button" aria-label="'+esc(e.captured_at+' '+fmt(e.total_value)+' U')+'"/>').join('');
  graph='<div class="trend-chart-wrap"><svg class="trend-svg" viewBox="0 0 800 260" role="img" aria-label="總資產曲線">'+grid+'<path d="'+path+'" stroke="#74a7ff" stroke-width="2.5" fill="none"/>'+markHtml+targets+'<text x="'+l+'" y="255" font-size="12" fill="#9aabc8">'+esc(rows[0].snapshot_date.slice(5))+'</text><text x="'+(w-r)+'" y="255" font-size="12" text-anchor="end" fill="#9aabc8">'+esc(rows.at(-1).snapshot_date.slice(5))+'</text></svg></div><div id="trendChartTooltip" class="trend-chart-tooltip">靠近資料點或事件標記可查看內容</div>';
  queueMicrotask(()=>{
   document.querySelectorAll('[data-trend-point]').forEach(el=>{const show=()=>{const x=rows[+el.dataset.trendPoint];document.querySelector('#trendChartTooltip').textContent=new Date(x.captured_at).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false})+' · '+fmt(x.total_value)+' U'};el.addEventListener('pointerenter',show);el.addEventListener('focus',show);el.addEventListener('click',show)});
   document.querySelectorAll('[data-trend-mark]').forEach(el=>{const show=()=>{const e=markers[+el.dataset.trendMark];document.querySelector('#trendChartTooltip').textContent=e.date+' · '+e.label};el.addEventListener('pointerenter',show);el.addEventListener('focus',show);el.addEventListener('click',show)});
  });
 }
 queueMicrotask(()=>{
  document.querySelectorAll('[data-trend-scale]').forEach(el=>el.onclick=()=>{chartScale=el.dataset.trendScale;renderTrends(window.__trendState)});
  document.querySelectorAll('[data-trend-window]').forEach(el=>el.onclick=()=>{chartWindow=el.dataset.trendWindow;renderTrends(window.__trendState)});
  document.querySelector('#milestoneAdd')?.addEventListener('click',()=>openMilestoneEditor());
  document.querySelectorAll('[data-milestone-edit]').forEach(el=>el.onclick=()=>openMilestoneEditor(milestones.find(m=>m.id===el.dataset.milestoneEdit)));
  document.querySelectorAll('[data-milestone-delete]').forEach(el=>el.onclick=()=>deleteMilestone(el.dataset.milestoneDelete));
 });
 return '<div class="card trend-primary"><div class="trend-chart-head"><h2>總資產走勢</h2><div class="trend-range">'+scales+'</div></div><div class="trend-range trend-windows">'+windows+'</div><div class="trend-chart-kpis"><div><small>最新快照</small><strong>'+(last?fmt(last.total_value)+' U':'—')+'</strong></div><div><small>期間變化</small><strong>'+(rows.length>1?(change>=0?'+':'')+fmt(change)+' U':'—')+'</strong></div><div><small>扣除淨入金</small><strong>'+(rows.length>1?(change-net>=0?'+':'')+fmt(change-net)+' U':'—')+'</strong></div></div>'+graph+'<p class="subtle">每日00:10、08:10、16:10記錄；週／月顯示期末值。小點標示入出金與大事件，靠近才顯示內容</p><div class="trend-events-head"><h2>大事件</h2><button type="button" class="btn" id="milestoneAdd">＋新增</button></div><div class="trend-event-list">'+(milestones.length?milestones.map(m=>'<div><span>'+esc(m.date)+' · '+esc(m.title)+'</span><span><button data-milestone-edit="'+esc(m.id)+'">編輯</button> <button data-milestone-delete="'+esc(m.id)+'">刪除</button></span></div>').join(''):'<p class="subtle">尚無手動事件</p>')+'</div></div>';
}
async function saveMilestone(old,title,date){
 if(!window.cryptoPortfolioEditLock?.isUnlocked?.()){window.cryptoPortfolioEditLock?.open?.();return}
 const {applyEventChanges}=await import('./supabase-data.js');
 const item={id:old?.id||crypto.randomUUID(),date,title};
 await applyEventChanges([{key:'milestone:'+item.id,kind:'milestone',before:old||null,after:item}]);
 await loadMilestones();renderTrends(window.__trendState);
}
function openMilestoneEditor(old){
 const title=prompt('大事件內容',old?.title||'');if(title===null||!title.trim())return;
 const date=prompt('事件日期（YYYY-MM-DD）',old?.date||new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'}));
 if(!date||!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date))){alert('日期格式錯誤');return}
 saveMilestone(old,title.trim(),date).catch(e=>alert('儲存失敗：'+e.message));
}
async function deleteMilestone(id){
 if(!window.cryptoPortfolioEditLock?.isUnlocked?.()){window.cryptoPortfolioEditLock?.open?.();return}
 if(!confirm('刪除此大事件？'))return;
 const old=milestones.find(m=>m.id===id);if(!old)return;
 try{const {applyEventChanges}=await import('./supabase-data.js');await applyEventChanges([{key:'milestone:'+id,kind:'milestone',before:old,after:null}]);await loadMilestones();renderTrends(window.__trendState)}catch(e){alert('刪除失敗：'+e.message)}
}
