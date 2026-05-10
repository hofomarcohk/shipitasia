# Phase 4：客戶建立入庫預報（OMS）

> 集運 OMS+WMS v1 開發規格
> 版本：v1.0
> 日期：2026-05-08
> 範圍：客戶 OMS 建預報（單筆，多品項申報）+ schema 為 Phase 5 簽入鋪路 + 取消 / 廢棄流程
> 前置：Phase 1（客戶帳號、cryptoService、Resend）、Phase 2（carrier 綁定）、Phase 3（錢包系統）已完成或同步開發
> 業務地位：v1 最 core 的 phase，後續所有流程仰賴預報資料品質

---

## 0. 前設

### 0.1 v1 業務參數（Phase 3 已定，本 phase 引用）

| 項目 | v1 設定 |
|---|---|
| 全局幣別 | HKD（錢包、處理費、出庫運費試算）|
| 處理費單價 | HKD$5 / 包 |
| 入庫地 | 日本（v1 一個倉：埼玉）|
| 收貨地 | 香港 |
| **申報幣別** | **依倉庫適配**（埼玉倉 → JPY）|

### 0.2 業務量假設

v1 上線半年內 ≤ 50 客戶。每客戶每月預估 5-10 筆預報 → 全系統 ≤ 500 筆 / 月，≤ 3000 筆 / 半年。設計不需考慮分頁優化、不需 cache。

### 0.3 範圍

**包含**：
- 客戶 OMS「我的預報」列表 + 詳情頁
- 客戶建單流程（單筆，多品項申報）
- 客戶取消 / 廢棄預報流程
- 客戶反悔 single → 不允許
- 預報主檔 + 多品項申報子集合 schema
- WMS admin read-only 看所有客戶預報
- 入庫快遞商主檔（`carriers_inbound`，跟 Phase 2 carriers 不同概念）
- 產品類別主檔（`product_categories`，兩階層）
- 倉庫主檔擴充（多語言地址 + declared_currency）
- Notification schema 預備（Phase 4 寫入事件，UI 留後 phase）
- CSV 匯入 placeholder（API 存在但 throw NOT_IMPLEMENTED）
- 修 ShipItAsia Bug 1（WMS 後台建預報 API）

**不包含**：
- PDA 簽入動作（Phase 5）
- 簽入時扣處理費（Phase 5 觸發 Phase 3 walletService.charge）
- 預報 → 出庫合併（Phase 7）
- 預報 expired 自動失效（業主決策不做）
- CSV 批次匯入實作
- Notification UI（schema 預備、UI 留後 phase）
- single 模式自動建 outbound 邏輯（Phase 5 / 7 範圍）
- Phase 6 admin 自動廢棄 cron（30 + 30 警告 → 廢棄；schema 預備、邏輯 Phase 6）

### 0.4 技術棧

沿用 ShipItAsia 既有 + Phase 1-3 已建。新增：
- `inbound_declared_items` 子集合
- `notifications` collection（OMS）
- `notificationService`（OMS 通用通知服務）

### 0.5 UI 設計風格

完全沿用 ShipItAsia 既有 layout / 元件 / 色系 / Tabler icons。新頁面參照既有對映（見 §3）。

---

## 1. 業務流程

### 1.1 客戶看預報列表

#### 1.1.1 進入「我的預報」

- 路徑：`/zh-hk/inbound`（既有頁面，需改造）
- Sidebar 既有「入庫請求」入口保留，名稱統一改為「我的預報」（Tabler icon: `IconPackage`）
- 列表欄位：
  - 預報編號（`I-20260508-0001` 格式，可 click 進詳情）
  - 倉庫（`日本埼玉倉`）
  - 入庫快遞 + 單號
  - shipment_type badge（`合併寄送` 灰色 / `單一寄送` 橙色）
  - inbound_source badge（`一般` / `退運` / `禮物` / `其他`，灰色）
  - 申報總值（JPY，多品項加總）
  - 申報項數（badge: `5 項`）
  - 狀態 badge（pending / arrived / received / picking / packed / palletized / departed / cancelled / abandoned）
  - 建立時間
- Filter：狀態 / 日期區間 / trackingNo 搜尋 / shipment_type
- 排序：建立時間 desc 預設
- 動作（依 status 顯示）：
  - pending → 編輯、取消、看詳情
  - arrived / received → 廢棄、看詳情
  - picking 之後 → 看詳情
  - cancelled / abandoned → 看詳情
- 列表上方按鈕：「新增預報」（主按鈕）
- **CSV 匯入按鈕 v1 不顯示**（API 存在但 UI 隱藏）

#### 1.1.2 ID 格式規則

- 格式：`I-YYYYMMDD-NNNN`
- YYYYMMDD = 建立日期（UTC+8）
- NNNN = 4 位序號，每日從 0001 起算
- 例：`I-20260508-0001`、`I-20260508-0002`、`I-20260509-0001`
- 實作：app 層用 mongo `findOneAndUpdate` 對 `daily_counters` collection 原子 +1（避免並發撞號）
- **舊 ShipItAsia `I + 時戳` 格式棄用**，新預報全用新格式

### 1.2 客戶建單（單筆預報）

#### 1.2.1 進入新增頁

- 路徑：`/zh-hk/inbound/new`（新頁，仿 ShipItAsia 既有 form layout）
- Layout 結構（仿 buyandship 風格，主表單在左、申報品項側邊 drawer 在右）：

```
[主表單區域 - 左]                       [側邊 drawer - 右]
┌────────────────────────────────┐  ┌──────────────────────┐
│ 1. 收貨倉庫 *                   │  │ 申報品項                │
│    [dropdown: 日本埼玉倉]       │  │                        │
│    倉庫地址自動帶出（read-only）  │  │ [+ 新增品項]            │
│                                │  │                        │
│ 2. 入庫快遞 *                   │  │ 品項 1                 │
│    [dropdown: 佐川急便 / 日本郵便│  │  類別: 服飾 > 上衣      │
│              / Yamato / 其他]   │  │  名稱: 棉質T恤          │
│    [其他]選了→出文字框          │  │  數量: 5                │
│                                │  │  單價: ¥2,000           │
│ 3. 貨物追蹤號 *                 │  │  小計: ¥10,000          │
│    [text input]                │  │  [編輯] [刪除]          │
│    輸入完離開→即時檢查重複       │  │                        │
│                                │  │ 品項 2 ...              │
│ 4. 寄送申報類型 *               │  │                        │
│    [dropdown: 一般/退運/禮物/其他]│  │ ────────────────       │
│                                │  │ 申報總值                │
│ 5. 體積估算 *                   │  │ JPY ¥28,500            │
│    [radio: 小型 / 中型 / 大型 ] │  │                        │
│    註: 小型≤20³cm 中型≤40³cm... │  │                        │
│                                │  └──────────────────────┘
│ 6. 含液體（任一品項）*           │
│    [radio: 是 / 否]            │   * = 必填
│    含電池（任一品項）*           │
│    [radio: 是 / 否]            │
│                                │
│ 7. shipment_type *              │
│    [radio: 合併寄送 / 單一寄送]  │
│                                │
│  ↓ 選了「單一寄送」展開以下區塊 ↓│
│                                │
│ 7a. 收件地址 *                  │
│    [常用地址 dropdown] or [新建]│
│    收件人/電話/國家/城市/詳細地址 │
│    [v] 儲存為常用地址            │
│                                │
│ 7b. carrier 帳號 *              │
│    [dropdown: 客戶綁的 active]  │
│    沒綁 → 警告 + 阻擋提交        │
│                                │
│ 8. 客戶備註（選填）              │
│    [textarea, ≤ 200 字]         │
│                                │
│ [儲存草稿]  [提交預報]           │
└────────────────────────────────┘
```

