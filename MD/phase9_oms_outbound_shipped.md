# Phase 9：客戶 OMS 已出庫追蹤頁

> 集運 OMS+WMS v1 開發規格
> 版本：v1.0
> 日期：2026-05-10
> 範圍：純 OMS 客戶端「已出庫」分頁 + 列表展示 tracking + 跳 carrier 官網查詢
> 前置：Phase 1-8 已完成或同步開發
> 業務地位：v1 出貨後客戶最後一個觸點，僅做展示，不涉及任何後端整合

---

## 0. 前設

### 0.1 v1 業務參數（沿用前 phase）

| 項目 | v1 設定 |
|---|---|
| 全局幣別 | HKD |
| 入庫地 | 日本埼玉一個倉 |
| 收貨地 | 香港 |
| v1 carrier | 雲途（API key）+ Fuuffy（OAuth）|
| v1 主力 carrier | **Fuuffy（UPS reseller）** — 90%+ 流量走這條 |
| 業務量上限 | 半年內 ≤ 50 客戶 |

### 0.2 業務量假設

v1 上線半年內 ≤ 50 客戶，每客戶月均 5-10 筆 outbound。「已出庫」分頁累積資料 ≤ 3000 筆 / 半年。設計不需考慮分頁優化、不需 cache、不需歷史歸檔。

### 0.3 範圍

**包含：**
- 客戶 OMS 新增「已出庫」分頁（路徑 `/zh-hk/outbound/shipped`）
- 列表展示所有 `status=departed` 的 outbound
- 列表欄位：出庫單 ID / 出庫時間 / carrier / 收件人 / tracking summary / 包裹概覽
- 每筆可展開明細：顯示 outbound_boxes（每箱尺寸/重量 + tracking + 對應 inbound 列表）
- Tracking 號展示 + 跳 UPS 官網連結（新分頁開）
- Tracking 號 copy 按鈕
- 篩選：收件人國家/地區、carrier、出庫時間區間
- 搜尋：出庫單 ID / tracking number / 收件人名稱
- 排序：出庫時間 desc 預設、創建時間、出庫單 ID
- 分頁切換（10 / 20 / 50 筆）
- `carriers` 主檔擴充 `tracking_url_template` 欄位
- Phase 8 mock label adapter update（用 3 個 valid UPS tracking 輪流回傳）

**不包含：**
- ❌ Carrier webhook 接收（任何形式）
- ❌ Carrier API tracking pull cron
- ❌ Tracking event timeline 儲存
- ❌ Delivered 狀態流轉（v1 outbound 終態 = `departed`）
- ❌ Delivered notification 給客戶
- ❌ WMS 端 tracking UI 改造
- ❌ 「派送中 vs 派送完成」分頁切分（v1 不分，等 v2 webhook 接通才有真實狀態可分）
- ❌ 雲途 tracking URL（v1 主力 carrier 是 Fuuffy/UPS，雲途 seed 留空 / placeholder）
- ❌ 客戶取消已出庫單功能（出貨後不可取消，沿用 Phase 7/8 既有 status 限制）

### 0.4 技術棧

沿用 ShipItAsia 既有 + Phase 1-8 已建。**Phase 9 完全不新增 service**，純前端 + 既有 service 改造：
- 重用 Phase 7/8 的 `outboundService.list`（加 status filter 參數）
- 重用 Phase 7/8 的 `outboundService.getById`（已含 boxes / inbound_links 關聯查詢）

### 0.5 UI 設計風格

完全沿用 ShipItAsia 既有 layout / 元件 / 色系 / Tabler icons。展開明細的視覺借鏡 Fuuffy biz「派送完成」頁設計。

---

## 1. 業務流程

### 1.1 客戶看「已出庫」列表

#### 1.1.1 進入頁面

- 路徑：`/zh-hk/outbound/shipped`
- Sidebar 結構（出庫管理 group 底下）：
  ```
  出庫管理
    ├── 出庫單列表        /zh-hk/outbound/list      ← 既有 Phase 7
    ├── 建立出庫          /zh-hk/outbound/new       ← 既有 Phase 7
    └── 已出庫            /zh-hk/outbound/shipped   ← Phase 9 新增
  ```
- Tabler icon: `IconTruckDelivery`
- 預設顯示登入客戶所有 `status=departed` 的 outbound

#### 1.1.2 列表頂部資訊列

- 頁面標題：「已出庫」
- 筆數顯示：「共 X 筆」（filter 後筆數）
- 右上角：[重新整理] 按鈕（refresh，純前端 reload list）

#### 1.1.3 篩選 / 搜尋區

```
[搜尋框：以出庫單 ID、追蹤號、收件人搜尋]    [收件人國家/地區 ▼] [快遞服務 ▼] [出庫時間 ▼] [新增排序 ↑↓] [清除所有篩選]
```

**搜尋框規則：**
- 模糊搜尋以下欄位：
  - `outbound_requests._id`（出庫單 ID）
  - `outbound_boxes.tracking_no_carrier`（tracking 號）
  - `outbound_requests.receiver_address.name`（收件人）
- min 2 字元觸發查詢，debounce 300ms
- 後端 regex 查詢（v1 業務量小，效能可忽略）

**篩選器：**
- **收件人國家/地區**（multi-select）：HK / TW / JP / US / 其他
  - options 從 `outbound_requests.receiver_address.country_code` aggregate
- **快遞服務**（multi-select）：Fuuffy / 雲途 / ...
  - options 從 active 的 `carriers` 主檔
- **出庫時間區間**（date range picker）：篩選 `departed_at` 落在區間內

