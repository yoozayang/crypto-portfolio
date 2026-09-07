const clone=o=>JSON.parse(JSON.stringify(o));
const STABLE_ASSETS=new Set(['STABLE','CASH','USDT','USDC']);
const isStable=a=>STABLE_ASSETS.has(a);
const posKey=(w,a)=>`${w}|${a}`;
const ensurePos=(pos,w,a)=>pos[posKey(w,a)]||(pos[posKey(w,a)]={warehouse:w,asset:a,qty:0,cost:0,realized:0});
const eventSeq=e=>+e.seq||+e.id||0;

export function replayTransactions(state){
  const pos={},history=[];let realized=0,incomeRealized=0;
  const events=[...(state.transactions||[]).map(t=>({...t,_kind:'trade'})),...(state.ledgerEntries||[]).filter(e=>['deposit','withdraw','income','transfer'].includes(e.type)).map(e=>({...e,_kind:'ledger'}))].sort((a,b)=>eventSeq(a)-eventSeq(b));
  for(const e of events){
    if(e._kind==='trade'){
      const t=e,p=ensurePos(pos,t.warehouse,t.asset),beforeQty=p.qty,beforeCost=p.cost;let tradeRealized=0,costRemoved=0;
      if(t.side==='買入'){
        p.qty+=(+t.qty||0)-((t.feeAsset===t.asset)?(+t.feeQty||0):0);p.cost+=+t.amount||0;
      }else{
        const proceeds=(+t.amount||0)-((isStable(t.feeAsset))?(+t.feeQty||0):0);
        costRemoved=(t.costAdjustment!==null&&t.costAdjustment!==undefined&&t.costAdjustment!=='')?+t.costAdjustment:(beforeQty>0?(+t.qty||0)*(beforeCost/beforeQty):0);
        tradeRealized=proceeds-costRemoved;realized+=tradeRealized;p.realized+=tradeRealized;
        if(t.reset){p.qty=0;p.cost=0;}else{p.qty=Math.max(0,beforeQty-(+t.qty||0));p.cost=Math.max(0,beforeCost-costRemoved);}
      }
      pos[posKey(t.warehouse,t.asset)]=p;history.push({...t,beforeQty,beforeCost,afterQty:p.qty,afterCost:p.cost,tradeRealized,costRemoved});
      continue;
    }
    const x=e;
    if(x.type==='transfer'){
      if(x.feeAsset&&!isStable(x.feeAsset)&&+x.feeQty>0){const fp=ensurePos(pos,x.warehouse,x.feeAsset),beforeQty=fp.qty,beforeCost=fp.cost,q=Math.min(beforeQty,+x.feeQty||0),removed=beforeQty>0?q*(beforeCost/beforeQty):0;fp.qty=Math.max(0,beforeQty-q);fp.cost=Math.max(0,beforeCost-removed);}
      continue;
    }
    if(x.type==='income'&&isStable(x.asset)){const c=+x.amountU||0;incomeRealized+=c;realized+=c;continue;}
    if(isStable(x.asset))continue;
    const p=ensurePos(pos,x.warehouse,x.asset),beforeQty=p.qty,beforeCost=p.cost;
    if(x.type==='deposit'||x.type==='income'){
      const q=+x.qty||0,c=+x.amountU||0;p.qty+=q;p.cost+=c;
      if(x.type==='income'){incomeRealized+=c;realized+=c;p.realized+=c;}
    }else if(x.type==='withdraw'){
      const q=Math.min(beforeQty,+x.qty||0),removed=beforeQty>0?q*(beforeCost/beforeQty):0;p.qty=Math.max(0,beforeQty-q);p.cost=Math.max(0,beforeCost-removed);
    }
  }
  return {positions:Object.values(pos),history,realized,incomeRealized};
}

export function strategyRealized(state){return (state.strategySettlements||[]).reduce((s,x)=>s+(+x.realized||0),0);}
export const marketValue=(p,prices)=>p.marketValue??((+p.qty||0)*(+prices[p.asset]||0));

export function capitalMetrics(state,warehouse){
  const opening=+state.capitalOpening?.[warehouse]||0;let deposits=0,withdrawals=0;
  for(const e of state.ledgerEntries||[]){if(e.warehouse!==warehouse)continue;if(e.type==='deposit')deposits+=+e.amountU||0;if(e.type==='withdraw')withdrawals+=+e.amountU||0;}
  return {opening,deposits,withdrawals,net:opening+deposits-withdrawals};
}

export function ledgerMetrics(state){
  const byWarehouse={第一倉:capitalMetrics(state,'第一倉'),第二倉:capitalMetrics(state,'第二倉')};let income=0;
  for(const e of state.ledgerEntries||[])if(e.type==='income')income+=+e.amountU||0;
  return {byWarehouse,netCapital:byWarehouse.第一倉.net+byWarehouse.第二倉.net,income};
}

export function trackedMetrics(state){
  const replay=replayTransactions(state),active=replay.positions.filter(p=>p.qty>1e-12||p.cost>1e-9),market=active.reduce((s,p)=>s+marketValue(p,state.prices),0),cost=active.reduce((s,p)=>s+p.cost,0),unrealized=market-cost,spotRealized=replay.realized,strategy=strategyRealized(state),realized=spotRealized+strategy;
  return {replay,active,market,cost,unrealized,spotRealized,strategy,realized,totalPnl:unrealized+realized};
}