#### 1.2.2 表單驗證規則

| 欄位 | 驗證 |
|---|---|
| warehouseCode | required, 必須為 active 狀態 |
| carrier_inbound_code | required, 必須為 active 狀態 |
| tracking_no | required, ≤ 100 字, normalize 後檢查重複 |
| inbound_source | required, enum |
| size_estimate | required, enum (`small` / `medium` / `large`) |
| contains_liquid | required, boolean |
| contains_battery | required, boolean |
| shipment_type | required, enum (`consolidated` / `single`) |
| 收件地址（single 模式必填）| 收件人 / 電話 / 國家 / 城市 / 詳細地址必填 |
| carrier_account_id（single 模式必填）| 客戶必須綁過至少一個 active carrier |
| declared_items | 至少 1 筆 |
| 每筆 declared_item | 類別 / 子類別 / 名稱 / 數量 / 單價必填 |
| customer_remarks | 選填, ≤ 200 字 |

#### 1.2.3 trackingNo 重複檢查（normalize 規則）

選 (c)：**同 client + 同 carrier_inbound + 同 normalized_tracking 才算重複**

normalize 規則（純文字處理）：
1. 移除所有 `-`（hyphen）
2. 移除所有空白（包含 tab / newline）
3. 統一轉大寫

實作：

```typescript
function normalizeTrackingNo(raw: string): string {
  return raw
    .replace(/-/g, '')
    .replace(/\s/g, '')
    .toUpperCase();
}
```

DB 同時存：
- `tracking_no`：原始輸入（給客戶看）
- `tracking_no_normalized`：normalize 後（重複檢查用）

複合 unique index：`{ client_id: 1, carrier_inbound_code: 1, tracking_no_normalized: 1 }`，filter 排除 deleted_at != null

**檢查時機**：
- Frontend onBlur：呼叫 `GET /api/cms/inbound/check-duplicate?carrier_inbound=xx&tracking_no=xx` 即時 warning
- Backend 提交時：最終確認，撞 unique index 時回 4xx `TRACKING_NO_DUPLICATED`

#### 1.2.4 申報品項側邊 drawer

點「新增品項」開 drawer，填欄位：

```
[側邊 drawer]
產品類別 *
[dropdown 大類] → 選後展開 [dropdown 子類]
例：電腦、電子產品與遊戲 → 電腦與平板

產品名稱 *
[text, ≤ 100 字]

產品網址（選填，但建議填以利清關）
[url, http:// 或 https:// 起始]

數量 *
[number, ≥ 1, 整數]

單件售價（依倉庫幣別） *
[number, ≥ 0, 最多 2 位小數]
顯示倉庫幣別: JPY

[儲存品項] [取消]
```

drawer 關閉後品項加入主表單右側列表，可再次編輯 / 刪除。

#### 1.2.5 提交流程

1. Frontend 驗證所有欄位
2. POST `/api/cms/inbound`，body 結構：
```json
{
  "warehouseCode": "JP-SAITAMA-01",
  "carrier_inbound_code": "sagawa",
  "tracking_no": "1234-5678-9012",
  "inbound_source": "regular",
  "size_estimate": "medium",
  "contains_liquid": false,
  "contains_battery": true,
  "shipment_type": "single",
  "single_shipping": {
    "receiver_address": { ... },
    "save_as_default_address": true,
    "carrier_account_id": "xxx"
  },
  "customer_remarks": "...",
  "declared_items": [
    {
      "category_id": "cat_electronics",
      "subcategory_id": "subcat_tablet",
      "product_name": "iPad mini",
      "product_url": "https://...",
      "quantity": 1,
      "unit_price": 89800
    },
    ...
  ]
}
```

3. Server 邏輯：
   - 驗證所有欄位（zod）
   - 驗證 client_id 從 JWT 取（**禁止從 body 接受**）
   - 驗證 warehouseCode 存在且 active
   - 驗證 carrier_inbound_code 存在且 active
   - 驗證每個 category_id / subcategory_id 存在
   - tracking_no normalize + 檢查唯一
   - single 模式驗證 carrier_account_id 屬該客戶且 active
   - 用 daily counter 產生 ID（`I-20260508-0001`）
   - 用 mongo session transaction：
     - 寫入 `vw_sms.inbound_requests`（主檔，status=pending）
     - 寫入 `vw_sms.inbound_declared_items`（多筆品項）
     - 若 single + save_as_default_address=true → 更新 `clients.default_shipping_address`
     - 寫入 `notifications`（type=inbound_created）
     - commit
   - 同步推 WMS（callWmsApi POST `/api/wms/utils/sync` body type=inbound）
     - WMS 收到 → 寫入 `vw_wms.inbound_requests` + `vw_wms.inbound_declared_items`
     - **若 WMS 同步失敗**：OMS 寫成功但 WMS 失敗 → 寫 `sync_failed_logs` + UI 提示但業務繼續（不 rollback OMS）
4. 回應 `{ success: true, inbound_id: "I-20260508-0001" }`
5. 跳轉 `/zh-hk/inbound/I-20260508-0001`（詳情頁），顯示 success toast：「預報已建立，等待到貨」

### 1.3 客戶看預報詳情

- 路徑：`/zh-hk/inbound/[id]`
- 顯示：
  - 預報編號 + 狀態 badge
  - 倉庫資訊（地址中英文都顯示）
  - 入庫快遞 + 單號
  - shipment_type / inbound_source / size / 液體 / 電池
  - 申報品項列表（read-only 表格 or pending 時可編輯）
  - 申報總值（依倉庫幣別）
  - 客戶備註
  - 狀態歷程（什麼時候 pending → arrived → received → ...）
  - **single 模式額外顯示**：收件地址 + carrier 帳號暱稱
- 動作（依 status）：
  - **pending**：編輯、取消預報
  - **arrived / received**：廢棄
  - **picking / packed / palletized / departed**：（無動作）
  - **cancelled / abandoned**：（無動作，僅顯示原因 + 時間）

### 1.4 客戶編輯預報（pending only）

