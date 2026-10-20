# ERP repair release — 2026-10-20

## Scope and status
PR #1 added the news center and isolated Firebase account diagnostic. Tests and Pages deployment succeeded. First successful real snapshot: 2026-10-20 12:53 Asia/Taipei, 46 items, partial sources. The initial nested search queries produced too few topic results; the subsequent revision uses 26 simpler queries and title-level relevance filtering. Counts must be read from news/latest.json, not assumed from configured capacity.

## Approved bounded portal patch
`tools/integrate_portal.py` accepts only the exact original SHA256 8da37f7a69e0da03b446f5727511286d8e73e388cc2378d680253c487a69cbd0, or an already patched file. It replaces the old public-news functions, links the diagnostic and news pages, restricts iframe messages to the actual child window and expected origin, and corrects the misleading all-modules-SSO claim. Regression tests hash the unchanged Firebase configuration/authentication/personnel functions. No database, account, device, role or history mutation occurs during installation. Unexpected homepage baselines stop the patch instead of overwriting concurrent work.

## News
Eight topics; original publication times; Taipei today/24h/72h/7d filters; up to 200 items, forty per page; no fake fallback headlines. Google News RSS aggregation is not independent publisher verification. Date/keyword filters do not replace human fact checking. The scheduled refresh attempts every three hours. Failed or undated results are not relabeled as current. No LINE or background push notification is sent.

## Authentication limitation
The existing index still uses legacy RTDB credentials; true Firebase email verification alone cannot authorize it. login-check.html only checks an existing Firebase account with memory-only state. It does not register employees or grant permissions. Real SSO requires the previously prepared backend, UID-to-employee mapping and verified server-side enforcement. No production login completion is claimed.

## Preserved and rollback
Manifest, service worker, recovery export, business systems and all business data are unchanged. Baseline backup branch: backup/pre-erp-news-20261020. Roll back the isolated source changes only; do not clear browser storage or restore an entire old database. Disable the portal-news workflow before source rollback so the patch cannot reapply. No Firebase Rules, IAM, billing, secrets, LINE or Vercel changes.

## Tests
10 Python news tests + 5 bounded-patch tests + 6 Node news tests. Chromium offline fixture tests cover rendering/mobile layout and mocked Auth verification refresh; they do not verify real identity, CSP or live network access. Real workflow and Pages results are separate evidence.
