export const STORAGE_KEY='cryptoPortfolioV1';
const clone=o=>JSON.parse(JSON.stringify(o));
const planTotal=(plans,w)=>Object.values(plans?.[w]||{}).reduce((s,v)=>s+(+v||0),0);
const maxSeq=state=>Math.max(0,...(state.transactions||[]).map(x=>+x.seq||+x.id||0),...(state.ledgerEntries||[]).map(x=>+x.seq||0));

export async function loadSeed(){
  const [data,labels,baseline]=await Promise.all([
    fetch('./portfolio-data.json?v=20260907-1400',{cache:'no-store'}).then(r=>r.json()),
    fetch('./ui-labels.json?v=20260907-1140',{cache:'no-store'}).then(r=>r.json()),
    fetch('./asset-baseline.json?v=20260907-1140',{cache:'no-store'}).then(r=>r.json())
  ]);
  data.dataVersion=Math.max(+data.dataVersion||1,6);
  data.reconciliation=data.reconciliation||{};
  data.reconciliation.actualHoldings=data.reconciliation.actualHoldings||{};
  data.reconciliation.actualHoldings.STABLE={value:+baseline.stable.value||0,note:baseline.stable.note,label:baseline.stable.label};
  data.reconciliation.actualHoldings.OTHER={value:+baseline.other.value||0,note:baseline.other.note,label:baseline.other.label};
  data.reconciliation.referenceTotal=+baseline.snapshotTotal||data.reconciliation.totalValue||0;
  data.reconciliation.baselineNote=baseline.note;
  data.ledgerEntries=data.ledgerEntries||[];
  const initialTxMax=Math.max(0,...(data.transactions||[]).map(x=>+x.id||0));
  data.snapshots=data.snapshots||[{
    id:1,date:'2026-09-07',asOf:baseline.asOf,label:'2026/09/07 初始對帳',holdings:clone(data.reconciliation.actualHoldings),throughTransactionId:initialTxMax,throughLedgerId:0,throughSeq:initialTxMax,note:baseline.note
  }];
  data.capitalOpening=data.capitalOpening||{
    第一倉:planTotal(data.plans,'第一倉'),
    第二倉:planTotal(data.plans,'第二倉')
  };
  data.nextEventSeq=Math.max(initialTxMax,maxSeq(data))+1;
  return {data,labels};
}

function migrate(state,seed){
  state.assets=state.assets||clone(seed.assets);
  state.exchanges=state.exchanges||clone(seed.exchanges);
  state.plans=state.plans||clone(seed.plans);
  state.strategySettlements=state.strategySettlements||clone(seed.strategySettlements);
  state.reconciliation=state.reconciliation||clone(seed.reconciliation);
  state.prices={...seed.prices,...(state.prices||{})};
  state.priceMeta=state.priceMeta||{};
  state.priceChanges24h=state.priceChanges24h||{};
  state.ledgerEntries=state.ledgerEntries||[];
  state.snapshots=state.snapshots?.length?state.snapshots:clone(seed.snapshots);
  state.capitalOpening=state.capitalOpening||clone(seed.capitalOpening);
  for(const t of state.transactions||[]) if(!t.seq)t.seq=+t.id||0;
  for(const e of state.ledgerEntries) if(!e.seq)e.seq=++state.nextEventSeq;
  state.nextEventSeq=Math.max(+state.nextEventSeq||1,maxSeq(state)+1);
  state.dataVersion=6;
  return state;
}

export function loadState(seed){
  let existing=null;try{existing=JSON.parse(localStorage.getItem(STORAGE_KEY));}catch{}
  if(!existing)return migrate(clone(seed),seed);
  const state=existing;
  if((+state.dataVersion||1)<6){
    const oldRecon=state.reconciliation||seed.reconciliation;
    const txMax=Math.max(0,...(state.transactions||[]).map(x=>+x.id||0));
    state.ledgerEntries=state.ledgerEntries||[];
    state.snapshots=state.snapshots?.length?state.snapshots:[{id:1,date:'2026-09-07',asOf:'2026-09-07 11:27 +08:00',label:'2026/09/07 初始對帳',holdings:clone(oldRecon.actualHoldings||seed.reconciliation.actualHoldings),throughTransactionId:txMax,throughLedgerId:0,throughSeq:txMax,note:'由既有 2026/09/07 對帳資料自動建立'}];
    state.capitalOpening=state.capitalOpening||{第一倉:planTotal(state.plans||seed.plans,'第一倉'),第二倉:planTotal(state.plans||seed.plans,'第二倉')};
  }
  migrate(state,seed);saveState(state);return state;
}

export function nextEventSeq(state){const n=Math.max(+state.nextEventSeq||1,maxSeq(state)+1);state.nextEventSeq=n+1;return n;}
export function saveState(state){localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}
export function resetState(seed){const state=migrate(clone(seed),seed);saveState(state);return state;}
export function exportBackup(state){const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`crypto-portfolio-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href);}
export async function importBackup(file){return JSON.parse(await file.text());}
