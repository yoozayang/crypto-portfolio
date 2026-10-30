import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';

class MemoryStorage{#m=new Map();getItem(k){return this.#m.has(k)?this.#m.get(k):null}setItem(k,v){this.#m.set(k,String(v))}removeItem(k){this.#m.delete(k)}clear(){this.#m.clear()}}
globalThis.localStorage=new MemoryStorage();
const symbols=['BTCUSDT','ETHUSDT','DOGEUSDT','DOGSUSDT','BABYDOGEUSDT','ETHBTC','USDCUSDT'];
let fetched=0;
globalThis.fetch=async url=>{fetched++;const u=String(url);
  if(u.endsWith('/ticker/price'))return {ok:true,json:async()=>symbols.map(symbol=>({symbol,price:'1'}))};
  if(u.includes('symbol=NOPEUSDT'))return {ok:false,status:400,json:async()=>({})};
  return {ok:true,json:async()=>({lastPrice:'0.123',priceChangePercent:'-1.5'})};};
const pb=await import('../price-board.js');
const defaults=[{code:'BTC',symbol:'BTCUSDT'},{code:'ETH',symbol:'ETHUSDT'}];
beforeEach(()=>localStorage.clear());

test('defaults are shown until the user changes the list',()=>{
  assert.deepEqual(pb.watchlist(defaults).map(x=>x.code),['BTC','ETH']);
});
test('removing hides a default; adding appends a view-only coin; re-adding restores a default',()=>{
  pb.removeFromWatchlist('BTC');
  pb.addToWatchlist({code:'DOGE',symbol:'DOGEUSDT'});
  assert.deepEqual(pb.watchlist(defaults).map(x=>[x.code,!!x.watchOnly]),[['ETH',false],['DOGE',true]]);
  pb.addToWatchlist({code:'BTC',symbol:'BTCUSDT'});
  assert.deepEqual(pb.watchlist(defaults).map(x=>x.code),['BTC','ETH','DOGE']);
  pb.removeFromWatchlist('DOGE');
  assert.deepEqual(pb.watchlist(defaults).map(x=>x.code),['BTC','ETH']);
});
test('a default that appears later in asset settings is shown automatically',()=>{
  pb.addToWatchlist({code:'DOGE',symbol:'DOGEUSDT'});
  assert.deepEqual(pb.watchlist([...defaults,{code:'SOL',symbol:'SOLUSDT'}]).map(x=>x.code),['BTC','ETH','SOL','DOGE']);
});
test('search matches USDT pairs by code: exact, then prefix, then substring',async()=>{
  assert.deepEqual((await pb.searchSymbols('doge')).map(x=>x.code),['DOGE','BABYDOGE']);
  assert.deepEqual((await pb.searchSymbols('DOGEUSDT')).map(x=>x.code),['DOGE','BABYDOGE']);
  assert.deepEqual((await pb.searchSymbols('dog')).map(x=>x.code),['DOGE','DOGS','BABYDOGE']);
  assert.ok(!(await pb.searchSymbols('ETH')).some(x=>x.symbol==='ETHBTC'),'only USDT pairs');
  assert.deepEqual(await pb.searchSymbols('  '),[]);
});
test('symbol list is fetched once and reused',async()=>{
  const before=fetched;await pb.searchSymbols('BTC');await pb.searchSymbols('ETH');
  assert.equal(fetched,before);
});
test('quotes parse price and 24h change; an invalid pair throws',async()=>{
  assert.deepEqual(await pb.fetchQuote('DOGEUSDT'),{price:0.123,change:-1.5});
  await assert.rejects(pb.fetchQuote('NOPEUSDT'),/Binance 400/);
});
test('a corrupt stored list falls back to defaults',()=>{
  localStorage.setItem('cryptoPortfolioPriceWatchlist','{oops');
  assert.deepEqual(pb.watchlist(defaults).map(x=>x.code),['BTC','ETH']);
});
