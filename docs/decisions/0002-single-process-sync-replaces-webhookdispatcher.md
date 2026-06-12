# 0002 — Single-process in-process sync replaces WebhookDispatcher discipline

- **Date**: 2026-06-11
- **Phase**: cross-cutting (architecture)
- **Status**: Accepted

## Context

`CLAUDE.md` 紀律死守 #4：

> OMS↔WMS sync 走 WebhookDispatcher（B2）：HMAC + retry 3 + 寫
> `webhook_outward_logs`

呢條紀律繼承自 Fuuffy 借鏡（[fuuffy_lessons_for_shipitasia.md](../../shipitasia_md/) §B2），原意係保證 OMS 同 WMS **兩個獨立 process** 之間嘅 sync 唔會 silent fail：HMAC 防偽造、3 retry 防瞬斷、`webhook_outward_logs` 留 audit trail。

v1 落地時架構**已經唔同**：

1. `oms/` Next.js app（port 3002）將原本喺 `wms/`（port 3001）嘅 WMS 員工介面**寄住**入嚟，用 URL prefix `/zh-hk/wms/...` 同 `/zh-hk/oms/...` 分流（commit 5458643 "Split UI into 3 contexts: OMS / WMS / PDA via URL prefix"）。
2. 雖然兩個 Mongo DB（`vw_sms` / `vw_wms`）保留咗，但**單一 Next.js process** 同時連兩個 DB；WMS 動作要影響 OMS state 時，係**直接 in-process function call**（例：`pickByTracking` 喺 wmsFlow.ts 直接寫 `vw_sms.outbound_requests`）—— 唔需要 HTTP webhook 自己叫自己。
3. `WebhookDispatcher` service、`webhook_outward_logs` collection、HMAC 簽名/驗證 helper **整個 codebase 都冇 implement**（2026-06-11 grep 驗證）。`wms/` 獨立 service 因為冇實際 serve traffic（dev server 啟動只起 `oms/`）暫時當 vestigial 處理。

呢個 drift 喺 2026-06-11 新機驗收 happy path walkthrough 時被 catch 到（agent acb3b69 spawn 行 7-stage 流程），需要明確記低否則新人睇 `CLAUDE.md` 會以為應該寫一個唔需要嘅 dispatcher。

## Decision

**v1 範圍正式接受 single-process in-process sync 取代 WebhookDispatcher 紀律。** 原紀律 #4 嘅 3 個保證以下面方式重新對齊：

| WebhookDispatcher 原意 | v1 single-process 對應 |
|---|---|
| **HMAC 簽名 + 驗證** 防偽造 | 唔適用 — in-process call 冇 untrusted boundary。`/api/wms/utils/sync` 嘅 token 驗證（Bug 7）仍然要做（如果保留呢 endpoint 供 PDA / external 用） |
| **3 retry + 0.5s backoff** 防瞬斷 | 唔適用 — in-process function throw 上 stack，error 即時 surface。事務一致性靠 mongo session.withTransaction（已用喺 palletLabelService、scan-service 等）|
| **`webhook_outward_logs` audit** | **轉用 `audit_logs`**（紀律 #6，已實作）+ `outbound_action_logs` / `inbound_scans` / `outbound_scans` 動作快照子集合（紀律 #3）。每個業務動作以 enum action + 結構化 details 留 trace |

`CLAUDE.md` 紀律 #4 嘅描述本身**唔改**（v2 multi-process 拆 service 時可能會重新需要），但所有 reviewer 應該對住呢條 ADR 解讀：

- v1 dev/staging：**唔需要、亦不應該寫** `WebhookDispatcher`、`webhook_outward_logs` collection、HMAC helper。
- v1 violating signal：發現有 file 嘗試實作上述 → ADR 反向命中，應 reject + 引返 in-process call。
- 業務動作仍然要寫 `audit_logs`（紀律 #6 不退讓）。
- 動作快照子集合（紀律 #3 不退讓）。

## Consequences

**正面**：

- 開發速度快咗（少咗一層 HTTP overhead + 簽名/驗證 boilerplate）
- Debug 易（stack trace 直通，唔使 grep `webhook_outward_logs` 拼錯誤碼）
- 事務一致性可以用 mongo session，唔使應對 dispatcher 嘅 partial-success 失敗模式

**反面 / 風險**：

- v2 拆 service 時要重新引入 dispatcher（已有 ADR-0001 提及 deferred client list UI 等到 P2/P7 WebhookDispatcher 落地 — **呢條 ADR 同時推遲咗 ADR-0001 嘅前提**，client list UI 嘅 deferred 條件需要重新評估）
- 紀律 #4 嘅字面 vs 實際偏差，新 contributor 對 `CLAUDE.md` 嘅信任度受損。`CLAUDE.md` 應該 link 過嚟呢條 ADR 做 erratum

**Follow-up**：

- 更新 `CLAUDE.md` 紀律 #4 加 footnote 指向呢條 ADR
- ADR-0001 嘅 deferred 條件（「等到 P2 + P7 WebhookDispatcher landed」）需要重新評估 — WMS client list UI 而家可以直接 in-process query `vw_sms.clients`，唔受原本 cross-DB 限制（因為 single process）

## Alternatives considered

1. **照住紀律 #4 寫 WebhookDispatcher self-call** — 寫 OMS 嘅 service call OMS 自己嘅 HTTP endpoint，net 效果只係多咗 HTTP round-trip + 簽名/驗證 boilerplate + 一個唔需要嘅 collection。否決原因：純 overhead，零 value。
2. **Pre-emptive 拆 service** — 提早 split `wms/` 做獨立 Next.js process，HTTP webhook 真係跨 process。否決原因：v1 範圍不容許嘅工程量；客戶 demo / staging 用唔住雙 service deployment。
3. **保留紀律 #4 字面、但 disable 喺 v1** — 寫 `dispatcher.dispatch()` 變 no-op stub。否決原因：違反紀律 #1（不寫 silent stub）。

## References

- [docs/decisions/0001-defer-wms-admin-clients-ui.md](./0001-defer-wms-admin-clients-ui.md)
- Memory: `feedback_verify_against_brief.md`（驗收時 catch 到呢條 drift 嘅 process）
- Commit 5458643: "Split UI into 3 contexts: OMS / WMS / PDA via URL prefix"
- Memory: `reference_fuuffy_context.md` §B2 原 lesson
