import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
// Synthetic legacy-portal fixtures only; no production Firebase, employee or device access.
const src=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const fragment=(a,b)=>{const i=src.indexOf(a),j=src.indexOf(b,i+1);assert(i>=0&&j>i);return src.slice(i,j);};
const sandbox=(source,scope={})=>{const ctx=vm.createContext({console,...scope});vm.runInContext(source,ctx);return ctx;};
const snapshot=v=>({exists:()=>v!=null,val:()=>v}),ref=(db,p)=>p;
test('missing or archived default staff are not recreated',async()=>{
  let writes=0;
  const ctx=sandbox(fragment('async function getEmployee(name) {','async function resolveLoginIdentity('),{
    defaultEmployeeByLogin:()=>({name:'離職人員'}),defaultEmployeeByName:()=>null,
    normalizeLogin:x=>x,normalizeName:x=>x,safeKey:x=>x,db:{},ref,
    get:async p=>snapshot(p==='employees'?{}:null),set:async()=>writes++,
    buildEmployeeRecord:x=>x
  });
  assert.equal(await ctx.getEmployee('離職人員'),null);assert.equal(writes,0);
});
test('existing staff lookup does not write or replace id',async()=>{
  let writes=0;const person={name:'彭毅凡',id:123,isActive:true};
  const ctx=sandbox(fragment('async function getEmployee(name) {','async function resolveLoginIdentity('),{
    defaultEmployeeByLogin:()=>null,defaultEmployeeByName:()=>null,safeKey:x=>x,db:{},ref,
    get:async p=>snapshot(p==='employees/彭毅凡'?person:null),
    set:async()=>writes++,buildEmployeeRecord:x=>x
  });
  assert.equal((await ctx.getEmployee('彭毅凡')).id,123);assert.equal(writes,0);
});

