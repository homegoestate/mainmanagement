// Review candidates only. No deployment code, real credentials or production reads.
import {readFileSync, writeFileSync} from 'node:fs';
const principal = "root.child('_security/principals').child(auth.uid)";
const session = "root.child('_security/sessions').child(auth.uid).child(auth.token.hg_sid)";
const device = "root.child('_security/devices').child(auth.uid).child(auth.token.hg_device)";
const p = field => `${principal}.child('${field}').val()`;
const shared = `auth != null && auth.token.firebase.sign_in_provider != 'anonymous' && auth.token.hg_sid != null && auth.token.hg_device != null && auth.token.hg_sid.matches(/^[a-zA-Z0-9_-]{1,128}$/) && auth.token.hg_device.matches(/^[a-zA-Z0-9_-]{1,128}$/) && ${principal}.child('version').isNumber() && ${p('version')} > 0 && ${principal}.child('employeeKey').isString() && ${p('active')} === true && (${p('role')} === 'staff' || ${p('role')} === 'manager' || ${p('role')} === 'ceo') && ${session}.child('active').val() === true && ${session}.child('expiresAt').val() > now && ${session}.child('version').val() === ${p('version')} && ${session}.child('deviceId').val() === auth.token.hg_device && ${device}.child('active').val() === true`;
const ceo = `${p('role')} === 'ceo'`;
const employee = `root.child('employees').child(${p('employeeKey')})`;
const hr = `${shared} && ${p('modules/hr')} === true && ${employee}.exists() && ${employee}.child('id').val() === ${p('employeeId')} && ${employee}.child('employmentStatus').val() != 'archived' && ${employee}.child('loginDisabled').val() != true`;
const erp = `${shared} && ${p('modules/erp')} === true && ${employee}.exists() && ${employee}.child('isActive').val() != false`;
const own = `data.child('empId').val() === ${p('employeeId')}`;
const categoryPermission = `(data.child('category').val() === 'car' && data.child('type').val() === '公務車' && ${p('approvals/car')} === true) || (data.child('category').val() === 'leave' && data.child('type').val() === '病假' && ${p('approvals/sick')} === true) || (data.child('category').val() === 'leave' && data.child('type').val() === '事假' && ${p('approvals/personal')} === true)`;
const managerRequest = `${p('role')} === 'manager' && !(${own}) && root.child('_security/requestScopes').child(auth.uid).child($id).val() === true && (${categoryPermission})`;
const collectionRead = `${hr} && ((${ceo}) || (query.orderByChild === 'empId' && query.equalTo === ${p('employeeId')} && query.limitToLast != null && query.limitToLast <= 500))`;
const string = max => ({'.validate': `newData.isString() && newData.val().length <= ${max}`});
const requiredString = max => ({'.validate': `newData.isString() && newData.val().length > 0 && newData.val().length <= ${max}`});
const time = {'.validate': 'newData.isNumber() && newData.val() > 0 && newData.val() <= now + 60000'};
const date = {'.validate': "newData.isString() && newData.val().matches(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/)"};
const base = () => ({'.read': false, '.write': false, _security: {'.read':false,'.write':false}, users:{'.read':false,'.write':false}});
const homego = base();
homego.employees = {'.read': `${hr} && (${ceo})`};
homego.selfViews = {'$uid': {'.read': `${hr} && $uid === auth.uid`}};
homego.directory = {'.read': hr};
homego.reviewQueues = {'$uid': {'.read': `${hr} && $uid === auth.uid && (${p('role')} === 'manager' || ${ceo})`}};
homego.settings = {salary:{'.read':`${hr} && (${ceo})`}};
homego.bulletin = {'.read':hr};
homego.requests = {'.indexOn':['empId'], '.read':collectionRead, '$id':{
  '.read':`${hr} && ((${own}) || (${ceo}) || (${managerRequest}))`,
  '.write':`${hr} && !data.exists() && newData.exists() && newData.child('empId').val() === ${p('employeeId')}`,
  '.validate':"newData.hasChildren(['empId','empName','category','type','date','status','timestamp']) && ((newData.child('category').val() === 'leave' && newData.hasChildren(['endDate','days','reason'])) || (newData.child('category').val() === 'car' && newData.child('type').val() === '公務車' && newData.hasChildren(['time','location'])))",
  empId:{'.validate':`newData.val() === ${p('employeeId')}`},
  empName:{'.validate':`newData.isString() && newData.val() === ${employee}.child('name').val()`},
  category:{'.validate':"newData.val() === 'leave' || newData.val() === 'car'"},
  type:requiredString(40), date, endDate:date,
  // Preserve the old UI's string days/hours without trusting them for approval.
  days:{'.validate':"(newData.isNumber() && newData.val() > 0 && newData.val() <= 366) || (newData.isString() && newData.val().length <= 8 && newData.val().matches(/^[0-9]+([.][0-9]+)?$/) && newData.val() != '0')"},
  reason:requiredString(2000), time:string(80), hours:string(8), location:string(1000),
  status:{'.validate':"newData.val() === 'pending'"}, timestamp:time,
  '$other':{'.validate':false}
}};
homego.attendance = {'.indexOn':['empId'],'.read':collectionRead,'$id':{
  '.read':`${hr} && ((${own}) || (${ceo}))`,
  '.write':`${hr} && !data.exists() && newData.exists() && newData.child('empId').val() === ${p('employeeId')}`,
  '.validate':"newData.hasChildren(['empId','empName','type','timestamp','clientClickedAt','status','source','location'])",
  empId:{'.validate':`newData.val() === ${p('employeeId')}`},
  empName:{'.validate':`newData.isString() && newData.val() === ${employee}.child('name').val()`},
  type:{'.validate':"newData.val() === '上班' || newData.val() === '下班'"},
  timestamp:{'.validate':'newData.isNumber() && newData.val() === now'},
  clientClickedAt:time,dateStr:string(40),timeStr:string(40), location:string(160),
  gpsAccuracyMeters:{'.validate':'newData.isNumber() && newData.val() >= 0 && newData.val() <= 100000'},
  gpsIssue:string(300),reviewReason:string(2000),
  // Server decides normal/late/overtime, never trust a client-supplied verdict.
  status:{'.validate':"newData.val() === '待覆核'"},
  source:{'.validate':"newData.val() === 'employee-punch'"},'$other':{'.validate':false}
}};
const main = base();
main.employees = {'.read':`${erp} && (${ceo})`,'$key':{'.read':`${erp} && $key === ${p('employeeKey')}`}};
main.directory = {'.read':erp};
main.selfViews = {'$uid':{'.read':`${erp} && $uid === auth.uid`}};
main.adminViews = {'.read':`${erp} && (${ceo})`};
// All privileged mutations go through an authenticated, audited domain service.
// Do not grant parent writes: they override descendant denies, including deletions.
for (const [name,rules] of [['homego-system',homego],['mainmanagement',main]]) {
  const url = new URL(`../rules/${name}.candidate.rules.json`,import.meta.url);
  const content = JSON.stringify({rules},null,2)+'\n';
  if(process.argv.includes('--check')) {
    if(readFileSync(url,'utf8')!==content) throw Error(`${name} generated rules differ`);
  } else writeFileSync(url,content);
}
