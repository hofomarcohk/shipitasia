# Phase 5：WMS 倉內簽入 — Arrive + Receive 雙階段（PDA + Desktop）

> 集運 OMS+WMS v1 開發規格
> 版本：v1.0
> 日期：2026-05-08
> 範圍：倉內員工簽入流程（arrive 到貨 + receive 上架）+ 拍照 / 重量 / 尺寸 / 異常 / 連續模式 + 處理費扣款 + 預報配對 + 無頭件 schema 預備 + 修 Bug 6 + single 模式自動建 outbound 觸發
> 前置：Phase 1（客戶帳號、Resend）、Phase 2（carrier 綁定）、Phase 3（錢包系統 walletService）、Phase 4（預報 schema、單號 normalize、產品類別、倉庫主檔）已完成
> 業務地位：v1 倉內核心動作 phase，連結客戶預報跟物理貨物，觸發處理費扣款

---

## 0. 前設

### 0.1 v1 業務參數（沿用 Phase 3-4）

| 項目 | v1 設定 |
|---|---|
| 全局幣別 | HKD |
| 處理費單價 | HKD$5 / 包（每筆 inbound）|
| 入庫地 | 日本（v1 一個倉：埼玉）|
| 收貨地 | 香港 |
| 申報幣別 | 依倉庫適配（埼玉倉 = JPY）|

### 0.2 業務量假設

v1 上線半年內 ≤ 50 客戶。每天平均 10-20 票進貨（小倉到中倉之間）。設計考量：
- arrive PDA only（dock 旁簽收）
- receive PDA + Desktop（兩種場景）
- receive 可直走（跳過 arrive，量少時直接上架）

### 0.3 範圍

**包含**：

- arrive UI（PDA only）+ API + service
- receive UI（PDA + Desktop 兩個路徑）+ API + service
- receive 直走支援（pending → received）
- inbound_scans 子集合（fuuffy B5 借鏡完整實作）
- locations 主檔（v1 啟用，Phase 4 schema 預備）
- item_locations schema 重做（修 Bug 6）
- unclaimed_inbounds schema + 員工登記 UI（CS 指派邏輯留 Phase 6）
- 拍照功能（兩按鈕：barcode + 包裹外觀）+ 異常拍照
- 重量 / 尺寸 / 異常標記輸入
- 連續模式（一筆完成自動跳下一筆）
- arrive 撤銷（5 分鐘 session 內可撤）
- walletService.charge_inbound 整合（receive 階段觸發）
- single 模式自動建 outbound 觸發（餘額閘 + held 處理）
- 員工 notification（廢棄通知 banner + 阻擋 receive 已廢棄單）
- staff schema 預備（v1 reuse admin 帳號）

**不包含**：

- receive 撤銷（v1 admin 手動處理）
- 異常處理區的物理 SOP（業務範圍）
- CS 指派無頭件給客戶（Phase 6）
- 真正建 outbound 的內部邏輯（Phase 7）— Phase 5 只觸發 outboundService.autoCreateForSingle 函式介面
- 拆細粒度權限 / staff 帳號管理 UI（Phase 4-9 走完後地基處理）
- USB 電子秤 / 量尺對接（v1 純手動輸入）
- 多次拍照連拍（用兩按鈕替代）
- 員工 push notification（v1 走 banner / list 標記）
- 退回原寄方流程

### 0.4 技術棧

沿用 ShipItAsia 既有 + Phase 1-4 已建。新增：

- 拍照：`<input type="file" accept="image/*" capture="environment">`（行動裝置自動跳相機，桌面跳檔案選擇 + 攝影機）
- 條碼槍：USB HID（瀏覽器看做鍵盤，input field auto-focus + Enter 觸發）
- 檔案路徑：`/uploads/inbound-photos/{warehouseCode}/{date}/{scan_id}_{type}_{n}.{ext}`
- mongo session transaction：跨 collection 寫入原子保證

### 0.5 UI 設計風格

完全沿用 ShipItAsia 既有 + Phase 4 慣例。新增：

| 路徑 | 形態 | 場景 |
|---|---|---|
| `/zh-hk/scan/inbound-arrive` | PDA-first（mobile 380px 寬度設計）| dock 旁簽收 |
| `/zh-hk/scan/inbound-receive` | PDA-first | 員工拿 PDA 在貨架旁上架 |
| `/zh-hk/operations/inbound-receive` | Desktop-first（1280px 設計）| 桌面 + barcode gun 上架 |
| `/zh-hk/operations/inbound-history` | Desktop-first | 主管看歷史掃描紀錄 |

PDA / Desktop 共用同一套 API + service，UI layout 拆開。

---

## 1. 業務流程

### 1.1 Arrive 階段（PDA only，到達倉庫）

#### 1.1.1 進入 Arrive 頁面

- 路徑：`/zh-hk/scan/inbound-arrive`
- 員工身份：admin / staff（v1 reuse admin 帳號，schema 預留 staff_id）
- 場景：物流貨車到 dock，員工拿 PDA 走動掃

#### 1.1.2 連續模式 UI 流程

```
[Arrive 頁面 - PDA 380px wide]
═══════════════════════════════════
警示 banner（如有）：
┌──────────────────────────────────┐
│ ⚠️ 有 N 筆貨物已被客戶廢棄，請勿上架 │
│ [看清單]                         │
└──────────────────────────────────┘

═ Arrive 動作 ═

1. 掃 / 輸入 trackingNo
   [text input, autofocus, onEnter 自動下一步]

2. （Server lookup）
   ├── 對到預報 ✓
   │     顯示綠色卡片：
   │     ┌────────────────────┐
   │     │ 客戶: ABC Trading   │
   │     │ 預報: I-20260508-0001│
   │     │ 類型: 合併寄送      │
   │     │ 來源: 退運          │
   │     │ 預估: 中型 / 含電池  │
   │     │ 申報項: 5 筆         │
   │     └────────────────────┘
   │
   └── 對不到預報 ✗
         顯示橘色提示：「無對應預報」
         按鈕：[登記為無頭件]（→ 1.3）

3. 拍 barcode 條碼面（必拍）
   [按鈕] 開相機 → 拍 → 預覽縮圖
   再點按鈕可重拍

4. 拍包裹外觀（必拍）
   [按鈕] 開相機 → 拍 → 預覽縮圖

5. 量重量（v1 選填，scan_config 可改必填）
   [number input] kg, 小數 2 位

6. 量尺寸（v1 選填）
   [長] [寬] [高] cm 整數

7. 異常標記（選填）
   [checkbox] 破損 / 受潮 / 包裝不良 / 不符申報
   勾選任一 → 展開：拍照（必）+ 備註（必）

8. 員工備註（選填）
   [textarea] ≤ 200 字

9. [儲存（連續模式）]

   ↓ 系統執行：
   - 寫一筆 inbound_scans type=arrive
   - 主檔 inbound_requests.status: pending → arrived
   - 主檔 arrivedAt = now、last_scan_id / last_scan_at 寫
   - **不扣費**（receive 階段才扣）
   - 寫 notification type=inbound_arrived 給客戶
   - 同步 OMS（inbound_requests status / arrivedAt）

   ↓ UI：
   - 顯示成功 toast：「已 arrive：I-...」
   - 自動跳回 step 1，trackingNo 欄位 autofocus、清空
   - 浮動按鈕「撤銷上一筆（剩 4:59）」5 分鐘倒數
```

#### 1.1.3 Arrive 5 分鐘撤銷

員工剛 arrive 完發現掃錯 → 點「撤銷上一筆」：

- 系統執行：
  - inbound 主檔 status: arrived → pending、arrivedAt 清空
  - inbound_scans 那筆設 cancelled_at = now、cancelled_reason='staff_undo'（**不刪 record**，append-only）
  - 對應照片檔案 unlink（刪 filesystem 檔）
  - 寫 notification type=inbound_arrive_cancelled 給客戶
