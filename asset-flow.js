import {STORAGE_KEY,nextEventSeq,saveState} from './records.js?v=20260907-1600';
import {replayTransactions} from './calculations.js?v=20260907-1525';

const load=()=>JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');
const unlocked=()=>window.cryptoPortfolioEditLock?.isUnlocked?.()??true;
const ask=()=>window.cryptoPortfolioEditLock?.open?.();
const today=()=>new Date().toISOString().slice(0,10);
const nextId=a=>Math.max(0,...(a||[]).map(x=>+x.id||0))+1;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const isStable=a=>['STABLE','USDT','USDC','CASH'].includes(a);
const option=(v,l=v)=>`<option value="${esc(v)}">${esc(l)}</option>`;

function mode(d){
  if(d.sourceWallet==='外部')return '入金';
  if(d.destinationWallet==='外部')return '出金';
  if(d.sourceAsset===d.destinationAsset){
    if(d.sourceWarehouse!==d.destinationWarehouse)return '跨倉轉移';
    if(d.sourceWallet!==d.destinationWallet)return '交易所 / 錢包轉移';
    return '同位置調整';
  }
  return d.sourceWarehouse!==d.destinationWarehouse?'跨倉換幣':'資產換幣';
}

function currentCostBasis(state,warehouse,asset,qty){
  if(isStable(asset))return +qty||0;
  const p=replayTransactions(state).positions.find(x=>x.warehouse===warehouse&&x.asset===asset);
  if(!p||!p.qty||p.qty<=0)return null;
  return Math.min(+qty||0,p.qty)*(p.cost/p.qty);
}

function addTransferPair(state,d,lid,seq){
  const qty=+d.sourceQty||0;
  const movedCost=currentCostBasis(state,d.sourceWarehouse,d.sourceAsset,qty);
  if(movedCost==null)throw new Error(`找不到 ${d.sourceWarehouse} ${d.sourceAsset} 的可計算成本，無法自動做跨倉成本轉移。`);
  const sellId=nextId(state.transactions),buyId=sellId+1,group=`flow-${lid}`;
  state.transactions.push({id:sellId,seq:seq+0.1,warehouse:d.sourceWarehouse,exchange:d.sourceWallet,date:d.sourceDate,side:'賣出',asset:d.sourceAsset,price:qty?movedCost/qty:0,qty,amount:movedCost,feeAsset:'',feeQty:0,costAdjustment:movedCost,reset:false,note:`跨倉成本轉移 ${group} → ${d.destinationWarehouse}`,groupId:group,source:'flow-transfer'});
  state.transactions.push({id:buyId,seq:seq+0.2,warehouse:d.destinationWarehouse,exchange:d.destinationWallet,date:d.destinationDate,side:'買入',asset:d.destinationAsset,price:(+d.destinationQty||qty)?movedCost/(+d.destinationQty||qty):0,qty:+d.destinationQty||qty,amount:movedCost,feeAsset:d.feeAsset,feeQty:+d.feeQty||0,reset:false,note:`跨倉成本轉移 ${group} ← ${d.sourceWarehouse}`,groupId:group,source:'flow-transfer'});
  return [sellId,buyId];
}

function addSwapPair(state,d,lid,seq){
  const amount=+d.amountU||0;
  if(!amount)throw new Error('換幣時需要填「成交 / 折算金額（U）」。');
  const sellId=nextId(state.transactions),buyId=sellId+1,group=`flow-${lid}`;
  state.transactions.push({id:sellId,seq:seq+0.1,warehouse:d.sourceWarehouse,exchange:d.sourceWallet,date:d.sourceDate,side:'賣出',asset:d.sourceAsset,price:+d.sourceQty?amount/+d.sourceQty:0,qty:+d.sourceQty||0,amount,feeAsset:d.feeAsset,feeQty:+d.feeQty||0,reset:false,note:`資產流轉 ${group}`,groupId:group,source:'flow'});
  state.transactions.push({id:buyId,seq:seq+0.2,warehouse:d.destinationWarehouse,exchange:d.destinationWallet,date:d.destinationDate,side:'買入',asset:d.destinationAsset,price:+d.destinationQty?amount/+d.destinationQty:0,qty:+d.destinationQty||0,amount,feeAsset:'',feeQty:0,reset:false,note:`資產流轉 ${group}`,groupId:group,source:'flow'});
  return [sellId,buyId];
}

