import hashlib
import importlib.util
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('patch',ROOT/'tools/integrate_portal.py')
p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
CHECKS=[('const firebaseConfig = {','const DASHBOARD_ITEMS = [','const DASHBOARD_ITEMS = [','2cb8b79df5bf747cb574897d5b6bdc6ac7a42fb3c233bf50b16a14a395cc4890'),('async function getEmployee(name)','function enterDashboard(','function enterDashboard(','659a8c66dbe5ae6405071b61a69e8c7639de2b945318df2562a73c2c57653aa1'),('async function saveEmployee()','function normalizeNewsTitle(text) {','// HG_PUBLIC_NEWS_BRIDGE_20261020','59639d3481c11759fefd6c9c55edb41e7f5fef6220b8b744f9fb0acb75b84c7a')]
class PortalTests(unittest.TestCase):
 def test_sensitive_sections_unchanged(self):
  s=(ROOT/'index.html').read_text(encoding='utf-8')
  for start,end,newend,digest in CHECKS:
   stop=end if end in s else newend
   self.assertEqual(hashlib.sha256(s[s.index(start):s.index(stop)].encode()).hexdigest(),digest)
 def test_unknown_baseline_refused(self):
  with self.assertRaises(ValueError):p.patch_bytes(b'<html>unexpected</html>')
 def test_idempotent(self):
  raw=(ROOT/'index.html').read_bytes();new=p.patch_bytes(raw)
  self.assertEqual(p.patch_bytes(new),new)
 def test_messages_are_origin_and_source_gated(self):
  s=p.patch_bytes((ROOT/'index.html').read_bytes()).decode()
  self.assertIn('event.source !== $("content-frame").contentWindow',s)
  self.assertIn('event.origin !== new URL(currentFrameItem.url, location.href).origin',s)
  self.assertNotIn('postMessage(payload, "*")',s)
 def test_news_no_public_proxy(self):
  s=p.patch_bytes((ROOT/'index.html').read_bytes()).decode()
  self.assertNotIn('api.allorigins.win',s)
  self.assertNotIn('rss2json.com',s)
  self.assertIn('./portal-news.mjs?v=20261020.1',s)
if __name__=='__main__':unittest.main()
