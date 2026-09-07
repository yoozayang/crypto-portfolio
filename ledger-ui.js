import {STORAGE_KEY,nextEventSeq,saveState} from './records.js?v=20260907-1535';
import {ledgerMetrics,currentActualHoldings} from './calculations.js?v=20260907-1535';

const load=()=>JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number.isFinite(+n)?(+n).toLocaleString('en-US',{maximumFractionDigits:2}):'—';
const today=()=>new Date().toISOString().slice(0,10);
const nextId=list=>Math.max(0,...(list||[]).map(x=>+x.id||0))+1;
const assetList=state=>[...new Set([...(state.assets||[]).filter(a=>!['CASH','OTHER'].includes(a)),'STABLE'])];
const assetName=a=>a==='STABLE'?'USDT/USDC':a;
const isUnlocked=()=>window.cryptoPortfolioEditLock?.isUnlocked?.()??true;
const askUnlock=()=>window.cryptoPortfolioEditLock?.open?.();
const persist=(state,stay='ledger')=>{saveState(state);sessionStorage.setItem('cryptoPortfolioReturnTab',stay);location.reload();};

function ensureTab(){
  const tabs=document.querySelector('#tabs');if(!tabs||document.querySelector('[data-tab="ledger"]'))return;
  const btn=document.createElement('button');btn.dataset.tab='ledger';btn.textContent='出入金/轉帳登記';
  const backup=tabs.querySelector('[data-tab="backup"]');tabs.insertBefore(btn,backup||null);
  const section=document.createElement('section');section.id='ledger';section.className='tab-pane hidden';document.querySelector('#app').appendChild(section);
  btn.onclick=()=>{document.querySelectorAll('.tab-pane').forEach(x=>x.classList.toggle('hidden',x.id!=='ledger'));document.querySelectorAll('#tabs button').forEach(x=>x.classList.toggle('active',x===btn));renderLedger();};
  if(sessionStorage.getItem('cryptoPortfolioReturnTab')==='ledger'){sessionStorage.removeItem('cryptoPortfolioReturnTab');setTimeout(()=>btn.click(),0);}
}

function select(name,label,items,value=''){return `<label><span>${label}</span><select name="${name}">${items.map(x=>{const v=typeof x==='string'?x:x.value,l=typeof x==='string'?x:x.label;return `<option value="${esc(v)}" ${v===value?'selected':''}>${esc(l)}</option>`}).join('')}</select></label>`;}
function input(name,label,value='',type='number',extra='step="any"'){return `<label><span>${label}</span><input name="${name}" type="${type}" ${extra} value="${esc(value)}"></label>`;}
const common=(state,e={})=>`${select('warehouse','倉位',['第一倉','第二倉'],e.warehouse||'第二倉')}${input('date','日期',e.date||today(),'date','')}`;

function fieldsFor(type,state,e={}){
  const assets=assetList(state).map(a=>({value:a,label:assetName(a)})),ex=state.exchanges||[];
  if(type==='deposit'||type==='withdraw')return `${common(state,e)}${select('exchange','交易所',ex,e.exchange||'幣安')}${select('asset','資產',assets,e.asset||'STABLE')}${input('amountU','折算金額（U）',e.amountU||'')}${input('qty','資產數量（穩定幣可留白）',e.qty||'')}`;
  if(type==='income')return `${common(state,e)}${select('exchange','交易所',ex,e.exchange||'幣安')}${select('incomeKind','收益類型',['Earn','Staking','空投','Cashback','其他'],e.incomeKind||'Earn')}${select('asset','收到資產',assets,e.asset||'STABLE')}${input('amountU','入帳價值（U）',e.amountU||'')}${input('qty','收到數量',e.qty||'')}`;
  if(type==='transfer')return `${common(state,e)}${select('fromExchange','轉出交易所',ex,e.fromExchange||'MAX')}${select('toExchange','轉入交易所',ex,e.toExchange||'幣安')}${select('asset','資產',assets,e.asset||'STABLE')}${input('qty','轉帳數量 / 金額',e.qty||'')}${select('feeAsset','手續費幣種',[{value:'',label:'—'},...assets],e.feeAsset||'')}${input('feeQty','手續費數量',e.feeQty||0)}`;
  if(type==='swap')return `${common(state,e)}${select('fromExchange','賣出交易所',ex,e.fromExchange||'MAX')}${select('fromAsset','賣出資產',assets.filter(x=>x.value!=='STABLE'),e.fromAsset||'ETH')}${input('fromQty','賣出數量',e.fromQty||'')}${input('sellAmountU','賣出所得（U）',e.sellAmountU||'')}${select('toExchange','買入交易所',ex,e.toExchange||'幣安')}${select('toAsset','買入資產',assets.filter(x=>x.value!=='STABLE'),e.toAsset||'BTC')}${input('toQty','買入數量',e.toQty||'')}${input('buyAmountU','買入金額（U）',e.buyAmountU||e.sellAmountU||'')}`;
  return '';
}