function mount(){
  const host=document.querySelector('#ledger');if(!host||host.querySelector('#assetFlowForm'))return;
  const state=load(),wallets=['外部',...(state.exchanges||[])],assets=[...(state.assets||[]).filter(a=>!['CASH','OTHER'].includes(a)),'STABLE'];
  if(!document.querySelector('#assetFlowStyles')){const style=document.createElement('style');style.id='assetFlowStyles';style.textContent='.flow-block{padding:14px;border:1px solid var(--line);border-radius:12px;background:#0f1830}.flow-block h3{margin:0 0 12px;font-size:15px}.flow-divider{grid-column:1/-1;height:1px;background:var(--line);margin:2px 0}.flow-extra{padding-top:2px}.flow-hint{grid-column:1/-1;color:var(--muted);font-size:12px}';document.head.appendChild(style);}
  const card=document.createElement('div');card.className='card section asset-flow-card';
  const walletOpts=wallets.map(x=>option(x)).join(''),assetOpts=assets.map(x=>option(x,x==='STABLE'?'USDT/USDC':x)).join('');
  card.innerHTML=`<div class="ledger-head"><h2>資產流轉</h2><span class="subtle">分別填來源與目的；第一倉、第二倉之間也可以直接轉移。</span></div>
  <form id="assetFlowForm" class="form-grid">
    <div class="full flow-block"><h3>來源</h3><div class="form-grid">
      <label><span>日期</span><input name="sourceDate" type="date" value="${today()}"></label>
      <label><span>倉位</span><select name="sourceWarehouse">${option('第一倉')}${option('第二倉')}</select></label>
      <label><span>交易所 / 錢包</span><select name="sourceWallet">${walletOpts}</select></label>
      <label><span>資產種類</span><select name="sourceAsset">${assetOpts}</select></label>
      <label><span>數量</span><input name="sourceQty" type="number" step="any"></label>
    </div></div>
    <div class="full flow-divider"></div>
    <div class="full flow-block"><h3>目的</h3><div class="form-grid">
      <label><span>日期</span><input name="destinationDate" type="date" value="${today()}"></label>
      <label><span>倉位</span><select name="destinationWarehouse">${option('第一倉')}${option('第二倉')}</select></label>
      <label><span>交易所 / 錢包</span><select name="destinationWallet">${walletOpts}</select></label>
      <label><span>資產種類</span><select name="destinationAsset">${assetOpts}</select></label>
      <label><span>數量</span><input name="destinationQty" type="number" step="any"></label>
    </div></div>
    <div class="full flow-divider"></div>
    <div class="full flow-extra form-grid">
      <label><span>成交 / 折算金額（U）</span><input name="amountU" type="number" step="any"></label>
      <label><span>手續費幣種</span><select name="feeAsset">${option('','—')}${assetOpts}</select></label>
      <label><span>手續費數量</span><input name="feeQty" type="number" step="any" value="0"></label>
      <label class="full"><span>備註</span><textarea name="note"></textarea></label>
    </div>
    <div class="full notice" id="flowPreview"></div>
    <div class="full toolbar"><button class="btn primary" type="submit">登記流轉</button></div>
  </form>`;
  const first=host.querySelector('.card.section');host.insertBefore(card,first||host.firstChild);
  const f=card.querySelector('form'),preview=card.querySelector('#flowPreview');
  f.sourceWarehouse.value='第二倉';f.destinationWarehouse.value='第二倉';f.sourceWallet.value='MAX';f.destinationWallet.value='幣安';f.sourceAsset.value='ETH';f.destinationAsset.value='ETH';
  let destinationAssetTouched=false,destinationDateTouched=false;
  f.destinationAsset.addEventListener('change',()=>destinationAssetTouched=true);
  f.destinationDate.addEventListener('change',()=>destinationDateTouched=true);
  f.sourceAsset.addEventListener('change',()=>{if(!destinationAssetTouched)f.destinationAsset.value=f.sourceAsset.value;update();});
  f.sourceDate.addEventListener('change',()=>{if(!destinationDateTouched)f.destinationDate.value=f.sourceDate.value;update();});
  const update=()=>{const d=Object.fromEntries(new FormData(f)),m=mode(d);let text=`系統判定：${m}`;if(m==='跨倉轉移')text+='；數量與移動平均成本一起移到目的倉，不產生已實現損益。';else if(m.includes('換幣'))text+='；底層會建立來源賣出 + 目的買入。';else if(m==='交易所 / 錢包轉移')text+='；只改資產位置，不改本金與損益。';preview.textContent=text;};
  f.addEventListener('input',update);update();
  f.onsubmit=e=>{e.preventDefault();if(!unlocked()){ask();return;}try{const s=load(),d=Object.fromEntries(new FormData(f)),m=mode(d),seq=nextEventSeq(s),lid=nextId(s.ledgerEntries);s.ledgerEntries=s.ledgerEntries||[];s.transactions=s.transactions||[];const base={id:lid,seq,type:'flow',flowType:m,date:d.sourceDate,sourceDate:d.sourceDate,destinationDate:d.destinationDate,sourceWarehouse:d.sourceWarehouse,destinationWarehouse:d.destinationWarehouse,source:d.sourceWallet,destination:d.destinationWallet,sourceAsset:d.sourceAsset,destinationAsset:d.destinationAsset,sourceQty:+d.sourceQty||0,destinationQty:+d.destinationQty||0,amountU:+d.amountU||0,feeAsset:d.feeAsset,feeQty:+d.feeQty||0,note:d.note||''};
    if(m==='入金'){base.type='deposit';base.warehouse=d.destinationWarehouse;base.exchange=d.destinationWallet;base.asset=d.destinationAsset;base.qty=+d.destinationQty||+d.sourceQty||0;base.amountU=+d.amountU||0;}
    else if(m==='出金'){base.type='withdraw';base.warehouse=d.sourceWarehouse;base.exchange=d.sourceWallet;base.asset=d.sourceAsset;base.qty=+d.sourceQty||0;base.amountU=+d.amountU||0;}
    else if(m==='交易所 / 錢包轉移'||m==='同位置調整'){base.type='transfer';base.warehouse=d.sourceWarehouse;base.fromWarehouse=d.sourceWarehouse;base.toWarehouse=d.destinationWarehouse;base.fromExchange=d.sourceWallet;base.toExchange=d.destinationWallet;base.asset=d.sourceAsset;base.qty=+d.sourceQty||0;}
    else if(m==='跨倉轉移'){base.type='transfer';base.warehouse=d.sourceWarehouse;base.fromWarehouse=d.sourceWarehouse;base.toWarehouse=d.destinationWarehouse;base.fromExchange=d.sourceWallet;base.toExchange=d.destinationWallet;base.asset=d.sourceAsset;base.qty=+d.sourceQty||0;base.linkedTransactionIds=addTransferPair(s,d,lid,seq);}
    else{base.type='swap';base.warehouse=d.sourceWarehouse;base.fromWarehouse=d.sourceWarehouse;base.toWarehouse=d.destinationWarehouse;base.fromExchange=d.sourceWallet;base.toExchange=d.destinationWallet;base.fromAsset=d.sourceAsset;base.toAsset=d.destinationAsset;base.fromQty=+d.sourceQty||0;base.toQty=+d.destinationQty||0;base.sellAmountU=+d.amountU||0;base.buyAmountU=+d.amountU||0;base.linkedTransactionIds=addSwapPair(s,d,lid,seq);}
    s.ledgerEntries.push(base);saveState(s);sessionStorage.setItem('cryptoPortfolioReturnTab','ledger');location.reload();
  }catch(err){alert(err.message||String(err));}};
}
new MutationObserver(mount).observe(document.documentElement,{subtree:true,childList:true});window.addEventListener('load',mount);mount();