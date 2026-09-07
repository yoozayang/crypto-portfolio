const ROOT='#plans';

function currentTotal(inputs){return inputs.reduce((s,i)=>s+(+i.value||0),0);}
function fmt(n){return (+n||0).toLocaleString('en-US',{maximumFractionDigits:2});}

function mount(){
  const root=document.querySelector(ROOT);if(!root)return;
  root.querySelectorAll('details.fold-card').forEach(card=>{
    if(card.querySelector('.plan-resizer'))return;
    const warehouse=card.querySelector('summary h2')?.textContent?.trim();
    if(!warehouse)return;
    const inputs=[...card.querySelectorAll(`[data-plan^="${warehouse}|"]`)];
    if(!inputs.length)return;
    const total=currentTotal(inputs);
    const box=document.createElement('div');
    box.className='plan-resizer notice';
    box.innerHTML=`<div class="plan-resizer-text"><strong>倉位總目標</strong><span>目前 ${fmt(total)} U；輸入新總額後，可依現在的資產比例一次重算。</span></div><div class="plan-resizer-actions"><input type="number" step="any" min="0" value="${total}" aria-label="${warehouse}新總目標"><button class="btn" type="button">依目前比例重算</button></div>`;
    const body=card.querySelector('.fold-body');body?.insertBefore(box,body.firstChild);
    box.querySelector('button').onclick=()=>{
      const newTotal=+box.querySelector('input').value||0;
      const oldTotal=currentTotal(inputs);
      if(oldTotal<=0||newTotal<0)return;
      const active=inputs.filter(i=>(+i.value||0)>0);
      if(!active.length)return;
      let assigned=0;
      active.forEach((input,idx)=>{
        const old=+input.value||0;
        const next=idx===active.length-1?Math.max(0,newTotal-assigned):Math.round((newTotal*old/oldTotal)*100)/100;
        assigned+=next;input.value=next;
      });
      inputs.forEach(i=>i.dispatchEvent(new Event('change',{bubbles:true})));
    };
  });
}

new MutationObserver(mount).observe(document.body,{childList:true,subtree:true});
mount();
