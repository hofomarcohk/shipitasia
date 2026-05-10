# 集運 OMS+WMS v1 — Claude Code 落地總綱

> 給 Claude Code 看的 master plan。
> 版本：v1.0
> 日期：2026-05-10
> 對應 spec：phase1 ~ phase9 共 9 個 markdown
> 對應 reference：fuuffy_lessons_for_shipitasia.md / shipitasia_session_summary.md

---

## 0. 開場：給 Claude Code 看

### 0.1 你是誰

你是這個專案的 senior full-stack agent，獨立完成從 schema → service → API → 前端 → 測試的所有工作。沒有開發團隊，只有你一個 + 業主一個。

### 0.2 業主是誰

業主 = 這個 repo 的擁有者，會在你需要決策時介入。**業主已經把 9 個 phase 的 spec 全部寫好給你了**，理論上你不該再來問業主「這個怎麼做」這種問題。

### 0.3 業務一句話

**集運 B2B/B2C SaaS。** 客戶把日本買的東西寄到我們埼玉倉 → 我們暫存 → 客戶選一批 → 我們合包打包 → 用客戶自己的 carrier 帳號（API/OAuth）出運單 → 寄到客戶香港地址。我們**不碰物流費金流**，只賺處理費 HK$5/包。

### 0.4 完工標準

- 9 個 phase 全部 spec AC 通過 + 業主驗收 OK
- 雙 DB（vw_wms / vw_sms）狀態流轉正確
- 4 個 mock env flag 全綠（dev/staging 純 mock 跑通）
- 沒有引入新 bug（不破壞 ShipItAsia 既有未在 Bug 1-13 列表內的功能）
- 沒有 silent stub（fail loud 是紀律）

### 0.5 紀律總綱（必讀）

1. **agent mode 自主決策。** 不用每件事問業主，能判斷就判斷。
2. **唯一例外**：當你發現 phase 之間 spec 邏輯犯駁、互相矛盾、或你對某個 spec 的解讀和你正在依賴的另一個 phase 不一致時，**必須停下來問業主**，不要自己選一邊。
3. **不寫 silent stub**。未實作的功能 throw `NOT_IMPLEMENTED` 或 return `{ success: false, errorCode }`。詳見 §8.1。
4. **不寫死 if/else carrier_code**。詳見 §8.2。
5. **照 Wave 1 → Wave 2 → Wave 3 順序開工**（§2）。Wave 內可平行。
6. **每個 phase 開工前讀 §4 pre-check + 完成後讀 §5 post-check**。每個 phase 都跑這兩個 checklist。
7. **mock 為 v1 dev/staging 唯一模式**。prod 切換是業主負責的後續工作（業主會跟老闆 + QA 做大更新），你**不需要實作 prod 切換流程**，只要保證 mock 模式 self-contained 即可。
8. **不要重寫 9 個 phase spec 已寫好的內容**。spec 是 source of truth，你的工作是把 spec 翻譯成 code，不是修改 spec。
9. **不要主動改 schema**。如果你覺得 spec 的 schema 有問題，停下來問業主，不要自己改完就繼續。

---

## 1. 全局約定（讀完才能開工）

### 1.1 業務脈絡

| 項目 | 設定 |
|---|---|
| 業務模式 | 白牌物流（呼叫客戶自己的 carrier API/OAuth 取 label）|
| 我們的角色 | 倉儲處理 + label 取得橋樑 |
| 我們不碰 | 物流費金流（label 費由客戶 carrier 帳號內扣） |
| 我們賺什麼 | 處理費 HK$5/包，receive 階段扣 |
| 客戶端 | OMS（給客戶用）|
| 倉庫端 | WMS（給內部員工用）|
| 物理倉庫位置 | 日本埼玉（v1 唯一一個）|
| 收貨地 | 香港 |
| 業務量上限（v1 半年）| ≤ 50 客戶，月 5-10 單/客戶，全系統 ≤ 3000 單/半年 |

### 1.2 v1 全局業務參數

| 項目 | 值 |
|---|---|
| 全局幣別 | **HKD**（錢包、處理費、運費試算）|
| 處理費 | HK$5/包（receive 階段扣，不在 arrive）|
| 申報幣別 | 依倉庫適配（埼玉倉 → JPY）|
| 金流模式 | **不接金流**，純線下手動入帳 |
| 客戶儲值方式 | 客戶通知業主入帳，業主在 admin 後台手動加值 |
| v1 carrier | 雲途（API key）+ Fuuffy（OAuth，UPS reseller）|
| v1 主力 carrier | Fuuffy（90%+ 流量走這條）|
| 客戶數量 | ≤ 50 客戶（v1 不需考慮分頁優化）|

### 1.3 技術棧（嚴格遵守）

| 項目 | 版本 |
|---|---|
| Node.js framework | Next.js 16 + Turbopack |
| React | 18 |
| 語言 | TypeScript |
| DB | MongoDB 8（**雙 DB**：vw_wms / vw_sms）|
| Cache / 短期 token | Redis |
| Auth | custom JWT（沿用 ShipItAsia）|
| CSS | Tailwind |
| UI 元件庫 | shadcn/ui |
| Icon | Tabler icons |
| 加密 | Node `crypto` + AES-256-GCM（cryptoService，Phase 1 建）|
| 寄信 | Resend（Phase 1 建）|

**禁止**：
- 不要引入未列出的 framework / library 而不問業主
- 不要降版（業主對 Next.js 16 + React 18 + Mongo 8 有 commitment）
- 不要把 vw_wms 和 vw_sms merge 成單一 DB（雙 DB 是 ShipItAsia 既有架構，破壞會死）

### 1.4 雙服務 / 雙 DB 架構

