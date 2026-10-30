// Browser end-to-end tests: real index.html and forms in Chrome, Supabase replaced by the in-memory fake.
// Requires `npm install` (playwright) and Google Chrome. Run: npm run test:e2e
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {createFakeSupabase,productionLikeRows} from './fake-supabase.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
const types={'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css'};
let server,base,browser;
before(async()=>{
  server=createServer(async(req,res)=>{
    const path=decodeURIComponent(new URL(req.url,'http://x').pathname).replace(/^\/$/,'/index.html');
    try{const body=await readFile(root+path.slice(1));res.writeHead(200,{'Content-Type':types[path.slice(path.lastIndexOf('.'))]||'application/octet-stream','Cache-Control':'max-age=600'});res.end(body);}
    catch{res.writeHead(404);res.end();}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  base=`http://127.0.0.1:${server.address().port}/`;
  browser=await chromium.launch({channel:'chrome',headless:true});
});
after(async()=>{await browser?.close();server?.close();});

async function open({unlocked=true,acceptDialogs=true}={}){
  const db=createFakeSupabase(productionLikeRows());
  const context=await browser.newContext();
  if(unlocked)await context.addInitScript(()=>sessionStorage.setItem('cryptoPortfolioEditUnlocked','1'));
  const binance={quotes:{BTCUSDT:80000,ETHUSDT:2750,DOGEUSDT:0.1234},requested:[]};
  await context.route('https://api.binance.com/**',r=>{
    const u=new URL(r.request().url());
    if(u.pathname.endsWith('/ticker/price'))return r.fulfill({contentType:'application/json',body:JSON.stringify(['BTCUSDT','ETHUSDT','DOGEUSDT','BABYDOGEUSDT','DOGSUSDT'].map(symbol=>({symbol,price:'1'})))});
    const symbol=u.searchParams.get('symbol');binance.requested.push(symbol);
    if(!binance.quotes[symbol])return r.fulfill({status:400,body:'{}'});
    r.fulfill({contentType:'application/json',body:JSON.stringify({lastPrice:String(binance.quotes[symbol]),priceChangePercent:'2.5'})});
  });
  await context.route('https://uyxfppzinqnyofuwshye.supabase.co/**',async route=>{
    const req=route.request();
    let out;
    try{out=await db.handle({method:req.method(),url:req.url(),headers:req.headers(),body:req.postData()});}
    catch{return route.abort('failed').catch(()=>{});}
    await route.fulfill({status:out.status,contentType:'application/json',body:out.body}).catch(()=>{});
  });
  const page=await context.newPage();
  const dialogs=[];
  if(acceptDialogs)page.on('dialog',d=>{dialogs.push(d.message());d.accept().catch(()=>{});});
  const errors=[];page.on('pageerror',e=>errors.push(e));
  await page.goto(base);
  await page.waitForSelector('#dashboard .card');
  return {db,page,context,dialogs,errors,binance};
}
const markPage=page=>page.evaluate(()=>{window.__notReloaded=true;});
const reloaded=page=>page.waitForFunction(()=>!window.__notReloaded&&document.querySelector('#dashboard .card'));
async function openLedgerTab(page){await page.click('[data-tab="ledger"]');await page.waitForSelector('#ledgerForm');await page.waitForSelector('#assetFlowForm');}
const maxLedgerId=db=>Math.max(...[...db.rows.keys()].filter(k=>k.startsWith('ledger:')).map(k=>+k.split(':')[1]));

test('one shared instance of each persistence module is loaded',async()=>{
  const {page,context,errors}=await open();
  const urls=await page.evaluate(()=>performance.getEntriesByType('resource').map(e=>e.name).filter(n=>/\/(records|supabase-data)\.js/.test(n)));
  assert.equal(urls.filter(u=>u.includes('/records.js')).length,1,urls.join('\n'));
  assert.equal(urls.filter(u=>u.includes('/supabase-data.js')).length,1,urls.join('\n'));
  assert.deepEqual(errors,[]);
  await context.close();
});

test('legacy ledger deposit form (incident A path) is persisted before the page reloads',async()=>{
  const {db,page,context}=await open();
  await openLedgerTab(page);
  await page.selectOption('#ledgerForm [name="warehouse"]','第二倉');
  await page.selectOption('#ledgerForm [name="exchange"]','MAX');
  await page.fill('#ledgerForm [name="amountU"]','7188');
  await markPage(page);
  await page.click('#ledgerForm button[type="submit"]');
  await reloaded(page);
  const key=`ledger:${maxLedgerId(db)}`;
  assert.equal(key,'ledger:4');
  assert.equal(db.payload(key).amountU,7188);assert.equal(db.payload(key).exchange,'MAX');
  await page.waitForSelector('#persistStatus[data-state="saved"]');
  await context.close();
});

test('legacy transfer form (incident B path) with a slow Supabase response waits for confirmation',async()=>{
  const {db,page,context}=await open();
  await openLedgerTab(page);
  await page.selectOption('#ledgerForm [name="type"]','transfer');
  await page.selectOption('#ledgerForm [name="fromExchange"]','MAX');
  await page.selectOption('#ledgerForm [name="toExchange"]','OKX');
  await page.fill('#ledgerForm [name="qty"]','3586');
  let release;db.hooks.before=req=>req.method==='POST'?new Promise(r=>release=r):null;
  await markPage(page);
  await page.click('#ledgerForm button[type="submit"]');
  await page.waitForSelector('#persistStatus[data-state="pending"]');
  while(!release)await new Promise(r=>setTimeout(r,20)); // the INSERT is now held at the "server"
  assert.equal(await page.evaluate(()=>window.__notReloaded),true,'must not reload before Supabase answers');
  assert.equal(await page.isDisabled('#ledgerForm button[type="submit"]'),true);
  release();db.hooks.before=null;
  await reloaded(page);
  assert.equal(db.payload('ledger:4').type,'transfer');assert.equal(db.payload('ledger:4').qty,3586);
  await context.close();
});

test('double-click on submit creates exactly one record',async()=>{
  const {db,page,context}=await open();
  await openLedgerTab(page);
  await page.fill('#ledgerForm [name="amountU"]','10');
  db.hooks.before=async req=>{if(req.method==='POST')await new Promise(r=>setTimeout(r,300));};
  await markPage(page);
  await page.dblclick('#ledgerForm button[type="submit"]');
  await reloaded(page);
  assert.equal(db.log.filter(r=>r.method==='POST').length,1);
  assert.equal(maxLedgerId(db),4);
  await context.close();
});

test('asset-flow HTTP error: failure is shown, nothing is cached, and the change can be retried',async()=>{
  const {db,page,context,dialogs}=await open();
  await openLedgerTab(page);
  await page.fill('#assetFlowForm [name="sourceQty"]','50');
  db.hooks.before=req=>req.method==='POST'?{status:500,body:'{"message":"boom"}'}:null;
  await markPage(page);
  await page.click('#assetFlowForm button[type="submit"]');
  await page.waitForSelector('#persistStatus[data-state="failed"]');
  await page.waitForFunction(()=>document.querySelector('#pendingWrites'));
  assert.match(dialogs.join('\n'),/儲存失敗.*Supabase 500/);
  assert.equal(await page.evaluate(()=>window.__notReloaded),true);
  assert.equal(maxLedgerId(db),3);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.cryptoPortfolioV1).ledgerEntries.length),2,'cache must not contain the failed record');
  assert.equal(await page.isDisabled('#assetFlowForm button[type="submit"]'),false,'form stays usable after failure');
  db.hooks.before=null;
  await page.click('[data-pending-retry]');
  await reloaded(page);
  assert.equal(db.payload('ledger:4').flowType,'入金');
  assert.equal(await page.$('#pendingWrites'),null);
  await context.close();
});

