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
