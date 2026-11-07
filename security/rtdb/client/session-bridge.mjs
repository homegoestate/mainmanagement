// SDK-injected client adapter; not yet wired into the published legacy HTML.
// `sdk` must be the real Firebase Auth SDK in production.
// The trusted endpoint must verify Auth (including revocation), fresh ACL,
// cryptographic device proof and cross-project UID mapping before issuing tokens.
const projects=['mainmanagement-1f3d2','homego-system'];
const validKey=s=>typeof s==='string' && /^[A-Za-z0-9_-]{1,128}$/.test(s);
export function createSessionBridge({sdk,authByProject,endpoint,allowedOrigin,fetchImpl=fetch,verifyDevice,revokeGrant}) {
  const url=new URL(endpoint);
  if(url.protocol!=='https:' || url.origin!==allowedOrigin || url.username || url.password || url.search || url.hash) throw Error('Unapproved session service URL');
  if(typeof revokeGrant!=='function' || typeof verifyDevice!=='function' || projects.some(p=>!authByProject?.[p])) throw Error('Missing Auth app or device proof provider');
  let pending=null, established=null, issued=null;
  const clear=async()=>{
    const grant=issued || established;
    let revokeFailed=false;
    if(grant) {try {await revokeGrant(grant.sessionId);} catch {revokeFailed=true;}}
    established=null; issued=null;
    const results=await Promise.allSettled(projects.map(p=>sdk.signOut(authByProject[p])));
    if(revokeFailed || results.some(r=>r.status==='rejected')) throw Error('Could not sign out every Firebase app; reload before continuing');
  };
  async function exchange() {
    const primary=authByProject[projects[0]], user=primary.currentUser;
    if(!user || user.isAnonymous) throw Error('Verified company login is required');
    const proof=await verifyDevice(); // A DID alone is never accepted as proof.
    if(!proof || !validKey(proof.deviceId) || typeof proof.assertion!=='object' || !proof.assertion) throw Error('Device proof is required');
    const token=await sdk.getIdToken(user,true);
    const response=await fetchImpl(url.href,{method:'POST',redirect:'error',cache:'no-store',credentials:'omit',
      headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
      body:JSON.stringify({deviceId:proof.deviceId,assertion:proof.assertion}),signal:AbortSignal.timeout(15000)});
    if(!response.ok) throw Error('Company authorization was not granted');
    const grant=await response.json();
    if(!validKey(grant.sessionId) || !Number.isFinite(grant.expiresAt) || grant.expiresAt<=Date.now() || grant.expiresAt>Date.now()+3600000 ||
      projects.some(p=>typeof grant.projects?.[p]?.customToken!=='string' || !grant.projects[p].customToken || typeof grant.projects[p].uid!=='string' || !grant.projects[p].uid)) throw Error('Invalid company grant');
    issued=Object.freeze({sessionId:grant.sessionId,deviceId:proof.deviceId,expiresAt:grant.expiresAt});
    for(const project of projects) {
        const auth=authByProject[project];
        await sdk.setPersistence(auth,sdk.inMemoryPersistence);
        const credential=await sdk.signInWithCustomToken(auth,grant.projects[project].customToken);
        const result=await sdk.getIdTokenResult(credential.user,true);
        if(credential.user.uid!==grant.projects[project].uid || result.claims.aud!==project ||
          result.claims.hg_sid!==grant.sessionId || result.claims.hg_device!==proof.deviceId) throw Error('Firebase project or session mismatch');
      }
      established=issued;
      return established; // No tokens returned to UI/sessionStorage/postMessage.
  }
  return Object.freeze({
    start(){if(pending)return pending;pending=exchange().catch(async error=>{await clear();throw error;}).finally(()=>{pending=null;});return pending;},
    current(){return established && established.expiresAt>Date.now()?established:null;},
    signOut:clear
  });
}
