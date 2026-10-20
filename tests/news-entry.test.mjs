import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const portal=readFileSync(new URL('../portal-news.mjs',import.meta.url),'utf8');
const newsHtml=readFileSync(new URL('../news.html',import.meta.url),'utf8');
const reader=readFileSync(new URL('../news-reader.mjs',import.meta.url),'utf8');
test('ERP primary news entry is native same-tab navigation, not a JS-dependent button',()=>{
  assert.match(html, /<a\b[^>]*id="btnOpenNews"[^>]*href="\.\/news\.html\?source=portal"/);
  assert.doesNotMatch(html, /id="btnOpenNews"[^>]*target="_blank"/);
  assert.doesNotMatch(html, /\$\("btnOpenNews"\)\.addEventListener/);
  assert.match(html, /id="btnOpenNewsInline"/);
  assert.match(html, /\$\("btnOpenNewsInline"\)\.addEventListener\("click", \(\) => fetchNews\(\{ force: true \}\)\)/);
});
test('full news remains reachable from login without a session',()=>{
  assert.match(html, /href="\.\/news\.html">開啟新聞新知中心（不需先登入）/);
  assert.match(html, /id="newsSourceLink" href="\.\/news\.html"/);
});
test('news center HTML and its feed reader and data paths are present',()=>{
  assert.ok(existsSync(new URL('../news.html',import.meta.url)));
  assert.ok(existsSync(new URL('../news-reader.mjs',import.meta.url)));
  assert.ok(existsSync(new URL('../news/latest.json',import.meta.url)));
  assert.match(newsHtml, /id="cards"/);
  assert.match(newsHtml, /type="module" src="\.\/news-reader\.mjs"/);
  assert.match(reader, /fetch\('\.\/news\/latest\.json\?t='/);
  assert.match(reader, /time\(row\.date\)/);
});
test('ticker full news fallback also navigates in the same tab',()=>{
  assert.match(portal,/more\.href='\.\/news\.html'/);
  assert.match(portal,/more\.target='_self'/);
});
test('preserve original styling and eight other system entries',()=>{
  const modules=html.slice(html.indexOf('const DASHBOARD_ITEMS = ['),html.indexOf('let currentSession = '));
  assert.equal([...modules.matchAll(/module: "/g)].length,8);
  assert.match(html,/--navy:#0f2e46/);
  assert.match(html,/--gold:#c5a065/);
});