```
┌─────────────────────────┐         ┌─────────────────────────┐
│  OMS (port 3002)        │         │  WMS (port 3001)        │
│  客戶用                  │         │  員工/admin 用           │
│                         │ ←sync→  │                         │
│  DB: vw_sms             │         │  DB: vw_wms             │
└─────────────────────────┘         └─────────────────────────┘
        ↓                                      ↑
        └─── 客戶（B2B/B2C）─────────────────┘
                                               WMS admin
```

**Sync 規則：**
- OMS 和 WMS 各自有自己的 collection（部分 collection 雙寫，例如 `outbound_requests` 在兩邊都有 mirror）
- 跨服務變更走 `/api/(oms|wms)/sync/*` endpoint
- 統一 header：`X-Internal-Sync: <signature>`（HMAC + shared secret env）
- 統一機制：`WebhookDispatcher` service（HMAC + retry 3 次 + 寫 `webhook_outward_logs`），Phase 7 已建
- 失敗：寫 `sync_failed_logs`，**不 rollback 業務**，admin UI 看 retry queue
- 細節：見 fuuffy 借鏡 B2 + B4

### 1.5 ID 格式（嚴格遵守）

| Entity | 格式 | 範例 |
|---|---|---|
| 預報 inbound | `I-YYYYMMDD-NNNN` | `I-20260510-0001` |
| 出庫 outbound | `OUT-YYYYMMDD-NNNN` | `OUT-20260510-0001` |
| 箱號 | `B-OUT-YYYYMMDD-NNNN-NN` | `B-OUT-20260510-0001-01` |
| 客戶帳號 | mongo ObjectId（沒特殊格式）| `66bd...` |
| Tracking number（carrier）| carrier 端決定 | `1ZB87K33...` |

**實作：** 用 mongo `daily_counters` collection 原子 +1，application 層拼接（避免並發撞號）。Phase 4 已建 daily_counters schema。

### 1.6 4 個 mock env flag（v1 dev/staging 唯一模式）

| Env flag | Phase | 控制什麼 |
|---|---|---|
| `PHASE2_USE_MOCK_OAUTH` | P2 | Fuuffy OAuth flow 走 mock（不打真實 Fuuffy authorize URL）|
| `PHASE7_USE_MOCK_CARRIER` | P7 | rate quote API call 走 mock |
| `PHASE8_USE_MOCK_CARRIER` | P8 | carrier label/cancel API call 走 mock，**輸出 3 個 valid UPS tracking 輪流**（Phase 9 spec §6）|
| ~~`PHASE9_USE_MOCK_WEBHOOK`~~ | ~~P9~~ | **已剔除**（P9 不做 webhook，只做純 OMS 顯示）|

**規則：**
- v1 dev/staging 全程 4 個 flag = `true`
- prod 切換**不在你（Claude Code）責任範圍**
- 業主會跟老闆 + QA 做大更新切 prod，你只要保證 mock 模式 self-contained 跑通

**Mock 行為紀律：**
- mock 不能 silent stub（不能假裝 API call 成功）
- mock 寫真實 valid 資料（例如 P8 mock 寫真實 valid UPS tracking）
- mock fixture 用 hash mod N（例如 `outbound_box_id` djb2 hash mod 3）做 reproducible

### 1.7 OMS↔WMS sync 統一機制（共用 service）

**呼叫端：** 用 `WebhookDispatcher.dispatch(url, payload, opts)`，自動處理：
- HMAC-SHA256 簽名 header（`X-Internal-Sync`）
- 3 次 retry，0.5s backoff
- 每次 attempt 寫 `webhook_outward_logs`
- 失敗 alert（寫 `sync_failed_logs`，admin UI 標紅）

**接收端：** 用 `webhookAuthHelper.verify(req)`：
- 驗 `X-Internal-Sync` header
- 失敗 401 + 寫 `audit_logs`（type: `sync_auth_failed`）

**用途：**
- OMS → WMS（client 動作觸發 WMS 改 collection，如建單）
- WMS → OMS（員工動作觸發 OMS 改 mirror，如 status 流轉）
- carrier API call（WebhookDispatcher 也用於對外，沿用同 retry/audit 機制）

**禁止：**
- 不要繞過 dispatcher 直接 fetch
- 不要 hardcode 不寫 audit
- 不要跳過 HMAC

### 1.8 Fuuffy 借鏡 B1-B7 速查

> 詳細見 `fuuffy_lessons_for_shipitasia.md` §2

| 編號 | 標題 | 一句 take-away | 哪些 phase 用到 |
|---|---|---|---|
| B1 | log_item_action 結構化動作日誌 | enum action + JSON details，所有業務動作寫 `audit_logs` | 全部 phase |
| B2 | WebhookService.dispatch | HMAC + retry 3 次 + 寫 outward log，**Phase 7 已建 service** | P4+ |
| B3 | Airwallex HMAC timing-safe verify | raw body + timestamp + timingSafeEqual，3 防（序列化/replay/timing）| 接收 webhook 用（P9 v1 不做）|
| B4 | client-id header + audit | 雙服務內部 API 統一驗證，失敗寫 audit | 全部 sync endpoint |
| B5 | parcel 主檔 vs 動作快照拆分 | 主檔不放動作資料，子集合 append-only 紀錄每次動作 | P4/P5/P7/P8（inbound_scans / outbound_scans / outbound_box_weights）|
| B6 | 多包裹綁主出貨單（中介表）| append-only 中介表（如 `outbound_inbound_links`）+ 列印模板註冊制 | P7/P8 |
| B7 | warehouse-level scan_config | 每倉客製 mandatory fields | P5 |

### 1.9 ShipItAsia 避坑 A1-A6 速查

> 詳細見 `fuuffy_lessons_for_shipitasia.md` §3

