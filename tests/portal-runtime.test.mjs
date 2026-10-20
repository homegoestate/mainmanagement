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
async function simulate({
 writeDenied=false,noUser=false,device='DID-1',historical='',storedDevices=['DID-1'],
 password='demo',passwordChanged=false,authorizationRevoked=false,disabled=false,inactiveEmployee=false
}={}){
 let enters=0,writes=0,transactions=0,feedback='';
 let remote=noUser?null:{password:'demo',authorizedDevices:[...storedDevices],legacyField:'preserve-me',legacyPortalDisabled:disabled};
 const fields={'login-user':{value:'Yi cheng'},'login-pass':{value:password},'keep-login':{checked:true},'login-feedback':{hidden:false}};
 const readback=async p=>snapshot(remote);
 const transaction=async(p,callback)=>{
   transactions++;
   if(passwordChanged)remote={...remote,password:'new-credential'};
   if(authorizationRevoked)remote={...remote,authorizedDevices:[]};
   const next=callback(remote ? {...remote,authorizedDevices:[...remote.authorizedDevices]} : null);
   if(next===undefined)return {committed:false,snapshot:snapshot(remote)};
   remote=next;return {committed:true,snapshot:snapshot(remote)};
 };
 const ctx=sandbox(fragment('async function requirePreviouslyApprovedDevice(', 'async function adminLogin()'),{
   $:id=>fields[id],myDeviceId:device,db:{},ref,safeKey:x=>x,
   localStorage:{getItem:id=>id==='hg_did'?historical:null},
   resolveLoginIdentity:async()=>({emp:{name:'楊翊晟',isActive:true},account:'Yi cheng',
     userRecord:remote?{...remote,authorizedDevices:[...remote.authorizedDevices]}:null}),
   getEmployee:async()=>({name:'楊翊晟',isActive:!inactiveEmployee}),
   get:readback,runTransaction:transaction,showLoading:()=>{},
   update:async()=>{writes++;if(writeDenied)throw Error('permission denied');},
   getDeviceType:()=> 'desktop',sessionFromEmployee:()=>({name:'楊翊晟'}),
   storeSession:()=>{},enterDashboard:()=>enters++,
   showLoginFeedback:e=>feedback=e.message,alert:()=>{}
 });
 await ctx.login();
 return {enters,writes,transactions,feedback,remote};
}
test('valid legacy password and device plus audit enter once',async()=>{
  const v=await simulate();assert.equal(v.enters,1);assert.equal(v.writes,1);
});
test('audit write denied fails closed rather than claiming authenticated login',async()=>{
  const v=await simulate({writeDenied:true});assert.equal(v.enters,0);assert.match(v.feedback,/尚未完成登入/);
});
test('Firebase Auth identity alone is not incorrectly treated as legacy authorization',async()=>{
  const v=await simulate({noUser:true});assert.equal(v.enters,0);assert.match(v.feedback,/Firebase Auth/);
});
test('wrong device does not create a session',async()=>{
  const v=await simulate({device:'DID-OTHER'});assert.equal(v.enters,0);assert.match(v.feedback,/裝置/);
});

test('previously approved hg_did migrates after a correct original password',async()=>{
 const v=await simulate({device:'DID-NEW',historical:'D-LEGACY-1',storedDevices:['D-LEGACY-1']});
 assert.equal(v.enters,1);assert.equal(v.transactions,1);assert.deepEqual(v.remote.authorizedDevices,['D-LEGACY-1','DID-NEW']);
 assert.equal(v.remote.legacyField,'preserve-me');
});
test('a wrong password never triggers device migration',async()=>{
 const v=await simulate({device:'DID-NEW',historical:'D-LEGACY-1',storedDevices:['D-LEGACY-1'],password:'invalid'});
 assert.equal(v.enters,0);assert.equal(v.transactions,0);assert.deepEqual(v.remote.authorizedDevices,['D-LEGACY-1']);
});
test('a locally present but server-revoked historical device does not migrate',async()=>{
 const v=await simulate({device:'DID-NEW',historical:'D-LEGACY-1',storedDevices:['D-LEGACY-1'],authorizationRevoked:true});
 assert.equal(v.enters,0);assert.equal(v.transactions,1);assert.deepEqual(v.remote.authorizedDevices,[]);
});
test('a concurrent password change cancels device migration',async()=>{
 const v=await simulate({device:'DID-NEW',historical:'D-LEGACY-1',storedDevices:['D-LEGACY-1'],passwordChanged:true});
 assert.equal(v.enters,0);assert.equal(v.transactions,1);
 assert.deepEqual(v.remote.authorizedDevices,['D-LEGACY-1']);
});
test('historical device from a different account is not accepted',async()=>{
 const v=await simulate({device:'DID-NEW',historical:'D-LEGACY-OTHER',storedDevices:['D-LEGACY-1']});
 assert.equal(v.enters,0);assert.equal(v.transactions,0);
});
test('explicit disabled legacy account is never restored',async()=>{
 const v=await simulate({disabled:true});
 assert.equal(v.enters,0);assert.equal(v.transactions,0);
});
test('inactive employee fails server recheck before dashboard',async()=>{
 const v=await simulate({inactiveEmployee:true});
 assert.equal(v.enters,0);assert.match(v.feedback,/停用/);
});

test('legacy deactivation archives but never deletes staff or credentials',async()=>{
  const writes=[];
  const ctx=sandbox(fragment('window.deactivateEmployee =','window.clearDevices ='),{
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