test('network interruption on submit never reports success',async()=>{
  const {db,page,context,dialogs}=await open();
  await openLedgerTab(page);
  await page.fill('#ledgerForm [name="amountU"]','20');
  db.hooks.before=req=>{if(req.method==='POST')throw new Error('offline');};
  await markPage(page);
  await page.click('#ledgerForm button[type="submit"]');
  await page.waitForSelector('#persistStatus[data-state="failed"]');
  assert.match(dialogs.join('\n'),/無法連線 Supabase/);
  assert.equal(maxLedgerId(db),3);
  await context.close();
});

test('reload/close during a pending save: guarded, then recoverable after the tab is forced closed',async()=>{
  const {db,page,context}=await open({acceptDialogs:false});
  await openLedgerTab(page);
  await page.fill('#ledgerForm [name="amountU"]','30');
  let held=false;db.hooks.before=req=>req.method==='POST'?(held=true,new Promise(()=>{})):null;
  await page.click('#ledgerForm button[type="submit"]');
  await page.waitForSelector('#persistStatus[data-state="pending"]');
  while(!held)await new Promise(r=>setTimeout(r,20));
  // 1) A reload while the INSERT is unanswered is intercepted by the beforeunload guard.
  const dialog=page.waitForEvent('dialog');
  page.reload().catch(()=>{});
  const d=await dialog;
  assert.equal(d.type(),'beforeunload');
  await d.dismiss();
  assert.equal(await page.getAttribute('#persistStatus','data-state'),'pending');
  // 2) The user closes the tab anyway: the change is still in the journal and shown on the next visit.
  db.hooks.before=null;
  await page.close({runBeforeUnload:false});
  const next=await context.newPage();
  await next.goto(base);
  await next.waitForSelector('#pendingWrites');
  assert.match(await next.textContent('#pendingWrites'),/中斷，未確認寫入|儲存失敗/);
  assert.equal(maxLedgerId(db),3);
  await markPage(next);
  await next.click('[data-pending-retry]');
  await reloaded(next);
  assert.equal(db.payload('ledger:4').amountU,30);
  assert.equal(await next.$('#pendingWrites'),null);
  await context.close();
});