**排序：**
- 出庫時間 desc（預設）
- 出庫時間 asc
- 創建時間 desc / asc
- 出庫單 ID asc / desc

**清除所有篩選：** reset 至預設狀態（無搜尋、無 filter、出庫時間 desc 排序）。

#### 1.1.4 列表欄位（每筆 outbound 一行）

借鏡 Fuuffy biz「派送完成」頁設計。

| 欄位 | 寬度 | 內容 | 資料來源 |
|---|---|---|---|
| 出庫單 ID + 時間 | 15% | OUT-20260510-0001<br/>創建時間：2026-03-23 11:14:14<br/>備註：[remarks 摘要 / 沒有備註] + 編輯 icon | `outbound_requests._id` / `createdAt` / `remarks` |
| 快遞服務 | 30% | [國際運單 badge]<br/>[carrier logo] Fuuffy (UPS Express Saver)<br/>追蹤編號：1ZB87K33... [📋 copy] [🌐 跳 UPS]<br/>運費（HKD）：$XXX<br/>收費總價：HKD $XXX | `carriers.name_zh` + `outbound.carrier_service`（如有）+ `outbound_boxes[*].tracking_no_carrier` + `outbound.actual_label_fee` |
| 寄件人 | 18% | 倉庫聯絡人<br/>+81 倉庫電話<br/>倉庫地址（多語言） | 從 `warehouses` 主檔取（出貨倉庫 = 埼玉）|
| 收件人 | 18% | 客戶填的 receiver name<br/>+852 phone<br/>收件地址（line1 + city 摘要）<br/>國家 | `outbound.receiver_address` snapshot |
| 包裹資訊 | 15% | 包裹 1: 46 x 35 x 40, 5.3kg<br/>・物品 1: PAPER GAME CARD<br/>計費重量：13kg<br/>（多箱顯示 summary：「3 箱 / 共 5 件」+ [展開查看]）| `outbound_boxes[*]` + `inbound_declared_items[*]` 摘要 |
| 動作 | 4% | [⋯ 更多] dropdown：[查看詳情] / [下載發票（v1 placeholder）] | - |

**單筆 row 點擊整列**：展開明細 drawer（見 §1.2）。

#### 1.1.5 多箱 outbound 顯示策略

一個 outbound 可能含多個 box（Phase 8 拆箱），列表行為：

- 列表只顯示 **summary**（如「3 箱」+ 第一箱的 tracking 預覽）
- 完整 tracking 列表在展開明細時才看（§1.2）
- 列表不展開時不渲染 N 個 tracking row（避免列表行高暴增）

**Tracking summary 顯示規則：**
- 1 箱 → 直接顯示該 tracking
- 2-3 箱 → 顯示前 2 個 tracking + `(+1 個)` 文字
- 4+ 箱 → 顯示第 1 個 tracking + `(共 N 個追蹤號)` + [展開查看] 連結

#### 1.1.6 ID 格式

繼續沿用 Phase 7 的 `OUT-YYYYMMDD-NNNN` 格式，無變動。

### 1.2 展開明細

#### 1.2.1 展開觸發

- 點擊列表任一行 → 開啟 right drawer / 行內 accordion（依既有 ShipItAsia layout 模式選一致風格）
- Phase 9 v1 建議用 **行內 accordion**（仿 Fuuffy biz 截圖體驗），點擊行展開，再點擊收合
- drawer 模式留待 v2 重 UX iteration 時討論

#### 1.2.2 明細內容結構

```
┌─ 出庫單 OUT-20260510-0001 詳情 ───────────────────────┐
│                                                         │
│ [基本資訊區]                                             │
│ ・出庫時間：2026-03-23 14:30:00                           │
│ ・Carrier：Fuuffy（UPS Express Saver）                  │
│ ・處理偏好：自動 / 出貨前確認                             │
│ ・收件人：Jason Yeung +852 64352652                      │
│ ・收件地址：Rm06, 21C 21F, KWAI CHUNG, 香港              │
│ ・運費總價：HKD $624.00                                  │
│                                                         │
│ [包裹清單區 - Q3 選 C 的核心]                            │
│ ┌───────────────────────────────────────────────────┐   │
│ │ 箱 1（B-OUT-20260510-0001-01）                    │   │
│ │ ・尺寸：46 × 35 × 40 cm                            │   │
│ │ ・實重：5.3kg / 計費重：13kg                        │   │
│ │ ・追蹤號：1ZB87K338634800548                       │   │
│ │   [📋 copy] [🌐 UPS 官網查詢]                      │   │
│ │ ・內含 inbound：                                    │   │
│ │   ├─ I-20260501-0001                              │   │
│ │   │  Tracking: ABC123XYZ                          │   │
│ │   │  ・PAPER GAME CARD x 1（JPY 5,000）            │   │
│ │   │  ・GAME DEVICE x 1（JPY 12,000）               │   │
│ │   └─ I-20260502-0003                              │   │
│ │      Tracking: DEF456UVW                          │   │
│ │      ・電子產品配件 x 2（JPY 3,000）               │   │
│ └───────────────────────────────────────────────────┘   │
│ ┌───────────────────────────────────────────────────┐   │
│ │ 箱 2（B-OUT-20260510-0001-02）                    │   │
│ │ ...（同上結構）                                    │   │
│ └───────────────────────────────────────────────────┘   │
│                                                         │
│ [動作區]                                                 │
│ [收合明細]                                               │
└─────────────────────────────────────────────────────────┘
```

#### 1.2.3 資料來源 mapping