- 路徑：`/zh-hk/inbound/[id]/edit`
- 與新增頁類似，但所有欄位皆可改（包含 declared_items 增刪改）
- 唯一限制：**status 必須為 pending**，後端再驗
- 提交：PATCH `/api/cms/inbound/:id`
- 同步 WMS（雙寫）

### 1.5 客戶取消預報（pending only）

- 在詳情頁或列表動作點「取消預報」
- 跳簡單對話框：「確認取消預報 I-20260508-0001？取消後不可恢復。」
- 客戶填：取消原因（dropdown，選填）
  - 「賣家未發貨」/「重複下單」/「改寄其他倉」/「其他」
- 確認 → POST `/api/cms/inbound/:id/cancel`
- Server：
  - 驗證 status=pending（並發保護用 `findOneAndUpdate({ _id, status: 'pending' }, ...)`)
  - 更新 status=`cancelled`、`cancelled_at`、`cancelled_by_client=true`、`cancel_reason`
  - 同步 WMS
  - 寫 notification（type=inbound_cancelled）
- 回 success → 跳回列表

### 1.6 客戶廢棄預報（arrived / received only）

#### 1.6.1 為什麼要廢棄

業務情境：
- 貨已到倉但客戶反悔不要了
- 客戶決定放棄這批貨的所有權
- 廢棄後貨物由 [your company] 自行處置（可賣 / 銷毀 / 慈善）

#### 1.6.2 廢棄流程

- 詳情頁右上角「廢棄此貨物」按鈕（紅色危險按鈕，僅 arrived / received 顯示）
- 點 → 跳警告對話框（modal）：

```
⚠️ 廢棄貨物確認

此操作將：
1. 放棄此貨物的所有權，貨物將由 [your company] 自行處置
2. 已扣的處理費 HKD$5 不會退還
3. 此操作不可逆

[v] 我已了解上述事項

請輸入「廢棄」二字以確認：
[text input]

[取消]  [確認廢棄]（按鈕在勾選 + 文字正確時才 enable）
```

- 確認 → POST `/api/cms/inbound/:id/abandon` body `{ confirmation_text: "廢棄" }`
- Server：
  - 驗證 status ∈ {arrived, received}（並發保護同上）
  - 驗證 confirmation_text === "廢棄"
  - 更新 status=`abandoned`、`abandoned_at`、`abandoned_by_client=true`、`abandoned_reason="客戶主動廢棄"`
  - **不退費**（業主決策 D.3）
  - 同步 WMS：通知 admin 此貨可處置
  - 寫 notification（type=inbound_abandoned）
- 回 success → 跳回列表

#### 1.6.3 picking 之後不能廢棄

- status ∈ {picking, packed, palletized, departed} → 後端 4xx `CANNOT_ABANDON_AFTER_PICKING`
- UI 不顯示「廢棄」按鈕

### 1.7 WMS admin 看預報

#### 1.7.1 列表頁

- 路徑：`/zh-hk/inbound/list`（既有頁面改造）
- 與 OMS 列表類似，但：
  - 多顯示「客戶」欄位 + 客戶 search filter
  - **read-only**：admin 不能編輯客戶預報（純查詢）
  - 動作只有「看詳情」+ Bug 1 修復後的「新增預報（admin 代客建）」

#### 1.7.2 詳情頁

- 路徑：`/zh-hk/inbound/[id]`
- 顯示所有欄位（含 client 資訊、可看 inbound_declared_items 全部）
- **不顯示** OMS 客戶端的「編輯」「取消」「廢棄」按鈕
- v1 admin 完全 read-only（業主決策 Q7-old）

#### 1.7.3 admin 廢棄（後台主動）

業主決策 D.2：admin 端**也能廢棄**，但走 30 + 30 流程。

**Phase 4 範圍**：
- schema 加 `abandon_warning_sent_at` 欄位（cron 用，Phase 6 邏輯）
- WMS 詳情頁加「強制廢棄」按鈕（僅 status ∈ {arrived, received}, 預設**隱藏**）
  - admin 點開後跳同樣 confirmation modal（勾 + 輸入「廢棄」字）
  - 確認後執行：status=`abandoned`、`abandoned_by_client=false`、`abandoned_by_staff_id`、`abandoned_reason`（必填，由 admin 填）
- v1 admin 強制廢棄是**手動觸發**，不是 cron 自動（cron 留 Phase 6）

#### 1.7.4 修 Bug 1：WMS 後台建預報 API

業主決策：v1 業務上不主流走這條，但 API 要修好（為將來 walk-in / 紙本入庫情境）。

- 路徑：`/zh-hk/inbound/new`（既有頁面）
- 既有 form 改造：
  - 多一個「客戶」dropdown（admin 必選哪個客戶建這筆預報）
  - 移除 `clientId: "admin"` hardcoded（現有 Bug）
  - 其他欄位與 OMS 客戶建單頁類似
- API：`POST /api/wms/inbound`
  - 修原先 body 直接丟掉的 bug
  - 呼叫 `createInbound` service（共用 OMS / WMS 兩端）
  - 同步推 OMS
  - 寫 notification（client_id = 選中的客戶）

### 1.8 Notification 寫入（schema 預備）

業主決策 C：走 (b) schema 預備、UI 留後 phase。

**Phase 4 寫入的事件類型**：

| type | 觸發點 | title | body 模板 |
|---|---|---|---|
| `inbound_created` | 客戶或 admin 建預報成功 | 預報建立成功 | 預報 {inbound_id} 已建立，等待到貨 |
| `inbound_updated` | pending 預報修改 | 預報已更新 | 預報 {inbound_id} 已更新 |
| `inbound_cancelled` | 客戶取消 | 預報已取消 | 預報 {inbound_id} 已取消 |
| `inbound_abandoned` | 客戶或 admin 廢棄 | 貨物已廢棄 | 貨物 {inbound_id} 已廢棄 |

寫入透過 `notificationService.create({ client_id, type, reference_type, reference_id, ... })`。**v1 沒有 UI 顯示 notifications**（schema 預備，留後 phase 統一 UI）。

---

## 2. Schema 變更

### 2.1 `warehouses`（既有，擴充欄位）

| 欄位 | 型別 | 既有 / 新增 | 說明 |
|---|---|---|---|
| `warehouseCode` | string | 既有 | 唯一索引，例：`JP-SAITAMA-01` |
| `name_zh` | string | 既有 | 中文名 |
| `name_en` | string | **新增** | 英文名 |
| `country_code` | string | **新增** | ISO 2-letter，例：`JP` |
| `declared_currency` | string | **新增** | 客戶申報幣別，例：`JPY`（key 設計依倉適配）|
| `address_zh` | string | **新增** | 中文地址（給客戶看）|
| `address_en` | string | **新增** | 英文地址（給賣家看 / 寄件用）|
| `postal_code` | string | **新增** | 郵編 |
| `contact_phone` | string | **新增** | 倉庫聯絡電話 |
| `scan_config` | object? | **新增** | Phase 5 用（fuuffy B7 借鏡），暫存 placeholder |
| `status` | enum | 既有 | `active` / `disabled` |