- 限制：
  - 5 分鐘內可撤（`scan_config.arrive_undo_window_minutes=5`）
  - 5 分鐘後 → 4xx `UNDO_WINDOW_EXPIRED`，需 admin 後台處理
  - 已 progress 到 received → 4xx `CANNOT_UNDO_RECEIVED`
  - 跨員工 / 跨 session 撤銷別人的 → 4xx
- session 概念：頁面關閉 / 切換 → session lost，撤銷按鈕失效

### 1.2 Receive 階段（PDA + Desktop 兩個路徑）

#### 1.2.1 路徑分配

- PDA：`/zh-hk/scan/inbound-receive` — 走動上架，員工拿 PDA 在貨架旁
- Desktop：`/zh-hk/operations/inbound-receive` — 桌面 + barcode gun，員工坐辦公桌

兩路徑**共用**同一個 API + service，UI layout 拆開。

#### 1.2.2 PDA UI 流程（單欄、大按鈕）

```
[Receive 頁面 - PDA 380px wide]
═══════════════════════════════════
警示 banner：
┌──────────────────────────────────┐
│ ⚠️ 有 N 筆貨物已被客戶廢棄，請勿上架 │
│ [看清單]                         │
└──────────────────────────────────┘

═ Receive 動作 ═

1. 掃 / 輸入 庫位 locationCode
   [text input, autofocus]
   例：A001
   - 不存在 → 4xx LOCATION_NOT_FOUND
   - status=disabled → 警告但允許（v1 不卡）

2. 掃 / 輸入 trackingNo or inbound_id
   [text input]

3. （Server lookup → 路徑分流）
   ├── inbound.status=arrived（接續路徑）
   │     顯示「快速上架模式」UI：
   │       - 預填重量 / 尺寸（從 arrive 階段帶過來）
   │       - 員工確認 / 修正即可（拍照可選）
   │       - 異常標記（選填）
   │       - 員工備註（選填）
   │       - [確認上架]
   │
   ├── inbound.status=pending（直走路徑，從未 arrive）
   │     顯示「完整上架模式」UI：
   │       - 拍 barcode 條碼面（**必拍**）
   │       - 拍包裹外觀（**必拍**）
   │       - 量重量（**必填**）
   │       - 量尺寸（**必填**）
   │       - 異常標記（選填）
   │       - 員工備註（選填）
   │       - [確認上架]
   │
   ├── inbound.status=cancelled → 4xx INBOUND_CANCELLED
   ├── inbound.status=abandoned → 4xx INBOUND_ABANDONED
   └── inbound.status=received → 4xx ALREADY_RECEIVED

4. [確認上架]

   ↓ 系統執行（mongo session transaction 包整段）：
   - 寫一筆 inbound_scans type=receive、locationCode、is_combined_arrive（直走 = true）
   - 寫 / 更新 item_locations:
       itemCode=I-...、warehouseCode、locationCode
       currentStatus='in_storage'、placedBy=staff_id
   - 主檔 inbound_requests:
       status: arrived→received（接續）or pending→received（直走，arrivedAt 也填）
       receivedAt = now、actualWeight / actualDimension cache
       last_scan_id / last_scan_at 寫
   - walletService.charge_inbound: -HK$5
       reference_type='inbound'、reference_id=I-...
       client.balance 異動（負餘額允許，沿用 Phase 3 業主決策 G）
   - 寫 notification type=inbound_received 給客戶
       訊息含「扣處理費 HK$5，餘額 HK$xxx」
   - 若 inbound.shipment_type=single：
       觸發 outboundService.autoCreateForSingle（fail-soft，§5.7）
   - 同步 OMS：status / actualWeight / actualDimension / receivedAt / wallet

   ↓ UI：
   - 成功 toast：「已上架 I-... 至 A001，扣 HK$5，餘額 HK$xxx」
   - 自動回 step 1，連續模式
```

#### 1.2.3 Desktop UI 流程（多欄、桌面快捷鍵）

```
[Receive 頁面 - Desktop 1280px wide]
═══════════════════════════════════════════════════════════════
廢棄貨 banner（同 PDA）

╔════ 主操作區（左 60%）══════════════════════╗ ╔═ 已上架 list（右 40%）═╗
║                                              ║ ║ 本 session 已上架：    ║
║ 庫位 [A001    ] (autofocus)                  ║ ║ ┌────────────────────┐║
║ 單號 [        ]                              ║ ║ │ I-20260508-0001    │║
║                                              ║ ║ │ → A001 / 5kg       │║
║ ┌─ inbound 卡片（lookup 後展開）─────────┐ ║ ║ │ 17:32              │║
║ │ I-20260508-0001 / 客戶 ABC Trading       │ ║ ║ ├────────────────────┤║
║ │ status=arrived（接續）                    │ ║ ║ │ I-20260508-0002    │║
║ │ 預估: 中型, 含電池                         │ ║ ║ │ → A002 / 3.5kg     │║
║ │                                            │ ║ ║ │ 17:35              │║
║ │ 重量 [5.20] kg  尺寸 [30][25][15] cm     │ ║ ║ └────────────────────┘║
║ │ [拍照 barcode] [拍照 包裹]                 │ ║ ║                       ║
║ │ ☐ 破損 ☐ 受潮 ☐ 包裝不良 ☐ 不符申報       │ ║ ║ 撤銷不可用             ║
║ │ 員工備註: [        ]                      │ ║ ║（v1 admin 後台處理）   ║
║ │                                            │ ║ ║                       ║
║ │             [確認上架]                     │ ║ ║                       ║
║ └────────────────────────────────────────────┘ ║ ║                       ║
║ 快捷鍵：Enter=確認 / Esc=取消                ║ ║                       ║
╚══════════════════════════════════════════════╝ ╚═══════════════════════╝

注意：
- Desktop 版「本 session 已上架 list」只是 UX 顯示，不影響業務
- 共用同一個 POST /api/wms/scan/receive
- 桌面攝影機：拍照按鈕走 input file capture（同 PDA），桌面端會跳檔案選擇 + 內建攝影機
```

#### 1.2.4 Receive 撤銷（v1 不做）

業主決策：v1 receive 階段不開放員工撤銷。原因：

- 涉及錢包扣款 + item_locations + inbound 狀態 + (single 模式)outbound 觸發，rollback 邏輯複雜
- 業務量小，admin 後台處理足以覆蓋

替代：admin 後台 `/zh-hk/inbound/[id]` 加「狀態調整」按鈕（§3.1）。

### 1.3 無頭件登記流程（Phase 5 寫入，Phase 6 指派）

#### 1.3.1 觸發

員工 arrive 時掃 trackingNo → server 查不到對應 inbound_request → 顯示橘色提示 + [登記為無頭件] 按鈕。

#### 1.3.2 UI 流程

```
[無頭件登記頁 - PDA 380px wide]
═══════════════════════════════════

═ 登記為無頭件 ═

1. trackingNo（已帶入）
   [readonly text]

2. 入庫快遞商（必填）
   [dropdown: 從 carriers_inbound 主檔列出]

3. 拍 barcode 條碼面（必拍）
   [按鈕]

4. 拍寄件單面（建議拍，方便後續認領）
   [按鈕]

5. 拍包裹外觀（必拍）
   [按鈕]

6. 量重量（必填）
   [number input] kg

7. 量尺寸（必填）
   [長][寬][高] cm

8. 員工備註（必填）
   例：「無發件人」「客戶代號 OOO」「貨物外箱寫了 ABC」
   [textarea]

9. [登記無頭件]

   ↓ 系統執行：
   - 寫一筆 unclaimed_inbounds，ID=U-YYYYMMDD-NNNN，status=pending_assignment
   - 寫一筆 inbound_scans type=unclaimed_arrive
       inbound_request_id=null、unclaimed_inbound_id=U-...
       client_id=null
   - daily_counters `unclaimed_2026-05-08` +1
   - 不寫 inbound_requests（沒 client_id）
   - **不扣費**（沒對應客戶）
   - 不發 notification（沒對應客戶）

   ↓ UI：
   - 成功 toast：「已登記無頭件 U-...」
   - 回 arrive 主流程連續模式
```

