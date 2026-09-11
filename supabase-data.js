const SUPABASE_URL='https://uyxfppzinqnyofuwshye.supabase.co';
const SUPABASE_KEY='sb_publishable_bx9oTbaaOgMrpRfqQ4fYKQ_3EU7JqKG';
const headers={apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`};
async function request(path,init={}){const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{...init,headers:{...headers,'Content-Type':'application/json',Prefer:'return=minimal',...(init.headers||{})},cache:'no-store'});if(!r.ok)throw new Error(`Supabase ${r.status}: ${await r.text()}`);return r.status===204?null:r.json().catch(()=>null)}
const get=path=>request(path,{method:'GET'});
const clean=o=>Object.fromEntries(Object.entries(o).filter(([,v])=>v!==null&&v!==undefined));
const eventRow=(kind,item)=>({event_key:`${kind}:${item.id}`,event_kind:kind,event_date:item.date||null,seq:item.seq??null,payload:clean(item),updated_at:new Date().toISOString()});
export async function loadRemoteCollections(){
  const rows=await get('portfolio_events?select=*&order=seq.asc.nullslast,event_key.asc');
  const transactions=[],strategySettlements=[],ledgerEntries=[];
  for(const row of rows||[]){const item=row.payload||{};if(row.event_kind==='transaction')transactions.push(item);else if(row.event_kind==='strategy')strategySettlements.push(item);else if(row.event_kind==='ledger')ledgerEntries.push(item);}
  transactions.sort((a,b)=>(+a.seq||+a.id||0)-(+b.seq||+b.id||0));
  strategySettlements.sort((a,b)=>(+a.id||0)-(+b.id||0));
  ledgerEntries.sort((a,b)=>(+a.seq||+a.id||0)-(+b.seq||+b.id||0));
  return {transactions,strategySettlements,ledgerEntries};
}
export async function loadRemoteSettings(){
  const [assets,locations]=await Promise.all([
    get('asset_settings?select=*&order=sort_order.asc,code.asc'),
    get('location_settings?select=*&order=sort_order.asc,label.asc')
  ]);
  return {
    assets:(assets||[]).map(r=>({code:r.code,displayName:r.display_name||r.code,enabled:!!r.enabled,priceEnabled:!!r.price_enabled,priceSource:r.price_source||'binance_spot',priceSymbol:r.price_symbol||'',sortOrder:+r.sort_order||100,note:r.note||''})),
    locations:(locations||[]).map(r=>({id:r.id,label:r.label,type:r.type,enabled:!!r.enabled,sortOrder:+r.sort_order||100,note:r.note||''}))
  };
}
export async function saveAssetSetting(item){
  const code=String(item.code||'').trim().toUpperCase();
  if(!code)throw new Error('資產代號不可空白');
  const row={code,display_name:item.displayName||code,enabled:item.enabled!==false,price_enabled:item.priceEnabled!==false,price_source:item.priceSource||'binance_spot',price_symbol:String(item.priceSymbol||`${code}USDT`).trim().toUpperCase(),sort_order:+item.sortOrder||100,note:item.note||'',updated_at:new Date().toISOString()};
  await request('asset_settings?on_conflict=code',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(row)});
  return row;
}
export async function saveLocationSetting(item){
  const id=String(item.id||'').trim();
  if(!id)throw new Error('位置 ID 不可空白');
  const row={id,label:String(item.label||id).trim(),type:item.type||'other',enabled:item.enabled!==false,sort_order:+item.sortOrder||100,note:item.note||'',updated_at:new Date().toISOString()};
  await request('location_settings?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(row)});
  return row;
}
async function syncEvents(rows){
  if(rows.length)await request('portfolio_events?on_conflict=event_key',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(rows)});
  const existing=await get('portfolio_events?select=event_key');
  const keep=new Set(rows.map(r=>r.event_key));
  for(const r of existing||[])if(!keep.has(r.event_key))await request(`portfolio_events?event_key=eq.${encodeURIComponent(r.event_key)}`,{method:'DELETE'});
}
export async function syncRemoteCollections(state){
  const rows=[...(state.transactions||[]).map(x=>eventRow('transaction',x)),...(state.strategySettlements||[]).map(x=>eventRow('strategy',x)),...(state.ledgerEntries||[]).map(x=>eventRow('ledger',x))];
  await syncEvents(rows);
}