function typeLabel(t){return ({deposit:'入金',withdraw:'出金',income:'收益 / 空投',transfer:'交易所轉帳',swap:'倉內換倉'}[t]||t);}
function entrySummary(e){
  if(e.type==='deposit'||e.type==='withdraw')return `${assetName(e.asset)} ${e.qty?e.qty+' · ':''}${fmt(e.amountU)} U @ ${e.exchange}`;
  if(e.type==='income')return `${e.incomeKind||'收益'} · ${assetName(e.asset)} ${e.qty||''} · ${fmt(e.amountU)} U`;
  if(e.type==='transfer')return `${assetName(e.asset)} ${e.qty||''} · ${e.fromExchange} → ${e.toExchange}`;
  if(e.type==='swap')return `${e.fromAsset} ${e.fromQty} → ${e.toAsset} ${e.toQty} · ${e.fromExchange} → ${e.toExchange}`;
  return '';
}

function saveEntry(form){
  if(!isUnlocked()){askUnlock();return;}
  const state=load(),d=Object.fromEntries(new FormData(form)),type=d.type,editId=+d.editId||0,old=editId?(state.ledgerEntries||[]).find(x=>x.id===editId):null;
  const base={id:editId||nextId(state.ledgerEntries),seq:old?.seq||nextEventSeq(state),type,date:d.date,warehouse:d.warehouse,note:d.note||''};
  let entry={...base};
  if(['deposit','withdraw'].includes(type))entry={...entry,exchange:d.exchange,asset:d.asset,amountU:+d.amountU||0,qty:+d.qty||0};
  if(type==='income')entry={...entry,exchange:d.exchange,incomeKind:d.incomeKind,asset:d.asset,amountU:+d.amountU||0,qty:+d.qty||0};
  if(type==='transfer')entry={...entry,fromExchange:d.fromExchange,toExchange:d.toExchange,asset:d.asset,qty:+d.qty||0,feeAsset:d.feeAsset,feeQty:+d.feeQty||0};
  if(type==='swap'){
    entry={...entry,fromExchange:d.fromExchange,toExchange:d.toExchange,fromAsset:d.fromAsset,toAsset:d.toAsset,fromQty:+d.fromQty||0,toQty:+d.toQty||0,sellAmountU:+d.sellAmountU||0,buyAmountU:+d.buyAmountU||+d.sellAmountU||0};
    const ids=old?.linkedTransactionIds||[];if(ids.length)state.transactions=state.transactions.filter(t=>!ids.includes(t.id));
    const sellId=nextId(state.transactions),sellSeq=nextEventSeq(state),buyId=sellId+1,buySeq=nextEventSeq(state),groupId=`swap-${entry.id}`;
    state.transactions.push({id:sellId,seq:sellSeq,warehouse:d.warehouse,exchange:d.fromExchange,date:d.date,side:'賣出',asset:d.fromAsset,price:(+d.fromQty?+d.sellAmountU/+d.fromQty:0),qty:+d.fromQty||0,amount:+d.sellAmountU||0,feeAsset:'',feeQty:0,reset:false,note:`換倉 ${groupId}: ${d.fromAsset} → ${d.toAsset}`,groupId,source:'swap'});
    state.transactions.push({id:buyId,seq:buySeq,warehouse:d.warehouse,exchange:d.toExchange,date:d.date,side:'買入',asset:d.toAsset,price:(+d.toQty?(+d.buyAmountU||+d.sellAmountU)/+d.toQty:0),qty:+d.toQty||0,amount:+d.buyAmountU||+d.sellAmountU||0,feeAsset:'',feeQty:0,reset:false,note:`換倉 ${groupId}: ${d.fromAsset} → ${d.toAsset}`,groupId,source:'swap'});
    entry.linkedTransactionIds=[sellId,buyId];
  }
  state.ledgerEntries=state.ledgerEntries||[];const i=state.ledgerEntries.findIndex(x=>x.id===entry.id);i>=0?state.ledgerEntries[i]=entry:state.ledgerEntries.push(entry);persist(state);
}