| 編號 | 標題 | 教訓 |
|---|---|---|
| A1 | 沒 carrier 抽象層 | **嚴禁** hardcoded `if/else carrier_code`。一律走 ICarrierAdapter |
| A2 | silent stub return success | mock / 未實作功能 **必須 fail loud**，throw 或 return errorCode |
| A3 | 雙服務 webhook contract 沒對齊 | OMS+WMS 共用 type definition，CI contract test |
| A4 | 沒 wallet 概念 | wallet 是 v1 必備（Phase 3）。**不要簡化掉**|
| A5 | CS 兜底成萬能 | 業務分流走結構化 enum，不要「請聯繫客服」當萬能 fallback |
| A6 | remarks 萬能 | employee_note / staff_note 只供 audit 看，不做業務邏輯 |

### 1.10 ShipItAsia Bug 1-13 速查

> 詳細見 `shipitasia_session_summary.md` §2

| Bug | 嚴重度 | 修在哪 phase | 一句說明 |
|---|---|---|---|
| 1 | M | P4 | WMS 後台建預報 API 沒做（schema 已存在但 service 缺）|
| 2 | M | P8 §1.12.1 | departure 推 OMS 時重複 orderIds |
| 3 | M | P8 §1.12.1 | OMS 接收做嚴格長度比對導致 ORDER_NOT_FOUND |
| 4 | M | P8 §1.12.2 | OMS error-list 缺 ORDER_NOT_FOUND |
| 5 | M | P8 §1.12.3 | OMS updateOutboundStatus CANCEL case 漏 break |
| 6 | M | P5 §2.2 schema 重做 + P8 §1.12.4 service | PDA pick 把 `item_locations.locationCode` 覆蓋成 staffId |
| 7 | M（安全）| P2/P4 sync 端點全部走新統一機制 | `/api/wms/utils/sync` 沒做 token 驗證 |
| 8 | N | Phase 7/8 carrier 抽象層解 | logistic-service 只有 yunexpress 分支 |
| 9 | M | **不修**（被 Phase 2 carriers 主檔取代）| logistic-party 沒 CRUD |
| 10 | N | 視 phase | OMS 出庫驗證錯誤訊息 i18n 不解析 |
| 11 | N | 清理階段 | WMS 兩個 dead route 用壞 lang() 寫 |
| 12 | N | 已順手修 | OMS bill/list init 是 () => async () => {} |
| 13 | N | 已順手修 | OMS 入庫請求 init nullable date 為 null |

**規則：** 你開工每個 phase 前查表，看當前 phase 要修哪些 bug，照 phase spec §「ShipItAsia 既有現況對映」做。

### 1.11 共用 collection schema 速查

> 9 個 phase spec 內有完整定義，這裡只列哪個 phase 建立了哪個 collection

| Collection | 建在 phase | 用途 |
|---|---|---|
| `clients` | P1 | OMS 客戶帳號（既有，P1 擴充）|
| `carriers` | P2 | carrier 主檔（雲途 / Fuuffy）|
| `client_carrier_accounts` | P2 | 客戶綁的 carrier 帳號 |
| `wallets` | P3 | 客戶錢包（HKD）|
| `wallet_transactions` | P3 | 錢包交易 append-only |
| `inbound_requests` | P4（既有改造）| 預報主檔 |
| `inbound_declared_items` | P4 | 多品項申報子集合 |
| `inbound_scans` | P5 | PDA arrive/receive 動作 append-only |
| `item_locations` | P5（重做）| 庫位 |
| `product_categories` | P4 | 大類/子類兩階層 |
| `daily_counters` | P4 | 原子 +1 序號 |
| `notifications` | P4（schema） / P9（UI 用）| 客戶通知 |
| `audit_logs` | 全部 phase | Fuuffy B1 結構，append-only |
| `outbound_requests` | P7 | 出庫主檔 |
| `outbound_inbound_links` | P7 | 中介表 append-only |
| `outbound_boxes` | P8 | 箱主檔 |
| `outbound_box_weights` | P8 | 複重快照 append-only |
| `box_inbound_links` | P8 | 中介表 append-only |
| `outbound_scans` | P8 | 員工物理動作 append-only |
| `outbound_action_logs` | P7 | outbound 級動作 append-only |
| `webhook_outward_logs` | P4+（共用）| 對外 webhook 派送 audit |
| `sync_failed_logs` | P2+（共用）| sync 失敗紀錄 |
| `daily_counters` | P4 | ID 序號 |

### 1.12 共用 service 速查

| Service | 建在 phase | 用途 |
|---|---|---|
| `cryptoService` | P1 | AES-256-GCM 加解密（用於 carrier credentials_enc）|
| `notificationService` | P4 | 寫 notifications + 寄信（用 Resend）|
| `walletService` | P3 | 錢包儲值/扣費/餘額查詢/凍結 |
| `WebhookDispatcher` | P7 | OMS↔WMS sync + carrier API call 統一機制 |
| `webhookAuthHelper` | P2/P4 | 接收端 sync header 驗證 |
| `outboundService` | P7/P8 | outbound 主流程業務邏輯 |
| `inboundService` | P4/P5 | inbound 主流程業務邏輯 |
| Carrier adapter | P7/P8 | ICarrierAdapter interface（rateQuote / createLabel / cancelLabel / getTracking 4 個方法）|
| `pdfService` | P7（mock label）/ P8 擴展 | PDF 生成（label / packing list / box label / location label）|

### 1.13 必讀 reference

開工前**必須**讀完這幾個 md，內化思維：

1. `shipitasia_session_summary.md` — 既有 ShipItAsia repo 跑過 happy path 的觀察 + Bug 1-13 完整描述
2. `fuuffy_lessons_for_shipitasia.md` — 集運業務借鏡 + 避坑詳細 case study
3. **9 個 phase spec**（按你開工 phase 對應讀，但建議先快速通讀全部 9 個再開工，避免後 phase 才發現前 phase 漏做）

---

## 2. 落地順序：Wave 1 → Wave 2 → Wave 3

### 2.1 依賴關係