**v1 seed data**（一筆）：
```json
{
  "warehouseCode": "JP-SAITAMA-01",
  "name_zh": "日本埼玉倉",
  "name_en": "Saitama Warehouse, Japan",
  "country_code": "JP",
  "declared_currency": "JPY",
  "address_zh": "日本埼玉縣...（業主提供完整地址）",
  "address_en": "Saitama, Japan ... (full address)",
  "postal_code": "...",
  "contact_phone": "...",
  "scan_config": null,
  "status": "active"
}
```

### 2.2 `carriers_inbound`（**新增** WMS + OMS 雙寫，與 Phase 2 carriers 不同概念）

| 欄位 | 型別 | 說明 |
|---|---|---|
| `_id` | string | |
| `carrier_inbound_code` | string | 唯一，例：`sagawa` / `japan_post` / `yamato` / `seino` / `fukuyama` / `other` |
| `name_zh` | string | 中文名（例：「佐川急便」）|
| `name_en` | string | 英文名（例：「Sagawa Express」）|
| `name_ja` | string? | 日文名（例：「佐川急便」）|
| `country_code` | string | 服務的入庫地，v1 全部 `JP` |
| `tracking_format_hint` | string? | 單號格式提示（給 UI 顯示，例：「12 位數字」）|
| `tracking_url_template` | string? | 客戶可點開查貨用，例：`https://k2k.sagawa-exp.co.jp/p/web/okurijoinput.do?okurijoNo={tracking_no}` |
| `status` | enum | `active` / `disabled` |
| `sort_order` | number | dropdown 排序 |

**v1 seed data**（6 筆，admin 可後台改）：
- 佐川急便（Sagawa Express）
- 日本郵便 / ゆうパック（Japan Post）
- ヤマト運輸（Yamato Transport）
- 西濃運輸（Seino Transportation）
- 福山通運（Fukuyama Transporting）
- 其他（other，name_zh="其他"，碰到客戶用「選了其他」此 carrier 時客戶在備註填快遞名）

**index**：`{ carrier_inbound_code: 1 }` unique

### 2.3 `product_categories`（**新增** WMS + OMS 雙寫）

兩階層 master data，admin 維護。

| 欄位 | 型別 | 說明 |
|---|---|---|
| `_id` | string | |
| `parent_id` | string? | null = 大類；有值 = 子類 |
| `name_zh` | string | 中文名 |
| `name_en` | string | 英文名 |
| `sort_order` | number | dropdown 排序 |
| `status` | enum | `active` / `disabled` |

**v1 seed data**：由業主提供（截圖 buyandship 9 大類 + 子類）。spec 階段先預留結構：

```
大類 (parent_id=null):
  - 潮流服飾、鞋履與配件
  - 美妝、健康與食品
  - 電腦、電子產品與遊戲
  - 卡牌與收藏品
  - 玩具、幼兒與寵物用品
  - 運動與戶外用品
  - 書籍、影音與藝術品
  - 家居、園藝與工具
  - 汽車、機車與工業用品

子類（parent_id=大類_id）:
  業主於 Claude Code 落地階段提供完整 seed list
```

**ShipItAsia 既有 `categories` 棄用**（schema 不刪，新業務邏輯不再 reference）。

### 2.4 `inbound_requests`（既有，重構欄位）

| 欄位 | 型別 | 既有 / 新增 / 改 | 說明 |
|---|---|---|---|
| `_id` | string | **改** | 格式：`I-YYYYMMDD-NNNN` |
| `client_id` | string | 既有 | FK to clients |
| `warehouseCode` | string | 既有 | FK to warehouses |
| `carrier_inbound_code` | string | **新增** | FK to carriers_inbound |
| `tracking_no` | string | 既有 | 客戶輸入的原始值 |
| `tracking_no_normalized` | string | **新增** | normalize 後（重複檢查 / matching 用）|
| `tracking_no_other` | string? | **新增** | 當 carrier_inbound_code='other' 時，客戶在此填快遞名 |
| `inbound_source` | enum | **新增** | `regular` / `return` / `gift` / `other` |
| `size_estimate` | enum | **新增** | `small` / `medium` / `large` |
| `size_estimate_note` | string? | **新增** | 客戶選 large 或想加註的補充說明（≤ 100 字）|
| `contains_liquid` | boolean | 既有 `restrictions` 重構為 boolean | 整箱層級 |
| `contains_battery` | boolean | 既有 重構 | 整箱層級 |
| `shipment_type` | enum | **新增** | `consolidated` / `single` |
| `single_shipping` | object? | **新增** | shipment_type=single 時必填，見 §2.4.1 |
| `customer_remarks` | string? | 既有 `remarks` 改名 | ≤ 200 字，**純客戶自看**，無系統邏輯依賴 |
| `declared_value_total` | number | **新增 / 重構** | 從 declared_items 加總 cache，依倉庫 declared_currency；**禁止直接寫**，由 service 在品項變更時 recalculate |
| `declared_currency` | string | **新增** | snapshot from warehouses.declared_currency at create time，例：`JPY` |
| `status` | enum | 既有 + 擴充 | `pending` / `arrived` / `received` / `picking` / `packed` / `palletized` / `departed` / `cancelled` / `abandoned` |
| `cancelled_at` | date? | **新增** | |
| `cancelled_by_client` | boolean? | **新增** | true = 客戶取消；v1 沒有 admin 取消 |
| `cancel_reason` | string? | **新增** | 客戶填 |
| `abandoned_at` | date? | **新增** | |
| `abandoned_by_client` | boolean? | **新增** | true = 客戶廢棄；false = admin 強制廢棄 |
| `abandoned_by_staff_id` | string? | **新增** | admin 強制廢棄時記哪個 staff |
| `abandoned_reason` | string? | **新增** | 必填（admin 強制廢棄時）|
| `abandon_warning_sent_at` | date? | **新增** | Phase 6 cron 用，schema 預備 |
| `arrivedAt` | date? | 既有 | Phase 5 PDA arrive 時寫 |
| `receivedAt` | date? | 既有 | Phase 5 PDA receive 時寫 |
| `actualDimension` | object? | **新增 schema** | Phase 5 PDA 簽入時填，v1 主檔 cache（詳細版本子集合處理留 Phase 5）|
| `actualWeight` | number? | **新增 schema** | Phase 5 PDA 簽入時填 |
| `createdAt / updatedAt` | date | 既有 | |

#### 2.4.1 `single_shipping` 內嵌物件

```typescript
{
  receiver_address: {
    name: string,             // 收件人
    phone: string,
    country_code: string,     // ISO 2-letter
    city: string,
    district: string?,
    address: string,          // 詳細地址
    postal_code: string?
  },
  carrier_account_id: string  // FK to client_carrier_accounts
}
```

#### 2.4.2 schema validation 改造

**ShipItAsia 既有 schema 部分欄位 nullable 處理（Bug 13 已修但表單仍送 null）需清掉**：