#### 1.3.3 v1 範圍邊界

- Phase 5：寫入 unclaimed_inbounds + 員工查清單（read-only）
- Phase 6：CS 指派客戶 / 認定無人認領的後續處理

### 1.4 異常標記流程

員工發現包裹有問題：

```
異常標記 UI（在 arrive / receive 頁面內）：
[checkbox] 破損
[checkbox] 受潮
[checkbox] 包裝不良
[checkbox] 不符申報

勾選任一 → 展開該項：
- 拍照（必拍 ≥ 1 張）
- 備註（必填）

各異常獨立填寫
```

寫入 inbound_scans.anomalies array：

```json
{
  "anomalies": [
    {
      "code": "damaged",
      "note": "外箱凹陷 5cm",
      "photo_paths": [
        "/uploads/inbound-photos/JP-SAITAMA-01/20260508/scan_S20260508_0001_anomaly_1.jpg"
      ]
    },
    {
      "code": "wet",
      "note": "底部濕潤",
      "photo_paths": ["..."]
    }
  ]
}
```

異常標記後：

- 系統純記錄，**不自動暫停簽入或扣費**（v1 簡化）
- 寫 notification type=`inbound_anomaly_detected` 給客戶（v1 訊息內含異常 list）
- CS 看到 notification + WMS 詳情頁 anomaly 標記 → **手動聯絡客戶**（v1 不自動）

### 1.5 拍照規範

#### 1.5.1 必拍 / 選拍

| 場景 | barcode | 包裹外觀 | 異常 |
|---|---|---|---|
| arrive | ✓ 必 | ✓ 必 | 標記時必 |
| receive 直走 | ✓ 必 | ✓ 必 | 標記時必 |
| receive 接續 arrive | （從 arrive 帶來，可重拍）| （從 arrive 帶來）| 標記新異常時必 |
| 無頭件 | ✓ 必 + 寄件單面 | ≥ 1 張 | - |

#### 1.5.2 數量限制

- 一次掃描最多 **5 張照片**（業主決策 Q5；可由 `warehouses.scan_config.max_photos_per_scan` 改）
- 每張 ≤ 5 MB
- 副檔名：jpg / jpeg / png

#### 1.5.3 儲存

- 路徑：`/uploads/inbound-photos/{warehouseCode}/{date_YYYYMMDD}/{scan_id}_{type}_{n}.{ext}`
- `type`：`barcode` / `package` / `anomaly`
- 例：`/uploads/inbound-photos/JP-SAITAMA-01/20260508/scan_S20260508_0001_barcode_1.jpg`

#### 1.5.4 拍照 UI

`<input type="file" accept="image/*" capture="environment">`：

- 行動裝置（PDA）→ 自動跳相機 app
- 桌面 → 跳檔案選擇 + 桌面攝影機（如有）

兩個按鈕（barcode + 包裹），分開操作（不做 getUserMedia 連拍）。

### 1.6 連續模式設計

員工掃完一筆，UI 自動回 step 1，trackingNo 欄位 autofocus。

連續模式狀態：

- frontend 在 sessionStorage 記錄當前 session：
  - `current_session_id`（隨機產生，每次進頁面新建）
  - `last_action_at`（用於 5 分鐘撤銷邏輯判斷）
  - `actions_in_session[]`（最近 N 筆操作的 inbound_id）
- 員工關閉頁面 / 切換頁面 → session 結束、不能再撤銷

撤銷邏輯：

- 「撤銷上一筆」按鈕浮動於頁面右下角
- 5 分鐘倒數（從 `last_action_at` 開始）
- 倒數結束 → 按鈕 disabled（只剩 admin 後台處理）

### 1.7 廢棄貨 Banner（員工通知）

#### 1.7.1 觸發場景

客戶於 OMS 把 inbound（status=arrived 或 received）改 abandoned：
- arrived → abandoned：員工已 arrive 過，貨還在倉等 receive，**員工要知道別 receive 這件**
- received → abandoned：員工已 receive、貨在貨架，員工要知道處理方式

#### 1.7.2 Banner 規則

arrive 頁 / receive 頁 / inbound-history 頁上方都顯示 banner：

```
⚠️ 有 N 筆貨物已被客戶廢棄，請勿上架 [看清單]
```

清單頁：`/zh-hk/operations/abandoned-inbounds`

員工看完處理後 → 點「標記已處理」→ banner 計數 -1。

#### 1.7.3 員工掃到已廢棄單

- arrive：當前 status 已不是 pending → 4xx `INVALID_STATUS_FOR_ARRIVE`（不需特別處理 abandoned）
- receive：4xx `INBOUND_ABANDONED` + frontend 顯示「此單已廢棄，請放異常處理區」+ 員工備註欄位（選填，寫處置動作）

填了備註 → 寫 staff_handled_abandoned 一筆（簡單 collection 記錄員工操作）。

### 1.8 Notification Type 清單（Phase 5 範圍）

| Type | 觸發點 | 收件人 | 訊息 |
|---|---|---|---|
| `inbound_arrived` | pending → arrived | 客戶 | 「您的貨已到倉，等待上架」 |
| `inbound_arrive_cancelled` | arrived → pending（5 分鐘撤銷）| 客戶 | 「先前到貨登記已撤回」 |
| `inbound_received` | (pending or arrived) → received | 客戶 | 「您的貨已上架，扣處理費 HK$5，餘額 HK$xxx」 |
| `inbound_anomaly_detected` | scan 含 anomalies | 客戶 | 「貨物到倉時發現異常：[破損 / 受潮 / ...]」 |
| `inbound_status_adjusted` | admin 後台調整 | 客戶 | 「您的貨物 I-... 狀態被人工調整：原因 ...」 |
| (Phase 4 已建) `inbound_abandoned` | (arrived or received) → abandoned | 客戶 + **員工**（v1 走 banner）| 「貨物已廢棄」/「客戶已廢棄 I-... 此單」 |

---

## 2. Schema 變更

### 2.1 `locations`（**新增**，admin 維護倉庫庫位主檔）

| 欄位 | 型別 | 說明 |
|---|---|---|
| `_id` | string | |
| `warehouseCode` | string | FK to warehouses |
| `locationCode` | string | 例：`A001`，倉庫內唯一 |
| `zone` | string | v1 全部填 `storage`，schema 預留 `pick` / `temp` / `dispose` 未來分區用 |
| `status` | enum | `active` / `disabled` |
| `display_order` | number | UI 列表排序 |
| `createdAt / updatedAt` | date | |

**Indexes**：
- `{ warehouseCode: 1, locationCode: 1 }` unique

**v1 seed**：v1 不做 master data UI，admin 直接用 mongo 新增初始庫位（A001-A100 約 100 個）。Phase 5 範圍內 schema + 簡單 seed script，後台 UI 留後 phase。

### 2.2 `item_locations`（**重做**，修 Bug 6）

ShipItAsia 既有 schema 在 Bug 6 提到「pick 階段污染 locationCode 為 staffId」。重做：

| 欄位 | 型別 | 既有 / 新增 / 改 | 說明 |
|---|---|---|---|
| `_id` | string | 既有 | |
| `itemCode` | string | 既有 | inbound_id 例：`I-20260508-0001` |
| `itemType` | string | 既有 | `shipment` |
| `warehouseCode` | string | 既有 | |
| `locationCode` | string | **保持** | 庫位代碼 — **不再被 pick 階段污染** |
| `currentStatus` | enum | **新增** | `in_storage` / `picked` / `packed` |
| `placedBy` | string | **新增** | 上架員工 staff_id（snapshot）|
| `lastMovedAt` | date | **新增** | 最後動作時間 |
| `createdAt / updatedAt` | date | 既有 | |

