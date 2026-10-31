import {readFile} from 'node:fs/promises';
import {reconciledPortfolio,marketValue} from '../calculations.js';
const url=process.env.SUPABASE_URL||'https://uyxfppzinqnyofuwshye.supabase.co';
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!key)throw Error('Missing SUPABASE_SERVICE_ROLE_KEY GitHub Actions secret');
const headers={apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'};
async function rest(path,options={}){const r=await fetch(url+'/rest/v1/'+path,{...options,headers:{...headers,...options.headers}});if(!r.ok)throw Error(path+': '+r.status+' '+await r.text());return r.status===204?null:r.json();}
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
for(const asset of assets){if(['STABLE','CASH','OTHER','USDT','USDC'].includes(asset))continue;
 const cfg=settingsMap.get(asset);if(!cfg||!cfg.price_enabled||cfg.price_source!=='binance_spot')throw Error('No supported price source for '+asset);
 const symbol=cfg.price_symbol||asset+'USDT';
 const response=await fetch('https://api.binance.com/api/v3/ticker/price?symbol='+encodeURIComponent(symbol));
 if(!response.ok)throw Error('Price lookup failed for '+asset+' ('+symbol+'): '+response.status);
 const quote=await response.json();const price=Number(quote.price);
 if(!Number.isFinite(price)||price<=0)throw Error('Invalid price for '+asset);
 state.prices[asset]=price;
}
const c=reconciledPortfolio(state);const assetsValue={};
for(const p of [...c.warehouses.第一倉,...c.warehouses.第二倉])assetsValue[p.asset]=(assetsValue[p.asset]||0)+marketValue(p,state.prices);
const total=c.displayMarket;
if(!Number.isFinite(total)||total<=0)throw Error('Invalid portfolio total');
const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const depositTotal=ledgerEntries.filter(e=>e.type==='deposit').reduce((s,e)=>s+Number(e.amountU||0),0);
const withdrawalTotal=ledgerEntries.filter(e=>e.type==='withdraw').reduce((s,e)=>s+Number(e.amountU||0),0);
const row={snapshot_date:day,captured_at:new Date().toISOString(),total_value:total,first_value:c.firstMarket,second_value:c.secondMarket,assets:assetsValue,prices:state.prices,deposit_total:depositTotal,withdrawal_total:withdrawalTotal,source:'github_actions'};
await rest('portfolio_daily_snapshots?on_conflict=snapshot_date',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(row)});
const check=await rest('portfolio_daily_snapshots?select=snapshot_date,total_value&snapshot_date=eq.'+day);
if(check.length!==1||Math.abs(Number(check[0].total_value)-total)>0.01)throw Error('Snapshot verification failed');
console.log('Saved verified daily snapshot',day,total);