function firstTracked(metrics){return metrics.active.filter(p=>p.warehouse==='第一倉');}
function latestSnapshot(state){return [...(state.snapshots||[])].sort((a,b)=>(+a.throughSeq||0)-(+b.throughSeq||0)).at(-1)||null;}
function baseHoldingsFromRecon(state){return clone(state.reconciliation?.actualHoldings||{});}
function addQty(h,a,q){h[a]=h[a]||{qty:0};h[a].qty=(+h[a].qty||0)+q;}
function addStable(h,v){h.STABLE=h.STABLE||{value:0,label:'USDT/USDC'};h.STABLE.value=(+h.STABLE.value||0)+v;}

export function currentActualHoldings(state){
  const snap=latestSnapshot(state),h=clone(snap?.holdings||baseHoldingsFromRecon(state)),cut=+snap?.throughSeq||0;
  if(!h.STABLE&&h.CASH)h.STABLE={value:+h.CASH.value||0,label:'USDT/USDC'};
  for(const t of state.transactions||[]){if(eventSeq(t)<=cut)continue;const q=(+t.qty||0)-((t.side==='買入'&&t.feeAsset===t.asset)?(+t.feeQty||0):0);if(t.side==='買入'){addQty(h,t.asset,q);addStable(h,-(+t.amount||0)-((isStable(t.feeAsset))?(+t.feeQty||0):0));}else{addQty(h,t.asset,-(+t.qty||0));addStable(h,(+t.amount||0)-((isStable(t.feeAsset))?(+t.feeQty||0):0));}}
  for(const e of state.ledgerEntries||[]){if(eventSeq(e)<=cut)continue;
    if(e.type==='deposit'){if(isStable(e.asset))addStable(h,+e.amountU||0);else addQty(h,e.asset,+e.qty||0);}
    if(e.type==='withdraw'){if(isStable(e.asset))addStable(h,-(+e.amountU||0));else addQty(h,e.asset,-(+e.qty||0));}
    if(e.type==='income'){if(isStable(e.asset))addStable(h,+e.amountU||0);else addQty(h,e.asset,+e.qty||0);}
    if(e.type==='transfer'&&e.feeAsset){if(isStable(e.feeAsset))addStable(h,-(+e.feeQty||0));else addQty(h,e.feeAsset,-(+e.feeQty||0));}
  }
  for(const k of Object.keys(h))if(h[k]?.qty!=null&&Math.abs(+h[k].qty)<1e-12)h[k].qty=0;
  return {holdings:h,snapshot:snap};
}

export function reconciledPortfolio(state){
  const metrics=trackedMetrics(state),rec=state.reconciliation;if(!rec?.enabled)return {...metrics,reconciled:false,displayMarket:metrics.market,warehouses:{第一倉:firstTracked(metrics),第二倉:metrics.active.filter(p=>p.warehouse==='第二倉')}};
  const first=firstTracked(metrics),trackedSecond=metrics.active.filter(p=>p.warehouse==='第二倉'),actualInfo=currentActualHoldings(state),actual=actualInfo.holdings,trackedTotal={};for(const p of metrics.active)trackedTotal[p.asset]=(trackedTotal[p.asset]||0)+(+p.qty||0);
  const second=trackedSecond.map(p=>({...p,legacy:false})),warnings=[];const dynamicAssets=[...new Set([...(state.assets||[]),...Object.keys(actual)])].filter(a=>!['CASH','STABLE','OTHER'].includes(a));
  for(const asset of dynamicAssets){const totalQty=+actual[asset]?.qty||0,knownQty=+trackedTotal[asset]||0,delta=totalQty-knownQty;if(delta>1e-8)second.push({warehouse:'第二倉',asset,qty:delta,cost:null,marketValue:delta*(+state.prices[asset]||+actual[asset]?.price||0),legacy:true});else if(delta<-1e-8)warnings.push({asset,actualQty:totalQty,trackedQty:knownQty,delta});}
  const stableValue=Math.max(0,+actual.STABLE?.value||0);if(stableValue>0)second.push({warehouse:'第二倉',asset:'STABLE',qty:null,cost:null,marketValue:stableValue,legacy:false,label:'USDT/USDC'});
  const otherValue=Math.max(0,+actual.OTHER?.value||0);if(otherValue>0)second.push({warehouse:'第二倉',asset:'OTHER',qty:null,cost:null,marketValue:otherValue,legacy:false,label:'其他小額資產'});
  const firstMarket=first.reduce((s,p)=>s+marketValue(p,state.prices),0),secondMarket=second.reduce((s,p)=>s+marketValue(p,state.prices),0),displayMarket=firstMarket+secondMarket;
  return {...metrics,reconciled:true,displayMarket,firstMarket,secondMarket,reconciliationWarnings:warnings,warehouses:{第一倉:first,第二倉:second},snapshot:actualInfo.snapshot||rec,actualHoldings:actual};
}

export function planMetrics(state,warehouse,positions){const target=Object.values(state.plans?.[warehouse]||{}).reduce((s,v)=>s+(+v||0),0),invested=positions.reduce((s,p)=>s+(Number.isFinite(+p.cost)&&!p.legacy?+p.cost:0),0);return {target,invested,pct:target?invested/target*100:0};}
