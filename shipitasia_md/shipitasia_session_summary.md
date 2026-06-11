# ShipItAsia WMS + OMS 系統評估報告

> 彙整 2026-05-07 與 Claude session 共同跑過 happy path 後的觀察
> 對象：`shipitasia_wms` (port 3001) + `shipitasia_oms` (port 3002)

---

## 1. 完整作業流程模擬（Happy Path）

涵蓋客戶在 OMS 下單 → 倉庫人員透過 WMS 與 PDA 處理收貨、上架、揀貨、打包、棧板化、出貨的完整週期，並標示資料流動與兩個服務間的同步點。

### 前置條件（一次性設定）

- WMS 管理員建立倉庫（如 `JP001`）→ 自動同步到 OMS
- WMS 管理員建立庫位（如 `A001`、`A002` 等貨架位置）
- WMS 管理員建立商品類別（categories）→ 自動同步到 OMS
- WMS 管理員建立限制標籤（restrictions）→ 自動同步到 OMS
- OMS 建立物流方主檔（`logistic_parties`，例：UPS / DHL）— 目前需 DB 直塞，無 CRUD UI
- OMS 建立客戶帳號（`clients`）— 客戶用此帳號登入 OMS 自助下單

### Stage 1：客戶建立入庫請求（OMS）

- 客戶登入 OMS（http://localhost:3002/zh-hk/login）
- 進入「入庫請求 / 入庫訂單」→ 點擊「創建入庫請求」
- 填寫基本資訊：選擇倉庫、選擇類別、選擇限制標籤（若需）、申報價值、追蹤號
- 填寫收貨地址（倉庫的收件地址）：聯絡人、手機、國家、城市、區、地址
- 填寫尺寸：長 / 寬 / 高 / 重量（可後續補）
- （選填）發貨地址：客戶端寄出位置
- 點「創建」→ OMS 寫入 `vw_sms.inbound_requests`，同時 `callWmsApi` 推給 WMS
  - WMS 收到 → 寫入 `vw_wms.inbound_requests`，狀態 `pending`
  - 客戶這邊看到 `status: pending`，分配 orderId（格式 `I` + 時戳）

### Stage 2：實體貨物到貨（WMS PDA arrive）

- 倉庫人員拿 PDA 進入「入庫 / 到貨登記」
- PDA 掃描貨物上的條碼（trackingNo 或 orderId）
- 系統查 `inbound_requests` 找到對應 pending 單
- 更新 `status: arrived`，寫入 `arrivedAt`、新增 `arrive_logs` 紀錄
  - （cross-service 推送）WMS 通知 OMS：此單 `status = processing`

### Stage 3：貨物上架入庫（WMS PDA receive）

- 倉庫人員 PDA 進入「入庫 / 貨物入庫」
- PDA 第一步：掃 / 輸入庫位編號（locationCode，如 `A001`）
- PDA 第二步：掃 / 輸入貨物條碼（trackingNo / orderId）
- 後端服務 `receiveInbound`：
  - 驗證 inbound 狀態 = `arrived`（不對就拒絕）
  - 建立 `item_locations` 紀錄：`(locationCode, itemCode, warehouseCode, itemType=shipment)`
  - 建立 `receive_logs` 紀錄
  - 更新 inbound `status: received`，寫入 `receivedAt`
- 可重複掃多筆，單次 batch 一起 receive

### Stage 4：客戶建立出庫單（OMS）

- 客戶 OMS 進入「出庫請求 / 出庫訂單」→「創建出庫請求」
- 選擇要出庫的入庫單（`inboundRequestIds`）— 條件：每筆都要有 `declaredValue > 0` 且有 `category`
- 選擇物流方（`logisticParty`，必填）
- 選擇物流服務（`logisticService`，僅 yunexpress 有實作）
- 填寫收件地址（最終客戶地址）
- 點「創建」→ OMS 寫入 `vw_sms.outbound_requests`，`callWmsApi` 推給 WMS
  - WMS 收到 → 寫入 `vw_wms.outbound_requests`，並把對應 inbound 狀態跳到 `picking`

### Stage 5：揀貨（WMS PDA pick）

