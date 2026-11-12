import test from 'node:test';import assert from 'node:assert/strict';
import {authenticatedActor,authorizeAction,validatePendingRequest,directoryEntry,accountAdminView} from '../backend/authorization.mjs';
const project='mainmanagement-1f3d2',now=Date.now();
const token=()=>({uid:'a',sub:'a',aud:project,iss:`https://securetoken.google.com/${project}`,exp:now/1000+600,auth_time:now/1000-10,firebase:{sign_in_provider:'custom'},hg_sid:'s1',hg_device:'d1'});
const state=()=>({uid:'a',sessionId:'s1',deviceId:'d1',principal:{active:true,role:'staff',version:1,employeeKey:'a',employeeId:101,modules:{hr:true}},session:{active:true,expiresAt:now+600000,version:1,deviceId:'d1'},device:{active:true},employee:{id:101,name:'A',employmentStatus:'active'},reviewScope:{r:true}});
const actor=(role='staff',overrides={})=>{const s=state();s.principal={...s.principal,role,approvals:{sick:true},...overrides};if(overrides.reviewScope!==undefined)s.reviewScope=overrides.reviewScope;return authenticatedActor(token(),s,project,now);};
const request=()=>({empId:202,category:'leave',type:'病假',status:'pending'});
const resource=()=>({requestKey:'r',decision:'approve',request:request(),applicant:{id:202,employmentStatus:'active'}});
const pending=()=>({empId:101,empName:'A',category:'leave',type:'病假',date:'2026-10-22',endDate:'2026-10-22',days:'1',reason:'test',status:'pending',timestamp:now});
test('server policy accepts fresh verified state and ignores forged token roles',()=>{assert.equal(authenticatedActor({...token(),role:'ceo'},state(),project,now).role,'staff');});
for(const [label,mutate] of [
 ['wrong audience',(t,s)=>t.aud='homego-system'],['wrong issuer',(t,s)=>t.iss='https://evil.invalid'],['wrong subject',(t,s)=>t.sub='b'],
 ['expired token',(t,s)=>t.exp=1],['anonymous',(t,s)=>t.firebase.sign_in_provider='anonymous'],['wrong principal',(t,s)=>s.uid='b'],
 ['revoked account',(t,s)=>s.principal.active=false],['revoked session',(t,s)=>s.session.active=false],['expired session',(t,s)=>s.session.expiresAt=1],
 ['changed version',(t,s)=>s.principal.version=2],['revoked device',(t,s)=>s.device.active=false],['archived employee',(t,s)=>s.employee.employmentStatus='archived'],
 ['wrong employee ID',(t,s)=>s.employee.id='101'],['wrong session device',(t,s)=>s.session.deviceId='d2']
]) test(`server policy denies ${label}`,()=>{const t=token(),s=state();mutate(t,s);assert.throws(()=>authenticatedActor(t,s,project,now));});
test('manager approval needs both category and per-record scope',()=>{
 assert.equal(authorizeAction(actor('manager'),'request.review',resource()),true);
 assert.throws(()=>authorizeAction(actor('manager',{approvals:{}}),'request.review',resource()));
 assert.throws(()=>authorizeAction(actor('manager',{reviewScope:{}}),'request.review',resource()));
 assert.throws(()=>authorizeAction(actor(),'request.review',resource()));
});
test('manager cannot approve annual leave or own request; CEO cannot self-approve',()=>{
 for(const role of ['manager','ceo'])assert.throws(()=>authorizeAction(actor(role),'request.review',{...resource(),request:{...request(),empId:101},applicant:{id:101}}));
 assert.throws(()=>authorizeAction(actor('manager'),'request.review',{...resource(),request:{...request(),type:'特休'}}));
 assert.equal(authorizeAction(actor('ceo'),'request.review',{...resource(),request:{...request(),type:'特休'}}),true);
});
test('finalized or archived applicant cannot be approved',()=>{
 assert.throws(()=>authorizeAction(actor('ceo'),'request.review',{...resource(),request:{...request(),status:'approved'}}));
 assert.throws(()=>authorizeAction(actor('ceo'),'request.review',{...resource(),applicant:{id:202,employmentStatus:'archived'}}));
});
test('privileged operations require CEO; unknown actions and arbitrary path writes denied',()=>{
 for(const action of ['salary.update','annualLeave.reconcile','delegation.update','device.approve','employee.update']) {
  assert.throws(()=>authorizeAction(actor('manager'),action));assert.equal(authorizeAction(actor('ceo'),action),true);
 }
 assert.throws(()=>authorizeAction(actor('ceo'),'database.set',{path:'/'}));
});
test('pending request validation rejects invalid calendar, zero/huge days, extra fields and wrong owner',()=>{
 assert.equal(validatePendingRequest(pending(),{id:101,name:'A'},now),true);
 for(const patch of [{date:'2026-02-30'},{endDate:'2026-10-21'},{days:'0.0'},{days:'9999'},{empId:'101'},{approvedById:'c'},{status:'approved'}])assert.throws(()=>validatePendingRequest({...pending(),...patch},{id:101,name:'A'},now));
});
test('safe projections cannot leak passwords, device IDs, salary or WebAuthn credentials',()=>{
 const employee={name:'A',salary:30000,devices:['secret'],webAuthnId:'biometric',role:'ceo'};
 assert.deepEqual(directoryEntry(employee),{name:'A'});
 assert.deepEqual(accountAdminView(employee,{password:'secret',authorizedDevices:['secret']},'a'),{name:'A',uid:'a',active:true,deviceCount:1});
 assert.equal(directoryEntry({...employee,employmentStatus:'archived'}),null);
});

test('request-supplied actor objects cannot invoke privileged operations',()=>{assert.throws(()=>authorizeAction({role:'ceo',modules:{hr:true}},'salary.update'));});
