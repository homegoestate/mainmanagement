// Public news UI only. No Firebase, tokens, employee records or session storage.
export const labels={law:'法規與交易安全',tax:'稅務',loan:'房貸與信用管制',market:'台南與台灣房市',land:'土地與開發',inherit:'繼承與信託',finance:'金融與總體經濟',ai:'AI 與企業工具'};
export function safeUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch{return '';}}
export function time(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value))return NaN;return Date.parse(value);}
export function day(ms){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(ms));}
export function normalize(payload,now=Date.now()){
 if(payload?.schemaVersion!==2||!Array.isArray(payload.items))throw new Error('新聞格式不符；沒有替換前次資料');
 const seen=new Set();return payload.items.filter(row=>{if(!row||typeof row.title!=='string'||!safeUrl(row.link)||!Array.isArray(row.categories))return false;const t=time(row.date);if(!Number.isFinite(t)||t>now||t<now-7*86400000||seen.has(row.link))return false;seen.add(row.link);return true;}).sort((a,b)=>time(b.date)-time(a.date));
}
export function selectItems(items,period,category,query,now=Date.now()){
 const q=String(query||'').trim().toLocaleLowerCase();return items.filter(row=>{const t=time(row.date);return (period==='today'?day(t)===day(now):t>=now-Number(period)*3600000)&&(category==='all'||row.categories.includes(category))&&(!q||`${row.title} ${row.source}`.toLocaleLowerCase().includes(q));});
}
if(typeof document!=='undefined'){
 const $=id=>document.getElementById(id);let payload=null,items=[],limit=40,lastError='',busy=false;
 const fmt=ms=>Number.isFinite(ms)?new Date(ms).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false}):'時間未確認';
 function render(){
  const now=Date.now();items=payload?normalize(payload,now):[];const selected=selectItems(items,$('period').value,$('category').value,$('query').value,now);$('cards').replaceChildren();
  for(const row of selected.slice(0,limit)){const card=document.createElement('a');card.className='card';card.href=safeUrl(row.link);card.target='_blank';card.rel='noopener noreferrer';
   for(const cat of row.categories.filter(c=>labels[c])){const tag=document.createElement('span');tag.className='tag';tag.textContent=labels[cat];card.append(tag);}
   const title=document.createElement('h2');title.textContent=row.title;const meta=document.createElement('div');meta.className='meta';meta.textContent=`${row.source||'來源未標示'}｜發布 ${fmt(time(row.date))}`;card.append(title,meta);$('cards').append(card);}
  if(!selected.length){const empty=document.createElement('div');empty.className='empty';empty.textContent=payload?'這個期間與分類沒有符合的消息。可以改選「近 7 天」或其他主題；系統不會把舊文改成今天。':'尚未取得新聞快照。原 ERP 功能不受影響；請稍後重新讀取。';$('cards').append(empty);}
  const fetched=time(payload?.fetchedAt),stale=!Number.isFinite(fetched)||now-fetched>6*3600000;
  $('status').textContent=`符合 ${selected.length} 則｜本頁顯示 ${Math.min(limit,selected.length)} 則｜近七日共 ${items.length} 則\n最後擷取：${fmt(fetched)}${stale?'｜更新已超過六小時或時間不明，請留意時效':''}${payload?.status==='partial'?'｜部分來源失敗，已保留仍有效的前次消息':''}${lastError?'\n'+lastError:''}`;
  $('status').classList.toggle('error',stale||!!lastError);$('more').hidden=selected.length<=limit;
 }
 async function load(){if(busy)return;busy=true;$('refresh').disabled=true;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try{const r=await fetch('./news/latest.json?t='+Date.now(),{cache:'no-store',credentials:'omit',signal:controller.signal});if(!r.ok)throw new Error('HTTP '+r.status);const next=await r.json();normalize(next);payload=next;lastError='';}
  catch(error){lastError='更新未成功：'+(error.name==='AbortError'?'連線逾時':error.message)+(payload?'；仍顯示本分頁前次取得的有效消息。':'；排程尚未產出，或來源暫時無法讀取。');}
  finally{clearTimeout(timer);busy=false;$('refresh').disabled=false;render();}
 }
 for(const id of ['period','category'])$(id).addEventListener('change',()=>{limit=40;render();});$('query').addEventListener('input',()=>{limit=40;render();});$('refresh').addEventListener('click',load);$('more').addEventListener('click',()=>{limit+=40;render();});load();
 setInterval(()=>{if(!document.hidden)load();},15*60000);
}