| 明細欄位 | Collection | 欄位 |
|---|---|---|
| 出庫時間 | outbound_requests | departed_at |
| Carrier | carriers (join via outbound.carrier_code) | name_zh |
| 處理偏好 | outbound_requests | processing_preference |
| 收件人 | outbound_requests | receiver_address (snapshot) |
| 運費總價 | outbound_requests | actual_label_fee |
| 箱清單 | outbound_boxes | 全欄位（box_no, dimension, weight, tracking_no_carrier）|
| 箱內 inbound | box_inbound_links | 中介表（join inbound_requests）|
| Inbound 申報品項 | inbound_declared_items | category, product_name, quantity, unit_price |

#### 1.2.4 Tracking 連結點擊行為

點擊 [🌐 UPS 官網查詢]：

```typescript
const carrier = await Carrier.findOne({ carrier_code: outbound.carrier_code });
const url = carrier.tracking_url_template?.replace('{tracking_no}', encodeURIComponent(box.tracking_no_carrier));
window.open(url, '_blank', 'noopener,noreferrer');
```

**安全：**
- `target=_blank` + `rel="noopener noreferrer"`（防 tabnabbing）
- tracking_no 走 `encodeURIComponent`（理論上 UPS 1Z 格式無特殊字元，但防後續其他 carrier 接入時 bug）

**Edge cases：**
- `carrier.tracking_url_template` 為 null / 空 → 圖示 disable + tooltip「此 carrier 暫不支援線上查詢，請聯繫客服」
- `box.tracking_no_carrier` 為 null → 整個 tracking row 顯示「追蹤號未產生」灰底（理論上 status=departed 一定有 tracking，但保險顯示處理）

### 1.3 Tracking 號 copy 行為

- 點擊 [📋] 圖示 → navigator.clipboard 寫入 tracking number
- 顯示 toast「已複製：1ZB87K338634800548」(2 秒消失)
- 失敗 fallback：顯示提示「無法存取剪貼簿，請手動複製」+ 把 tracking number 選取起來

### 1.4 沒有 outbound 的空狀態

- 當客戶從未建過 outbound 或無 departed 紀錄
- 顯示空狀態 illustration + 文案：「尚未有已出庫的訂單」+ [建立出庫] 主按鈕（連到 `/zh-hk/outbound/new`）

### 1.5 篩選後無結果

- 顯示文案：「沒有符合條件的出庫單」+ [清除所有篩選] 按鈕

---

## 2. Schema 變更

### 2.1 `carriers`（**擴充** Phase 2）

新增 1 個欄位：

| 欄位 | 型別 | 既有 / 新增 | 說明 |
|---|---|---|---|
| `tracking_url_template` | string? | **新增** | tracking URL 模板，用 `{tracking_no}` 作為佔位符。null 表示此 carrier 不支援線上查詢 |

**驗證規則：**
- 必須包含 `{tracking_no}` 字串（如有設）
- 必須是合法 URL（http / https 開頭）
- 長度 ≤ 500

**index：** 不需新增（既有 `carrier_code` unique 已足）。

### 2.2 不需新增的 collection

Phase 9 不新增任何 collection。所有資料來自：
- `outbound_requests`（Phase 7/8 既有）
- `outbound_boxes`（Phase 8 既有）
- `box_inbound_links`（Phase 8 既有）
- `inbound_requests`（Phase 4-6 既有）
- `inbound_declared_items`（Phase 4 既有）
- `carriers`（Phase 2 既有 + §2.1 擴充）
- `warehouses`（Phase 4 既有，多語言地址）

### 2.3 不需改動的 schema

- `outbound_requests` 終態欄位（`departed_at`、`status='departed'`）→ Phase 8 已建
- `outbound_boxes.tracking_no_carrier` → Phase 8 已建
- `outbound_boxes.dimension` / `weight_actual` / `weight_billable` → Phase 8 已建

---

## 3. 頁面 / API 清單

### 3.1 OMS 新頁面

| 路徑 | 用途 | 對映既有 |
|---|---|---|
| `/zh-hk/outbound/shipped` | 已出庫列表頁 | 仿 ShipItAsia 既有 list 頁 + 借鏡 Fuuffy biz 設計 |

### 3.2 OMS 新增 / 既有改造 API

```
# 新增（Phase 9 專用 list endpoint，含 status filter + 嵌入 boxes/inbound 概覽）
GET    /api/cms/outbound/shipped                  
       Query params:
         - search (string)
         - country_codes (string[])
         - carrier_codes (string[])
         - departed_from (ISO date)
         - departed_to (ISO date)
         - sort_by (enum: departed_at | createdAt | _id)
         - sort_order (asc | desc)
         - page (number, default 1)
         - page_size (number, default 10, max 50)
       Response:
         {
           items: OutboundShippedListItem[],
           pagination: { total, page, page_size, total_pages }
         }

# 既有 Phase 7 endpoint，Phase 9 加 boxes / inbound_links 的 join
GET    /api/cms/outbound/:id                      
       Response 擴充：含 boxes[] + 每個 box 的 inbound_links + 每個 inbound 的 declared_items
```

### 3.3 OMS Carrier 主檔 API（既有 Phase 2 read API）

```
GET    /api/cms/carriers                          
       Response 擴充：含 tracking_url_template 欄位（讓前端 build URL）
```

### 3.4 WMS Carrier 管理 API（既有 Phase 2 admin API）

```
PATCH  /api/wms/carriers/:id                      
       Body 擴充：可更新 tracking_url_template 欄位
```

### 3.5 OutboundShippedListItem TypeScript 介面

