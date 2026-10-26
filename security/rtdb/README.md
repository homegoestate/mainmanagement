# 兩套 RTDB 權限修補候選方案｜2026-10-22

**狀態：供審查及模擬器驗證，禁止直接套用現有正式前端。已在登入後的 Firebase 控制台讀取兩庫現行 Rules，均為根節點公開讀寫；尚未修復正式環境。**

這個 PR 新增規則、測試、來源盤點及切換方案；不修改現有 HTML、帳號、UID、裝置清單、員工資料、假勤、案件、收據或報價，也不自動部署。規則管理集中於 mainmanagement，兩個專案仍各自獨立部署與驗收。

## 已確認與未確認

- 使用者提供 2026-10-21 的兩封 Firebase 安全警告。本次以此作為調查起點，未重新讀 Gmail；警告不是已外洩證據，也不是 10/22 現行規則的證明。
- GitHub PR #8 已合併；它修復瀏覽器儲存與裝置識別，未完成 Firebase Auth、Database Rules 或後端 SSO。
- 在本次取得的 mainmanagement / Employee-management 原始碼中，正式入口均未執行 Firebase Auth 登入；總管理仍從 RTDB 讀取舊帳號再由前端比對。獨立 login-check 頁有 Auth，但沒有銜接正式入口。
- 兩個核心儲存庫沒有 `firebase.json`、`.firebaserc`、RTDB 規則檔或 Firebase 部署工作流程。現有 mainmanagement CI 是介面測試與新聞更新，不是資料庫安全部署。
- 後續已使用登入後的 Firebase 控制台核實兩庫完整現行 Rules，皆為 `.read: true`／`.write: true`，並核對 Auth 使用者數與 Spark 計費方案，詳見 `live-observations.json`。未匿名下載業務資料、未查看密碼、未向正式庫送測試寫入；IAM、備份還原、App Check 與稽核記錄仍待驗。
- 11 個相依儲存庫的來源 SHA 與證據行號見 `source-inventory.json`。盤點是這些來源版本，不涵蓋未提供的 NAS 舊副本、外部服務、其他分支或實際 Firebase 部署狀態。

## 資料讀寫與中斷風險

| 來源 | 儲存與操作 | 權限問題／切換前必做 |
|---|---|---|
| mainmanagement/index.html | `employees`：啟動時整批讀取、預設資料初始化、逐員工更新；`users/{account}`：讀取舊密碼與授權裝置、註冊／重設／登入更新；管理頁訂閱整個 users | 登入前不能先讀帳密。初始化移到受控後端；管理頁改讀去除密碼的 adminViews；撤掉前端管理密碼及可自行推算的開通碼作為授權依據。保留原帳號別名，不覆寫原 UID。 |
| Employee-management/index.html | `onValue(ref(db))` 與 `get(ref(db))` 讀根節點；`employees/{key}` 含薪資、年資、特休核定、角色、裝置；`requests` 整批交易；`attendance/{key}` 打卡與更正；`settings/salary`、`bulletin` | 根訂閱必須拆分，否則收緊規則後整頁失敗。`employees` 和 `requests` 的跨列交易改由有授權檢查的後端執行。 |
| Employee-management 裝置與登入 | devices、deviceProfiles、WebAuthn 資料、前端管理旗標；裝置管理交易整個 employees | DID 是識別碼，不是密鑰或不可複製的身分證明。既有允許名單可保留，但須由後端認證後核實與綁定；公機切換不得只靠選姓名。 |
| case | Supabase + localStorage、ERP 身分訊息 | 未發現上述兩套 RTDB 的直接連線。Firebase 修補不等於 Supabase RLS 已驗證；本 PR 不修改該資料源。 |
| receipts / quotation | localStorage、部分 IndexedDB／匯出入、ERP 身分訊息 | 身分訊息只作顯示與操作歸屬提示；不可當後端授權。保留本機資料，不清空共同網域儲存。 |
| Bank-choice | localStorage | 未發現兩套 RTDB 依賴。 |
| Integrate / case-procedure / REPORT / AI-question-assistant / -Project-Management | 本次 index.html 未發現兩套 RTDB 連線 | 不把純入口／前端頁面誤當已受 Firebase 權限保護。 |

