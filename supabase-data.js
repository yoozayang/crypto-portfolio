const SUPABASE_URL='https://uyxfppzinqnyofuwshye.supabase.co';
const SUPABASE_KEY='sb_publishable_bx9oTbaaOgMrpRfqQ4fYKQ_3EU7JqKG';

const headers={apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`};
const n=v=>v==null||v===''?null:+v;

async function get(path){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{headers,cache:'no-store'});
  if(!r.ok)throw new Error(`Supabase ${r.status}: ${await r.text()}`);
  return r.json();
}

const mapTransaction=r=>({
  id:+r.id,
  seq:n(r.seq),
  warehouse:r.warehouse,
  exchange:r.exchange,
  date:r.trade_date,
  side:r.side,
  asset:r.asset,
  ...(r.instrument?{instrument:r.instrument}:{}),
  price:+r.price||0,
  qty:+r.qty||0,
  amount:+r.amount_u||0,
  feeAsset:r.fee_asset||'',
  feeQty:+r.fee_qty||0,
  ...(r.cost_adjustment==null?{}:{costAdjustment:+r.cost_adjustment}),
  reset:!!r.reset,
  note:r.note||'',
  ...(r.group_id?{groupId:r.group_id}:{}),
  ...(r.source?{source:r.source}:{})
});

const mapStrategy=r=>({
  id:+r.id,
  warehouse:r.warehouse,
  exchange:r.exchange,
  strategy:r.strategy,
  type:r.settlement_type,
  invested:+r.invested||0,
  recovered:+r.recovered||0,
  realized:+r.realized||0,
  handling:r.handling||''
});

const mapLedger=r=>({
  ...(r.payload||{}),
  id:+r.id,
  seq:n(r.seq),
  type:r.entry_type,
  ...(r.flow_type?{flowType:r.flow_type}:{}),
  ...(r.entry_date?{date:r.entry_date}:{})
});

export async function loadRemoteCollections(){
  const [transactions,strategySettlements,ledgerEntries]=await Promise.all([
    get('transactions?select=*&order=seq.asc.nullslast,id.asc'),
    get('strategy_settlements?select=*&order=id.asc'),
    get('ledger_entries?select=*&order=seq.asc.nullslast,id.asc')
  ]);
  return {
    transactions:transactions.map(mapTransaction),
    strategySettlements:strategySettlements.map(mapStrategy),
    ledgerEntries:ledgerEntries.map(mapLedger)
  };
}
