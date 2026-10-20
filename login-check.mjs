// Diagnostic only: no database reads/writes, no new accounts, no authority changes.
const $=id=>document.getElementById(id);
let auth,api,busy=false;
const result={version:'20261020.1',project:'mainmanagement-1f3d2',sdk:'loading',signedIn:false,emailVerified:null,erpAuthorization:'not-tested',database:'not-accessed'};
const explain=error=>({
 'auth/invalid-credential':'Email 或密碼不正確；這裡使用的是 Firebase 帳號，不是舊網頁開通碼。',
 'auth/user-not-found':'Firebase 尚無此帳號；請先核對 Email，不要重複建立。',
 'auth/wrong-password':'Firebase 密碼不正確，可自行申請重設密碼信。',
 'auth/user-disabled':'Firebase 帳號已停用，須由公司管理者查核。',
 'auth/operation-not-allowed':'此專案尚未允許 Email／密碼登入。',
 'auth/network-request-failed':'無法連至 Google 驗證服務，請檢查網路。',
 'auth/too-many-requests':'驗證嘗試過多，請稍後再試。',
 'auth/invalid-email':'Email 格式不正確。'
}[error?.code]||'檢查未完成：'+(error?.code||error?.name||'unknown-error'));
function render(note=''){
 const user=auth?.currentUser;result.signedIn=!!user;result.emailVerified=user?user.emailVerified:null;
 $('status').textContent=(note?note+'\n':'')+(user?`Firebase 帳號：${user.email || "已登入本人"}\nEmail 驗證：${user.emailVerified?'已完成':'尚未完成'}\nERP 人員對應／主管權限：本頁未測試，也不會自行授權。`:'目前未登入檢查頁。')+'\n原總管理仍使用另一套舊版登入；不能將兩者的成功訊息混為一談。';
 $('login').disabled=busy||!api;$('reset').disabled=busy||!api;
 for(const id of ['refresh','signout'])$(id).disabled=busy||!user;
 $('verify').disabled=busy||!user||user.emailVerified;
}
// Keep the success/error message once without replacing verified state with a claim.
async function action(fn){if(busy||!api)return;busy=true;render('處理中…');let note='';try{note=await fn()||'';result.errorCode=null;}catch(e){result.errorCode=e.code||e.name;note=explain(e);}finally{busy=false;render(note);}}
$('check').addEventListener('submit',e=>{e.preventDefault();action(async()=>{if(auth.currentUser)await api.signOut(auth);try{await api.signInWithEmailAndPassword(auth,$('email').value.trim(),$('password').value);}finally{$('password').value='';}return '只完成 Firebase 身分檢查；公司資料未變更。';});});
$('refresh').addEventListener('click',()=>action(async()=>{if(!auth.currentUser)return;await api.reload(auth.currentUser);await api.getIdToken(auth.currentUser,true);return '已向 Firebase 重新讀取驗證狀態。';}));
$('verify').addEventListener('click',()=>action(async()=>{await api.sendEmailVerification(auth.currentUser);return '已要求寄送驗證信。請本人完成後按「重新確認」，不需要再建立帳號。';}));
$('reset').addEventListener('click',()=>action(async()=>{const email=$('email').value.trim();if(!$('email').reportValidity())return '請先填入正確 Email。';await api.sendPasswordResetEmail(auth,email);return '已送出重設申請；如該帳號可用，請查看信箱及垃圾郵件。';}));
$('signout').addEventListener('click',()=>action(async()=>{await api.signOut(auth);$('password').value='';return '檢查頁已登出。';}));
$('copy').addEventListener('click',async()=>{const text=JSON.stringify({...result,checkedAt:new Date().toISOString()},null,2);try{await navigator.clipboard.writeText(text);render('已複製檢查結果；不含 Email、UID、密碼或 token。');}catch{const pre=document.createElement('pre');pre.textContent=text;$('status').replaceChildren(pre);}});
try{
 const [{initializeApp},authApi]=await Promise.all([import('https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js'),import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js')]);
 api=authApi;auth=api.getAuth(initializeApp({apiKey:'AIzaSyCSOS-36oQ6hTyhtD2vrez3QGvPdvwMOIw',authDomain:'mainmanagement-1f3d2.firebaseapp.com',projectId:'mainmanagement-1f3d2',appId:'1:916729301354:web:11d81d965c2127b0a17d13'},'homego-access-check'));
 await api.setPersistence(auth,api.inMemoryPersistence);result.sdk='ready';render();
}catch(e){api=null;result.sdk='failed';result.errorCode=e.code||e.name;$('status').textContent='官方驗證程式載入失敗；請確認網路後重新整理。本頁沒有修改任何人員資料。';}