```
Wave 1（基礎建設，可平行）
├── P1 OMS 客戶帳號
├── P2 客戶綁 carrier
└── P3 客戶錢包儲值

           ↓（全 Wave 1 完成）

Wave 2（inbound 主流程，P4 完成後 P5 P6 可平行）
├── P4 客戶建立入庫預報
└──→ P5 WMS 倉內簽入（PDA arrive + receive）
└──→ P6 WMS CS 處理無頭件 + 客戶確認接收 + 客戶主動認領
        (P5 P6 可平行，因為 P6 用到 P5 的 schema 但業務邏輯獨立)

           ↓（全 Wave 2 完成）

Wave 3（outbound 主流程 + 出庫展示，P7 完成後 P8 P9 可平行）
├── P7 客戶建出庫單合併 + 試算 + 處理偏好
└──→ P8 WMS 倉內出庫流程（揀貨/裝箱/複重/離倉）
└──→ P9 客戶 OMS 已出庫追蹤頁
        (P9 純前端 + read-only API，可在 P8 完成 schema 後立即開工)
```

### 2.2 各 wave 完成標準

#### Wave 1 完成 = 業主第一次 demo
- 客戶可以註冊登入（P1）
- 客戶可以綁 carrier 帳號（P2，mock OAuth + 雲途 API key 都跑通）
- 客戶可以儲值錢包（P3，admin 後台手動加值 + 客戶看到餘額）
- WMS admin 可以建 carrier 主檔（P2 admin 端）
- 業主能跟潛在客戶 demo「我們有客戶帳戶系統」

#### Wave 2 完成 = 業主第二次 demo
- 客戶可以建預報（P4，多品項申報、buyandship 風格）
- WMS 員工可以 PDA arrive + receive（P5，含拍照、異常、連續模式）
- 處理費 HK$5 在 receive 時扣（P3+P5 整合）
- 無頭件 admin 可以指派、客戶可以確認接收 / 主動認領（P6）
- 業主能跟客戶 demo「整套 inbound 簽收流程」

#### Wave 3 完成 = v1 整體完工
- 客戶可以建出庫單（P7，合併 / single 模式、試算）
- WMS 員工可以走完出庫流程（P8，揀貨 → 裝箱 → 複重 → 取 label → 列印 → 離倉）
- mock label 取得用 3 個 valid UPS tracking（P9 §6 update）
- 客戶 OMS「已出庫」頁可以看 tracking + 跳 UPS 官網（P9）
- 業主能跟客戶 demo「整套 outbound 出貨流程」+ 把 v1 交給老闆 + QA 做 prod 切換準備

### 2.3 wave 間的暫停點

**Wave 1 完成 → Wave 2 開工前**：跑一次 `pnpm test`（或既有測試指令）+ 確認所有共用 service（cryptoService / WebhookDispatcher / notificationService / walletService）都已就位。Wave 2 大量依賴這些。

**Wave 2 完成 → Wave 3 開工前**：跑一次端到端：客戶建預報 → WMS arrive → receive → 錢包扣費 → CS 處理無頭件，全綠。Wave 3 出庫流程依賴 inbound 資料品質。

### 2.4 wave 內平行開工策略

**Wave 1**：P1 必須先做（auth 是 P2 P3 前置）。P1 完成後 P2 P3 可平行。

**Wave 2**：P4 必須先做（schema 是 P5 P6 前置）。P4 schema + Phase 4 service 完成後，P5 P6 可平行。

**Wave 3**：P7 schema 必須先做（outbound_requests / outbound_inbound_links 是 P8 P9 前置）。P7 service 完成後，P8 P9 可平行。

**注意：** 「P5 P6 可平行」不代表你開兩個 agent。你是單一 agent 序列做事，「可平行」是指**順序不重要**，先做哪個都可以。

---

## 3. 9 個 phase 一句話 summary + spec 在哪

| Phase | 範圍一句話 | spec 文件 | 大致工作量（行/檔案）|
|---|---|---|---|
| P1 | OMS 客戶帳號（註冊/登入/重設密碼/個資管理）+ cryptoService + Resend | `phase1_oms_account.md` | 中 |
| P2 | 客戶綁 carrier 帳號（雲途 API key + Fuuffy OAuth + mock OAuth flow）| `phase2_carrier_binding.md` | 大 |
| P3 | 客戶錢包儲值（HKD、線下手動入帳、admin 後台加值、餘額查詢、凍結）| `phase3_oms_wallet.md` | 中 |
| P4 | 客戶建預報（多品項申報、buyandship 風格、單筆/批次 placeholder、廢棄/取消）| `phase4_oms_inbound_declaration.md` | 大 |
| P5 | WMS PDA arrive/receive（拍照、異常 4 種、連續模式、扣處理費）| `phase5_wms_inbound_scanning.md` | 大 |
| P6 | WMS CS 處理無頭件指派 + 客戶確認接收 + 客戶主動認領 + 30+30 警告 → 廢棄 cron | `phase6_unclaimed_processing.md` | 大 |
| P7 | 客戶建出庫單（合併/single、carrier 試算、餘額閘、處理偏好、admin retry）| `phase7_oms_outbound_creation.md` | 巨大 |
| P8 | WMS 出庫流程（揀貨 PDA+桌面雙路徑、裝箱、複重、取 label、列印、離倉、carrier label adapter）| `phase8_wms_outbound_processing.md` | 巨大 |
| P9 | 客戶 OMS「已出庫」分頁（純展示 + tracking 跳 UPS 官網）+ Phase 8 mock update | `phase9_oms_outbound_shipped.md` | 小 |

**注意：** P7 和 P8 是巨大 phase，每個都涵蓋 2-3 週的工作量。預先評估好別硬塞進一個 sprint。

---

## 4. 每個 phase 開工前 mandatory pre-check

每個 phase 開工**必跑**這個 checklist：

### 4.1 文件 pre-check

