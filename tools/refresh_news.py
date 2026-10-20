#!/usr/bin/env python3
"""Public RSS metadata only. Never access Firebase, personnel data or article bodies."""
import concurrent.futures as futures
import email.utils
import html
import json
import re
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'news' / 'latest.json'
FEEDS = [
    ('law', '(地政 OR 土地登記 OR 交易安全) (台灣 OR 臺灣)'),
    ('law', 'site:land.moi.gov.tw (登記 OR 地政 OR 實價登錄)'),
    ('tax', 'site:mof.gov.tw (房地合一 OR 遺產稅 OR 贈與稅 OR 房屋稅)'),
    ('tax', '(土地增值稅 OR 地價稅 OR 契稅 OR 房地合一稅)'),
    ('loan', '(央行 OR 中央銀行) (房貸 OR 信用管制 OR 利率)'),
    ('loan', '(房貸 OR 新青安) (核貸 OR 成數 OR 撥款 OR 寬限期)'),
    ('market', '(台南 OR 臺南 OR 南科) (房市 OR 房價 OR 實價登錄)'),
    ('market', '(台灣 OR 臺灣) (預售屋 OR 買賣移轉 OR 中古屋)'),
    ('land', '(台南 OR 臺南) (都市計畫 OR 重劃 OR 區段徵收)'),
    ('land', '(農地變更 OR 土地開發 OR 危老 OR 都更 OR 容積)'),
    ('inherit', '(繼承 OR 遺囑 OR 信託) (不動產 OR 財產 OR 土地)'),
    ('finance', '(台灣 OR 臺灣) (金融 OR 通膨 OR 匯率 OR 央行)'),
    ('finance', '(Fed OR 聯準會 OR 美債) (利率 OR 美元 OR 經濟)'),
    ('ai', '(AI OR 人工智慧) (企業 OR 自動化 OR 資安)')
]
CATEGORIES = {category for category, _ in FEEDS}

def plain(value):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]*>', ' ', str(value or '')))).strip()

def safe_url(value):
    try:
        u = urllib.parse.urlsplit(str(value or '').strip())
        if u.scheme != 'https' or not u.hostname or u.username or u.password:
            return ''
        _ = u.port
        return urllib.parse.urlunsplit((u.scheme, u.netloc, u.path, u.query, ''))
    except ValueError:
        return ''

def instant(value):
    if not isinstance(value, str):
        return None
    try:
        dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError:
        try:
            dt = email.utils.parsedate_to_datetime(value)
        except (ValueError, TypeError, OverflowError):
            return None
    return dt.astimezone(timezone.utc) if dt.tzinfo is not None else None

def recent(value, now):
    dt = instant(value)
    return dt is not None and now - timedelta(days=7) <= dt <= now

def parse_feed(body, category, now):
    root = ET.fromstring(body)
    if root.tag.split('}')[-1] != 'rss':
        raise ValueError('Not an RSS response')
    rows = []
    for item in root.findall('./channel/item'):
        title = plain(item.findtext('title'))[:250]
        link = safe_url(item.findtext('link'))
        date = item.findtext('pubDate')
        if not title or not link or not recent(date, now):
            continue
        source = item.find('source')
        rows.append(dict(title=title, link=link,
                         date=instant(date).isoformat(),
                         source=plain(source.text if source is not None else '')[:100] or '來源未標示',
                         sourceUrl=safe_url(source.get('url', '') if source is not None else ''),
                         categories=[category]))
    return rows

def fetch_feed(entry, now):
    category, query = entry
    url = 'https://news.google.com/rss/search?' + urllib.parse.urlencode(
        dict(q=f'({query}) when:7d', hl='zh-TW', gl='TW', ceid='TW:zh-Hant'))
    req = urllib.request.Request(url, headers={'User-Agent': 'HomeGoERP-RSS/2.0', 'Accept': 'application/rss+xml'})
    with urllib.request.urlopen(req, timeout=12) as response:
        body = response.read(2_000_001)
        if len(body) > 2_000_000:
            raise ValueError('RSS exceeds size limit')
        return parse_feed(body, category, now)

def deduplicate(rows, now):
    by_link, by_title, result = {}, {}, []
    for row in sorted(rows, key=lambda r: instant(r.get('date')) or datetime.min.replace(tzinfo=timezone.utc), reverse=True):
        link, title = safe_url(row.get('link')), plain(row.get('title'))[:250]
        if not link or not title or not recent(row.get('date'), now):
            continue
        key = re.sub(r'[\W_]+', '', title.casefold())
        categories = sorted(set(row.get('categories', [])) & CATEGORIES)
        if not categories:
            continue
        existing = by_link.get(link) or by_title.get(key)
        if existing is not None:
            existing['categories'] = sorted(set(existing['categories'] + categories))
            continue
        clean = dict(title=title, link=link, date=instant(row['date']).isoformat(),
                     source=plain(row.get('source'))[:100] or '來源未標示',
                     sourceUrl=safe_url(row.get('sourceUrl')), categories=categories)
        by_link[link] = by_title[key] = clean
        result.append(clean)
    # Give every topic up to 15 recent slots before filling with the newest overall.
    chosen = {}
    for category in sorted(CATEGORIES):
        for row in [r for r in result if category in r['categories']][:15]:
            chosen[row['link']] = row
    for row in result:
        if len(chosen) >= 200:
            break
        chosen[row['link']] = row
    return sorted(chosen.values(), key=lambda r: r['date'], reverse=True)

def collect(fetch=fetch_feed, previous=None, now=None):
    now = now or datetime.now(timezone.utc)
    rows, errors, succeeded = [], [], 0
    with futures.ThreadPoolExecutor(max_workers=4) as pool:
        pending = {pool.submit(fetch, entry, now): entry[0] for entry in FEEDS}
        for task in futures.as_completed(pending):
            try:
                rows.extend(task.result())
                succeeded += 1
            except Exception as error:
                errors.append(pending[task] + ': ' + type(error).__name__)
    if not succeeded or not rows:
        raise RuntimeError('No dated recent RSS items; previous snapshot left unchanged')
    old = (previous or {}).get('items', [])
    items = deduplicate(rows + (old if isinstance(old, list) else []), now)
    if not items:
        raise RuntimeError('No valid items; previous snapshot left unchanged')
    return dict(schemaVersion=2, fetchedAt=now.isoformat(), status='partial' if errors else 'ok',
                feedsSucceeded=succeeded, feedsChecked=len(FEEDS), errors=sorted(errors),
                fetchedItems=len(deduplicate(rows, now)), total=len(items),
                latestPublishedAt=items[0]['date'], items=items)

def main():
    previous = None
    if OUTPUT.exists():
        try:
            previous = json.loads(OUTPUT.read_text(encoding='utf-8'))
        except (OSError, ValueError):
            pass
    result = collect(previous=previous)
    OUTPUT.parent.mkdir(exist_ok=True)
    temp = OUTPUT.with_suffix('.tmp')
    temp.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temp.replace(OUTPUT)
    print(f"{result['total']} items; {result['feedsSucceeded']}/{result['feedsChecked']} feeds; {result['status']}")

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