```typescript
interface OutboundShippedListItem {
  _id: string;                          // OUT-...
  createdAt: string;                    // ISO
  departed_at: string;                  // ISO
  remarks: string | null;
  
  carrier: {
    carrier_code: string;
    name_zh: string;
    name_en: string;
    logo_url: string | null;
    tracking_url_template: string | null;
  };
  carrier_service: string | null;       // 例: "Express Saver"
  
  sender: {                              // 倉庫資訊（從 warehouses 主檔取）
    contact_name: string;
    phone: string;
    address: string;                     // 多語言 fallback 處理後字串
    country_code: string;
  };
  receiver: {                            // outbound.receiver_address snapshot
    name: string;
    phone: string;
    country_code: string;
    city: string;
    address_line1: string;
    address_line2: string | null;
    postal_code: string | null;
  };
  
  // Tracking summary（給列表用）
  total_boxes: number;
  total_inbound_count: number;
  tracking_summary: {
    primary_tracking_no: string | null;  // 第一箱的
    additional_count: number;            // 0 表示只有 1 箱
  };
  
  // 費用
  actual_label_fee: number | null;       // HKD
  total_amount_charged: number | null;   // HKD（含處理費等，Phase 7/8 已寫入）
  
  // 列表行的 first box preview（給「包裹資訊」欄位用）
  first_box_preview: {
    box_no: string;
    dimension: { length: number; width: number; height: number };
    weight_actual: number;
    weight_billable: number;
    first_item_name: string | null;     // 首個 declared_items 名稱
  } | null;
}
```

詳情 API 回應結構（沿用 Phase 7 既有 + Phase 9 擴充展開明細所需的關聯資料）：

```typescript
interface OutboundShippedDetail extends OutboundShippedListItem {
  processing_preference: 'auto' | 'confirm_before_label';
  
  boxes: Array<{
    _id: string;                         // box_id
    box_no: string;                      // B-OUT-...-01
    dimension: { length: number; width: number; height: number };
    weight_actual: number;
    weight_billable: number;
    tracking_no_carrier: string | null;
    
    inbound_items: Array<{
      inbound_id: string;                // I-...
      tracking_no: string;               // 客戶建單時填的
      declared_items: Array<{
        category_id: string;
        category_name_zh: string;
        product_name: string;
        quantity: number;
        unit_price: number;
        currency: string;                // JPY
        subtotal: number;
      }>;
    }>;
  }>;
}
```

### 3.6 Sidebar 改造

**OMS sidebar「出庫管理」group 新增：**

```
出庫管理
  ├── 出庫單列表 (Phase 7 既有)        /zh-hk/outbound/list
  ├── 建立出庫 (Phase 7 既有)          /zh-hk/outbound/new
  └── 已出庫 (Phase 9 新增)            /zh-hk/outbound/shipped
```

**WMS sidebar 不變**（Phase 9 不涉及 WMS UI）。

---

## 4. ShipItAsia 既有現況對映

| 既有 | 處理 |
|---|---|
| `/zh-hk/outbound/list`（既有 Phase 7 客戶 outbound 總列表） | **保留不動**。客戶仍可從這頁看到所有狀態（含 departed），Phase 9 只加新的快捷頁 |
| `outboundService.list` 既有實作 | **小幅改造**：新增 `?status=departed` filter 參數 + 新增「join boxes / inbound_links / declared_items」option（既有實作預設不 join，避免 list 性能問題；shipped 頁需要 first box preview 才打開）|
| `outboundService.getById` 既有實作 | **改造**：完整 join 所有展開明細所需關聯（Phase 9 list 用 lite 版本，detail 用 full 版本）|
| `carriers` 主檔（Phase 2 建）| **擴充 1 欄位** `tracking_url_template`（§2.1）|
| Phase 8 §1.5 mock label adapter（hash 算 tracking）| **改造**：用 outbound_box_id hash mod 3 輪流回傳 `1ZB87K338634800548 / 1ZB87K338600636718 / 1ZB87K338614953984`（見 §6 Phase 8 Mock Update 附註）|

---

## 5. Fuuffy 借鏡

### 5.1 借鏡 B5（主檔 vs 動作快照拆分 ⭐⭐⭐⭐⭐）— 純讀取場景

Phase 9 純讀取，不寫資料，但讀取結構清楚對應 fuuffy B5 原則：

- 主檔 `outbound_requests` 給列表用（high-level info）
- 子集合 `outbound_boxes` 給展開明細用（per-box detail）
- 動作快照 `outbound_scans`（Phase 8 既有 append-only）**不**在 Phase 9 顯示給客戶（純員工 audit 用）

### 5.2 借鏡 Fuuffy biz「派送完成」頁 UI 設計

直接借鏡客戶提供的 Fuuffy biz 截圖：

| Fuuffy biz 元素 | Phase 9 對應 |
|---|---|
| 左側 sidebar 子分類「派送完成」| OMS 出庫管理 group 下「已出庫」選項 |
| 頂部分頁筆數（如「(8)」）| 暫不做（v1 sidebar 簡潔，避免動態查詢拖慢渲染）。v2 可加 |
| 國際/中國/本地、快遞服務、收件人國家/地區、運單類別 篩選 | Phase 9 採類似結構，但 v1 不做「運單類別」（v1 全是國際運單，沒有分類意義）|
| 行內展開 carrier + tracking + 寄件人 + 收件人 + 包裹資訊 | Phase 9 §1.1.4 列表欄位完全對齊 |
| 追蹤號旁邊 [📋 copy] [🌐 跳官網] 圖示 | Phase 9 §1.3 / §1.2.4 對應實作 |