- [ ] 完整讀一次該 phase spec（不要跳章）
- [ ] 該 phase spec §「前置」列的依賴 phase 是否都完成
- [ ] 該 phase spec §「ShipItAsia 既有現況對映」表，列出要重做 / 棄用 / 修 bug 的東西
- [ ] 該 phase spec §「Fuuffy 借鏡」確認哪些 B/A 條目要套用
- [ ] 該 phase spec §「邊角 case」全部讀過

### 4.2 Skills pre-check（依該 phase 工作內容）

- [ ] 如果要改 Word 文檔 → 讀 `/mnt/skills/public/docx/SKILL.md`
- [ ] 如果要建 PDF（label / packing list）→ 讀 `/mnt/skills/public/pdf/SKILL.md`
- [ ] 如果要寫前端 React 元件 → 讀 `/mnt/skills/public/frontend-design/SKILL.md`
- [ ] 如果要做 code review → 讀 `/mnt/skills/user/code-review/SKILL.md`
- [ ] 如果遇到 Anthropic API 整合問題 → 讀 `/mnt/skills/public/product-self-knowledge/SKILL.md`

### 4.3 Repo pre-check

- [ ] 確認 ShipItAsia repo 既有結構（`pnpm install` / `pnpm dev` 跑得起來）
- [ ] 確認雙 DB 連線正常（vw_wms / vw_sms）
- [ ] 確認既有 phase 留下的 collection / service 在當前 branch 都存在
- [ ] git status 乾淨，從正確的 base branch 開新 branch

### 4.4 約定 pre-check

- [ ] 該 phase 涉及的 4 個 mock env flag，都已在 `.env.local` 設好 `true`
- [ ] 該 phase 涉及的 audit_logs action 名稱已 enum 化（不是裸字串）
- [ ] 該 phase 涉及的 notification type 已 enum 化
- [ ] 該 phase 涉及的 cross-service sync endpoint 走 WebhookDispatcher（不裸 fetch）

### 4.5 自我檢查邏輯

如果 pre-check 任一項跳出問題，**先解決問題再開工**。pre-check 紅燈強行開工 = 後面 debug 時間 10x 起跳。

---

## 5. 每個 phase 完成後 mandatory post-check

每個 phase 完成**必跑**這個 checklist 才能標記「該 phase 完成」：

### 5.1 Spec AC 對齊

- [ ] 該 phase spec §「AC（Acceptance Criteria）」逐條跑過，全綠
- [ ] AC 中提到的「測試」項目都跑過
- [ ] AC 中的 edge case 都驗證

### 5.2 Bug 修復對齊

- [ ] 該 phase spec §「ShipItAsia 既有現況對映」中「修 Bug X」都修了
- [ ] 修 bug 的 commit 訊息含 Bug X 編號
- [ ] 修 bug 後沒破壞既有未列在 Bug 1-13 的功能

### 5.3 Schema 對齊

- [ ] 該 phase spec §「Schema 變更」中所有新增 / 改造的 collection / 欄位都在 mongo 可見
- [ ] Indexes 都建立（含 partial index、複合 index）
- [ ] Schema validation rule（zod / mongoose schema）跟 spec 一致
- [ ] 既有 collection 改造**沒**動到 spec 沒提到的欄位（不要無聲改動）

### 5.4 Service 紀律

- [ ] 沒寫 silent stub（grep `return.*success.*true.*placeholder` / `// TODO.*replace.*` 等 pattern）
- [ ] 沒寫死 carrier_code if/else（grep `carrier_code === 'yunexpress'` / `if.*fuuffy` 等）
- [ ] 動作資料**沒**塞進主檔欄位（B5 紀律）
- [ ] OMS↔WMS sync 走 WebhookDispatcher（沒裸 fetch）
- [ ] 所有業務動作寫 audit_logs（B1 紀律）

### 5.5 Test 對齊

- [ ] 既有 unit test 全綠
- [ ] 該 phase 新增 unit test（service 層 happy path + 主要 edge case）
- [ ] AC 中的關鍵 happy path 至少有 1 個 integration test

### 5.6 Mock 紀律

- [ ] mock 模式（4 個 env flag = true）下，該 phase 業務流程跑得通
- [ ] mock 不 silent fail（fail loud）
- [ ] mock 寫 valid 資料（不寫 garbage placeholder）

### 5.7 Sync 雙服務狀態

- [ ] OMS 端 collection 狀態跟 WMS 端 collection 狀態對齊（無 stale mirror）
- [ ] sync 失敗有寫 sync_failed_logs，admin 看得到 retry queue

### 5.8 文件對齊

- [ ] 該 phase 新增 / 改造的 endpoint 都記錄在 README 或 API doc
- [ ] 重要決策寫進 `/docs/decisions/` 的 ADR（architecture decision record）
- [ ] 該 phase commit 訊息引用 phase 編號（例：`P5: PDA arrive scan with photo and exception`）

---

## 6. 跨 phase 共用 collection schema

這些 collection 多個 phase 都會寫入。schema 主定義在第一個建立的 phase，後續 phase 只能 append-only 加欄位（不能改既有欄位語義）：

### 6.1 audit_logs（B1 結構，全 phase append）

主定義在 P1（cryptoService 上線時就要 audit）。Schema：

```typescript
{
  _id: string,
  action: enum,                  // 全 phase 共用 action enum，新增動作要 append
  actor_type: enum,              // client / admin / staff / system / wms_staff
  actor_id: string,              // client_id / staff_id / admin_id
  target_type: enum,             // inbound / outbound / wallet / carrier_account / box / staff
  target_id: string,
  details: object,               // 自由 metadata JSON
  warehouse_code: string?,       // 動作發生在哪倉（如有）
  created_at: date,              // 不可修改
  ip_address: string?,           // 來源 IP（如有）
  user_agent: string?
}
```

**規則：**
- append-only（不可 update / delete）
- action enum 集中管理在 `/src/constants/auditActions.ts`
- 加新 action 要寫進 enum 才能用
- 不可繞過 service 層直接寫 audit_logs（一律走 `auditService.log(...)`）