**Bug 6 修法**：pick 階段（Phase 7）改 currentStatus='picked'，**不修改 locationCode**。員工 staff_id 改存到 `pick_logs` 子集合（Phase 7 範圍）。

**Indexes**：
- `{ itemCode: 1 }` unique（一個 inbound 只在一個 location）
- `{ warehouseCode: 1, locationCode: 1, currentStatus: 1 }`（庫位查詢）

### 2.3 `inbound_scans`（**新增**，動作快照子集合 - fuuffy B5 借鏡）

每次員工的物理動作寫一筆，append-only。

| 欄位 | 型別 | 說明 |
|---|---|---|
| `_id` | string | scan_id 格式：`S{YYYYMMDD}_{NNNN}` 例：`S20260508_0001` |
| `inbound_request_id` | string? | FK to inbound_requests（無頭件為 null）|
| `unclaimed_inbound_id` | string? | 若是無頭件 arrive，FK to unclaimed_inbounds（兩者互斥）|
| `client_id` | string? | 冗餘欄位，inbound_request 走 FK；無頭件為 null |
| `type` | enum | `arrive` / `receive` / `unclaimed_arrive` |
| `locationCode` | string? | receive 動作必填 |
| `weight` | number? | kg, 小數 2 位 |
| `dimension` | object? | `{ length, width, height }` cm 整數 |
| `photo_paths` | array | 照片相對路徑 [path, ...] |
| `photo_metadata` | array? | [{ type: 'barcode'/'package'/'anomaly', size, mime }, ...] |
| `anomalies` | array? | 異常 array（見 §1.4）|
| `operator_staff_id` | string | 員工 ID（v1 admin 帳號）|
| `is_combined_arrive` | boolean | 標記此筆 receive 是否內含 arrive（直走情境=true）|
| `staff_note` | string? | 員工備註 ≤ 200 字 |
| `cancelled_at` | date? | 5 分鐘撤銷後設值；同時主檔退回 |
| `cancelled_reason` | string? | `staff_undo` / `admin_adjust` |
| `createdAt` | date | append-only，不允許 update |

**Indexes**：
- `{ inbound_request_id: 1, createdAt: -1 }`（看某 inbound 的 scan 歷史）
- `{ operator_staff_id: 1, createdAt: -1 }`（看某員工的工作量）
- `{ type: 1, createdAt: -1 }`（按類型統計）
- `{ unclaimed_inbound_id: 1 }`（看無頭件對應的 scan）

**禁止 update**（fuuffy B5 + B1 借鏡）：
- 主檔資料異動寫一筆**新的** scan 紀錄
- 撤銷只更新 cancelled_at，不刪除原資料
- inbound_scans **不寫** cancel / abandon 動作（那是客戶線上動作，不是員工物理動作）

### 2.4 `unclaimed_inbounds`（**新增**，無頭件池）

員工 arrive 時 trackingNo 對不到任何客戶預報 → 寫到此 collection。Phase 6 由 CS 指派客戶。

| 欄位 | 型別 | 說明 |
|---|---|---|
| `_id` | string | unclaimed_id 格式：`U-YYYYMMDD-NNNN` 例：`U-20260508-0001` |
| `warehouseCode` | string | |
| `carrier_inbound_code` | string | 員工選的入庫快遞 |
| `tracking_no` | string | 員工輸入的原始值 |
| `tracking_no_normalized` | string | normalize 後 |
| `weight` | number | kg, 小數 2 位 |
| `dimension` | object | |
| `photo_paths` | array | barcode + 寄件單 + 包裹外觀 |
| `staff_note` | string | 必填 |
| `status` | enum | `pending_assignment` / `assigned` / `disposed` |
| `assigned_to_client_id` | string? | Phase 6 CS 指派後填入 |
| `assigned_to_inbound_id` | string? | Phase 6 指派後產生新 inbound_request 並關聯 |
| `assigned_at` | date? | |
| `assigned_by_staff_id` | string? | |
| `disposed_at` | date? | Phase 6 範圍：CS 認定無人認領 |
| `disposed_reason` | string? | |
| `arrived_at` | date | scan 寫入時間 snapshot |
| `arrived_by_staff_id` | string | |
| `createdAt / updatedAt` | date | |

**Indexes**：
- `{ status: 1, createdAt: -1 }`（admin 列表）
- `{ tracking_no_normalized: 1 }`（重複檢查）

**Phase 5 範圍**：寫入 + 員工看（不指派）。Phase 6 做 CS 指派 UI / 邏輯。

**daily_counters 共用**：unclaimed_id 與 inbound_id 共用 daily_counters，但 prefix 不同：
- inbound: `I-YYYYMMDD-NNNN` → daily_counters._id = `inbound_YYYY-MM-DD`
- unclaimed: `U-YYYYMMDD-NNNN` → daily_counters._id = `unclaimed_YYYY-MM-DD`
- inbound_scans: `S{YYYYMMDD}_{NNNN}` → daily_counters._id = `scan_YYYY-MM-DD`

### 2.5 `inbound_requests`（既有，擴充欄位）

| 欄位 | 型別 | 既有 / 新增 | 說明 |
|---|---|---|---|
| `actualWeight` | number? | Phase 4 預備、**Phase 5 啟用** | receive 時填，cache from latest scan |
| `actualDimension` | object? | Phase 4 預備、**Phase 5 啟用** | receive 時填 |
| `arrivedAt` | date? | 既有 | arrive 時填；直走時跟 receivedAt 同 timestamp |
| `receivedAt` | date? | 既有 | receive 時填 |
| `last_scan_id` | string? | **新增** | 最後一筆 inbound_scans._id（reference） |
| `last_scan_at` | date? | **新增** | 最後一筆 inbound_scans.createdAt |
| `staff_handled_abandoned_at` | date? | **新增** | 員工標記廢棄已處理時間 |
| `staff_handled_abandoned_note` | string? | **新增** | 員工標記時的備註 |

**status enum 沿用 Phase 4**：`pending` / `arrived` / `received` / `picking` / `packed` / `palletized` / `departed` / `cancelled` / `abandoned` / `expired`。

### 2.6 `staffs`（**新增 schema 預備**，v1 reuse admin 帳號）

v1 業務上所有員工都用 admin 一個帳號登入，但 schema 預留 staff 概念，方便未來分權：

| 欄位 | 型別 | 說明 |
|---|---|---|
| `_id` | string | staff_id |
| `staff_code` | string | 員工編號（人員報表用，例如 `STAFF-001`）|
| `name` | string | |
| `email` | string? | 未來分權帳號 login 用 |
| `role` | enum | `admin` / `staff`（v1 全部填 `admin`）|
| `warehouseCode` | string? | 員工所屬倉庫 |
| `status` | enum | `active` / `disabled` |
| `createdAt / updatedAt` | date | |

**v1 seed**：admin 帳號的 staff record 一筆（`STAFF-ADMIN`）。所有 inbound_scans.operator_staff_id 都指向這筆。

**v1 不做**：
- staff 帳號管理 UI
- staff role 鑑權邏輯（API 仍只看 admin JWT）
- 員工 PIN / 切換身份

未來分權留 Phase 4-9 走完後地基處理。

### 2.7 `staff_handled_abandoned`（**新增**，員工標記廢棄已處理紀錄）

| 欄位 | 型別 | 說明 |
|---|---|---|
| `_id` | string | |
| `inbound_request_id` | string | FK |
| `staff_id` | string | |
| `note` | string? | 員工備註 |
| `createdAt` | date | |

**Indexes**：
- `{ inbound_request_id: 1 }`（避免一單多次標記，service 層做 idempotent）