**不借鏡的東西：**
- ❌ 帳戶餘額顯示（Phase 9 與餘額無關，不重複放）
- ❌ FUUFFY DOLLAR（不適用）
- ❌ 取件號（v1 不收件，客戶自己寄到倉，沒有取件流程）
- ❌ 期望取件日期（同上）
- ❌ 商業發票（v1 純 placeholder，留 v2）

### 5.3 死守 A1（carrier 抽象層）

Phase 9 tracking URL 從 `carriers.tracking_url_template` 取，**不寫死 if/else carrier_code**。新增 carrier = 加一筆 carrier 主檔 + 設好 template，前端代碼 0 改動。

### 5.4 避坑 A2（silent stub return success）

Phase 8 mock label adapter update（§6）走「輪流回傳 valid UPS tracking」是合理的 mock fixture，不算 silent stub：
- mock 行為明確（輪流選 3 個固定值）
- mock 寫入的 tracking 是 **真實 valid UPS 號**，能驗證跳轉邏輯（不像 placeholder 的假號跳過去 UPS 報錯）
- env flag `PHASE8_USE_MOCK_CARRIER=true` 切到 mock 時才用，prod 切真 API 自然會用 carrier 回的真 tracking

---

## 6. Phase 8 Mock Update（落地時一併處理）

> **重要：** 此節是 Phase 9 spec 對 Phase 8 既有實作的 update 指引。Claude Code 落地 Phase 9 時必須順手調整 Phase 8 mock label adapter。Phase 8 spec 文件本身不重發 v1.1（避免版本混亂），以本 spec §6 為準。

### 6.1 既有 Phase 8 mock 行為

Phase 8 §1.5 mock label adapter 原行為：用 outbound_box_id hash 算出假的 tracking number（格式不固定，可能是 `MOCK-{hash}` 或類似）。

### 6.2 Phase 9 update 後的 mock 行為

```typescript
// adapters/mock/mockLabelAdapter.ts

const MOCK_UPS_TRACKINGS = [
  '1ZB87K338634800548',
  '1ZB87K338600636718',
  '1ZB87K338614953984',
] as const;

function pickMockTracking(outboundBoxId: string): string {
  // 用 outbound_box_id hash mod 3，同 box 重新取 label 拿到同一個 tracking（reproducible）
  const hash = simpleHash(outboundBoxId); // FNV-1a or djb2，純 number 即可
  return MOCK_UPS_TRACKINGS[hash % 3];
}

async function mockGetLabel({ outbound_box_id, ... }: GetLabelParams): Promise<GetLabelResult> {
  return {
    tracking_no_carrier: pickMockTracking(outbound_box_id),
    label_pdf_base64: MOCK_LABEL_PDF_BASE64, // 既有 placeholder PDF
    fee_amount: 100,                          // 既有 mock fee
    carrier_response_raw: { mock: true, picked_at: new Date().toISOString() },
  };
}
```

**simpleHash 範例（djb2）：**
```typescript
function simpleHash(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
  }
  return Math.abs(hash);
}
```

### 6.3 mock cancel label 行為

Phase 8 mock cancel label adapter 不變，仍 return success（沒有 tracking 衝突問題）。

### 6.4 切換真實 API 流程不變

`PHASE8_USE_MOCK_CARRIER=false` 時走真實 carrier adapter（雲途 / Fuuffy），mock fixture 不影響 prod。

### 6.5 為什麼用真實 valid UPS tracking

- Phase 9 跳轉 UPS 官網的 link 必須能跳到真有資料的頁面（驗證 URL build 邏輯正確）
- mock 用「假 tracking」會讓開發者點 UPS 連結看到「Unable to find tracking」，**無法分辨是 URL 構建錯還是 carrier 端問題**
- 客戶提供的這 3 個 tracking 是過去 Fuuffy/UPS 已用過的真單號，UPS 官網能跳出歷史紀錄頁，足夠驗證

---

## 7. v1 Seed Data Update

### 7.1 carriers 主檔（Phase 2 既有 seed 補欄位）

**Fuuffy carrier seed update：**

```json
{
  "carrier_code": "fuuffy",
  // ... Phase 2 既有欄位 ...
  "tracking_url_template": "https://www.ups.com/track?loc=zh_HK&tracknum={tracking_no}"
}
```

**雲途 carrier seed update：**

```json
{
  "carrier_code": "yunexpress",
  // ... Phase 2 既有欄位 ...
  "tracking_url_template": null
}
```

> **註：** 雲途 v1 不主動接通 tracking 查詢頁。如果 Phase 9 落地時想加，可填雲途自家追蹤頁（例：`https://www.yuntrack.com/parcelTracking?id={tracking_no}`，需驗證）。**v1 spec 採保守 null，先讓主流程跑通**。

### 7.2 WMS admin UI 提醒

WMS `/zh-hk/carriers/[id]/edit` 編輯頁需新增 input：

```
追蹤頁 URL 模板（選填）
[https://www.ups.com/track?loc=zh_HK&tracknum={tracking_no}                  ]
ⓘ 客戶在「已出庫」頁點追蹤號跳轉的目標 URL。{tracking_no} 為 tracking 號佔位符。留空則該 carrier 不顯示跳轉連結。
```

驗證規則對應 §2.1。

---

## 8. 邊角 Case

### 8.1 客戶有 outbound 但 carrier 主檔 tracking_url_template 是 null

