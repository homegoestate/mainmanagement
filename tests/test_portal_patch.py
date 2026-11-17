import hashlib
import importlib.util
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('patch',ROOT/'tools/integrate_portal.py')
p=importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)

class PortalTests(unittest.TestCase):
 def setUp(self):
  self.s=(ROOT/'index.html').read_text(encoding='utf-8')
 def test_original_firebase_configuration_and_role_metadata_unchanged(self):
  # Re-baselined 2026-11-17 (Claude) after reviewing the 2026-11-12 Firebase Authentication change:
  # same mainmanagement project config, plus getAuth, a localhost-only emulator switch, authReady and currentAccess;
  # role metadata, default employees and alias map unchanged.
  frag=self.s[self.s.index('const firebaseConfig = {'):self.s.index('const DASHBOARD_ITEMS = [')]
  self.assertEqual(hashlib.sha256(frag.encode()).hexdigest(),'6b5a680a057918a308b394b47552c4404475f5094a0e6afab49c59eb8e2d7e2f')
  self.assertIn('projectId: "mainmanagement-1f3d2"',frag)
  self.assertIn('["localhost", "127.0.0.1"].includes(location.hostname)',frag)
 def test_existing_brand_styling_exact(self):
  frag=self.s[self.s.index('<style>'):self.s.index('</style>')+len('</style>')]
  self.assertEqual(hashlib.sha256(frag.encode()).hexdigest(),'18b674d7387b14a8acec8921eae227eb2ce38d9ad9b4d55dbec1c7292f934d72')
 def test_do_not_seed_or_resurrect_employees(self):
  self.assertNotIn('await seedDefaultEmployees();',self.s)
  frag=self.s[self.s.index('async function getEmployee(name)'):self.s.index('async function resolveLoginIdentity(',self.s.index('async function getEmployee(name)'))]
  self.assertNotIn('await set(',frag)
  self.assertIn('Never recreate a missing or archived staff row',frag)
 def test_preserve_employee_and_user_unmodeled_fields(self):
  # Since 2026-11-12 passwords live only in Firebase Authentication; saving staff never writes one.
  frag=self.s[self.s.index('async function saveEmployee()'):self.s.index('window.editEmployee',self.s.index('async function saveEmployee()'))]
  self.assertIn('await update(ref(db, "employees/" + safeKey(name)), rec)',frag)
  self.assertNotIn('password',frag)
  self.assertNotIn('await set(',frag)
 def test_no_hard_delete_in_former_employee_actions(self):
  start=self.s.index('window.deactivateEmployee =')
  frag=self.s[start:self.s.index('// ---- Account administration',start)]
  self.assertNotIn('await remove(',frag)
  self.assertIn('setActiveEmployee(name, false)',frag)
  self.assertIn('封存說明',self.s)
 def test_login_requires_firebase_auth_access_and_signs_out_on_failure(self):
  # Replaces the retired legacy-audit test (2026-11-17, Claude): the gate is now Firebase Auth + access/<uid>.
  frag=self.s[self.s.index('async function login()'):self.s.index('function enterDashboard(')]
  self.assertIn('await signInWithEmailAndPassword(auth, email, pass)',frag)
  self.assertIn('await signOut(auth).catch(() => {});',frag)
  self.assertIn('login-feedback',frag)
  access=self.s[self.s.index('async function loadAccess(user)'):self.s.index('async function completeSignedInSession(')]
  self.assertIn('access.active !== true',access)
  complete=self.s[self.s.index('async function completeSignedInSession('):self.s.index('function friendlyAuthError(')]
  self.assertIn('currentAccess = await loadAccess(user);',complete)
  self.assertNotIn('password',complete)
 def test_cancel_stale_module_callbacks(self):
  self.assertIn('portalNavigationSequence',self.s)
  self.assertIn('navigationSequence !== portalNavigationSequence',self.s)
  self.assertIn('event.source !== $("content-frame").contentWindow',self.s)
  self.assertIn('event.origin !== new URL(currentFrameItem.url, location.href).origin',self.s)
  self.assertNotIn('postMessage(payload, "*")',self.s)
 def test_news_and_existing_modules_still_present(self):
  self.assertIn('// HG_PUBLIC_NEWS_BRIDGE_20261020',self.s)
  self.assertIn('./portal-news.mjs?v=20261020.1',self.s)
  self.assertNotIn('api.allorigins.win',self.s)
  self.assertNotIn('rss2json.com',self.s)
  self.assertEqual(self.s[self.s.index('const DASHBOARD_ITEMS = ['):self.s.index('let currentSession =')].count('module: '),9)
 def test_unknown_baseline_refused(self):
  with self.assertRaises(ValueError):
   p.patch_bytes(b'<html>unexpected</html>')
 def test_idempotent_news_patch(self):
  raw=(ROOT/'index.html').read_bytes()
  self.assertEqual(p.patch_bytes(raw),raw)

if __name__=='__main__':
 unittest.main()
