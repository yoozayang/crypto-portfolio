import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createFakeSupabase,productionLikeRows} from './fake-supabase.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
class MemoryStorage{#m=new Map();getItem(k){return this.#m.has(k)?this.#m.get(k):null}setItem(k,v){this.#m.set(k,String(v))}removeItem(k){this.#m.delete(k)}clear(){this.#m.clear()}}
const clone=o=>JSON.parse(JSON.stringify(o));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let db,liveBuild;
const response=(status,text)=>({ok:status>=200&&status<300,status,text:async()=>text,json:async()=>JSON.parse(text)});
globalThis.fetch=async(url,init={})=>{
  url=String(url);
  if(url.startsWith('https://uyxfppzinqnyofuwshye.supabase.co/')){const r=await db.handle({method:init.method||'GET',url,headers:init.headers,body:init.body});return response(r.status,r.body);}
  const file=url.replace(/^\.\//,'').replace(/\?.*$/,'');
  if(file==='version.json')return response(200,JSON.stringify({build:liveBuild}));
  return response(200,readFileSync(root+file,'utf8'));
};
globalThis.localStorage=new MemoryStorage();
globalThis.sessionStorage=new MemoryStorage();
let instance=0;
const freshRecords=()=>import(`../records.js?instance=${++instance}`); // a new module instance = a page reload / another tab
let records;
async function boot(){
  const {data:seed}=await records.loadSeed();
  return records.loadState(seed);
}
beforeEach(async()=>{
  db=createFakeSupabase(productionLikeRows());
  localStorage.clear();sessionStorage.clear();
  sessionStorage.setItem('cryptoPortfolioEditUnlocked','1');
  records=await freshRecords();
  liveBuild=records.BUILD;
});
const newDeposit=(state,extra={})=>{const s=clone(state);s.ledgerEntries.push({id:Math.max(...s.ledgerEntries.map(x=>x.id))+1,seq:records.nextEventSeq(s),type:'deposit',date:'2026-10-31',warehouse:'第二倉',exchange:'MAX',asset:'STABLE',qty:100,amountU:100,note:'',...extra});return s;};
const writes=()=>db.log.filter(r=>r.method!=='GET');
const cachedLedger=()=>JSON.parse(localStorage.getItem(records.STORAGE_KEY)).ledgerEntries;

test('initial load restores remote state and discards unsaved local records',async()=>{
  localStorage.setItem(records.STORAGE_KEY,JSON.stringify({ledgerEntries:[{id:99,seq:99,type:'deposit',amountU:1}],transactions:[],strategySettlements:[],plans:{},nextEventSeq:100}));
  const state=await boot();
  assert.deepEqual(state.ledgerEntries.map(x=>x.id),[2,3]);
  assert.deepEqual(state.transactions.map(x=>x.id),[27,28]);
  assert.equal(state.strategySettlements.length,1);
  assert.equal(writes().length,0,'loading must never write to Supabase');
});

test('normal submission is persisted, verified and only then cached',async()=>{
  const state=await boot(),next=newDeposit(state);
  const res=await records.commitChange(state,next,{label:'入金'});
  assert.deepEqual(res.applied,['ledger:4']);
  assert.equal(db.payload('ledger:4').amountU,100);
  assert.ok(cachedLedger().some(x=>x.id===4));
  assert.deepEqual(records.pendingWrites(),[]);
  const post=writes()[0];
  assert.equal(post.method,'POST');assert.ok(!post.url.includes('on_conflict'),'new rows must be inserted, never upserted');
});

test('slow Supabase response: submission stays pending until confirmed',async()=>{
  const state=await boot(),next=newDeposit(state);
  db.hooks.before=async req=>{if(req.method==='POST')await sleep(150);};
  let settled=false;
  const p=records.commitChange(state,next,{label:'入金'}).then(()=>settled=true);
  await sleep(60);
  assert.equal(settled,false);assert.equal(records.isCommitPending(),true);
  assert.ok(!cachedLedger().some(x=>x.id===4),'cache must not show the record before cloud confirmation');
  await p;
  assert.equal(settled,true);assert.equal(records.isCommitPending(),false);
  assert.ok(db.payload('ledger:4'));
});

test('Supabase HTTP error reports failure, keeps cache untouched and journals the change',async()=>{
  const state=await boot(),next=newDeposit(state);
  db.hooks.before=req=>req.method==='POST'?{status:500,body:'{"message":"boom"}'}:null;
  await assert.rejects(records.commitChange(state,next,{label:'入金'}),/Supabase 500/);
  assert.equal(db.payload('ledger:4'),undefined);
  assert.ok(!cachedLedger().some(x=>x.id===4));
  const [job]=records.pendingWrites();
  assert.equal(job.status,'failed');assert.equal(job.changes[0].key,'ledger:4');
  db.hooks.before=null;
  await records.retryPendingWrite(job.id);
  assert.ok(db.payload('ledger:4'));assert.deepEqual(records.pendingWrites(),[]);
});

test('network interruption: no false success; a write that landed before the drop is not duplicated on retry',async()=>{
  const state=await boot(),next=newDeposit(state);
  db.hooks.before=req=>{if(req.method==='POST')throw new TypeError('Failed to fetch');};
  await assert.rejects(records.commitChange(state,next,{label:'入金'}),/無法連線 Supabase/);
  assert.equal(db.payload('ledger:4'),undefined);
  // Server commits, then the response is lost.
  db.hooks.before=null;db.hooks.after=req=>{if(req.method==='POST')throw new TypeError('network changed');};
  await assert.rejects(records.retryPendingWrite(records.pendingWrites()[0].id),/無法連線/);
  assert.ok(db.payload('ledger:4'),'row landed server-side');
  db.hooks.after=null;
  const res=await records.retryPendingWrite(records.pendingWrites()[0].id);
  assert.deepEqual(res.skipped,['ledger:4']);assert.deepEqual(res.applied,[]);
  assert.equal([...db.rows.keys()].filter(k=>k==='ledger:4').length,1);
});

test('double-click / concurrent submit is rejected while a save is in flight',async()=>{
  const state=await boot(),next=newDeposit(state);
  db.hooks.before=async req=>{if(req.method==='POST')await sleep(50);};
  const first=records.commitChange(state,next,{label:'入金'});
  await assert.rejects(records.commitChange(state,clone(next),{label:'入金'}),/仍在儲存中/);
  await first;
  assert.equal(db.log.filter(r=>r.method==='POST').length,1);
  // Re-sending the identical change (e.g. a second click after success) is idempotent, not a duplicate.
  const again=await records.commitChange(state,clone(next),{label:'入金'});
  assert.deepEqual(again.skipped,['ledger:4']);assert.equal(db.log.filter(r=>r.method==='POST').length,1);
});

test('rapid consecutive submissions are all persisted',async()=>{
  let state=await boot();
  for(let i=0;i<5;i++){const next=newDeposit(state,{amountU:i+1,qty:i+1});await records.commitChange(state,next,{label:`入金${i}`});state=next;}
  assert.deepEqual([4,5,6,7,8].map(id=>db.payload(`ledger:${id}`)?.amountU),[1,2,3,4,5]);
});

test('reload while a save is pending: the change is journaled and recoverable after reload',async()=>{
  const state=await boot(),next=newDeposit(state);
  db.hooks.before=req=>req.method==='POST'?new Promise(()=>{}):null; // request never completes (page torn down)
  records.commitChange(state,next,{label:'入金'}).catch(()=>{});
  await sleep(20);
  assert.equal(records.pendingWrites()[0].status,'pending');
  db.hooks.before=null;
  records=await freshRecords(); // page reload
  await boot();
  await records.reconcilePendingWrites();
  const [job]=records.pendingWrites();
  assert.equal(job.status,'interrupted');
  await records.retryPendingWrite(job.id);
  assert.ok(db.payload('ledger:4'));assert.deepEqual(records.pendingWrites(),[]);
});

test('reload after the write already landed: journal entry is confirmed and cleared automatically',async()=>{
  const state=await boot(),next=newDeposit(state);
  db.hooks.after=req=>req.method==='POST'?new Promise(()=>{}):null; // committed, response never arrives
  records.commitChange(state,next,{label:'入金'}).catch(()=>{});
  await sleep(20);
  db.hooks.after=null;
  records=await freshRecords();
  await boot();
  await records.reconcilePendingWrites();
  assert.deepEqual(records.pendingWrites(),[]);
  assert.ok(db.payload('ledger:4'));
});

test('two tabs editing different records: both changes are preserved',async()=>{
  const loaded=await boot(),tabA=clone(loaded),tabB=clone(loaded);
  const a=clone(tabA);a.transactions.find(t=>t.id===27).note='edited by A';
  const b=clone(tabB);b.ledgerEntries.find(e=>e.id===3).note='edited by B';
  await records.commitChange(tabA,a,{label:'A'});
  await records.commitChange(tabB,b,{label:'B'});
  assert.equal(db.payload('transaction:27').note,'edited by A');
  assert.equal(db.payload('ledger:3').note,'edited by B');
});

test('two tabs editing the same record: the second save is rejected as a conflict',async()=>{
  const loaded=await boot();
  const a=clone(loaded);a.transactions.find(t=>t.id===28).note='A';
  const b=clone(loaded);b.transactions.find(t=>t.id===28).note='B';
  await records.commitChange(loaded,a,{label:'A'});
  await assert.rejects(records.commitChange(loaded,b,{label:'B'}),/已被其他分頁或裝置更新/);
  assert.equal(db.payload('transaction:28').note,'A');
});

test('stale tab deleting a record cannot remove a newer remote version',async()=>{
  const loaded=await boot();
  const a=clone(loaded);a.ledgerEntries.find(e=>e.id===2).note='newer';
  await records.commitChange(loaded,a,{label:'A'});
  const stale=clone(loaded);stale.ledgerEntries=stale.ledgerEntries.filter(e=>e.id!==2);
  await assert.rejects(records.commitChange(loaded,stale,{label:'stale delete'}),/已被其他分頁或裝置更新/);
  assert.equal(db.payload('ledger:2').note,'newer');
});

test('stale tab adding a record with an id another tab already used does not overwrite it',async()=>{
  const loaded=await boot();
  await records.commitChange(loaded,newDeposit(loaded,{amountU:111}),{label:'A'});
  await assert.rejects(records.commitChange(loaded,newDeposit(loaded,{amountU:222}),{label:'B'}),/已被其他分頁或裝置更新/);
  assert.equal(db.payload('ledger:4').amountU,111);
});

test('a concurrent write between the check and the write is caught by the conditional update',async()=>{
  const loaded=await boot(),next=clone(loaded);next.transactions.find(t=>t.id===27).note='mine';
  db.hooks.before=req=>{if(req.method==='PATCH'){const r=db.rows.get('transaction:27');r.payload={...r.payload,note:'other device'};r.updated_at='2026-10-30T11:00:00.000Z';}};
  await assert.rejects(records.commitChange(loaded,next,{label:'edit'}),/已被其他分頁或裝置更新/);
  assert.equal(db.payload('transaction:27').note,'other device');
});

test('editing an existing transaction updates only that row, conditionally on its version',async()=>{
  const loaded=await boot(),next=clone(loaded);next.transactions.find(t=>t.id===28).price=78000;
  const before=new Map([...db.rows].map(([k,r])=>[k,r.updated_at]));
  await records.commitChange(loaded,next,{label:'edit'});
  assert.equal(db.payload('transaction:28').price,78000);
  const patch=writes()[0];
  assert.equal(patch.method,'PATCH');assert.match(patch.url,/event_key=eq\.transaction%3A28&updated_at=eq\./);
  for(const [k,v] of before)if(k!=='transaction:28')assert.equal(db.rows.get(k).updated_at,v,`${k} must not be rewritten`);
});

test('deleting an existing transaction removes only that row',async()=>{
  const loaded=await boot(),next=clone(loaded);next.transactions=next.transactions.filter(t=>t.id!==27);
  await records.commitChange(loaded,next,{label:'delete'});
  assert.equal(db.rows.has('transaction:27'),false);
  for(const k of ['transaction:28','ledger:2','ledger:3','strategy:6'])assert.ok(db.rows.has(k));
});

test('a write silently ignored by the database (e.g. RLS) is reported, not treated as success',async()=>{
  const loaded=await boot(),next=clone(loaded);next.transactions.find(t=>t.id===27).note='x';
  db.hooks.before=req=>req.method==='PATCH'?{status:200,body:'[]'}:null;
  await assert.rejects(records.commitChange(loaded,next,{label:'edit'}),/未套用寫入/);
});

test('HTTP 2xx with a different stored payload fails read-after-write verification',async()=>{
  const loaded=await boot(),next=newDeposit(loaded);
  db.hooks.after=(req,res)=>{if(req.method==='POST'){const out=JSON.parse(res.body);out[0].payload.amountU=0;res.body=JSON.stringify(out);}};
  await assert.rejects(records.commitChange(loaded,next,{label:'入金'}),/回傳內容與送出資料不一致/);
});

test('partial failure is reported with what was written, and a retry completes the rest',async()=>{
  const loaded=await boot(),next=newDeposit(loaded);next.transactions.find(t=>t.id===27).note='linked edit';
  db.hooks.before=req=>req.method==='PATCH'?{status:503,body:'unavailable'}:null;
  await assert.rejects(records.commitChange(loaded,next,{label:'multi'}),/已寫入 ledger:4/);
  db.hooks.before=null;
  await records.retryPendingWrite(records.pendingWrites()[0].id);
  assert.ok(db.payload('ledger:4'));assert.equal(db.payload('transaction:27').note,'linked edit');
});

test('outdated page code (build mismatch) cannot write',async()=>{
  const loaded=await boot();
  liveBuild='29991231-000000';
  await assert.rejects(records.commitChange(loaded,newDeposit(loaded),{label:'入金'}),/重新整理頁面/);
  assert.equal(writes().length,0);
});

test('locked editor cannot write',async()=>{
  const loaded=await boot();sessionStorage.removeItem('cryptoPortfolioEditUnlocked');
  await assert.rejects(records.commitChange(loaded,newDeposit(loaded),{label:'入金'}),/解鎖/);
  assert.equal(writes().length,0);
});

test('saveState never persists financial records (local cache only)',async()=>{
  const loaded=await boot(),next=newDeposit(loaded);next.prices={BTC:1};
  records.saveState(next);
  const cached=JSON.parse(localStorage.getItem(records.STORAGE_KEY));
  assert.ok(!cached.ledgerEntries.some(x=>x.id===4));
  assert.equal(cached.prices.BTC,1);
  assert.equal(writes().length,0);
});

test('duplicate ids inside one state are refused instead of collapsing records',async()=>{
  const loaded=await boot(),next=clone(loaded);next.ledgerEntries.push({...next.ledgerEntries[0]});
  await assert.rejects(records.commitChange(loaded,next,{label:'dup'}),/紀錄編號重複/);
  assert.equal(writes().length,0);
});

test('form option lists: enabled settings in sort order, current value kept, preferred default',async()=>{
  const state={assetSettings:[{code:'ETH',enabled:true,sortOrder:20},{code:'BTC',enabled:true,sortOrder:10},{code:'ONDO',enabled:false,sortOrder:5}],
    locationSettings:[{label:'MAX',type:'exchange',enabled:true,sortOrder:30},{label:'幣安',type:'exchange',enabled:true,sortOrder:20},{label:'Ledger',type:'wallet',enabled:true,sortOrder:1},{label:'其他',type:'other',enabled:true,sortOrder:90},{label:'Kraken',type:'exchange',enabled:false,sortOrder:1}]};
  assert.deepEqual(records.enabledAssets(state),['BTC','ETH']);
  assert.deepEqual(records.enabledLocations(state),['幣安','MAX']);
  assert.deepEqual(records.enabledLocations(state,['exchange','other']),['幣安','MAX','其他']);
  assert.deepEqual(records.withCurrent(['幣安','MAX'],'Kraken'),['Kraken','幣安','MAX']);
  assert.deepEqual(records.withCurrent(['幣安','MAX'],''),['幣安','MAX']);
  assert.equal(records.preferred(['幣安','MAX'],'OKX','MAX'),'MAX');
  assert.equal(records.preferred(['幣安','MAX'],'OKX'),'幣安');
  assert.equal(records.preferred([],'OKX'),'');
});