- 表單 default 不送 null，未填的選填欄位**不傳該 key**（undefined）
- zod schema 把 `arrivedAt / receivedAt` 等 optional date 設定為 `.optional()` 而不是 `.nullable()`

**Indexes**（重要）：
- `{ client_id: 1, carrier_inbound_code: 1, tracking_no_normalized: 1 }` unique（部分索引：`status != 'cancelled'`，避免 cancelled 單擋下後續同單號重建）
- `{ client_id: 1, status: 1, createdAt: -1 }`（列表查詢主路徑）
- `{ status: 1, createdAt: -1 }`（admin 列表）
- `{ tracking_no_normalized: 1 }`（Phase 5 PDA 簽入 matching 用）

### 2.5 `inbound_declared_items`（**新增** WMS + OMS 雙寫）

一筆 inbound 對應 N 筆 declared_items。

| 欄位 | 型別 | 說明 |
|---|---|---|
| `_id` | string | |
| `inbound_request_id` | string | FK to inbound_requests |
| `client_id` | string | 冗餘欄位，方便查詢 |
| `category_id` | string | FK to product_categories（大類）|
| `subcategory_id` | string | FK to product_categories（子類，parent_id=category_id）|
| `product_name` | string | ≤ 200 字 |
| `product_url` | string? | 選填，但建議填以利清關 |
| `quantity` | number | ≥ 1, 整數 |
| `unit_price` | number | ≥ 0, 最多 2 位小數 |
| `currency` | string | snapshot from inbound.declared_currency, 例：`JPY` |
| `subtotal` | number | quantity × unit_price，cache（建立 / 更新時計算）|
| `display_order` | number | 客戶看到的順序 |
| `createdAt / updatedAt` | date | 稽核 |

**Indexes**：
- `{ inbound_request_id: 1, display_order: 1 }`
- `{ client_id: 1, category_id: 1 }`（admin 報表用）

**禁止直接修改 inbound_request_id 或 client_id**（service 層 enforce）。

### 2.6 `clients`（既有，擴充欄位）

| 欄位 | 型別 | 既有 / 新增 | 說明 |
|---|---|---|---|
| `default_shipping_address` | object? | **新增** | single 模式預設帶入；客戶可在綁定時勾「儲存為常用」更新此欄位 |

`default_shipping_address` 結構同 `single_shipping.receiver_address`。

### 2.7 `notifications`（**新增** OMS）

業主決策 C：schema 預備、UI 留後 phase。

| 欄位 | 型別 | 說明 |
|---|---|---|
| `_id` | string | |
| `client_id` | string | FK |
| `type` | string | 例：`inbound_created` / `inbound_arrived` / ... |
| `title` | string | 顯示文字 |
| `body` | string | 詳細內容 |
| `reference_type` | string? | 例：`inbound` / `outbound` / `wallet` |
| `reference_id` | string? | 對應業務單 ID |
| `action_url` | string? | OMS 內部點擊跳轉，例：`/zh-hk/inbound/I-...` |
| `is_read` | boolean | 預設 false |
| `read_at` | date? | |
| `createdAt` | date | |

**Indexes**：
- `{ client_id: 1, is_read: 1, createdAt: -1 }`（列表查詢）
- `{ client_id: 1, type: 1 }`（filter by type）

### 2.8 `daily_counters`（**新增** OMS，幫 ID 產生用）

| 欄位 | 型別 | 說明 |
|---|---|---|
| `_id` | string | 例：`inbound_2026-05-08`（key=type + date） |
| `counter` | number | 當天 nth 筆，從 0 開始 |
| `last_used_at` | date | 監控 |

實作（atomic）：

```typescript
async function getNextDailyId(prefix: string, date: Date): Promise<string> {
  const dateStr = formatYYYYMMDD(date);  // '20260508'
  const counterKey = `${prefix}_${dateStr}`;
  const result = await db.collection('daily_counters').findOneAndUpdate(
    { _id: counterKey },
    { $inc: { counter: 1 }, $set: { last_used_at: new Date() } },
    { upsert: true, returnDocument: 'after' }
  );
  const nnnn = String(result.counter).padStart(4, '0');
  return `${prefix}-${dateStr}-${nnnn}`;
}
```

### 2.9 ShipItAsia 既有 schema 棄用 / 改造

| 既有 | 處理 |
|---|---|
| `categories` 主檔 | 棄用，新業務不寫；schema 不刪 |
| `restrictions` 主檔 | 棄用，新業務不寫；schema 不刪 |
| `inbound_requests.category` 欄位 | 棄用 |
| `inbound_requests.restrictions` 欄位 | 棄用，由 `contains_liquid / contains_battery` 取代 |
| `inbound_requests.declaredValue` 欄位 | 棄用，由 `declared_value_total` 取代 |
| `inbound_requests.dimension` 欄位 | 棄用，由 `size_estimate` + Phase 5 `actualDimension` 取代 |
| `inbound_requests.weight` 欄位 | 棄用，由 Phase 5 `actualWeight` 取代 |
| `inbound_requests.receiverAddress` 欄位 | 棄用（客戶不填，從 warehouses 帶）|
| `inbound_requests.senderAddress` 欄位 | 棄用（業主決策 Q1）|
| `inbound_requests.remarks` 欄位 | 改名 `customer_remarks`，純客戶自看 |

---

## 3. 頁面 / API 清單

### 3.1 OMS 新增 / 改造頁面

| 路徑 | 說明 |
|---|---|
| `/zh-hk/inbound` | 既有列表頁，重大改造 |
| `/zh-hk/inbound/new` | 既有，重大改造（新表單 + 多品項 drawer + single 區塊）|
| `/zh-hk/inbound/[id]` | 既有，改造（新欄位顯示、改取消 / 廢棄按鈕）|
| `/zh-hk/inbound/[id]/edit` | 既有，僅 pending 可編輯 |

### 3.2 OMS API endpoints

```
# 主檔查詢（給 dropdown）
GET    /api/cms/warehouses                  列出 active 倉庫
GET    /api/cms/carriers-inbound            列出 active 入庫快遞
GET    /api/cms/product-categories          列出產品類別（樹狀回應，含子類）

# inbound 主流程
GET    /api/cms/inbound                     列自己的預報（filter / pagination）
POST   /api/cms/inbound                     建單
GET    /api/cms/inbound/:id                 詳情
PATCH  /api/cms/inbound/:id                 編輯（pending only）
POST   /api/cms/inbound/:id/cancel          取消
POST   /api/cms/inbound/:id/abandon         廢棄

# 輔助
GET    /api/cms/inbound/check-duplicate?carrier_inbound=...&tracking_no=...
                                             onBlur 即時檢查單號重複

# CSV 匯入（v1 placeholder）
POST   /api/cms/inbound/import-csv          throw NOT_IMPLEMENTED（fail loud）
```

### 3.3 WMS API endpoints