function deleteEntry(id){if(!isUnlocked()){askUnlock();return;}if(!confirm('刪除這筆出入金／轉帳紀錄？'))return;const state=load(),e=(state.ledgerEntries||[]).find(x=>x.id===id);if(e?.linkedTransactionIds?.length)state.transactions=state.transactions.filter(t=>!e.linkedTransactionIds.includes(t.id));state.ledgerEntries=(state.ledgerEntries||[]).filter(x=>x.id!==id);persist(state);}

function snapshotForm(state){const actual=currentActualHoldings(state).holdings,assets=[...new Set([...(state.assets||[]).filter(a=>!['CASH','OTHER'].includes(a))])];return `<div class="ledger-snapshot-grid">${assets.map(a=>input(`snap_${a}`,`${a} 實際數量`,actual[a]?.qty||'')).join('')}${input('snap_STABLE','USDT/USDC 總額',actual.STABLE?.value||'')}${input('snap_OTHER','其他小額資產（U）',actual.OTHER?.value||'')}</div>`;}
function saveSnapshot(form){if(!isUnlocked()){askUnlock();return;}const state=load(),d=Object.fromEntries(new FormData(form)),holdings={};for(const a of (state.assets||[]).filter(a=>!['CASH','OTHER'].includes(a)))holdings[a]={qty:+d[`snap_${a}`]||0};holdings.STABLE={value:+d.snap_STABLE||0,label:'USDT/USDC'};holdings.OTHER={value:+d.snap_OTHER||0,label:'其他小額資產'};const throughSeq=Math.max(0,...(state.transactions||[]).map(x=>+x.seq||+x.id||0),...(state.ledgerEntries||[]).map(x=>+x.seq||0));state.snapshots=state.snapshots||[];state.snapshots.push({id:nextId(state.snapshots),date:d.snapshotDate||today(),asOf:new Date().toISOString(),label:d.snapshotLabel||`${d.snapshotDate||today()} 對帳`,holdings,throughTransactionId:Math.max(0,...(state.transactions||[]).map(x=>+x.id||0)),throughLedgerId:Math.max(0,...(state.ledgerEntries||[]).map(x=>+x.id||0)),throughSeq,note:d.snapshotNote||''});persist(state);}

function renderCapitalStrip(){const host=document.querySelector('#dashboard');if(!host||host.classList.contains('hidden'))return;const old=host.querySelector('.capital-strip');old?.remove();const state=load(),m=ledgerMetrics(state),box=document.createElement('div');box.className='grid section capital-strip';box.innerHTML=`<div class="card kpi"><div class="label">第一倉投入本金</div><div class="value">${fmt(m.firstCapital)} U</div><div class="subtle">期初 31,664 U；後續出入金另計</div></div><div class="card kpi"><div class="label">第二倉期初資產基準</div><div class="value">${fmt(m.secondOpeningAssetBaseline)} U</div><div class="subtle">2026/09/07 依當日資產市值建立，不視為歷史成本</div></div><div class="card kpi"><div class="label">期初後淨入金</div><div class="value">${fmt(m.postBaselineNetFlow)} U</div><div class="subtle">只計之後真正的入金－出金</div></div><div class="card kpi"><div class="label">累積非交易收益</div><div class="value good">${fmt(m.income)} U</div><div class="subtle">Earn / Staking / 空投 / Cashback</div></div>`;host.prepend(box);}

