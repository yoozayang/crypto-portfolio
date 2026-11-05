// Compact navigation shell. Keep original panes and their event handlers intact.
const groups=[
 {id:'dashboard',label:'總覽',icon:'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',children:[['dashboard','持倉']]},
 {id:'prices',label:'幣價',icon:'＄',children:[['prices','行情']]},
 {id:'trends',label:'趨勢',icon:'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 17l6-6 4 3 8-9"/><path d="M3 21h18"/></svg>',children:[['trends','資產']]},
 {id:'transactions',label:'紀錄',icon:'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4"/></svg>',children:[['transactions','交易'],['ledger','資金'],['strategy','策略']]},
 {id:'settings',label:'設定',icon:'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l-1.8 1.8a1.7 1.7 0 0 0-1.9-.3l-1 .4-.6 2.2h-2.8l-.6-2.2-1-.4a1.7 1.7 0 0 0-1.9.3l-1.8-1.8a1.7 1.7 0 0 0 .3-1.9l-.4-1-2.2-.6v-2.8l2.2-.6.4-1a1.7 1.7 0 0 0-.3-1.9l1.8-1.8a1.7 1.7 0 0 0 1.9.3l1-.4.6-2.2h2.8l.6 2.2 1 .4a1.7 1.7 0 0 0 1.9-.3l1.8 1.8a1.7 1.7 0 0 0-.3 1.9l.4 1 2.2.6v2.8l-2.2.6z"/></svg>',children:[['settings','管理'],['plans','計畫'],['backup','備份']]}
];
let current='dashboard';
const resolve=id=>id==='strategy'?'transactions':id;
function navigate(id,{scroll=false}={}){
 const group=groups.find(g=>g.children.some(([child])=>child===id))||groups[0];
 current=id;
 const original=document.querySelector('#tabs [data-tab="'+resolve(id)+'"]');
 if(original)original.click();
 else if(id==='ledger'){document.querySelectorAll('.tab-pane').forEach(x=>x.classList.toggle('hidden',x.id!=='ledger'));}
 document.querySelectorAll('.compact-nav button').forEach(b=>{b.classList.toggle('active',b.dataset.group===group.id);b.setAttribute('aria-current',b.dataset.group===group.id?'page':'false')});
 const sub=document.querySelector('#compactSubnav');
 sub.innerHTML=group.children.length===1?'':group.children.map(([key,label])=>'<button type="button" data-sub="'+key+'" class="'+(id===key?'active':'')+'">'+label+'</button>').join('');
 sub.querySelectorAll('button').forEach(b=>b.onclick=()=>navigate(b.dataset.sub));

 const strategy=document.querySelector('#strategySettlementSection');
 const transactions=document.querySelector('#transactions');
 if(strategy&&transactions){if(id==='strategy'){transactions.querySelectorAll(':scope > :not(#strategySettlementSection)').forEach(x=>x.classList.add('compact-hidden'));strategy.classList.remove('compact-hidden')}else{transactions.querySelectorAll(':scope > :not(#strategySettlementSection)').forEach(x=>x.classList.remove('compact-hidden'));strategy.classList.add('compact-hidden')}}
 if(id==='prices')window.cryptoPortfolioRefreshPrices?.();
 if(scroll)window.scrollTo({top:0,behavior:'smooth'});
}
function init(){
 const tabs=document.querySelector('#tabs');if(!tabs||document.querySelector('#compactNav'))return;
 const nav=document.createElement('nav');nav.id='compactNav';nav.className='compact-nav';nav.setAttribute('aria-label','主選單');
 const priceIcon='<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10" cy="11" r="6"/><path d="M10 7v8m2-6H9a2 2 0 0 0 0 4h2"/><path class="price-cycle" d="M16 5a8 8 0 0 1 4 8m0 0-2-2m2 2 2-2"/></svg>';
 nav.innerHTML=groups.map(g=>'<button type="button" data-group="'+g.id+'"><span class="nav-icon" aria-hidden="true">'+g.icon+'</span><span>'+g.label+'</span></button>').join('');
 const title=document.querySelector('.top .title');const refresh=document.querySelector('#refreshPrices');
 const brand=document.createElement('div');brand.className='compact-brand';brand.textContent='Crypto Portfolio';nav.prepend(brand);
 if(refresh){refresh.classList.add('compact-price-button');refresh.innerHTML='<span class="nav-icon" aria-hidden="true">'+priceIcon+'</span><span class="price-label-desktop">更新幣價</span><span class="price-label-mobile">幣價</span>';const settings=nav.querySelector('[data-group="settings"]');nav.insertBefore(refresh,settings);}
 tabs.insertAdjacentElement('beforebegin',nav);
 if(title)title.hidden=true;
 const sub=document.createElement('div');sub.id='compactSubnav';sub.className='compact-subnav';nav.insertAdjacentElement('afterend',sub);
 nav.querySelectorAll('button').forEach(b=>b.onclick=()=>navigate(groups.find(g=>g.id===b.dataset.group).children[0][0],{scroll:true}));
 // Existing save/reload behavior: preserve the return target.
 const stored=sessionStorage.getItem('cryptoPortfolioReturnTab');
 if(stored&&groups.some(g=>g.children.some(([id])=>id===stored)))navigate(stored);
 else navigate(document.querySelector('#tabs button.active')?.dataset.tab||'dashboard');
 const backup=document.querySelector('#backup .card h2');if(backup)backup.textContent='備份與還原';
 // Existing code may add strategy section asynchronously; update visibility when it arrives.
 const observer=new MutationObserver(()=>{if(current==='strategy'||current==='transactions')navigate(current)});
 observer.observe(document.querySelector('#transactions'),{childList:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
