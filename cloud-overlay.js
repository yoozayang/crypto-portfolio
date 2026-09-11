import {loadRemoteCollections} from './supabase-data.js?v=20260911-1';

const STORAGE_KEY='cryptoPortfolioV1';
const originalFetch=window.fetch.bind(window);
let remote=null;

window.cryptoPortfolioCloudReady=loadRemoteCollections().then(data=>{
  remote=data;
  try{
    const existing=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
    if(existing){
      existing.transactions=data.transactions;
      existing.strategySettlements=data.strategySettlements;
      existing.ledgerEntries=data.ledgerEntries;
      existing.dataVersion=Math.max(+existing.dataVersion||1,11);
      localStorage.setItem(STORAGE_KEY,JSON.stringify(existing));
    }
  }catch(err){console.warn('Could not refresh local shared state from Supabase.',err);}
  return data;
}).catch(err=>{
  console.warn('Supabase unavailable; using repo/local fallback.',err);
  return null;
});

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
  return new Response(JSON.stringify(data),{status:response.status,statusText:response.statusText,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
};
