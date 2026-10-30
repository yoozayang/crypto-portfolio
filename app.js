import {loadSeed,loadState,showFlash,reconcilePendingWrites} from './records.js';
import {mountApp} from './display.js';

(async()=>{
  const {data:seed,labels}=await loadSeed();
  let state=loadState(seed);
  mountApp({state,seed,labels,setState(next){state=next;}});
  showFlash();
  await reconcilePendingWrites();
})().catch(err=>{
  console.error(err);
  document.querySelector('#dashboard').innerHTML=`<div class="notice bad">載入失敗：${String(err.message||err)}</div>`;
});
