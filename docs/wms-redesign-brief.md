# ShipItAsia WMS — 全站 UI Redesign 設計簡報

> 目的：俾設計師完整理解倉庫操作流程之後，重新設計全套桌面 UI。
> **流程、UX 邏輯、頁面清單已鎖定驗收 — 重設計只動視覺層，不可動流程。**
> 本文重點講「流程接續」：每頁做完之後點樣自動推去下一頁。

---

## 1. 系統一句話

ShipItAsia 係集運 SaaS：客戶寄貨去**日本埼玉倉**，倉庫收貨上架 → 合併裝箱 → 秤重取運單 → 寄去**香港**。WMS 係倉庫員工用嘅操作端（桌面 PC + USB 掃描器為主，另有 PDA 端唔喺今次範圍）。

操作員嘅一日：朝早收貨上架 → 下晝按出庫單揀貨、裝箱、秤重取單、貼單、離站。**全程掃碼驅動，鍵盤 Enter 推進，目標係操作員企喺工作枱前不停手。**

---

## 2. 三種貨件模式（核心概念，全站貫穿）

| 模式 | Badge 顏色 | 有冇 OMS 預報 | 出庫單點嚟 | 裝箱規則 |
|---|---|---|---|---|
| **集運** consolidated | 藍 | 有 | 客戶喺 OMS 自己揀幾件合併開單 | 同客戶同單先可以同箱 |
| **單發** single | 橙 | 有 | 收貨上架嗰刻系統自動開單（一件一單） | 一單一箱，掃到直接自動建箱 |
| **YT 件** | 綠 | **冇** | 系統每日自動維護一張「當日 YT 出庫單」，每件 YT 上架即自動掛入 | 所有 YT 件可以互相 cross 箱，但唔可以同集運/單發混箱 |

YT 件規則：tracking number 以 `YT` 開頭即自動識別；目的地永遠係香港 YT 倉（固定地址）；carrier 用 ShipItAsia 自己嘅系統 Fuuffy 帳號；收貨時**唔使量尺寸**（重量必填）。

模式 badge 喺 Ready 池、裝箱、秤重、印單、離站全部頁面出現，係操作員分流嘅主要視覺線索。

---

## 3. 頁面清單（sidebar 結構）

```
🏠 工作台                /wms                          ← 獨立置頂，唔屬於任何流程
─ 起始流程 ─
   到倉掃描              /wms/operations/arrive
   桌面收貨              /wms/operations/receive
─ 出貨作業 ─
   揀貨批次              /wms/operations/pick-batch
   揀貨完成確認          /wms/operations/pick-confirm
   桌面裝箱              /wms/operations/pack
   秤重取單              /wms/operations/weigh
   桌面離倉              /wms/operations/depart
   重印面單              /wms/operations/label-print   ← 失敗恢復頁，刻意排最尾
─ 管理 ─
   貨架管理              /wms/operations/locations
   無頭件指派            /wms/operations/unclaimed-inbounds
   儲值審核              /wms/admin/topup-requests
```

Sidebar 每項有 badge 數字 = 「呢個 stage 而家有幾多件貨等緊做」。無頭件 badge 紅色（緊急語義），其他灰/默認。

另有列印產物頁（A4 揀貨單、箱 label、invoice）同 PDA 頁面，今次唔使重新設計，但 PDF/列印視覺風格可以一併統一。

---

## 4. 主流程與接續（★ 重點章節）

### 4.1 入庫鏈

```
包裹到倉
   │
   ▼
【到倉掃描】掃 tracking no（唔影相、唔秤重，純分流）
   │
   ├─ 對到預報（集運/單發）→ 標 arrived → banner「前往收件上架」
   ├─ YT 開頭            → 自動建檔（SYS-YT 客戶）→ banner「前往收貨上架」
   └─ 乜都對唔到（無頭件）→ 自動入無頭件池 → banner「前往無頭件指派」
                              （CS 喺指派頁認領俾某客戶後，先返入正常收貨流）
   │
   ▼
【桌面收貨】掃件 → 影相（可選）→ 重量（必填）→ 尺寸（YT 免，其他必填）→ 揀貨架 → 確認上架
   │   每收完一件 soft-reset 連掃下一件；頁底有「待收貨」清單（已到倉未上架，對應 sidebar badge）
   │
   ├─ 集運 → 等客戶喺 OMS 開出庫單（唔會即刻出現喺揀貨）
   ├─ 單發 → 系統即時自動開出庫單 → 直接入 Ready 池
   └─ YT   → 自動掛入當日 YT 出庫單 → 入 Ready 池
```