```
# 主檔 CRUD（admin only）
GET/POST/PATCH /api/wms/warehouses
GET/POST/PATCH /api/wms/carriers-inbound
GET/POST/PATCH /api/wms/product-categories

# inbound 查詢 + 修 Bug 1
GET    /api/wms/inbound                     列所有客戶預報
GET    /api/wms/inbound/:id                 詳情
POST   /api/wms/inbound                     admin 代客建（Bug 1 修復）
POST   /api/wms/inbound/:id/abandon         admin 強制廢棄

# 同步（既有）
POST   /api/wms/utils/sync                  Bug 7 待 Phase 4 / 5 順手修 token 驗證
```

### 3.4 Sidebar 改造

OMS 既有「入庫請求」改名為「我的預報」。其他 sidebar 不動。

WMS 既有「入庫」相關入口保留，僅內部 layout 改造。

---

## 4. ShipItAsia 既有現況對映

| 既有 | 處理 |
|---|---|
| `inbound_requests` 主表 | 重構欄位（見 §2.9）|
| `categories` / `restrictions` 主檔 | 棄用，新業務不 reference |
| `inbound_requests` 既有 status enum | 擴充 `cancelled` / `abandoned` |
| Bug 1（WMS 後台建單 API）| 修復（§1.7.4）|
| Bug 13（form 送 null）| 清理表單 default + 改 schema validation 從 nullable 改 optional |
| Bug 7（sync 沒 token 驗證）| Phase 4 順手修：API middleware 加 X-Internal-Sync header 驗證（沿用 Phase 2 §2.7 機制）|

---

## 5. Fuuffy 借鏡

### 5.1 借鏡 B5（parcel 主檔 vs 動作快照拆分 ⭐⭐⭐⭐⭐）

**Phase 4 範圍內鋪路**：

- 主檔 `inbound_requests` 只存：最新狀態 + 預估值（size_estimate / contains_*） + reference + cache 值
- **不存實際量到的**：精確 dimension / weight / 簽入時間 detail / 操作員 / 照片
- Phase 5 會建 `inbound_scans` 子集合存動作快照
- Phase 4 主檔欄位 `actualDimension / actualWeight` 預留（schema 預備），Phase 5 簽入時 PDA 量到的值存進去 + 同時寫一筆 inbound_scans

### 5.2 借鏡 B7（warehouse-level scan_config_json）

`warehouses.scan_config` 欄位 Phase 4 schema 預備，Phase 5 才會讀。Phase 4 不做 scan config 後台 UI（Phase 5 一起做）。

### 5.3 借鏡 B1（log_item_action 結構化動作日誌）

Notification schema（§2.7）借鏡 fuuffy log_item_action 設計：
- enum 欄位（`type`）+ 自由文字欄位（`title` / `body`）
- 對應業務單 reference
- append-only（read 後也只更新 is_read，不改 content）

### 5.4 死守 A4（沒 wallet → 每張單獨立付款）

Phase 4 完全不碰扣費邏輯。Phase 5 才呼叫 `walletService.charge()`。

### 5.5 避坑 A1（沒有 carrier 抽象層 — 加新 carrier 等於改 webhook）

`carriers_inbound` 主檔走配置驅動：加新入庫快遞 = 寫一筆 master data + （未來）寫一個 tracking_url adapter。**不寫 hardcoded if/else**。

### 5.6 避坑 A2（silent stub return success）

CSV 匯入 placeholder：

```typescript
export async function importInboundCsv(...) {
  throw new Error('NOT_IMPLEMENTED: CSV import is not available in v1');
}
```

明確 fail loud，**不**回 `{ success: true, message: 'imported' }` 假裝成功。

### 5.7 避坑 A6（萬能 remarks 欄位）

`customer_remarks` 業主明確說「無系統級邏輯判斷，純客戶自看」。spec 寫死禁止：
- ❌ 業務邏輯依賴 remarks 字串
- ❌ remarks 內容驅動 status 變更 / 通知 / 報表
- ✅ 客戶自看、CS 看、admin 看（只讀）

---

## 6. Acceptance Criteria（給 Claude Code）

### AC-4.1 客戶建預報（基本流程）

**Given** 客戶已登入 OMS，已綁至少 1 個 carrier
**When** POST `/api/cms/inbound` body 含 warehouseCode、carrier_inbound_code、tracking_no、所有必填欄位、至少 1 筆 declared_items、shipment_type=consolidated
**Then**
- 寫入 `vw_sms.inbound_requests`：status=pending、`_id`=`I-20260508-0001` 格式
- 寫入 `vw_sms.inbound_declared_items` N 筆
- declared_value_total = 所有 declared_items.subtotal 加總
- declared_currency snapshot from warehouse.declared_currency
- 同步寫 WMS（`vw_wms.inbound_requests` + `vw_wms.inbound_declared_items`）
- 寫 notifications type=inbound_created
- 回 `{ success: true, inbound_id: "I-..." }`

**測試**：
- 缺必填 → 4xx
- declared_items 空 → 4xx `DECLARED_ITEMS_REQUIRED`
- warehouseCode 不存在 / disabled → 4xx
- carrier_inbound_code 不存在 / disabled → 4xx
- category_id / subcategory_id 對不到 → 4xx
- subcategory_id.parent_id ≠ category_id → 4xx `INVALID_SUBCATEGORY`
- 從 body 傳 client_id 試圖跨權 → 4xx，server 一律從 JWT 取
- WMS 同步失敗 → OMS 寫成功不 rollback，sync_failed_logs 寫一筆，前端顯示警告但業務繼續

### AC-4.2 trackingNo 重複檢查

**Given** 客戶 A 已建一筆 inbound：carrier_inbound=sagawa、tracking_no='1234-5678-9012'（normalized=`123456789012`）
**When** 客戶 A 又建：carrier_inbound=sagawa、tracking_no='123456789012' 或 'AB- 1234 5678 9012'
**Then**（兩種輸入都 normalize 成 `123456789012` → 撞重複）
- 4xx `TRACKING_NO_DUPLICATED`

**測試**：
- 客戶 A 已 cancelled 的單，tracking_no 同樣的 → **允許重建**（unique index 部分索引排除 cancelled）
- 客戶 A carrier_inbound=sagawa 已建，又建 carrier_inbound=japan_post 同 tracking_no → **允許**（不同 carrier）
- 客戶 B 用客戶 A 同樣 carrier + tracking_no → **允許**（不同 client）
- onBlur API 即時檢查回 `{ duplicated: true }` 而不是 4xx（差別：onBlur 是 query，提交才是 POST）

### AC-4.3 single 模式必填驗證

**Given** 客戶建單選 shipment_type=single
**When** 提交時 single_shipping 缺 receiver_address 或 carrier_account_id
**Then** 4xx `SINGLE_SHIPPING_REQUIRED_FIELDS_MISSING`

**測試**：
- carrier_account_id 不屬該客戶 → 4xx `INVALID_CARRIER_ACCOUNT`
- carrier_account_id 該客戶有但 status=revoked → 4xx
- single_shipping.save_as_default_address=true → 同步更新 clients.default_shipping_address
- shipment_type=consolidated 同時送 single_shipping → 4xx `SHIPPING_INFO_NOT_ALLOWED_FOR_CONSOLIDATED`