### 2.8 daily_counters（沿用 Phase 4）

擴充 prefix：

```
inbound_2026-05-08    → I-20260508-NNNN
unclaimed_2026-05-08  → U-20260508-NNNN
scan_2026-05-08       → S20260508_NNNN
```

mongo `findOneAndUpdate` atomic +1，沿用 Phase 4 Bug fix 設計。

---

## 3. 頁面 / API 清單

### 3.1 WMS 新增 / 改造頁面

| 路徑 | 形態 | 說明 |
|---|---|---|
| `/zh-hk/scan/inbound-arrive` | PDA-first | arrive 頁面 |
| `/zh-hk/scan/inbound-receive` | PDA-first | receive 頁面（PDA 版）|
| `/zh-hk/operations/inbound-receive` | Desktop-first | receive 頁面（桌面版，共用 API）|
| `/zh-hk/operations/inbound-history` | Desktop-first | 主管看 inbound_scans 歷史 |
| `/zh-hk/operations/abandoned-inbounds` | Desktop-first | 廢棄貨清單 + 員工標記已處理 |
| `/zh-hk/operations/unclaimed-inbounds` | Desktop-first | 無頭件清單（Phase 5 只看，Phase 6 做指派 UI）|
| `/zh-hk/inbound/[id]` | 既有，admin 加「狀態調整」按鈕 | admin 後台處理 receive 撤銷 / 修錯 |

### 3.2 WMS API endpoints

```
# arrive 流程
POST   /api/wms/scan/arrive                    arrive 動作（員工掃 trackingNo + 拍照 + 量重量）
POST   /api/wms/scan/arrive/cancel              5 分鐘內撤銷
POST   /api/wms/scan/arrive/lookup              查 trackingNo 對應 inbound（前端輸入即時查）
POST   /api/wms/scan/arrive/unclaimed           無頭件登記

# receive 流程
POST   /api/wms/scan/receive                    receive 動作（PDA + Desktop 共用）
POST   /api/wms/scan/receive/lookup             查 trackingNo / inbound_id 狀態 + 已 arrive 的資料

# 庫位
GET    /api/wms/locations                       列出 active 庫位（給 dropdown / 驗證）

# 歷史 / 詳情
GET    /api/wms/inbound-scans                   查 scan 歷史（filter by date / staff / type）
GET    /api/wms/inbound-scans/:id               單筆 scan 詳情
GET    /api/wms/inbound/:id/scans               單一 inbound 的 scan 歷史

# 廢棄貨處理
GET    /api/wms/abandoned-inbounds              廢棄貨清單
POST   /api/wms/abandoned-inbounds/:id/mark-handled  員工標記已處理

# 無頭件（Phase 5 純查詢）
GET    /api/wms/unclaimed-inbounds              清單
GET    /api/wms/unclaimed-inbounds/:id          詳情

# admin 後台 receive 撤銷 / 修錯（v1 簡化）
POST   /api/wms/inbound/:id/admin-adjust        admin 調整 status / 退費 / 改 actual* 欄位
```

### 3.3 OMS API endpoints（cross-service sync）

```
POST   /api/cms/sync/inbound-status             WMS 推 OMS：status / actualWeight / actualDimension / 時間戳
POST   /api/cms/sync/wallet-charge              WMS 推 OMS：扣費同步（透過 walletService 內部）
```

### 3.4 Sidebar 改造

WMS sidebar 新增區塊：

```
[既有 sidebar 項目]

倉庫操作
  ├── 簽收（PDA）         → /scan/inbound-arrive
  ├── 上架（PDA）         → /scan/inbound-receive
  ├── 上架（桌面）        → /operations/inbound-receive
  ├── 掃描歷史           → /operations/inbound-history
  ├── 廢棄貨清單         → /operations/abandoned-inbounds
  └── 無頭件清單         → /operations/unclaimed-inbounds
```

OMS sidebar 不變（Phase 5 不影響客戶端 UI）。

---

## 4. ShipItAsia 既有現況對映

| 既有 | 處理 |
|---|---|
| ShipItAsia PDA arrive 流程 | 重做：UI 改造、API 重寫、加拍照 / 異常 / 連續模式 |
| ShipItAsia PDA receive 流程 | 重做：同上、新增 Desktop 版 |
| `arrive_logs` / `receive_logs` collection（如有）| 棄用，新業務全寫 inbound_scans |
| `item_locations` schema | 重做（修 Bug 6）+ 加 currentStatus / placedBy / lastMovedAt |
| Bug 6（pick 污染 locationCode）| Phase 5 schema 重做時預修；Phase 7 真正 pick 邏輯需配合 |
| 既有 admin 帳號系統 | 沿用，v1 不做 staff 帳號管理 UI（schema 預留） |
| 既有 PDA scan 路由 | 完全重寫（既有 logic 太單薄，無拍照 / 異常 / 連續模式） |

---

## 5. Fuuffy 借鏡

### 5.1 借鏡 B5（parcel 主檔 vs 動作快照拆分 ⭐⭐⭐⭐⭐）— 完整實作

**Phase 5 核心借鏡**。最終實作：

| 主檔 | 動作快照 |
|---|---|
| `inbound_requests` 存最新狀態 + 預估值 + cache | `inbound_scans` 存每次 arrive / receive 的完整動作 |
| 主檔欄位數有限 | scan 含照片 / 重量 / 員工 / 異常 / locationCode |
| 主檔可被 update（status / actualWeight 等）| scan **append-only**，update 只能改 cancelled_at |
| 主檔失誤時可 admin 修 | scan 失誤時寫新一筆 type=correction（Phase 6 範圍）|

### 5.2 借鏡 B1（log_item_action 結構化動作日誌 ⭐⭐⭐⭐⭐）

`inbound_scans` 進一步借鏡 B1：

- enum 欄位 `type`（可篩選查詢）
- 自由 JSON 欄位（anomalies / photo_metadata）
- 操作者紀錄 `operator_staff_id`
- 時間戳 `createdAt` 不可修改
- append-only 概念（撤銷只標 cancelled_at）

### 5.3 借鏡 B7（warehouse-level scan_config_json）

Phase 4 已建 `warehouses.scan_config` 欄位，Phase 5 啟用：

| 配置 key | 預設 | 說明 |
|---|---|---|
| `mandatory_barcode_photo` | true | arrive / receive 必拍 barcode |
| `mandatory_package_photo` | true | arrive / receive 必拍包裹外觀 |
| `mandatory_weight` | false（Phase 5 v1）| 量重量是否必填（arrive 階段；receive 直走無視此設定，必填）|
| `mandatory_dimension` | false（Phase 5 v1）| 量尺寸是否必填 |
| `arrive_undo_window_minutes` | 5 | 撤銷視窗 |
| `max_photos_per_scan` | 5 | 一次最多拍幾張 |
| `max_photo_size_mb` | 5 | 單張最大 |

v1 全倉用同一份 default config，未來不同倉可改。**v1 不做 scan_config 後台 UI**（admin 直接 mongo update）。

### 5.4 借鏡 B4（client-id header 雙服務驗證）

WMS / OMS 之間的 cross-service sync 必須驗 header（沿用 Phase 4 修 Bug 7 的設計）：

- `X-Internal-Sync` header
- env shared secret 驗證
- 失敗寫 audit log

### 5.5 死守 A4（沒 wallet → 每張單獨立付款）

Phase 5 receive 階段呼叫 walletService.charge_inbound，**不繞過走獨立付款**。餘額閘 + held 機制 100% 走 walletService。

### 5.6 避坑 A1（沒有 carrier 抽象層）

inbound_scans / unclaimed_inbounds 都沒有 carrier hardcoded if/else。所有 carrier 相關邏輯走 master data + service。

### 5.7 避坑 A2（silent stub return success）

receive 階段觸發 `outboundService.autoCreateForSingle`，但 Phase 5 outbound 邏輯尚未實作。處理：