關鍵證據：總管理 `index.html` 194–211、407–418、546–657、714–759、916–988；員工頁 700–726、1084–1095、1180–1205、1654–1661、2080–2083、2250–2322、4057、4234–4255。來源以 inventory 的 commit 為準。這些問題已能由原始碼證實，後續正式規則已確認根節點公開讀寫；目前漏洞仍存在。

## 四種身分的目標權限

| 身分 | 讀取 | 寫入／核准 |
|---|---|---|
| 未登入、匿名 Auth、僅建立 Auth 尚未入職授權 | 全拒絕 | 全拒絕 |
| 一般員工 | 去敏名冊、公告、自己的 selfViews、依本人 empId 精確查詢的申請與打卡 | 只新增本人 pending 請假／用車、本人待覆核打卡；不能改舊紀錄、核准、改身分或裝置 |
| 授權主管 | 本人資料、自己的審核佇列；逐筆讀取同時有範圍授權和假別授權的申請 | 透過後端處理授權的病假／事假／公務車；不可自審，不因主管身分取得薪資、特休核定或全員資料 |
| 執行長 | 按模組讀取完整員工主檔、假勤與薪資；去密碼的帳號管理資料 | 透過後端辦理主檔、主管授權、特休、薪資、裝置、復職／封存與公告；仍無瀏覽器根節點寫入或 users 密碼讀取 |

「執行長」由後端管理的 ACL 決定，不由姓名、localStorage、`isCEO`、postMessage 或任意自填 claim 決定。不同公司模組另用 `modules.hr` / `modules.erp` 授權；會計不因原前端角色而自動取得所有 HR 權限。

## 候選 Rules 的精確邊界

- `rules/homego-system.candidate.rules.json`、`rules/mainmanagement.candidate.rules.json` 可由 Firebase RTDB 模擬器直接載入；生成來源為 `tools/build-rules.mjs`。
- 根節點 `.read/.write=false`，不存在「登入就全開」。`users`、`_security` 對所有客戶端拒絕。CEO 也不能覆寫、刪除整庫。
- 後端建立 `_security/principals/{uid}`、`sessions/{uid}/{sid}`、`devices/{uid}/{deviceId}`、`requestScopes/{managerUid}/{requestKey}`。客戶端均不可讀寫。所有讀寫同時驗證帳戶 active、合法角色、模組授權、原主檔在職狀態、session active／有效期限／版本、已核准裝置與簽署 token 的綁定。
- Claims 只攜帶 `hg_sid`、`hg_device`；身分由 Firebase 已驗證 `auth.uid` 得到。服務端角色與權限每次由 ACL 讀取，撤銷後下一次請求即失效。已下載或快取的資料無法靠 Rules 遠端收回，登出須移除本頁敏感視圖／監聽，但不可清空既有案件／報價本機檔。
- **ACL 不可在仍公開整庫讀寫時先行上傳。** 根允許會覆蓋子節點拒絕；切換順序見 ROLLOUT，需先封閉匿名存取再由可信後端建立，過渡期須有已驗收後端或核准維護安排。
- **ACL 是新建的受控旁路索引，不是重建員工。** 維持兩庫原 employee key、數字／字串 empId、原登入別名；每個專案沿用各自已存在的 Auth UID。不得推定兩專案同名人員的 UID 相同。
- HR 原始 `employees` 僅 CEO 可讀；員工使用後端產生的 `selfViews/{uid}`（自身薪資與假勤可依需求加入，但不得包含密碼、裝置清單／憑證或權限管理欄位）。`directory` 僅放必要姓名／識別資料。`reviewQueues/{uid}` 僅放已授權申請識別與必要摘要。這些投影本 PR 尚未產生，禁止直接將原員工整包複製到公開給全員的 directory。
- 員工讀取 requests / attendance 集合須使用 `orderByChild('empId') + equalTo(原始型別ID) + limitToLast(<=500)`；超過 500 筆的歷史查詢／完整報表由分頁後端處理，不得靜默只算最後 500 筆的特休餘額。Rules 不會自動過濾整庫讀取。
- 主管逐筆讀取必須同時有 requestScopes 與 car/sick/personal 類別授權；特休不因這些授權開放。主管自己的申請仍可作為本人讀取，但不可自行核准。
- 請假／用車只可建立 `pending`；禁止追加 approvedById 等陌生欄位、跨員工寫入、後續改 owner、核准及刪除。保留現有 days 字串格式，但日期是否真實、天數數值範圍、跨週年、重複請假與餘額仍須由後端嚴格核算後才能核准，不能用「可寫入 pending」等同核定有效。
- 打卡只可新增本人 `待覆核`、`employee-punch`、serverTimestamp 紀錄；正常／遲到／加班由後端依規則決定。**現行前端直接寫「正常／遲到／加班」不相容；不得直接部署。** 定位屬客戶端申報資訊，規則無法證明人在現場。
- 其他寫入全部移到已驗證、限流、有稽核的後端。Admin SDK 會繞過 Rules，因此後端必須重做授權、欄位驗證及交易一致性；本 PR 沒有假裝完成這個服務。若後端驗收未通過，部署門檻維持 false。
- 單筆欄位設長度與型別限制，但 Rules 不是總量／頻率限制。正式前需測試 App Check、成本告警與後端限流；若公司要求硬性限制每人提交頻率，將新增申請／打卡也移至限流 API，並把兩處 create `.write` 改 false，重新跑測試。

