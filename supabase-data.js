const SUPABASE_URL='https://uyxfppzinqnyofuwshye.supabase.co';
const SUPABASE_KEY='sb_publishable_bx9oTbaaOgMrpRfqQ4fYKQ_3EU7JqKG';
const headers={apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`};
const n=v=>v==null||v===''?null:+v;
async function request(path,init={}){const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{...init,headers:{...headers,'Content-Type':'application/json',Prefer:'return=minimal',...(init.headers||{})},cache:'no-store'});if(!r.ok)throw new Error(`Supabase ${r.status}: ${await r.text()}`);return r.status===204?null:r.json().catch(()=>null)}
const get=path=>request(path,{method:'GET'});
const mapTransaction=r=>({id:+r.id,seq:n(r.seq),warehouse:r.warehouse,exchange:r.exchange,date:r.trade_date,side:r.side,asset:r.asset,...(r.instrument?{instrument:r.instrument}:{}),price:+r.price||0,qty:+r.qty||0,amount:+r.amount_u||0,feeAsset:r.fee_asset||'',feeQty:+r.fee_qty||0,...(r.cost_adjustment==null?{}:{costAdjustment:+r.cost_adjustment}),reset:!!r.reset,note:r.note||'',...(r.group_id?{groupId:r.group_id}:{}),...(r.source?{source:r.source}:{})});
const mapStrategy=r=>({id:+r.id,warehouse:r.warehouse,exchange:r.exchange,strategy:r.strategy,type:r.settlement_type,invested:+r.invested||0,recovered:+r.recovered||0,realized:+r.realized||0,handling:r.handling||''});
const mapLedger=r=>({...(r.payload||{}),id:+r.id,seq:n(r.seq),type:r.entry_type,...(r.flow_type?{flowType:r.flow_type}:{}),...(r.entry_date?{date:r.entry_date}:{})});
export async function loadRemoteCollections(){const [transactions,strategySettlements,ledgerEntries]=await Promise.all([get('transactions?select=*&order=seq.asc.nullslast,id.asc'),get('strategy_settlements?select=*&order=id.asc'),get('ledger_entries?select=*&order=seq.asc.nullslast,id.asc')]);return {transactions:transactions.map(mapTransaction),strategySettlements:strategySettlements.map(mapStrategy),ledgerEntries:ledgerEntries.map(mapLedger)}}
const txRow=t=>({id:+t.id,seq:n(t.seq),warehouse:t.warehouse,exchange:t.exchange||'幣安',trade_date:t.date,side:t.side,asset:t.asset,instrument:t.instrument||null,price:+t.price||0,qty:+t.qty||0,amount_u:+t.amount||0,fee_asset:t.feeAsset||'',fee_qty:+t.feeQty||0,cost_adjustment:t.costAdjustment==null?null:+t.costAdjustment,reset:!!t.reset,note:t.note||'',group_id:t.groupId||null,source:t.source||null});
const strategyRow=s=>({id:+s.id,warehouse:s.warehouse,exchange:s.exchange||'',strategy:s.strategy||'',settlement_type:s.type||'',invested:+s.invested||0,recovered:+s.recovered||0,realized:+s.realized||0,handling:s.handling||''});
const ledgerRow=e=>{const {id,seq,type,flowType,date,...payload}=e;return {id:+id,seq:n(seq),entry_type:type||'流轉',flow_type:flowType||null,entry_date:date||null,payload}};
async function safeSyncTable(table,rows){
  const normalized=rows.filter(r=>Number.isFinite(+r.id)&&+r.id>0);
  if(normalized.length){
    await request(`${table}?on_conflict=id`,{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(normalized)});
  }
  const existing=await get(`${table}?select=id`);
  const keep=new Set(normalized.map(r=>+r.id));
  const stale=(existing||[]).map(r=>+r.id).filter(id=>!keep.has(id));
  for(const id of stale)await request(`${table}?id=eq.${id}`,{method:'DELETE'});
}
export async function syncRemoteCollections(state){
  await safeSyncTable('transactions',(state.transactions||[]).map(txRow));
  await safeSyncTable('strategy_settlements',(state.strategySettlements||[]).map(strategyRow));
  await safeSyncTable('ledger_entries',(state.ledgerEntries||[]).map(ledgerRow));
}