```typescript
async function autoCreateForSingle(input) {
  // Phase 5: 只實作餘額閘 + 寫一筆 outbound_requests，
  // 但其他完整 outbound flow（Phase 7 / 8）尚未實作，故：
  if (process.env.PHASE7_OUTBOUND_ENABLED !== 'true') {
    // 寫一筆 outbound 但 status=held + held_reason='phase7_not_ready'
    // 不 throw，因為 Phase 5 流程要繼續（receive 已成功，不能 rollback）
    // log warning：「auto-created outbound held due to Phase 7 not ready」
    return { outbound_id, status: 'held', held_reason: 'phase7_not_ready' };
  }
  // Phase 7 完成後實作完整邏輯
}
```

明確 fail-soft，Phase 7 / 8 完成後改 env flag。

### 5.8 避坑 A6（萬能 remarks）

inbound_scans 的 `staff_note` 是員工自由文字，但 anomalies 結構化（4 種 enum + 結構化資料）。CS 看異常時走結構化 query，不靠 staff_note 字串解析。

---

## 6. Acceptance Criteria（給 Claude Code）

### AC-5.1 Arrive 基本流程

**Given** 員工已登入 WMS，PDA 開 `/scan/inbound-arrive`，inbound `I-20260508-0001` status=pending
**When** 員工掃 trackingNo + 拍照 2 張 + 量重量 + 提交
**Then**

- inbound 主檔 status: pending → arrived，arrivedAt 寫
- 寫一筆 inbound_scans type=arrive，含照片 path、重量、員工 ID
- 主檔 last_scan_id / last_scan_at 更新
- 寫 notification type=inbound_arrived 給客戶
- **不扣費**（receive 才扣）
- 同步 OMS
- 連續模式：UI 跳回 step 1，autofocus

**測試**：

- 缺 barcode 拍照 → 4xx `BARCODE_PHOTO_REQUIRED`
- 缺包裹拍照 → 4xx `PACKAGE_PHOTO_REQUIRED`
- 重量 / 尺寸缺（v1 預設選填）→ 200
- inbound status 不是 pending → 4xx `INVALID_STATUS_FOR_ARRIVE`
- inbound 不存在 → 4xx `INBOUND_NOT_FOUND`
- 同一 inbound 重複 arrive → 4xx
- 員工未登入 / 非 admin/staff → 401 / 403

### AC-5.2 Arrive 5 分鐘撤銷

**Given** 員工剛 arrive 完 inbound 1 分鐘
**When** 員工點「撤銷上一筆」
**Then**

- inbound status: arrived → pending
- arrivedAt 清空
- inbound_scans 那筆設 cancelled_at = now、cancelled_reason='staff_undo'
- 對應 photo files 刪除（filesystem unlink）
- 寫 notification type=inbound_arrive_cancelled

**測試**：

- 6 分鐘後撤銷 → 4xx `UNDO_WINDOW_EXPIRED`
- 撤銷別人的 arrive → 4xx
- inbound 已 progressed 到 received → 4xx `CANNOT_UNDO_RECEIVED`

### AC-5.3 無頭件登記

**Given** 員工掃 trackingNo X，server 查不到對應 inbound
**When** 員工選「登記為無頭件」+ 填快遞商 + 拍照 + 量重量 + 員工備註 + 提交
**Then**

- 寫一筆 unclaimed_inbounds status=pending_assignment，ID 格式 `U-20260508-0001`
- 寫一筆 inbound_scans type=unclaimed_arrive，inbound_request_id=null、unclaimed_inbound_id=U-...
- 不寫 inbound_requests（沒 client_id）
- 不扣費、不發 notification（沒對應客戶）
- daily_counters `unclaimed_2026-05-08` +1

**測試**：

- 缺員工備註 → 4xx
- 缺 barcode 拍照 → 4xx
- 缺包裹拍照 → 4xx
- 同 trackingNo 重複登記為無頭件 → 4xx `UNCLAIMED_DUPLICATED`
- 同 trackingNo 後來客戶建了 inbound 預報 → 員工再 arrive 時應對到 inbound（不是無頭件）

### AC-5.4 Receive 接續 Arrive

**Given** inbound `I-` status=arrived
**When** 員工 PDA 進 `/scan/inbound-receive`，掃 locationCode='A001' + 掃 inbound_id + 確認重量 / 尺寸 + 提交
**Then**

- 寫一筆 inbound_scans type=receive、is_combined_arrive=false
- 寫一筆 item_locations: itemCode=I-...、locationCode='A001'、currentStatus='in_storage'、placedBy=staff_id
- inbound 主檔 status: arrived → received，receivedAt 寫
- 觸發 walletService.charge: -5 HKD，reference_type='inbound'，reference_id=I-...
- client.balance 更新（cache）
- 寫 notification type=inbound_received 給客戶（含「扣處理費 HK$5，餘額 HK$xxx」）
- inbound.shipment_type=single → 觸發 outboundService.autoCreateForSingle

**測試**：

- 庫位不存在 → 4xx `LOCATION_NOT_FOUND`
- inbound status=pending（不是 arrived）→ 走直走路徑（AC-5.5）
- inbound status=cancelled → 4xx `INBOUND_CANCELLED`
- inbound status=abandoned → 4xx `INBOUND_ABANDONED`
- 同一 inbound 重複 receive → 4xx
- 並發 race（兩員工同時 receive 同一 inbound）→ 一個成功，另一個 4xx（mongo atomic）

### AC-5.5 Receive 直走（pending → received）

**Given** inbound status=pending（從未 arrive）
**When** 員工掃 locationCode + inbound_id + 拍照 2 張 + 量重量 / 尺寸 + 提交
**Then**

- 寫一筆 inbound_scans type=receive、**is_combined_arrive=true**、含照片 / 重量 / 尺寸
- 寫 item_locations
- inbound 主檔 status: pending → received
- arrivedAt 跟 receivedAt 都填當前時間
- 扣費照走（HK$5）
- 通知 type=inbound_received

**測試**：

- 缺 barcode 拍照 → 4xx（直走必拍）
- 缺包裹拍照 → 4xx
- 缺重量 / 尺寸 → 4xx（直走必填）
- 重量小數超過 2 位 → 4xx 或自動 round

### AC-5.6 拍照儲存

**Given** 員工 arrive 上傳 1 張 barcode + 1 張包裹外觀
**When** 提交
**Then**

- 檔案存於 `/uploads/inbound-photos/JP-SAITAMA-01/20260508/scan_S20260508_0001_barcode_1.jpg`
- 檔案存於 `/uploads/inbound-photos/JP-SAITAMA-01/20260508/scan_S20260508_0001_package_1.jpg`
- inbound_scans.photo_paths = [兩個相對路徑]
- inbound_scans.photo_metadata = [{type:'barcode', size, mime}, {type:'package', ...}]

**測試**：

- 上傳 6 張（超過 5）→ 4xx `TOO_MANY_PHOTOS`
- 上傳 6 MB → 4xx `FILE_TOO_LARGE`
- 副檔名為 .pdf → 4xx `INVALID_FILE_TYPE`（拍照只允許 jpg/jpeg/png）

### AC-5.7 異常標記

**Given** 員工 arrive 勾選「破損 + 受潮」
**When** 提交（含異常照片 + 備註）
**Then**

- inbound_scans.anomalies = [{code:'damaged', note:'外箱凹陷', photo_paths:[...]}, {code:'wet', note:'底部濕潤', photo_paths:[...]}]
- 寫 notification type=inbound_anomaly_detected 給客戶（內含異常 list）

**測試**：

- 勾選破損但缺照片 → 4xx `ANOMALY_PHOTO_REQUIRED`
- 勾選破損但缺備註 → 4xx
- 異常 code 不在 enum 內 → 4xx

### AC-5.8 連續模式

