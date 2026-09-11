import {loadRemoteCollections,loadRemoteSettings,syncRemoteCollections} from './supabase-data.js?v=20260911-1718';
export const STORAGE_KEY='cryptoPortfolioV1';
const clone=o=>JSON.parse(JSON.stringify(o));
const maxSeq=state=>Math.max(0,...(state.transactions||[]).map(x=>+x.seq||+x.id||0),...(state.ledgerEntries||[]).map(x=>+x.seq||0));
const normalizeSeq=state=>{state.nextEventSeq=Math.max(+state.nextEventSeq||1,maxSeq(state)+1);for(const t of state.transactions||[])if(!t.seq)t.seq=state.nextEventSeq++;for(const e of state.ledgerEntries||[])if(!e.seq)e.seq=state.nextEventSeq++;state.nextEventSeq=Math.max(state.nextEventSeq,maxSeq(state)+1);return state;};
const sharedSlice=state=>({transactions:state.transactions||[],strategySettlements:state.strategySettlements||[],ledgerEntries:state.ledgerEntries||[]});
const fingerprint=state=>JSON.stringify(sharedSlice(state));
let remoteFingerprint='';
let syncTimer=null;
function queueRemoteSync(state){if(sessionStorage.getItem('cryptoPortfolioEditUnlocked')!=='1')return;const fp=fingerprint(state);if(fp===remoteFingerprint)return;clearTimeout(syncTimer);const snapshot=clone(sharedSlice(state));syncTimer=setTimeout(async()=>{try{await syncRemoteCollections(snapshot);remoteFingerprint=JSON.stringify(snapshot);console.info('Portfolio events synced to Supabase.')}catch(err){console.error('Supabase sync failed.',err);alert('雲端同步失敗，本機快取仍保留；請重新整理後再試。')}},250);}
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
  data.transactions=remote.transactions;data.strategySettlements=remote.strategySettlements;data.ledgerEntries=remote.ledgerEntries;remoteFingerprint=JSON.stringify(remote);
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
export function loadState(seed){let existing=null;try{existing=JSON.parse(localStorage.getItem(STORAGE_KEY));}catch{}const state=migrate(existing||clone(seed),seed);localStorage.setItem(STORAGE_KEY,JSON.stringify(state));return state;}
export function readCachedState(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'null')}catch{return null}}
export function nextEventSeq(state){normalizeSeq(state);const n=state.nextEventSeq++;return n;}
export function saveState(state){normalizeSeq(state);localStorage.setItem(STORAGE_KEY,JSON.stringify(state));queueRemoteSync(state);}
export function resetState(seed){const state=migrate(clone(seed),seed);saveState(state);return state;}
export function exportBackup(state){const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`crypto-portfolio-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href);}
export async function importBackup(file){return JSON.parse(await file.text());}
