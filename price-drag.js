import {savePriceOrder} from './price-board.js';
const desktop=()=>window.matchMedia('(min-width: 768px) and (hover: hover) and (pointer: fine)').matches;
const allowed=()=>desktop()&&window.cryptoPortfolioEditLock?.isUnlocked()===true;
let dragged=null,dropTarget=null,suppressUntil=0;
const cardFrom=e=>e.target.closest?.('#prices .price-grid .price-box');
const codeOf=card=>card?.querySelector('[data-market-coin]')?.dataset.marketCoin;
const clear=()=>{
 document.querySelectorAll('#prices .price-box.price-dragging,#prices .price-box.price-drop-target').forEach(el=>el.classList.remove('price-dragging','price-drop-target'));
 document.querySelectorAll('#prices .price-grid .price-box[draggable]').forEach(el=>el.removeAttribute('draggable'));
 dragged=null;dropTarget=null;
};
document.addEventListener('mousedown',e=>{
 const card=cardFrom(e);
 if(e.button!==0||!card||!allowed()||e.target.closest('button,a,input'))return;
 card.draggable=true;
},true);
document.addEventListener('dragstart',e=>{
 const card=cardFrom(e);
 if(!card||!allowed()||!codeOf(card)){e.preventDefault();return;}
 dragged=card;card.classList.add('price-dragging');
 e.dataTransfer.effectAllowed='move';
 e.dataTransfer.setData('text/plain',codeOf(card));
},true);
document.addEventListener('dragover',e=>{
 if(!dragged||!allowed())return;
 const card=cardFrom(e);
 if(!card||card===dragged)return;
 e.preventDefault();e.dataTransfer.dropEffect='move';
 if(dropTarget!==card){dropTarget?.classList.remove('price-drop-target');dropTarget=card;card.classList.add('price-drop-target');}
},true);
document.addEventListener('drop',e=>{
 if(!dragged)return;
 const target=cardFrom(e);
 if(!target||target===dragged){clear();return;}
 e.preventDefault();
 const grid=target.closest('.price-grid');
 if(!grid||dragged.parentElement!==grid){clear();return;}
 const rect=target.getBoundingClientRect();
 const after=e.clientY>rect.top+rect.height/2 || (Math.abs(e.clientY-(rect.top+rect.height/2))<rect.height/3 && e.clientX>rect.left+rect.width/2);
 grid.insertBefore(dragged,after?target.nextSibling:target);
 savePriceOrder([...grid.querySelectorAll('.price-box')].map(codeOf));
 suppressUntil=Date.now()+500;
 clear();
},true);
document.addEventListener('dragend',()=>{suppressUntil=Date.now()+400;clear();},true);
document.addEventListener('click',e=>{
 if(Date.now()>suppressUntil||!cardFrom(e))return;
 e.preventDefault();e.stopImmediatePropagation();
},true);
document.addEventListener('mouseup',()=>{if(!dragged)document.querySelectorAll('#prices .price-box[draggable]').forEach(el=>el.removeAttribute('draggable'));},true);
