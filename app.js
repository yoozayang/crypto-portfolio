import {loadSeed,loadState,saveState} from './records.js?v=20260907-1545';
import {mountApp} from './display.js?v=20260907-1525';

(async()=>{
  const {data:seed,labels}=await loadSeed();
  let state=loadState(seed);
  saveState(state);
  mountApp({state,seed,labels,setState(next){state=next;}});
})().catch(err=>{
  console.error(err);
  document.querySelector('#dashboard').innerHTML=`<div class="notice bad">載入失敗：${String(err.message||err)}</div>`;
});
