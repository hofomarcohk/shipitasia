# CLAUDE.md — shipitasia_oms 本地分支變更紀錄

> 此檔僅在本地，**未 push** 到 github.com/Viewider/shipitasia_shipping。
> 評估會話日期：2026-05-07
> Session 主旨：跑通 happy path、整理 bug、評估 ShipItAsia 作為候選 A

## 連線資訊

- Dev URL：http://localhost:3002
- Login：admin / admin123456（in `vw_sms.clients` — OMS 是客戶 portal，登入表是 clients）
- Mongo: `vw_sms`（brew services，無 auth）
- Redis: 共用同一 Redis instance

## 本 session 已改 source code（local-only commit）

| 檔案 | 改動 |
|---|---|
| `.env` | `MONGODB_URI` 拿掉 admin auth、`REDIS_PASSWORD=""` |
| `src/lang/base.ts` | `getCurrentLangCode()` URL 偵測從 `/zh_hk` `/zh_cn`（底線）改成 `/zh-hk` `/zh-cn`（連字號），返回值仍維持底線格式（OMS lang 字典 key 用底線） |
| `src/app/[locale]/layout.tsx` | 國家清單排序從 `{ "text.en": 1 }` 改成 `{ priority: -1, "text.en": 1 }` — 讓 HK 永遠最上 |
| `src/app/[locale]/auto-outbound/list/page.tsx` | import `getCurrentLangCode` + `useState("en")` → `useState(getCurrentLangCode())` |
| `src/app/[locale]/bill/list/page.tsx` | 同上 + 順手清掉壞掉的 `init = () => async () => {}`（雙層 wrapper、永不執行） |
| `src/types/Inbound.ts` | optional date 欄位（willArrivedAt / inboundingAt / inboundedAt / outboundingAt / outboundedAt / cancelledAt）加 `.nullable()` |
| `src/types/Outbound.ts` | optional date 欄位（outboundingAt / outboundedAt / cancelledAt）加 `.nullable()` |

## 本 session 動過的 DB（不在 git）

- `vw_sms.clients`：seed `admin / admin123456`（bcrypt 10 rounds，role=admin）
- `vw_sms.menu_urls`：3 群組 sidebar（inbound / outbound / account）
- `vw_sms.countries`：seed 246 筆 ISO 3166-1 國家（用 Node `Intl.DisplayNames` 拿 zh-HK / zh-CN 譯名），HK / MO / TW 改用簡短名（避開「中國香港特別行政區」）；HK `priority: 100`，其餘 0
- `vw_sms.warehouses`：透過 WMS sync 機制收到 JP001
- `vw_sms.categories`：透過 WMS sync 機制 + 一次性 backfill 收到 1 筆
- `vw_sms.logistic_parties`：手動 seed UPS、DHL（OMS / WMS 兩邊都沒 CRUD UI，所以只能 DB 直塞）
- `vw_sms.outbound_requests`：跑 demo 留下 1 筆 `O2605076509700001`，狀態仍卡在 `processing`（因 cross-service sync bug 鏈）
- `vw_sms.inbound_requests`：跑 demo 留下 2 筆，receivedAt 為 null（因 demo 跳過 PDA receive）

## 已知未修 bug（重點摘錄，完整見 `../shipitasia_session_summary.md`）

- **M3**：`src/services/outbound-order/do_update_outbound_order_status.ts:36-38` 用 `orders.length !== orderIds.length` 檢查，重複 input 會誤判 — 跟 WMS 那邊 dedupe bug 連鎖造成 OMS 出庫永遠卡 processing
- **M4**：`ORDER_NOT_FOUND` error key 不在 `src/cst/errors/`，丟出時 `ApiError` constructor 找不到 → 變 500
- **M5**：同檔 case `OUTBOUND.STATUS.CANCEL` 漏 `break`，所有取消單流程必爆
- **M7**：`/api/wms/utils/sync` 沒做 token 驗證（generic CRUD 入口開放）
- **M9**：`logistic-party` 完全沒 CRUD service / UI，OMS schema 又必填
- **N8**：`/api/cms/list/logistic-service` switch 只實作 yunexpress
- **N10**：出庫驗證錯誤訊息（如 MISSING_DECLARED_VALUE）i18n 不解析，UI 顯示原始 key

