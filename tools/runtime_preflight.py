#!/usr/bin/env python3
"""Read public release/API availability only. No Firebase data or credentials."""
import hashlib
import json
import urllib.request
import urllib.error
from datetime import datetime, timezone

TARGETS = {
    'portal': 'https://homegoestate.github.io/mainmanagement/index.html',
    'news': 'https://homegoestate.github.io/mainmanagement/news.html',
    'diagnostic': 'https://homegoestate.github.io/mainmanagement/login-check.html',
    'previous_candidate_api': 'https://nexus-line-bot.vercel.app/sso-api',
}
result = {'checkedAt': datetime.now(timezone.utc).isoformat(), 'method': 'GET only; no authentication', 'targets': {}}
for name, url in TARGETS.items():
    try:
        request = urllib.request.Request(url, headers={'User-Agent':'HomeGoERP-release-check/1.0','Cache-Control':'no-cache'})
        with urllib.request.urlopen(request, timeout=12) as response:
            body = response.read(1_000_001)
            result['targets'][name] = {'status':response.status, 'contentType':response.headers.get('Content-Type',''),
                'sha256':hashlib.sha256(body).hexdigest(), 'bytes':len(body), 'finalUrl':response.url}
    except urllib.error.HTTPError as error:
        result['targets'][name] = {'status':error.code, 'contentType':error.headers.get('Content-Type',''),
            'vercelError':error.headers.get('x-vercel-error','')}
    except (OSError, ValueError) as error:
        result['targets'][name] = {'error':type(error).__name__}
print(json.dumps(result,ensure_ascii=False,indent=2))
