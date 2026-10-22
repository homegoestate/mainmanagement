// Deliberately does NOT deploy. Emits reviewable CLI config only after all gates.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const readiness = JSON.parse(readFileSync(new URL('../readiness.json',import.meta.url),'utf8'));
const required=['liveRulesExportedAndReviewed','backupRestoreRehearsed','existingAuthUidMappingVerified','trustedLoginBridgeDeployedAndTested','deviceProofAndRevocationVerified','leastPrivilegeAclBootstrappedPrivately','rootListenersAndBulkTransactionsReplaced','privilegedBackendAndAuditValidated','allEmployeeAndCeoWorkflowsAccepted','oldClientsAndServiceWorkersHandled','productionChangeExplicitlyApproved'];
const missing=required.filter(k=>readiness.checks?.[k]!==true);
if(readiness.productionReady!==true || missing.length) {
  console.error(`NOT READY. No configuration produced, no production action. Outstanding: ${missing.join(', ')}`);
  process.exit(2);
}
const folder=new URL('../private/deployment/',import.meta.url);mkdirSync(folder,{recursive:true,mode:0o700});
for(const [project,instance,rules] of [
  ['homego-system','homego-system-default-rtdb','homego-system'],
  ['mainmanagement-1f3d2','mainmanagement-1f3d2-default-rtdb','mainmanagement']
]) {
 const config={database:[{instance,rules:`../../rules/${rules}.candidate.rules.json`}]};
 writeFileSync(new URL(`${project}.json`,folder),JSON.stringify(config,null,2)+'\n',{mode:0o600});
 console.log(`Review generated config for ${project}. From security/rtdb, after approval: npx firebase deploy --only database --project ${project} --config private/deployment/${project}.json`);
}