test('transactions tab: add, edit and delete a trade are confirmed by Supabase',async()=>{
  const {db,page,context}=await open();
  await page.click('[data-tab="transactions"]');
  await page.waitForSelector('#txForm');
  await page.fill('#txForm [name="price"]','80000');
  await page.fill('#txForm [name="qty"]','0.01');
  await page.fill('#txForm [name="amount"]','800');
  await page.click('#txForm button[type="submit"]');
  await page.waitForSelector('#persistStatus[data-state="saved"]');
  assert.equal(db.payload('transaction:29').amount,800);
  await page.click('[data-edit="29"]');
  await page.fill('#txForm [name="amount"]','801');
  await page.click('#txForm button[type="submit"]');
  await page.waitForFunction(()=>{const s=document.querySelector('#persistStatus');return s?.dataset.state==='saved'&&s.textContent.includes('修改交易 #29');});
  assert.equal(db.payload('transaction:29').amount,801);
  await page.click('[data-del="29"]');
  await page.waitForFunction(()=>{const s=document.querySelector('#persistStatus');return s?.dataset.state==='saved'&&s.textContent.includes('刪除交易 #29');});
  assert.equal(db.rows.has('transaction:29'),false);
  for(const k of ['transaction:28','ledger:2','ledger:3'])assert.ok(db.rows.has(k),`${k} must stay intact`);
  await context.close();
});

test('stale tab cannot overwrite a record changed in another tab',async()=>{
  const {db,page,context,dialogs}=await open();
  await page.click('[data-tab="transactions"]');
  await page.waitForSelector('#txForm');
  const r=db.rows.get('transaction:28');r.payload={...r.payload,note:'changed elsewhere'};r.updated_at='2026-10-30T12:00:00.000Z';
  await page.click('[data-edit="28"]');
  await page.fill('#txForm [name="note"]','stale edit');
  await page.click('#txForm button[type="submit"]');
  await page.waitForSelector('#persistStatus[data-state="failed"]');
  assert.match(dialogs.join('\n'),/已被其他分頁或裝置更新/);
  assert.equal(db.payload('transaction:28').note,'changed elsewhere');
  await context.close();
});

