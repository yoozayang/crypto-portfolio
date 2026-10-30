// Display-only coin list for the 目前幣價 tab. Stored in this browser and never touches asset_settings,
// so which prices feed the portfolio calculations (priceEnabled assets) is unaffected by adding or removing here.
const KEY='cryptoPortfolioPriceWatchlist';
const BINANCE='https://api.binance.com/api/v3';
const read=()=>{try{const v=JSON.parse(localStorage.getItem(KEY)||'null');return {added:Array.isArray(v?.added)?v.added:[],removed:Array.isArray(v?.removed)?v.removed:[]};}catch{return {added:[],removed:[]};}};
const write=v=>{try{localStorage.setItem(KEY,JSON.stringify(v));}catch{}};
// defaults: [{code,symbol,...}] from asset settings. Shown = defaults the user did not remove, then coins the user added.
export function watchlist(defaults){
  const {added,removed}=read(),shown=defaults.filter(d=>!removed.includes(d.code));
  for(const a of added)if(!shown.some(x=>x.code===a.code))shown.push({code:a.code,symbol:a.symbol,watchOnly:true});
  return shown;
}
export function addToWatchlist({code,symbol}){
  const v=read();v.removed=v.removed.filter(c=>c!==code);
  if(!v.added.some(x=>x.code===code))v.added.push({code,symbol});
  write(v);
}
export function removeFromWatchlist(code){
  const v=read();v.added=v.added.filter(x=>x.code!==code);
  if(!v.removed.includes(code))v.removed.push(code);
  write(v);
}
let symbols=null;
async function loadSymbols(){
  if(symbols)return symbols;
  const r=await fetch(`${BINANCE}/ticker/price`);
  if(!r.ok)throw new Error(`Binance ${r.status}`);
  symbols=(await r.json()).map(x=>x.symbol).filter(s=>s.endsWith('USDT')&&s.length>4).map(s=>({code:s.slice(0,-4),symbol:s}));
  return symbols;
}
// Matches Binance spot USDT pairs by coin code: exact match first, then prefix, then substring.
export async function searchSymbols(query,limit=8){
  const q=String(query||'').trim().toUpperCase().replace(/USDT$/,'');
  if(!q)return [];
  const rank=x=>x.code===q?0:x.code.startsWith(q)?1:2;
  return (await loadSymbols()).filter(x=>x.code.includes(q)).sort((a,b)=>rank(a)-rank(b)||a.code.length-b.code.length||a.code.localeCompare(b.code)).slice(0,limit);
}
export async function fetchQuote(symbol){
  const r=await fetch(`${BINANCE}/ticker/24hr?symbol=${encodeURIComponent(symbol)}`);
  if(!r.ok)throw new Error(`Binance ${r.status}`);
  const j=await r.json();
  return {price:+j.lastPrice||0,change:Number.isFinite(+j.priceChangePercent)?+j.priceChangePercent:null};
}