- 列表 / 詳情頁「🌐 UPS 官網查詢」按鈕 disable + grayed out
- Tooltip：「此 carrier 暫不支援線上追蹤查詢」
- copy 按鈕仍正常顯示 + 可用

### 8.2 outbound.status=departed 但 outbound_boxes 都沒 tracking

- 理論上 Phase 8 規則：`status=departed` 一定有所有箱的 tracking（label_obtained 才能 print 才能 depart）
- 但保險：列表 tracking summary 顯示「追蹤號未產生」灰底 + 標 ⚠️
- 詳情頁箱級顯示「追蹤號未產生」+ 動作區提示「請聯繫客服」
- 同時寫 `audit_logs`（type: `data_integrity_warning`）方便 admin 排查

### 8.3 carrier 被 admin 在主檔軟刪後查看歷史 outbound

- 列表 / 詳情頁仍顯示原 carrier 名稱（從 outbound 建單時的 snapshot 或 graceful join）
- 跳官網連結 / copy 按鈕正常運作（tracking_no 已寫死在 outbound_boxes）

**處理：** outbound_requests / outbound_boxes 應在 Phase 7/8 建單時 snapshot carrier `name_zh / name_en / logo_url / tracking_url_template`，避免主檔事後改動破壞歷史紀錄。

> **⚠️ Phase 7/8 既有 schema 沒做 carrier snapshot**，可能出現 carrier 改名 / 改 logo 後歷史頁面跟著變的情況。
> 
> Phase 9 v1 處理：carrier 主檔本身 v1 不允許 admin 軟刪（Phase 2 既有限制），且 carrier_code 不可改。所以 v1 以「join carrier 主檔」為簡化做法可接受。
>
> **v2 改進建議：** outbound 建單時 snapshot carrier 詳細資料到 outbound_requests，避免日後改名影響歷史。

### 8.4 收件人地址含特殊字元（中文 / 換行）

- 列表顯示：超出寬度 ellipsis（CSS `text-overflow: ellipsis`）+ hover 顯示 tooltip 全文
- 詳情顯示：完整地址，line break 保留

### 8.5 同一 outbound 多箱不同 tracking 顯示順序

- 依 box_no 升冪排序（B-OUT-...-01 / B-OUT-...-02 / ...）
- 順序固定，避免每次 refresh 順序不同

### 8.6 客戶搜尋 tracking number 不完整

- 模糊搜尋（regex）：「1ZB87K33」會 match 所有 1Z 開頭含 `B87K33` 的 tracking
- 不分大小寫
- min 2 字元才觸發查詢，避免單字元爆量

### 8.7 篩選後的 export 需求（v1 不做）

- 客戶問「能不能 export Excel」→ v1 範圍不做，留 v2
- v1 沒有「列印 / export」按鈕，避免客戶誤期待

### 8.8 出庫後客戶要求改地址 / 取消

- v1 純展示頁，不可編輯
- 客戶來客訴 → 走 Phase 7/8 既有 admin 後台處理流程（v1 不開客戶端取消 departed 後 outbound 的功能）

### 8.9 列表大量資料載入

- v1 業務量小（≤ 3000 筆 / 半年，依 client 切後 ≤ 600 筆）
- 預設 page_size 10，max 50
- 不需 cache，每次 fresh query
- 如出現性能問題（單客戶筆數過大）→ Phase 9 不修，留待 v2 加 index

### 8.10 mock UPS tracking 在 prod 出現

- 理論不可能（PHASE8_USE_MOCK_CARRIER=false 後 mock 不執行）
- 但保險：admin 後台 outbound 詳情頁顯示 tracking 是 `1ZB87K338634800548 / 1ZB87K338600636718 / 1ZB87K338614953984` 任一者 → admin UI 標 ⚠️ Mock badge
- v1 暫不做（信任 env flag），留 v2 加 detection

### 8.11 客戶 OMS 看到別人的已出庫單

- API 嚴格 filter `client_id`（從 JWT 取）
- 同 Phase 7/8 既有規則
- 防止 outbound_id URL 直接訪問別人的單（伺服器層 enforce 不只 UI hide）

### 8.12 outbound 不存在或 status 非 departed

- GET /api/cms/outbound/:id：
  - 不存在 → 404
  - status != departed 但 client 從 shipped 頁進入 → 仍可查看（避免狀態剛改變時客戶 race condition）
  - 但若客戶從 list 查詢，僅返回 status=departed 的單

### 8.13 編輯備註入口

- 列表 / 詳情頁的「沒有備註 / 已有備註 [✏️ 編輯]」入口 v1 是否開放？
- **v1 決策：不開放**。outbound 既已出貨，備註修改沒業務意義。Phase 7/8 既有 outbound 也是建單時填 + 業務操作中變更，departed 後鎖定。
- 列表顯示 remarks 純 read-only，不顯示編輯 icon。

---

## 9. AC（Acceptance Criteria）

### AC-9.1 客戶看「已出庫」列表

**Given** 客戶 A 有 5 筆 outbound：3 筆 departed，1 筆 packed，1 筆 cancelled
**When** 客戶 A 進入 `/zh-hk/outbound/shipped`
**Then**
- 列表顯示 3 筆（status=departed）
- 不顯示 packed / cancelled
- 排序預設 departed_at desc
- 共 3 筆顯示

**測試：**
- 客戶 B 不看到客戶 A 的單（client_id filter）
- 預設 page_size = 10
- 列表不顯示 box-level 資訊（只顯示 tracking summary + first box preview）

### AC-9.2 列表行展開明細