### 6.2 notifications（P4 schema，後 phase 加 type）

主定義在 P4。Schema：

```typescript
{
  _id: string,
  client_id: string,
  type: enum,                    // 全 phase 共用 enum，後續 phase append
  title: string,                 // 顯示給客戶看的標題（已翻譯）
  body: string,                  // 內文（已翻譯）
  related_entity_type: enum?,
  related_entity_id: string?,
  read_at: date?,
  channel: enum,                 // in_app / email / both
  email_sent_at: date?,
  email_resend_id: string?,
  created_at: date
}
```

**規則：**
- type enum 在 `/src/constants/notificationTypes.ts`
- 寫入走 `notificationService.send(client_id, type, payload)`
- 不可繞過 service 直接寫 collection
- email 走 Resend（P1 建）

### 6.3 sync_failed_logs / webhook_outward_logs

主定義在 P2 / P4。Schema 沿用 fuuffy B2。**全 phase 共用，不要重新發明輪子**。

### 6.4 daily_counters

主定義在 P4。用於 ID 序號（I-... / OUT-... / B-...）。**全 phase 用同一個 collection**，document key 區分 entity（例：`{ _id: 'inbound_20260510', count: 7 }`）。

---

## 7. 跨 phase 共用 service

### 7.1 已建（不要重做）

| Service | 入口 | Phase |
|---|---|---|
| cryptoService.encrypt(text) / decrypt(blob) | `/src/services/crypto.ts` | P1 |
| notificationService.send(client_id, type, payload) | `/src/services/notification.ts` | P4 |
| walletService.charge / topup / freeze / getBalance | `/src/services/wallet.ts` | P3 |
| WebhookDispatcher.dispatch(url, payload, opts) | `/src/services/webhookDispatcher.ts` | P7 |
| webhookAuthHelper.verify(req) | `/src/_helper/webhookAuthHelper.ts` | P2/P4 |
| auditService.log(action, target, details, actor) | `/src/services/audit.ts` | P1 |
| pdfService.generateMockLabel(box) | `/src/services/pdf.ts` | P7 |

### 7.2 共用 interface（一定要走 adapter pattern）

- `ICarrierAdapter`（P7 建）— 4 個方法：`rateQuote / createLabel / cancelLabel / getTracking`
  - 實作：`adapters/carriers/yunExpressAdapter.ts` / `adapters/carriers/fuuffyAdapter.ts` / `adapters/mock/mockCarrierAdapter.ts`
  - **嚴禁** 在主流程寫死 if/else carrier_code（A1 死守）

---

## 8. 規格紀律：不准做的事

### 8.1 不准 silent stub（A2 紀律）

❌ 錯誤：
```typescript
async function processGroupShipmentPayment() {
  return { success: true, label_pdf: PLACEHOLDER }; // silent stub
}
```

✅ 正確（兩種任選）：
```typescript
async function processGroupShipmentPayment() {
  throw new Error('NOT_IMPLEMENTED: pending Phase 8 carrier label flow');
}
// or
async function processGroupShipmentPayment() {
  return { success: false, errorCode: 'NOT_IMPLEMENTED' };
}
```

**Lint rule 建議：** 寫一個 ESLint rule 禁止 `// TODO.*replace.*` + return placeholder pattern。

### 8.2 不准寫死 if/else carrier_code（A1 紀律）

❌ 錯誤：
```typescript
if (carrier_code === 'yunexpress') { ... }
else if (carrier_code === 'fuuffy') { ... }
```

✅ 正確：
```typescript
const carrier = await getCarrierByCode(carrier_code);
const adapter = carrierAdapterFactory.get(carrier_code);
const result = await adapter.createLabel(payload);
```

### 8.3 不准把動作資料塞進主檔欄位（B5 紀律）

❌ 錯誤：把 `weight / dimension / photo / location / operator_id` 塞進 `inbound_requests` 主檔，每次 PDA 重掃 in-place 覆寫。

✅ 正確：主檔只保留「最新狀態 + reference」，動作快照寫子集合 `inbound_scans`（append-only）。

### 8.4 不准跳過 SKILL.md

如果你要做 docx / pdf / pptx / xlsx / 前端，**先 view 對應 SKILL.md**。SKILL 是這個環境特有的最佳實踐，跳過會出錯。

### 8.5 不准未經業主 ack 改 schema

如果你看 spec 覺得 schema 設計不對，**停下來問業主**。不要自己改完繼續走。理由：
- spec 是業主已經跟業務需求對齊過的版本
- 你看到的「不對」可能是你還沒讀到後面 phase 的依賴
- schema 改動牽動跨 phase 的 sync / audit / notification

### 8.6 不准把多個 ticket 的改動合進一個 commit

每個 commit 對應 spec 中的一個 sub-step / AC / Bug。理由：
- 業主審 PR 看得清楚
- 出問題容易 rollback
- diff 小不超過 review 上限

### 8.7 不准跳過 audit_logs

任何業務動作（建單 / 改 status / 扣費 / 發通知 / 取消 / 廢棄）都要寫 audit_logs。

### 8.8 不准繞過 walletService 直接改 wallet.balance

❌ 錯誤：`db.wallets.update({ _id }, { $inc: { balance: -5 } })`

✅ 正確：`await walletService.charge(client_id, 5, { type: 'inbound_processing_fee', target_id: inbound_id })`

### 8.9 不准繞過 WebhookDispatcher 做 cross-service sync

OMS↔WMS 之間的任何寫入動作必須走 dispatcher。

### 8.10 不准重寫 spec

如果你發現 spec 不對 / 過時 / 矛盾，停下來問業主。**不要自己改 spec md**。spec 是 source of truth，business owner 拍板。

---

## 9. Day 1 開工 checklist

