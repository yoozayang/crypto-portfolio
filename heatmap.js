// Load the official TradingView widget only when the user expands the panel.
document.addEventListener('click',event=>{
 const button=event.target.closest('#prices .heatmap-toggle');
 if(!button)return;
 const body=button.parentElement.querySelector('.heatmap-body');
 const opening=body.hidden;
 body.hidden=!opening;
 button.setAttribute('aria-expanded',String(opening));
 if(!opening||body.dataset.loaded)return;
 body.dataset.loaded='true';
 const host=document.createElement('div');
 host.className='tradingview-widget-container';
 const widget=document.createElement('div');
 widget.className='tradingview-widget-container__widget';
 host.append(widget);
 const credit=document.createElement('div');
 credit.className='heatmap-credit';
 const link=document.createElement('a');
 link.href='https://www.tradingview.com/heatmap/crypto/';
 link.target='_blank';link.rel='noopener noreferrer';
 link.textContent='TradingView 市場熱力圖 ↗';
 credit.append(link);
 host.append(credit);
 body.append(host);
 const script=document.createElement('script');
 script.src='https://s3.tradingview.com/external-embedding/embed-widget-crypto-coins-heatmap.js';
 script.async=true;
 script.textContent=JSON.stringify({
 dataSource:'Crypto',blockSize:'market_cap_calc',blockColor:'24h_close_change|5',
 locale:'zh_TW',symbolUrl:'',colorTheme:'dark',hasTopBar:true,
 isDataSetEnabled:false,isZoomEnabled:true,hasSymbolTooltip:true,
 isMonoSize:false,width:'100%',height:'100%'
 });
 host.append(script);
});
