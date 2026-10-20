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
  frag=self.s[self.s.index('const firebaseConfig = {'):self.s.index('const DASHBOARD_ITEMS = [')]
  self.assertEqual(hashlib.sha256(frag.encode()).hexdigest(),'2cb8b79df5bf747cb574897d5b6bdc6ac7a42fb3c233bf50b16a14a395cc4890')
 def test_existing_brand_styling_exact(self):
  frag=self.s[self.s.index('<style>'):self.s.index('</style>')+len('</style>')]
  self.assertEqual(hashlib.sha256(frag.encode()).hexdigest(),'18b674d7387b14a8acec8921eae227eb2ce38d9ad9b4d55dbec1c7292f934d72')
 def test_do_not_seed_or_resurrect_employees(self):
  self.assertNotIn('await seedDefaultEmployees();',self.s)
  frag=self.s[self.s.index('async function getEmployee(name)'):self.s.index('async function resolveLoginIdentity(',self.s.index('async function getEmployee(name)'))]
  self.assertNotIn('await set(',frag)
  self.assertIn('Never recreate a missing or archived staff row',frag)
 def test_preserve_employee_and_user_unmodeled_fields(self):
  frag=self.s[self.s.index('async function saveEmployee()'):self.s.index('window.editEmployee',self.s.index('async function saveEmployee()'))]
  self.assertIn('await update(ref(db, "employees/" + safeKey(name)), rec)',frag)
  self.assertIn('await update(uref, { password: pass',frag)
  self.assertNotIn('await set(uref',frag)
 def test_no_hard_delete_in_former_employee_actions(self):
  frag=self.s[self.s.index('window.deactivateEmployee ='):self.s.index('window.clearDevices =')]
  self.assertNotIn('await remove(',frag)
  self.assertIn('setActiveEmployee(name, false)',frag)
  self.assertIn('封存說明',self.s)
 def test_fail_closed_if_login_audit_cannot_be_written(self):
  frag=self.s[self.s.index('async function login()'):self.s.index('async function adminLogin()')]
  self.assertIn('登入紀錄寫入遭拒，尚未完成登入',frag)
  self.assertIn('legacyPortalDisabled',frag)
  self.assertIn('showLoginFeedback(err)',frag)
  self.assertIn('login-feedback',self.s)
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
  self.assertEqual(self.s[self.s.index('const DASHBOARD_ITEMS = ['):self.s.index('let currentSession =')].count('module: '),8)
 def test_unknown_baseline_refused(self):
  with self.assertRaises(ValueError):
   p.patch_bytes(b'<html>unexpected</html>')
 def test_idempotent_news_patch(self):
  raw=(ROOT/'index.html').read_bytes()
  self.assertEqual(p.patch_bytes(raw),raw)

if __name__=='__main__':
 unittest.main()
