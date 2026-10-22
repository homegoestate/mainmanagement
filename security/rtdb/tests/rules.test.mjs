import {test, before, after, beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment, assertFails, assertSucceeds} from '@firebase/rules-unit-testing';
import {ref, get, set, update, remove, query, orderByChild, equalTo, limitToLast, serverTimestamp} from 'firebase/database';

// Fail closed rather than ever point test fixtures at a production database.
const host = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
assert.match(host || '', /^(127\.0\.0\.1|localhost):\d+$/);
const envs = {};
const now = Date.now();
const fixture = {
  employees: {
    'key-a':{id:101,name:'Test A',employmentStatus:'active',isActive:true},
    'key-b':{id:'B-202',name:'Test B',employmentStatus:'active',isActive:true},
    'key-m':{id:303,name:'Test Manager',employmentStatus:'active',isActive:true},
    'key-c':{id:404,name:'Test CEO',employmentStatus:'active',isActive:true}
  },
  users:{legacy:{password:'synthetic-test-only',authorizedDevices:['synthetic-device']}},
  requests:{
    a:{empId:101,empName:'Test A',category:'leave',type:'病假',status:'pending'},
    b:{empId:'B-202',empName:'Test B',category:'leave',type:'病假',status:'pending'},
    annual:{empId:101,category:'leave',type:'特休',status:'pending'},
    car:{empId:101,category:'car',type:'公務車',status:'pending'},
    personal:{empId:101,category:'leave',type:'事假',status:'pending'},
    ownManager:{empId:303,category:'leave',type:'病假',status:'pending'}
  },
  attendance:{a:{empId:101},b:{empId:'B-202'}},
  selfViews:{a:{name:'Test A'},b:{name:'Test B'}},
  directory:{a:{name:'Test A'},b:{name:'Test B'}},
  adminViews:{accounts:{count:4}},
  reviewQueues:{m:{a:true}},
  bulletin:{title:'Test'},settings:{salary:{rate:1}},
  _security:{principals:{},sessions:{},devices:{},requestScopes:{m:{a:true,annual:true,car:true,personal:true,ownManager:true}}}
};
for(const [uid,key,role] of [['a','key-a','staff'],['b','key-b','staff'],['m','key-m','manager'],['c','key-c','ceo']]) {
  fixture._security.principals[uid]={active:true,role,employeeKey:key,employeeId:fixture.employees[key].id,version:1,modules:{hr:true,erp:true},approvals:{sick:true,car:false,personal:false}};
  fixture._security.sessions[uid]={s1:{active:true,expiresAt:now+3600000,version:1,deviceId:'d1'}};
  fixture._security.devices[uid]={d1:{active:true}};
}
before(async()=>{
  for(const name of ['homego-system','mainmanagement']) envs[name]=await initializeTestEnvironment({
    projectId:`demo-${name}`,database:{host:host.split(':')[0],port:Number(host.split(':')[1]),rules:readFileSync(new URL(`../rules/${name}.candidate.rules.json`,import.meta.url),'utf8')}
  });
});
after(async()=>{await Promise.all(Object.values(envs).map(e=>e.cleanup()));});
beforeEach(async()=>{for(const env of Object.values(envs)) await env.withSecurityRulesDisabled(async ctx=>set(ref(ctx.database()),structuredClone(fixture)));});
const db=(uid='a',name='homego-system',claims={})=>uid===null?envs[name].unauthenticatedContext().database():envs[name].authenticatedContext(uid,{hg_sid:'s1',hg_device:'d1',...claims}).database();
const adminEdit=(name,path,value)=>envs[name].withSecurityRulesDisabled(ctx=>set(ref(ctx.database(),path),value));
const leave=(empId=101,empName='Test A')=>({empId,empName,category:'leave',type:'病假',date:'2026-10-22',endDate:'2026-10-22',days:'1',reason:'test',status:'pending',timestamp:Date.now()});
const punch=()=>({empId:101,empName:'Test A',type:'上班',timestamp:serverTimestamp(),clientClickedAt:Date.now(),status:'待覆核',source:'employee-punch',location:'定位未取得'});