**Given** 員工 arrive 一筆完成
**When** UI 自動跳回 step 1
**Then**

- trackingNo 欄位清空 + autofocus
- session 不結束
- 員工繼續掃下一筆無需手動操作

**測試**：

- 員工切換頁面回來 → session 重啟（撤銷上一筆失效）
- session 內最近 5 筆操作可看（開發階段確認）

### AC-5.9 餘額閘 + Single 模式 held

**Given** 客戶 balance=3，inbound shipment_type=single
**When** 員工 receive
**Then**

- charge 扣 5 → balance=-2（負餘額允許，沿用業主決策 G）
- outboundService.autoCreateForSingle 被觸發
- 寫一筆 outbound_requests，status=held，held_reason='insufficient_balance'
- 寫 notification 給客戶（type=outbound_held 暫定 Phase 7 補；Phase 5 暫不發）

**測試**：

- 客戶 balance=10，receive 後 balance=5，outbound status=ready_for_label
- shipment_type=consolidated 且餘額不足 → outbound 不自動建立（要等客戶手動建出庫單；Phase 7 處理）
- env flag PHASE7_OUTBOUND_ENABLED 未啟用 → outbound status=held + held_reason='phase7_not_ready'

### AC-5.10 廢棄貨阻擋 Receive

**Given** inbound status=abandoned
**When** 員工掃 trackingNo 試圖 receive
**Then**

- 4xx `INBOUND_ABANDONED`
- frontend 顯示「此單已廢棄，請放異常處理區」+ 員工備註欄位（選填）
- 員工填了備註 → 寫 staff_handled_abandoned 一筆

**測試**：

- 員工標記「已處理」→ 廢棄貨 banner 計數 -1
- 已處理的廢棄貨不再顯示在 banner
- 同一 inbound 重複標記已處理 → idempotent（不寫第二筆）

### AC-5.11 Cross-service Sync

**Given** WMS receive 完成
**When** 同步推 OMS
**Then**

- OMS inbound_requests 對應紀錄 status / actualWeight / actualDimension / receivedAt 更新
- OMS clients.balance 更新（透過 walletService.charge 內部 sync）
- OMS 寫一筆 notifications（與 WMS 寫的同 type，用於客戶端顯示）

**測試**：

- WMS 寫成功但 OMS 同步失敗 → WMS 寫 sync_failed_logs，業務不 rollback
- X-Internal-Sync header 缺或錯 → 401

### AC-5.12 Bug 6 修復驗證

**Given** inbound 已 receive，item_locations.locationCode='A001'
**When** Phase 7 pick 流程觸發（Phase 7 範圍，但 Phase 5 schema 預先驗證）
**Then**

- item_locations.currentStatus 改 'picked'
- **item_locations.locationCode 仍為 'A001'**（不被覆寫成 staffId）
- pick_logs（Phase 7 範圍）寫 staff_id

**測試**：

- 查 locationCode='A001' 找在此庫位曾放過的所有 inbound（不論 currentStatus）→ 能找到（資料追溯沒壞）

### AC-5.13 Inbound Scans 歷史查詢

**Given** inbound `I-` 有 2 筆 scan（1 arrive + 1 receive）
**When** GET `/api/wms/inbound/I-/scans`
**Then**

- 回應 2 筆，含 type / 員工 / 時間 / 照片 / 重量 / 異常
- 排序 createdAt asc（時間順序）

**測試**：

- admin 看 → 全部欄位可看
- 客戶從 OMS 看（Phase 5 不開）→ 不開放

### AC-5.14 Lookup API（前端即時查詢）

**Given** 員工 PDA arrive 頁，輸入 trackingNo
**When** onBlur 觸發 POST `/api/wms/scan/arrive/lookup` body `{ tracking_no: 'xxx' }`
**Then**

- 對到 inbound → 回 `{ matched: true, inbound: {...} }`，含主檔 + declared_items
- 對不到 → 回 `{ matched: false }`
- 不寫任何資料

**測試**：

- normalize 後查（hyphen / 大小寫）正確對應
- 跨 client 撞號不誤對（lookup 不該對到別人的單，但 v1 倉庫員工權限可看所有 client，此 API 回所有對應；UI 顯示客戶名讓員工確認）

### AC-5.15 Daily Counter 並發

**Given** 同一天 5 筆並發 unclaimed
**When** 5 個並行 POST
**Then**

- 5 筆拿到不同 ID（U-20260508-0001 ~ U-20260508-0005）
- 序號連續無撞號（mongo findOneAndUpdate atomic）

**同邏輯適用 inbound_scans._id**（`scan_2026-05-08` counter）。

### AC-5.16 admin 後台調整 Receive 結果

**Given** admin 已登入，inbound status=received
**When** POST `/api/wms/inbound/:id/admin-adjust` body `{ new_status: 'arrived', refund: true, reason: '誤上架' }`
**Then**

- inbound status: received → arrived
- receivedAt 清空
- item_locations 對應 record 刪除（或 status='reverted'）
- 觸發 walletService.refund 退 HK$5
- 寫 notification 給客戶（type=inbound_status_adjusted by admin）
- 寫 audit log

**測試**：

- 非 admin → 403
- 缺 reason → 4xx
- 同時 picking 之後試圖調整 → 4xx（不允許）

---

## 7. 風險點 + 已知 gotcha

### 7.1 連續模式 session 持久化

員工切換 tab / 關閉瀏覽器 → session lost。

**處理**：

- session 純存於 sessionStorage（不存 localStorage / DB）
- 用戶意圖明確時讓他撤銷（5 分鐘內、autofocus）
- 失去 session 後 5 分鐘規則失效（admin 後台處理）

### 7.2 拍照檔案 orphan

Phase 3 提過：先寫 DB → 再寫檔案。失敗反向順序。

**Phase 5 細節**：

- arrive 提交時，先 upload 暫存檔案 → 寫 inbound_scans → 把檔案移到正式路徑
- 失敗 → 刪暫存檔
- 撤銷時刪檔
- v1 不做 cron 清孤兒檔（量小無影響）

### 7.3 PDA 拍照 + 寬頻不穩

PDA 連 WiFi 可能不穩。員工拍照後上傳失敗。

**處理**：

- frontend 顯示明確 loading + retry 按鈕
- 失敗時保留照片在 sessionStorage（base64），不丟失
- 員工可重新提交
- v1 不做離線模式（複雜）

### 7.4 並發 receive 同一 inbound

兩員工同時 receive 同一 inbound：

**處理**：

- mongo atomic findOneAndUpdate 防止
- 第二個員工 4xx，UI 顯示「此單剛被 [員工 A] receive」
- 第二個員工掃到的庫位若不同 → 物理上有兩個地方放？需 admin 介入
- v1 不做更複雜的衝突解決（罕見場景）

### 7.5 walletService.charge 失敗 vs receive 已寫

mongo session transaction 保證原子，但仍有可能：

- charge 內部 throw（極端錯誤，如 DB 連線斷）
- transaction abort，inbound 不會更新

**處理**：

- 整個 receive service 用 mongo session transaction 包
- 任一 step 失敗 → 全部 rollback
- 員工看到錯誤 → 重新 receive（資料一致）

### 7.6 Single 模式 outbound 自動建單在 Phase 5 不完整

Phase 5 只觸發 + 寫 placeholder outbound（status=held 或 ready_for_label）。完整 outbound 流程留 Phase 7 / 8。

**處理**：

- Phase 5 寫一筆 outbound，schema 留欄位給 Phase 7 / 8 補
- env flag `PHASE7_OUTBOUND_ENABLED` 控制是否觸發完整流程
- v1 上線到 Phase 7 完成前 single 模式 inbound 都會 held（業主接受）
- log warning 通知開發團隊

### 7.7 雲途 / Fuuffy carrier API 在 Phase 5 不需要