function renderLedger(editId=0){
  const host=document.querySelector('#ledger');if(!host)return;const state=load(),entries=[...(state.ledgerEntries||[])].sort((a,b)=>(+b.seq||0)-(+a.seq||0)),edit=editId?entries.find(x=>x.id===editId):null,type=edit?.type||'deposit',m=ledgerMetrics(state);
  host.innerHTML=`<div class="grid"><div class="card kpi"><div class="label">第一倉投入本金</div><div class="value">${fmt(m.firstCapital)} U</div><div class="subtle">後續入 ${fmt(m.byWarehouse.第一倉.deposits)} · 出 ${fmt(m.byWarehouse.第一倉.withdrawals)}</div></div><div class="card kpi"><div class="label">第二倉期初資產基準</div><div class="value">${fmt(m.secondOpeningAssetBaseline)} U</div><div class="subtle">後續淨入金 ${fmt(m.postBaselineNetFlow)} U</div></div><div class="card kpi"><div class="label">非交易收益</div><div class="value good">${fmt(m.income)} U</div><div class="subtle">收益 / 空投紀錄累加</div></div></div>
  <div class="card section"><div class="ledger-head"><h2>${edit?'修改紀錄':'新增出入金 / 轉帳紀錄'}</h2><span class="subtle">入出金改變資金基準；交易所間轉帳不改變本金。</span></div><form id="ledgerForm" class="form-grid"><input type="hidden" name="editId" value="${edit?.id||''}">${select('type','類型',[{value:'deposit',label:'入金'},{value:'withdraw',label:'出金'},{value:'swap',label:'倉內換倉'},{value:'transfer',label:'交易所轉帳'},{value:'income',label:'收益 / 空投'}],type)}<div class="full ledger-fields">${fieldsFor(type,state,edit||{})}</div><label class="full"><span>備註</span><textarea name="note">${esc(edit?.note||'')}</textarea></label><div class="full toolbar"><button class="btn" type="button" id="ledgerClear">清空</button><button class="btn primary" type="submit">${edit?'儲存修改':'新增紀錄'}</button></div></form></div>
  <div class="card section"><h2>建立對帳 Snapshot</h2><div class="notice">輸入各資產在所有交易所的實際總餘額。建立後，系統以此為新基準，只套用之後的新交易與資金紀錄，不必回頭補齊所有歷史。</div><form id="snapshotForm" class="ledger-snapshot-form">${input('snapshotDate','對帳日期',today(),'date','')}${input('snapshotLabel','名稱',`${today()} 對帳`,'text','')}${snapshotForm(state)}<label class="full"><span>備註</span><textarea name="snapshotNote"></textarea></label><div class="toolbar"><button class="btn primary" type="submit">儲存 Snapshot</button></div></form></div>
  <div class="card section"><h2>出入金 / 轉帳紀錄</h2>${entries.length?`<div class="table-wrap"><table><thead><tr><th>日期</th><th>倉位</th><th>類型</th><th>內容</th><th>備註</th><th>操作</th></tr></thead><tbody>${entries.map(e=>`<tr><td>${e.date||''}</td><td>${e.warehouse||'—'}</td><td>${typeLabel(e.type)}</td><td>${esc(entrySummary(e))}</td><td>${esc(e.note||'')}</td><td><button data-ledger-edit="${e.id}">編輯</button> <button data-ledger-del="${e.id}">刪除</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="notice">尚無新增紀錄。既有歷史交易與 2026/09/07 初始 Snapshot 已保留。</div>'}</div>
  <div class="card section"><h2>Snapshot 歷史</h2><div class="table-wrap"><table><thead><tr><th>日期</th><th>名稱</th><th>涵蓋事件序號</th><th>備註</th></tr></thead><tbody>${[...(state.snapshots||[])].reverse().map(s=>`<tr><td>${s.date||''}</td><td>${esc(s.label||'')}</td><td>${s.throughSeq||0}</td><td>${esc(s.note||'')}</td></tr>`).join('')}</tbody></table></div></div>`;
  const form=host.querySelector('#ledgerForm');form.querySelector('[name="type"]').onchange=e=>{form.querySelector('.ledger-fields').innerHTML=fieldsFor(e.target.value,state,{});};form.onsubmit=e=>{e.preventDefault();saveEntry(form);};host.querySelector('#ledgerClear').onclick=()=>renderLedger();host.querySelectorAll('[data-ledger-edit]').forEach(b=>b.onclick=()=>{if(!isUnlocked()){askUnlock();return;}renderLedger(+b.dataset.ledgerEdit);scrollTo({top:0,behavior:'smooth'});});host.querySelectorAll('[data-ledger-del]').forEach(b=>b.onclick=()=>deleteEntry(+b.dataset.ledgerDel));const sf=host.querySelector('#snapshotForm');sf.onsubmit=e=>{e.preventDefault();saveSnapshot(sf);};
}

function boot(){
  ensureTab();renderCapitalStrip();
  const app=document.querySelector('#app');if(!app)return;
  const observer=new MutationObserver(()=>{
    observer.disconnect();
    ensureTab();renderCapitalStrip();
    observer.observe(app,{childList:true,subtree:true});
  });
  observer.observe(app,{childList:true,subtree:true});
}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot):boot();
