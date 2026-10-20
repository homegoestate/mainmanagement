#!/usr/bin/env python3
"""Bounded, hash-checked patch: public news UI, message origin gates, and diagnostic link.
No Firebase config, login, account, role, database, or service-worker changes.
"""
import hashlib
import sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
BASELINE='8da37f7a69e0da03b446f5727511286d8e73e388cc2378d680253c487a69cbd0'
MARKER='// HG_PUBLIC_NEWS_BRIDGE_20261020'
WRAPPER=r'''// HG_PUBLIC_NEWS_BRIDGE_20261020
let portalNewsModule = null;
function newsSeenKey() {
  const date = new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  return `hg_news_seen_${currentSession?.name || 'guest'}_${date}`;
}
function renderTickerPlaceholder() {
  const host = $("newsTickerInner"); host.replaceChildren();
  const link = document.createElement('a'); link.href='./news.html';link.target='_blank';link.rel='noopener noreferrer';link.textContent='新聞中心載入中；可在新分頁開啟';host.append(link);
}
async function fetchNews({auto=false,force=false}={}) {
  let seen=false;try{seen=localStorage.getItem(newsSeenKey())==='1';}catch{}
  try {
    portalNewsModule ||= import('./portal-news.mjs?v=20261020.1');
    const ui=await portalNewsModule;
    return ui.refresh({open:force||(auto&&!seen)});
  } catch(error) {
    portalNewsModule=null;renderTickerPlaceholder();
    window.__portalStartup?.notice('新聞介面未完成載入；可另開新聞中心。原登入與案件資料未變更。');
  }
}
window.closeNewsModal = function() {
  if ($("newsDontShowToday")?.checked && currentSession) {try{localStorage.setItem(newsSeenKey(),'1');}catch{}}
  $("newsModal").classList.remove('show');
};

'''

def replace_once(text,old,new):
    if text.count(old)!=1:
        raise ValueError('Expected unique portal patch anchor not found')
    return text.replace(old,new,1)

def patch_bytes(raw):
    text=raw.decode('utf-8')
    if MARKER in text:
        return raw
    if hashlib.sha256(raw).hexdigest()!=BASELINE:
        raise ValueError('Portal baseline changed; do not overwrite. Reconcile first.')
    eol='\r\n' if '\r\n' in text else '\n'
    start=text.index('function normalizeNewsTitle(text) {')
    end=text.index('function escapeHtml(v) {',start)
    text=text[:start]+WRAPPER.replace('\n',eol)+text[end:]
    text=replace_once(text,'frame.contentWindow.postMessage(payload, "*")','frame.contentWindow.postMessage(payload, new URL(currentFrameItem.url, location.href).origin)')
    text=replace_once(text,'if (!frame.contentWindow || !currentSession) return;','if (!frame.contentWindow || !currentSession || !currentFrameItem) return;')
    text=replace_once(text,'window.addEventListener("message", (event) => {'+eol+'  const data = event.data || {};',
       'window.addEventListener("message", (event) => {'+eol+'  if (!currentFrameItem || event.source !== $("content-frame").contentWindow) return;'+eol+'  if (event.origin !== new URL(currentFrameItem.url, location.href).origin) return;'+eol+'  const data = event.data || {};')
    text=replace_once(text,'    frame.src = sessionParams(currentFrameItem.url);'+eol+'    frame.onload = () => setTimeout(sendSessionToFrame, 250);',
       '    frame.onload = () => setTimeout(sendSessionToFrame, 250);'+eol+'    frame.src = sessionParams(currentFrameItem.url);')
    text=replace_once(text,'登入一次後，案件、打卡、報價、收據等模組會自動帶入同一位操作人，不需要各系統重複登入。',
       '總管理與各模組目前保留既有權限驗證。傳遞操作人資訊不等於完成跨系統授權；若已驗證仍無法登入，可先使用下方帳號檢查。')
    anchor='<div style="margin-top:12px"><span class="switch-link" onclick="showAdminAuth()"'
    replacement='<div style="margin-top:12px"><a class="switch-link" href="./login-check.html" target="_blank" rel="noopener noreferrer">已驗證仍無法登入？檢查既有 Firebase 帳號</a><br><a class="switch-link" href="./news.html" target="_blank" rel="noopener noreferrer">開啟新聞新知中心</a></div>'+eol+'      '+anchor
    text=replace_once(text,anchor,replacement)
    return text.encode('utf-8')

def main():
    path=ROOT/'index.html';raw=path.read_bytes();patched=patch_bytes(raw)
    if patched!=raw:path.write_bytes(patched)
    print('Portal SHA256: '+hashlib.sha256(patched).hexdigest())
    if '--check' in sys.argv:
        import re,subprocess,tempfile
        for script in re.findall(r'<script[^>]*>(.*?)</script>',patched.decode('utf-8'),re.S):
            with tempfile.NamedTemporaryFile(suffix='.mjs',mode='w',encoding='utf-8') as f:
                f.write(script);f.flush();subprocess.run(['node','--check',f.name],check=True)
if __name__=='__main__':main()
