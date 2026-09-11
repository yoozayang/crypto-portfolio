import {STORAGE_KEY,nextEventSeq,saveState} from './records.js?v=20260911-1718';
import {replayTransactions} from './calculations.js?v=20260907-1525';
const load=()=>JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');
const unlocked=()=>window.cryptoPortfolioEditLock?.isUnlocked?.()??true;
const ask=()=>window.cryptoPortfolioEditLock?.open?.();
const today=()=>new Date().toISOString().slice(0,10);
const nextId=a=>Math.max(0,...(a||[]).map(x=>+x.id||0))+1;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const isStable=a=>['STABLE','USDT','USDC','CASH'].includes(a);
const option=(v,l=v)=>`<option value="${esc(v)}">${esc(l)}</option>`;
let config;
let mounting=false;
const byId=(list,id)=>list.find(x=>x.id===id);
const warehouseKey=id=>byId(config.warehouses,id)?.accountingKey||'';
const managed=id=>!!byId(config.warehouses,id)?.managed;
const locationLabel=id=>byId(config.locations,id)?.label||id;
const locationType=id=>byId(config.locations,id)?.type||'';
function mode(d){const sm=managed(d.sourceWarehouse),dm=managed(d.destinationWarehouse);if(!sm&&dm)return '入金';if(sm&&!dm)return '出金';if(!sm&&!dm)return '外部轉移';if(d.sourceAsset===d.destinationAsset){if(d.sourceWarehouse!==d.destinationWarehouse)return '跨倉轉移';if(d.sourceLocation!==d.destinationLocation)return '位置轉移';return '同位置調整';}return d.sourceWarehouse!==d.destinationWarehouse?'跨倉換幣':'資產換幣';}
function currentCostBasis(state,w,a,q){if(isStable(a))return +q||0;const p=replayTransactions(state).positions.find(x=>x.warehouse===w&&x.asset===a);if(!p||!p.qty||p.qty<=0)return null;return Math.min(+q||0,p.qty)*(p.cost/p.qty);}
function addTransferPair(state,d,lid,seq){const sw=warehouseKey(d.sourceWarehouse),dw=warehouseKey(d.destinationWarehouse),qty=+d.sourceQty||0,movedCost=currentCostBasis(state,sw,d.sourceAsset,qty);if(movedCost==null)throw new Error(`找不到 ${sw} ${d.sourceAsset} 的可計算成本，無法自動做跨倉成本轉移。`);const sellId=nextId(state.transactions),buyId=sellId+1,g=`flow-${lid}`;state.transactions.push({id:sellId,seq:seq+.1,warehouse:sw,exchange:locationLabel(d.sourceLocation),date:d.sourceDate,side:'賣出',asset:d.sourceAsset,price:qty?movedCost/qty:0,qty,amount:movedCost,feeAsset:'',feeQty:0,costAdjustment:movedCost,reset:false,note:`跨倉成本轉移 ${g} → ${dw}`,groupId:g,source:'flow-transfer'});state.transactions.push({id:buyId,seq:seq+.2,warehouse:dw,exchange:locationLabel(d.destinationLocation),date:d.destinationDate,side:'買入',asset:d.destinationAsset,price:(+d.destinationQty||qty)?movedCost/(+d.destinationQty||qty):0,qty:+d.destinationQty||qty,amount:movedCost,feeAsset:d.feeAsset,feeQty:+d.feeQty||0,reset:false,note:`跨倉成本轉移 ${g} ← ${sw}`,groupId:g,source:'flow-transfer'});return [sellId,buyId];}
function addSwapPair(state,d,lid,seq){const sw=warehouseKey(d.sourceWarehouse),dw=warehouseKey(d.destinationWarehouse),amount=+d.amountU||0;if(!amount)throw new Error('換幣時需要填「成交 / 折算金額（U）」。');const sellId=nextId(state.transactions),buyId=sellId+1,g=`flow-${lid}`;state.transactions.push({id:sellId,seq:seq+.1,warehouse:sw,exchange:locationLabel(d.sourceLocation),date:d.sourceDate,side:'賣出',asset:d.sourceAsset,price:+d.sourceQty?amount/+d.sourceQty:0,qty:+d.sourceQty||0,amount,feeAsset:d.feeAsset,feeQty:+d.feeQty||0,reset:false,note:`資產流轉 ${g}`,groupId:g,source:'flow'});state.transactions.push({id:buyId,seq:seq+.2,warehouse:dw,exchange:locationLabel(d.destinationLocation),date:d.destinationDate,side:'買入',asset:d.destinationAsset,price:+d.destinationQty?amount/+d.destinationQty:0,qty:+d.destinationQty||0,amount,feeAsset:'',feeQty:0,reset:false,note:`資產流轉 ${g}`,groupId:g,source:'flow'});return [sellId,buyId];}
async function mount(){
  const host=document.querySelector('#ledger');
  if(!host)return;
  const existing=[...host.querySelectorAll('.asset-flow-card')];
  existing.slice(1).forEach(x=>x.remove());
  if(host.querySelector('#assetFlowForm')||mounting)return;
  mounting=true;
  try{
    if(!config)config=await fetch('./flow-config.json?v=20260907-1620',{cache:'no-store'}).then(r=>r.json());
    if(!document.body.contains(host)||host.querySelector('#assetFlowForm'))return;
    const state=load();
    const runtimeLocations=(state.locationSettings||[]).filter(x=>x.enabled||x.id==='external').sort((a,b)=>(+a.sortOrder||100)-(+b.sortOrder||100)).map(x=>({id:x.id,label:x.label,type:x.type}));
    if(runtimeLocations.length)config={...config,locations:runtimeLocations};
    const runtimeAssets=(state.assetSettings||[]).filter(x=>x.enabled).sort((a,b)=>(+a.sortOrder||100)-(+b.sortOrder||100)).map(x=>x.code);
    const assets=[...(runtimeAssets.length?runtimeAssets:(state.assets||[]).filter(a=>!['CASH','OTHER','STABLE'].includes(a))),'STABLE'];
    if(!document.querySelector('#assetFlowStyles')){const s=document.createElement('style');s.id='assetFlowStyles';s.textContent='.flow-block{padding:14px;border:1px solid var(--line);border-radius:12px;background:#0f1830}.flow-block h3{margin:0 0 12px;font-size:15px}.flow-divider{grid-column:1/-1;height:1px;background:var(--line);margin:6px 0}.flow-extra{padding-top:2px}[data-source-warehouse][hidden]{display:none!important}';document.head.appendChild(s);}
    const card=document.createElement('div');card.className='card section asset-flow-card';
    const lo=config.locations.map(x=>option(x.id,x.label)).join(''),ao=assets.map(x=>option(x,x==='STABLE'?'USDT/USDC':x)).join(''),wh=config.warehouses.map(x=>option(x.id,x.label)).join('');
    card.innerHTML=`<div class="ledger-head"><h2>資產流轉</h2><span class="subtle">先選資產所在位置，再決定投資倉位歸屬。</span></div><form id="assetFlowForm" class="form-grid"><div class="full flow-block"><h3>來源</h3><div class="form-grid"><label><span>日期</span><input name="sourceDate" type="date" value="${today()}"></label><label><span>位置</span><select name="sourceLocation">${lo}</select></label><label data-source-warehouse><span>倉位歸屬</span><select name="sourceWarehouse">${wh}</select></label><label><span>資產種類</span><select name="sourceAsset">${ao}</select></label><label><span>數量</span><input name="sourceQty" type="number" step="any"></label></div></div><div class="full flow-divider"></div><div class="full flow-block"><h3>目的</h3><div class="form-grid"><label><span>日期</span><input name="destinationDate" type="date" value="${today()}"></label><label><span>位置</span><select name="destinationLocation">${lo}</select></label><label><span>倉位歸屬</span><select name="destinationWarehouse">${wh}</select></label><label><span>資產種類</span><select name="destinationAsset">${ao}</select></label><label><span>數量</span><input name="destinationQty" type="number" step="any"></label></div></div><div class="full flow-divider"></div><div class="full flow-extra form-grid"><label><span>成交 / 折算金額（U）</span><input name="amountU" type="number" step="any"></label><label><span>手續費幣種</span><select name="feeAsset">${option('','—')}${ao}</select></label><label><span>手續費數量</span><input name="feeQty" type="number" step="any" value="0"></label><label class="full"><span>備註</span><textarea name="note"></textarea></label></div><div class="full notice" id="flowPreview"></div><div class="full toolbar"><button class="btn primary" type="submit">登記流轉</button></div></form>`;
    host.insertBefore(card,host.querySelector('.card.section')||host.firstChild);
    const f=card.querySelector('form'),preview=card.querySelector('#flowPreview'),sourceWarehouseWrap=card.querySelector('[data-source-warehouse]');
    const outsideId=config.warehouses.find(x=>!x.managed)?.id||config.warehouses[0]?.id;
    const firstManagedId=config.warehouses.find(x=>x.managed)?.id||config.warehouses[0]?.id;
    const externalId=config.locations.find(x=>x.type==='external')?.id||config.locations[0]?.id;
    const firstManagedLocation=config.locations.find(x=>x.type!=='external')?.id||config.locations[0]?.id;
    f.sourceWarehouse.value=outsideId;f.destinationWarehouse.value=firstManagedId;f.sourceLocation.value=externalId;f.destinationLocation.value=firstManagedLocation;f.sourceAsset.value='STABLE';f.destinationAsset.value='STABLE';
    let assetTouched=false,dateTouched=false;
    f.destinationAsset.addEventListener('change',()=>assetTouched=true);
    f.destinationDate.addEventListener('change',()=>dateTouched=true);
    f.sourceAsset.addEventListener('change',()=>{if(!assetTouched)f.destinationAsset.value=f.sourceAsset.value;update();});
    f.sourceDate.addEventListener('change',()=>{if(!dateTouched)f.destinationDate.value=f.sourceDate.value;update();});
    const syncSourceWarehouse=()=>{const external=locationType(f.sourceLocation.value)==='external';if(external){f.sourceWarehouse.value=outsideId;sourceWarehouseWrap.hidden=true;}else sourceWarehouseWrap.hidden=false;};
    const update=()=>{syncSourceWarehouse();const d=Object.fromEntries(new FormData(f));preview.textContent=`系統判定：${mode(d)}`;};
    f.sourceLocation.addEventListener('change',update);
    f.addEventListener('input',update);update();
    f.onsubmit=e=>{e.preventDefault();if(!unlocked()){ask();return;}try{syncSourceWarehouse();const s=load(),d=Object.fromEntries(new FormData(f)),m=mode(d),seq=nextEventSeq(s),lid=nextId(s.ledgerEntries),sw=warehouseKey(d.sourceWarehouse),dw=warehouseKey(d.destinationWarehouse);s.ledgerEntries=s.ledgerEntries||[];s.transactions=s.transactions||[];const base={id:lid,seq,type:'flow',flowType:m,date:d.sourceDate,sourceDate:d.sourceDate,destinationDate:d.destinationDate,sourceWarehouseId:d.sourceWarehouse,destinationWarehouseId:d.destinationWarehouse,sourceWarehouse:sw,destinationWarehouse:dw,sourceLocationId:d.sourceLocation,destinationLocationId:d.destinationLocation,source:locationLabel(d.sourceLocation),destination:locationLabel(d.destinationLocation),sourceAsset:d.sourceAsset,destinationAsset:d.destinationAsset,sourceQty:+d.sourceQty||0,destinationQty:+d.destinationQty||0,amountU:+d.amountU||0,feeAsset:d.feeAsset,feeQty:+d.feeQty||0,note:d.note||''};if(m==='入金'){base.type='deposit';base.warehouse=dw;base.exchange=locationLabel(d.destinationLocation);base.asset=d.destinationAsset;base.qty=+d.destinationQty||+d.sourceQty||0;base.amountU=+d.amountU||0;}else if(m==='出金'){base.type='withdraw';base.warehouse=sw;base.exchange=locationLabel(d.sourceLocation);base.asset=d.sourceAsset;base.qty=+d.sourceQty||0;base.amountU=+d.amountU||0;}else if(['位置轉移','同位置調整','外部轉移'].includes(m)){base.type='transfer';base.warehouse=sw||dw;base.fromWarehouse=sw;base.toWarehouse=dw;base.fromExchange=locationLabel(d.sourceLocation);base.toExchange=locationLabel(d.destinationLocation);base.asset=d.sourceAsset;base.qty=+d.sourceQty||0;}else if(m==='跨倉轉移'){base.type='transfer';base.warehouse=sw;base.fromWarehouse=sw;base.toWarehouse=dw;base.fromExchange=locationLabel(d.sourceLocation);base.toExchange=locationLabel(d.destinationLocation);base.asset=d.sourceAsset;base.qty=+d.sourceQty||0;base.linkedTransactionIds=addTransferPair(s,d,lid,seq);}else{base.type='swap';base.warehouse=sw;base.fromWarehouse=sw;base.toWarehouse=dw;base.fromExchange=locationLabel(d.sourceLocation);base.toExchange=locationLabel(d.destinationLocation);base.fromAsset=d.sourceAsset;base.toAsset=d.destinationAsset;base.fromQty=+d.sourceQty||0;base.toQty=+d.destinationQty||0;base.sellAmountU=+d.amountU||0;base.buyAmountU=+d.amountU||0;base.linkedTransactionIds=addSwapPair(s,d,lid,seq);}s.ledgerEntries.push(base);saveState(s);sessionStorage.setItem('cryptoPortfolioReturnTab','ledger');location.reload();}catch(err){alert(err.message||String(err));}};
  }finally{mounting=false;}
}
new MutationObserver(()=>mount()).observe(document.documentElement,{subtree:true,childList:true});window.addEventListener('load',()=>mount());mount();
