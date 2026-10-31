const endpoint='https://uyxfppzinqnyofuwshye.supabase.co/rest/v1/browser_price_quotes';
const key='sb_publishable_bx9oTbaaOgMrpRfqQ4fYKQ_3EU7JqKG';
export async function publishQuotes(quotes){
 const rows=quotes.filter(q=>/^[A-Z0-9]{2,16}$/.test(q.asset)&&/^[A-Z0-9]{4,24}$/.test(q.symbol)&&Number.isFinite(q.price)&&q.price>0);
 if(!rows.length)return;
 const r=await fetch(endpoint,{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify(rows)});
 if(!r.ok)throw Error('Quote cache: '+r.status+' '+await r.text());
}
