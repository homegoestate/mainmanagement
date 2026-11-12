# 驗證紀錄｜2026-10-22（Asia/Taipei）

## 已執行

| 項目 | 結果 | 範圍 |
|---|---|---|
| Firebase RTDB emulator v4.11.2 | 53/53 通過，0 skipped，0 failed | 兩份候選規則實際載入並執行；虛構資料與 demo project；不是用 JS 模仿規則判斷 |
| mainmanagement 原有 Node 測試 | 49/49 通過 | 含入口、原功能、配額、裝置 IndexedDB 等回歸測試 |
| 原有 Python portal patch 測試 | 10/10 通過 | 原介面與功能保留 |
| `tools/integrate_portal.py --check` | 通過 | 原入口 SHA256：`0d3f587b956058c2426fdebc7c0bda117645dfc0a1f05fd23477a8b936d16716` |
| `npm run check` | 通過 | 規則 JSON 與生成來源一致 |
| export / prepare 工具語法 | 通過 | `node --check`；未執行正式規則匯出或部署 |
| 部署準備門檻 | 如預期拒絕，exit 2 | 所有正式驗收門檻 false；沒有產生正式部署設定 |
| 現有正式入口檔案 | 未變更 | index.html、login-check.mjs、recovery-export.html、service-worker.js |

本地測試環境：Node 24.19.0、Java 21.0.12.1、firebase-tools 15.34.1、firebase 13.1.0、rules-unit-testing 6.0.0。首次啟動發現本機 Java 17 不符新版 emulator 要求，使用暫存 Java 21 解決；本機網路代理造成 localhost rules upload 失敗，僅於測試程序移除 proxy 環境變數後成功。初輪測試 4 項因新版 SDK 不接受空字串根路徑失敗，改用 `ref(db)` 後 53 項全部通過。沒有為通過測試放寬規則。

## 測試可證明什麼

可證明候選規則在給定的 ACL／session／資料結構下，拒絕所測越權情境並允許必要的本人新增和分權讀取；沒有現有主檔覆寫、未知路徑放行或祖先允許覆蓋。

## 後續完成的正式只讀核對

已透過登入 Firebase 控制台完整讀取兩套六行 Rules，皆確認根節點公開讀寫；總管理 Auth 8 帳號（1 停用），人事 Auth 3 帳號（均匿名）；兩專案 Spark。沒有改動正式 Rules、帳號或業務資料。未公開真實 UID／帳號清冊。詳見 live-observations.json。

新增後端授權核心與雙專案登入元件測試 31 項，與原 53 項規則測試合跑共 **84/84 通過**（0 skipped、0 failed），使用虛構且注入的 SDK／ACL 資料；不代表真實登入、後端端點或員工流程已通過。

## 尚未驗證

- 是否曾發生外洩、影響範圍及記錄是否完整。正式根讀寫公開已確認。
- 現有真實 Auth UID、雙專案 token／裝置證明與權限映射。
- HTTP 登入簽發端點、裝置密碼學驗證、投影產生器、主管核准／特休／薪資／裝置的持久化與交易服務。這些本 PR **未實作或部署**；新增加的是授權核心及 client 銜接元件。
- 原始庫未知欄位、舊資料型別、完整報表、超過 500 筆歷史、真實員工端到端流程。
- 正式部署、跨專案撤權、App Check、限流、備份還原、服務中斷及回退演練。

**因此本 PR 是候選規則與修補前置成果，不代表正式漏洞已封住，也不是可以直接覆蓋目前前端的上線版本。**

## 原 Worker 接續驗證（2026-10-22）

找回較新原 R3、套用已交付裝置修補，再把本 PR native-worker business core 與新版特休補丁套進隔離候選。原後端 npm test 113/113，npm run build 成功；本 PR tests/native-worker.test.mjs 6/6。這些套件有不同測試邊界，不當成同仁正式端到端驗收。原 Windows Cloudflare Device Grant／正式 Worker 設定未移轉，未開啟任一 production gate。六人私密別名及 UID 對照不提交 GitHub。
