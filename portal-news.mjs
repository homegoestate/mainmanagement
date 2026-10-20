// Public RSS UI only; never pass the ERP session or employee data to this frame.
const $=id=>document.getElementById(id);
let request=null,lastPayload=null;
const timestamp=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)?Date.parse(value):NaN;
const safeUrl=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch{return '';}};
const fmt=t=>new Date(t).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
export function renderTicker(payload,error=''){
 const host=$('newsTickerInner');if(!host)return;host.replaceChildren();const now=Date.now(),seen=new Set();
 const items=(payload?.items||[]).filter(r=>{const t=timestamp(r?.date),link=safeUrl(r?.link);if(!r?.title||!link||seen.has(link)||!Number.isFinite(t)||t>now||t<now-72*3600000)return false;seen.add(link);return true;}).sort((a,b)=>timestamp(b.date)-timestamp(a.date));
 const status=document.createElement('div');status.style.cssText='flex-basis:100%;font-size:12px;line-height:1.7;color:#64748b';
 const fetched=timestamp(payload?.fetchedAt);status.textContent=(payload?`近72小時 ${items.length} 則；資料擷取 ${Number.isFinite(fetched)?fmt(fetched):'時間未確認'}。`:'尚未讀到有效新聞快照。')+(!Number.isFinite(fetched)||now-fetched>6*3600000?'更新時間待核對。':'')+(error?' '+error:'');host.append(status);
 for(const row of items.slice(0,10)){const a=document.createElement('a');a.href=safeUrl(row.link);a.target='_blank';a.rel='noopener noreferrer';a.textContent=`${fmt(timestamp(row.date))}｜${row.title}`;host.append(a);}
 const more=document.createElement('a');more.href='./news.html';more.target='_blank';more.rel='noopener noreferrer';more.textContent='開啟完整新聞中心（日期／主題／搜尋）';host.append(more);
}
function openReader(){
 const body=$('newsModalBody');if(!body)return;
 if(!document.getElementById('news-live-reader')){body.replaceChildren();const note=document.createElement('p');note.textContent='依原始發布日期排序；網站自動更新不等於已發送 LINE 或手機背景通知。';note.style.cssText='font-size:13px;color:#64748b';const frame=document.createElement('iframe');frame.id='news-live-reader';frame.title='宏國易丞新聞新知中心';frame.src='./news.html?embedded=1';frame.referrerPolicy='no-referrer';frame.style.cssText='display:block;width:100%;height:60vh;min-height:350px;border:0';body.append(note,frame);}
 const source=$('newsSourceLink');if(source){source.href='./news.html';source.rel='noopener noreferrer';source.textContent='在新分頁開啟新聞中心';}$('newsModal')?.classList.add('show');
}
export async function refresh({open=false}={}){
 if(open)openReader();if(request)return request;
 request=(async()=>{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);try{
  const response=await fetch('./news/latest.json?t='+Date.now(),{cache:'no-store',credentials:'omit',signal:controller.signal});if(!response.ok)throw new Error('HTTP '+response.status);const payload=await response.json();if(payload?.schemaVersion!==2||!Array.isArray(payload.items))throw new Error('格式不符');lastPayload=payload;renderTicker(payload);
 }catch(error){renderTicker(lastPayload,'本次更新失敗；不把搜尋連結列為今日新聞。');}finally{clearTimeout(timer);request=null;}})();return request;
}

if(typeof document!=='undefined')setInterval(()=>{if(!document.hidden)refresh();},15*60000);