for(const name of ['homego-system','mainmanagement']) {
  test(`${name}: unauthenticated root, sensitive reads and writes denied`,async()=>{
    for(const path of ['', 'employees','users','_security','directory']) await assertFails(get(ref(db(null,name),path || undefined)));
    await assertFails(set(ref(db(null,name),'employees/injected'),{roleCode:'CEO'}));
  });
  test(`${name}: sign-in alone and anonymous Auth never imply staff access`,async()=>{
    await assertFails(get(ref(db('outsider',name),'directory')));
    await assertFails(get(ref(db('a',name,{firebase:{sign_in_provider:'anonymous'}}),'directory')));
    await assertFails(get(ref(envs[name].authenticatedContext('a').database(),'directory')));
  });
  test(`${name}: enrolled active staff can read safe directory and own view`,async()=>{
    await assertSucceeds(get(ref(db('a',name),'directory')));
    await assertSucceeds(get(ref(db('a',name),'selfViews/a')));
    await assertFails(get(ref(db('a',name),'selfViews/b')));
  });
  test(`${name}: CEO cannot dump root, read credentials or rewrite ACL`,async()=>{
    for(const path of ['', 'users','_security','_security/principals/a']) await assertFails(get(ref(db('c',name),path || undefined)));
    await assertFails(update(ref(db('c',name),'_security/principals/a'),{role:'ceo'}));
    await assertFails(remove(ref(db('c',name))));
  });
  test(`${name}: client role, employee name and device ID cannot grant authority`,async()=>{
    await assertFails(get(ref(db('a',name,{role:'ceo',isAdmin:true,isCEO:true,employeeKey:'key-c'}),'employees')));
    await assertFails(get(ref(db('a',name,{hg_device:'d2'}),'directory')));
    await assertFails(get(ref(db('a',name,{hg_sid:'forged'}),'directory')));
  });
  for(const [label,path,value] of [
    ['account disabled','principals/a/active',false],
    ['session revoked','sessions/a/s1/active',false],
    ['session expired','sessions/a/s1/expiresAt',1],
    ['device revoked','devices/a/d1/active',false],
    ['token epoch revoked','principals/a/version',2],
    ['module not granted',`principals/a/modules/${name==='homego-system'?'hr':'erp'}`,false],
    ['unknown role','principals/a/role','owner'],
    ['missing version','principals/a/version',null],
    ['invalid version','principals/a/version','1']
  ]) test(`${name}: ${label} denies old token immediately on next read`,async()=>{
    await adminEdit(name,`_security/${path}`,value);
    await assertFails(get(ref(db('a',name),'directory')));
  });
  test(`${name}: no root multipath privilege escalation or parent deletion`,async()=>{
    await assertFails(update(ref(db('a',name)),{'_security/principals/a/role':'ceo','employees/key-a/roleCode':'CEO'}));
    await assertFails(remove(ref(db('c',name),'employees')));
  });
}
test('HR: archived/disabled/mismapped employees denied even with valid session',async()=>{
  for(const [field,value] of [['employmentStatus','archived'],['loginDisabled',true],['id',999]]) {
    await adminEdit('homego-system',`employees/key-a/${field}`,value);
    await assertFails(get(ref(db(),'directory')));
    await adminEdit('homego-system',`employees/key-a/${field}`,fixture.employees['key-a'][field] ?? null);
  }
});
test('ERP: old employee disabled denies access',async()=>{
  await adminEdit('mainmanagement','employees/key-a/isActive',false);
  await assertFails(get(ref(db('a','mainmanagement'),'directory')));
});
test('ERP: employee reads own profile; CEO reads collection; manager cannot list',async()=>{
  await assertSucceeds(get(ref(db('a','mainmanagement'),'employees/key-a')));
  await assertFails(get(ref(db('a','mainmanagement'),'employees/key-b')));
  await assertSucceeds(get(ref(db('c','mainmanagement'),'employees')));
  await assertFails(get(ref(db('m','mainmanagement'),'employees')));
  await assertFails(set(ref(db('c','mainmanagement'),'users/legacy/password'),'new'));
});
test('HR: private personnel and salary stay off employee/manager clients',async()=>{
  for(const uid of ['a','m']) for(const path of ['employees','employees/key-a','settings/salary']) await assertFails(get(ref(db(uid),path)));
  await assertSucceeds(get(ref(db('c'),'employees')));
  await assertSucceeds(get(ref(db('c'),'settings/salary')));
  await assertFails(update(ref(db(),'employees/key-a'),{hrRole:'ceo',approvalPermissions:{car:true},devices:['d2']}));
});
test('HR: own records readable; coworker records are denied',async()=>{
  for(const path of ['requests/a','attendance/a']) await assertSucceeds(get(ref(db(),path)));
  for(const path of ['requests/b','attendance/b']) await assertFails(get(ref(db(),path)));
});
test('HR: scoped and type-authorized manager reads request but not salary or all requests',async()=>{
  await assertSucceeds(get(ref(db('m'),'requests/a')));
  for(const path of ['requests/b','requests/annual','requests/car','requests/personal','requests','attendance/a']) await assertFails(get(ref(db('m'),path)));
  await assertSucceeds(get(ref(db('m'),'reviewQueues/m')));
  await assertFails(get(ref(db('a'),'reviewQueues/m')));
});
test('HR: granting/revoking a category changes access without a new token',async()=>{
  await adminEdit('homego-system','_security/principals/m/approvals/car',true);
  await assertSucceeds(get(ref(db('m'),'requests/car')));
  await adminEdit('homego-system','_security/principals/m/approvals/sick',false);
  await assertFails(get(ref(db('m'),'requests/a')));
});
test('HR: owner queries require exact ID type and a bounded limit',async()=>{
  const ownQuery=query(ref(db(),'requests'),orderByChild('empId'),equalTo(101),limitToLast(100));
  const value=(await assertSucceeds(get(ownQuery))).val();
  assert.ok(value.a);assert.equal(value.b,undefined);
  await assertFails(get(query(ref(db(),'requests'),orderByChild('empId'),equalTo('101'),limitToLast(100))));
  await assertFails(get(query(ref(db(),'requests'),orderByChild('empId'),equalTo(101))));
  await assertFails(get(query(ref(db(),'requests'),orderByChild('empId'),equalTo(101),limitToLast(501))));
  await assertSucceeds(get(query(ref(db('b'),'requests'),orderByChild('empId'),equalTo('B-202'),limitToLast(100))));
});
test('HR: self pending leave and car creation allowed with legacy IDs',async()=>{
  await assertSucceeds(set(ref(db(),'requests/newLeave'),leave()));
  await assertSucceeds(set(ref(db('b'),'requests/newStringId'),leave('B-202','Test B')));
  await assertSucceeds(set(ref(db(),'requests/newCar'),{empId:101,empName:'Test A',category:'car',type:'公務車',date:'2026-10-22',time:'09:00',location:'test',status:'pending',timestamp:Date.now()}));
});
for(const [label,change] of [
  ['another employee',{empId:'B-202',empName:'Test B'}],['forged name',{empName:'Test CEO'}],
  ['self approval',{status:'approved'}],['extra approval',{approvedById:'c'}],['oversized reason',{reason:'x'.repeat(2001)}],
  ['zero days',{days:0}],['missing reason',{reason:null}],['negative days',{days:-1}],['future timestamp',{timestamp:now+86400000}],['wrong category',{category:'payroll'}]
]) test(`HR: reject new request with ${label}`,async()=>{await assertFails(set(ref(db(),'requests/bad'),{...leave(),...change}));});
test('HR: existing request cannot change owner, approve, overwrite or delete from any client',async()=>{
  for(const uid of ['a','m','c']) {
    await assertFails(update(ref(db(uid),'requests/a'),{status:'approved',empId:404}));
    await assertFails(remove(ref(db(uid),'requests/a')));
    await assertFails(set(ref(db(uid),'requests'),{}));
  }
});
test('HR: attendance can only be appended as own server-timed unreviewed record',async()=>{
  await assertSucceeds(set(ref(db(),'attendance/new'),punch()));
  await assertFails(set(ref(db(),'attendance/forged'),{...punch(),empId:'B-202'}));
  await assertFails(set(ref(db(),'attendance/normal'),{...punch(),status:'正常'}));
  await assertFails(set(ref(db(),'attendance/backdated'),{...punch(),timestamp:1}));
  await assertFails(set(ref(db(),'attendance/extra'),{...punch(),approvedById:'c'}));
  await assertFails(update(ref(db(),'attendance/new'),{location:'changed'}));
  await assertFails(remove(ref(db('c'),'attendance/new')));
});
test('HR: atomic multipath write with valid submission and forged ACL rolls back completely',async()=>{
  await assertFails(update(ref(db()),{'requests/atomic':leave(),'_security/principals/a/role':'ceo'}));
  await envs['homego-system'].withSecurityRulesDisabled(async ctx=>assert.equal((await get(ref(ctx.database(),'requests/atomic'))).exists(),false));
});
test('HR: unknown collections and all client backups/restores denied',async()=>{
  await assertFails(set(ref(db('c'),'backups/full'),{employees:{}}));
  await assertFails(get(ref(db('c'),'unknown')));
  await assertFails(set(ref(db('c')),{employees:{}}));
});