// 2026-11-17 Claude: the legacy password + approved-device login these tests used to cover was replaced on
// 2026-11-12 by Firebase Authentication (loginIndex -> sign-in id, access/<uid>.active, then the employee
// master). The tests below run the real login() source against synthetic stubs and keep the same guarantees:
// wrong or unknown credentials never enter, revoked access or a deactivated employee is signed out before the
// dashboard, nothing is recreated, and no password is ever written to the database.
const LOGIN_SRC=fragment('async function getEmployee(name) {','function enterDashboard(');
async function firebaseLogin({account='YATING',password='right-password',knownAccount=true,
  access={active:true,account:'YATING'},employee={name:'楊雅婷',isActive:true},auditDenied=false,keep=true}={}){
 const calls={order:[],signIn:[],signOut:0,ssoIn:[],ssoOut:0,persistence:[],updates:[],stored:[],enters:0};
 const fields={'login-user':{value:account},'login-pass':{value:password},'keep-login':{checked:keep},'login-feedback':{hidden:true,textContent:''}};
 const data={'loginIndex/yating':knownAccount?'yating@example.test':null,'access/uid-yating':access,
   'employees/YATING':employee,'users/YATING':{lastLoginAt:'earlier'}};
 const ctx=sandbox(LOGIN_SRC,{
  $:id=>fields[id],db:{},ref,safeKey:x=>String(x).replace(/[.#$\[\]\/]/g,'_'),
  normalizeLogin:v=>String(v||'').trim().toLowerCase().replace(/\s+/g,' '),
  normalizeName:v=>String(v||'').replace(/\s+/g,'').trim(),
  defaultEmployeeByLogin:()=>null,defaultEmployeeByName:()=>null,buildEmployeeRecord:x=>({...x}),
  get:async p=>{calls.order.push('get:'+p);return snapshot(data[p]??null);},
  update:async(p,v)=>{calls.updates.push({p,v});if(auditDenied)throw Object.assign(Error('permission denied'),{code:'PERMISSION_DENIED'});},
  initializeErpDeviceIdentity:async()=>{calls.order.push('device');return true;},
  auth:{},browserLocalPersistence:'local',browserSessionPersistence:'session',
  setPersistence:async(a,mode)=>{calls.persistence.push(mode);},
  signInWithEmailAndPassword:async(a,email,pass)=>{
    calls.order.push('signIn');calls.signIn.push(email);
    if(pass!=='right-password')throw Object.assign(Error('bad credential'),{code:'auth/invalid-credential'});
    return {user:{uid:'uid-yating'}};
  },
  signOut:async()=>{calls.signOut++;},
  signInEmployeeSystem:async(email,pass,k)=>{calls.ssoIn.push([email,k]);},
  signOutEmployeeSystem:async()=>{calls.ssoOut++;},
  getDeviceType:()=>'desktop',sessionFromEmployee:(emp,source,acct)=>({name:emp.name,loginAccount:acct,source}),
  storeSession:(s,k)=>{calls.stored.push([s,k]);},enterDashboard:()=>{calls.enters++;},
  showLoading:()=>{},alert:m=>{calls.alert=m;},currentAccess:null,console:{warn:()=>{}}
 });
 await ctx.login();
 return {...calls,feedback:fields['login-feedback'],passField:fields['login-pass'].value};
}
test('Firebase login: valid account, password, access and active employee enter once',async()=>{
 const v=await firebaseLogin();
 assert.deepEqual(v.signIn,['yating@example.test']);assert.equal(v.enters,1);assert.equal(v.stored.length,1);
 assert.equal(v.stored[0][1],true);assert.deepEqual(v.persistence,['local']);assert.equal(v.passField,'');
 assert.equal(v.feedback.hidden,true);assert.deepEqual(v.ssoIn,[['yating@example.test',true]]);assert.equal(v.signOut,0);
});
test('Firebase login: unknown account never reaches Firebase sign-in',async()=>{
 const v=await firebaseLogin({knownAccount:false});
 assert.deepEqual(v.signIn,[]);assert.equal(v.enters,0);assert.equal(v.feedback.hidden,false);
 assert.equal(v.feedback.textContent,'帳號或密碼錯誤。');
});
test('Firebase login: wrong password gives the same generic message and writes nothing',async()=>{
 const v=await firebaseLogin({password:'wrong'});
 assert.equal(v.enters,0);assert.equal(v.updates.length,0);assert.equal(v.stored.length,0);
 assert.equal(v.feedback.textContent,'帳號或密碼錯誤。');
});
test('Firebase login: missing access record signs out of both systems before any dashboard',async()=>{
 const v=await firebaseLogin({access:null});
 assert.equal(v.enters,0);assert.equal(v.stored.length,0);assert.equal(v.signOut,1);assert.equal(v.ssoOut,1);
 assert.match(v.feedback.textContent,/沒有系統使用權限/);
});
test('Firebase login: access switched off by the administrator is refused',async()=>{
 const v=await firebaseLogin({access:{active:false,account:'YATING'}});
 assert.equal(v.enters,0);assert.equal(v.signOut,1);assert.match(v.feedback.textContent,/沒有系統使用權限/);
});
test('Firebase login: access without an employee mapping is refused',async()=>{
 const v=await firebaseLogin({access:{active:true}});
 assert.equal(v.enters,0);assert.equal(v.signOut,1);assert.match(v.feedback.textContent,/尚未對應員工資料/);
});
test('Firebase login: deactivated employee master is refused before the dashboard',async()=>{
 const v=await firebaseLogin({employee:{name:'楊雅婷',isActive:false}});
 assert.equal(v.enters,0);assert.equal(v.stored.length,0);assert.equal(v.signOut,1);assert.match(v.feedback.textContent,/停用/);
});
test('Firebase login: missing employee master is refused and never recreated',async()=>{
 const v=await firebaseLogin({employee:null});
 assert.equal(v.enters,0);assert.equal(v.signOut,1);assert.match(v.feedback.textContent,/尚未建立員工主檔/);
 assert.ok(v.updates.every(u=>!String(u.p).startsWith('employees')));
});
test('Firebase login: the login record never stores a password',async()=>{
 const v=await firebaseLogin();
 assert.equal(v.updates.length,1);assert.equal(v.updates[0].p,'users/YATING');
 assert.deepEqual(Object.keys(v.updates[0].v).sort(),['employeeName','lastDeviceType','lastLoginAt']);
});
test('Firebase login: a failed login-record write is logged only; Firebase Auth plus access stay the gate',async()=>{
 const ok=await firebaseLogin({auditDenied:true});assert.equal(ok.enters,1);
 const denied=await firebaseLogin({auditDenied:true,access:null});assert.equal(denied.enters,0);assert.equal(denied.signOut,1);
});
test('Firebase login: not remembering this device keeps the sign-in to this browser session',async()=>{
 const v=await firebaseLogin({keep:false});
 assert.deepEqual(v.persistence,['session']);assert.equal(v.stored[0][1],false);assert.deepEqual(v.ssoIn,[['yating@example.test',false]]);
});
test('Firebase login: device identity is ready before any credential lookup',async()=>{
 const v=await firebaseLogin();
 assert.equal(v.order[0],'device');assert.ok(v.order.indexOf('signIn')>v.order.indexOf('get:loginIndex/yating'));
});

test('legacy deactivation archives but never deletes staff or credentials',async()=>{
  const writes=[];
  const ctx=sandbox(fragment('window.deactivateEmployee =','window.reactivateEmployee ='),{
    window:{},setActiveEmployee:async(...args)=>writes.push(args),confirm:()=>true,alert:()=>{},
    remove:()=>{throw Error('unexpected destructive delete');}
  });
  await ctx.window.deactivateEmployee('前同仁');assert.deepEqual(writes,[['前同仁',false]]);
});
test('employee updates use merge semantics preserving original numeric ids',async()=>{
  const record={name:'測試同仁',id:321,roleCode:'OPS',isActive:true}, updates=[];
  const fields={'emp-name':{value:'測試同仁'},'emp-role':{value:'OPS'},'emp-onboard':{value:'2026-10-20'},'emp-note':{value:'測試'},'emp-pass':{value:''}};
  const ctx=sandbox(fragment('async function saveEmployee() {','window.editEmployee ='),{
    currentSession:{isCEO:true},$:id=>fields[id],employeesCache:{'測試同仁':record},
    buildEmployeeRecord:x=>({name:x.name,roleCode:x.roleCode,isActive:true}),
    showLoading:()=>{},db:{},ref,safeKey:x=>x,
    update:async(p,value)=>updates.push({p,value}),
    set:()=>{throw Error('unexpected destructive replacement');},alert:()=>{}
  });
  await ctx.saveEmployee();assert.equal(updates.length,1);
  assert.equal({...record,...updates[0].value}.id,321);
});
