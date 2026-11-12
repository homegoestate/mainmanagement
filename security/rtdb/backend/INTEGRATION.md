# 後端整合與部署邊界

本輪已從登入後的 Firebase Console 核實兩庫根讀寫仍公開；mainmanagement Auth 8 帳號（1 停用），homego-system 僅 3 個舊匿名帳號。保留所有原 UID 與停用狀態，不推定合成帳號對應哪位同仁，也不拿匿名 UID 代表員工。

## 接續基準更新：原 Worker 優先

本輪進一步找回較新 `Firebase登入銜接_實作與回執_20261020.zip`、原會話及裝置補丁、六人私密登入對照。原來源已記載六位 Auth 與一位離職拒絕正式回執；本輪不重建 UID、不重測或改密碼。實際部署應沿用原 `homego-native-company-v7` 的 WebAuthn／Gateway Custody／root-CAS／`_sso` 契約。先前 Vercel PR #3 保留為關閉備選，不另建立第二套正式登入，也無須為備選新增 Firebase 私鑰。

可審查且已實際套用到隔離候選的修補在 `../native-worker/`：主管審核須 protected role + 假別 approvals + 指定 request-key reviewScope，讀取也限範圍；新版特休計算與核准證據時間保留原最新行為。只寫兩個 business 檔案，雜湊不符拒絕覆蓋；不碰原 Worker 金鑰／設定／啟用旗標／SQL／Rules。

套用後原後端 113/113 測試通過，另新增 native 分權 6/6 通過；原 Worker 入口 bundle 成功（927937 bytes，SHA256 `606a61eb49cab7a43444551a1f44832f2ad613a1842661c02f591fc56870d0df`）。這些都是隔離候選驗證，未部署。原部署 Device Grant 位於另一個 Windows 金鑰圈，未在 ZIP；此工作階段未取得可操作的 Cloudflare 管理連線，不能以舊回執當作目前管理權。已搜尋連線目錄，這個工作階段未找到可用 Cloudflare 外掛。

下列 Vercel 記錄保留供審查，但不能把兩套私密 schema、裝置證明或 rules 混用。原 Worker 的正式備份、全部寫入者、個人裝置、最新 HTML、CASE 信任／SQL 與跨模組撤權仍須按原切換流程核實。

## 已開始實作的既有主機方案

2026-10-22 找回先前交付套件並核實既有 Vercel 專案 `nexus-line-bot`，不必先升級 Firebase Blaze。實際 HTTP 後端已提交 [nexus-line-bot PR #3](https://github.com/homegoestate/nexus-line-bot/pull/3)：驗證 mainmanagement 原 Auth ID token、P-256 裝置簽章、防重放 challenge、短效 session、HR 分權投影及 CAS／稽核／原子核准。沿用目前人事系統的特休計算，不使用舊 ZIP 會取消裝置綁定或要求個人 Email 的 HTML。

該庫全測試 291 項通過，其中 23 項為新安全服務測試（合成資料），Vercel 分支預覽 READY，雲端路由已回應預期 405。這不等於正式員工流程驗收。Vercel 只檢查環境變數名稱，確認缺 `HGE_SSO_SERVICE_ACCOUNT_JSON`，未讀取或展示其他服務秘密、未下載私鑰或更動 IAM。

此服務目前只代理 HR RTDB，使用伺服器驗證的 mainmanagement UID，不需讓 HR 客戶端另行 Firebase Auth 登入。它要求 HR 對直接客戶端全部拒絕，不能和本 PR 的 custom-token／投影規則直接拼接。總管理庫與完整舊介面接線、私密映射與裝置公鑰核對、生命週期／主管授權等仍待完成。以新後端庫 `docs/security/company-sso.md` 的實作狀態及切換條件為準。

使用者已授權直接實作與必要驗證；目前停在真實憑證與相容性條件，不另增概括性許可門檻。仍未修改正式 Rules、Auth、IAM 或任何公司業務資料。

## 仍須完成的實際服務

| 服務 | 最低要求 |
|---|---|
| Auth 驗證 | mainmanagement Admin SDK `verifyIdToken(idToken, true)`；核對 audience、issuer、撤銷與停用。不接受姓名、裸 UID、localStorage role |
| 裝置 challenge | 私密短效 challenge／憑證；驗 WebAuthn signature、challenge、origin、rpId、userVerification 及防重放。DID 只是識別，新裝置須經可信核准 |
| `POST /session` | 核實原 UID／員工映射，各專案各自簽發 token；安全建立 ACL／session；禁止從姓名自動給權 |
| session revoke | 驗 actor 與 session 歸屬，兩庫均停用；部分失敗須重試，不宣稱跨庫原子更新 |
| 讀取投影 | 白名單產生 directory/selfViews/adminViews/reviewQueues，不全量 spread 舊 users／employees |
| 核准及管理寫入 | authorization 核心之後仍須欄位驗證、完整期間特休計算、單一交易重驗、防併發、去重、不可由客戶端改的稽核 |

`authenticatedActor()` 的 state 必須是本次可信讀取。它不是 JWT 驗章程式，不能把自行 decode 的 JWT 當已驗證 token。回傳 actor 有私有標記，authorizeAction 不接受 request-body actor。

## 雙專案身分與權限

以已核實的 mainmanagement UID 作主識別，明確對應各人 HR UID。人事專案沒有正式人員 Auth 身分者，經受控關聯／建帳，不能重用匿名 UID 或重建既有員工資料。

執行身分只取得必要的跨專案資料及 token 簽發權。實際 IAM 變更前須列出精確 principal、role、resource 核定。優先受控執行身分，避免下載長期 JSON 私鑰；不提交憑證或交給瀏覽器。`_security` 仍禁止先寫入公開根 RTDB，依 ROLLOUT 的安全切換順序辦理。

## Client 元件接線與驗收

保留原別名輸入與既有 Auth，接真正登入；不再匿名讀密碼。`verifyDevice()` 接真實裝置驗證、`revokeGrant()` 接真實撤權服務；目前測試是隔離假資料，沒有假稱完成 WebAuthn 或正式撤權。成功後再建立分權監聽，替換原根監聽及高權限寫入。

正式驗收須涵蓋原打卡、請假、主管核准、CEO 特休修正、新進／離職、公機切換與各模組資料保留，不能只測登入。

官方依據：
https://firebase.google.com/docs/functions/get-started
https://firebase.google.com/docs/auth/admin/verify-id-tokens
https://firebase.google.com/docs/projects/billing/avoid-surprise-bills
