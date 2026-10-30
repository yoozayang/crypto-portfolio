const SUPABASE_URL='https://uyxfppzinqnyofuwshye.supabase.co';
const SUPABASE_KEY='sb_publishable_bx9oTbaaOgMrpRfqQ4fYKQ_3EU7JqKG';
const headers={apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`};
export class SupabaseError extends Error{constructor(message,{status=0,code='',body=''}={}){super(message);this.name='SupabaseError';this.status=status;this.code=code;this.body=body;}}
// Every response is validated: a fetch rejection or non-2xx status is always an error, never a silent success.
async function request(path,init={}){
  let r;
  try{r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{...init,headers:{...headers,'Content-Type':'application/json',Prefer:'return=minimal',...(init.headers||{})},cache:'no-store'});}
  catch(err){throw new SupabaseError(`無法連線 Supabase（網路中斷或逾時）：${err.message||err}`,{code:'network'});}
  const text=await r.text().catch(()=>'');
  if(!r.ok)throw new SupabaseError(`Supabase ${r.status}: ${text}`,{status:r.status,code:r.status===409?'duplicate':'http',body:text});
  if(!text)return null;
  try{return JSON.parse(text)}catch{throw new SupabaseError(`Supabase 回應格式錯誤：${text.slice(0,200)}`,{status:r.status,code:'parse',body:text})}
}
const get=path=>request(path,{method:'GET'});
export const clean=o=>Object.fromEntries(Object.entries(o).filter(([,v])=>v!==null&&v!==undefined));
function sortObject(v){if(Array.isArray(v))return v.map(sortObject);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,sortObject(v[k])]));return v;}
export const samePayload=(a,b)=>JSON.stringify(sortObject(a??null))===JSON.stringify(sortObject(b??null));
export const eventKey=(kind,item)=>`${kind}:${item.id}`;
const eventRow=(kind,item)=>({event_key:eventKey(kind,item),event_kind:kind,event_date:item.date||null,seq:item.seq??null,payload:clean(item),updated_at:new Date().toISOString()});
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

// ---- Financial event writes ----
// A change is {key,kind,before,after}: before=null is a new record, after=null is a deletion.
// A record is only updated/deleted while the cloud copy still equals `before`, and the write itself is
// conditional on that row's updated_at, so a writer that slips in between the check and the write is detected.
const conflict=(key,detail)=>new SupabaseError(`雲端資料已被其他分頁或裝置更新（${key}${detail?`：${detail}`:''}），本次未覆寫。請重新整理頁面確認最新資料後再操作。`,{code:'conflict'});
const inFilter=keys=>`event_key=in.(${encodeURIComponent(keys.map(k=>`"${k}"`).join(','))})`;
async function fetchEventRows(keys){return keys.length?(await get(`portfolio_events?select=event_key,payload,updated_at&${inFilter(keys)}`))||[]:[]}
// Read-only: classify every change against the current cloud state.
export async function planEventChanges(changes){
  const remote=new Map((await fetchEventRows(changes.map(c=>c.key))).map(r=>[r.event_key,r]));
  const plan={done:[],insert:[],update:[],remove:[],conflicts:[]};
  for(const c of changes){
    const cur=remote.get(c.key),want=c.after?clean(c.after):null,was=c.before?clean(c.before):null;
    if(cur?samePayload(cur.payload,want):!want){plan.done.push(c);continue;}
    if(was?!cur||!samePayload(cur.payload,was):!!cur){plan.conflicts.push({change:c,remote:cur?.payload??null});continue;}
    if(!was)plan.insert.push(c);else if(want)plan.update.push({change:c,version:cur.updated_at});else plan.remove.push({change:c,version:cur.updated_at});
  }
  return plan;
}
const verifyRows=(rows,expected,what)=>{
  const got=new Map((rows||[]).map(r=>[r.event_key,r]));
  for(const row of expected){const r=got.get(row.event_key);if(!r||!samePayload(r.payload,row.payload))throw new SupabaseError(`Supabase ${what}後回傳內容與送出資料不一致（${row.event_key}），請重新整理確認雲端資料。`,{code:'verify'});}
};
// A conditional write that touched 0 rows is re-read to tell "already applied", "concurrent change" and "silently refused" apart.
async function explainNoop(change,usedVersion){
  const [cur]=await fetchEventRows([change.key]);
  if(cur?samePayload(cur.payload,change.after?clean(change.after):null):!change.after)return;
  if(cur&&cur.updated_at===usedVersion)throw new SupabaseError(`Supabase 未套用寫入（${change.key}），可能是權限或 RLS 設定拒絕。`,{code:'refused'});
  throw conflict(change.key);
}
// Resolves to {applied,skipped} only after Supabase confirmed every row. Changes are idempotent:
// a failed or interrupted call can be retried with the same input, and already-applied rows are skipped.
export async function applyEventChanges(changes){
  const plan=await planEventChanges(changes);
  if(plan.conflicts.length)throw conflict(plan.conflicts.map(x=>x.change.key).join(', '));
  const applied=[];
  try{
    if(plan.insert.length){
      // One INSERT statement: all new rows commit together or not at all. Not an upsert, so an existing key is never overwritten.
      const rows=plan.insert.map(c=>eventRow(c.kind,c.after));
      try{
        verifyRows(await request('portfolio_events',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(rows)}),rows,'新增');
      }catch(err){
        if(err.code!=='duplicate')throw err;
        const again=await planEventChanges(plan.insert);
        if(again.done.length!==plan.insert.length)throw conflict(plan.insert.map(c=>c.key).join(', '),'相同編號已存在');
      }
      applied.push(...plan.insert.map(c=>c.key));
    }
    // Additive rows first, removals last: an interruption leaves extra rows to review rather than missing ones.
    for(const {change,version} of plan.update){
      const row=eventRow(change.kind,change.after),{event_key,...body}=row;
      const out=await request(`portfolio_events?event_key=eq.${encodeURIComponent(event_key)}&updated_at=eq.${encodeURIComponent(version)}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(body)});
      if(!out?.length)await explainNoop(change,version);else verifyRows(out,[row],'更新');
      applied.push(change.key);
    }
    for(const {change,version} of plan.remove){
      const out=await request(`portfolio_events?event_key=eq.${encodeURIComponent(change.key)}&updated_at=eq.${encodeURIComponent(version)}`,{method:'DELETE',headers:{Prefer:'return=representation'}});
      if(!out?.length)await explainNoop(change,version);
      applied.push(change.key);
    }
  }catch(err){err.applied=applied;throw err;}
  return {applied,skipped:plan.done.map(c=>c.key)};
}