- 倉庫人員 PDA 進入「出庫 / 出庫揀貨」
- PDA 第一步：選擇出庫任務（顯示待揀的 outbound）
- PDA 第二步：掃 / 輸入庫位編號（A001）
- 系統查 `item_locations` 找該庫位上目前出庫任務需要的貨
- 找到後從庫位「拿走」item，更新該 item 在 `item_locations` 的位置
- 全部揀完 → outbound `status: picked`

### Stage 6：包裝（WMS Web `/outbound/pack`）

- 倉庫人員打開 WMS Web 出庫包裝頁（http://localhost:3001/zh-hk/outbound/pack）
- 選擇 `picked` 狀態的 outbound 訂單
- 點「新增箱」按鈕，系統依訂單號自動產生 boxNo（`B + orderId 後段 + -01/-02`）
- 把揀好的物品分配到各箱（拖拉或勾選），可以多單合一箱、一單多箱
- 輸入每箱的尺寸（長寬高重）
- 完成後 outbound `status: packed`，`pack_lists` 紀錄完整的 (boxNo, orderId) 對應

### Stage 7：棧板化（WMS PDA palletize）

- 倉庫人員 PDA 進入「出庫 / 出庫置板」
- PDA 第一步：掃 / 輸入棧板編號（palletCode，例如 `PLT-001`）
  - 棧板若不存在於 `pallet_lists` 會自動上架（upsert pattern）
- PDA 第二步：掃 / 輸入箱號（boxNo，例如 `B...-01`）
- 系統把箱子綁到棧板，`pallet_lists` 加紀錄 `(boxNo, palletCode)`
- 全部箱裝完 → outbound `status: palletized`

### Stage 8：離倉（WMS PDA departure）

- 倉庫人員 PDA 進入「出庫 / 出庫離倉」
- PDA 掃描棧板的 palletCode
- 後端 `doDeparturePallet`：
  - 建立 / 更新 `departure_lists` 紀錄（誰在何時推離倉）
  - 彙整這個棧板上所有 box → outbound 訂單
  - 把該 outbound 全部棧板都離倉的訂單狀態改為 `departed`
  - 把該訂單關聯的 inbound 狀態改為 `departed`
  - （cross-service）WMS 通知 OMS：此 outbound `status = departed`

### Stage 9：客戶確認到貨（OMS）

- 客戶在 OMS 出庫訂單列表看到狀態變成「已出發 / departed」
- （理想狀態）系統推 webhook / email 通知客戶包裹資訊與物流追蹤碼
- （理想狀態）後續若有送達回報，狀態進一步更新為 `delivered`

### 資料流動總覽

| 階段 | 動作 | WMS 狀態 | OMS 狀態 |
|---|---|---|---|
| 客戶下單 | OMS 寫 vw_sms + 推 WMS | vw_wms inbound: pending | OMS: pending |
| PDA arrive | WMS 寫 arrived + 推 OMS | vw_wms inbound: arrived | OMS: processing |
| PDA receive | WMS 寫 received（不推 OMS） | vw_wms inbound: received，產生 item_locations | OMS: processing |
| 客戶建出庫 | OMS 寫 vw_sms + 推 WMS | vw_wms outbound: pending，inbound 跳 picking | OMS: pending |
| PDA pick | WMS 寫 picked + 推 OMS | vw_wms outbound: picked | OMS: processing |
| Web pack | WMS 寫 packed | vw_wms outbound: packed，pack_lists | OMS: processing |
| PDA palletize | WMS 寫 palletized | vw_wms outbound: palletized，pallet_lists | OMS: processing |
| PDA departure | WMS 寫 departed + 推 OMS | vw_wms outbound + inbound: departed | OMS: departed（理論） |

---

## 2. 已知未修 Bug 清單（13 條）

本次 session 跑流程時直接觀察到、屬於程式碼缺陷而非環境問題的 bug。已修復的不列入；環境相關（Mongo/Redis 設定、URL 偵測底線/連字號等）也排除。每筆會標記嚴重度（**B** = Blocker / **M** = Major / **N** = Nuisance）與位置。

### Bug 1：WMS 入庫請求創建 API 沒實作（B）