test('strategy settlement form is confirmed by Supabase before reload',async()=>{
  const {db,page,context}=await open();
  await page.click('[data-tab="transactions"]');
  await page.waitForSelector('#strategySettlementForm');
  await page.fill('#strategySettlementForm [name="invested"]','1000');
  await page.fill('#strategySettlementForm [name="recovered"]','1100');
  await markPage(page);
  await page.click('#strategySettlementForm button[type="submit"]');
  await reloaded(page);
  assert.equal(db.payload('strategy:7').realized,100);
  assert.deepEqual(db.payload('strategy:6').invested,8000,'existing settlement untouched');
  await context.close();
});

test('目前幣價 tab: second tab, average buy price, add by search, remove mode cancelled by clicking elsewhere',async()=>{
  const {page,context,binance,errors}=await open({unlocked:false});
  await page.emulateMedia({reducedMotion:'reduce'}); // the remove-mode wiggle is disabled under reduced motion
  assert.deepEqual(await page.$$eval('#tabs button',bs=>bs.slice(0,2).map(b=>b.textContent)),['Dashboard','目前幣價']);
  await page.click('[data-tab="prices"]');
  await page.waitForSelector('#prices .price-board');
  // ETH: 第一倉 bought 1 @ 2500, now 2750 → +10.00%
  const ethCard=page.locator('.price-box',{has:page.locator('strong',{hasText:/^ETH$/})});
  assert.match(await ethCard.locator('.price-avg').textContent(),/第一倉均價 2,500\.00 \+10\.00%/);
  // add DOGE by searching its code
  await page.click('#priceAddToggle');
  await page.fill('#priceSearchInput','dog');
  await page.waitForSelector('[data-price-add="DOGE"]');
  await page.click('[data-price-add="DOGE"]');
  const doge=page.locator('.price-box',{has:page.locator('strong',{hasText:/^DOGE$/})});
  await doge.locator('.price-value',{hasText:'0.123400'}).waitFor();
  assert.match(await doge.textContent(),/僅顯示，不納入計算/);
  // remove mode: badges appear, clicking elsewhere cancels without removing
  await page.click('#priceRemoveToggle');
  assert.equal(await page.isVisible('[data-price-remove="BTC"]'),true);
  await page.click('h2:has-text("目前幣價")');
  assert.equal(await page.isVisible('[data-price-remove="BTC"]'),false);
  assert.equal(await page.locator('.price-box strong',{hasText:/^BTC$/}).count(),1);
  // remove BTC from the view: display only, BTC price is still refreshed for calculations
  await page.click('#priceRemoveToggle');
  await page.click('[data-price-remove="BTC"]');
  assert.equal(await page.locator('.price-box strong',{hasText:/^BTC$/}).count(),0);
  await page.keyboard.press('Escape');
  binance.requested.length=0;binance.quotes.BTCUSDT=81000;
  await page.click('#refreshPrices');
  await page.waitForFunction(()=>JSON.parse(localStorage.cryptoPortfolioV1).prices.BTC===81000);
  assert.ok(binance.requested.includes('BTCUSDT'));
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.cryptoPortfolioV1).prices.DOGE),undefined,'view-only quotes never enter calculation prices');
  // the list survives a reload
  await page.reload();await page.click('[data-tab="prices"]');await page.waitForSelector('#prices .price-board');
  assert.deepEqual(await page.$$eval('#prices .price-box strong',e=>e.map(x=>x.textContent)).then(c=>[c.includes('BTC'),c.includes('DOGE')]),[false,true]);
  assert.deepEqual(errors,[]);
  await context.close();
});
