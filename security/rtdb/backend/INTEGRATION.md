# 後端整合與部署邊界

本輪已從登入後的 Firebase Console 核實兩庫根讀寫仍公開；mainmanagement Auth 8 帳號（1 停用），homego-system 僅 3 個舊匿名帳號。保留所有原 UID 與停用狀態，不推定合成帳號對應哪位同仁，也不拿匿名 UID 代表員工。

## 具體部署選項（未執行）

建議維持兩個 RTDB，僅以 **mainmanagement 一個專案承載 Cloud Functions**；homego-system 暫維持 Spark。這條路需要核准 mainmanagement 的 Blaze 按量計費。Firebase 要求部署 Cloud Functions 的專案使用 Blaze；部署映像、建置、執行及網路等可能產生費用，不能保證每月零元。預算警示不是硬性支出上限，還應限制函式最大執行個體、請求大小、時間、重試及每人速率，並安排費用異常時的人工備援。正式數量與成本須按實際用量核算，本 PR 不虛構報價。

未執行任何連結帳單帳戶、升級、建立函式、下載私鑰、新增跨專案 IAM、修改 Auth 或 Rules。升級後也不能直接貼上候選 Rules。

若公司已有可維護的可信後端，可改承載相同服務；不能為維持 Spark 而把管理金鑰／簽章密鑰放進 GitHub Pages。

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
