import {loadRemoteCollections,syncRemoteCollections} from './supabase-data.js?v=20260911-3';
const STORAGE_KEY='cryptoPortfolioV1';
const originalFetch=window.fetch.bind(window);
let remote=null,syncTimer=null,lastSynced='',cloudLoaded=false;
const fingerprint=s=>JSON.stringify({transactions:s.transactions||[],strategySettlements:s.strategySettlements||[],ledgerEntries:s.ledgerEntries||[]});
window.cryptoPortfolioCloudReady=loadRemoteCollections().then(data=>{
  remote=data;
  lastSynced=fingerprint(data);
  try{
    const existing=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
    if(existing){
      existing.transactions=data.transactions;
      existing.strategySettlements=data.strategySettlements;
      existing.ledgerEntries=data.ledgerEntries;
      existing.dataVersion=Math.max(+existing.dataVersion||1,11);
      localStorage.setItem(STORAGE_KEY,JSON.stringify(existing));
    }
  }catch(err){console.warn('Could not refresh local shared state from Supabase.',err)}
  cloudLoaded=true;
  return data;
}).catch(err=>{console.warn('Supabase unavailable; using repo/local fallback.',err);cloudLoaded=false;return null});
window.fetch=async(input,init)=>{
  const url=typeof input==='string'?input:input?.url||'';
  const response=await originalFetch(input,init);
  if(!url.includes('portfolio-data.json'))return response;
  const shared=remote||await window.cryptoPortfolioCloudReady;
  if(!shared||!response.ok)return response;
  const data=await response.clone().json();
  data.transactions=shared.transactions;
  data.strategySettlements=shared.strategySettlements;
  data.ledgerEntries=shared.ledgerEntries;
  data.dataVersion=Math.max(+data.dataVersion||1,11);
  return new Response(JSON.stringify(data),{status:response.status,statusText:response.statusText,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}})
};
function cloudSlice(state){return {transactions:state.transactions||[],strategySettlements:state.strategySettlements||[],ledgerEntries:state.ledgerEntries||[]}}
const originalSetItem=Storage.prototype.setItem;
Storage.prototype.setItem=function(key,value){
  originalSetItem.call(this,key,value);
  if(this!==localStorage||key!==STORAGE_KEY||sessionStorage.getItem('cryptoPortfolioEditUnlocked')!=='1'||!cloudLoaded)return;
  let state;
  try{state=JSON.parse(value)}catch{return}
  const slice=cloudSlice(state),fp=fingerprint(slice);
  if(fp===lastSynced)return;
  clearTimeout(syncTimer);
  syncTimer=setTimeout(async()=>{
    try{
      await syncRemoteCollections(slice);
      lastSynced=fp;
      remote=slice;
      console.info('Portfolio synced to Supabase.');
    }catch(err){
      console.error('Supabase sync failed.',err);
      alert('雲端同步失敗，本機資料仍已保留。請重新整理後再試。');
    }
  },250);
};
