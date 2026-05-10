# Claude Code 上下文

## 專案

ShipItAsia v1 — 集運 B2B/B2C SaaS。客戶寄日本 → 埼玉倉暫存 → 合包打包 → 用客戶自己的 carrier 帳號出運單 → 寄到香港。

詳見 `README.md` + `MD/claude_code_overall_review.md`。

## 工作 directory 約定

| 路徑 | 用途 |
|---|---|
| `oms/` | 客戶端服務（Next.js port 3002，DB `vw_sms`）|
| `wms/` | 員工 / admin 服務（Next.js port 3001，DB `vw_wms`）|
| `MD/` | spec 文件，**source of truth**（不要改）|
| `docs/decisions/` | ADR — 跟業主對齊的決策寫進來（檔名 `NNNN-title.md`）|
| `docs/api/` | endpoint 文件（依 phase 補）|

## 紀律死守（reviewer 會 check）

1. **不寫 silent stub**（A2）：未實作的 throw `NOT_IMPLEMENTED` 或 return `{ success: false, errorCode }`
2. **不寫死 if/else carrier_code**（A1）：一律 `carrierAdapterFactory.get(carrier_code)`
3. **動作快照寫子集合**（B5）：主檔不放 weight/photo/location/staff，每次動作寫一筆 `*_scans` append-only
4. **OMS↔WMS sync 走 WebhookDispatcher**（B2）：HMAC + retry 3 + 寫 `webhook_outward_logs`
5. **錢包異動只走 walletService**（A4）：mongoose pre-save hook 防呆
6. **所有業務動作寫 audit_logs**（B1）：enum action + 結構化 details
7. **schema 變更先停下問業主**：spec 是 source of truth

## 何時 escalate（停下問業主）

只在 phase 之間 spec 邏輯犯駁、schema 衝突、業主待提供資料缺失時停下。其他自主決策。詳見 `MD/claude_code_overall_review.md` §10.1。

## Phase 開工 / 收工

- 開工前跑 §4 pre-check（讀 spec / 確認依賴 phase / 確認 mock flag / 確認 audit enum）
- 收工後跑 §5 post-check（AC 全綠 / bug 修法對齊 / schema 對齊 / mock fail loud / sync 雙服務狀態 / commit message 含 phase 編號）

## v1 Mock 規則

dev / staging 全程 mock。prod 切換**不在 v1 範圍**，業主後續處理。

| Env flag | 控制 |
|---|---|
| `PHASE2_USE_MOCK_OAUTH=true` | Fuuffy OAuth |
| `PHASE7_USE_MOCK_CARRIER=true` | rate quote |
| `PHASE8_USE_MOCK_CARRIER=true` | label / cancel（3 個 valid UPS tracking 輪流）|

mock 不可 silent stub，不可 return success 騙上游，必須 fail loud + 寫 valid fixture。

## Commit message 規範

- `P{N}: {summary}` — 例 `P1: cryptoService AES-256-GCM + key rotation hooks`
- `Bug{N}: {summary}` — 例 `Bug6: rebuild item_locations schema, drop locationCode pollution`
- `chore: {summary}` — 雜項
- 一個 commit 對應 spec 一個 sub-step / AC / Bug，不混合

## 既有 ShipItAsia 架構繼承

repo 從 `Viewider/shipitasia_shipping`（OMS）+ `Viewider/shipitasia_wms`（WMS）的本地 main 繼承。13 bug 按各 phase spec 順序修。**保留雙 DB 架構（vw_sms / vw_wms），不可 merge**。

## 新 GitHub remote

- `origin` → `https://github.com/hofomarcohk/shipitasia`（業主新 repo，目前 empty）
- 舊 `Viewider/*` 不再 push（已斷開）
