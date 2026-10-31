// Compact navigation shell. Keep original panes and their event handlers intact.
const groups=[
 {id:'dashboard',label:'總覽',icon:'▦',children:[['dashboard','持倉'],['prices','幣價']]},
 {id:'trends',label:'趨勢',icon:'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 17l6-6 4 3 8-9"/><path d="M3 21h18"/></svg>',children:[['trends','資產']]},
 {id:'transactions',label:'紀錄',icon:'⇄',children:[['transactions','交易'],['ledger','資金'],['strategy','策略']]},
 {id:'settings',label:'設定',icon:'⚙',children:[['settings','管理'],['plans','計畫'],['backup','備份']]}
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
 if(scroll)window.scrollTo({top:0,behavior:'smooth'});
}
function init(){
 const tabs=document.querySelector('#tabs');if(!tabs||document.querySelector('#compactNav'))return;
 const nav=document.createElement('nav');nav.id='compactNav';nav.className='compact-nav';nav.setAttribute('aria-label','主選單');
 nav.innerHTML=groups.map(g=>'<button type="button" data-group="'+g.id+'"><span class="nav-icon" aria-hidden="true">'+g.icon+'</span><span>'+g.label+'</span></button>').join('');
 tabs.insertAdjacentElement('beforebegin',nav);
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