- **位置**：WMS `src/app/api/wms/inbound/route.ts:84`
- **現況**：POST 處理器 body 直接丟掉，回傳當前列表，沒呼叫 `createInbound`。WMS 後台「創建入庫請求」按鈕點下去 UI 不會錯，但實際資料不會建。
- **影響**：倉庫人員無法在 WMS 後台手動建單（例如紙本入庫、walk-in）。
- **備註**：除了 handler，UI form default 還寫死 `clientId: "admin"`（即使 handler 修好，也要補 client 下拉）。

### Bug 2：WMS depart_pallet 推 OMS 時送重複 orderIds（M）

- **位置**：WMS `src/services/outbound-order/departure/do_depart_pallet.ts`
- **現況**：aggregate 拿到 `outboundOrderIds` 沒去重，當一個 outbound 有多個 box / pallet 時，array 會重複。直接送給 OMS。
- **影響**：跟 Bug 3、Bug 4 連鎖，導致 OMS 收到後爆 500，OMS 那邊 outbound status 永遠停在 `processing` 不會升級為 `departed`。

### Bug 3：OMS updateOutboundStatus 嚴格長度比對（M）

- **位置**：OMS `src/services/outbound-order/do_update_outbound_order_status.ts:36-38`
- **現況**：OMS 端 `db.find($in: orderIds)` 結果與 `orderIds.length` 直接比對。Mongo 自動去重，所以一旦 input 有重複（見 Bug 2），長度永遠不等。
- **影響**：跨服務同步狀態時會把合法請求誤判為 `ORDER_NOT_FOUND`。

### Bug 4：OMS error-list 缺 ORDER_NOT_FOUND key（M）

- **位置**：OMS `src/cst/errors/`
- **現況**：`updateOutboundStatus` 丟 `ApiError("ORDER_NOT_FOUND")`，但 error-list 沒這 key。`ApiError` constructor 找不到 → 丟 meta error → 變成 500。
- **影響**：原本應該回 "找不到訂單" 的 4xx，變成 generic 500，難以排錯。

### Bug 5：OMS updateOutboundStatus 的 CANCEL case 漏 break（M）

- **位置**：OMS `src/services/outbound-order/do_update_outbound_order_status.ts:25-27`
- **現況**：
  ```
  case OUTBOUND.STATUS.CANCEL: update = {...}; (← 沒 break)
  default: throw new ApiError("INVALID_OUTBOUND_STATUS");
  ```
- **影響**：所有取消單流程都會丟 `INVALID_OUTBOUND_STATUS`。Demo 取消功能必撞。

### Bug 6：PDA pick 把 item_locations.locationCode 覆蓋成 staffId/username（M）

- **位置**：WMS pick 服務鏈（疑似 `do_pick_outbound_order.ts` 或 `do_select_pick_outbound_task.ts`）
- **現況**：實測 pick 完後 `item_locations` 紀錄的 `locationCode` 從原本的 `A001` 變成 `'admin'`（疑似 staffId 誤填到 locationCode 欄位）。
- **影響**：庫位查詢、復核都會壞 — 你查 `A001` 看不到任何曾經放在那的貨。資料追溯壞掉。
- **備註**：未深追實作，可能 pick 設計上就是把 item「拿在員工手上」當作中間態，但欄位名混用語義。

### Bug 7：/api/wms/utils/sync 沒做 token 驗證（M，安全）

- **位置**：OMS `src/app/api/wms/utils/sync/route.ts`；WMS 同名端點未確認
- **現況**：`wmsMiddleware` 雖然 import `validateToken` 但 sync 路由沒呼叫；任何人都能 POST/PUT 寫 OMS DB collection。
- **影響**：本機 dev 沒事，上線會被當寫入後門。

### Bug 8：logistic-service 只有 YunExpress 分支（N）

- **位置**：OMS `src/app/api/cms/list/logistic-service/route.ts`
- **現況**：switch 只實作 `case "yunexpress"`，其他物流方一律 return 空。
- **影響**：客戶選 UPS / DHL 等物流方時，物流服務下拉永遠空（雖然 schema optional，但 UX 不一致）。

