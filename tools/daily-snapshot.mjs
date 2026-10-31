import {readFile} from 'node:fs/promises';
import {reconciledPortfolio,marketValue} from '../calculations.js';
const url=process.env.SUPABASE_URL||'https://uyxfppzinqnyofuwshye.supabase.co';
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!key)throw Error('Missing SUPABASE_SERVICE_ROLE_KEY GitHub Actions secret');
const headers={apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'};
async function rest(path,options={}){const r=await fetch(url+'/rest/v1/'+path,{...options,headers:{...headers,...options.headers}});if(!r.ok)throw Error(path+': '+r.status+' '+await r.text());const body=await r.text();if(!body.trim())return null;try{return JSON.parse(body)}catch(e){throw Error('Invalid JSON from '+path+': '+e.message)}}
const [seed,baseline,rows,settings]=await Promise.all([
 readFile(new URL('../portfolio-data.json',import.meta.url),'utf8').then(JSON.parse),
 readFile(new URL('../baseline.json',import.meta.url),'utf8').then(JSON.parse),
 rest('portfolio_events?select=event_kind,payload&order=seq.asc.nullslast'),
 rest('asset_settings?select=code,price_enabled,price_source,price_symbol')
]);
const transactions=[],ledgerEntries=[],strategySettlements=[];
for(const row of rows){if(row.event_kind==='transaction')transactions.push(row.payload);if(row.event_kind==='ledger')ledgerEntries.push(row.payload);if(row.event_kind==='strategy')strategySettlements.push(row.payload)}
const holdings={...seed.reconciliation.actualHoldings,STABLE:{value:Number(baseline.holdings.stable.value)},OTHER:{value:Number(baseline.holdings.other.value)}};
delete holdings.CASH;
const state={...seed,transactions,ledgerEntries,strategySettlements,capitalOpening:{第一倉:Number(baseline.accounting.firstCapital)},secondOpeningAssetBaseline:Number(baseline.accounting.secondOpeningAssetBaseline),snapshots:[{throughSeq:Math.max(0,...(seed.transactions||[]).map(x=>Number(x.id)||0)),holdings}],prices:{}};
const assets=new Set([...Object.keys(holdings),...transactions.map(x=>x.asset),...ledgerEntries.map(x=>x.asset)]);
const settingsMap=new Map(settings.map(x=>[x.code,x]));
const priceSources={};
for(const asset of assets){if(['STABLE','CASH','OTHER','USDT','USDC'].includes(asset))continue;
 const cfg=settingsMap.get(asset);if(!cfg||!cfg.price_enabled||cfg.price_source!=='binance_spot')throw Error('No supported price source for '+asset);
 const symbol=cfg.price_symbol||asset+'USDT';
 const endpoints=[
  'https://api.binance.com/api/v3/ticker/price?symbol=',
  'https://data-api.binance.vision/api/v3/ticker/price?symbol=',
  'https://api.binance.us/api/v3/ticker/price?symbol='
 ];
 let price=NaN,errors=[];
 for(const endpoint of endpoints){
  try{
   const response=await fetch(endpoint+encodeURIComponent(symbol),{signal:AbortSignal.timeout(8000)});
   if(!response.ok){errors.push(new URL(endpoint).host+': HTTP '+response.status);continue}
   const quote=await response.json();price=Number(quote.price);
   if(Number.isFinite(price)&&price>0)break;
   errors.push(new URL(endpoint).host+': invalid price');
  }catch(err){errors.push(new URL(endpoint).host+': '+err.message)}
 }
 if(!Number.isFinite(price)||price<=0){
  const cached=await rest('browser_price_quotes?select=price,captured_at,symbol&asset=eq.'+encodeURIComponent(asset)+'&order=captured_at.desc&limit=1');
  const q=cached?.[0],age=q?Date.now()-Date.parse(q.captured_at):Infinity;
  if(q?.symbol===symbol&&age>=0&&age<=30*60*1000&&Number(q.price)>0){price=Number(q.price);priceSources[asset]='browser_cache'}
 }
 if(!Number.isFinite(price)||price<=0)throw Error('Price lookup failed for '+asset+' ('+symbol+'): '+errors.join('; ')+'; no fresh browser cache');
 priceSources[asset]??='binance_spot';
 state.prices[asset]=price;
}
const c=reconciledPortfolio(state);const assetsValue={};
for(const p of [...c.warehouses.第一倉,...c.warehouses.第二倉])assetsValue[p.asset]=(assetsValue[p.asset]||0)+marketValue(p,state.prices);
const total=c.displayMarket;
if(!Number.isFinite(total)||total<=0)throw Error('Invalid portfolio total');
const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const depositTotal=ledgerEntries.filter(e=>e.type==='deposit').reduce((s,e)=>s+Number(e.amountU||0),0);
const withdrawalTotal=ledgerEntries.filter(e=>e.type==='withdraw').reduce((s,e)=>s+Number(e.amountU||0),0);
const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Taipei',hour:'2-digit',hourCycle:'h23'}).format(new Date()));
const slot=hour<8?1:hour<16?2:3;
const row={snapshot_date:day,snapshot_slot:slot,captured_at:new Date().toISOString(),total_value:total,first_value:c.firstMarket,second_value:c.secondMarket,assets:assetsValue,prices:{...state.prices,_sources:priceSources},deposit_total:depositTotal,withdrawal_total:withdrawalTotal,source:'github_actions'};
await rest('portfolio_daily_snapshots?on_conflict=snapshot_date,snapshot_slot',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(row)});
const check=await rest('portfolio_daily_snapshots?select=snapshot_date,total_value&snapshot_date=eq.'+day+'&snapshot_slot=eq.'+slot);
if(check.length!==1||Math.abs(Number(check[0].total_value)-total)>0.01)throw Error('Snapshot verification failed');
console.log('Saved verified daily snapshot',day,slot,total);
