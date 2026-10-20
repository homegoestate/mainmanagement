import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

// Contract from user's exact 2026-10-20 original ERP index.html,
// SHA256 8da37f7a69e0da03b446f5727511286d8e73e388cc2378d680253c487a69cbd0.
// Only feature identifiers and public module URLs are retained; no credentials.
const s=readFileSync(new URL("../index.html", import.meta.url),"utf8").replace(/\r\n/g,"\n");
const ids="admin-auth-form admin-link admin-panel admin-pass-input auth-section btnAdminLogin btnBackHome btnLogin btnMakeCode btnOpenExternal btnOpenNews btnRefreshSession btnRegister btnResetPassword btnSaveEmployee btnSendSession content-frame dashboard-grid-view dashboard-section display-code display-role display-username emp-name emp-note emp-onboard emp-pass emp-role employee-table-body generated-code-area grid-cards-container grid-username home-link iframeToolbar keep-login loading-overlay loadingText login-form login-pass login-user newsDontShowToday newsModal newsModalBody newsSourceLink newsTickerInner portal-startup-error portal-startup-notice portal-startup-retry reg-code reg-pass reg-user register-form reset-code reset-form reset-pass reset-pass2 reset-user sessionSummary sidebar sidebar-nav-links user-table-body".split(" ");
const modules=[
["employee","https://homegoestate.github.io/Employee-management/"],
["case","https://homegoestate.github.io/case/"],
["receipts","https://homegoestate.github.io/receipts/"],
["quotation","https://homegoestate.github.io/quotation/"],
["ai","https://homegoestate.github.io/AI-question-assistant/"],
["land","https://yangceo-taiwan.github.io/Land-efficiency-assessment/"],
["inherit","https://homegoestate.github.io/inherit/"],
["bank","https://homegoestate.github.io/Bank-choice/"]];
test("preserve all 60 original ERP interface IDs",()=>{
 const current=new Set([...s.matchAll(/\bid=["']([^"']+)["']/g)].map(x=>x[1]));
 assert.equal(ids.length,60);
 for(const id of ids)assert.ok(current.has(id),"Original control missing: "+id);
});
test("preserve the user's exact navy and gold interface CSS",()=>{
 const css=s.slice(s.indexOf("<style>"),s.indexOf("</style>")+"</style>".length);
 assert.equal(createHash("sha256").update(css).digest("hex"),"18b674d7387b14a8acec8921eae227eb2ce38d9ad9b4d55dbec1c7292f934d72");
});
test("preserve all eight original module addresses",()=>{
 const start=s.indexOf("const DASHBOARD_ITEMS = ["),end=s.indexOf("];",start);
 assert.ok(start>=0&&end>start);
 const body=s.slice(start,end);
 assert.equal([...body.matchAll(/module: "/g)].length,8);
 for(const [name,url] of modules){assert.ok(body.includes('module: "'+name+'"'));assert.ok(body.includes(url),"Missing "+url);}
});
test("preserve all original staff and CEO management controls",()=>{
 const symbols=["function login(","function register(","function resetPasswordWithCode(","function adminLogin(",
 "function enterDashboard(","function renderDashboardUI(","function renderEmployeeTable(",
 "function renderUsersTable(","function subscribeAdminData(","function saveEmployee(",
 "window.editEmployee =","window.showCodeFor =","function setActiveEmployee(",
 "window.deactivateEmployee =","window.reactivateEmployee =","window.hardDeleteEmployee =",
 "window.deleteLoginUser =","window.clearDevices =","function makeCodeFromForm(",
 "window.loadPage =","window.showAdminPanel =","function restoreSession(","window.logout ="];
 for(const sym of symbols)assert.ok(s.includes(sym),"Missing handler: "+sym);
});
test("retain latest working news link and its in-portal view",()=>{
 assert.match(s,/id="btnOpenNews"\s+href="\.\/news\.html/);
 assert.match(s,/id="btnOpenNewsInline"/);
 assert.match(s,/portal-news\.mjs/);
 assert.match(s,/id="newsModalBody"/);
});
test("do not reintroduce automatic staff seeding or destructive deletion",()=>{
 assert.doesNotMatch(s,/await seedDefaultEmployees\(\);/);
 const block=s.slice(s.indexOf("window.deactivateEmployee ="),s.indexOf("window.clearDevices ="));
 assert.doesNotMatch(block,/await remove\(/);
 assert.match(s,/update\(ref\(db, "employees\/" \+ safeKey\(name\)\), rec\)/);
});
test("retain origin and source validation of module events",()=>{
 assert.match(s,/event\.source !== \$\("content-frame"\)\.contentWindow/);
 assert.match(s,/event\.origin !== new URL\(currentFrameItem\.url, location\.href\)\.origin/);
 assert.doesNotMatch(s,/postMessage\(payload, "\*"\)/);
});