### 4.2 出庫鏈（happy path）

```
【揀貨批次】Ready 池（status=ready_for_label 嘅出庫單）
   │   勾選 OB → 右側批次草稿panel →「生成揀貨任務」（即時開始，無 draft 狀態）
   │   YT 專屬：綠色「生成 YT 揀貨任務」一鍵打包當日全部 YT 單，唔使勾選
   │
   ├─ 路徑 A：列印揀貨單（紙本）→ 倉庫攞貨 → 去【揀貨完成確認】逐件掃碼核實
   └─ 路徑 B：推送 PDA → 倉庫掃架掃件 → 完成後直接去【桌面裝箱】
   │
   ▼
【揀貨完成確認】（路徑 A 專用）progress bar X/N · 未確認/已確認 兩欄
   │   逐件掃 tracking → 飛去已確認欄
   │   全部確認 → 綠 banner + 底欄 CTA「揀貨完成 · 去裝箱」
   │   → AlertDialog 確認（批次 closed 後不可回頭）→ 自動跳【桌面裝箱】
   │
   ▼
【桌面裝箱】掃件 → 系統按模式俾建議：
   │   單發：大 tag + CTA「入箱 · 自動建箱」（一單一箱唔使揀）
   │   集運：列出同客戶同模式嘅開緊箱 → 主 CTA「確認入 BOX-xxx」/「開新箱」
   │   YT：任何 YT 箱都得
   │   桌面清單清零 → 底欄 CTA「完成裝箱 · 去秤重取單」
   │   → AlertDialog（自動封晒開緊箱、空箱取消、出庫單推 packed）→ 自動跳【秤重取單】
   │
   ▼
【秤重取單】掃第一箱開 session（session 鎖死「同客戶＋同目的地」一組）
   │   逐箱：掃箱 barcode → 入重量（磅秤 live 或手動）→ 箱 chip 變已秤
   │   右側隊列：下一輪等緊秤嘅組；同組可加入嘅箱會綠色 highlight「可加入當前組」排最頂
   │   組內全部箱秤完 + 冇其他可加入 → ★ 自動彈 AlertDialog「確認取單 · ↵」
   │   → call carrier API 取運單：
   │
   ├─ ✅ 成功 → 新分頁自動彈出合併面單 PDF（即印即貼）
   │            + 綠 banner「取單成功 · 面單已彈出列印」（有「再印一次」link 防 popup 被擋）
   │            + 出庫單推 label_printed → 入離站隊列
   │
   └─ ❌ 失敗 → 紅 banner 顯示錯誤原因 +「前往面單列印 →」按鈕
                + 出庫單跌入【重印面單】頁（status: pending_client_label / held）
   │
   │   全部組取單完 → 底欄 CTA「下一步 · 離站掃描」＋ 左側紅色「重試運單」（去重印面單）
   ▼
【桌面離倉】今日箱清單 + 雙掃配對卡：
   │   STEP 1 掃箱 label → STEP 2 掃 3PL 運單 label → 配對成功 → 箱 departed
   │   配對規則：同一客戶嘅運單 label 可以互換貼；cross-merchant 即彈錯
   │   全部箱配對完 → 全頁綠色慶祝卡「今日所有箱都已離站」
   │   → 底欄 CTA「流程完成 · 返工作台」
   ▼
【工作台】
```

### 4.3 接續解鎖表（每頁完成條件 → CTA → 去向）