### Bug 9：logistic-party 完全沒 CRUD（M）

- **位置**：兩 repo 的 `src/services/logistic-party` 都沒 `do_create/do_update`
- **現況**：只有 `get_list` + `validate`，沒 create / update。WMS 跟 OMS 都沒 sidebar 連到 logistic-party 管理頁。Schema 上 outbound 必填 `logisticParty`，但沒地方建。
- **影響**：整個物流方資料只能 DB 直接塞，運維沒得管理。

### Bug 10：OMS 出庫驗證錯誤訊息 i18n 不解析（N）

- **位置**：OMS `src/app/api/cms/outbound/route.ts:103`；i18n 機制 `src/lang/base.ts`
- **現況**：`lang("error.MISSING_DECLARED_VALUE", langCode)` 拿到的 langCode 與字典 key 格式對不上（hyphen vs underscore），UI 顯示 raw key 「error.MISSING_DECLARED_VALUE」。
- **影響**：客戶看到一串技術 key 不知道發生什麼事。

### Bug 11：WMS 兩個 dead route 用壞掉的 lang() 寫的（N）

- **位置**：
  - `src/app/[locale]/admin/page.tsx`（不是 admin/list）
  - `src/app/[locale]/outbound/pack/list/page.tsx`（不是 outbound/pack）
- **現況**：兩頁全 repo 沒任何 link 進去，且大量使用 `lang()`（不會繁中）。疑似舊版 / 廢棄 / 實驗品。
- **影響**：佔 repo 空間，可能誤導未來開發者。

### Bug 12：OMS bill/list 原本的 init 是 () => async () => {}（已順手修，留紀錄）

- **位置**：OMS `src/app/[locale]/bill/list/page.tsx`（已清理）
- **原狀**：雙層 wrapper，永不執行；同一檔案的 `useEffect(init)` 等於空操作。
- **備註**：本 session 已處理。但這 pattern 可能還在別處重複出現。

### Bug 13：OMS 入庫請求建立會把 nullable date 欄位 init 成 null（已修 schema）

- **位置**：OMS 入庫表單 default + WMS/OMS 兩 repo 的 `Inbound.ts`
- **現況**：OMS form 把 `receivedAt` 等 date 欄位 init 成 null 一起送 → 寫入 WMS DB → 後續 PUT 編輯時 `schema.parse` 不接受 null → 400。
- **已修**：兩 repo schema 加 `.nullable()` 容忍 null。但前端表單其實不該送 null（應該 omit）— 這個小毛病沒清。

---

## 3. 完整 WMS 還缺什麼（功能 Gap 清單）

市場上完整 WMS 通常具備、但本系統目前沒實作或實作不完整的功能。按業務優先級排序。

### A. 物流商整合（最關鍵）

- **Carrier API 整合**：UPS / DHL / FedEx / SF / 順豐 等真實串接
  - 現況只有 YunExpress 半實作，其他物流方選了等於沒選
- **Tracking label / AWB 自動生成**
  - 目前 outbound box 有 `trackingNo` 欄位但沒看到自動取號或印單流程
- **Rate shopping / 比價**（多家 carrier 同時詢價選最便宜）
- **Tracking webhook 接收**：carrier 端送達回報 → 自動更新訂單為 `delivered`
- **Pickup scheduling**（call carrier 派車取件）
- **Customs declaration document**（國際單必要的報關文件自動產生）

### B. 商品 / SKU 管理

- 目前資料模型把 inbound 訂單當作「貨」，沒有獨立的 SKU / Product 概念
- 缺：商品主檔（SKU、條碼、品名、規格、價格、圖片）
- 缺：一單多 SKU（你的 inbound 只有 dimension/weight 在訂單層，無法描述「這單裡有 3 個 SKU 各 X 件」）
- 缺：套裝 / 組合品 / Kit
- 缺：批次（lot）/ 序號（serial）/ 保質期管理

### C. 庫存管理

