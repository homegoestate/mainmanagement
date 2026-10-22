import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const here=path.dirname(fileURLToPath(import.meta.url)),args=process.argv.slice(2);
if(args.length!==2||!['--check','--apply'].includes(args[0]))throw Error('Usage: node apply-review.mjs --check|--apply /absolute/path/to/original/backend');
const targetRoot=fs.realpathSync(args[1]),base=fs.realpathSync(path.join(targetRoot,'application/reused-runtime/base'));
if(!base.startsWith(targetRoot+path.sep))throw Error('Target escapes backend root');
const manifest=JSON.parse(fs.readFileSync(path.join(here,'source-hashes.json'),'utf8'));
const hash=b=>createHash('sha256').update(b).digest('hex');
const writes=[];
for(const[name,expected]of Object.entries(manifest.requiredOriginalSha256)){
 const target=path.join(base,name),source=path.join(here,name);
 if(fs.lstatSync(target).isSymbolicLink())throw Error('Refuse symbolic-link target');
 const current=hash(fs.readFileSync(target)),updated=hash(fs.readFileSync(source));
 if(current!==expected&&current!==updated)throw Error('Source mismatch; refusing to overwrite '+name);
 if(manifest.applyFiles.includes(name)&&current!==updated)writes.push([target,fs.readFileSync(source)]);
}
// Validate every input before the first local write. Never touches private,
// host settings, credentials, activation flags, SQL or live rules.
if(args[0]==='--apply')for(const[target,content]of writes)fs.writeFileSync(target,content);
console.log(JSON.stringify({mode:args[0],files:writes.map(([p])=>path.basename(p)),cloudWrites:0,productionActivated:false}));
