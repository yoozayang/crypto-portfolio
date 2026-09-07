export const STORAGE_KEY='cryptoPortfolioV1';

export async function loadSeed(){
  const [data,labels]=await Promise.all([
    fetch('./portfolio-data.json').then(r=>r.json()),
    fetch('./ui-labels.json').then(r=>r.json())
  ]);
  return {data,labels};
}

const clone=o=>JSON.parse(JSON.stringify(o));

export function loadState(seed){
  let existing=null;
  try{existing=JSON.parse(localStorage.getItem(STORAGE_KEY));}catch{}
  if(!existing) return clone(seed);
  const state=existing;
  const version=+state.dataVersion||1;
  if(version<(seed.dataVersion||1)){
    // History entered by the user always wins. Structural/reference data comes from seed.
    state.dataVersion=seed.dataVersion;
    state.assets=clone(seed.assets);
    state.exchanges=clone(seed.exchanges);
    state.plans=state.plans||clone(seed.plans);
    state.strategySettlements=state.strategySettlements||clone(seed.strategySettlements);
    state.reconciliation=clone(seed.reconciliation);
    state.prices={...seed.prices,...(state.prices||{})};
    saveState(state);
  }
  state.assets=state.assets||clone(seed.assets);
  state.exchanges=state.exchanges||clone(seed.exchanges);
  state.plans=state.plans||clone(seed.plans);
  state.strategySettlements=state.strategySettlements||clone(seed.strategySettlements);
  state.reconciliation=state.reconciliation||clone(seed.reconciliation);
  state.prices={...seed.prices,...(state.prices||{})};
  state.priceMeta=state.priceMeta||{};
  return state;
}

export function saveState(state){localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}
export function resetState(seed){const state=clone(seed);saveState(state);return state;}

export function exportBackup(state){
  const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);a.download=`crypto-portfolio-${new Date().toISOString().slice(0,10)}.json`;a.click();
  URL.revokeObjectURL(a.href);
}

export async function importBackup(file){return JSON.parse(await file.text());}
