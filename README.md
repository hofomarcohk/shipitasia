# ShipItAsia v1 — 集運 OMS+WMS

集運 B2B/B2C SaaS。客戶把日本買的東西寄到埼玉倉 → 暫存 → 客戶選一批 → 合包打包 → 用客戶自己的 carrier 帳號（API/OAuth）出運單 → 寄到客戶香港地址。我們不碰物流費金流，只賺處理費 HK$5/包。

## Repo 結構

```
new_shipitasia/
├── oms/                  # 客戶端服務 (Next.js, port 3002, DB: vw_sms)
├── wms/                  # 倉庫員工 / admin 服務 (Next.js, port 3001, DB: vw_wms)
├── MD/                   # v1 spec 文件 (claude_code_overall_review + phase1~9)
├── docs/
│   ├── decisions/        # ADR (architecture decision records)
│   └── api/              # API endpoint 文件
├── .env.example          # 環境變數範本（不含 secret）
└── README.md
```

## 開工

每個 service 獨立安裝依賴 + 跑：

```bash
# OMS (port 3002, 客戶端)
cd oms && pnpm install && cp ../.env.example .env && pnpm dev

# WMS (port 3001, 員工 / admin)
cd wms && pnpm install && cp ../.env.example .env && pnpm dev
```

需要本機跑：
- MongoDB 8（**replica set 模式**，walletService transaction 用）— `mongod --replSet rs0 --bind_ip localhost` + `mongo --eval "rs.initiate()"`
- Redis（ioredis）— `brew services start redis`

## v1 業務參數

| 項目 | 設定 |
|---|---|
| 全局幣別 | HKD |
| 處理費 | HKD$5 / 包（receive 階段扣）|
| 入庫地 | 日本埼玉一個倉 |
| 收貨地 | 香港 |
| 申報幣別 | 依倉庫適配（埼玉倉 = JPY）|
| 金流模式 | 純線下手動入帳，admin 後台核准儲值 |
| v1 carrier | 雲途（API key）+ Fuuffy（OAuth，UPS reseller）|
| 業務量 | ≤ 50 客戶 / 半年 |

## v1 Mock 策略

dev / staging 全程走 mock，**prod 切換不在 v1 範圍**（業主後續跟老闆 + QA 處理）：

| Env flag | 控制 |
|---|---|
| `PHASE2_USE_MOCK_OAUTH=true` | Fuuffy OAuth flow |
| `PHASE7_USE_MOCK_CARRIER=true` | rate quote API call |
| `PHASE8_USE_MOCK_CARRIER=true` | carrier label / cancel API call（輸出 3 個 valid UPS tracking 輪流）|

## 開發紀律（必讀）

詳見 `MD/claude_code_overall_review.md`。重點：

1. **不寫 silent stub**（A2 紀律：fail loud — throw NOT_IMPLEMENTED 或 return errorCode）
2. **不寫死 if/else carrier_code**（A1 紀律：一律走 ICarrierAdapter）
3. **動作快照寫子集合**（B5 紀律：主檔不放 weight/photo/location/staff 等動作資料）
4. **OMS↔WMS sync 走 WebhookDispatcher**（HMAC + retry 3 + 寫 audit）
5. **錢包異動只走 walletService**（A4 紀律 + pre-save hook 防呆）
6. **所有業務動作寫 audit_logs**（B1 紀律）
7. **schema 變更先停下問業主，不自己改**

## Phase 落地順序

```
Wave 1（基建，可平行）— 業主第一次 demo
├── P1 OMS 客戶帳號 + cryptoService + Resend + auditService
├── P2 客戶綁 carrier（雲途 API key + Fuuffy mock OAuth）
└── P3 客戶錢包儲值（HKD，admin 後台手動加值）

Wave 2（inbound 主流程）— 業主第二次 demo
├── P4 客戶建預報（多品項申報）
├── P5 WMS PDA arrive/receive（拍照 + 異常 + 連續模式）+ 扣 HK$5
└── P6 無頭件處理（CS 指派 + 客戶確認接收 / 主動認領）

Wave 3（outbound + 出庫展示）— v1 完工
├── P7 客戶建出庫單（合併 / single + rate quote + 餘額閘）
├── P8 WMS 倉內出庫（揀貨 → 裝箱 → 複重 → 取 label → 列印 → 離倉）
└── P9 客戶 OMS「已出庫」分頁（純展示 + UPS tracking 跳轉）
```

每 phase 開工前跑 `MD/claude_code_overall_review.md` §4 pre-check、收工跑 §5 post-check。

## 雙 DB 架構

OMS 用 `vw_sms`，WMS 用 `vw_wms`。**不可 merge**（破壞既有 ShipItAsia 架構）。Cross-service 變更走 `WebhookDispatcher`（HMAC + retry + audit）。

## 既有 ShipItAsia 繼承狀態

新 repo 從 `Viewider/shipitasia_shipping`（OMS）+ `Viewider/shipitasia_wms`（WMS）的本地 main 分支繼承既有架構。13 個既知 bug（見 `shipitasia_session_summary.md`）按各 phase spec 修復順序處理：

- Bug 1（WMS 後台建預報 API）→ P4 修
- Bug 2-5（OMS↔WMS departure sync 鏈式）→ P8 修
- Bug 6（pick 污染 item_locations.locationCode）→ P5 schema 預修 + P8 service 驗證
- Bug 7（sync 沒 token 驗證）→ P2 / P4 順手修
- Bug 8（logistic-service 只 yunexpress）→ P7 carrier 抽象層解
- Bug 9（logistic-party 沒 CRUD）→ 不修（被 P2 carriers 主檔取代）
- Bug 10-13 → 視 phase 順手清理

## Reference 文件

- `MD/claude_code_overall_review.md` — master plan（必讀）
- `MD/phase1_oms_account.md` ~ `MD/phase9_oms_outbound_shipped.md` — 9 個 phase spec
- `/Volumes/External/其他AI開發/fuuffy_lessons_for_shipitasia.md` — Fuuffy 借鏡 + 避坑（B1-B7 / A1-A9）
- `/Volumes/External/其他AI開發/shipitasia_session_summary.md` — 既有 ShipItAsia 觀察 + 13 bug 清單
