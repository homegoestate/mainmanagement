import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../index.html',import.meta.url),'utf8').replace(/\r\n/g,'\n');
function fragment(start,end) {
  const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
  assert(a>=0&&b>a,'missing source anchor '+start);
  return source.slice(a,b);
}
const helpers=fragment('function erpStorageRead(store, key) {','async function getEmployee(name) {');
// 2026-11-17 Claude: since 2026-11-12 login() is Firebase Authentication (loginIndex, access/<uid>, employee master).
// loginSrc now carries the real lookup/access/login chain; stubs below are synthetic.
const loginSrc=fragment('async function getEmployee(name) {','function enterDashboard(');
const logoutSrc=fragment('async function logout() {','window.logout = logout;');
const restoreSrc=fragment('async function restoreSession() {','window.addEventListener("message", (event) => {');
const KEY='HG_ERP_SESSION_V1';
class StorageFixture {
  constructor(entries={},quota=Infinity) {
    this.data=new Map(Object.entries(entries).map(([k,v])=>[String(k),String(v)]));
    this.quota=quota;
    this.denyWrites=false;
  }
  getItem(k){return this.data.has(k)?this.data.get(k):null;}
  removeItem(k){this.data.delete(k);}
  setItem(k,v){
    if(this.denyWrites)throw Object.assign(new Error('storage denied'),{name:'SecurityError'});
    k=String(k);v=String(v);
    let size=0;
    for(const [a,b] of this.data)if(a!==k)size+=a.length+b.length;
    if(size+k.length+v.length>this.quota)throw Object.assign(new Error('quota exceeded'),{name:'QuotaExceededError'});
    this.data.set(k,v);
  }
}
function fixture({local,tab,extra={}}={}){
  const notes=[];
  const ctx=vm.createContext({
    console:{warn:()=>{}},window:{__portalStartup:{notice:m=>notes.push(m)}},
    currentSession:null,ERP_SESSION_KEY:KEY,
    localStorage:local||new StorageFixture(),
    sessionStorage:tab||new StorageFixture(),
    ...extra
  });
  vm.runInContext(helpers,ctx);
  return {ctx,notes};
}
const subject={type:'HG_ERP_SESSION',name:'楊雅婷',username:'YATING',loginAccount:'YATING',
  roleCode:'ACCOUNTING',role:'會計',deviceId:'DID-A',permissions:['QUOTE','RECEIPT'],sessionId:'sample-id'};