| 頁面 | 完成條件 | 解鎖 CTA 文案 | 去向 |
|---|---|---|---|
| 到倉掃描 | 無（連續作業） | banner 內 link 按分流 | 收貨 / 無頭件指派 |
| 桌面收貨 | 待收清單清零 | 下一步 · 建立揀貨批次 | 揀貨批次 |
| 揀貨批次 | 有批次生成 | 雙 CTA：實體單揀貨→揀貨完成確認 ／ PDA 揀貨→桌面裝箱 | — |
| 揀貨完成確認 | 批次全件已掃 | 揀貨完成 · 去裝箱（dialog 確認） | 桌面裝箱 |
| 桌面裝箱 | 桌面清零 | 完成裝箱 · 去秤重取單（dialog 確認） | 秤重取單 |
| 秤重取單 | 全部組取單完 | 下一步 · 離站掃描 ＋ 重試運單（紅，左） | 桌面離倉 ／ 重印面單 |
| 桌面離倉 | 今日箱全配對 | 流程完成 · 返工作台 | 工作台 |
| 重印面單 | —（恢復頁） | 下一步 · 離站掃描 | 桌面離倉 |

### 4.4 失敗分支：重印面單（recovery surface）

只有取單失敗先會嚟呢頁。內容：
- 4 個 KPI：等列印組 / 已印等攬收 / 已安排攬收 / 取單失敗
- 按組列表（1 組 = 1 客戶同目的地；YT 全部共 1 組）：模式 badge、客戶·目的地、箱號 chips、總重、carrier、狀態 pill、動作
- 取單失敗嘅組：**一個**紅色「重新取單 · N 箱未有面單」按鈕（一 click retry 全組）
  - 成功 → toast + 自動彈 PDF + 單推 label_printed 入離站
  - 失敗 → 紅 error bar 顯示邊張單咩原因
- 已印嘅組：checkbox 勾選 → 浮出品牌色 action bar「安排攬收 (N 組)」→ call courier API 預約，系統按 carrier 自動分批
- 頂部 scan bar：掃 pallet barcode 快速定位組

### 4.5 YT 全程差異速查

1. 到倉：`YT` 開頭自動建檔，無預報
2. 收貨：免尺寸、免相（重量必填）；上架即自動掛入當日 YT 出庫單
3. 揀貨：綠色一鍵「生成 YT 揀貨任務」
4. 裝箱：YT 件互通 cross 箱；同集運/單發混箱會被 server 擋（`PACK_YT_NO_MIX`）
5. 秤重取單：同一目的地（YT 香港倉）所以一定全部同組一齊取單；carrier 帳號用系統自己嗰個
6. 印單/離站：同普通流程一樣；print 頁顯示為「ShipItAsia YT」一組

---

## 5. 全局互動骨架（★ 不可改，可以重新着衫）

### 5.1 Scanner bar
每個操作頁主角。紅點 + `SCAN` 字樣 + placeholder 提示掃乜；autofocus；Enter 提交；掃完顯示 echo（上一個掃咗乜）。操作員大部分時間望住佢。

### 5.2 NextCTA 底欄（每頁固定 bottom bar）
- 左：← 返回上一站 link ＋ 進度 counter（done/total）
- 右：主 CTA 按鈕，三種狀態：
  - **locked** 灰：顯示 lockedHint（例「仲有 3 件未入箱」）
  - **urgent** 橙：有嘢等緊做（脈衝動畫）
  - **ready** 綠：完成條件達成 → 背景變綠色漸變、主按鈕 pulse、按鈕內有 `↵` 鍵提示，**撳 Enter 即跳下一頁**
- 可以有 extras 位（例如秤重頁嘅紅色「重試運單」副按鈕）

### 5.3 自動彈窗接續
Stage 完成嗰刻系統主動彈 AlertDialog（唔使操作員去揾按鈕）：
- 秤重：組內全箱秤完自動彈「確認取單 · ↵」，Enter 即取單
- 揀貨確認 / 裝箱完成：撳 CTA 後彈確認 dialog，講明後果（不可回頭），確認後 router 自動跳下一頁
Dialog 嘅確認按鈕 default focus，Enter 直接過。

### 5.4 出貨流程 Stepper
出貨作業每頁頂部有 5 步 stepper：`揀貨 → 裝箱 → 秤重取單 → 印單 → 離站`，當前步 highlight，行過嘅步打✓。