Phase 5 完全不呼叫 carrier API（只是觸發 outboundService.autoCreateForSingle 寫 schema）。Phase 7 才實際打 carrier。

### 7.8 staff_id 在 v1 reuse admin

業主決策：v1 用 admin 帳號簽入，但 inbound_scans.operator_staff_id 仍記值（即使全寫 admin id）。

**注意**：

- schema 預留 staff_id 欄位
- 未來分權時，原本寫 admin 的 record 會留下（admin id 不換）
- 業務上要區分 admin 跟員工 → 走 audit / 報表（v1 不做）

### 7.9 庫位 master data 沒做 UI

v1 admin 直接 mongo 新增庫位資料。

**風險**：admin 改錯 / 加錯 → 員工查 lookup 失敗

**處理**：

- README 加 seed script（admin 跑一次塞進初始 100 個庫位）
- 後台 UI 留後 phase

### 7.10 異常標記不阻擋簽入流程

業主決策：異常標記後 receive 仍照走、扣費照扣。CS 看 notification 後手動處理。

**Phase 5 範圍不做**：

- 異常觸發暫停 receive
- 異常 → 必須 admin 介入才能繼續
- 異常 → 自動退費

未來 Phase 6+ 補。

### 7.11 size_estimate vs actual 差距大

業主關心：客戶選 small 但實際 oversized。

**Phase 5 不做業務邏輯處理**：

- 純記錄 size_estimate（Phase 4 客戶填）+ actualDimension（Phase 5 員工量）
- WMS 詳情頁可顯示對比
- CS 看到差異大 → 手動聯絡客戶

未來 Phase 6+ 可加：

- size_estimate vs actual 體積差 > 30% → 自動標 anomaly
- 自動算補收費（如業務模型支援差額計費）

### 7.12 取消 / 廢棄回到原判（Phase 4 既定）

提醒：Phase 5 不改 Phase 4 取消 / 廢棄規則。重點：

| 階段 | 客戶可做 | 是否已扣費 | 退費 |
|---|---|---|---|
| pending | 取消 | 否（receive 才扣）| 無扣費可退 |
| arrived | 廢棄 | 否 | 無扣費可退 |
| received | 廢棄 | 是 HK$5 | **不退**（業主決策 D.3）|
| picking 後 | 不可取消 / 廢棄 | - | - |

inbound_scans **不存** cancel / abandon 動作。客戶線上動作走 inbound_requests 主檔欄位 `cancelled_at` / `abandoned_at`。

### 7.13 受控廢棄通知員工

Phase 4 已建 `inbound_abandoned` notification 給客戶。Phase 5 擴充：員工端走 banner（不發 push notification）。

**實作邏輯**：

- WMS arrive / receive / inbound-history 頁面 mount 時 GET `/api/wms/abandoned-inbounds?status=unhandled`
- 結果有 N 筆 → 顯示 banner
- 員工點 [看清單] → 跳 `/operations/abandoned-inbounds` 頁
- 員工標記「已處理」→ 寫 staff_handled_abandoned + banner 計數 -1

### 7.14 inbound 取消（pending → cancelled）race condition

員工 A 在 PDA 試圖 receive 直走（pending → received），客戶在 OMS 同時取消。

**處理**：

- receive API 用 mongo `findOneAndUpdate({ _id, status: { $in: ['pending', 'arrived'] } }, ...)` atomic
- 若 status 已變 cancelled → 4xx「此單剛被取消，請重新確認」
- 員工看到錯誤 → 物理動作走 SOP（放異常處理區）

mongo atomic 天然 cover，不額外設計。

---

## 8. 開發順序建議（Phase 5 內部分階段）

給 Claude Code 落地的子步驟：

| Sub-step | 內容 | 對應 AC |
|---|---|---|
| **5.1** | locations 主檔 + item_locations 重做 + 修 Bug 6 schema + seed script | AC-5.12 |
| **5.2** | inbound_scans schema + arrive UI/API/service（PDA only）+ 拍照功能 + 5 分鐘撤銷 | AC-5.1, 5.2, 5.6, 5.8, 5.14 |
| **5.3** | receive PDA UI + service（接續 + 直走兩條路）+ walletService 整合 + notification | AC-5.4, 5.5, 5.11 |
| **5.4** | receive Desktop UI（共用 API + service） | AC-5.4, 5.5（Desktop 路徑驗證）|
| **5.5** | unclaimed_inbounds + 異常標記完整支援 | AC-5.3, 5.7, 5.15 |
| **5.6** | single 模式自動建 outbound 觸發 + held 邏輯 + admin 後台調整 | AC-5.9, 5.10, 5.16 |
| **5.7** | inbound-history / abandoned-inbounds / unclaimed-inbounds 列表頁 + 員工 banner | AC-5.10, 5.13 |

每完成一步跑對應 AC 測試 + cross-service sync 驗證。

**Sub-step 細節**：

### 5.1 schema 地基

- 建 `locations` collection + index
- 改 `item_locations` schema（加 currentStatus / placedBy / lastMovedAt）
- 建 `staffs` collection + seed admin 一筆
- README 加 `npm run seed:locations` 跑庫位 A001-A100 seed
- 寫 mongoose hook 防止 item_locations.locationCode 被 pick 階段污染（schema 層保護）

### 5.2 arrive PDA only

- 建 `inbound_scans` collection + index（含 daily_counters scan prefix）
- 建 `/api/wms/scan/arrive` POST + lookup
- 建 `/api/wms/scan/arrive/cancel`
- 建 `/api/wms/scan/arrive/unclaimed` + `unclaimed_inbounds` collection
- frontend `/zh-hk/scan/inbound-arrive` 連續模式 + 5 分鐘撤銷 + 拍照
- file upload service（暫存 → 移正式路徑 → 失敗刪暫存）

### 5.3 receive PDA + walletService 整合

- 建 `/api/wms/scan/receive` POST + lookup（接續 + 直走分流）
- 整合 walletService.charge_inbound（Phase 3 已建 service 介面）
- 寫 notification.create
- mongo session transaction 包整段
- frontend `/zh-hk/scan/inbound-receive` PDA 版

### 5.4 receive Desktop UI

- frontend `/zh-hk/operations/inbound-receive` 桌面版
- 共用同一個 API + service（不重做 backend）
- Desktop layout：左 60% 主操作、右 40% 已上架 list

### 5.5 unclaimed + 異常

- 完整實作異常標記 4 種 + 拍照 + 備註結構化欄位
- frontend 4 個 checkbox + 條件展開
- frontend 無頭件登記頁完整 UI

### 5.6 single + admin 後台

- outboundService.autoCreateForSingle 介面 + env flag PHASE7_OUTBOUND_ENABLED
- 餘額閘 → outbound.held 邏輯
- admin 後台 `/api/wms/inbound/:id/admin-adjust` + 退費 walletService.refund

### 5.7 列表頁 + banner

- `/zh-hk/operations/inbound-history` 主管看 scan 歷史
- `/zh-hk/operations/abandoned-inbounds` 廢棄貨清單 + 標記已處理
- `/zh-hk/operations/unclaimed-inbounds` 無頭件清單（Phase 5 read-only）
- arrive / receive 頁面上方廢棄貨 banner
- 跑全部 acceptance criteria

---

## 9. 變更紀錄

| 版本 | 日期 | 說明 |
|---|---|---|
| v1.0 | 2026-05-08 | Phase 5 首次定稿，業務決策對齊：扣費點 receive 階段、arrive PDA only / receive PDA + Desktop、receive 直走支援、5 分鐘撤銷、連續模式、4 種異常標記、拍照兩按鈕（barcode + 包裹）、廢棄阻擋 banner、staff schema 預備（v1 reuse admin）、unclaimed_inbounds（Phase 6 才指派）、Bug 6 預修、single 模式 fail-soft outbound、receive 撤銷 v1 admin 後台處理 |