test('quota: valid ERP login survives without clearing other business data',()=>{
  const caseData='x'.repeat(2030);
  const local=new StorageFixture({CASE_DATA:caseData,'hg_current_operator':'舊同仁', 'hg_cloud_session':'舊同仁'},2040);
  const tab=new StorageFixture();
  const {ctx,notes}=fixture({local,tab});
  const result=ctx.storeSession(subject,true);
  assert.equal(result.localSaved,false);
  assert.equal(result.tabSaved,true);
  assert.equal(JSON.parse(tab.getItem(KEY)).name,'楊雅婷');
  assert.equal(local.getItem('CASE_DATA'),caseData);
  assert.equal(local.getItem(KEY),null);
  assert.equal(local.getItem('hg_current_operator'),null);
  assert.equal(tab.getItem('hg_cloud_session'),'YATING');
  assert.ok(notes.some(s=>s.includes('長期儲存空間不足')));
});
test('quota: same-account stale ERP session can be replaced without touching cases',()=>{
  const prior={...subject,sessionId:'older-id'};
  const saved=JSON.stringify(prior);
  const fresh=JSON.stringify(subject);
  const local=new StorageFixture({CASE_DATA:'q'.repeat(400),[KEY]:saved},400+KEY.length+saved.length+30);
  const {ctx}=fixture({local});
  const result=ctx.storeSession(subject,true);
  assert.equal(result.tabSaved,true);
  assert.equal(result.localSaved,true);
  assert.equal(local.getItem(KEY),null);
  // No persistent full-session copy is written.
  assert.equal(local.getItem('CASE_DATA'),'q'.repeat(400));
});
test('quota: both storage locations full allow current-page session without false password error',()=>{
  const local=new StorageFixture({CASE_DATA:'x'.repeat(1000)},1015);
  const tab=new StorageFixture({OTHER_TAB_WORK:'y'.repeat(1500)},1510);
  const {ctx,notes}=fixture({local,tab});
  const result=ctx.storeSession(subject,true);
  assert.equal(result.localSaved,false);
  assert.equal(result.tabSaved,false);
  assert.equal(ctx.currentSession?.name,'楊雅婷');
  assert.equal(local.getItem('CASE_DATA'),'x'.repeat(1000));
  assert.equal(tab.getItem('OTHER_TAB_WORK'),'y'.repeat(1500));
  assert.ok(notes.some(s=>s.includes('工作階段儲存也不可用')));
});
function firebaseStubs({data,calls,fields={}}){
  return {
    $:id=>fields[id],db:{},ref:(db,p)=>p,safeKey:x=>String(x).replace(/[.#$\[\]\/]/g,'_'),
    normalizeLogin:v=>String(v||'').trim().toLowerCase().replace(/\s+/g,' '),
    normalizeName:v=>String(v||'').replace(/\s+/g,'').trim(),
    defaultEmployeeByLogin:()=>null,defaultEmployeeByName:()=>null,buildEmployeeRecord:x=>({...x}),
    get:async p=>{calls.gets.push(p);return {exists:()=>data[p]!=null,val:()=>data[p]};},
    update:async()=>{calls.writes++;},
    initializeErpDeviceIdentity:async()=>true,auth:{},browserLocalPersistence:'local',browserSessionPersistence:'session',
    setPersistence:async()=>{},
    signInWithEmailAndPassword:async(a,e,p)=>{if(p!=='right-password')throw Object.assign(Error('bad'),{code:'auth/invalid-credential'});return {user:{uid:'uid-yating'}};},
    signOut:async()=>{calls.signOut++;},signInEmployeeSystem:async()=>{},signOutEmployeeSystem:async()=>{},
    getDeviceType:()=>'desktop',sessionFromEmployee:(emp,source,acct)=>({...subject,name:emp.name,loginAccount:acct}),
    showLoading:()=>{},enterDashboard:()=>{calls.enters++;},alert:()=>{},currentAccess:null
  };
}
const yatingData=(access={active:true,account:'YATING'})=>({'loginIndex/yating':'yating@example.test','access/uid-yating':access,
  'employees/YATING':{name:'楊雅婷',isActive:true},'users/YATING':{}});
test('restore uses the Firebase-verified account, never an obsolete stored name',async()=>{
  const local=new StorageFixture({'hg_cloud_session':'舊同仁'});
  const tab=new StorageFixture();
  const {ctx}=fixture({local,tab});
  const calls={gets:[],writes:0,signOut:0,enters:0};
  Object.assign(ctx,firebaseStubs({data:yatingData(),calls}),{authReady:Promise.resolve({uid:'uid-yating'})});
  vm.runInContext(loginSrc,ctx);vm.runInContext(restoreSrc,ctx);
  await ctx.restoreSession();
  assert.equal(calls.enters,1);assert.ok(calls.gets.includes('employees/YATING'));
  assert.ok(!calls.gets.some(p=>p.includes('舊同仁')));
  assert.equal(local.getItem('hg_cloud_session'),'YATING');
});
test('restore failure signs out and asks for a fresh login',async()=>{
  const local=new StorageFixture({'hg_cloud_session':'YATING'});
  const {ctx,notes}=fixture({local});
  const calls={gets:[],writes:0,signOut:0,enters:0};
  Object.assign(ctx,firebaseStubs({data:yatingData({active:false,account:'YATING'}),calls}),{authReady:Promise.resolve({uid:'uid-yating'})});
  vm.runInContext(loginSrc,ctx);vm.runInContext(restoreSrc,ctx);
  await ctx.restoreSession();
  assert.equal(calls.enters,0);assert.equal(calls.signOut,1);
  assert.ok(notes.some(s=>s.includes('上次登入無法恢復')));
});
test('logout signs out of both systems and removes only ERP identity keys, preserving cases, attendance and receipt',async()=>{
  const local=new StorageFixture({'CASE_DATA':'case','ATTENDANCE':'time','RECEIPT':'receipt',
    [KEY]:JSON.stringify(subject),'hg_cloud_session':'YATING',
    'hg_current_operator':'楊雅婷','hg_current_role':'ACCOUNTING'});
  const tab=new StorageFixture({[KEY]:JSON.stringify(subject),'hg_cloud_session':'YATING'});
  let reloads=0,signedOut=0,ssoOut=0;
  const {ctx}=fixture({local,tab,extra:{confirm:()=>true,alert:()=>{},location:{reload:()=>reloads++},
    auth:{},signOut:async()=>{signedOut++;},signOutEmployeeSystem:async()=>{ssoOut++;}}});
  vm.runInContext(logoutSrc,ctx);
  await ctx.logout();
  assert.equal(reloads,1);assert.equal(signedOut,1);assert.equal(ssoOut,1);
  for(const k of [KEY,'hg_cloud_session','hg_current_operator','hg_current_role'])assert.equal(local.getItem(k),null);
  assert.equal(tab.getItem(KEY),null);
  assert.deepEqual([local.getItem('CASE_DATA'),local.getItem('ATTENDANCE'),local.getItem('RECEIPT')],['case','time','receipt']);
});
async function mockLogin({correct=true,accessActive=true,storageQuota=600}={}){
 const local=new StorageFixture({CASE_DATA:'x'.repeat(580)},storageQuota);
 const tab=new StorageFixture();
 const calls={gets:[],writes:0,signOut:0,enters:0};
 const fields={'login-user':{value:'YATING'},'login-pass':{value:correct?'right-password':'wrong'},
 'keep-login':{checked:true},'login-feedback':{hidden:false,textContent:''}};
 const {ctx,notes}=fixture({local,tab,extra:firebaseStubs({data:yatingData({active:accessActive,account:'YATING'}),calls,fields})});
 vm.runInContext(loginSrc,ctx);
 await ctx.login();
 const fb=fields['login-feedback'];
 return {enters:calls.enters,writes:calls.writes,signOut:calls.signOut,msg:fb.hidden?'':fb.textContent,local,tab,notes};
}
test('real portal login function: correct Firebase credentials enter dashboard when storage quota is exhausted',async()=>{
 const v=await mockLogin();
 assert.equal(v.enters,1);assert.equal(v.writes,1);assert.equal(v.msg,'');
 assert.equal(v.local.getItem('CASE_DATA'),'x'.repeat(580));
 assert.equal(JSON.parse(v.tab.getItem(KEY)).name,'楊雅婷');
});
test('real portal login function: wrong password never enters dashboard',async()=>{
 const v=await mockLogin({correct:false});
 assert.equal(v.enters,0);assert.equal(v.writes,0);
 assert.match(v.msg,/密碼/);
});
test('real portal login function: switched-off access remains denied despite quota fallback',async()=>{
 const v=await mockLogin({accessActive:false});
 assert.equal(v.enters,0);assert.equal(v.writes,0);assert.equal(v.signOut,1);
 assert.equal(v.tab.getItem(KEY),null);
});
test('login waits for a durable device identity before checking credentials',()=>{
 assert.match(source,/async function login\(\) \{\s*await initializeErpDeviceIdentity\(\);/);
 assert.match(source,/await initializeErpDeviceIdentity\(\);\s*await restoreSession\(\);/);
 assert.match(source,/function erpDeviceIdIsDurable\(\)/);
});
