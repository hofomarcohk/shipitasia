# CLAUDE.md — shipitasia_wms 本地分支變更紀錄

> 此檔僅在本地，**未 push** 到 github.com/Viewider/shipitasia_wms。
> 評估會話日期：2026-05-07
> Session 主旨：跑通 happy path、整理 bug、評估 ShipItAsia 作為候選 A

## 連線資訊

- Dev URL：http://localhost:3001
- Login：admin / admin123456（in `vw_wms.admins`，由本地 seed 建立）
- Mongo: `vw_wms`（brew services，無 auth）
- Redis: 同上

## 本 session 已改 source code（local-only commit）

| 檔案 | 改動 |
|---|---|
| `.env` | `MONGODB_URI` 拿掉 admin auth、`REDIS_PASSWORD=""` — 對齊本機 brew 預設 |
| `src/lang/base.ts` | `getCurrentLangCode()` 從寫死 `return "en"` 改為偵測 `/zh-hk` `/zh-cn` URL |
| `src/types/Inbound.ts` | optional date 欄位（willArrivedAt / arrivedAt / receivedAt / outboundingAt / outboundedAt / cancelledAt）加 `.nullable()` |
| `src/types/Outbound.ts` | optional date 欄位（outboundingAt / outboundedAt / cancelledAt）加 `.nullable()` |
| `src/services/warehouse/do_create_warehouse.ts` | `insertMany` 後 `callShippingServiceApi POST /api/wms/utils/sync` 推 OMS（沿用 category sync pattern）|
| `src/services/warehouse/do_update_warehouse.ts` | `updateMany` 後 `callShippingServiceApi PUT /api/wms/utils/sync` 推 OMS |
| `src/app/[locale]/pda/outbound/palletize/page.tsx` | `if (results.length == 1)` → `if (results.length >= 1)`（修一箱多單時前端沉默死掉） |

## 本 session 動過的 DB（不在 git，重建本機才需）

- `vw_wms.admins`：seed `admin / admin123456`（bcrypt 10 rounds）
- `vw_wms.menu_urls`：5 群組 sidebar（inbound / outbound / warehouse / system / others）
- `vw_wms.pda_menu_urls`：4 群組 PDA sidebar，path 用 `/pda?section=<group>` query 形式
- `vw_wms.warehouses`：手動加 JP001（並透過 sync 機制傳到 OMS）
- `vw_wms.item_locations`：手動補 2 筆把 inbound `I26...3800001` 與 `I26...1400001` 掛到 `A001`（為了跳過 PDA receive 直接進 pick demo）

## 已知未修 bug（重點摘錄，完整見 `../shipitasia_session_summary.md`）

- **B1**：`src/app/api/wms/inbound/route.ts:84` POST handler 是 stub，沒呼叫 `createInbound`
- **M2**：`src/services/outbound-order/departure/do_depart_pallet.ts` 推 OMS 時 `outboundOrderIds` 沒去重 → OMS 回 500
- **M6**：PDA pick 完後 `item_locations.locationCode` 被覆蓋成 staffId/username（疑似 bug 或設計怪）
- **M7**：`/api/wms/utils/sync` 在 OMS 端沒做 token 驗證（這 repo 的 sync caller 也未送 token）
- **N11**：dead routes：`src/app/[locale]/admin/page.tsx`、`src/app/[locale]/outbound/pack/list/page.tsx` 全 repo 沒任何 link，且用壞掉的 `lang()`

## 未來 push 前要做的

- 拿掉 `.env` 那兩個 auth 修改（生產環境的 mongo / redis 該有 auth）
- 確認所有 schema 改動（`.nullable()`）對 production data 不會引入 null 污染
- `do_create_warehouse.ts` / `do_update_warehouse.ts` 的 sync 推送在 production 環境有沒有 retry / error handling 是另一個議題

## 上下文文件

- `/Volumes/External/其他AI開發/shipitasia_session_summary.md`（也有 .docx 版）— 完整 happy path、13 條 bug、13 類缺失功能
- `~/.claude/projects/-Users-Marco/memory/project_shipitasia.md` — 跨 session 脈絡
- `~/.claude/projects/-Users-Marco/memory/project_shipitasia_eval.md` — 12 軸比較表（候選 A 評分）
