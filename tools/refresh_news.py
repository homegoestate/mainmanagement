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
    ('law', '地政 台灣'), ('law', '土地登記'), ('law', '不動產 交易安全'),
    ('tax', '房地合一稅'), ('tax', '土地增值稅'), ('tax', '遺產稅'),
    ('tax', '贈與稅'), ('tax', '房屋稅'), ('tax', '地價稅'), ('tax', '契稅'),
    ('tax', 'site:mof.gov.tw 稅'),
    ('loan', '房貸'), ('loan', '信用管制'), ('loan', '新青安'),
    ('market', '台南 房市'), ('market', '台灣 房價'),
    ('land', '台南 都市計畫'), ('land', '土地開發'), ('land', '都更 危老'),
    ('inherit', '繼承 不動產'), ('inherit', '信託 財產'),
    ('finance', '央行 利率'), ('finance', '聯準會 利率'), ('finance', '台灣 匯率'),
    ('ai', 'AI 企業'), ('ai', '人工智慧 自動化')
]
CATEGORIES = {category for category, _ in FEEDS}
KEYWORDS = {
    'law': ['地政', '土地', '不動產', '交易安全', '產權', '詐騙', '實價登錄'],
    'tax': ['房地合一', '土增稅', '土地增值', '地價稅', '契稅', '房屋稅', '遺產稅', '贈與稅', '財產傳承', '繼承', '不動產'],
    'loan': ['房貸', '信用管制', '新青安', '貸款', '核貸'],
    'market': ['房市', '房價', '預售', '中古屋', '不動產', '建商', '建案', '買賣移轉'],
    'land': ['土地', '都市計畫', '重劃', '都更', '危老', '容積', '農地', '區段徵收'],
    'inherit': ['繼承', '信託', '遺產', '贈與', '遺囑', '財產'],
    'finance': ['央行', '利率', '聯準會', 'fed', '通膨', '匯率', '美元', '美債', '金融'],
    'ai': ['ai', '人工智慧', '自動化', '資安']
}

def relevant_categories(title, categories):
    text = plain(title).casefold()
    if len(text) < 6 or re.fullmatch(r'[-\s]*(內政部|財政部).*全球資訊網', text):
        return []
    return [category for category in categories if any(word in text for word in KEYWORDS.get(category, []))]

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

def parse_feed(body, category, now, publisher=''):
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
                         source=plain(source.text if source is not None else publisher)[:100] or '來源未標示',
                         sourceUrl=safe_url(source.get('url', '') if source is not None else ''),
                         categories=[category]))
    print(f'Feed {publisher or category}: raw={len(root.findall("./channel/item"))}; retained={len(rows)}', flush=True)
    if not rows:
        print('Publication samples: ' + repr([item.findtext('pubDate') for item in root.findall('./channel/item')[:3]]), flush=True)
    return rows

def fetch_feed(entry, now):
    category, query = entry
    url = 'https://news.google.com/rss/search?' + urllib.parse.urlencode(
        dict(q=f'{query} when:7d', hl='zh-TW', gl='TW', ceid='TW:zh-Hant'))
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
        categories = sorted(relevant_categories(title, set(row.get('categories', [])) & CATEGORIES))
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
                detail = pending[task] + ': ' + type(error).__name__ + ' ' + str(error)[:160]
                errors.append(detail)
                print('Feed failure: ' + detail, flush=True)
    if not succeeded or not rows:
        raise RuntimeError(f'No dated recent RSS items; succeeded={succeeded}/{len(FEEDS)}; previous snapshot left unchanged; errors=' + '; '.join(errors[:4]))
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
