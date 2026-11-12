# 原 Cloudflare Worker 的最小權限修補

2026-10-22 找回較新 `Firebase登入銜接_實作與回執_20261020.zip` 及後續會話／裝置修補。其原始來源記載六位現職 Auth 已正式驗證，私密別名對照仍在交接檔；這是來源回執，非本輪重測密碼。**以原 `homego-native-company-v7` 為接續部署基準，不重建帳號，不另建第二套正式登入服務。**

本目錄只修補原 Worker business core 的主管分權與特休計算：

- `review` capability 不再單獨放行。受保護 access 必須是 MANAGER、明確 approvals.car/sick/personal，且 reviewScope[原 request key]=true；不得審本人、特休或範圍外申請。
- 主管不能讀取其他同仁的全部假單及人事統計；僅取得待審範圍。原 CEO 及獨立明確 capability 檢查仍保留。
- 原核准流程與 audit/CAS 保留，新增 approvedAt 與 append-only approvalHistory，供新版特休證據核對。
- 特休採目前 GitHub Employee-management 的 2026-10-22 計算，保留年資、加給、舊已休證據與不凍結本期的歷史結算處理。
- 不修改 WebAuthn、Gateway Custody、個人 UID、原裝置、原始 ID 型別、Worker 設定／秘密、SQL 或啟用開關。

`nonsecret-projection.mjs` 與 `leave-policy.js` 是原來源未變更的測試依賴。安裝器只允許雜湊符合已知原始檔（或本補丁）的目標，只寫 core 與 legacy-policy。後續來源若已改過會拒絕覆蓋。

```sh
node apply-review.mjs --check /absolute/path/to/original/backend
node apply-review.mjs --apply /absolute/path/to/original/backend
cd /absolute/path/to/original/backend
npm ci
npm test
npm run build
```

私密 access 的新增 approvals/reviewScope 必須明確核定，不能把舊 `review` 自動擴成所有人／所有假別。Worker 的目錄 receipt 會綁定 access 的所有權限欄位，變更時須透過既有原子維護流程重建派生目錄，不能只改名冊或只改畫面。

Vercel [PR #3](https://github.com/homegoestate/nexus-line-bot/pull/3) 是另行驗證的關閉備選，尚未與原 Worker 接線；其 `_security`、device-key/session 與根拒絕 rules **不可**套到原 Worker `_sso`、WebAuthn、gateway-UID rules 契約。沒有必要為此備選新建 Firebase 私鑰或平行登入服務。

尚待：從已授權的 Cloudflare 工作階段核實原 Worker 版本與設定、原 gateway custody 狀態、兩庫私密備份／還原、全部寫入者、實體裝置及目前正式 HTML 完整驗收。原 Windows 金鑰圈中的 Device Grant 不包含在 ZIP，此工作階段不能拿交接回執取代實際 Cloudflare 連線。本輪沒有放行任何 activation／backup／compatibility 旗標。