### 5.5 Toast / Banner 語義
- 綠 toast：單件動作成功（「YT121 上架到 A001 ✓」「BOX-xxx 已離站 · 配對成功」）
- 綠 banner（大）：stage 級成功（取單成功）
- 紅 banner：可恢復錯誤，一定帶下一步指引（「請去面單列印頁再試」）
- 黃 banner / 卡：規則提示（連續掃描規則）、進行中 session

---

## 6. 狀態色與組件語義

| 語義 | 現用色 | 用喺 |
|---|---|---|
| ok 綠 | 完成、成功、YT badge | pill / banner / 進度 |
| warn 橙 | 進行中、單發 badge、urgent | pill / NextCTA urgent |
| danger 紅 | 失敗、異常、緊急 badge | banner / 重試按鈕 / 無頭件 |
| info 藍 | 集運 badge、提示 | pill / 規則 banner |
| brand | 品牌主色 | 主 CTA、選中態、攬收 action bar |
| muted 灰 | 未開始、次要 | pill / 空狀態 |

組件清單：Pill（8 色 chip）、ModeBadge（集運藍/單發橙/YT綠）、KPI 卡（icon + 大 mono 數字 + label + sub）、Stepper、Scanner bar、NextCTA、AlertDialog、Toast、table（檔案級列表）、box chip（箱狀態粒）、進度條。

ID 類（tracking no / OUT- / BOX- / 批次號）全部用 monospace 字體 — 操作員要同實物條碼對讀，呢個要保留。

---

## 7. 工作台（儀錶板）

獨立於流程嘅指揮室，30 秒自動刷新：

1. **階段看板** — 7 張卡：待收貨 / 待揀貨 / 揀貨中 / 裝箱中 / 秤重取單 / 待離站 / 補單異常。每張：icon + 大數字 + 單位（件/單）+ hint，有貨 = active 色、異常 = 紅。**click 直接跳入該站** — 係操作員每朝嘅入口。
2. **出貨吞吐表** — 4 指標 × 3 時間窗：到倉收貨(件) / 出貨離站(單) / 離站箱數(箱) / 取單成功(張) × 今日 / 7日 / 30日
3. **近 7 日趨勢** — 雙 bar（到倉藍 vs 離站綠），今日 highlight
4. **即時出貨漏斗** — 5 段橫 bar，睇貨堆喺邊個 stage（bottleneck 一眼睇）
5. **異常佇列** — held / 取單失敗嘅單，顯示卡咗幾耐（<1小時 / N小時 / N日），click 去重印面單

---

## 8. 每頁需要設計嘅狀態

- 空狀態：「今日仲未有批次」「queue 已空」「無待離站箱」「冇異常 · 全部單正常流轉」
- Loading：skeleton（工作台已有）
- 掃描錯誤：紅 inline bar（「此件不在該揀貨批次」「掃到唔同組會即時停止」「已掃過」）
- Stage 完成慶祝：離站全綠卡（✓ 大圓 + 「今日所有箱都已離站」）
- Popup 被擋 fallback：「再印一次」文字 link
- Dialog：危險確認（不可回頭）vs 普通確認

---

## 9. 場景約束（設計時記住）

- 解像度 1280–1536 桌面為主；倉庫環境光，唔可以低對比
- 操作員**企喺度**用，距離螢幕 50–100cm — 關鍵狀態（進度、成功/失敗、模式 badge）要一米外可讀
- 長時間使用：唔可以大面積刺眼色，但狀態轉變要夠搶眼
- 雙手經常拎住貨/掃描器 — 滑鼠係次要輸入，鍵盤 Enter 流程係主軸
- 語言 zh-HK（廣東話文案已寫好，直接沿用）

---

## 10. 已知設計機會（可選，唔係需求）

1. 攬收安排目前喺重印面單頁；業務意圖係「當日全部箱離站完 → 喺離站頁直接安排攬收」— 設計時可以喺離站完成卡預留呢個 CTA 位
2. Stepper 第 4 步「印單」喺 happy path 已併入秤重取單（取單成功即印），可考慮 stepper 改 4 步：揀貨 → 裝箱 → 秤重取單 → 離站，「重印面單」作為支線唔入主 stepper
3. 工作台階段看板同 sidebar badge 數據同源 — 視覺上可以做關聯呼應
