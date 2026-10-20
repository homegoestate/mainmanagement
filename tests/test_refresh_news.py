import importlib.util
from datetime import datetime, timezone
from pathlib import Path
import unittest
spec=importlib.util.spec_from_file_location('news',Path(__file__).resolve().parents[1]/'tools/refresh_news.py')
n=importlib.util.module_from_spec(spec);spec.loader.exec_module(n)
NOW=datetime(2026,10,20,1,tzinfo=timezone.utc)
ROW=dict(title='土地登記房地合一稅測試消息',link='https://example.test/one',date='2026-10-19T20:00:00+00:00',source='測試',categories=['law'])
class NewsTests(unittest.TestCase):
 def test_filter_irrelevant_source_news(self):
  self.assertEqual(n.relevant_categories('出口貨物通關宣導 - 財政部全球資訊網',['tax']),[])
  self.assertEqual(n.relevant_categories('房地合一稅自住房屋新知',['tax']),['tax'])
 def test_timezone_required(self):
  self.assertIsNone(n.instant('2026-10-20T01:00:00'))
  self.assertIsNotNone(n.instant('Tue, 20 Oct 2026 00:00:00 GMT'))
 def test_bad_url(self):
  for u in ['javascript:alert(1)','http://example.test','https://u:p@example.test','https://example.test:bad']:
   self.assertFalse(n.safe_url(u))
 def test_invalid_feed(self):
  with self.assertRaises(ValueError): n.parse_feed(b'<html>error</html>','law',NOW)
 def test_parse_actual_rss_structure(self):
  xml=b'<rss><channel><item><title>Test story</title><link>https://example.test/one</link><pubDate>Mon, 19 Oct 2026 20:00:00 GMT</pubDate><source url="https://example.test">Example</source></item></channel></rss>'
  self.assertEqual(n.parse_feed(xml,'law',NOW)[0]['source'],'Example')
 def test_merge_categories(self):
  rows=n.deduplicate([ROW,{**ROW,'categories':['tax']}],NOW)
  self.assertEqual(len(rows),1);self.assertEqual(rows[0]['categories'],['law','tax'])
 def test_old_and_future(self):
  self.assertEqual(n.deduplicate([{**ROW,'date':'2026-01-01T00:00:00Z'},{**ROW,'date':'2026-10-21T00:00:00Z'}],NOW),[])
 def test_all_failure_keeps_snapshot(self):
  def failed(entry,now):raise OSError('offline')
  previous={'items':[ROW]}
  with self.assertRaises(RuntimeError):n.collect(failed,previous,NOW)
  self.assertEqual(previous,{'items':[ROW]})
 def test_partial_preserves_old_recent(self):
  def fetch(entry,now):
   if entry[0]=='law':return [ROW]
   raise OSError('offline')
  previous={'items':[{**ROW,'title':'前次房地合一稅消息','link':'https://example.test/previous','categories':['tax']}]}
  r=n.collect(fetch,previous,NOW);self.assertEqual(r['status'],'partial');self.assertEqual(r['total'],2)
 def test_empty_feed_does_not_replace(self):
  with self.assertRaises(RuntimeError):n.collect(lambda *_:[],{'items':[ROW]},NOW)
if __name__=='__main__':unittest.main()
