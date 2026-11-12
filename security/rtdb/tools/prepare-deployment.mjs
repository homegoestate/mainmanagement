// Retired profile: these Rules use _security/client tokens, NOT the selected
// _sso/native Worker. Even all old gates being true cannot make them compatible.
// Never emit a runnable config for this incompatible deployment profile.
import {readFileSync} from 'node:fs';
let readiness;
try {
  readiness = JSON.parse(readFileSync(new URL('../readiness.json',import.meta.url),'utf8'));
} catch {
  console.error('NOT READY. Readiness evidence is missing or invalid. No configuration produced, no production action.');
  process.exit(2);
}
const required=['liveRulesExportedAndReviewed','backupRestoreRehearsed','existingAuthUidMappingVerified','trustedLoginBridgeDeployedAndTested','deviceProofAndRevocationVerified','leastPrivilegeAclBootstrappedPrivately','rootListenersAndBulkTransactionsReplaced','privilegedBackendAndAuditValidated','allEmployeeAndCeoWorkflowsAccepted','oldClientsAndServiceWorkersHandled','productionChangeExplicitlyApproved'];
const missing=required.filter(k=>readiness?.checks?.[k]!==true);
if(readiness?.productionReady!==true || missing.length) {
  console.error(`NOT READY. Outstanding evidence: ${missing.join(', ') || 'productionReady'}.`);
}
console.error('NOT READY. RETIRED DEPLOYMENT PROFILE: rules/*.candidate.rules.json use the earlier _security/client-token contract and cannot be deployed to the selected _sso/native Worker.');
console.error('No configuration produced, no production action. See native-worker/README.md and STATUS-20261103.md for the original Worker cutover; do not bypass this guard or reuse previously generated configs.');
process.exit(2);
