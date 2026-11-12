import test from 'node:test';import assert from 'node:assert/strict';
import {createSessionBridge} from '../client/session-bridge.mjs';
const projects=['mainmanagement-1f3d2','homego-system'];
function fixture({failure,grantPatch={},badClaim=false,proof=true}={}) {
 const calls=[],apps=Object.fromEntries(projects.map(p=>[p,{project:p,currentUser:p===projects[0]?{uid:'original',isAnonymous:false}:null}]));
 const grant={sessionId:'s1',expiresAt:Date.now()+300000,projects:Object.fromEntries(projects.map((p,i)=>[p,{uid:'u'+i,customToken:'fake-'+i}])),...grantPatch};
 const sdk={inMemoryPersistence:'memory',getIdToken:async()=>{calls.push('token');return 'synthetic-id-token';},setPersistence:async(a,p)=>calls.push('persistence:'+a.project+':'+p),
  async signInWithCustomToken(a,token){calls.push('signin:'+a.project);if(failure===a.project)throw Error('sign-in failed');a.currentUser={uid:grant.projects[a.project].uid};return {user:{...a.currentUser,project:a.project}};},
  getIdTokenResult:async u=>({claims:{aud:badClaim?'wrong-project':u.project,hg_sid:'s1',hg_device:'d1'}}),
  signOut:async a=>{calls.push('signout:'+a.project);a.currentUser=null;}};
 const bridge=createSessionBridge({sdk,authByProject:apps,endpoint:'https://company.example.test/session',allowedOrigin:'https://company.example.test',
  verifyDevice:async()=>proof?{deviceId:'d1',assertion:{response:'synthetic-device-proof'}}:null,
  revokeGrant:async id=>calls.push('revoke:'+id),
  fetchImpl:async(url,options)=>{calls.push(['request',url,options]);return {ok:true,json:async()=>grant};}});
 return {bridge,calls,apps,sdk};
}
test('bridge signs in both separate projects, uses memory persistence, never returns tokens',async()=>{
 const f=fixture(),session=await f.bridge.start();
 assert.deepEqual(Object.keys(session).sort(),['deviceId','expiresAt','sessionId']);
 assert.equal(f.calls.filter(x=>typeof x==='string'&&x.startsWith('signin:')).length,2);
 assert.equal(f.calls.filter(x=>typeof x==='string'&&x.startsWith('persistence:')&&x.endsWith(':memory')).length,2);
 const request=f.calls.find(x=>Array.isArray(x));
 assert.equal(request[2].redirect,'error');assert.equal(request[2].cache,'no-store');assert.equal(request[2].credentials,'omit');
 assert.equal(request[2].headers.Authorization,'Bearer synthetic-id-token');assert.equal(JSON.stringify(session).includes('token'),false);
});
test('duplicate clicks share one in-flight exchange',async()=>{const f=fixture();const a=f.bridge.start(),b=f.bridge.start();assert.equal(a,b);await a;assert.equal(f.calls.filter(x=>Array.isArray(x)).length,1);});
test('failure of the second app revokes issued grant and signs both apps out',async()=>{
 const f=fixture({failure:'homego-system'});await assert.rejects(f.bridge.start());
 assert.ok(f.calls.includes('revoke:s1'));for(const p of projects)assert.equal(f.apps[p].currentUser,null);assert.equal(f.bridge.current(),null);
});
test('project/claim mismatch fails closed',async()=>{const f=fixture({badClaim:true});await assert.rejects(f.bridge.start());assert.equal(f.bridge.current(),null);assert.ok(f.calls.includes('revoke:s1'));});
test('DID without cryptographic assertion is refused before the service request',async()=>{
 const f=fixture({proof:false});await assert.rejects(f.bridge.start());assert.equal(f.calls.some(x=>Array.isArray(x)),false);
});
test('anonymous sign-in never exchanges tokens',async()=>{const f=fixture();f.apps[projects[0]].currentUser.isAnonymous=true;await assert.rejects(f.bridge.start());assert.equal(f.calls.some(x=>Array.isArray(x)),false);});
test('missing or excessive-life server grant is refused',async()=>{
 for(const patch of [{projects:{}},{sessionId:'bad/key'},{expiresAt:1},{expiresAt:Date.now()+7200000}]) {const f=fixture({grantPatch:patch});await assert.rejects(f.bridge.start());assert.equal(f.bridge.current(),null);}
});
test('logout revokes server grant before local sign-out',async()=>{
 const f=fixture();await f.bridge.start();await f.bridge.signOut();
 assert.ok(f.calls.indexOf('revoke:s1')<f.calls.indexOf('signout:'+projects[0]));assert.equal(f.bridge.current(),null);
});
test('endpoint must have approved HTTPS origin with no query or credentials',()=>{
 for(const endpoint of ['http://company.example.test/session','https://evil.invalid/session','https://user:secret@company.example.test/session','https://company.example.test/session?token=x'])
 assert.throws(()=>createSessionBridge({sdk:{},authByProject:{},endpoint,allowedOrigin:'https://company.example.test',verifyDevice:async()=>{},revokeGrant:async()=>{}}));
});