## 未來 push 前要做的

- 拿掉 `.env` 的 auth 修改
- `layout.tsx` 加的 `priority` 排序鍵 + `seed`：要決定到底用 priority 還是其他機制處理 country 排序，編輯 country 時 zod `.strict()` schema 會剝掉 priority 欄位（潛在治理問題）
- 確認 `auto-outbound/list` 和 `bill/list` 用 `getCurrentLangCode()` 的方向是要保留還是逐步遷移到 next-intl `useTranslations()`

## 上下文文件

- `/Volumes/External/其他AI開發/shipitasia_session_summary.md`（也有 .docx 版）
- `~/.claude/projects/-Users-Marco/memory/project_shipitasia.md`
- `~/.claude/projects/-Users-Marco/memory/project_shipitasia_eval.md`

---

## P10 — WMS 揀貨批次 + 板位 label（2026-05-12 session）

> 此為新增功能，local-only，未 push。完成 Phase A（每箱仍 1 outbound），Phase B（同客戶同址共箱）欄位已預埋未啟用。

### Phase A 流程（5 步對應現行碼）

| 構思步 | 落地 |
|---|---|
| 1. 早上電腦端建批次 | `wms/operations/pick-batch` 桌機頁 + `pickBatchService.createBatch / startBatch` |
| 2. PDA 按貨架掃描 | `wms/pda/scan/shelf` + `pickBatchService.listByLocation`（縮圖來自 inbound_scans.photo_package_paths） |
| 3. 回電腦集箱 | 沿用 P8 `operations/pack` + `createBox` |
| 4. 複重置板 | `completeWeighing` 後自動呼 `palletLabelService.printPallet`；weigh 頁出現 pallet 預覽卡可列印/重印 |
| 5. 客戶確認 → 印單貼單 | client confirm 走原 P8 流程；`operations/label-print` 上方新增「掃 pallet barcode 找回」入口 |

### 新增 collections / 欄位

- `pick_batches` — `{ _id: PB-YYYYMMDD-NNNN, warehouseCode, status: draft|picking|picked|closed|cancelled, outbound_ids[], note, created_by_staff_id, started_at, picked_at, closed_at }`
- `pallet_labels` — `{ _id: PL-YYYYMMDD-NNNN, batch_id, outbound_id, client_id, box_count, total_weight_kg, carrier_code, destination_country, printed_at, reprint_count, scanned_back_at }`
- `outbound_requests` 加：`batch_id` (string|null)、`disallow_consolidation` (bool, default false)、`cargo_categories` (string[]，derived from inbound `contains_battery` / `contains_liquid`)
- `outbound_boxes` 加：`pallet_label_id` (string|null)

### 新檔案

```
src/types/PickBatch.ts                                          # PickBatch + PalletLabel + ShelfPickItem types
src/cst/errors/pick-batch-error.ts                              # 2000xxx error codes
src/services/pickBatch/pickBatchService.ts                      # 批次 CRUD + checkBatchPickComplete + listByLocation
src/services/pallet/palletLabelService.ts                       # printPallet + scanBackPallet
src/components/wms/operations-pick-batch-list.tsx               # 批次列表 + 建批次 UI
src/components/wms/operations-pick-batch-detail.tsx             # 批次監控 + start/close/cancel
src/components/wms/pda-shelf-pick.tsx                           # PDA 掃貨架揀貨
src/app/[locale]/wms/operations/pick-batch/page.tsx
src/app/[locale]/wms/operations/pick-batch/[batchId]/page.tsx
src/app/[locale]/wms/pda/scan/shelf/page.tsx
src/app/api/wms/pick-batch/route.ts                             # GET list + POST create
src/app/api/wms/pick-batch/batchable/route.ts                   # GET 可加入批次的 outbounds
src/app/api/wms/pick-batch/[batchId]/route.ts                   # GET detail
src/app/api/wms/pick-batch/[batchId]/start/route.ts             # POST start
src/app/api/wms/pick-batch/[batchId]/close/route.ts             # POST close
src/app/api/wms/pick-batch/[batchId]/cancel/route.ts            # POST cancel
src/app/api/wms/pick-batch/[batchId]/outbound/route.ts          # POST add / DELETE remove
src/app/api/wms/pick-batch/by-location/[locationCode]/route.ts  # GET PDA shelf list
src/app/api/wms/pallet-label/[palletNo]/route.ts                # GET get
src/app/api/wms/pallet-label/scan-back/route.ts                 # POST scan back
src/app/api/wms/pallet-label/print/route.ts                     # POST (re-)print
migrations/20260512000003-p10-pick-batch-pallet.js              # 索引 + 新 collection
migrations/20260512000004-p10-menu-entries.js                   # 加 sidebar item: ops_pick_batch + scan_shelf
```