### AC-4.4 編輯預報（pending only）

**Given** 客戶 A 有一筆 inbound status=pending
**When** PATCH `/api/cms/inbound/:id` body 改 declared_items（增刪改）+ size_estimate
**Then**
- 主檔更新
- declared_items 增刪改
- declared_value_total 重算
- 寫 notifications type=inbound_updated
- 同步 WMS

**測試**：
- status=arrived 改 → 4xx `CANNOT_EDIT_AFTER_ARRIVED`
- 改別人的單 → 4xx / 404
- 改 status / cancelled_at 等系統欄位 → 4xx 或 silently ignored
- 改 client_id → 4xx

### AC-4.5 取消預報（pending only）

**Given** 客戶 A 有一筆 status=pending
**When** POST `/api/cms/inbound/:id/cancel` body `{ cancel_reason: '賣家未發貨' }`
**Then**
- status=cancelled、cancelled_at、cancelled_by_client=true、cancel_reason 寫入
- 同步 WMS
- notifications type=inbound_cancelled

**測試**：
- status=arrived → 4xx `CANNOT_CANCEL_AFTER_ARRIVED`
- 並發兩個 cancel → 一個成功，另一個 4xx
- cancel_reason 選填，不傳也 OK

### AC-4.6 廢棄預報（arrived / received only）

**Given** 客戶 A 有一筆 status=arrived
**When** POST `/api/cms/inbound/:id/abandon` body `{ confirmation_text: '廢棄' }`
**Then**
- status=abandoned、abandoned_at、abandoned_by_client=true、abandoned_reason="客戶主動廢棄"
- **不退費**（v1 不觸發 walletService.refund）
- 同步 WMS
- notifications type=inbound_abandoned

**測試**：
- status=pending → 4xx（pending 走 cancel 路徑）
- status=picking → 4xx `CANNOT_ABANDON_AFTER_PICKING`
- confirmation_text 不是「廢棄」二字 → 4xx
- 並發兩個 abandon → 一個成功

### AC-4.7 admin 強制廢棄

**Given** admin 已登入，inbound status=arrived
**When** POST `/api/wms/inbound/:id/abandon` body `{ confirmation_text: '廢棄', abandoned_reason: '60 天無回應' }`
**Then**
- status=abandoned、abandoned_by_client=false、abandoned_by_staff_id、abandoned_reason="60 天無回應"
- 同步 OMS
- notifications type=inbound_abandoned 寫給該客戶

**測試**：
- 非 admin 訪問 → 403
- 缺 abandoned_reason → 4xx
- status=pending → 4xx（admin 也不能對 pending 強制廢棄；要 admin 自己取消，但 v1 不開）

### AC-4.8 客戶看自己的預報列表

**Given** 客戶 A 有 5 筆 inbound（含 cancelled / abandoned）
**When** GET `/api/cms/inbound?status=pending,arrived,received`
**Then**
- 回應只含該 client 的 inbound（從 JWT 過濾）
- filter 正常 work
- 不含 declared_items（單獨 endpoint 拿）
- 排序 createdAt desc

**測試**：
- 試圖傳 query `client_id=other` → 忽略，仍只回自己的
- 排他客戶看不到，admin 看 OMS endpoint 也只回自己的（除非透過 WMS endpoint）

### AC-4.9 客戶看詳情（含 declared_items）

**Given** 客戶 A 有 inbound I-20260508-0001 含 5 筆 declared_items
**When** GET `/api/cms/inbound/:id`
**Then**
- 主檔 + declared_items 一起回
- 不含 abandon_warning_sent_at 等內部欄位
- 不含 sync 內部欄位

**測試**：
- 看別人的單 → 4xx / 404
- cancelled / abandoned 的單仍可看（read-only）

### AC-4.10 ID 格式 + 並發產生

**Given** 同一天並發 5 個建單請求（同客戶或不同客戶）
**When** 5 個並行 POST
**Then**
- 5 筆 inbound 各拿到不同 ID：`I-20260508-0001` ~ `I-20260508-0005`
- 序號連續、無撞號

**測試**：
- 用 `Promise.all` 模擬 5 個並行
- 驗證 5 個 ID 唯一

### AC-4.11 倉庫主檔擴充

**Given** v1 seed warehouses 有 1 筆 JP-SAITAMA-01
**When** GET `/api/cms/warehouses`
**Then**
- 回應含 declared_currency=JPY、address_zh、address_en、country_code=JP
- status=active 的才回

### AC-4.12 入庫快遞主檔

**Given** v1 seed carriers_inbound 有 6 筆（含 other）
**When** GET `/api/cms/carriers-inbound`
**Then**
- 回應 6 筆按 sort_order 排序
- 含 name_zh / name_en / tracking_format_hint

**測試**：
- carrier_inbound_code='other' 用此 carrier 建單時，前端必須提供 tracking_no_other 欄位（其他快遞名）；schema 上選填，但 UI 強制要求

### AC-4.13 產品類別樹狀回應

**Given** product_categories 9 大類 + N 子類
**When** GET `/api/cms/product-categories`
**Then**
- 回應為樹狀結構：

```json
[
  {
    "_id": "cat_fashion",
    "name_zh": "潮流服飾、鞋履與配件",
    "name_en": "Fashion, Shoes & Accessories",
    "subcategories": [
      { "_id": "subcat_top", "name_zh": "上衣", ... },
      ...
    ]
  },
  ...
]
```

- 客戶選類別後，subcategory_id 必須屬於該 category_id

### AC-4.14 notifications schema 寫入（無 UI）

**Given** 客戶建一筆 inbound 成功
**When** 查 OMS `notifications` collection
**Then** 一筆 record：
- client_id 對映
- type=inbound_created
- reference_type=inbound、reference_id=I-...
- action_url=`/zh-hk/inbound/I-...`
- is_read=false

**測試**：
- 取消、廢棄、編輯各自寫一筆
- v1 沒 UI 訪問 notifications，純 schema 驗證

### AC-4.15 admin 看所有預報（read-only）

**Given** admin 已登入
**When** GET `/api/wms/inbound`
**Then** 所有客戶預報，含 client 資訊

**測試**：
- 非 admin → 403
- admin 試圖 PATCH `/api/wms/inbound/:id`（不是 abandon）→ 4xx 或 method not allowed

### AC-4.16 admin 修 Bug 1：後台建單

**Given** admin 已登入
**When** POST `/api/wms/inbound` body 含 client_id（admin 必選哪個客戶）+ 所有必填
**Then**
- 寫入兩 DB（vw_wms + vw_sms）
- abandoned_by_client=null（不是客戶建的）
- created_by_staff_id=admin id
- notifications 寫給 client_id 那位客戶

**測試**：
- 缺 client_id → 4xx
- admin 自己沒選實際 client，server 拒絕（不能 default）

