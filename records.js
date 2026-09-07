export const STORAGE_KEY='cryptoPortfolioV1';
const clone=o=>JSON.parse(JSON.stringify(o));
const planTotal=(plans,w)=>Object.values(plans?.[w]||{}).reduce((s,v)=>s+(+v||0),0);
const BASELINE_CAPITAL={第一倉:31664,第二倉:32953.46473535664};
const maxSeq=state=>Math.max(0,...(state.transactions||[]).map(x=>+x.seq||+x.id||0),...(state.ledgerEntries||[]).map(x=>+x.seq||0));
const normalizeSeq=state=>{state.nextEventSeq=Math.max(+state.nextEventSeq||1,maxSeq(state)+1);for(const t of state.transactions||[])if(!t.seq)t.seq=state.nextEventSeq++;for(const e of state.ledgerEntries||[])if(!e.seq)e.seq=state.nextEventSeq++;state.nextEventSeq=Math.max(state.nextEventSeq,maxSeq(state)+1);return state;};

export async function loadSeed(){
  const [data,labels,baseline]=await Promise.all([fetch('./portfolio-data.json?v=20260907-1415',{cache:'no-store'}).then(r=>r.json()),fetch('./ui-labels.json?v=20260907-1140',{cache:'no-store'}).then(r=>r.json()),fetch('./asset-baseline.json?v=20260907-1140',{cache:'no-store'}).then(r=>r.json())]);
  data.dataVersion=Math.max(+data.dataVersion||1,7);data.reconciliation=data.reconciliation||{};data.reconciliation.actualHoldings=data.reconciliation.actualHoldings||{};
  data.reconciliation.actualHoldings.STABLE={value:+baseline.stable.value||0,note:baseline.stable.note,label:baseline.stable.label};data.reconciliation.actualHoldings.OTHER={value:+baseline.other.value||0,note:baseline.other.note,label:baseline.other.label};data.reconciliation.referenceTotal=+baseline.snapshotTotal||data.reconciliation.totalValue||0;data.reconciliation.baselineNote=baseline.note;data.ledgerEntries=data.ledgerEntries||[];
  const initialTxMax=Math.max(0,...(data.transactions||[]).map(x=>+x.id||0));for(const t of data.transactions||[])if(!t.seq)t.seq=+t.id||0;
  data.snapshots=data.snapshots||[{id:1,date:'2026-09-07',asOf:baseline.asOf,label:'2026/09/07 初始對帳',holdings:clone(data.reconciliation.actualHoldings),throughTransactionId:initialTxMax,throughLedgerId:0,throughSeq:initialTxMax,note:baseline.note}];
  data.capitalOpening={...BASELINE_CAPITAL,...(data.capitalOpening||{})};data.nextEventSeq=Math.max(initialTxMax,maxSeq(data))+1;return {data,labels};
}

function migrate(state,seed){
  state.assets=state.assets||clone(seed.assets);state.exchanges=state.exchanges||clone(seed.exchanges);state.plans=state.plans||clone(seed.plans);state.strategySettlements=state.strategySettlements||clone(seed.strategySettlements);state.reconciliation=state.reconciliation||clone(seed.reconciliation);state.prices={...seed.prices,...(state.prices||{})};state.priceMeta=state.priceMeta||{};state.priceChanges24h=state.priceChanges24h||{};state.ledgerEntries=state.ledgerEntries||[];state.snapshots=state.snapshots?.length?state.snapshots:clone(seed.snapshots);
  if(!state.capitalOpening)state.capitalOpening=clone(BASELINE_CAPITAL);
  for(const t of state.transactions||[])if(!t.seq)t.seq=+t.id||0;normalizeSeq(state);state.dataVersion=7;return state;
}

export function loadState(seed){
  let existing=null;try{existing=JSON.parse(localStorage.getItem(STORAGE_KEY));}catch{}if(!existing)return migrate(clone(seed),seed);const state=existing;
  if((+state.dataVersion||1)<6){const oldRecon=state.reconciliation||seed.reconciliation,txMax=Math.max(0,...(state.transactions||[]).map(x=>+x.id||0));state.ledgerEntries=state.ledgerEntries||[];state.snapshots=state.snapshots?.length?state.snapshots:[{id:1,date:'2026-09-07',asOf:'2026-09-07 11:27 +08:00',label:'2026/09/07 初始對帳',holdings:clone(oldRecon.actualHoldings||seed.reconciliation.actualHoldings),throughTransactionId:txMax,throughLedgerId:0,throughSeq:txMax,note:'由既有 2026/09/07 對帳資料自動建立'}];}
  if((+state.dataVersion||1)<7){
    // 舊版把「第二倉投資計畫 15,833U」誤當成第二倉本金。改以 2026/09/07 實際總資產扣除第一倉原始本金與當時第一倉浮盈後反推。
    state.capitalOpening={第一倉:BASELINE_CAPITAL.第一倉,第二倉:BASELINE_CAPITAL.第二倉};
  }
  migrate(state,seed);saveState(state);return state;
}
export function nextEventSeq(state){normalizeSeq(state);const n=state.nextEventSeq++;return n;}
export function saveState(state){normalizeSeq(state);localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}
export function resetState(seed){const state=migrate(clone(seed),seed);saveState(state);return state;}
export function exportBackup(state){const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`crypto-portfolio-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href);}
export async function importBackup(file){return JSON.parse(await file.text());}