### 修改檔案

```
src/cst/collections.ts                  # +PICK_BATCH, +PALLET_LABEL
src/cst/error-list.ts                   # +PICK_BATCH_ERROR slot 20
src/constants/auditActions.ts           # +pick_batch_*, +pallet_label_*; +AUDIT_TARGET_TYPES.pick_batch / pallet_label
src/types/OutboundV1.ts                 # +batch_id / disallow_consolidation / cargo_categories on outbound; +pallet_label_id on box; +disallow_consolidation in CreateConsolidatedOutboundInputSchema / CreateSingleOutboundInputSchema
src/services/outbound/wmsFlow.ts        # pickInbound 加 batch 校驗; pickInbound 成功 → checkBatchPickComplete; completeWeighing 後 → palletLabelService.printPallet (system)
src/services/outbound/outbound-service.ts  # createOutboundCore: 從 inbound 聚合 cargo_categories；插入時帶 disallow_consolidation + batch_id=null
src/components/wms/operations-weigh.tsx     # completeWeigh 後拉 pallet info + 顯示列印卡 + 重印按鈕
src/components/wms/operations-label-print.tsx  # 上方加「掃 pallet barcode 找回」表單
src/components/outbound-new-form.tsx        # Section 4 加 disallow_consolidation toggle + cargo categories 提示
messages/{zh-hk,zh-cn,en}.json          # 新 keys: wms_ops.pick_batch.*、wms_ops.weigh.pallet_*、wms_ops.label_print.scan_pallet_*、wms_pda.shelf_pick.*、outbound_v1.new.disallow_consolidation_*、menu.{ops_pick_batch,scan_shelf}
```

### Phase B 預備（未啟用）

- `outbound.disallow_consolidation` 欄位已落地，OMS 客戶可勾選 opt-out
- `outbound.cargo_categories` 已寫入，未來 Phase B 系統判定「貨型相容」用得到
- 共箱真正實作（box → 多 outbound_ids、攤分計費、合併運單）尚未動工 — 等 Phase A 跑順、收集真實合併頻率資料再決定

### 已知未做

- Pallet label 目前只生 barcode + 元資料；列印的實際 PDF / printable view 還是 fallback `window.print()`（瀏覽器原樣印）；未做專門的 PDF 模板
- 圖片縮圖直接從 inbound_scans.photo_package_paths[0] 撈；如果是上傳的 file path 而非可公開 URL，前端要透過代理 endpoint 才能 render — 目前 fallback 「no photo」
- E2E smoke test 沒在這台 host 跑（dev server 沒起），需 Marco 手動驗

### 驗收 happy path

1. 建 2 張 outbound（同客戶可以、不同客戶也可以），確保都 ready_for_label
2. 進 `/zh-hk/wms/operations/pick-batch` → 勾選 → 建批次
3. 進 batch 詳情頁 → 按「開始批次」
4. PDA 進 `/zh-hk/wms/pda/scan/shelf` → 輸入貨架碼 → 應列出該架待揀件（含縮圖）
5. 揀完 → batch 自動 picked
6. 桌機 `pack` → `weigh` → 全部 weigh-verified → 自動跳出 pallet label 卡
7. 客戶 OMS 確認 → 桌機 `label-print` → 掃 pallet barcode → 載入該 outbound → 印面單 → 完成
8. PDA `depart` → 出庫


