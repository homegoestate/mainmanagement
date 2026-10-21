import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const start=html.indexOf('const ERP_IDENTITY_DB = "homego-erp-device-identity-v1";');
const end=html.indexOf('const $ = (id) => document.getElementById(id);',start);
assert(start>0&&end>start,'Device identity storage is embedded without an external asset');
const fragment=html.slice(start,end);
function memory(initial={},blockWrites=false){
 const values=new Map(Object.entries(initial));
 return {values,getItem:k=>values.get(k)??null,
   setItem(k,v){if(blockWrites)throw Object.assign(new Error('quota'),{name:'QuotaExceededError'});values.set(k,String(v));}};
}
function idb(backing){
 return {open(dbName,version){
   const opening={};
   queueMicrotask(()=>{
     const db={
       objectStoreNames:{contains:()=>true},createObjectStore:()=>{},
       close:()=>{},
       transaction(){
         const tx={};
         tx.objectStore=()=>({
           get(key){const op={};
             queueMicrotask(()=>{op.result=backing.get(key);op.onsuccess?.();queueMicrotask(()=>tx.oncomplete?.());});
             return op;
           },
           put(value,key){const op={};
             queueMicrotask(()=>{backing.set(key,value);op.onsuccess?.();queueMicrotask(()=>tx.oncomplete?.());});
             return op;
           }
         });
         return tx;
       }
     };
     opening.result=db;opening.onsuccess?.();
   });
   return opening;
 }};
}
function fixture({local=memory(),tab=memory(),backing=new Map(),enableDB=true}={}){
 const messages=[];
 const ctx=vm.createContext({
  localStorage:local,sessionStorage:tab,indexedDB:enableDB?idb(backing):undefined,
  console:{warn:()=>{}},window:{__portalStartup:{notice:msg=>messages.push(msg)}},
  setTimeout,clearTimeout,Uint8Array,
  crypto:{getRandomValues:arr=>{for(let n=0;n<arr.length;n++)arr[n]=n+2;return arr;}}
 });
 vm.runInContext(fragment,ctx);
 return {ctx,local,tab,backing,messages,async initialize(){return ctx.initializeErpDeviceIdentity();},
 id(){return vm.runInContext('myDeviceId',ctx);},
 durable(){return ctx.erpDeviceIdIsDurable();}};
}
test('new employee device persists in IndexedDB when shared localStorage is already full',async()=>{
 const shared=new Map(), local=memory({CASE_DATA:'x'.repeat(200000),QUOTATION_RECORDS:'Y'.repeat(9000)},true);
 const a=fixture({local,backing:shared}),ok=await a.initialize();
 assert.equal(ok,true);assert.equal(a.durable(),true);
 assert.match(a.id(),/^DID-[A-F0-9]+$/);
 assert.equal(local.getItem('CASE_DATA'),'x'.repeat(200000));
 assert.equal(local.getItem('QUOTATION_RECORDS'),'Y'.repeat(9000));
 const second=fixture({local,backing:shared});
 assert.equal(await second.initialize(),true);
 assert.equal(second.id(),a.id());
});
test('existing approved cloud DID remains exactly unchanged and migrates into IndexedDB',async()=>{
 const shared=new Map([['deviceId','DID-ANOTHER']]);
 const local=memory({hg_cloud_did:'DID-CURRENT-APPROVED'});
 const f=fixture({local,backing:shared});
 assert.equal(await f.initialize(),true);
 assert.equal(f.id(),'DID-CURRENT-APPROVED');
 assert.equal(shared.get('deviceId'),'DID-CURRENT-APPROVED');
});
test('legacy hg_did survives new key and unavailable IndexedDB',async()=>{
 const local=memory({hg_did:'DID-ORIGINAL'},true);
 const f=fixture({local,enableDB:false});
 assert.equal(await f.initialize(),true);
 assert.equal(f.id(),'DID-ORIGINAL');
 assert.equal(f.durable(),true);
});
test('device registration cannot claim durability when both IndexedDB and localStorage fail',async()=>{
 const f=fixture({local:memory({CASE_DATA:'do-not-remove'},true),enableDB:false});
 assert.equal(await f.initialize(),false);
 assert.equal(f.durable(),false);
 assert.match(f.id(),/^DID-/);
 assert.equal(f.local.getItem('CASE_DATA'),'do-not-remove');
 assert.ok(f.messages.some(t=>t.includes('不能註冊新裝置')));
});
test('repeat device initialization never allocates a second DID',async()=>{
 const f=fixture({local:memory({},true)});
 await f.initialize();const first=f.id();
 await f.initialize();assert.equal(f.id(),first);
});
test('new staff registration and password reset await stable device identity',()=>{
 assert.match(html,/async function register\(\) \{\s*await initializeErpDeviceIdentity\(\);\s*if \(!erpDeviceIdIsDurable\(\)\)/);
 assert.match(html,/async function resetPasswordWithCode\(\) \{\s*await initializeErpDeviceIdentity\(\);\s*if \(!erpDeviceIdIsDurable\(\)\)/);
 assert.match(html,/async function login\(\) \{\s*await initializeErpDeviceIdentity\(\)/);
});
test('legacy user database and protected Firebase Auth are not modified by browser identity storage',()=>{
 assert.doesNotMatch(fragment,/update\(ref\(db|set\(ref\(db|signInWithEmailAndPassword/);
 assert.match(fragment,/erpDeviceDurable = storedInDB \|\| storedLocally;/);
});
