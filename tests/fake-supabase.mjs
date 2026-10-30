// In-memory stand-in for the PostgREST endpoints the app uses. Implements the semantics persistence relies on:
// plain INSERT fails with 409 on an existing event_key, PATCH/DELETE apply eq filters and honour return=representation.
export function createFakeSupabase(seedRows=[]){
  const rows=new Map(seedRows.map(r=>[r.event_key,{created_at:'2026-09-11T08:44:42.950994+00:00',...structuredClone(r)}]));
  const db={rows,log:[],hooks:{}};
  const parse=(raw)=>{
    const u=new URL(raw);const table=u.pathname.split('/rest/v1/')[1];const filters=[];
    for(const [k,v] of u.searchParams){
      if(['select','order','on_conflict','limit'].includes(k))continue;
      const [op,...rest]=v.split('.');const val=rest.join('.');
      filters.push({col:k,op,val:op==='in'?val.slice(1,-1).split(',').map(x=>x.replace(/^"|"$/g,'')):val});
    }
    return {table,filters,select:u.searchParams.get('select')};
  };
  const eq=(col,a,b)=>col.endsWith('_at')?Date.parse(a)===Date.parse(b):String(a)===String(b);
  const match=(row,filters)=>filters.every(f=>f.op==='eq'?eq(f.col,row[f.col],f.val):f.op==='in'?f.val.includes(String(row[f.col])):true);
  const pick=(row,select)=>!select||select==='*'?structuredClone(row):Object.fromEntries(select.split(',').map(c=>[c,structuredClone(row[c])]));
  const json=(status,body)=>({status,body:body===undefined?'':JSON.stringify(body)});
  db.handle=async({method,url,headers={},body})=>{
    const req={method,url,headers,body:body?JSON.parse(body):undefined};
    db.log.push(req);
    const hooked=await db.hooks.before?.(req);
    if(hooked)return hooked;
    const res=respond(req);
    await db.hooks.after?.(req,res);
    return res;
  };
  function respond({method,url,headers,body}){
    const {table,filters,select}=parse(url);
    const prefer=String(headers.Prefer||headers.prefer||'');
    const representation=prefer.includes('return=representation');
    if(table!=='portfolio_events'){
      if(method==='GET')return json(200,[]);
      return json(201);
    }
    if(method==='GET'){
      const out=[...rows.values()].filter(r=>match(r,filters)).sort((a,b)=>(a.seq??1e9)-(b.seq??1e9)||a.event_key.localeCompare(b.event_key));
      return json(200,out.map(r=>pick(r,select)));
    }
    if(method==='POST'){
      const list=Array.isArray(body)?body:[body];
      if(!url.includes('on_conflict')&&list.some(r=>rows.has(r.event_key)))return json(409,{code:'23505',message:'duplicate key value violates unique constraint "portfolio_events_pkey"'});
      const now=new Date().toISOString();
      for(const r of list)rows.set(r.event_key,{created_at:now,...structuredClone(r)});
      return representation?json(201,list.map(r=>structuredClone(rows.get(r.event_key)))):json(201);
    }
    if(method==='PATCH'){
      const hit=[...rows.values()].filter(r=>match(r,filters));
      for(const r of hit)Object.assign(r,structuredClone(body));
      return representation?json(200,hit.map(r=>structuredClone(r))):json(204);
    }
    if(method==='DELETE'){
      const hit=[...rows.values()].filter(r=>match(r,filters));
      for(const r of hit)rows.delete(r.event_key);
      return representation?json(200,hit):json(204);
    }
    return json(405,{message:'unsupported'});
  }
  db.payload=key=>rows.get(key)?.payload;
  return db;
}
export const row=(kind,item,updated_at='2026-10-30T10:02:15.878+00:00')=>({event_key:`${kind}:${item.id}`,event_kind:kind,event_date:item.date||null,seq:item.seq??null,payload:item,updated_at});
// Rows shaped like production (a subset), including the three 2026-10-30 records that must stay intact.
export const productionLikeRows=()=>[
  row('transaction',{id:27,seq:27,date:'2026-10-01',side:'買入',asset:'ETH',price:2500,qty:1,amount:2500,exchange:'幣安',warehouse:'第一倉',feeAsset:'',feeQty:0,reset:false,note:''}),
  row('transaction',{id:28,seq:30,date:'2026-10-30',side:'買入',asset:'BTC',price:77757,qty:0.046219,amount:3594,exchange:'MAX',warehouse:'第二倉',feeAsset:'USDT',feeQty:5.76,reset:false,note:''}),
  row('ledger',{id:2,seq:31,date:'2026-10-30',type:'deposit',asset:'STABLE',qty:7188,amountU:7188,exchange:'MAX',warehouse:'第二倉',note:'2026-10-30 入金，第二倉'},'2026-10-30T10:12:05.068865+00:00'),
  row('ledger',{id:3,seq:32,date:'2026-10-30',type:'transfer',asset:'STABLE',qty:3586,amountU:3586,fromExchange:'MAX',toExchange:'OKX',feeAsset:'',feeQty:0,warehouse:'第二倉',note:''},'2026-10-30T10:35:07.151867+00:00'),
  row('strategy',{id:6,type:'策略結束',exchange:'幣安',handling:'併回主資金',invested:8000,realized:150,strategy:'BTC現貨網格',recovered:8150,warehouse:'第一倉'})
];