第一天（Wave 1 P1 開工前）必跑：

### 9.1 環境

- [ ] Clone ShipItAsia repo
- [ ] `pnpm install` 在 wms 跟 oms 兩個 service 都跑通
- [ ] 雙 DB 連線（local mongo 8 + redis）
- [ ] `pnpm dev` 兩個 service 都能跑起（port 3001 / 3002）
- [ ] 跑 ShipItAsia 既有 happy path 一次（建 inbound → arrive → receive → outbound → pick → pack → palletize → departure），確認既有功能可用

### 9.2 文件

- [ ] 通讀 9 個 phase spec（不要跳）
- [ ] 通讀 `shipitasia_session_summary.md`
- [ ] 通讀 `fuuffy_lessons_for_shipitasia.md`
- [ ] 讀 `/mnt/skills/public/` 底下相關 SKILL.md 做索引（不一定全讀，但知道有什麼）

### 9.3 約定

- [ ] 在 repo 開 `/docs/decisions/` 目錄（裝 ADR）
- [ ] 在 repo 開 `/docs/api/` 目錄（裝 endpoint doc）
- [ ] 確認 4 個 mock env flag 在 `.env.example` 列出 + `.env.local` 設好
- [ ] 確認 README 列出 4 個 phase wave 的開工順序（你自己寫，給業主跟未來的 onboarding 用）

### 9.4 Git

- [ ] 從 main / master 開新 branch `wave1-p1-account`
- [ ] 確認 git config user.email / user.name
- [ ] commit 訊息規範：`P{N}: {summary}` 或 `Bug{N}: {summary}` 或 `chore: {summary}`

---

## 10. 業主（你）的角色：什麼時候 Claude Code 要 escalate 給你

Claude Code agent mode 自主運行，**只在以下情況 escalate**：

### 10.1 必須 escalate 的情況

- (E1) **Phase 之間 spec 邏輯犯駁** — 例如 P5 spec 說 `inbound_scans.action` enum 有 'arrive' / 'receive' / 'reweight'，但 P8 spec 說 reweight 動作是 `outbound_scans.type='box_weight_verified'`。這兩個是同一個動作嗎？escalate
- (E2) **Schema 跟 service 設計衝突** — 例如 spec 說 `outbound_requests.processing_preference` 是 client-level 設定，但 spec 又說 single 模式強制 auto。這是 client 層覆蓋 outbound 層嗎？escalate
- (E3) **Phase spec 互相依賴出錯** — 例如 P7 引用 P5 的 `inbound_scans`，但 P5 spec 寫的欄位名跟 P7 引用的不一致。escalate
- (E4) **Bug 1-13 的修法跟既有 phase 衝突** — 例如修 Bug 6 要重做 item_locations schema，但跟 P5 的 schema 設計不相容。escalate
- (E5) **業主待提供的資料缺失** — 例如 P4 落地時需要 product_categories seed list，但業主還沒提供。停下來等業主，**不要自己 seed 假類別繼續走**。
- (E6) **跨 phase 紀律不一致** — 例如 P3 spec 用 `wallet_transactions.type='topup'`，P5 spec 用 `wallet_transactions.action='charge_inbound'`。type vs action 用詞不一致，escalate
- (E7) **發現 spec 沒涵蓋的 case 而你判斷不出來** — 例如：客戶在 P7 試算過程中突然取消綁的 carrier 帳號，這時 outbound 怎麼辦？spec 沒寫，escalate

### 10.2 不需 escalate 的情況

- (NE1) **CSS class 用 tailwind 哪個顏色** — 自己決定（除非 spec 明確指定）
- (NE2) **檔案放哪個目錄** — 沿用既有 ShipItAsia 慣例，自己決定
- (NE3) **變數命名 / function 命名** — 自己決定
- (NE4) **內部 helper function 的拆分粒度** — 自己決定
- (NE5) **Spec 中明確的 edge case** — 直接照 spec 做
- (NE6) **TypeScript type / interface 的細節** — 自己決定（型別清楚就好）
- (NE7) **Test framework 細節**（用 vitest / jest / playwright 等）— 沿用 ShipItAsia 既有，自己決定
- (NE8) **Commit message 用詞** — 照 §9.4 規範自己決定

### 10.3 業主待提供清單（v1 開工前 / 落地過程中需要）

| 項目 | 哪個 phase 需要 | 截止點 |
|---|---|---|
| Fuuffy sandbox OAuth client（FUUFFY_OAUTH_CLIENT_ID / SECRET）| P2 從 mock 切真時 | 業主負責申請（已寄信給 support@fuuffy.com）|
| 埼玉倉完整地址（中文+英文+郵編+電話）| P4 落地前 | 業主提供 |
| product_categories 大類+子類 seed list | P4 落地前 | 業主提供 |
| 雲途 API key + secret（測試環境）| P7 落地時 | 業主提供 |
| Fuuffy API webhook spec（如未來要做 webhook）| 不在 v1 範圍 | v2 才需要 |
| 雲途 tracking URL pattern | P9 spec 標 placeholder（v1 寫 null）| 業主提供（未來）|

### 10.4 escalate 的方式

寫一個 markdown short note，包含：
1. 你在做哪個 phase 哪個 sub-step
2. 看到什麼 spec 條目（引用原文）
3. 你判斷的衝突 / 缺資料 / case
4. 你的 2-3 個可能解法（業主二選一比寫 free-form 好）
5. 你的傾向 + 理由

業主回應後，把決策寫進 `/docs/decisions/` 的 ADR，後續 phase reference 用。

---

## 11. 失敗模式對照表

過去開發類似系統最常踩的坑，提前知道才不會踩：

