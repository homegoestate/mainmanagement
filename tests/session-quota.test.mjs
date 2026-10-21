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
const loginSrc=fragment('async function login() {','async function adminLogin() {');
const logoutSrc=fragment('function logout() {','window.logout = logout;');
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
  const caseData='x'.repeat(1950);
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
  assert.ok(notes.some(s=>s.includes('瀏覽器長期儲存空間不足')));
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
  assert.equal(JSON.parse(local.getItem(KEY)).name,'楊雅婷');
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
  assert.ok(notes.some(s=>s.includes('無法保存登入狀態')));
});
test('tab storage fallback takes precedence over obsolete persistent name on restore',async()=>{
  const local=new StorageFixture({'hg_cloud_session':'舊同仁'});
  const tab=new StorageFixture({'hg_cloud_session':'YATING'});
  const {ctx}=fixture({local,tab});
  let selected='',enters=0;
  Object.assign(ctx,{
    showLoading:()=>{},
    resolveLoginIdentity:async name=>{
      selected=name;
      return {emp:{name:'楊雅婷',isActive:true},account:'YATING',userRecord:{authorizedDevices:['DID-A']}};
    },
    myDeviceId:'DID-A',
    sessionFromEmployee:()=>subject,
    enterDashboard:()=>enters++,
    alert:()=>{}
  });
  vm.runInContext(restoreSrc,ctx);
  await ctx.restoreSession();
  assert.equal(selected,'YATING');assert.equal(enters,1);
  assert.equal(local.getItem('hg_cloud_session'),'YATING');
});
test('logout removes only ERP identity keys, preserves cases, attendance and receipt',()=>{
  const local=new StorageFixture({'CASE_DATA':'case','ATTENDANCE':'time','RECEIPT':'receipt',
    [KEY]:JSON.stringify(subject),'hg_cloud_session':'YATING',
    'hg_current_operator':'楊雅婷','hg_current_role':'ACCOUNTING'});
  const tab=new StorageFixture({[KEY]:JSON.stringify(subject),'hg_cloud_session':'YATING'});
  let reloads=0;
  const {ctx}=fixture({local,tab,extra:{confirm:()=>true,alert:()=>{},location:{reload:()=>reloads++}}});
  vm.runInContext(logoutSrc,ctx);
  ctx.logout();
  assert.equal(reloads,1);
  for(const k of [KEY,'hg_cloud_session','hg_current_operator','hg_current_role'])assert.equal(local.getItem(k),null);
  assert.equal(tab.getItem(KEY),null);
  assert.deepEqual([local.getItem('CASE_DATA'),local.getItem('ATTENDANCE'),local.getItem('RECEIPT')],['case','time','receipt']);
});
async function mockLogin({correct=true,deviceApproved=true,storageQuota=600}={}){
 const local=new StorageFixture({CASE_DATA:'x'.repeat(580)},storageQuota);
 const tab=new StorageFixture();
 let enters=0, writes=0, msg='';
 const userRecord={password:'original-user-password',authorizedDevices:deviceApproved?['DID-A']:['DID-B']};
 const fields={'login-user':{value:'YATING'},'login-pass':{value:correct?'original-user-password':'wrong'},
 'keep-login':{checked:true},'login-feedback':{hidden:false}};
 const {ctx,notes}=fixture({local,tab,extra:{
  $:id=>fields[id],myDeviceId:'DID-A',db:{},safeKey:x=>x,ref:(db,path)=>path,
  resolveLoginIdentity:async()=>({emp:{name:'楊雅婷',isActive:true},account:'YATING',userRecord}),
  requirePreviouslyApprovedDevice:async()=>{if(!deviceApproved)throw Error('裝置未授權');},
  get:async()=>({exists:()=>true,val:()=>userRecord}),
  getEmployee:async()=>({name:'楊雅婷',isActive:true}),
  update:async()=>writes++,getDeviceType:()=> 'desktop',
  sessionFromEmployee:()=>subject,showLoading:()=>{},
  enterDashboard:()=>enters++,showLoginFeedback:e=>msg=e.message,alert:()=>{}
 }});
 vm.runInContext(loginSrc,ctx);
 await ctx.login();
 return {enters,writes,msg,local,tab,notes};
}
test('real portal login function: correct password/device enters dashboard when storage quota is exhausted',async()=>{
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
test('real portal login function: unapproved device remains denied despite quota fallback',async()=>{
 const v=await mockLogin({deviceApproved:false});
 assert.equal(v.enters,0);assert.equal(v.writes,0);
 assert.equal(v.tab.getItem(KEY),null);
});
test('new-device registration and password reset require a durable device ID',()=>{
 assert.match(source,/async function register\(\) \{\s*if \(!erpDeviceIdIsDurable\(\)\)/);
 assert.match(source,/async function resetPasswordWithCode\(\) \{\s*if \(!erpDeviceIdIsDurable\(\)\)/);
 assert.match(source,/function erpDeviceIdIsDurable\(\)/);
});
