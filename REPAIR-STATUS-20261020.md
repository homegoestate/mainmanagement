# ERP repair release — 2026-10-20

This is an additive public-news and account-diagnostic release, not an authentication cutover.

## Included
- `news.html`: public RSS metadata, eight categories, Taipei date filters, actual publication times, no fake current-day fallback links.
- `tools/refresh_news.py`: 14 RSS queries, up to 200 deduplicated seven-day items, concurrent timeout-bounded requests, preserve prior snapshot on total failure.
- `.github/workflows/portal-news.yml`: tests on pushes/PRs; refresh only on main. Requests a Pages build explicitly after a token-generated data commit. Schedule attempts every three hours; delivery is not a guaranteed clock-time SLA.
- `login-check.html`: isolated Firebase Auth check using memory-only persistence. No registration, no database reads/writes, no legacy password lookup, no personnel/permission changes. Verification refresh reloads the user and refreshes the token.

## Preserved
The existing index.html, manifest.json, service-worker.js, recovery-export.html, employee records, devices, and all eight business systems are untouched. No changes to LINE, Vercel environment variables, Firebase Rules, IAM, account mappings or billing.

## Remaining blocker
The live portal source uses legacy RTDB account checks instead of Firebase Authentication. Prior unified-login candidates are not the deployed main branch. Creating an Auth account or verifying email alone does not authorize that legacy portal. The previously proposed `/sso-api` service must be located or deployed and verified before switching the portal and employee module together. Do not close production data access blindly, grant authority based on a client-supplied name/role, or open database Rules to make login work.

## Validation
Run `python tests/test_refresh_news.py` and `node --test tests/news.test.mjs`. These use fixtures and do not prove production employee login or database authorization. Real feed collection and Pages publication require a successful main workflow and HTTP verification. Standalone news does not send LINE/background push notifications.
