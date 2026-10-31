import {loadRemoteCollections,loadRemoteSettings,applyEventChanges,planEventChanges,eventKey,samePayload,clean} from './supabase-data.js';
// Must equal version.json and the ?v= values in index.html; update all three with `node tools/stamp-build.mjs`.
export const BUILD='20261031-093000';
export const STORAGE_KEY='cryptoPortfolioV1';
const JOURNAL_KEY='cryptoPortfolioPendingWrites',FLASH_KEY='cryptoPortfolioFlash',UNLOCK_KEY='cryptoPortfolioEditUnlocked';
const clone=o=>JSON.parse(JSON.stringify(o));
const log=(...a)=>console.info('[persist]',...a);
const maxSeq=state=>Math.max(0,...(state.transactions||[]).map(x=>+x.seq||+x.id||0),...(state.ledgerEntries||[]).map(x=>+x.seq||0));
const normalizeSeq=state=>{state.nextEventSeq=Math.max(+state.nextEventSeq||1,maxSeq(state)+1);for(const t of state.transactions||[])if(!t.seq)t.seq=state.nextEventSeq++;for(const e of state.ledgerEntries||[])if(!e.seq)e.seq=state.nextEventSeq++;state.nextEventSeq=Math.max(state.nextEventSeq,maxSeq(state)+1);return state;};
const sharedSlice=state=>({transactions:state.transactions||[],strategySettlements:state.strategySettlements||[],ledgerEntries:state.ledgerEntries||[]});
const KINDS=[['transactions','transaction'],['strategySettlements','strategy'],['ledgerEntries','ledger']];
let markReady;
// Resolves once app.js has replaced the local cache with the Supabase state; render cached data only after this.
export const stateReady=new Promise(r=>markReady=r);
const fallbackAssets=data=>(data.assets||[]).filter(code=>!['CASH','OTHER','STABLE'].includes(code)).map((code,i)=>({code,displayName:code,enabled:true,priceEnabled:true,priceSource:'binance_spot',priceSymbol:code==='MSTR'?'MSTRBUSDT':`${code}USDT`,sortOrder:(i+1)*10,note:''}));
const fallbackLocations=flow=>(flow.locations||[]).map((x,i)=>({...x,enabled:true,sortOrder:(i+1)*10,note:''}));
export async function loadSeed(){
  const [data,labels,baseline,flow,remote,settings]=await Promise.all([
    fetch('./portfolio-data.json?v=20260907-1430',{cache:'no-store'}).then(r=>r.json()),
    fetch('./ui-labels.json?v=20260907-1140',{cache:'no-store'}).then(r=>r.json()),
    fetch('./baseline.json?v=20260907-1600',{cache:'no-store'}).then(r=>r.json()),
    fetch('./flow-config.json?v=20260907-1620',{cache:'no-store'}).then(r=>r.json()),
    loadRemoteCollections(),
    loadRemoteSettings()
  ]);
  data.transactions=remote.transactions;data.strategySettlements=remote.strategySettlements;data.ledgerEntries=remote.ledgerEntries;
  data.assetSettings=settings.assets?.length?settings.assets:fallbackAssets(data);
  data.locationSettings=settings.locations?.length?settings.locations:fallbackLocations(flow);
  const historicalAssets=new Set([...(data.transactions||[]).map(x=>x.asset),...Object.keys(data.reconciliation?.actualHoldings||{}),...(data.assetSettings||[]).map(x=>x.code),'CASH','OTHER']);
  data.assets=[...historicalAssets].filter(Boolean);
  data.exchanges=(data.locationSettings||[]).filter(x=>x.type==='exchange').map(x=>x.label);
  data.dataVersion=Math.max(+data.dataVersion||1,14);
  data.reconciliation=data.reconciliation||{};data.reconciliation.actualHoldings=data.reconciliation.actualHoldings||{};
  data.reconciliation.actualHoldings.STABLE={value:+baseline.holdings?.stable?.value||0,note:baseline.holdings?.stable?.note,label:baseline.holdings?.stable?.label};
  data.reconciliation.actualHoldings.OTHER={value:+baseline.holdings?.other?.value||0,note:baseline.holdings?.other?.note,label:baseline.holdings?.other?.label};
  data.reconciliation.referenceTotal=+baseline.snapshot?.referenceTotal||data.reconciliation.totalValue||0;data.reconciliation.baselineNote=baseline.notes?.snapshot||'';
  const initialTxMax=Math.max(0,...(data.transactions||[]).map(x=>+x.id||0));for(const t of data.transactions||[])if(!t.seq)t.seq=+t.id||0;
  data.snapshots=data.snapshots||[{id:1,date:String(baseline.asOf||'2026-09-07').slice(0,10),asOf:baseline.asOf,label:baseline.snapshot?.label||'2026/09/07 初始對帳',holdings:clone(data.reconciliation.actualHoldings),throughTransactionId:initialTxMax,throughLedgerId:0,throughSeq:initialTxMax,note:baseline.notes?.snapshot||''}];
  data.capitalOpening={第一倉:+baseline.accounting?.firstCapital||0};data.secondOpeningAssetBaseline=+baseline.accounting?.secondOpeningAssetBaseline||0;data.accountingNotes=clone(baseline.notes||{});data.nextEventSeq=Math.max(initialTxMax,maxSeq(data))+1;
  return {data,labels};
}
function migrate(state,seed){
  state.assets=clone(seed.assets);state.exchanges=clone(seed.exchanges);state.assetSettings=clone(seed.assetSettings||[]);state.locationSettings=clone(seed.locationSettings||[]);
  state.plans=state.plans||clone(seed.plans);state.reconciliation=state.reconciliation||clone(seed.reconciliation);state.prices={...seed.prices,...(state.prices||{})};state.priceMeta=state.priceMeta||{};state.priceChanges24h=state.priceChanges24h||{};state.snapshots=state.snapshots?.length?state.snapshots:clone(seed.snapshots);state.capitalOpening={第一倉:+seed.capitalOpening?.第一倉||0};state.secondOpeningAssetBaseline=+seed.secondOpeningAssetBaseline||0;state.accountingNotes=clone(seed.accountingNotes||{});
  state.transactions=clone(seed.transactions||[]);state.strategySettlements=clone(seed.strategySettlements||[]);state.ledgerEntries=clone(seed.ledgerEntries||[]);for(const t of state.transactions)if(!t.seq)t.seq=+t.id||0;normalizeSeq(state);state.dataVersion=14;return state;
}
export function loadState(seed){let existing=null;try{existing=JSON.parse(localStorage.getItem(STORAGE_KEY));}catch{}const state=migrate(existing||clone(seed),seed);localStorage.setItem(STORAGE_KEY,JSON.stringify(state));markReady(state);return state;}
// Form option lists come from 設定 (asset_settings / location_settings): enabled entries only, in sort order.
const bySort=(a,b)=>(+a.sortOrder||100)-(+b.sortOrder||100);
export const enabledAssets=state=>(state?.assetSettings||[]).filter(x=>x.enabled).sort(bySort).map(x=>x.code);
export const enabledLocations=(state,types=['exchange'])=>(state?.locationSettings||[]).filter(x=>x.enabled&&types.includes(x.type)).sort(bySort).map(x=>x.label);
// A value already stored on a record stays selectable after it is disabled, so editing never silently changes it.
export const withCurrent=(list,current)=>current&&!list.includes(current)?[current,...list]:list;
export const preferred=(list,...wanted)=>wanted.find(w=>list.includes(w))??list[0]??'';
export function readCachedState(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'null')}catch{return null}}
export function nextEventSeq(state){normalizeSeq(state);const n=state.nextEventSeq++;return n;}
// Local cache only (prices, plans, snapshots). Financial records are never written here; they reach the
// cache exclusively through commitChange() after Supabase confirmed them, so the cache cannot hold unsaved records.
export function saveState(state){normalizeSeq(state);const cached=readCachedState();localStorage.setItem(STORAGE_KEY,JSON.stringify(cached?{...state,...sharedSlice(cached)}:state));}
export function resetState(seed){const state=migrate(clone(seed),seed);saveState(state);return state;}
export function exportBackup(state){const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`crypto-portfolio-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href);}
export async function importBackup(file){return JSON.parse(await file.text());}

// ---- Financial writes ----
// Only the records a form actually added, edited or removed (before → after) are sent; untouched records are never rewritten.
export function diffEvents(before,after){
  const index=s=>{const m=new Map();for(const [field,kind] of KINDS)for(const item of s?.[field]||[]){const key=eventKey(kind,item);if(m.has(key))throw new Error(`紀錄編號重複（${key}），本次未寫入。請重新整理後再操作。`);m.set(key,{kind,item});}return m;};
  const a=index(before),b=index(after),changes=[];
  for(const [key,{kind,item}] of b){const old=a.get(key)?.item??null;if(!old||!samePayload(clean(old),clean(item)))changes.push({key,kind,before:old?clone(old):null,after:clone(item)});}
  for(const [key,{kind,item}] of a)if(!b.has(key))changes.push({key,kind,before:clone(item),after:null});
  return changes;
}
// Journal of unconfirmed writes: survives reloads and crashes so an interrupted or failed save is never silently lost.
const readJournal=()=>{try{return JSON.parse(localStorage.getItem(JOURNAL_KEY)||'[]')}catch{return []}};
const writeJournal=list=>list.length?localStorage.setItem(JOURNAL_KEY,JSON.stringify(list)):localStorage.removeItem(JOURNAL_KEY);
const putJob=job=>writeJournal([...readJournal().filter(j=>j.id!==job.id),job]);
const dropJob=id=>writeJournal(readJournal().filter(j=>j.id!==id));
export const pendingWrites=()=>readJournal();
async function assertCurrentBuild(){
  let live;
  try{const r=await fetch('./version.json',{cache:'no-store'});if(!r.ok)throw new Error(`HTTP ${r.status}`);live=(await r.json()).build;}
  catch(err){throw new Error(`無法確認網站版本（${err.message||err}）`);}
  if(live!==BUILD)throw new Error(`網站已更新為新版（${live}），目前頁面仍是舊版（${BUILD}）。請重新整理頁面後再送出`);
}
let inFlight=null;
const unloadGuard=e=>{e.preventDefault();e.returnValue='';};
export const isCommitPending=()=>!!inFlight;
async function runJob(job){
  if(inFlight)throw new Error(`「${inFlight.label}」仍在儲存中，請等待完成後再送出`);
  inFlight=job;putJob({...job,status:'pending'});
  globalThis.addEventListener?.('beforeunload',unloadGuard);
  setStatus('pending',`${job.label}：儲存到雲端中…請勿關閉或重新整理頁面`);
  const t0=Date.now();
  try{
    await assertCurrentBuild();
    const res=await applyEventChanges(job.changes);
    dropJob(job.id);
    log('saved',job.label,{...res,ms:Date.now()-t0});
    setStatus('saved',`${job.label}：已儲存到雲端`);
    return res;
  }catch(err){
    const partial=err.applied?.length?`（已寫入 ${err.applied.join(', ')}，其餘未寫入；可於頁面上方「重試寫入」完成）`:err.code==='conflict'?'（本次未寫入雲端；變更內容保留在頁面上方清單，可下載後捨棄）':'（資料尚未寫入雲端，已保留於頁面上方清單可重試）';
    err.message=`${err.message||err}${partial}`;
    putJob({...job,status:'failed',error:err.message,failedAt:new Date().toISOString()});
    console.error('[persist] save failed',job.label,{changes:job.changes.map(c=>c.key),ms:Date.now()-t0},err);
    setStatus('failed',`${job.label}：儲存失敗。${err.message}`);
    throw err;
  }finally{inFlight=null;globalThis.removeEventListener?.('beforeunload',unloadGuard);renderPendingWrites();}
}
// The single entry point for financial records: resolves only after Supabase confirmed every changed row,
// then updates the local cache. On any failure it throws and the local cache is left untouched.
export async function commitChange(before,after,{label='財務紀錄'}={}){
  if(sessionStorage.getItem(UNLOCK_KEY)!=='1')throw new Error('請先解鎖編輯，才能儲存到雲端');
  if(inFlight)throw new Error(`「${inFlight.label}」仍在儲存中，請等待完成後再送出`);
  normalizeSeq(after);
  const changes=diffEvents(before,after);
  if(!changes.length){log('no financial changes',label);return {applied:[],skipped:[]};}
  const res=await runJob({id:`${Date.now()}-${Math.random().toString(36).slice(2,8)}`,label,createdAt:new Date().toISOString(),changes});
  localStorage.setItem(STORAGE_KEY,JSON.stringify(after));
  return res;
}
export function reloadAfterSave(tab,message){if(tab)sessionStorage.setItem('cryptoPortfolioReturnTab',tab);if(message)sessionStorage.setItem(FLASH_KEY,message);location.reload();}
export function retryPendingWrite(id){const job=readJournal().find(j=>j.id===id);if(!job)throw new Error('找不到待寫入紀錄');return runJob(job);}
export function discardPendingWrite(id){dropJob(id);log('discarded pending write',id);}
// On load: drop journal entries the cloud already contains (e.g. the page was closed after the write landed).
export async function reconcilePendingWrites(){
  for(const job of readJournal()){
    try{
      const plan=await planEventChanges(job.changes);
      if(plan.done.length===job.changes.length){dropJob(job.id);log('pending write confirmed in cloud',job.label);}
      else putJob({...job,status:plan.conflicts.length?'conflict':(job.status==='pending'?'interrupted':job.status)});
    }catch(err){console.error('[persist] could not check pending write',job.label,err);}
  }
  renderPendingWrites();
}

// ---- Status UI ----
function ensureStyles(){
  if(typeof document==='undefined'||document.querySelector('#persistStyles'))return;
  const s=document.createElement('style');s.id='persistStyles';
  s.textContent='.persist-status{position:fixed;right:16px;bottom:16px;z-index:1000;max-width:min(420px,calc(100vw - 32px));padding:12px 14px;border-radius:10px;font-size:14px;line-height:1.5;box-shadow:0 6px 24px rgba(0,0,0,.35);cursor:pointer}.persist-status.pending{background:#3a2f0b;color:#ffe08a;border:1px solid #8a6d1a}.persist-status.saved{background:#0d2e1c;color:#8ff0b5;border:1px solid #1f7a48}.persist-status.failed{background:#3a1010;color:#ffb3b3;border:1px solid #9b2c2c}.pending-writes .toolbar{margin-top:8px}.pending-writes li{margin:6px 0}';
  document.head.appendChild(s);
}
export function setStatus(kind,text){
  if(typeof document==='undefined')return;
  ensureStyles();
  let el=document.querySelector('#persistStatus');
  if(!el){el=document.createElement('div');el.id='persistStatus';el.setAttribute('role','status');el.setAttribute('aria-live','polite');el.title='點擊關閉';el.onclick=()=>el.remove();document.body.appendChild(el);}
  el.className=`persist-status ${kind}`;el.dataset.state=kind;el.textContent=text;
  clearTimeout(el._timer);if(kind==='saved')el._timer=setTimeout(()=>el.remove(),6000);
}
export function showFlash(){const m=sessionStorage.getItem(FLASH_KEY);if(!m)return;sessionStorage.removeItem(FLASH_KEY);setStatus('saved',m);}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const statusText={pending:'儲存中',interrupted:'中斷，未確認寫入',failed:'儲存失敗',conflict:'與雲端資料衝突'};
export function renderPendingWrites(){
  if(typeof document==='undefined')return;
  document.querySelector('#pendingWrites')?.remove();
  const jobs=readJournal().filter(j=>j.id!==inFlight?.id);
  if(!jobs.length)return;
  ensureStyles();
  const box=document.createElement('div');box.id='pendingWrites';box.className='notice bad section pending-writes';
  box.innerHTML=`<strong>有 ${jobs.length} 筆財務紀錄尚未確認寫入雲端</strong>（雲端資料未包含這些變更）<ul>${jobs.map(j=>`<li>${esc(j.label)}・${esc(new Date(j.createdAt).toLocaleString())}・${esc(statusText[j.status]||j.status)}${j.error?`<br><span class="subtle">${esc(j.error)}</span>`:''}<div class="toolbar"><button class="btn primary" data-pending-retry="${esc(j.id)}">重試寫入</button><button class="btn" data-pending-download="${esc(j.id)}">下載內容</button><button class="btn" data-pending-discard="${esc(j.id)}">捨棄</button></div></li>`).join('')}</ul>`;
  const host=document.querySelector('#app');host?.insertBefore(box,host.querySelector('.tabs'));
  box.querySelectorAll('[data-pending-retry]').forEach(b=>b.onclick=async()=>{
    if(sessionStorage.getItem(UNLOCK_KEY)!=='1'){window.cryptoPortfolioEditLock?.open?.();return;}
    b.disabled=true;
    try{await retryPendingWrite(b.dataset.pendingRetry);reloadAfterSave('', '待寫入紀錄已儲存到雲端');}
    catch(err){alert(err.message||String(err));renderPendingWrites();}
  });
  box.querySelectorAll('[data-pending-download]').forEach(b=>b.onclick=()=>{const job=readJournal().find(j=>j.id===b.dataset.pendingDownload);if(!job)return;const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(job,null,2)],{type:'application/json'}));a.download=`pending-write-${job.id}.json`;a.click();URL.revokeObjectURL(a.href);});
  box.querySelectorAll('[data-pending-discard]').forEach(b=>b.onclick=()=>{if(!confirm('捨棄後這筆變更不會寫入雲端，確定捨棄？'))return;discardPendingWrite(b.dataset.pendingDiscard);renderPendingWrites();});
}