- 盤點（cycle count / stock take）：定期清點實際庫存對帳
- 庫存調整（盤盈 / 盤虧 / 損耗）
- 庫位移轉（item 從 A001 換到 B002）
- 庫存閾值告警（低於水位線通知補貨）
- 庫位類型：揀貨區 / 儲存區 / 暫存區 / 棄貨區的分區管理
- ABC 分析（高頻商品擺接近出貨口）

### D. 退貨 / RMA 流程

- 客戶申請退貨 / 換貨
- 退貨入庫驗收（人工檢查狀態：完好 / 損壞 / 二次包裝）
- 退款 / 換貨對帳
- Return label 生成

### E. 取消 / Hold / 異常處理

- Outbound 取消（schema 有 `cancelled` status，但 Bug 5 阻擋）
- Hold（暫扣）流程（schema 有 `hold` status，沒看到 UI / 流程）
- 貨損 / 缺件登記
- 未知入庫處理（`unknownInbound` 在 PDA 有頁面但流程不清）

### F. 計費 / 對帳

- 計費引擎：依重量、體積、距離、material、特殊處理費等規則計價
- Bill / 帳單目前在 OMS sidebar 有，但建立 / 計算流程不完整
- 客戶儲值 / 信用額度管理
- 多幣別支援
- 稅務 / 海關費分擔
- 對帳單 / 發票 PDF 生成

### G. 通知 / Webhook

- Email / SMS 通知客戶（下單成功、入庫完成、出貨、配送）
- Webhook：客戶系統訂閱事件（`client.notifyApis` 在 schema 有，沒看到 dispatch 邏輯）
- Slack / Telegram / LINE 整合（運維告警）

### H. 報表 / 分析 / Dashboard

- 首頁儀表板（兩 repo 的 `/home` 都是空殼）
- 出入庫量、KPI（receive 平均時長、pick 效率）
- 客戶活躍度、訂單趨勢
- 倉庫產能利用率
- 員工生產力
- Audit log / 操作歷史 UI（incoming / outgoing api log 有寫但沒 UI 看）

### I. 員工管理 / 權限

- Staff 帳號 schema 有但 OMS / WMS 都沒 staff 管理 UI（只有 admin 一個角色）
- 細粒度權限：哪個倉庫、哪個操作可做
- 員工排班 / 出勤
- 員工績效

### J. 客戶端體驗

- 客戶自助改地址 / 收件人
- 客戶看 tracking 即時更新（目前只看 status，看不到 carrier 細節）
- 客戶 API 串接文件（v1.0 端點存在但無 OpenAPI / 文件）
- 客戶上傳商品 SKU 主檔（CSV / API）
- 客戶端 webhook 自助設定 UI

### K. 多倉 / 路由優化

- 多倉自動分倉（依客戶地址 / 庫存自動選最佳倉發貨）
- Cross-docking（直接從卸貨口轉到出貨區，不經過儲存）
- 倉間調撥
- 自動補貨建議（auto-outbound 在 OMS 有頁面但 i18n 壞、邏輯未完成）

### L. 文件 / 標籤 / 列印

- Picking list 列印
- Packing slip 列印
- Box label / Pallet label 列印（系統有 outbound/label 路由但內容未確認）
- 進倉 / 出倉收據
- 海運 / 空運提單模板

### M. 行動 / 硬體

- PDA 真實裝置整合（目前是 web 模擬，沒測過實際手持掃描器 / 條碼槍）
- 離線模式（PDA 斷網時暫存操作待回連）
- RFID 整合
- Voice picking（語音導引揀貨）

---

## 結語

目前系統核心 happy path（OMS 下單 → WMS 收貨 → 揀打棧出）骨架已能跑通，且兩服務間的 master data 同步機制已存在（categories / restrictions / warehouses）。但完整 WMS 在 carrier 整合、商品主檔、庫存管理、退貨、計費、通知、報表這幾塊都還屬於空白或半成品。建議下一步聚焦：

1. **Carrier 整合**（UPS/DHL 真實 label & tracking）— 最影響客戶體驗
2. **SKU 主檔** — 解鎖一單多品、批次、保質期等可能性
3. **計費 / Bill 完整流程** — 直接決定能不能營收
4. **通知 + 客戶 tracking 視角** — 補上目前最破碎的「出庫後客戶該看到什麼」段
