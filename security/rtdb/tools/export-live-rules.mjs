// Authenticated GET of Rules ONLY. Never downloads business data or changes Rules.
// Requires a locally authenticated gcloud account with the appropriate IAM permission.
import {execFileSync} from 'node:child_process';
import {mkdirSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const databases = ['homego-system-default-rtdb','mainmanagement-1f3d2-default-rtdb'];
const token = execFileSync('gcloud',['auth','print-access-token'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
if(!token) throw Error('No authenticated Google OAuth access token; no request sent.');
const folder = new URL(`../private/rules-${Date.now()}/`,import.meta.url);
mkdirSync(folder,{recursive:true,mode:0o700});
const manifest = {capturedAt:new Date().toISOString(),method:'authenticated Rules GET only',databases:[]};
for(const database of databases) {
  const response = await fetch(`https://${database}.firebaseio.com/.settings/rules.json`,{
    headers:{Authorization:`Bearer ${token}`},redirect:'error',signal:AbortSignal.timeout(20000)
  });
  if(!response.ok) throw Error(`${database}: Rules GET returned HTTP ${response.status}; do not infer data exposure from this response.`);
  const content=await response.text();
  // Rules may contain comments. Preserve exact bytes for rollback/diff.
  if(!content.includes('"rules"')) throw Error(`${database}: unexpected response; stop and inspect securely.`);
  const file=`${database}.rules.json`;
  writeFileSync(new URL(file,folder),content,{mode:0o600,flag:'wx'});
  manifest.databases.push({database,file,sha256:createHash('sha256').update(content).digest('hex')});
}
writeFileSync(new URL('manifest.json',folder),JSON.stringify(manifest,null,2)+'\n',{mode:0o600,flag:'wx'});
console.log('Exported only Rules for both databases to the ignored private directory. No business data read, no Rules changed.');