**Given** 客戶 A 看 shipped 列表，OUT-X 含 3 個 box
**When** 客戶點擊 OUT-X 那一行
**Then**
- 行內展開（accordion）
- 顯示 OUT-X 完整詳情（基本資訊 + 3 個 box，每個 box 顯示對應 inbound + declared_items）
- 再點擊一次 → 收合

**測試：**
- 同時展開多筆（accordion 不互斥，UX 友善）
- 每個 box 順序按 box_no asc
- 每個 inbound 順序按 created_at asc

### AC-9.3 Tracking 號 copy 行為

**Given** 客戶展開 OUT-X 詳情，箱 1 tracking = 1ZB87K338634800548
**When** 客戶點 [📋 copy] 圖示
**Then**
- 剪貼簿寫入 1ZB87K338634800548
- toast 顯示「已複製：1ZB87K338634800548」(2 秒消失)
- 箱 2 / 箱 3 的 tracking 不受影響

**測試：**
- 瀏覽器不支援 navigator.clipboard → fallback 顯示提示 + 選取文字
- 同時 copy 多次行為正常

### AC-9.4 Tracking 跳 UPS 官網

**Given** OUT-X 用 Fuuffy carrier，箱 1 tracking = 1ZB87K338634800548
**When** 客戶點 [🌐 UPS 官網查詢] 圖示
**Then**
- 新分頁開啟 https://www.ups.com/track?loc=zh_HK&tracknum=1ZB87K338634800548
- 主分頁停留在 OMS shipped 頁
- 主分頁不能被新開分頁透過 window.opener 操控（noopener）

**測試：**
- 不同 carrier 用各自 tracking_url_template
- carrier.tracking_url_template = null → 圖示 disable
- 多箱 outbound 點不同 box 的 tracking → 各自 build 正確 URL

### AC-9.5 篩選 - 收件人國家

**Given** 客戶 A 有 5 筆 departed outbound：3 筆 receiver country=HK，2 筆=TW
**When** 客戶選擇「收件人國家/地區: HK」filter
**Then**
- 列表顯示 3 筆
- pagination 重置到 page 1

**測試：**
- multi-select：HK + TW → 5 筆全顯示
- 清除 filter → 5 筆全顯示

### AC-9.6 篩選 - carrier

**Given** 客戶 A 有 5 筆 departed outbound：4 筆 fuuffy，1 筆 yunexpress
**When** 客戶選擇「快遞服務: Fuuffy」filter
**Then**
- 列表顯示 4 筆
- pagination 重置到 page 1

### AC-9.7 篩選 - 出庫時間區間

**Given** 客戶 A 有 outbound A1（departed_at=2026-03-01）/ A2（=2026-03-15）/ A3（=2026-04-10）
**When** 客戶選日期 range 2026-03-10 至 2026-03-20
**Then**
- 列表顯示 1 筆（A2）

**測試：**
- 邊界：2026-03-10 00:00:00 ~ 2026-03-20 23:59:59 UTC+8 包含
- 只填 from 不填 to → 視為從 from 至無限未來
- 只填 to 不填 from → 視為從無限過去至 to

### AC-9.8 搜尋

**Given** 客戶 A 有 OUT-20260510-0001（receiver=Jason Yeung，tracking_1=1ZB87K338634800548）
**When** 客戶搜尋
- "Jason"  → 命中 1 筆
- "1ZB87K33" → 命中 1 筆
- "OUT-20260510-0001" → 命中 1 筆
- "OUT-20260510" → 命中所有當日的單
- "x" → 不觸發查詢（< 2 字元）

### AC-9.9 排序

**Given** 客戶 A 有 5 筆 departed
**When** 客戶選排序「創建時間 asc」
**Then**
- 列表按 createdAt asc 排序
- pagination 重置到 page 1

### AC-9.10 分頁

**Given** 客戶 A 有 25 筆 departed
**When** 預設 page_size=10
**Then**
- page 1 顯示 1-10
- page 2 顯示 11-20
- page 3 顯示 21-25
- 切換 page_size=20 → page 1 顯示 1-20，page 2 顯示 21-25

**測試：**
- max page_size = 50（伺服器層 enforce，前端傳 100 → 後端 cap 50）

### AC-9.11 空狀態

**Given** 客戶 A 從未建過 outbound
**When** 客戶進入 shipped 頁
**Then**
- 顯示 illustration + 「尚未有已出庫的訂單」+ [建立出庫] 按鈕
- [建立出庫] 跳到 `/zh-hk/outbound/new`

### AC-9.12 篩選後無結果

**Given** 客戶 A 有 3 筆 fuuffy 的 departed outbound
**When** 客戶 filter 「快遞服務: 雲途」
**Then**
- 顯示「沒有符合條件的出庫單」+ [清除所有篩選] 按鈕

### AC-9.13 carrier tracking_url_template 為 null

**Given** OUT-Y 用 yunexpress（tracking_url_template=null）
**When** 客戶看 OUT-Y 詳情
**Then**
- 顯示 tracking number + copy 按鈕（可用）
- 🌐 圖示 grayed out + 不可點擊
- Tooltip：「此 carrier 暫不支援線上追蹤查詢」

### AC-9.14 outbound_boxes 沒 tracking_no_carrier（資料異常）

**Given** OUT-Z status=departed 但箱 1 tracking_no_carrier=null（理論上不應發生）
**When** 客戶看 OUT-Z 詳情
**Then**
- 箱 1 顯示「追蹤號未產生」灰底 + ⚠️
- copy / 跳轉按鈕都隱藏
- 同時寫 audit_logs (type: data_integrity_warning)

### AC-9.15 outbound 詳情 client_id 安全