### AC-4.17 cross-service sync token 驗證（修 Bug 7）

**Given** 任意非 internal 來源
**When** POST `/api/wms/utils/sync` 不帶 X-Internal-Sync header 或帶錯
**Then** 401 / 403

**測試**：
- WMS 內部 sync 帶正確 header → 200
- 攻擊者試圖直接打此 endpoint → 拒

### AC-4.18 CSV 匯入 fail loud

**Given** 客戶 / admin 試圖呼叫 CSV import
**When** POST `/api/cms/inbound/import-csv`
**Then** 501 Not Implemented，message 明確：「CSV import is not available in v1」

**禁止**：return `{ success: true }` 假裝成功（fuuffy A2 避坑）

---

## 7. 風險點 + 已知 gotcha

### 7.1 雙寫 OMS / WMS 的一致性

每筆 inbound 同時寫 `vw_sms` 和 `vw_wms`（透過 cross-service sync）。

**處理**：
- OMS 寫主檔 + 寫 declared_items + 寫 notification 用 mongo session transaction（單一服務原子）
- 同步推 WMS 失敗 → 寫 `sync_failed_logs` + UI 警告（不 rollback OMS）
- v1 不做自動補單（admin 看到 sync_failed_logs 手動處理）
- Phase 4 後做的橫向地基整合會處理（Phase 4-9 走完後一次性）

### 7.2 single 模式但客戶未綁 carrier

UI 阻擋（dropdown 為空時 disabled），但 backend 也要驗。

**處理**：
- frontend：UI dropdown 為空 → 顯示「請先到『物流帳號』綁定 carrier」+ 連結 + 提交按鈕 disabled
- backend：carrier_account_id 必填 + 驗證屬該客戶且 active → 4xx

### 7.3 daily_counters 並發

業主提到一天最多 999 票應該 forsee，所以 4 位（最多 9999 / 天）夠。

**處理**：
- mongo `findOneAndUpdate` 是原子，不會撞號
- 萬一一天超過 9999 → throw `DAILY_COUNTER_EXCEEDED`，admin 應立即擴 5 位（schema migration）

### 7.4 `tracking_no_normalized` 移除過多字元

normalize 規則激進可能誤判：
- 例：`AB-1234` 跟 `AB1234` normalize 都是 `AB1234` ✓ 正確
- 例：`123/456` 跟 `123456` normalize 一個是 `123/456`（沒移 `/`）一個是 `123456` ✗ 沒誤判

**v1 限制**：normalize 只移 `-`、空白，不移其他符號。OK：
- `/` `_` `.` `(` `)` 等保留
- 客戶手抖打了 `12 34/56-78` → `123456-78`

容錯空間 OK，業務上撞號率夠低。未來真撞了再改。

### 7.5 declared_value_total 算錯

容易發生在：客戶編輯品項後 cache 沒更新。

**處理**：
- service 層所有改 declared_items 的操作（增刪改）都觸發 recalculate
- `inbound_requests.declared_value_total` 不能直接 update（mongoose pre-save hook 防呆，類似 Phase 3 walletService 模式）

### 7.6 倉庫地址 multi-language 一致性

中文 / 英文要由 admin 維護。可能出現只填中文、英文是空的情況。

**處理**：
- WMS admin 表單兩欄都必填
- 客戶 OMS 詳情頁顯示時：`address_zh` 缺則 fallback 顯示 `address_en`；都缺則顯示「地址資料不完整，請聯絡客服」

### 7.7 `single_shipping.receiver_address.country_code` 限制

v1 收貨地是香港，但 schema 不限制 country_code（為未來其他收貨地預留）。

**處理**：
- v1 表單 default country_code='HK'
- 提交時 backend 不卡限制，但記 log 警告非 HK 的單（給 admin 觀察）

### 7.8 admin 強制廢棄的 Phase 6 cron

業主決策 D.2：30 + 30 流程（30 天警告 + 再 30 天可廢棄）。

**Phase 4 範圍**：
- schema 加 `abandon_warning_sent_at` 欄位
- WMS 詳情頁可手動觸發「強制廢棄」（admin 自己判斷時機，按按鈕）

**Phase 6 範圍**：
- cron 自動找 status ∈ {arrived, received} 且 createdAt < 30 days 前 → 寄警告 + 設 `abandon_warning_sent_at`
- 再過 30 天 → 列入「待廢棄列表」（admin 看到 + 點按鈕廢棄，仍要 admin 確認 + 寫 reason）

Phase 4 不做 cron。

### 7.9 declared_items 數量上限

業務上一單有多少 declared_items？

**v1 限制**：單筆 inbound 的 declared_items ≤ 50 筆。
- 退運貨情境一箱 30 樣 OK
- 50 是合理上限避免 abuse / 性能問題
- 超過 → 4xx `TOO_MANY_DECLARED_ITEMS`

### 7.10 size_estimate 跟實際差很大

客戶選 small 但實際是 oversized。

**v1 處理**：
- Phase 4 純客戶估算，**不做業務邏輯**依賴
- Phase 5 PDA 簽入時量到實際 dimension（actualDimension），跟 size_estimate 比對 → CS 在 WMS 看異常清單（Phase 5 範圍）
- Phase 4 schema 端：`size_estimate` 跟 `actualDimension` 兩個欄位都存，比對由 Phase 5 / Phase 6 邏輯處理

### 7.11 inbound_source 的清關處理

業主決策：v1 純資訊欄位、無業務邏輯依賴。

**注意**：未來真接清關 / 海關 API 時，retail / return / gift 對應的關稅 / 報關規則不同。Phase 4 schema 預備好。

---

## 8. 開發順序建議

給 Claude Code 落地的子步驟：

1. **主檔 schema + seed**：warehouses 擴充 / carriers_inbound 新增 / product_categories 新增（業主提供 seed list）
2. **inbound_requests schema 重構** + inbound_declared_items + daily_counters
3. **clients.default_shipping_address 欄位**（Phase 1 沒加，Phase 4 補）
4. **OMS 主檔查詢 API**（warehouses / carriers-inbound / product-categories 樹狀回應）
5. **OMS 建單 API + zod schema + cross-service sync**
6. **OMS 建單 UI（含多品項 drawer + single 區塊）**
7. **OMS 列表 + 詳情 + 編輯**
8. **OMS 取消 / 廢棄 流程**
9. **修 Bug 1：WMS 後台建單 API + UI**
10. **WMS admin 看預報列表 + 詳情（read-only）**
11. **WMS admin 強制廢棄按鈕**
12. **修 Bug 7：sync 路由加 token 驗證**
13. **notifications schema + service**（v1 純寫入，無 UI）
14. **CSV 匯入 placeholder 路由**
15. **跑全部 acceptance criteria**

---

## 9. 變更紀錄

| 版本 | 日期 | 說明 |
|---|---|---|
| v1.0 | 2026-05-08 | Phase 4 首次定稿 |
