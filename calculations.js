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
export const marketValue=(p,prices)=>p.qty*(+prices[p.asset]||0);

export function trackedMetrics(state){
  const replay=replayTransactions(state);
  const active=replay.positions.filter(p=>p.qty>1e-12||p.cost>1e-9);
  const market=active.reduce((s,p)=>s+marketValue(p,state.prices),0);
  const cost=active.reduce((s,p)=>s+p.cost,0);
  const unrealized=market-cost;
  const spotRealized=replay.realized;
  const strategy=strategyRealized(state);
  const realized=spotRealized+strategy;
  return {replay,active,market,cost,unrealized,spotRealized,strategy,realized,totalPnl:unrealized+realized};
}

function firstTracked(metrics){return metrics.active.filter(p=>p.warehouse==='第一倉');}

export function reconciledPortfolio(state){
  const metrics=trackedMetrics(state);
  const rec=state.reconciliation;
  if(!rec?.enabled) return {...metrics,reconciled:false,displayMarket:metrics.market,warehouses:{第一倉:firstTracked(metrics),第二倉:metrics.active.filter(p=>p.warehouse==='第二倉')}};

  const first=firstTracked(metrics);
  const firstMarket=first.reduce((s,p)=>s+marketValue(p,state.prices),0);
  const total=+rec.totalValue||metrics.market;
  const secondMarket=Math.max(0,total-firstMarket);
  const actual=rec.actualHoldings||{};
  const firstByAsset=Object.fromEntries(first.map(p=>[p.asset,p]));
  const second=[];
  for(const asset of ['BTC','ETH','BNB','ADA','SOL']){
    const totalQty=+actual[asset]?.qty||0;
    const qty=Math.max(0,totalQty-(+firstByAsset[asset]?.qty||0));
    if(qty>1e-12) second.push({warehouse:'第二倉',asset,qty,cost:null,marketValue:qty*(+state.prices[asset]||+actual[asset]?.price||0),legacy:true});
  }
  const knownSecondMarket=second.reduce((s,p)=>s+p.marketValue,0);
  const residual=Math.max(0,secondMarket-knownSecondMarket);
  const cash=Math.min(residual,+actual.CASH?.value||0);
  if(cash>0) second.push({warehouse:'第二倉',asset:'CASH',qty:cash,cost:null,marketValue:cash,legacy:true});
  const other=Math.max(0,residual-cash);
  if(other>0) second.push({warehouse:'第二倉',asset:'OTHER',qty:other,cost:null,marketValue:other,legacy:true});

  return {...metrics,reconciled:true,displayMarket:total,firstMarket,secondMarket,warehouses:{第一倉:first,第二倉:second},snapshot:rec};
}

export function planMetrics(state,warehouse,positions){
  const target=Object.values(state.plans?.[warehouse]||{}).reduce((s,v)=>s+(+v||0),0);
  // Plans measure managed/known capital only. Legacy residuals never fake historical cost.
  const invested=positions.reduce((s,p)=>s+(Number.isFinite(+p.cost)?+p.cost:0),0);
  return {target,invested,pct:target?invested/target*100:0};
}