| 失敗模式 | 怎麼發生 | 怎麼避免 |
|---|---|---|
| Silent stub 蔓延 | 「先寫個 placeholder 等我下個 sprint 補」→ 永遠不補，prod 出包 | §8.1 fail loud + lint rule |
| 雙服務 contract 漂移 | OMS 改 endpoint 沒通知 WMS，sync silent fail | A3 紀律：共用 type definition + WebhookDispatcher 寫 audit |
| Carrier 分支爆炸 | hardcoded `if (yunexpress)`，第三家 carrier 進來改一堆地方 | A1 紀律：強制 ICarrierAdapter |
| Schema in-place 覆寫 | PDA 重掃覆寫主檔欄位，audit 全失 | B5 紀律：主檔 vs 動作快照拆分 |
| Audit 日誌缺漏 | 「這個動作沒人會看吧」→ 出爭議找不到證據 | B1 紀律：所有業務動作都寫 |
| CS 兜底成萬能 | spec 寫「失敗請聯繫客服」當所有 fallback | A5 紀律：結構化 enum 分流 |
| Remarks 變業務邏輯 | 員工把工作流程寫進 remarks，後續同事看 remarks 跑流程 | A6 紀律：remarks 純 audit，業務走 enum |
| Wallet 設計簡化 | 「客戶不多先不做 wallet 直接付款」→ 後期重做 | A4 死守：P3 wallet 是必備 |
| Sync 失敗 silent | dispatcher 失敗 alert 沒寫，dev 不知道 | B2 紀律：每次 attempt 寫 outward log + sync_failed_logs |
| Phase 間紀律不一致 | P3 用 type，P5 用 action，命名漂移 | §10.1 (E6) escalate |
| 改 schema 沒問業主 | agent 自作主張 | §8.5 死守 |
| Test 不寫 | 「先跑通再補」→ 永遠不補 | §5.5 post-check 強制 |

---

## 12. v1 範圍外（不要做）

這些東西**不在 v1**，業主明確排除。如果你看到 spec 有暗示「未來要做」，那是 v2，**不要在 v1 主動實作**：

| 項目 | 理由 |
|---|---|
| Carrier webhook 接收 | P9 已剔除，v2 才考慮 |
| Tracking event timeline | 同上 |
| Delivered notification | 同上 |
| 多倉支援（v1 只埼玉一倉）| 業務量小，多倉設計過度 |
| 多語言（v1 只繁中）| 業主聚焦 HK 客戶 |
| 客戶 API export（B2B 系統對接）| v1 客戶手動操作 OMS 即可 |
| Excel / CSV 批次匯入 | P4 spec 標 placeholder，v1 不做 |
| 手機 App | v1 純 Web |
| Self-serve 客戶註冊（v1 admin 後台建客戶）| 業主先篩客戶 |
| Stripe / Airwallex 金流接入 | v1 不接金流，純線下手動 |
| Palletize（棧板化）| 業主決策取消 |
| Multi-tenant carrier service config | v1 兩家 carrier 寫死 seed |

---

## 13. 結語

你看到這份 review md 的時候，9 個 phase spec 已經寫完，業主已經把所有的決策都拍板。你的工作不是做業務決策，**是把 spec 翻譯成可運行的 code**。

如果你動了 spec 沒講的東西、寫了 silent stub、繞過了共用 service、或主動改 schema，這是失職。

如果你照 §4 pre-check / §5 post-check 跑、Wave 1→2→3 順序走、紀律 §8 死守、escalate 條件 §10.1 嚴格遵守，v1 落地會很順。

業主拍板了 mock 是 v1 dev/staging 唯一模式。**prod 切換不是你的工作**，是業主後續跟老闆 + QA 做的大更新。你只要保證 mock 模式跑得通，就是 v1 完工。

開工。

---

## 附錄 A：Phase spec 與本 review md 對應索引

| Phase | Spec 文件 | 本 review md 對應節 |
|---|---|---|
| P1 | phase1_oms_account.md | §2.2 Wave 1, §3, §6.1, §7.1 |
| P2 | phase2_carrier_binding.md | §1.6, §1.10 (Bug 7), §2.2 Wave 1, §3, §7.1, §7.2 |
| P3 | phase3_oms_wallet.md | §1.9 (A4), §2.2 Wave 1, §3, §7.1, §8.8 |
| P4 | phase4_oms_inbound_declaration.md | §1.5 (ID), §1.10 (Bug 1), §2.2 Wave 2, §3, §6.2, §6.4, §7.1 |
| P5 | phase5_wms_inbound_scanning.md | §1.8 (B5/B7), §1.10 (Bug 6), §2.2 Wave 2, §3, §8.3 |
| P6 | phase6_unclaimed_processing.md | §2.2 Wave 2, §3 |
| P7 | phase7_oms_outbound_creation.md | §1.8 (B6), §1.9 (A1/A4), §2.2 Wave 3, §3, §7.1, §7.2 |
| P8 | phase8_wms_outbound_processing.md | §1.10 (Bug 2/3/4/5/6), §2.2 Wave 3, §3, §7.2, §8.2 |
| P9 | phase9_oms_outbound_shipped.md | §1.6 (mock UPS tracking), §2.2 Wave 3, §3, §12 (v2 排除) |

## 附錄 B：開工 day 1 推薦讀順

1. 本 review md（你正在讀）
2. `shipitasia_session_summary.md`（既有 repo 的觀察）
3. `fuuffy_lessons_for_shipitasia.md`（業務借鏡 + 避坑）
4. `phase1_oms_account.md`（Wave 1 第一個要做的）
5. `phase2_carrier_binding.md`
6. `phase3_oms_wallet.md`
7. `phase4_oms_inbound_declaration.md`（Wave 2 啟動）
8. `phase5_wms_inbound_scanning.md`
9. `phase6_unclaimed_processing.md`
10. `phase7_oms_outbound_creation.md`（Wave 3 啟動）
11. `phase8_wms_outbound_processing.md`
12. `phase9_oms_outbound_shipped.md`
13. 各 SKILL.md（用到才讀，但先做索引）

讀完開工。

---

**文件結束。**
