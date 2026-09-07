(()=>{
const KEY='cryptoPortfolioV1';
const fallback={BTC:77362.625,ETH:2503.065,BNB:748.17,ADA:0.22156,SOL:105.34,ONDO:0.38237,ZRO:1.08825,MSTR:142.8};
const oldDefaults={BTC:79855.12,ETH:2501.38,BNB:830,ADA:0.83,SOL:205,ONDO:0.98,ZRO:3.7,MSTR:142.8};

// v2：修正第一版錯誤/過舊的初始價格；交易資料與使用者手動價格都保留。
if(window.PORTFOLIO_SEED){
  window.PORTFOLIO_SEED.version=2;
  window.PORTFOLIO_SEED.fxTwdPerUsd=31.582;
  window.PORTFOLIO_SEED.prices={...fallback};
}
try{
  const state=JSON.parse(localStorage.getItem(KEY));
  if(state?.version){
    state.priceMeta=state.priceMeta||{};
    state.prices=state.prices||{};
    for(const [asset,price] of Object.entries(fallback)){
      const meta=state.priceMeta[asset]||'';
      const current=Number(state.prices[asset]);
      const isOldDefault=current===oldDefaults[asset];
      const hasRealSource=/^(Binance|CoinGecko|手動更新)/.test(meta);
      if(!hasRealSource && (isOldDefault || !Number.isFinite(current) || current<=0)) state.prices[asset]=price;
    }
    state.version=2;
    localStorage.setItem(KEY,JSON.stringify(state));
  }
}catch{}

// 每個瀏覽器 session 自動更新一次。Binance 失敗時再試 CoinGecko。
if(sessionStorage.getItem('portfolioPriceBootstrapV2')) return;
sessionStorage.setItem('portfolioPriceBootstrapV2','1');
const ids={BTC:'bitcoin',ETH:'ethereum',BNB:'binancecoin',ADA:'cardano',SOL:'solana',ONDO:'ondo-finance',ZRO:'layerzero'};
const assets=Object.keys(ids);
(async()=>{
  let state;
  try{state=JSON.parse(localStorage.getItem(KEY))||structuredClone(window.PORTFOLIO_SEED)}catch{state=structuredClone(window.PORTFOLIO_SEED)}
  state.priceMeta=state.priceMeta||{};state.prices=state.prices||{};
  const failed=[];let changed=false;
  for(const asset of assets){
    try{
      const r=await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${asset}USDT`,{cache:'no-store'});
      if(!r.ok) throw 0;
      const p=+(await r.json()).price;
      if(!(p>0)) throw 0;
      state.prices[asset]=p;state.priceMeta[asset]='Binance · '+new Date().toLocaleString();changed=true;
    }catch{failed.push(asset)}
  }
  if(failed.length){
    try{
      const r=await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${assets.map(a=>ids[a]).join(',')}&vs_currencies=usd`,{cache:'no-store'});
      if(r.ok){
        const data=await r.json();
        for(const asset of failed){
          const p=+data?.[ids[asset]]?.usd;
          if(p>0){state.prices[asset]=p;state.priceMeta[asset]='CoinGecko · '+new Date().toLocaleString();changed=true}
        }
      }
    }catch{}
  }
  if(changed){localStorage.setItem(KEY,JSON.stringify(state));location.reload()}
})();
})();
