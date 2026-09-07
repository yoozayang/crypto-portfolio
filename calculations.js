export function replayTransactions(state){
  const pos={},history=[];let realized=0;
  for(const t of [...(state.transactions||[])].sort((a,b)=>a.id-b.id)){
    const key=`${t.warehouse}|${t.asset}`;
    const p=pos[key]||{warehouse:t.warehouse,asset:t.asset,qty:0,cost:0,realized:0};
    const beforeQty=p.qty,beforeCost=p.cost;
    let tradeRealized=0,costRemoved=0;
    if(t.side==='買入'){
      p.qty+=(+t.qty||0)-((t.feeAsset===t.asset)?(+t.feeQty||0):0);
      p.cost+=+t.amount||0;
    }else{
      const proceeds=(+t.amount||0)-((t.feeAsset==='USDT')?(+t.feeQty||0):0);
      costRemoved=(t.costAdjustment!==null&&t.costAdjustment!==undefined&&t.costAdjustment!=='')?+t.costAdjustment:(beforeQty>0?(+t.qty||0)*(beforeCost/beforeQty):0);
      tradeRealized=proceeds-costRemoved;realized+=tradeRealized;p.realized+=tradeRealized;
      if(t.reset){p.qty=0;p.cost=0;}else{p.qty=Math.max(0,beforeQty-(+t.qty||0));p.cost=Math.max(0,beforeCost-costRemoved);}
    }
    pos[key]=p;
    history.push({...t,beforeQty,beforeCost,afterQty:p.qty,afterCost:p.cost,tradeRealized,costRemoved});
  }
  return {positions:Object.values(pos),history,realized};
}
export function strategyRealized(state){return (state.strategySettlements||[]).reduce((s,x)=>s+(+x.realized||0),0);}
export const marketValue=(p,prices)=>p.marketValue??(p.qty*(+prices[p.asset]||0));
export function trackedMetrics(state){const replay=replayTransactions(state),active=replay.positions.filter(p=>p.qty>1e-12||p.cost>1e-9),market=active.reduce((s,p)=>s+marketValue(p,state.prices),0),cost=active.reduce((s,p)=>s+p.cost,0),unrealized=market-cost,spotRealized=replay.realized,strategy=strategyRealized(state),realized=spotRealized+strategy;return {replay,active,market,cost,unrealized,spotRealized,strategy,realized,totalPnl:unrealized+realized};}
function firstTracked(metrics){return metrics.active.filter(p=>p.warehouse==='第一倉');}
export function reconciledPortfolio(state){
  const metrics=trackedMetrics(state),rec=state.reconciliation;
  if(!rec?.enabled)return {...metrics,reconciled:false,displayMarket:metrics.market,warehouses:{第一倉:firstTracked(metrics),第二倉:metrics.active.filter(p=>p.warehouse==='第二倉')}};
  const first=firstTracked(metrics),trackedSecond=metrics.active.filter(p=>p.warehouse==='第二倉'),actual=rec.actualHoldings||{},trackedTotal={};
  for(const p of metrics.active)trackedTotal[p.asset]=(trackedTotal[p.asset]||0)+(+p.qty||0);
  const second=trackedSecond.map(p=>({...p,legacy:false}));
  const warnings=[];
  for(const asset of ['BTC','ETH','BNB','ADA','SOL']){
    const actualQty=+actual[asset]?.qty||0,knownQty=+trackedTotal[asset]||0,delta=actualQty-knownQty;
    if(delta>1e-8)second.push({warehouse:'第二倉',asset,qty:delta,cost:null,marketValue:delta*(+state.prices[asset]||+actual[asset]?.price||0),legacy:true});
    else if(delta<-1e-8)warnings.push({asset,actualQty,trackedQty:knownQty,delta});
  }
  const stableValue=+actual.STABLE?.value||0;if(stableValue>0)second.push({warehouse:'第二倉',asset:'STABLE',qty:null,cost:null,marketValue:stableValue,legacy:false,label:'USDT/USDC'});
  const otherValue=+actual.OTHER?.value||0;if(otherValue>0)second.push({warehouse:'第二倉',asset:'OTHER',qty:null,cost:null,marketValue:otherValue,legacy:false,label:'其他小額資產'});
  const firstMarket=first.reduce((s,p)=>s+marketValue(p,state.prices),0),secondMarket=second.reduce((s,p)=>s+marketValue(p,state.prices),0),displayMarket=firstMarket+secondMarket;
  return {...metrics,reconciled:true,displayMarket,firstMarket,secondMarket,reconciliationWarnings:warnings,warehouses:{第一倉:first,第二倉:second},snapshot:rec};
}
export function planMetrics(state,warehouse,positions){
  const target=Object.values(state.plans?.[warehouse]||{}).reduce((s,v)=>s+(+v||0),0);
  let invested;
  if(warehouse==='第二倉'){
    // 第二倉是固定資本池：換倉不應把賣出後再買入視為新增本金。
    // 以目前仍在納管的已知成本 + 累積已實現損益作為資本池口徑；歷史未知成本不硬補。
    const currentKnown=positions.reduce((s,p)=>s+(Number.isFinite(+p.cost)&&!p.legacy?+p.cost:0),0);
    const secondRealized=replayTransactions(state).positions.filter(p=>p.warehouse==='第二倉').reduce((s,p)=>s+(+p.realized||0),0);
    invested=Math.max(0,currentKnown-secondRealized);
  }else invested=positions.reduce((s,p)=>s+(Number.isFinite(+p.cost)?+p.cost:0),0);
  return {target,invested,pct:target?invested/target*100:0};
}