ACL 範例及資料僅出現在測試 fixture，全部為虛構，不包含員工真實 UID、裝置、密碼或個資。

## 執行測試

需要 Node 22+、Java 21+；不需要正式 Firebase 帳號或憑證。

```sh
cd security/rtdb
npm ci --ignore-scripts
npm run check
npm test
node tools/prepare-deployment.mjs
```

最後一個命令在目前狀態應以代碼 2 結束，顯示 NOT READY；這是預期的部署阻擋。測試只接受 localhost 模擬器與 `demo-*` project，使用虛構資料；正式帳密不可放入 tests、CI 或公開 PR。

測試包括匿名／未授權、本人／他人、主管範圍與類別、CEO 邊界、角色偽造、匿名 Auth、裝置／session／帳戶撤權、過期 token session、原主檔封存、數字與字串 ID、查詢限制、申請欄位與核准注入、打卡時間及狀態偽造、批次提權原子拒絕、根刪除、未知路徑等。結果見 `VALIDATION.md`。

## 正式規則取得與切換

完整步驟、各流程驗收和回退方式見 `ROLLOUT.md`。所有 `readiness.json` 門檻目前均未核定，不能勾選來繞過缺少證據。

既有登入／裝置保留的含義是保留有效帳號、UID、關聯和既有核准紀錄；不保留前端固定管理密碼、推算開通碼或單憑 DID 冒充身分的漏洞。

## 官方依據

- https://firebase.google.com/docs/database/security/core-syntax — 祖先允許會涵蓋子節點；Rules 不是資料過濾器。
- https://firebase.google.com/docs/database/security/rules-conditions — auth、查詢條件、驗證與刪除行為。
- https://firebase.google.com/docs/auth/admin/create-custom-tokens — 由可信後端簽發 token，前端 signInWithCustomToken。
- https://firebase.google.com/docs/auth/admin/custom-claims — 後端設定 claims；不把前端資料當權限。
- https://firebase.google.com/docs/rules/unit-tests — 模擬器測試真實 Rules。
- https://firebase.google.com/docs/database/rest/app-management — GET 匯出 Rules；PUT 會覆寫整份 Rules。
- https://firebase.google.com/docs/database/rest/auth — OAuth Bearer header；不要把憑證放進網址或版本庫。

## 本輪實作邊界

新增 `backend/authorization.mjs` 可信後端授權核心，以及 `client/session-bridge.mjs` SDK 注入式雙專案登入元件，新增 31 項隔離測試。不是已部署的 HTTP 服務，也尚未接入正式 HTML。後端仍須驗 token 簽章與撤銷、裝置密碼學證明、持久化、交易、限流與稽核；詳見 `backend/INTEGRATION.md`。未升級計費、未新增 IAM、未改正式規則或原資料。

建案服務中心、Supabase 與本次修補的權限邊界，見 `INTEGRATION-BOUNDARIES.md`；本輪未重新核實使用者貼文的 Supabase 政策，亦未啟用正式同步。