**Given** 客戶 A 持 client_id=A
**When** A 嘗試 GET /api/cms/outbound/B-OUT-X（B 的單）
**Then**
- 4xx 不存在（不洩漏存在性）

### AC-9.16 Phase 8 mock label tracking 寫入

**Given** PHASE8_USE_MOCK_CARRIER=true，員工 trigger 取 label
**When** 系統取 label 完成
**Then**
- outbound_boxes.tracking_no_carrier 寫入 1ZB87K338634800548 / 1ZB87K338600636718 / 1ZB87K338614953984 任一個
- 同 box 重複取 label 拿到同一個 tracking
- 不同 box 拿到的 tracking 依 hash mod 3 分散

**測試：**
- 連續 6 個 box 觸發 mock → tracking 分布大致均勻（hash mod 3）
- 同一 box 觸發 2 次 → tracking 一致
- prod env（PHASE8_USE_MOCK_CARRIER=false）走真實 carrier，mock 不執行

### AC-9.17 已出庫 sidebar 路徑進入

**Given** 客戶 A 在 OMS 任一頁
**When** 客戶從 sidebar 點「出庫管理 > 已出庫」
**Then**
- 跳轉 `/zh-hk/outbound/shipped`
- sidebar 該選項顯示 active 狀態

### AC-9.18 同 client 大量資料

**Given** 客戶 A 有 600 筆 departed
**When** 客戶進入 shipped 頁，預設 page_size=10
**Then**
- 列表 60 頁
- 切到 page 60 顯示最後 10 筆
- 響應時間 < 500ms（v1 業務量範圍內）

### AC-9.19 carrier 主檔 tracking_url_template 編輯

**Given** WMS admin 在 carriers 編輯頁
**When** admin 填 `https://www.ups.com/track?loc=zh_HK&tracknum={tracking_no}` → save
**Then**
- 通過 validation
- DB 寫入
- 客戶端下次刷 shipped 頁拿到新 template

**測試：**
- 填無 `{tracking_no}` 字串 → 4xx
- 填非 http/https URL → 4xx
- 填 > 500 字元 → 4xx
- 填 null / 空字串 → 通過（停用該 carrier 的跳轉功能）

### AC-9.20 cross-service sync（不需要）

Phase 9 不涉及 OMS↔WMS sync，純 OMS 內 read API。skip。

---

## 10. v1 範圍外 / 留 v2 的議題

| 議題 | v1 處理 | v2 計畫 |
|---|---|---|
| 派送中 vs 派送完成分頁 | 不分，純「已出庫」 | webhook 接通後依真實狀態分 |
| Tracking event timeline | 不存 | webhook 推進來 → tracking_events collection |
| Delivered notification | 不通知 | webhook in_transit / delivered → notification |
| Export Excel / CSV | 不做 | 客戶要求量大時加 |
| 雲途 tracking URL | 留 null | 補 yuntrack URL 或自家追蹤頁 |
| Carrier snapshot 防改名 | 不做（v1 carrier 主檔 frozen）| outbound 建單時 snapshot carrier 細節 |
| 多語言地址 fallback | 用 Phase 4 既有規則 | 視 v2 設計再加 |
| Mock badge UI（detect prod 出現 mock tracking）| 不做 | admin UI 加偵測 |
| 客戶端取消 departed outbound | 不可（v1 全部走 admin）| 視業務需求 |
| Tracking URL 多 carrier 各自 zh_HK / en_US 切換 | 寫死 zh_HK | 跟著客戶 OMS 語言設定動態 |

---

## 11. 落地順序建議

1. **Schema 補欄位**：carriers.tracking_url_template + WMS admin UI 新增 input
2. **Phase 8 mock 改造**：依 §6 update mockLabelAdapter，3 個 valid UPS tracking + djb2 hash
3. **Carrier seed data update**：fuuffy = UPS template，yunexpress = null
4. **後端 API**：
   - GET /api/cms/outbound/shipped（list with filter / sort / pagination）
   - GET /api/cms/outbound/:id（既有 endpoint 擴充 boxes / inbound / declared_items join）
5. **前端 OMS shipped 頁**：
   - sidebar 新增「已出庫」選項
   - 列表頁實作（仿 Fuuffy biz 截圖 + ShipItAsia 既有元件）
   - 行內展開 accordion 實作
   - tracking copy + 跳轉 UPS 邏輯
   - 篩選 / 搜尋 / 排序 / 分頁
6. **空狀態 / 異常狀態 UI**
7. **AC 全測**

---

## 12. Source 引用

- **UPS tracking URL pattern：** `https://www.ups.com/track?loc=zh_HK&tracknum={tracking_no}`
  - 來源 1: [John Wargo - UPS Tracking URL Builder (2025)](https://johnwargo.com/posts/2025/ups-tracking-url-builder/) — 確認 `loc + tracknum` 為簡潔可靠格式
  - 來源 2: [E-Ship Guy - Carrier Tracking URLs](https://eshipguy.com/tracking/) — 列出 UPS 多版本 URL，`loc=en_US&tracknum=` 為現行版本
  - 來源 3: [Stone Edge / Miva Merchant 社群討論](https://groups.google.com/g/stoneedge/c/EKdHnykmilo) — 確認 UPS 旧 URL pattern 已棄用
- **借鏡 Fuuffy biz 截圖：** 客戶在 Phase 9 對齊時提供
- **3 個 valid UPS tracking：** 客戶在 Phase 9 對齊時提供（原為實際 Fuuffy/UPS 已用過的單號）

---

**文件結束。**
