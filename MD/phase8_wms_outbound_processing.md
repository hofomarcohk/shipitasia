# Phase 8：WMS 倉內出庫流程 — 揀貨 + 裝箱 + 複重 + 客戶取運單 + 貼 label + 離倉

> 集運 OMS+WMS v1 開發規格
> 版本：v1.0
> 日期：2026-05-08
> 範圍：WMS 倉內 4 階段（揀貨 / 裝箱 / 複重 / 離倉）+ 客戶 OMS 主導取 label + carrier label adapter 完整實作 + multi-box outbound + 修 ShipItAsia Bug 2/3/4/5/6
> 前置：Phase 1-7 已完成。Phase 7 v1.1 carrier service abstract + mock label adapter 已建（pdfService.generateMockLabel）；Phase 7 對齊「全託管 vs 出貨前確認」分流邏輯，Phase 8 重新框定為「single 直發強制 auto / consolidated 預設 confirm_before_label」+ auto 模式失敗降級到 pending_client_label
> 業務地位：v1 完整出貨閉環的最後 phase（Phase 8 完成 = 客戶可走完從預報到收件全流程）
> 前提共識（業主決策）：
> - 4 階段：揀貨 → 裝箱 → 複重 → 離倉（不做 palletize）
> - 揀貨 PDA / 桌面雙路徑、PDA 揀完通知去桌面裝箱
> - 裝箱走桌面（多 inbound 集進大箱號）
> - 複重 PDA / 桌面雙路徑（前 2 步），客戶取 label 強制走 OMS（第 3 步）
> - 離倉 PDA 逐箱掃裝箱號，全箱掃完才 outbound departed
> - **取 label 主導權回歸客戶**（重大修改 Phase 7 對齊）
> - 路線 1（single 直發 / 全託管）：複重通過 → 系統自動 trigger label，失敗降級到 pending_client_label
> - 路線 2（consolidated）：複重通過 → status=pending_client_label → 等客戶手動取 label
> - 取 label 後不可取消（必 admin 介入）
> - 兩個工作天 SLA：客戶不點 [Generate Label] / 自動取 label 失敗 → CS 在 2 工作天內處理

---

## 0. 前設

### 0.1 v1 業務參數（沿用 Phase 3-7）

| 項目 | v1 設定 |
|---|---|
| 全局幣別 | HKD |
| 處理費單價 | HKD$5 / 包（receive 階段已扣，Phase 8 不再扣）|
| 入庫地 | 日本（v1 一個倉：埼玉）|
| 收貨地 | 香港 / 客戶指定 |
| 出庫運費 | **不收**（客戶用自己 carrier 帳號付）|
| v1 carrier | 雲途（API key）+ Fuuffy（OAuth）|

### 0.2 業務量假設

v1 上線半年內 ≤ 50 客戶。每天 5-10 筆出庫，每單平均 1-3 箱 → 每天 5-30 箱物理動作。設計考量：
- 揀貨 / 複重不需要排程系統（員工看清單手動拿）
- carrier API call 量不高（每箱 1 次取 label + 1 次 cancel 罕見）
- 沒有 cron 自動推進（事件驅動 + WMS dashboard banner）

### 0.3 範圍

**包含**：

- 揀貨流程（PDA + WMS 桌面雙路徑共用 service）
  - PDA 逐件 scan（locationCode + inbound 條碼）
  - WMS 桌面批次清單 visual confirm
  - PDA 揀完同單通知「請往電腦端裝箱」
- 裝箱流程（WMS 桌面 only）
  - 創箱號（B-{outbound_id 後段}-NN）
  - 多 inbound 集進大箱、一單多箱、多單合一箱
  - 員工填每箱 dimensions + weight_estimate
- 複重流程（PDA + WMS 桌面雙路徑共用 service）
  - Step 1：每箱毛重 vs (上架重量 + 員工填皮重) 比對
  - Step 2：箱數清點（系統依裝箱階段紀錄 vs 實際量到的箱數）
  - 重量差 ≥ 0.5kg 警告 + 員工點確認通過（無需理據）
  - 箱數對不上必擋
  - 通過 → 推 OMS 推送箱級資訊（dimensions / weight / 重新 rate quote）
- 取 label 流程（OMS 客戶主導）
  - 路線 1（single 直發 / processing_preference=auto）：複重通過後系統 0 秒內自動 trigger
  - 路線 2（consolidated / processing_preference=confirm_before_label）：客戶手動 [Generate Label]
  - 失敗降級：路線 1 trigger 失敗 → status=pending_client_label + 客戶手動處理
  - pre-flight check（餘額閘 / capacity check / carrier credentials 有效性）
  - capacity 違規純警告 + 提示客戶聯絡 CS
  - 失敗 retry：客戶端 retry / admin 後台代客戶取
  - mock + Yun Express + Fuuffy adapter 的 getLabel 完整實作
  - multi-box：每箱一張 label PDF + 一個 tracking_no
- 貼 label 流程（WMS 桌面）
  - 員工列印 label → 貼上每箱
  - 點 [貼 label 完成] 寫 audit
- 離倉流程（PDA only）
  - 員工逐箱掃裝箱號
  - 全箱掃完 → outbound.status=departed
  - 通知客戶 type=outbound_departed
- carrier API adapter 完整實作（Phase 7 預留 getLabel + 新增 cancelLabel）
  - mock 沿用 Phase 7 §1.7.6 pdfService.generateMockLabel
  - mock 強化：失敗模擬 4 種 error type、PDF 動態生成（per box）
  - prod 準備：雲途 + Fuuffy adapter getLabel 串接點（v1 dev 仍走 mock）
- 修 Bug 2 / 3 / 4 / 5（OMS↔WMS departure status sync 鏈式 bug）
- 驗證 Bug 6 修法（pick 不污染 item_locations.locationCode）
- WMS dashboard banner（待客戶取 label 超 2 工作天）
- admin 後台 retry / cancel label / 強制 outbound 取消（label_obtained 後）
- Phase 7 同步更新 v1.2（status 流轉 / 取消條件 / processing_preference 語意）

**不包含**：

- 棧板化 palletize（業主決策取消）
- carrier webhook 接收 tracking 更新（Phase 9）
- carrier rate variance 自動退款 / 補費（v1 業務模型不收運費）
- 拆箱重組 UI（罕見場景，admin 後台 SQL 處理）
- box 級客戶 cancel UI（v1 admin 後台處理）
- 物理銷毀 SOP（業務範圍）
- 跨倉合併（v1 一倉）
- 自動 cron expiry（v1 純 banner + CS 介入）
- 員工分權 UI（沿用 Phase 5 reuse admin 帳號）
- 真實 carrier label API 對接（v1 dev 全 mock，prod 上線前才切）

### 0.4 技術棧

完全沿用 Phase 1-7 已建。新增：

- env flag `PHASE8_USE_MOCK_CARRIER`：dev / staging 走 mock（**v1 default true**），prod 走真實
- Phase 7 §1.7.6 pdfService 擴展：支援 multi-box label 生成
- carrier adapter 補完整 getLabel + cancelLabel method（Phase 7 已預留 interface）
- mongo session transaction（揀貨 / 裝箱 / 複重 / 取 label 跨 collection 寫入）
- Phase 5 inbound_scans 跟 Phase 8 outbound_scans 互不重疊（職責邊界明確）

### 0.4.1 v1 Mock 策略（沿用 Phase 2 / 7）

| env flag | dev/staging | prod |
|---|---|---|
| `PHASE2_USE_MOCK_OAUTH` | true | false |
| `PHASE7_USE_MOCK_CARRIER` | true | false |
| `PHASE8_USE_MOCK_CARRIER` | **true** | false |
| `PHASE9_USE_MOCK_WEBHOOK` | true | false |

mock 行為策略：

- **getLabel 走 (b) 動態生成**：用 pdfkit 動態產 A6 size PDF，含 `[MOCK]` 警告 + box_no / tracking_no / 收貨地址 / 重量
- **每箱獨立 label**：multi-box outbound 產生 N 張 mock label，每張不同 mock tracking
- **Mock tracking 格式**：`MOCK-{carrier_code}-{outbound_id}-BOX{n}` 例：`MOCK-yun_express-OUT-20260508-0001-BOX1`
- **Mock cancelLabel**：純 stub return success，pdf 不刪（保留 audit）
- **失敗模擬 4 種 error type**：rate_limit / server_error / auth_failed / capacity_violation
- **prod 切換**：所有 phase 完成 + 業主驗收通過 + 上 prod 前一次切

mock 階段資料**不能** migrate 到 prod（沿用 Phase 2 §8.1.1）。

### 0.5 UI 設計風格

完全沿用 ShipItAsia 既有 + Phase 4-7 慣例。新增頁面：

| 路徑 | 形態 | 場景 |
|---|---|---|
| `/zh-hk/scan/pick` | PDA-first | 揀貨（PDA 路徑）|
| `/zh-hk/operations/pick` | Desktop-first | 揀貨（桌面批次清單）|
| `/zh-hk/operations/pack` | Desktop-first | 裝箱頁（沿用 ShipItAsia 既有改造）|
| `/zh-hk/scan/weigh` | PDA-first | 複重（PDA 路徑）|
| `/zh-hk/operations/weigh` | Desktop-first | 複重（桌面批次）|
| `/zh-hk/operations/label-print` | Desktop-first | 員工列印 label / 貼箱完成 |
| `/zh-hk/scan/depart` | PDA-first | 離倉掃箱 |
| `/zh-hk/operations/outbound-list` | Desktop-first | 既有 admin 看 outbound 列表（Phase 7 read-only，Phase 8 加操作 UI）|

OMS 端：

| 路徑 | 形態 | 說明 |
|---|---|---|
| `/zh-hk/outbound/[id]/confirm-label` | 既有改造 | Phase 7 §1.9 此頁原 confirm_before_label 專屬，Phase 8 變成所有路線通用，UI 依 processing_preference + held_reason 動態 framing |
| `/zh-hk/outbound/[id]` | 既有 Phase 7 | 加箱級資訊顯示（複重後）+ tracking 列表 |

---

## 1. 業務流程

### 1.1 兩條路線總覽

```
                     ┌─────────────────────────────┐
                     │  outbound.status=ready_for_label │
                     │  (Phase 7 結尾狀態)             │
                     └─────────┬───────────────────┘
                               │
                          【Phase 8 接手】
                               │
                  ┌────────────┴───────────────┐
                  │                            │
            Stage 5 揀貨                Stage 5 揀貨
            (PDA)                       (WMS 桌面)
                  │                            │
                  └────────────┬───────────────┘
                               │
                       Stage 6 裝箱（桌面 only）
                       創箱號 + 集件
                               │
                  ┌────────────┴───────────────┐
                  │                            │
            Stage 7 複重 step1+2          Stage 7 複重 step1+2
            (PDA)                         (WMS 桌面)
                  │                            │
                  └────────────┬───────────────┘
                               │
                    複重通過 推 OMS 推箱級資訊
                               │
                       outbound.status=weight_verified
                               │
                  ┌────────────┴───────────────┐
                  │                            │
       processing_preference=auto    processing_preference=confirm_before_label
                  │                            │
       系統自動 trigger label        status=pending_client_label
       (Phase 8 系統替客戶按)        (等客戶手動點)
                  │                            │
            ┌─────┴──────┐              客戶 OMS [Generate Label]
            │            │                     │
         成功         失敗                     │
            │            │                     │
            │  status=pending_client_label    │
            │  + held_reason 標明失敗         │
            │  客戶手動處理                    │
            │            │                     │
            │            └──────┬──────────────┘
            │                   │
            └───────┬───────────┘
                    │
              status=label_obtaining
                    │
              carrier API call
                    │
              status=label_obtained
                    │
              Stage 7 step 3：員工列印 label / 貼箱
              (WMS 桌面 only)
                    │
              status=label_printed
                    │
              Stage 8 離倉
              員工 PDA 逐箱掃裝箱號
                    │
              全箱掃完
                    │
              status=departed
                    │
              通知客戶 outbound_departed
```

### 1.2 路線重新框定（vs Phase 7 對齊）

#### 1.2.1 路線 1：single 直發（全託管）

- 觸發：客戶在 Phase 4 預報時選 `shipment_type='single'` + `single_shipping`（carrier + 收貨地址預填）
- Phase 5 receive 後 Phase 5 §5.7 既有觸發 outboundService.autoCreateForSingle 自動建 outbound
- outbound 自動建立時：
  - shipment_type='single'
  - **processing_preference 強制='auto'**（業主對齊 Q4：single 強制 auto，UI 不顯示偏好選項）
  - 沿用 Phase 5 既有 from_inbound_id reference
- Phase 8 範圍：
  - 倉庫員工 pick → pack → weigh
  - 複重通過後系統 0 秒內自動 trigger label（不延遲，不給客戶反悔時間 — 業主對齊 Q3）
  - 失敗 → 降級到路線 2 的 pending_client_label step

**客戶介入點**：1 次（預報 inbound 時選 single 直發）

#### 1.2.2 路線 2：consolidated 集貨（客戶主導）

- 觸發：客戶在 Phase 7 主動建合併 outbound（多 inbound 集成一單）
- processing_preference 由客戶建單時選擇（default 看 client.preferences；雙模式都可）
  - `auto` = 全託管 = 系統替客戶按 Generate Label（複重通過後 0 秒內自動 trigger）
  - `confirm_before_label` = 出貨前確認 = 客戶手動點 Generate Label
- Phase 8 範圍：
  - 倉庫員工 pick → pack → weigh（同路線 1）
  - 複重通過後依 processing_preference 分流
  - auto 失敗 → 降級到 confirm_before_label 流程

**客戶介入點**：3 次（預報 inbound / 建 outbound / 確認取 label，confirm_before_label 模式下；auto 模式下 2 次）

### 1.3 Stage 5：揀貨（PDA + WMS 桌面雙路徑）

#### 1.3.1 PDA 揀貨流程

路徑：`/zh-hk/scan/pick`

```
[PDA 揀貨頁 - 380px wide]
═══════════════════════════════════
警示 banner（如有）：
┌──────────────────────────────────┐
│ ℹ️ 待裝箱清單：N 筆已揀完，請至桌面端 │
│ [看清單]                         │
└──────────────────────────────────┘

═ 揀貨動作 ═

1. 選 outbound（dropdown 顯示 status=ready_for_label / picking 的）
   或掃 outbound_id 條碼

2. 顯示此 outbound 待揀清單（已揀打勾）：
   [✅] I-20260508-0001 / 庫位 A001 / 2.5kg
   [⬜] I-20260508-0002 / 庫位 A005 / 1.2kg
   [⬜] I-20260509-0003 / 庫位 B003 / 3.0kg

3. 員工依清單去倉庫拿貨

4. 掃 / 輸入 庫位 locationCode
   [text input, autofocus]

5. 掃 / 輸入 inbound 條碼（trackingNo or inbound_id）
   [text input]

6. 系統 atomic 驗證：
   - inbound 屬於當前選中 outbound
   - inbound.status=received（未被揀過）
   - item_locations.itemCode=I-...、locationCode=員工掃的、currentStatus='in_storage'

7. 驗證通過 → 系統執行：
   - item_locations: currentStatus='in_storage' → 'picked'
     **不改 locationCode**（驗證 Bug 6 修法）
   - 寫 outbound_scans type='inbound_picked'
   - inbound_request 主檔 status: received → picking
   - outbound 主檔 status: ready_for_label → picking（首次揀觸發）

8. 系統判斷：此 outbound 全部 inbound 是否都已 picked
   ├── 是 → outbound.status: picking → picked
   │     寫 outbound_scans type='outbound_pick_complete'
   │     **PDA 跳通知 Modal**：
   │       「OUT-... 已揀完！請往電腦端裝箱」
   │       [前往桌面端] [繼續揀別單]
   │     **WMS 桌面「待裝箱」清單即時刷新**（websocket 替代方案：純 polling 30 秒）
   │
   └── 否 → 繼續揀下一件

9. 員工繼續：回 step 4（連續模式）
```

#### 1.3.2 桌面揀貨流程（批次清單 visual confirm）

路徑：`/zh-hk/operations/pick`

```
[桌面揀貨頁 - 1280px wide]
═══════════════════════════════════════════════════════════════

╔═ 待揀清單（左 60%）═══════════════════════════════╗ ╔═ 已揀完（右 40%）═════╗
║                                                       ║ ║                       ║
║ Filter: [client ▼] [outbound ▼]                      ║ ║ 本 session 已揀:       ║
║                                                       ║ ║                       ║
║ ☐ outbound OUT-20260508-0001 / ABC Trading           ║ ║ OUT-20260507-0005     ║
║   ☐ I-001 / 庫位 A001 / 2.5kg                        ║ ║   3 筆 inbound        ║
║   ☐ I-002 / 庫位 A005 / 1.2kg                        ║ ║   16:30 完成          ║
║   ☐ I-003 / 庫位 B003 / 3.0kg                        ║ ║                       ║
║   [✅ 全部勾選] [全部揀完，去裝箱]                     ║ ║ OUT-20260508-0002     ║
║                                                       ║ ║   1 筆 inbound        ║
║ ☐ outbound OUT-20260508-0003 / DEF Co                ║ ║   16:45 完成          ║
║   ☐ I-005 / 庫位 A002 / 4.0kg                        ║ ║                       ║
║   ...                                                 ║ ║                       ║
║                                                       ║ ║                       ║
╚══════════════════════════════════════════════════════╝ ╚═══════════════════════╝

員工 UX：
1. 先看清單，決定要揀哪幾單（可多 outbound 並行）
2. 拿筐 / 推車去倉庫照清單拿貨堆桌邊
3. 逐個或一次勾選 inbound checkbox
4. 點 [全部揀完，去裝箱] → 提交此批

桌面 vs PDA：
- 桌面靠 visual list confirm（不掃條碼）
- PDA 靠 scan 條碼 + locationCode
- 兩種寫到同一個 outbound_scans collection，type='inbound_picked'，但 pick_method 不同
```

#### 1.3.3 桌面提交動作

```typescript
async function clientPickByDesktop({ outbound_id, inbound_ids, staff_id }) {
  const session = await mongoose.startSession();
  
  await session.withTransaction(async () => {
    // 1. atomic 驗證 outbound + inbounds
    const outbound = await OutboundRequest.findOne({
      _id: outbound_id,
      status: { $in: ['ready_for_label', 'picking'] },
    }, null, { session });
    if (!outbound) throw new Error('OUTBOUND_NOT_AVAILABLE_FOR_PICK');
    
    // 驗證所有 inbounds 屬於此 outbound 且 status=received（未被揀）
    const links = await OutboundInboundLink.find({
      outbound_id,
      inbound_id: { $in: inbound_ids },
      unlinked_at: null,
    }, null, { session });
    if (links.length !== inbound_ids.length) throw new Error('SOME_INBOUNDS_NOT_LINKED');
    
    const inbounds = await InboundRequest.find({
      _id: { $in: inbound_ids },
      status: 'received',
    }, null, { session });
    if (inbounds.length !== inbound_ids.length) throw new Error('SOME_INBOUNDS_ALREADY_PICKED');
    
    // 2. update item_locations + inbound_request status
    for (const inbound of inbounds) {
      await ItemLocation.updateOne(
        { itemCode: inbound._id, currentStatus: 'in_storage' },
        { 
          currentStatus: 'picked',
          // **不改 locationCode**（Bug 6 修法）
          lastMovedAt: new Date(),
        },
        { session }
      );
      
      await InboundRequest.updateOne(
        { _id: inbound._id },
        { status: 'picking' },
        { session }
      );
      
      // 寫 outbound_scans
      await OutboundScan.create([{
        _id: await generateOutboundScanId(),
        outbound_id,
        inbound_id: inbound._id,
        type: 'inbound_picked',
        operator_staff_id: staff_id,
        pick_method: 'desktop_batch',
      }], { session });
    }
    
    // 3. outbound status: → picking
    await OutboundRequest.updateOne(
      { _id: outbound_id, status: 'ready_for_label' },
      { status: 'picking' },
      { session }
    );
    
    // 4. 判斷是否全部揀完
    const allLinks = await OutboundInboundLink.find({ outbound_id, unlinked_at: null }, null, { session });
    const pickedInbounds = await ItemLocation.find({
      itemCode: { $in: allLinks.map(l => l.inbound_id) },
      currentStatus: 'picked',
    }, null, { session });
    
    if (pickedInbounds.length === allLinks.length) {
      // 全部揀完 → outbound.status: picking → picked
      await OutboundRequest.updateOne(
        { _id: outbound_id, status: 'picking' },
        { status: 'picked' },
        { session }
      );
      
      await OutboundScan.create([{
        _id: await generateOutboundScanId(),
        outbound_id,
        type: 'outbound_pick_complete',
        operator_staff_id: staff_id,
      }], { session });
    }
    
    // 5. 寫 outbound_action_logs
    await OutboundActionLog.create([{
      outbound_id,
      action: 'picking_progress',
      operator_type: 'wms_staff',
      operator_id: staff_id,
      details: { picked_count: pickedInbounds.length, total: allLinks.length, method: 'desktop_batch' },
    }], { session });
  });
}
```

#### 1.3.4 揀完通知去桌面裝箱

PDA 揀完最後一件 → 系統判斷 outbound 全揀完 → PDA 跳 Modal：

```
[PDA Modal]
┌────────────────────────────────┐
│ 🎉 OUT-20260508-0001 已揀完！    │
│                                  │
│ 共 3 件 inbound，請至電腦端進行  │
│ 裝箱動作：                        │
│                                  │
│ /zh-hk/operations/pack            │
│                                  │
│ [前往桌面端] [繼續揀別單]         │
└────────────────────────────────┘
```

員工 UX：
- [前往桌面端] → PDA 顯示 QR code 含桌面 URL（不切裝置，員工自己換）
- [繼續揀別單] → Modal 關閉，PDA 回 outbound 選擇步驟

桌面端「待裝箱」清單頁 polling 30 秒刷新，揀完的 outbound 會出現。

### 1.4 Stage 6：裝箱（WMS 桌面 only）

#### 1.4.1 裝箱頁 UI

路徑：`/zh-hk/operations/pack`

```
[裝箱頁 - Desktop 1280px]
═══════════════════════════════════════════════════════════════

╔═ 待裝箱清單（左 30%）═════════╗ ╔═ 主操作區（中 50%）═══════════╗ ╔═ 已建箱（右 20%）═════╗
║                                  ║ ║                                  ║ ║                       ║
║ status=picked 的 outbound:       ║ ║ 選擇出庫單後展開：               ║ ║ Box B-OUT...0001-01   ║
║                                  ║ ║                                  ║ ║   含 I-001、I-002    ║
║ ☐ OUT-20260508-0001              ║ ║ ┌─ 待裝箱 inbound（已揀完）───┐ ║ ║   30x25x15 cm        ║
║   3 件 / 6.7kg / ABC Trading     ║ ║ │ ☐ I-001 / 2.5kg              │ ║ ║   est 4.0kg          ║
║                                  ║ ║ │ ☐ I-002 / 1.2kg              │ ║ ║                       ║
║ ☐ OUT-20260508-0003              ║ ║ │ ☐ I-003 / 3.0kg              │ ║ ║ Box B-OUT...0001-02   ║
║   1 件 / 4.0kg / DEF Co          ║ ║ └────────────────────────────┘ ║ ║   含 I-003           ║
║                                  ║ ║                                  ║ ║   25x20x15 cm        ║
║                                  ║ ║ ┌─ 新增箱 ───────────────────┐ ║ ║   est 3.5kg          ║
║                                  ║ ║ │ 箱號: B-OUT...0001-03（自動）│ ║ ║                       ║
║                                  ║ ║ │ 長[__] 寬[__] 高[__] cm      │ ║ ║ [全部裝箱完成]        ║
║                                  ║ ║ │ 預估重量[__] kg              │ ║ ║                       ║
║                                  ║ ║ │ 勾選要裝進此箱的 inbound:    │ ║ ║                       ║
║                                  ║ ║ │ ☐ I-001 ☐ I-002 ☐ I-003    │ ║ ║                       ║
║                                  ║ ║ │                              │ ║ ║                       ║
║                                  ║ ║ │ [新增此箱]                   │ ║ ║                       ║
║                                  ║ ║ └────────────────────────────┘ ║ ║                       ║
║                                  ║ ║                                  ║ ║                       ║
╚══════════════════════════════════╝ ╚══════════════════════════════════╝ ╚═══════════════════════╝

員工 UX：
1. 左側選 outbound
2. 中間「待裝箱 inbound」清單顯示此 outbound 已揀完的 inbound
3. 員工拆箱：勾選某幾筆 + 填箱 dimensions + est weight + 點 [新增此箱]
4. 系統建 outbound_box record + box_inbound_links + outbound_scans type=box_created
5. 已裝進箱的 inbound 從待裝箱清單移除（改顯示在已建箱區）
6. 重複 3-5 直到所有 inbound 都裝進箱
7. 點 [全部裝箱完成] → outbound.status=packing → packed
   寫 outbound_scans type='outbound_pack_complete'
```

#### 1.4.2 裝箱動作

```typescript
async function clientCreateBox({ outbound_id, inbound_ids, dimensions, weight_estimate, staff_id }) {
  const session = await mongoose.startSession();
  let box_id;
  
  await session.withTransaction(async () => {
    // 1. atomic 驗證
    const outbound = await OutboundRequest.findOne({
      _id: outbound_id,
      status: { $in: ['picked', 'packing'] },
    }, null, { session });
    if (!outbound) throw new Error('OUTBOUND_NOT_AVAILABLE_FOR_PACK');
    
    // 驗證 inbounds 都已 picked + 屬於此 outbound + 未被裝進其他箱
    const inbounds = await InboundRequest.find({
      _id: { $in: inbound_ids },
      status: 'picking',  // Phase 5 inbound status enum
    }, null, { session });
    if (inbounds.length !== inbound_ids.length) throw new Error('SOME_INBOUNDS_NOT_PICKED');
    
    const existingBoxLinks = await BoxInboundLink.find({
      inbound_id: { $in: inbound_ids },
      unlinked_at: null,
    }, null, { session });
    if (existingBoxLinks.length > 0) throw new Error('SOME_INBOUNDS_ALREADY_BOXED');
    
    // 2. 計算 box_no（下一個序號）
    const existingBoxes = await OutboundBox.find({ outbound_id }, null, { session });
    const next_seq = existingBoxes.length + 1;
    const outbound_id_short = outbound_id.split('-').slice(-1)[0];  // OUT-20260508-0001 → 0001
    const box_no = `B-${outbound_id_short}-${String(next_seq).padStart(2, '0')}`;
    box_id = await generateBoxId();
    
    // 3. 建 outbound_box record
    await OutboundBox.create([{
      _id: box_id,
      outbound_id,
      box_no,
      dimensions,
      weight_estimate,
      status: 'packing',
      created_by_staff_id: staff_id,
    }], { session });
    
    // 4. 建 box_inbound_links（append-only，仿 outbound_inbound_links）
    const links = inbound_ids.map(inbound_id => ({
      box_id,
      inbound_id,
      linked_at: new Date(),
      unlinked_at: null,
    }));
    await BoxInboundLink.insertMany(links, { session });
    
    // 5. update inbound status: picking → packed（Phase 5 status enum）
    await InboundRequest.updateMany(
      { _id: { $in: inbound_ids } },
      { status: 'packed' },
      { session }
    );
    
    // 6. 寫 outbound_scans type=box_created
    await OutboundScan.create([{
      _id: await generateOutboundScanId(),
      outbound_id,
      box_id,
      type: 'box_created',
      operator_staff_id: staff_id,
      details: { box_no, dimensions, weight_estimate, inbound_ids },
    }], { session });
    
    // 7. outbound.status: picked → packing（首次裝箱觸發）
    await OutboundRequest.updateOne(
      { _id: outbound_id, status: 'picked' },
      { status: 'packing' },
      { session }
    );
  });
  
  return { box_id, box_no };
}
```

#### 1.4.3 「全部裝箱完成」動作

```typescript
async function clientCompletePacking({ outbound_id, staff_id }) {
  const session = await mongoose.startSession();
  
  await session.withTransaction(async () => {
    // 驗證所有 inbound 都已裝進某箱
    const allLinks = await OutboundInboundLink.find({ outbound_id, unlinked_at: null }, null, { session });
    const boxedLinks = await BoxInboundLink.find({
      inbound_id: { $in: allLinks.map(l => l.inbound_id) },
      unlinked_at: null,
    }, null, { session });
    
    if (boxedLinks.length !== allLinks.length) {
      throw new Error('NOT_ALL_INBOUNDS_BOXED');
    }
    
    // outbound.status: packing → packed
    await OutboundRequest.updateOne(
      { _id: outbound_id, status: 'packing' },
      { status: 'packed' },
      { session }
    );
    
    // outbound_box.status: packing → packed (all)
    await OutboundBox.updateMany(
      { outbound_id, status: 'packing' },
      { status: 'packed' },
      { session }
    );
    
    // 寫 outbound_scans type=outbound_pack_complete
    await OutboundScan.create([{
      _id: await generateOutboundScanId(),
      outbound_id,
      type: 'outbound_pack_complete',
      operator_staff_id: staff_id,
    }], { session });
    
    // 寫 outbound_action_logs
    await OutboundActionLog.create([{
      outbound_id,
      action: 'packed',
      operator_type: 'wms_staff',
      operator_id: staff_id,
    }], { session });
  });
}
```

### 1.5 Stage 7：複重（PDA + WMS 桌面雙路徑）+ 取運單

#### 1.5.1 Step 1：每箱毛重 vs 上架重量比對

##### PDA 複重流程

路徑：`/zh-hk/scan/weigh`

```
[PDA 複重頁 - 380px wide]
═══════════════════════════════════

═ 複重動作 ═

1. 掃箱號 box_no
   [text input, autofocus]

2. 系統顯示此箱資訊：
   ┌─────────────────────────┐
   │ Box B-OUT...0001-01      │
   │ 預估毛重: 4.5 kg          │
   │   = 上架重量 4.0 (sum 2 inbound) + 預估皮重 0.5 │
   │                           │
   │ inbound 列表:             │
   │ - I-001 (上架 2.5kg)     │
   │ - I-002 (上架 1.5kg)     │
   └─────────────────────────┘

3. 員工把箱放秤上 → 量 actual_gross_weight
   [number input] kg, 小數 2 位

4. 員工填皮重 tare_weight（系統 default 顯示 0.5kg，員工可改）
   [number input]

5. 系統判斷：
   diff = actual_gross_weight - (sum_inbound_weight + tare_weight)
   
   ├── |diff| < 0.5kg → 通過
   │     寫 outbound_box_weights record
   │     box.status: packed → weight_verified
   │     寫 outbound_scans type=box_weight_verified
   │
   └── |diff| >= 0.5kg → 警告 Modal
         「此箱實重 X kg，預期 Y kg，相差 Z kg。
          可能原因：包裝物多了 / 上架時量錯 / 客戶加件」
         [確認通過] [重量重量]
         
         員工點 [確認通過] → 同上寫入但 outbound_box_weights.tolerance_passed=false
                            + outbound_scans type=box_weight_override

6. 系統判斷：此 outbound 全部 box 是否都已 weight_verified
   ├── 是 → outbound.status: packed → weighing → weight_verified
   │     寫 outbound_scans type=outbound_weight_verified
   │     **PDA 跳通知 Modal**：
   │       「OUT-... 已複重完成！請等待客戶取得運單」
   │       (路線 1：系統自動 trigger，員工不用做事)
   │       (路線 2：等客戶手動 trigger)
   │
   └── 否 → 繼續複重下一箱
```

##### 桌面複重流程

路徑：`/zh-hk/operations/weigh`

```
[桌面複重頁 - Desktop 1280px]
═══════════════════════════════════════════════════════════════

╔═ 待複重 outbound 清單（左 30%）╗ ╔═ 主操作區（右 70%）═══════════════════════╗
║                                   ║ ║                                              ║
║ status=packed:                    ║ ║ 選 outbound 後展開所有 box：                 ║
║                                   ║ ║                                              ║
║ ☐ OUT-20260508-0001              ║ ║ Box B-OUT...0001-01                          ║
║   3 箱 / 預估 12.5kg              ║ ║   預估: 4.5 kg                               ║
║                                   ║ ║   實重 [4.6  ] kg  皮重 [0.5 ] kg            ║
║ ☐ OUT-20260508-0003              ║ ║   diff: +0.1 kg ✅ 通過                      ║
║   1 箱 / 預估 4.0kg               ║ ║                                              ║
║                                   ║ ║ Box B-OUT...0001-02                          ║
║                                   ║ ║   預估: 4.5 kg                               ║
║                                   ║ ║   實重 [5.5  ] kg  皮重 [0.5 ] kg            ║
║                                   ║ ║   diff: +1.0 kg ⚠️ 警告，可 override         ║
║                                   ║ ║                                              ║
║                                   ║ ║ Box B-OUT...0001-03                          ║
║                                   ║ ║   預估: 3.5 kg                               ║
║                                   ║ ║   實重 [3.4  ] kg  皮重 [0.4 ] kg            ║
║                                   ║ ║   diff: -0.1 kg ✅ 通過                      ║
║                                   ║ ║                                              ║
║                                   ║ ║ 箱數清點：3 箱 / 系統紀錄 3 箱 ✅              ║
║                                   ║ ║                                              ║
║                                   ║ ║         [全部複重通過]                        ║
║                                   ║ ║                                              ║
╚══════════════════════════════════╝ ╚══════════════════════════════════════════════╝

員工 UX：
1. 左側選 outbound
2. 右側列出全部 box，員工逐箱量重量 + 填皮重
3. 系統即時算 diff 顯示警告
4. 全箱填完後 [全部複重通過]
5. 系統判斷箱數清點是否符合（系統紀錄 vs 實際 box 數量），不符必擋
```

#### 1.5.2 Step 2：箱數清點

系統依裝箱階段紀錄 vs 實際量到的箱數。**箱數對不上必擋**。

實際上裝箱完成後 outbound_boxes 已建立 N 筆 record（系統紀錄）。複重時員工逐箱量 → 全箱量完了系統 check：
- 員工量了 outbound_box_weights 紀錄筆數
- vs outbound_boxes（系統建箱紀錄）

兩者必須相等才能進下一步。

衍生 case：
- 員工漏量某箱 → 系統擋住「box X 尚未複重」
- 員工量了不存在的箱（多量）→ 4xx「box_no 不存在」

#### 1.5.3 Step 3：複重通過後推 OMS

複重通過 → outbound.status: weighing → weight_verified → 系統執行：

```typescript
async function onOutboundWeightVerified({ outbound_id, staff_id }) {
  const session = await mongoose.startSession();
  
  await session.withTransaction(async () => {
    const outbound = await OutboundRequest.findById(outbound_id, null, { session });
    const boxes = await OutboundBox.find({ outbound_id }, null, { session });
    const boxWeights = await OutboundBoxWeight.find({ outbound_id }, null, { session });
    
    // 1. 計算 outbound 級彙總
    const total_weight_actual = boxWeights.reduce((sum, b) => sum + b.actual_gross_weight, 0);
    const total_dimension_summary = aggregateDimensions(boxes);
    
    // 2. 重新 rate quote（複重後實重）
    const carrier = await Carrier.findOne({ code: outbound.carrier_code });
    const clientCarrierAccount = await ClientCarrierAccount.findById(outbound.carrier_account_id);
    
    const rateQuotePreLabel = await rateCardService.getQuote({
      carrier,
      client_carrier_account: clientCarrierAccount,
      receiver_address: outbound.receiver_address,
      totals: { total_weight: total_weight_actual, dimension_summary: total_dimension_summary, item_count: boxes.length },
    });
    
    // 3. capacity check（純警告，不擋）
    const capacityResult = await capacityCheck(carrier.capacity_rules, {
      total_weight: total_weight_actual,
      dimension_summary: total_dimension_summary,
      box_count: boxes.length,
    });
    
    // 4. 寫入 outbound 主檔
    await OutboundRequest.updateOne(
      { _id: outbound_id, status: 'weighing' },
      {
        status: 'weight_verified',
        total_weight_actual,
        total_dimension_actual: total_dimension_summary,
        rate_quote_pre_label: rateQuotePreLabel,
        rate_quote_pre_label_at: new Date(),
        capacity_check_result: capacityResult,  // 含 violations array
      },
      { session }
    );
    
    // 5. 寫 outbound_action_logs
    await OutboundActionLog.create([{
      outbound_id,
      action: 'weight_verified',
      operator_type: 'wms_staff',
      operator_id: staff_id,
      details: { 
        box_count: boxes.length,
        total_weight_actual,
        rate_quote_pre_label: rateQuotePreLabel.fee_amount,
        capacity_violations: capacityResult.violations,
      },
    }], { session });
    
    // 6. 推 OMS：箱級資訊 mirror + 主檔狀態
    await syncToOms({
      outbound_id,
      type: 'outbound-weight-verified',
      payload: {
        boxes: boxes.map(b => ({
          box_id: b._id,
          box_no: b.box_no,
          dimensions: b.dimensions,
          weight_actual: boxWeights.find(bw => bw.box_id === b._id)?.actual_gross_weight,
          tare_weight: boxWeights.find(bw => bw.box_id === b._id)?.tare_weight_input,
        })),
        total_weight_actual,
        rate_quote_pre_label: rateQuotePreLabel,
        capacity_violations: capacityResult.violations,
      },
    });
    
    // 7. 路徑分流：依 processing_preference
    if (outbound.processing_preference === 'auto') {
      // 路線 1（single 直發）/ consolidated auto 模式 → 系統自動 trigger label（0 秒延遲）
      await triggerLabelGeneration({ outbound_id, operator_type: 'system', session });
      // triggerLabelGeneration 內部處理失敗降級到 pending_client_label
    } else {
      // confirm_before_label 模式 → 等客戶手動點 [Generate Label]
      await OutboundRequest.updateOne(
        { _id: outbound_id, status: 'weight_verified' },
        { status: 'pending_client_label' },
        { session }
      );
      
      // 寫 notification 給客戶
      await Notification.create([{
        client_id: outbound.client_id,
        type: 'outbound_pending_client_label',
        payload: { outbound_id, total_weight_actual, box_count: boxes.length },
      }], { session });
    }
  });
}
```

#### 1.5.4 取 label trigger function（路線 1 / 路線 2 共用）

```typescript
async function triggerLabelGeneration({ outbound_id, operator_type, operator_id, session }) {
  // 1. atomic 切換 status: weight_verified / pending_client_label → label_obtaining
  const outbound = await OutboundRequest.findOneAndUpdate(
    {
      _id: outbound_id,
      status: { $in: ['weight_verified', 'pending_client_label'] },
    },
    { status: 'label_obtaining' },
    { new: true, session }
  );
  
  if (!outbound) throw new Error('OUTBOUND_NOT_AVAILABLE_FOR_LABEL');
  
  try {
    // 2. Pre-flight check
    
    // 2a. 餘額閘（沿用 Phase 7）
    const balance = await walletService.getBalance(outbound.client_id);
    if (balance < 0) {
      throw new HeldError('insufficient_balance');
    }
    
    // 2b. carrier credentials 有效性
    const account = await ClientCarrierAccount.findById(outbound.carrier_account_id);
    if (account.status !== 'active') {
      throw new HeldError('carrier_auth_failed');
    }
    
    // OAuth token 過期 → refresh
    if (account.auth_type === 'oauth' && isTokenExpired(account.oauth_meta)) {
      try {
        await refreshOauthToken(account);
      } catch (err) {
        throw new HeldError('carrier_auth_failed');
      }
    }
    
    // 2c. capacity check（依 carrier rules）
    const carrier = await Carrier.findOne({ code: outbound.carrier_code });
    const totals = {
      total_weight: outbound.total_weight_actual,
      dimension_summary: outbound.total_dimension_actual,
      box_count: await OutboundBox.countDocuments({ outbound_id }),
    };
    const capResult = await capacityCheck(carrier.capacity_rules, totals);
    if (!capResult.passed) {
      throw new HeldError('capacity_violation', { violations: capResult.violations });
    }
    
    // 3. 真實取 label（per box）
    const boxes = await OutboundBox.find({ outbound_id });
    const labelAdapter = carrierLabelServiceFactory(outbound.carrier_code);
    
    const labelResults = [];
    for (const box of boxes) {
      const labelResult = await labelAdapter.getLabel({
        outbound_id,
        box_id: box._id,
        box_no: box.box_no,
        client_carrier_account: account,
        receiver_address: outbound.receiver_address,
        weight: box.weight_actual,
        dimensions: box.dimensions,
        sender_address: await getSenderAddress(outbound.warehouseCode),
      });
      
      // 4. 寫 box record
      await OutboundBox.updateOne(
        { _id: box._id },
        {
          status: 'label_obtained',
          label_pdf_path: labelResult.label_pdf_path,
          tracking_no_carrier: labelResult.tracking_no,
          actual_label_fee: labelResult.fee_amount,
          label_obtained_at: new Date(),
          label_obtained_by_operator_type: operator_type,
        }
      );
      
      labelResults.push(labelResult);
      
      // 寫 outbound_scans
      await OutboundScan.create({
        _id: await generateOutboundScanId(),
        outbound_id,
        box_id: box._id,
        type: 'label_obtained',
        operator_staff_id: operator_id || 'SYSTEM',
        details: { tracking_no: labelResult.tracking_no, fee: labelResult.fee_amount },
      });
    }
    
    // 5. outbound 主檔
    const total_actual_label_fee = labelResults.reduce((s, r) => s + r.fee_amount, 0);
    await OutboundRequest.updateOne(
      { _id: outbound_id, status: 'label_obtaining' },
      {
        status: 'label_obtained',
        actual_label_fee: total_actual_label_fee,
        label_obtained_at: new Date(),
        label_obtained_by_operator_type: operator_type,
        label_obtained_by_operator_id: operator_id || 'SYSTEM',
      }
    );
    
    // 6. 寫 outbound_action_logs + notification
    await OutboundActionLog.create({
      outbound_id,
      action: 'label_obtained',
      operator_type,
      operator_id: operator_id || 'SYSTEM',
      details: { 
        box_count: boxes.length,
        total_label_fee: total_actual_label_fee,
        tracking_numbers: labelResults.map(r => r.tracking_no),
      },
    });
    
    await Notification.create({
      client_id: outbound.client_id,
      type: 'outbound_label_obtained',
      payload: {
        outbound_id,
        box_count: boxes.length,
        tracking_numbers: labelResults.map(r => ({ box_no: r.box_no, tracking_no: r.tracking_no })),
        total_label_fee: total_actual_label_fee,
        rate_quote_pre_label: outbound.rate_quote_pre_label?.fee_amount,
      },
    });
    
  } catch (err) {
    // 7. 失敗處理：降級到 pending_client_label
    const heldReason = err instanceof HeldError ? err.reason : 'carrier_api_failed';
    
    await OutboundRequest.updateOne(
      { _id: outbound_id, status: 'label_obtaining' },
      {
        status: 'pending_client_label',
        held_reason: heldReason,
        last_label_error: err.message,
        $inc: { label_retry_count: 1 },
      }
    );
    
    await OutboundActionLog.create({
      outbound_id,
      action: 'label_failed',
      operator_type,
      operator_id: operator_id || 'SYSTEM',
      details: { error: err.message, held_reason: heldReason, error_details: err.details },
    });
    
    // 通知客戶
    await Notification.create({
      client_id: outbound.client_id,
      type: 'outbound_label_failed',
      payload: {
        outbound_id,
        held_reason: heldReason,
        error_message: err.message,
      },
    });
    
    if (operator_type !== 'system') {
      // 客戶 / admin 主動 trigger 失敗 → 拋給上層 UI 顯示
      throw err;
    }
    // 系統 auto trigger 失敗 → 不拋（讓主流程繼續），客戶會收 notification
  }
}
```

#### 1.5.5 客戶 OMS 取 label UI（沿用 Phase 7 §1.9 改造）

路徑：`/zh-hk/outbound/[id]/confirm-label`（Phase 7 既有）

UI framing 依 outbound.processing_preference + held_reason 動態：

```
[outbound 詳情頁 - status=pending_client_label]

═══════════════════════════════════════════════════════════════
情境 A：processing_preference=auto + held_reason=null
（不應該發生 — auto 模式下系統自動 trigger 不會停在 pending_client_label）

情境 B：processing_preference=auto + held_reason 有值
（路線 1 自動 trigger 失敗降級）

⚠️ 您的 single 直發出貨單自動取得 label 失敗

原因：[依 held_reason 顯示]
- insufficient_balance → 「餘額不足，請至錢包儲值 [前往儲值]」
- carrier_auth_failed → 「Carrier 認證失效 [重新綁定]」
- capacity_violation → 「箱尺寸超 carrier 上限 [聯絡 CS]」
  + 詳細違規清單：「Box X 長 65cm 超 雲途 60cm 上限」
- carrier_api_failed → 「Carrier 服務暫時無法使用 [重試]」

請依以下處理後重新點選取得 label：

[取得 Shipping Label] [取消出庫單]

═══════════════════════════════════════════════════════════════

情境 C：processing_preference=confirm_before_label
（路線 2 正常流程）

您的 outbound 已完成複重，請確認以下資訊後取得 label：

實際出庫資訊（WMS 已量好）:
- 箱數: 3 箱（建單試算 1 箱，差 +2 箱）
- 總重量: 12.5 kg（建單試算 11 kg，差 +1.5 kg）

各箱詳細：
┌────────────────────────────────────────────┐
│ Box B-OUT...0001-01                          │
│   尺寸: 30x25x15 cm  毛重: 4.5 kg            │
│ Box B-OUT...0001-02                          │
│   尺寸: 30x25x15 cm  毛重: 5.0 kg            │
│ Box B-OUT...0001-03                          │
│   尺寸: 25x20x15 cm  毛重: 3.0 kg            │
└────────────────────────────────────────────┘

重新試算運費（雲途）：HK$120（建單時 HK$50，差 +HK$70）
⚠️ 實際運費以 carrier label 取得時為準

[取得 Shipping Label] [取消出庫單]

═══════════════════════════════════════════════════════════════

通用提示：
- 確認後將以您的 carrier 帳號生成 N 張 label（每箱一張）
- 取得 label 後即無法取消，運費由 carrier 直接計費
```

客戶點 [取得 Shipping Label] → POST `/api/cms/outbound/:id/confirm-label`：

```typescript
async function clientConfirmLabel({ outbound_id, client_id }) {
  // atomic 驗證 status=pending_client_label + client_id 一致
  // 觸發 triggerLabelGeneration({ outbound_id, operator_type: 'client', operator_id: client_id })
  // 失敗會自動降級回 pending_client_label，client retry 即可
}
```

### 1.6 Stage 7 step 4（員工列印 label / 貼箱）

#### 1.6.1 路徑

`/zh-hk/operations/label-print`

#### 1.6.2 UI 流程

```
[列印 / 貼箱頁 - Desktop]
═══════════════════════════════════════════════════════════════

待列印清單（status=label_obtained）:

┌──────────────────────────────────────────────────────────────┐
│ OUT-20260508-0001 / ABC Trading / 雲途                       │
│ 3 箱：                                                         │
│   Box B-OUT...0001-01 / tracking MOCK-yun_express-OUT...01   │
│   Box B-OUT...0001-02 / tracking MOCK-yun_express-OUT...02   │
│   Box B-OUT...0001-03 / tracking MOCK-yun_express-OUT...03   │
│                                                                │
│ [列印全部 label] [預覽 PDF] [貼 label 完成]                   │
└──────────────────────────────────────────────────────────────┘

員工 UX：
1. 點 [列印全部 label] → 系統合併 N 張 PDF 送到列印機
2. 員工拿到 N 張 label
3. 員工把每張 label 貼到對應箱（box_no 對 tracking_no）
4. 點 [貼 label 完成] → outbound.status: label_obtained → label_printed

注意：v1 不做 PDA verify（員工自己對照）
```

#### 1.6.3 動作

```typescript
async function clientLabelPrintComplete({ outbound_id, staff_id }) {
  // atomic 驗證 status=label_obtained
  await OutboundRequest.updateOne(
    { _id: outbound_id, status: 'label_obtained' },
    {
      status: 'label_printed',
      label_printed_at: new Date(),
      label_printed_by_staff_id: staff_id,
    }
  );
  
  // 寫 outbound_action_logs
  await OutboundActionLog.create({
    outbound_id,
    action: 'label_printed',
    operator_type: 'wms_staff',
    operator_id: staff_id,
    details: {},
  });
}
```

### 1.7 Stage 8：離倉（PDA only）

#### 1.7.1 PDA 離倉流程

路徑：`/zh-hk/scan/depart`

```
[PDA 離倉頁 - 380px wide]
═══════════════════════════════════

═ 離倉動作 ═

1. 掃箱號 box_no（或 carrier tracking）
   [text input, autofocus]

2. 系統 atomic 驗證：
   - box.status=label_printed
   - box 屬於 outbound.status=label_printed
   - box 未 departed

3. 通過 → 系統執行：
   - box.status: label_printed → departed
   - 寫 outbound_scans type=box_departed
   - 寫 inbound_scans type=outbound_departed_progress（per box）
   - 系統判斷：此 outbound 全部 box 是否都已 departed

4. 系統判斷：
   ├── 是 → outbound.status: label_printed → departed
   │     寫 outbound_scans type=outbound_departed
   │     對應 inbound 主檔 status: packed → departed
   │     寫 inbound_scans type=outbound_departed
   │     推 OMS：outbound + inbound status=departed
   │     發 notification type=outbound_departed 給客戶
   │     **PDA 跳成功 toast**：
   │       「OUT-... 全部 N 箱離倉完成 ✅」
   │
   └── 否 → 顯示進度
         「N 箱已離倉 / 總 M 箱，剩 (M-N) 箱」
         繼續掃下一箱

5. PDA 連續模式：自動回 step 1
```

#### 1.7.2 動作

```typescript
async function clientBoxDepart({ box_no, staff_id }) {
  const session = await mongoose.startSession();
  let outbound_id, all_departed;
  
  await session.withTransaction(async () => {
    // 1. 找 box + atomic 驗證
    const box = await OutboundBox.findOneAndUpdate(
      { box_no, status: 'label_printed' },
      { status: 'departed', departed_at: new Date() },
      { new: true, session }
    );
    
    if (!box) throw new Error('BOX_NOT_AVAILABLE_FOR_DEPART');
    outbound_id = box.outbound_id;
    
    // 2. 寫 outbound_scans
    await OutboundScan.create([{
      _id: await generateOutboundScanId(),
      outbound_id,
      box_id: box._id,
      type: 'box_departed',
      operator_staff_id: staff_id,
    }], { session });
    
    // 3. 判斷此 outbound 全部 box 是否都 departed
    const remainingBoxes = await OutboundBox.countDocuments({
      outbound_id,
      status: { $ne: 'departed' },
    }, { session });
    
    if (remainingBoxes === 0) {
      // 全箱 departed → outbound 也 departed
      await OutboundRequest.updateOne(
        { _id: outbound_id, status: 'label_printed' },
        { 
          status: 'departed',
          departed_at: new Date(),
        },
        { session }
      );
      
      // 寫 outbound_scans type=outbound_departed
      await OutboundScan.create([{
        _id: await generateOutboundScanId(),
        outbound_id,
        type: 'outbound_departed',
        operator_staff_id: staff_id,
      }], { session });
      
      // 對應 inbound 主檔 status: packed → departed
      const links = await OutboundInboundLink.find({ outbound_id, unlinked_at: null }, null, { session });
      const inbound_ids = links.map(l => l.inbound_id);
      await InboundRequest.updateMany(
        { _id: { $in: inbound_ids } },
        { status: 'departed', departedAt: new Date() },
        { session }
      );
      
      // 寫 inbound_scans type=outbound_departed（per inbound）
      for (const inbound_id of inbound_ids) {
        await InboundScan.create([{
          _id: await generateScanId(),
          inbound_request_id: inbound_id,
          type: 'outbound_departed',
          operator_staff_id: staff_id,
        }], { session });
      }
      
      // 寫 outbound_action_logs
      await OutboundActionLog.create([{
        outbound_id,
        action: 'departed',
        operator_type: 'wms_staff',
        operator_id: staff_id,
      }], { session });
      
      // 通知客戶
      await Notification.create([{
        client_id: (await OutboundRequest.findById(outbound_id)).client_id,
        type: 'outbound_departed',
        payload: {
          outbound_id,
          tracking_numbers: (await OutboundBox.find({ outbound_id })).map(b => ({
            box_no: b.box_no,
            tracking_no: b.tracking_no_carrier,
          })),
        },
      }], { session });
      
      all_departed = true;
    } else {
      all_departed = false;
    }
  });
  
  return { outbound_id, all_departed };
}
```

### 1.8 Carrier Label Adapter 完整實作

Phase 7 §1.7 已建 rate quote adapter。Phase 8 補完整 getLabel + cancelLabel。

#### 1.8.1 介面擴充

```typescript
interface CarrierLabelAdapter extends CarrierRateAdapter {
  getLabel(input: GetLabelInput): Promise<GetLabelOutput>;
  cancelLabel(input: CancelLabelInput): Promise<void>;  // v1 admin 後台用
}

interface GetLabelInput {
  outbound_id: string;
  box_id: string;
  box_no: string;
  client_carrier_account: ClientCarrierAccount;
  receiver_address: Address;
  weight: number;       // 此箱實重
  dimensions: { length, width, height };
  sender_address: Address;  // 倉庫地址（從 warehouses 主檔）
  metadata?: { mock_force_error?: boolean; mock_force_error_type?: string };
}

interface GetLabelOutput {
  carrier_code: string;
  tracking_no: string;
  label_pdf_path: string;  // 系統 file path
  fee_amount: number;
  fee_currency: string;
  raw_response: object;
  label_obtained_at: Date;
  service_type?: string;
}
```

#### 1.8.2 Mock Adapter 完整實作（沿用 Phase 7 + 強化）

```typescript
class MockCarrierLabelAdapter extends MockCarrierRateAdapter implements CarrierLabelAdapter {
  async getLabel(input: GetLabelInput): Promise<GetLabelOutput> {
    // 模擬 carrier API delay
    await sleep(2000 + Math.random() * 1000);
    
    // 失敗模擬
    if (input.metadata?.mock_force_error) {
      const errorType = input.metadata.mock_force_error_type || 'server_error';
      switch (errorType) {
        case 'rate_limit':
          throw new MockCarrierError('Rate limit exceeded', 429);
        case 'server_error':
          throw new MockCarrierError('Carrier server error', 500);
        case 'auth_failed':
          throw new MockCarrierError('Carrier authentication failed', 401);
        case 'capacity_violation':
          throw new MockCarrierError('Package exceeds carrier limits', 422);
        default:
          throw new MockCarrierError('Unknown error', 500);
      }
    }
    
    if (process.env.MOCK_FORCE_ALL_ERRORS === 'true') {
      throw new MockCarrierError('Forced error for testing', 500);
    }
    
    // 動態生成 PDF
    const tracking_no = `MOCK-${this.carrier_code.toUpperCase()}-${input.outbound_id}-BOX${this.extractBoxSeq(input.box_no)}`;
    const pdfPath = await pdfService.generateMockLabel({
      carrier_code: this.carrier_code,
      outbound_id: input.outbound_id,
      box_id: input.box_id,
      box_no: input.box_no,
      tracking_no,
      receiver_address: input.receiver_address,
      sender_address: input.sender_address,
      weight: input.weight,
      dimensions: input.dimensions,
    });
    
    // 計算 fee（同 rate quote 邏輯）
    const fee_amount = this.calculateFee(input);
    
    return {
      carrier_code: this.carrier_code,
      tracking_no,
      label_pdf_path: pdfPath,
      fee_amount,
      fee_currency: 'HKD',
      service_type: `Mock ${this.carrier_code} 標準線`,
      raw_response: { mock: true, pdf_generated: pdfPath },
      label_obtained_at: new Date(),
    };
  }
  
  async cancelLabel(input: CancelLabelInput): Promise<void> {
    await sleep(1000);
    if (input.metadata?.mock_force_error) {
      throw new MockCarrierError('Cannot cancel label', 422);
    }
    // mock 純 stub，不刪 PDF（保留 audit）
  }
  
  private extractBoxSeq(box_no: string): number {
    return parseInt(box_no.split('-').slice(-1)[0]);
  }
  
  private calculateFee(input: GetLabelInput): number {
    // 同 Phase 7 §1.7.4 邏輯
    const carrierConfig = CARRIER_MULTIPLIERS[this.carrier_code] || CARRIER_MULTIPLIERS.yun_express;
    const countryMultiplier = COUNTRY_MULTIPLIERS[input.receiver_address.country] || COUNTRY_MULTIPLIERS.default;
    const baseFee = carrierConfig.base + carrierConfig.per_kg * input.weight;
    return Math.round(baseFee * carrierConfig.multiplier * countryMultiplier);
  }
}
```

#### 1.8.3 pdfService.generateMockLabel（擴展 Phase 7）

```typescript
async function generateMockLabel(input: MockLabelInput): Promise<string> {
  const PDFDocument = require('pdfkit');
  const fs = require('fs');
  const doc = new PDFDocument({ size: 'A6' });  // 105×148mm
  const filename = `mock_label_${input.box_id}_${Date.now()}.pdf`;
  const filepath = `/uploads/labels/${input.outbound_id}/${filename}`;
  
  ensureDir(dirname(filepath));
  doc.pipe(fs.createWriteStream(filepath));
  
  // PDF 內容
  doc.fontSize(20).text(`[MOCK] ${input.carrier_code.toUpperCase()}`, { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(10).text(`Box: ${input.box_no}`);
  doc.fontSize(14).text(`Tracking: ${input.tracking_no}`, { align: 'center' });
  doc.moveDown(0.5);
  
  doc.fontSize(8).text(`Outbound: ${input.outbound_id}`);
  doc.text(`Weight: ${input.weight} kg`);
  doc.text(`Dimensions: ${input.dimensions.length}×${input.dimensions.width}×${input.dimensions.height} cm`);
  doc.moveDown(0.3);
  
  doc.fontSize(10).text('TO:', { underline: true });
  doc.fontSize(9).text(input.receiver_address.name);
  doc.text(input.receiver_address.address_line1);
  if (input.receiver_address.address_line2) doc.text(input.receiver_address.address_line2);
  doc.text(`${input.receiver_address.city}, ${input.receiver_address.country}`);
  doc.text(input.receiver_address.postal_code);
  if (input.receiver_address.phone) doc.text(`Phone: ${input.receiver_address.phone}`);
  doc.moveDown(0.3);
  
  doc.fontSize(8).text('FROM:', { underline: true });
  doc.text(input.sender_address.name);
  doc.text(input.sender_address.address_line1);
  doc.text(`${input.sender_address.city}, ${input.sender_address.country}`);
  
  doc.moveDown(0.5);
  doc.fillColor('red').fontSize(7).text('⚠️ MOCK label for dev/staging only. Not valid for real shipping.', { align: 'center' });
  
  doc.end();
  return filepath;
}
```

#### 1.8.4 Yun Express / Fuuffy Adapter（v1 dev 仍走 mock，prod 切換才實作）

```typescript
class YunExpressLabelAdapter implements CarrierLabelAdapter {
  async getLabel(input: GetLabelInput): Promise<GetLabelOutput> {
    if (process.env.PHASE8_USE_MOCK_CARRIER === 'true') {
      // 走 mock
      return new MockCarrierLabelAdapter('yun_express').getLabel(input);
    }
    
    // prod：呼叫雲途真實 API
    // - 用 input.client_carrier_account.credentials_enc 解密拿 ApiSecret
    // - 呼叫雲途 createOrder + getLabel API
    // - 拿 PDF binary 寫入 /uploads/labels/
    // - 拿真實 tracking_no
    // - 返回 GetLabelOutput
    throw new Error('NOT_IMPLEMENTED: Yun Express real API not implemented in v1');
  }
  
  async getQuote(input: RateQuoteInput): Promise<RateQuoteOutput> {
    // 沿用 Phase 7 §1.7
  }
  
  async cancelLabel(input: CancelLabelInput): Promise<void> {
    if (process.env.PHASE8_USE_MOCK_CARRIER === 'true') {
      return new MockCarrierLabelAdapter('yun_express').cancelLabel(input);
    }
    throw new Error('NOT_IMPLEMENTED: Yun Express cancelLabel not implemented in v1');
  }
}

// Fuuffy 同樣 pattern
```

### 1.9 Notification Type 清單（Phase 8 範圍）

| Type | 觸發點 | 收件人 | 訊息 |
|---|---|---|---|
| `outbound_pending_client_label` | 複重通過 + processing_preference=confirm_before_label | 客戶 | 「您的 outbound OUT-... 已完成複重，請確認並取得 Shipping Label」 |
| `outbound_label_obtained` | label 取得成功（路線 1 自動 / 路線 2 手動 / admin 代取）| 客戶 | 「Shipping Label 已取得，N 個 tracking number：...，貨物即將出倉」 |
| `outbound_label_failed` | trigger label 失敗（路線 1 自動失敗 / 客戶 retry 失敗）| 客戶 | 「您的 outbound 取得 label 失敗：[原因]，請至 OMS 處理」 |
| `outbound_departed` | 全箱 departed | 客戶 | 「您的 outbound OUT-... 已出倉，N 個 tracking number」 |
| `outbound_held_carrier_auth_failed` | carrier credentials 失效 | 客戶 | 「您的 carrier 授權已失效，請重新綁定」 |

### 1.10 Cross-service Sync

#### 1.10.1 WMS → OMS

```
POST /api/cms/sync/outbound-pick-progress       揀貨進度（picking → picked）
POST /api/cms/sync/outbound-pack-progress       裝箱進度（packing → packed）
POST /api/cms/sync/outbound-weight-verified     複重通過 + 箱級資訊
POST /api/cms/sync/outbound-label-obtained      label 取得（含 tracking）
POST /api/cms/sync/outbound-departed            出倉
```

#### 1.10.2 OMS → WMS（沿用 Phase 7）

```
POST /api/wms/sync/outbound-cancelled            客戶取消（label_obtaining 後不可，admin 才能）
```

### 1.11 admin 後台 Phase 8 操作

#### 1.11.1 Retry Label

```
POST /api/wms/outbound/:id/admin-retry-label    admin 代客戶 retry label
```

業務場景：客戶不在線、客戶 retry 多次失敗、CS 介入處理。

```typescript
async function adminRetryLabel({ outbound_id, admin_id }) {
  // atomic 驗證 status=pending_client_label
  await triggerLabelGeneration({
    outbound_id,
    operator_type: 'admin',
    operator_id: admin_id,
  });
}
```

#### 1.11.2 Cancel Label（label_obtained 後 admin 才能取消）

```
POST /api/wms/outbound/:id/admin-cancel-label   取消已取的 label（罕見）
```

業務場景：箱破損 / 內容物錯 / 業務糾紛。

```typescript
async function adminCancelLabel({ outbound_id, admin_id, reason }) {
  // atomic 驗證 status ∈ ['label_obtained', 'label_printed']（departed 後不可 cancel）
  // 對每箱呼叫 carrier cancelLabel
  // outbound.status: → cancelled_after_label
  // 寫 audit
  // 通知客戶
}
```

#### 1.11.3 Force Cancel Outbound（label_obtaining 後 admin 才能取消）

對齊 Phase 7 §3.1 admin-adjust，擴展支援 label_obtaining 後狀態：

```
POST /api/wms/outbound/:id/admin-force-cancel   強制取消（罕見，admin 對 carrier 已協調好）
```

#### 1.11.4 WMS Dashboard Banner（待客戶取 label 超 2 工作天）

WMS dashboard 加 banner：

```
[WMS Dashboard]
┌──────────────────────────────────────────────────────┐
│ ⚠️ 待客戶取 label 超 2 工作天: N 筆                  │
│ [看清單]                                              │
└──────────────────────────────────────────────────────┘
```

清單頁：篩選 status=pending_client_label + weight_verified_at < (now - 2 工作天)。

CS 看清單後手動聯絡客戶 / admin 後台代客戶取。

### 1.12 修 ShipItAsia Bug 2/3/4/5/6

#### 1.12.1 Bug 2：departure 推 OMS 重複 orderIds

Phase 8 §1.7.2 重寫 box departed → outbound departed 邏輯。新邏輯沒有「彙整 boxes 對應 outbound」這步（每箱獨立 update），不會產生重複 orderIds。

但推 OMS 時：

```typescript
// 修法：sync payload 直接傳 outbound_id（單一），OMS 端不需要去重
await syncToOms({
  type: 'outbound-departed',
  payload: { outbound_id, tracking_numbers, departed_at },
});
```

OMS 端接收：

```typescript
// 修 Bug 3：不做嚴格長度比對
async function updateOutboundStatus({ outbound_ids, new_status }) {
  // 改成單 outbound_id 處理（Phase 8 sync 都是單筆）
  // 或保留 array but 用 dedup logic
  const dedupedIds = [...new Set(outbound_ids)];
  const result = await OutboundRequest.updateMany(
    { _id: { $in: dedupedIds }, status: { $in: validPrevStatuses } },
    { status: new_status }
  );
  // 不再 throw ORDER_NOT_FOUND；返回 updated count
  return { updated_count: result.modifiedCount };
}
```

#### 1.12.2 Bug 4：OMS error-list 缺 ORDER_NOT_FOUND

Phase 8 sub-step 8.0 schema 地基時統一補 error-list 所有 error code。

#### 1.12.3 Bug 5：CANCEL case 漏 break

修 OMS `do_update_outbound_order_status.ts`：

```typescript
switch (status) {
  case OUTBOUND.STATUS.CANCEL:
    update = { status: 'cancelled', cancelled_at: new Date() };
    break;  // ← 補上
  default:
    throw new ApiError("INVALID_OUTBOUND_STATUS");
}
```

#### 1.12.4 Bug 6：pick 不污染 item_locations.locationCode

Phase 5 §2.2 已重做 schema（加 currentStatus / placedBy / lastMovedAt）。Phase 8 §1.3.3 pick service 實作時：

```typescript
// 正確：只改 currentStatus，不改 locationCode
await ItemLocation.updateOne(
  { itemCode: inbound._id, currentStatus: 'in_storage' },
  { 
    currentStatus: 'picked',
    lastMovedAt: new Date(),
    // **不寫 locationCode**
  }
);
```

員工 staff_id 寫到 outbound_scans.operator_staff_id（Phase 8 範圍），不寫到 item_locations。

---

## 2. Schema 變更

### 2.1 `outbound_requests`（**擴充** Phase 7 §2.1）

新增 / 改造欄位：

| 欄位 | 型別 | 既有 / 新增 / 改 | 說明 |
|---|---|---|---|
| `total_weight_actual` | number? | **新增** | 複重後彙總實重 |
| `total_dimension_actual` | object? | **新增** | summary（max_dimension 等）|
| `rate_quote_pre_label` | object? | **新增** | 複重後重新 rate quote snapshot |
| `rate_quote_pre_label_at` | date? | **新增** | |
| `capacity_check_result` | object? | **新增** | { passed, violations[] } |
| `actual_label_fee` | number? | 既有 Phase 7 | Phase 8 寫入（per box 加總）|
| `label_obtained_at` | date? | 既有 Phase 7 | 全 box label 都取得時間（最後一張）|
| `label_obtained_by_operator_type` | enum? | **新增** | `system` / `client` / `admin` / `wms_staff` |
| `label_obtained_by_operator_id` | string? | **新增** | 對應 ID |
| `label_printed_at` | date? | **新增** | 員工點 [貼 label 完成] 時間 |
| `label_printed_by_staff_id` | string? | **新增** | |
| `departed_at` | date? | **新增** | 全箱 departed |
| `cancelled_after_label_at` | date? | **新增** | admin label_obtained 後取消 |
| `cancelled_after_label_reason` | string? | **新增** | |

#### Status enum 更新（Phase 8 完整版）

```typescript
type OutboundStatus = 
  | 'ready_for_label'        // Phase 7 客戶建單後
  | 'held'                   // Phase 7 餘額閘 / 偏好等
  | 'picking'                // Phase 8 揀貨中
  | 'picked'                 // 全 inbound 揀完
  | 'packing'                // 裝箱中
  | 'packed'                 // 全 inbound 裝箱完
  | 'weighing'               // 複重中
  | 'weight_verified'        // 複重通過
  | 'pending_client_label'   // 等客戶取 label（auto 模式失敗 / confirm_before_label 模式預設）
  | 'label_obtaining'        // 系統正在 trigger carrier API（中間態）
  | 'label_obtained'         // label 取得，等員工列印
  | 'label_printed'          // 員工貼 label 完成
  | 'departed'               // 出倉
  | 'cancelled'              // 客戶 / admin 取消（必須在 label_obtaining 之前）
  | 'cancelled_after_label'  // admin 在 label_obtained 之後取消（罕見）
```

#### `processing_preference` enum 語意更新（同步 Phase 7 v1.2）

```typescript
type ProcessingPreference = 
  | 'auto'                    // 全託管：複重通過後系統自動 trigger label（0 秒延遲）
                              //   single 直發強制此值
                              //   失敗降級到 pending_client_label，客戶手動處理
  | 'confirm_before_label';   // 出貨前確認：複重通過後 status=pending_client_label，等客戶手動點
```

#### `held_reason` enum 擴充（Phase 7 v1.2）

```typescript
type HeldReason =
  | 'insufficient_balance'   // Phase 7 既有
  | 'phase7_not_ready'       // Phase 7 既有
  | 'awaiting_client_input'  // Phase 7 既有，single 補資訊
  | 'carrier_auth_failed'    // **Phase 8 新增**：carrier credentials 失效
  | 'capacity_violation'     // **Phase 8 新增**：實際尺寸超 carrier 上限
  | 'carrier_api_failed'     // **Phase 8 新增**：carrier API 暫時失敗（網路 / server error）
  | 'label_failed_retry';    // Phase 7 既有
```

### 2.2 `outbound_boxes`（**新增主檔**）

| 欄位 | 型別 | 說明 |
|---|---|---|
| `_id` | string | box_id |
| `outbound_id` | string | FK |
| `box_no` | string | 顯示用，B-{outbound_id 後段}-{NN} |
| `dimensions` | object | { length, width, height } cm 整數 |
| `weight_estimate` | number | 裝箱階段員工估的（含皮重） |
| `weight_actual` | number? | 複重階段量到的毛重 |
| `tare_weight` | number? | 員工填的皮重 |
| `weight_diff` | number? | actual - (sum_inbound + tare) |
| `weight_diff_passed` | boolean? | |diff| < 0.5kg |
| `status` | enum | `packing` / `packed` / `weight_verified` / `label_obtained` / `label_printed` / `departed` |
| `label_pdf_path` | string? | 此箱 label PDF |
| `tracking_no_carrier` | string? | 此箱真實 tracking |
| `actual_label_fee` | number? | 此箱 carrier fee |
| `label_obtained_at` | date? | |
| `label_obtained_by_operator_type` | enum? | |
| `departed_at` | date? | |
| `created_by_staff_id` | string | |
| `created_at / updated_at` | date | |

**Indexes**：
- `{ outbound_id: 1, status: 1 }`
- `{ box_no: 1 }` unique（離倉掃描用）
- `{ tracking_no_carrier: 1 }`（Phase 9 webhook 接收 tracking 用）

### 2.3 `box_inbound_links`（**新增中介表**，借鏡 outbound_inbound_links append-only 設計）

| 欄位 | 型別 | 說明 |
|---|---|---|
| `_id` | string | |
| `box_id` | string | FK |
| `inbound_id` | string | FK |
| `linked_at` | date | |
| `unlinked_at` | date? | 拆箱重組時 set |

**Indexes**：
- `{ box_id: 1, inbound_id: 1 }` 加 `unlinked_at: 1`（同 inbound 可被綁不同箱有 history）
- `{ inbound_id: 1, unlinked_at: 1 }`（Phase 8 §1.4.2 atomic 驗證 inbound 未被裝進其他箱）

### 2.4 `outbound_box_weights`（**新增**，複重快照）

| 欄位 | 型別 | 說明 |
|---|---|---|
| `_id` | string | |
| `box_id` | string | FK |
| `outbound_id` | string | FK |
| `expected_gross_weight` | number | sum(inbound.actualWeight) + tare_weight_input |
| `actual_gross_weight` | number | 員工量到的毛重 |
| `tare_weight_input` | number | 員工填的皮重 |
| `weight_diff` | number | actual - expected |
| `tolerance_threshold` | number | 0.5 kg（v1 寫死，未來走 master data）|
| `tolerance_passed` | boolean | |diff| < tolerance |
| `override_at` | date? | 超容差但員工 override 通過 |
| `weighed_by_staff_id` | string | |
| `weighed_at` | date | |
| `weigh_method` | enum | `pda` / `desktop` |

**Indexes**：
- `{ outbound_id: 1, weighed_at: -1 }`
- `{ box_id: 1 }` unique（一箱一筆 weight record，重新量會 update 此筆）

### 2.5 `outbound_scans`（**新增**，主集合，仿 Phase 5 inbound_scans）

借鏡 Phase 5 inbound_scans + Fuuffy B5 + B1 完整實作。append-only。

| 欄位 | 型別 | 說明 |
|---|---|---|
| `_id` | string | scan_id 格式 `OS{YYYYMMDD}_{NNNN}` |
| `outbound_id` | string | FK |
| `inbound_id` | string? | per inbound 動作（picked 等）|
| `box_id` | string? | per box 動作 |
| `type` | enum | 見下表 |
| `operator_staff_id` | string | 員工 ID（v1 reuse admin）|
| `pick_method` | enum? | `pda_scan` / `desktop_batch`（pick 階段）|
| `weigh_method` | enum? | `pda` / `desktop`（複重階段）|
| `details` | object? | 自由 metadata（fuuffy B1 風格）|
| `staff_note` | string? | 員工備註 ≤ 200 字 |
| `createdAt` | date | append-only |

#### Type enum 完整列表

| Type | 寫入時機 |
|---|---|
| `inbound_picked` | 員工揀某 inbound（PDA 或桌面）|
| `outbound_pick_complete` | outbound 全 inbound 揀完 |
| `box_created` | 員工裝箱階段建新箱 |
| `outbound_pack_complete` | outbound 全部裝箱完成 |
| `box_weight_verified` | 某箱複重通過 |
| `box_weight_override` | 某箱超容差但員工 override |
| `outbound_weight_verified` | outbound 全箱複重通過 |
| `label_obtained` | per box label 取得 |
| `label_failed` | per outbound label 失敗（attached to outbound, not box）|
| `box_departed` | 員工掃箱離倉 |
| `outbound_departed` | outbound 全箱離倉 |

**Indexes**：
- `{ outbound_id: 1, createdAt: -1 }`
- `{ inbound_id: 1, createdAt: -1 }`
- `{ box_id: 1, createdAt: -1 }`
- `{ type: 1, createdAt: -1 }`
- `{ operator_staff_id: 1, createdAt: -1 }`

### 2.6 `inbound_scans`（**擴充** Phase 5 / 6）

`type` enum 加：

| Type | 寫入時機 |
|---|---|
| `outbound_departed` | outbound 全箱 departed → inbound 主檔 status=departed |
| `outbound_departed_progress` | per box departed（多箱 outbound 漸進）|

注意：**不**在 inbound_scans 寫 picked / packed / weight_verified（這些走 outbound_scans，職責邊界明確）。

inbound_scans 只寫 inbound 階段動作 + outbound 連結 / 解綁事件 + 最終 departed。

### 2.7 `clients`（**擴充** Phase 7 v1.1 + v1.2 同步）

`preferences.outbound_processing_preference` 語意更新：

```typescript
{
  outbound_processing_preference: 'auto' | 'confirm_before_label';
  // 注意：single 模式 inbound 自動建 outbound 強制 'auto'，不 follow 此設定
  // 此設定只影響 consolidated 模式 outbound 的 default
}
```

### 2.8 `carriers`（**擴充** Phase 7）

無新增欄位（capacity_rules / supports_label_api 已預備）。

Phase 8 走 `supports_label_api=true`。

### 2.9 `outbound_action_logs`（**擴充** Phase 7 §2.6）

`action` enum 擴充：

| Action | 觸發點 |
|---|---|
| 既有 Phase 7：`created` / `cancelled` / `held_released` | |
| **Phase 8 新增**：`picking_progress` / `picked` / `packing_progress` / `packed` / `weighing_progress` / `weight_verified` / `label_obtaining` / `label_obtained` / `label_failed` / `label_printed` / `departed` / `admin_retry_label` / `admin_cancel_label` / `cancelled_after_label` | |

### 2.10 daily_counters（沿用 Phase 4-7）

擴充 prefix：
```
outbound_box_2026-05-08    → 不需要（box_no 走 outbound_id + 序號自動算）
outbound_scan_2026-05-08   → OS20260508-NNNN
```

box_id 用 mongo ObjectId（不需要 daily counter，box_no 才是顯示用）。

### 2.11 `notifications`（既有 Phase 4 預備）

加 5 種 type（見 §1.9）。

### 2.12 OMS 端 mirror schema

OMS 端對應 mirror collections（read-only for client）：

```
oms.outbound_boxes               WMS 推 OMS 後 mirror
oms.outbound_box_weights         同上（複重結果）
```

OMS 端 outbound 詳情頁讀 mirror，客戶看到實時箱級資訊。

---

## 3. 頁面 / API 清單

### 3.1 WMS 新增頁面

| 路徑 | 形態 | 說明 |
|---|---|---|
| `/zh-hk/scan/pick` | PDA | 揀貨（PDA）|
| `/zh-hk/operations/pick` | Desktop | 揀貨（桌面批次）|
| `/zh-hk/operations/pack` | Desktop | 裝箱頁 |
| `/zh-hk/scan/weigh` | PDA | 複重（PDA）|
| `/zh-hk/operations/weigh` | Desktop | 複重（桌面批次）|
| `/zh-hk/operations/label-print` | Desktop | 員工列印 / 貼箱 |
| `/zh-hk/scan/depart` | PDA | 離倉掃箱 |
| `/zh-hk/operations/outbound-list` | Desktop 既有改造 | admin 看 outbound 列表 + 操作（admin retry / cancel label / force cancel）|
| `/zh-hk/operations/outbound/:id` | Desktop 既有改造 | 詳情頁 + admin 動作 |

### 3.2 OMS 既有頁面改造

| 路徑 | 改造 |
|---|---|
| `/zh-hk/outbound/[id]` | Phase 7 既有 + 加箱級資訊 + tracking 列表 |
| `/zh-hk/outbound/[id]/confirm-label` | Phase 7 既有，UI framing 改造（依 processing_preference + held_reason 動態）|

### 3.3 WMS API endpoints

```
# Pick
GET    /api/wms/outbound/pickable                    待揀清單（status=ready_for_label / picking）
GET    /api/wms/outbound/:id/pick-detail             單一 outbound 待揀 inbound 列表
POST   /api/wms/outbound/:id/pick/scan               PDA 單件揀貨（locationCode + inbound_id）
POST   /api/wms/outbound/:id/pick/batch              桌面批次揀貨（多 inbound_ids）

# Pack
GET    /api/wms/outbound/packable                    待裝箱清單（status=picked）
POST   /api/wms/outbound/:id/box                     建新箱
DELETE /api/wms/outbound/:id/box/:box_id             刪箱（admin only，罕見）
POST   /api/wms/outbound/:id/pack/complete           全部裝箱完成

# Weigh
GET    /api/wms/outbound/weighable                   待複重清單（status=packed）
POST   /api/wms/outbound/:id/box/:box_id/weigh        per box 複重
POST   /api/wms/outbound/:id/weigh/complete          全箱複重通過 trigger 推 OMS

# Label print
GET    /api/wms/outbound/printable                   待列印清單（status=label_obtained）
POST   /api/wms/outbound/:id/label/print-complete    員工點 [貼 label 完成]

# Depart
POST   /api/wms/box/depart                            PDA 掃箱離倉

# Admin 後台
POST   /api/wms/outbound/:id/admin-retry-label       admin 代客戶 retry
POST   /api/wms/outbound/:id/admin-cancel-label      admin 取消已取的 label
POST   /api/wms/outbound/:id/admin-force-cancel      admin 強制取消（label_obtaining 後）

# Dashboard banner data
GET    /api/wms/dashboard/pending-client-label-overdue   超 2 工作天的 pending_client_label
```

### 3.4 OMS API endpoints

```
# 客戶取 label（既有 Phase 7 §3.4 改造）
POST   /api/cms/outbound/:id/confirm-label           客戶手動 trigger label（路線 2）

# 客戶看箱級資訊
GET    /api/cms/outbound/:id/boxes                   箱級 mirror（從 OMS 端 oms.outbound_boxes 查）

# 取消（既有 Phase 7，但加嚴 status 條件）
POST   /api/cms/outbound/:id/cancel                  客戶取消（status ∈ ['ready_for_label', 'held', 'pending_client_label'] 才可，label_obtaining 後不可）
```

### 3.5 Cross-service Sync API

```
POST   /api/cms/sync/outbound-pick-progress
POST   /api/cms/sync/outbound-pack-progress
POST   /api/cms/sync/outbound-weight-verified
POST   /api/cms/sync/outbound-label-obtained
POST   /api/cms/sync/outbound-label-failed
POST   /api/cms/sync/outbound-departed
```

### 3.6 Sidebar 改造

WMS sidebar 新增：

```
出庫操作
  ├── 揀貨（PDA）              → /scan/pick
  ├── 揀貨（桌面）             → /operations/pick
  ├── 裝箱                     → /operations/pack
  ├── 複重（PDA）              → /scan/weigh
  ├── 複重（桌面）             → /operations/weigh
  ├── 列印 / 貼箱              → /operations/label-print
  ├── 離倉（PDA）              → /scan/depart
  └── 出庫單列表 (admin)        → /operations/outbound-list
```

OMS sidebar 不變。

---

## 4. ShipItAsia 既有現況對映

| 既有 | 處理 |
|---|---|
| ShipItAsia PDA pick 流程 | **重做**：UI 改造、API 重寫、加桌面雙路徑 |
| ShipItAsia Web `/outbound/pack` 頁 | **重做**：依新 schema（outbound_boxes / box_inbound_links）|
| ShipItAsia PDA palletize 流程 | **棄用**：業主決策取消 palletize |
| ShipItAsia `pallet_lists` collection | 保留 schema（不刪），但業務不寫入 |
| ShipItAsia PDA departure 流程 | **重做**：掃 box_no 取代掃 palletCode |
| ShipItAsia `departure_lists` collection | 保留概念但 schema 改造為 outbound_scans 一部分 |
| Bug 2/3/4/5（OMS↔WMS departure sync）| Phase 8 §1.12 修法 |
| Bug 6（pick 污染 item_locations）| Phase 5 schema 修，Phase 8 service 實作驗證 |
| Bug 8（logistic-service 只 YunExpress）| Phase 7 走 carrier 抽象層解掉 |

---

## 5. Fuuffy 借鏡

### 5.1 借鏡 B5（主檔 vs 動作快照拆分 ⭐⭐⭐⭐⭐）— 持續完整實作

Phase 8 完整套用：
- outbound_requests（主檔）
- outbound_boxes（箱主檔）
- outbound_box_weights（複重快照，append-only）
- outbound_scans（員工物理動作 append-only）
- box_inbound_links（中介表 append-only）
- outbound_action_logs（outbound 級動作 append-only，Phase 7 已建）

主檔可被 update（status 流轉），動作 / 快照集合 append-only。

### 5.2 借鏡 B1（log_item_action 結構化動作日誌 ⭐⭐⭐⭐⭐）

outbound_scans + inbound_scans 走 fuuffy B1 結構：
- enum action（type 欄位）+ 自由 details JSON
- 操作者紀錄（operator_staff_id）
- 時間戳不可修改
- append-only

### 5.3 借鏡 B6（多包裹綁主出貨單 ⭐⭐⭐⭐）

Phase 7 已建 outbound_inbound_links（outbound:inbound）。Phase 8 加：
- box_inbound_links（box:inbound）

兩層中介表 append-only，完整對應「outbound : box : inbound」三層 N:N:N 關係。

### 5.4 借鏡 B6 列印模板註冊制 ⭐⭐⭐ — Phase 8 部分實作

Phase 7 已建 pdfService.generateMockLabel。Phase 8 擴展：
- generateMockLabel（label PDF）
- 預留 generatePackingList / generateBoxLabel / generateLocationLabel（Phase 9 / 後 phase）

v1 範圍只完整實作 mock label，其他 placeholder。

### 5.5 借鏡 B2（WebhookService dispatch ⭐⭐⭐⭐⭐）

Phase 8 OMS↔WMS sync 沿用 Phase 7 WebhookDispatcher（HMAC + retry + audit）。carrier API call 也走同 dispatcher。

### 5.6 借鏡 B7（warehouse-level scan_config）— 持續沿用

複重容差 v1 寫死 0.5kg，未來走 warehouses.scan_config（B7 既有）擴充。

### 5.7 死守 A1（carrier 抽象層）

Phase 8 carrier label / cancel 完全走 adapter pattern。新增 carrier 只加 adapter file，不動主邏輯。

### 5.8 死守 A4（沒 wallet → 每張單獨立付款）

Phase 8 不收運費，但餘額閘走 walletService。pre-flight check 包含餘額檢查。

### 5.9 避坑 A2（silent stub return success）

Phase 8 carrier label call 失敗：
- mock adapter throw（不靜默回 success）
- real adapter throw + 寫 carrier_api_logs
- triggerLabelGeneration 接住 throw → 降級 status + notification
- **絕對不 silent fail**

對齊 Phase 7 §5.6（mock 也要遵守）。

### 5.10 避坑 A5（不要「請聯絡客服取消」當萬能）

Phase 8 任何業務動作都有結構化 enum + 後台動作按鈕：
- pick 失敗 → admin retry endpoint
- 複重 override → 結構化原因（packaging_added / inbound_misweighed / customer_added_items / other）
- label 失敗 → held_reason enum + UI 對應動作
- 客戶不點 label → admin retry-label endpoint

「聯絡 CS」只在 capacity_violation 場景作為提示（業主對齊 Q1）。

### 5.11 避坑 A6（萬能 remarks）

employee_note / staff_note / cancel_reason 純供 audit 看，不做業務邏輯。所有業務分流走結構化 enum。

---

## 6. Acceptance Criteria（給 Claude Code）

### AC-8.1 PDA 揀貨基本流程

**Given** outbound OUT-X status=ready_for_label，含 3 筆 inbound（已 received，在庫位 A001 / A005 / B003）
**When** 員工 PDA 進 `/scan/pick`，選 OUT-X，掃 A001 + I-001
**Then**

- atomic 驗證 inbound 屬於 OUT-X、status=received、item_locations.locationCode='A001'
- item_locations: currentStatus='in_storage' → 'picked'，**locationCode 不變**
- inbound_request: status=received → picking
- 寫 outbound_scans type=inbound_picked, pick_method=pda_scan
- outbound: status=ready_for_label → picking（首次揀觸發）

**測試**：

- 庫位錯（員工掃 A002 但 inbound 在 A001）→ 4xx `LOCATION_MISMATCH`
- inbound 不屬於選中 outbound → 4xx
- inbound 已 picked → 4xx `INBOUND_ALREADY_PICKED`
- **驗證 Bug 6 修法**：item_locations.locationCode 仍為 'A001'（不變成 staff_id）

### AC-8.2 PDA 揀完通知去桌面裝箱

**Given** OUT-X 含 3 筆 inbound，員工已揀 2 筆
**When** 員工 PDA 揀第 3 筆完成
**Then**

- outbound: status=picking → picked
- 寫 outbound_scans type=outbound_pick_complete
- PDA 跳 Modal「OUT-X 已揀完！請往電腦端裝箱」
- 桌面端待裝箱清單（polling 30 秒）刷新後出現 OUT-X

**測試**：

- 員工點 [前往桌面端] → PDA 顯示 QR code 含 URL
- 員工點 [繼續揀別單] → Modal 關閉，PDA 回 outbound 選擇步驟
- outbound status=picked 後 PDA 不能再揀此 outbound（dropdown 不顯示）

### AC-8.3 桌面批次揀貨

**Given** OUT-X status=picked / picking，員工進 `/operations/pick`
**When** 員工勾選 OUT-X 的 3 筆 inbound + 點 [全部揀完]
**Then**

- 全部 inbound 一次 update item_locations + inbound_request status
- 全部寫 outbound_scans type=inbound_picked, pick_method=desktop_batch
- outbound: ready_for_label → picking → picked（自動推進）
- 寫 outbound_scans type=outbound_pick_complete

**測試**：

- 部分 inbound 已被 PDA 揀過（status=picking）→ 桌面批次中跳過或 4xx
- 並發：PDA + 桌面同時動 inbound → mongo atomic 一個成功一個 4xx

### AC-8.4 桌面裝箱基本流程

**Given** OUT-X status=picked，3 筆 inbound 已揀（status=picking）
**When** 員工進 `/operations/pack`，選 OUT-X，建箱（含 I-001 + I-002，dimensions 30x25x15，est weight 4.0kg）
**Then**

- 建 outbound_box record _id 自動產生，box_no='B-OUT...0001-01'
- 建 box_inbound_links 2 筆（I-001 + I-002）
- inbound_request: status=picking → packed（per inbound）
- 寫 outbound_scans type=box_created
- outbound: status=picked → packing（首次裝箱觸發）

**測試**：

- 缺 dimensions → 4xx
- inbound 已被裝進其他箱 → 4xx `INBOUND_ALREADY_BOXED`
- inbound 不屬於 OUT-X → 4xx
- inbound status≠picking → 4xx
- 第二箱 box_no 自動推 'B-OUT...0001-02'

### AC-8.5 全部裝箱完成

**Given** OUT-X 已建 3 箱，全部 inbound 都裝進箱
**When** 員工點 [全部裝箱完成]
**Then**

- 驗證所有 inbound 都已 box_inbound_links 綁某箱（unlinked_at=null）
- outbound: packing → packed
- outbound_box: 全部 packing → packed
- 寫 outbound_scans type=outbound_pack_complete

**測試**：

- 有 inbound 未裝箱 → 4xx `NOT_ALL_INBOUNDS_BOXED`
- 已 packed → 4xx（重複 complete）

### AC-8.6 PDA 複重 step 1+2 通過

**Given** OUT-X status=packed，3 箱
**When** 員工 PDA 進 `/scan/weigh`，掃 box_no=B-OUT...0001-01，量 actual=4.6kg、皮重=0.5kg
**Then**

- expected = sum(inbound.actualWeight) + tare = 4.0 + 0.5 = 4.5
- diff = 4.6 - 4.5 = 0.1 < 0.5kg → 通過
- 寫 outbound_box_weights record（tolerance_passed=true）
- box: packed → weight_verified
- 寫 outbound_scans type=box_weight_verified, weigh_method=pda

**測試**：

- |diff| >= 0.5kg → 警告 Modal，員工點 [確認通過] → outbound_box_weights.tolerance_passed=false + outbound_scans type=box_weight_override
- box 不存在 → 4xx
- box.status≠packed → 4xx
- 重複量同一箱 → 第二筆 outbound_box_weights record 覆蓋第一筆（update by box_id unique）

### AC-8.7 全箱複重通過 trigger 推 OMS

**Given** OUT-X 全 3 箱已 weight_verified
**When** 員工 PDA 量第 3 箱 → 系統判斷全箱通過
**Then**

- outbound: packed → weighing → weight_verified
- 計算 total_weight_actual + total_dimension_actual
- 重新 rate quote（rate_quote_pre_label snapshot）
- capacity check（純警告，violations 寫 outbound.capacity_check_result）
- 寫 outbound_scans type=outbound_weight_verified
- 推 OMS sync `outbound-weight-verified` 含箱級資訊
- OMS 端 oms.outbound_boxes mirror 寫入

**測試**：

- 箱數對不上（系統紀錄 3 箱，員工只量 2 箱）→ 4xx `BOX_COUNT_MISMATCH`
- capacity violation → 不擋，純警告 + payload 含 violations array

### AC-8.8 路線 1 系統自動 trigger label

**Given** OUT-X processing_preference='auto'，weight_verified 後
**When** onOutboundWeightVerified 觸發
**Then**

- 0 秒延遲 trigger triggerLabelGeneration({ operator_type: 'system' })
- pre-flight check 通過
- 對每箱 carrier API getLabel
- 全成功 → outbound: label_obtaining → label_obtained
- 寫 N 筆 box record（label_pdf_path / tracking_no_carrier / actual_label_fee）
- 寫 outbound_scans type=label_obtained per box
- 寫 notification type=outbound_label_obtained

**測試**：

- 餘額 < 0 → 失敗降級 status=pending_client_label + held_reason='insufficient_balance'
- carrier auth failed → held_reason='carrier_auth_failed'
- capacity violation → held_reason='capacity_violation'
- carrier API 500 → held_reason='carrier_api_failed'
- 失敗時 outbound 不 throw 給上層（系統 auto trigger，客戶看 notification）

### AC-8.9 路線 1 失敗降級

**Given** OUT-X processing_preference='auto'，自動 trigger label 失敗（held_reason='carrier_auth_failed'）
**When** 客戶開 `/zh-hk/outbound/[id]/confirm-label`
**Then**

- UI 顯示「您的 single 直發失敗：Carrier 認證失效」+ [重新綁定]
- 客戶處理後（重新綁 carrier）→ 點 [取得 Shipping Label]
- 走 triggerLabelGeneration({ operator_type: 'client' })
- 通過 → 流程回正軌

**測試**：

- 客戶 retry 仍失敗 → 同樣降級回 pending_client_label，可繼續 retry
- 客戶不 retry 超 2 工作天 → WMS dashboard banner 顯示 → CS 介入

### AC-8.10 路線 2 客戶手動取 label

**Given** OUT-Y processing_preference='confirm_before_label'，weight_verified 後
**When** onOutboundWeightVerified 觸發
**Then**

- outbound: weight_verified → pending_client_label
- 寫 notification type=outbound_pending_client_label

**When** 客戶開 confirm-label 頁，看箱級資訊 + 重新試算 fee
**When** 客戶點 [取得 Shipping Label]
**Then**

- 走 triggerLabelGeneration({ operator_type: 'client' })
- 成功 → status: pending_client_label → label_obtaining → label_obtained

**測試**：

- 失敗 → 降級回 pending_client_label
- 客戶 status=label_obtaining 時點取消 → 4xx `OUTBOUND_NOT_CANCELLABLE`
- atomic 防止 double click（status=label_obtaining 後不允許再 trigger）

### AC-8.11 員工列印 / 貼 label 完成

**Given** OUT-X status=label_obtained，3 箱有 label_pdf_path
**When** 員工進 `/operations/label-print`，點 [列印全部 label]
**Then**

- 系統合併 3 個 PDF（pdfService.mergeBoxLabels）送列印機
- 員工列印取得 3 張 label

**When** 員工貼 label 後點 [貼 label 完成]
**Then**

- outbound: label_obtained → label_printed
- 寫 outbound_action_logs type=label_printed

**測試**：

- status≠label_obtained 不允許列印 / complete
- v1 不做 PDA verify（員工自己對應）

### AC-8.12 PDA 離倉掃箱

**Given** OUT-X status=label_printed，3 箱有 box_no
**When** 員工 PDA 掃 box_no=B-OUT...0001-01
**Then**

- atomic 驗證 box.status=label_printed
- box: label_printed → departed
- 寫 outbound_scans type=box_departed
- outbound 仍 label_printed（未全箱掃完）

**When** 員工掃完 3 箱
**Then**

- outbound: label_printed → departed
- 寫 outbound_scans type=outbound_departed
- 對應 inbound: status=packed → departed
- 寫 inbound_scans type=outbound_departed
- 推 OMS sync `outbound-departed`
- 寫 notification type=outbound_departed

**測試**：

- 重複掃同箱 → 4xx `BOX_ALREADY_DEPARTED`
- 掃不存在的 box_no → 4xx
- box 屬於別 outbound → 不擋（系統依 box_no 找對應 outbound）
- 全箱掃完才 outbound departed（不能掃 1 箱就標記）

### AC-8.13 取消條件加嚴

**Given** OUT-X
**When** 客戶嘗試取消，依 status：

- ready_for_label / held / pending_client_label → 200 OK
- label_obtaining → 4xx `OUTBOUND_NOT_CANCELLABLE`
- label_obtained / label_printed → 4xx
- departed → 4xx

**測試**：

- admin 對 label_obtaining 後 outbound 走 admin-force-cancel endpoint → 200
- admin force cancel 寫 audit + 通知客戶 + cancel labels（透過 carrier cancelLabel）

### AC-8.14 Bug 修復

**Given** Phase 5 既存 / Phase 8 新建 outbound 走完整流程
**When** outbound departed 推 OMS
**Then**

- **Bug 2 驗證**：sync payload 不含重複 orderIds
- **Bug 3 驗證**：OMS 接收不做嚴格長度比對，dedup 後 update
- **Bug 4 驗證**：error-list 含 ORDER_NOT_FOUND key（不再 fallback 500）
- **Bug 5 驗證**：CANCEL case 有 break，正確回應
- **Bug 6 驗證**：item_locations.locationCode 在 pick 後仍為原值（如 A001），未變成 staff_id

### AC-8.15 Mock Carrier Label 完整實作

**Given** PHASE8_USE_MOCK_CARRIER=true
**When** triggerLabelGeneration 觸發 mock adapter getLabel
**Then**

- 對每箱 sleep 2-3 秒模擬 carrier API delay
- pdfService 動態生成 A6 PDF：含 [MOCK] 警告 + box_no / tracking / 收/寄地址 / 重量
- tracking_no='MOCK-{carrier}-{outbound_id}-BOX{n}'
- 寫 box.label_pdf_path + tracking_no_carrier
- raw_response 含 mock=true

**測試**：

- mock_force_error_type='auth_failed' → throw + held_reason='carrier_auth_failed'
- mock_force_error_type='capacity_violation' → throw 422 + 詳細違規
- multi-box outbound（3 箱）→ 3 個獨立 PDF + 3 個不同 tracking
- mock token 前綴防範（mock_* token 切 prod 後拒絕）

### AC-8.16 admin Retry / Cancel Label

**Given** OUT-X status=pending_client_label + held_reason='carrier_api_failed'
**When** admin POST `/api/wms/outbound/:id/admin-retry-label`
**Then**

- 走 triggerLabelGeneration({ operator_type: 'admin', operator_id: admin_id })
- 成功 → 流程回正軌
- 失敗 → 同樣降級

**Given** OUT-Y status=label_obtained
**When** admin POST `/api/wms/outbound/:id/admin-cancel-label` body { reason: '客戶協調取消' }
**Then**

- 對每箱 carrier cancelLabel API
- box: label_obtained → cancelled
- outbound: label_obtained → cancelled_after_label
- 寫 audit + notification

**測試**：

- mock cancelLabel 純 stub return success
- 真實 carrier 不允許 cancel → carrier API 回 422 → throw
- status=departed 不允許 cancel → 4xx

### AC-8.17 WMS Dashboard Banner（待 label 超 2 工作天）

**Given** OUT-X status=pending_client_label + weight_verified_at < (now - 2 工作天)
**When** WMS dashboard 載入
**Then**

- banner 顯示「待客戶取 label 超 2 工作天: N 筆」
- 點 [看清單] → 跳清單頁顯示對應 outbound

**測試**：

- 排除 status=pending_client_label 但 weight_verified_at 在 2 工作天內的
- 工作天計算（排除週末 / 業主可調 .env config）

### AC-8.18 客戶端「選 single 強制 auto」UI

**Given** 客戶在 OMS 預報頁 selecting single 直發
**Then**

- shipment_type='single' 時，UI 不顯示 processing_preference 選項
- 表單 default outbound.processing_preference='auto'（系統強制）
- form 試圖傳 single + processing_preference='confirm_before_label' → 4xx

**測試**：

- 客戶 settings 設 default='confirm_before_label'，但建 single inbound 時仍強制 auto
- 客戶建 consolidated outbound 時 default 帶 settings 值

### AC-8.19 PDA / 桌面複重 method 區分

**Given** OUT-X 部分箱 PDA 量、部分箱桌面量
**When** 全箱量完
**Then**

- outbound_box_weights 各筆 weigh_method 各自記錄（pda / desktop）
- outbound_scans type=box_weight_verified weigh_method 各記
- 不影響業務流程，純 audit

### AC-8.20 multi-box outbound 全流程

**Given** OUT-X 含 5 inbound，pack 拆 3 箱
**When** 員工走完 pick → pack → weigh → label → print → depart
**Then**

- 3 個 box 各自 status 流轉
- 3 張獨立 label PDF + 3 個 tracking
- 3 個 box 各自掃 depart
- 全部 departed 後 outbound 才 departed
- inbound（5 筆）全部 status=departed
- 客戶 OMS 看到 3 個 tracking

**測試**：

- 任一箱 weigh 失敗 → 全 outbound 卡 weighing
- 任一箱 label 失敗 → 全 outbound 降級 pending_client_label（不允許 partial label）
- 任一箱 depart 後員工放棄 → status 留 label_printed，可繼續

### AC-8.21 處理偏好 default 行為

**Given** 客戶 A 的 settings.outbound_processing_preference='confirm_before_label'
**When** 客戶 A 建 consolidated outbound（Phase 7 §3.3）
**Then**

- 表單 default 帶 confirm_before_label
- 客戶可 override 改 auto

**When** 客戶 A 建 single inbound 觸發 outboundService.autoCreateForSingle
**Then**

- outbound.processing_preference 強制='auto'（不 follow settings）

### AC-8.22 outbound 列表 status badge

**Given** 客戶有多筆 outbound 各狀態
**When** 客戶看 `/zh-hk/outbound/list`
**Then**

- 顯示中文 status：
  - ready_for_label = 待出庫
  - held = 暫停（依 held_reason 顯示原因）
  - picking = 揀貨中
  - picked = 待裝箱
  - packing = 裝箱中
  - packed = 待複重
  - weighing = 複重中
  - weight_verified = 待運單（路線 1 短暫）/ 待客戶確認（路線 2 短暫）
  - **pending_client_label = 等待運單**（業主對齊命名）
  - label_obtaining = 取運單中
  - label_obtained = 待列印
  - label_printed = 待離倉
  - departed = 已出貨
  - cancelled = 已取消

**測試**：

- pending_client_label 狀態若 processing_preference=auto → tab badge 顯示「失敗待處理」
- pending_client_label 狀態若 confirm_before_label → tab badge 顯示「待您確認」

### AC-8.23 Cross-service Sync 完整測試

**Given** Phase 8 各個 stage 完成
**When** 各 sync endpoint 推 OMS
**Then**

- pick-progress / pack-progress / weight-verified / label-obtained / label-failed / departed 各自 sync
- OMS 端 outbound_requests mirror update + outbound_boxes mirror upsert
- sync 失敗 → WMS 寫 sync_failed_logs，不 rollback 業務
- X-Internal-Sync header 沿用 Phase 4 §AC-4.17 機制

---

## 7. 風險點 + 已知 gotcha

### 7.1 PDA 揀完跨工作站問題

業主對齊 Q1d：v1 default 一個員工從頭到尾，schema 支援分工但不做 UI。

風險：員工 PDA 揀完去桌面裝箱中間切裝置 / 員工分工時操作員不一致。

**處理**：
- v1 純依員工自律
- outbound_scans.operator_staff_id 各動作各記
- 未來 phase 加分工 UI 時可從 audit 看員工各動作

### 7.2 並發揀貨 / 裝箱 / 複重 race

scenario：兩員工同時對同 outbound / 同 inbound / 同 box 操作。

**處理**：
- 全部走 mongo atomic findOneAndUpdate
- 失敗者 4xx，UI 顯示「狀態已變動，請重整」
- v1 不做更複雜的衝突解決

### 7.3 路線 1 自動 trigger label 跟客戶取消 race

業主對齊 Q3：自動取 label 優先，做到此步不能取消（除非 admin 介入）。

scenario：
```
T0  outbound complete weigh，processing_preference=auto
T1  系統 trigger label（status: weight_verified → label_obtaining）
T1' 同時客戶 OMS 點取消（status check 在 cancellable 列表）
```

**處理**：
- mongo atomic：status filter 防 race
- T1 先 wins → status=label_obtaining，T1' filter 不滿足 → 4xx
- T1' 先 wins → status=cancelled，T1 filter 不滿足 → throw 由 onOutboundWeightVerified 接住，純 log warning

實際 ms 級 race 罕見，業務上 v1 接受。

### 7.4 capacity_rules 在複重後才驗

Phase 7 capacity check 在「客戶建單試算」階段做。Phase 8 weight_verified 後再驗一次（用實重）。

scenario：建單時試算過 capacity OK，但實際 pack 後超 capacity。

**處理**：
- 純警告（業主對齊問題 6）
- 推 OMS 帶 capacity_violations，客戶 UI 顯示 + 提示「請聯絡 CS」
- 客戶仍可強制取 label
- 取 label 時若 carrier API 拒收 → 走 carrier_api_failed 降級流程

### 7.5 multi-box outbound partial label 失敗

scenario：3 箱 outbound，第 1 箱 carrier API 成功，第 2 箱 carrier API timeout。

**處理**：
- triggerLabelGeneration 跑迴圈 per box，任一 box 失敗 → throw
- 但前面已成功的 box 已寫 label_pdf_path / tracking_no
- 整個 outbound status 卡 label_obtaining

選項：
- **(a) rollback 已成功 box**（cancel 已取的 label）：複雜，carrier 可能不支援 cancel
- **(b) 不 rollback，標記 outbound 部分成功**：客戶 retry 時系統知道哪幾箱已成功，只 trigger 失敗的箱
- **(c) outbound 卡死，admin 介入**：v1 簡化

我建議 **(b)** v1 default：
- box 級 status=label_obtained（成功的）/ 仍 packed 等 retry（失敗的）
- triggerLabelGeneration retry 時跳過已 label_obtained 的 box
- outbound status 取決於全部 box 是否都 label_obtained
- admin 後台 manual cancel partial label 走 admin-cancel-label endpoint per box

OK 嗎？這是 v1 範圍我建議的，需要你確認。

### 7.6 客戶端 onBlur lookup unclaimed 跟 Phase 6 衝突

無此衝突，Phase 8 不涉及 unclaimed lookup。

### 7.7 Mock 階段 PDF 累積

沿用 Phase 7 §7.18：dev 階段累積 mock PDF，README 標 dev 定期清。

### 7.8 carrier credentials 失效 hook

業主對齊 Q2：carrier_auth_failed → 客戶手動處理。

新 hook：`carrierService.onCredentialsRefreshed` → 解綁 held_reason='carrier_auth_failed' 的 outbound。但「重新綁定 carrier」是 Phase 2 行為，不一定觸發 hook（要 Phase 2 加 hook 點）。

**v1 處理**：
- 客戶重綁 carrier 後系統純通知「您可重試取 label」
- 客戶手動到 outbound 詳情頁點 [取得 Shipping Label]
- 不做自動觸發（避免複雜化）

### 7.9 Phase 7 對齊衝擊（Phase 7 v1.2 同步更新）

Phase 8 對 Phase 7 的修改：

1. processing_preference enum 語意變更：auto = 系統自動 trigger（複重後 0 秒）/ confirm_before_label = 客戶手動點
2. 取消條件加嚴：status=label_obtaining 後不可取消
3. UI framing：confirm-label 頁依 processing_preference + held_reason 動態顯示
4. single 強制 auto：UI 不顯示偏好選項
5. held_reason 擴充 3 個（carrier_auth_failed / capacity_violation / carrier_api_failed）

Phase 7 markdown 同步更新 v1.2（見 §9.1）。

### 7.10 mock vs prod 切換時的 carrier credentials 處理

沿用 Phase 2 §8.1.1：mock token 前綴 mock_*，prod 拒絕。Phase 8 階段：
- mock 階段：carrier API call 永遠成功（除非 force_error）
- prod 切換：mock token 失效，客戶要重綁 carrier
- 切換期間：dev 用 staging 環境 dry run，不影響 prod 客戶

### 7.11 員工貼錯 label

scenario：3 箱 label，員工貼錯（box 1 貼成 box 2 的）。

業主對齊問題 4：v1 不做 PDA verify，員工自己對應。

**處理**：
- 純 audit：outbound_action_logs type=label_printed 寫一筆
- 出包後客戶投訴 → CS 看 audit + carrier 系統對照
- 未來 phase 加 PDA verify（員工貼後掃箱 + 掃 label tracking 對應）

### 7.12 weight_diff 邊界測試

業主對齊問題 3：差距 ≥ 0.5kg 跳警告 + 員工點確認通過（無需理據）。

實作細節：
- 容差 0.5kg 寫死 v1，未來走 master data
- |diff| 用絕對值
- diff = 0.4 → 通過、diff = 0.5 → 警告（含等號）
- 重新量 → outbound_box_weights 同 box_id 走 update（一箱只留一筆 weight record）

但「重新量」可能出包：員工量錯第一次 → 系統存了不對的值 → 員工量第二次 → 系統 update。如果第一次過了 box.status=weight_verified，第二次量會碰到 status check 失敗。

**v1 處理**：
- box.status=weight_verified 後不允許重新量
- 員工發現量錯 → admin 後台改 status 退回 packed → 員工重量

或：
- box.status=weight_verified 後員工可重新量，update record（第一次 weight 紀錄保留在 outbound_scans audit）

我建議 **後者**（沿用 mongo update 風格），保留 audit 追溯。

### 7.13 pdfService 多 PDF 合併

員工列印 N 張 label 時點 [列印全部 label]，系統合併 N 個 PDF 送列印機。

**v1 處理**：
- pdfService.mergeBoxLabels 用 pdf-lib 合併
- 合併後檔案臨時存於 `/uploads/temp/`，列印後 60 分鐘 cron 清
- 員工瀏覽器新 tab 開合併 PDF → 系統自動 trigger 列印

### 7.14 員工帳號 + staff_id

業主對齊 Q9：v1 reuse admin 帳號，schema 預留 staff_id。

**處理**：
- outbound_scans.operator_staff_id 統一填 'STAFF-ADMIN'（Phase 5 §2.6 既有 seed）
- 未來分權時 schema 不變，新員工 record 各自有 staff_id

### 7.15 weighed_at 跨 PDA / 桌面時間戳

員工部分箱 PDA 量、部分箱桌面量，weighed_at 各自取 server time，可能跨小時。

**v1 處理**：
- outbound_box_weights.weighed_at 各自 server time
- outbound.weight_verified_at 取最後一箱通過時間
- 客戶看 outbound 級時間戳

---

## 8. 開發順序建議（Phase 8 內部分階段）

| Sub-step | 內容 | 對應 AC |
|---|---|---|
| **8.0** | schema 地基 + Bug 2/3/4/5 修法 + Phase 7 markdown v1.2 同步更新 | AC-8.14 |
| **8.1** | Stage 5 揀貨：PDA + WMS 桌面雙路徑 + outbound_scans + 通知 | AC-8.1, 8.2, 8.3 |
| **8.2** | Stage 6 裝箱：桌面 UI + outbound_boxes + box_inbound_links | AC-8.4, 8.5 |
| **8.3** | Stage 7 step 1+2 複重：PDA + 桌面雙路徑 + outbound_box_weights + capacity check | AC-8.6, 8.7, 8.19 |
| **8.4** | carrier label adapter 完整：mock getLabel + cancelLabel 強化 + pdfService 擴展 | AC-8.15 |
| **8.5** | triggerLabelGeneration core function + 路線 1 自動 trigger + 路線 2 客戶手動 | AC-8.8, 8.9, 8.10, 8.11 |
| **8.6** | OMS confirm-label 頁 UI 改造（依 processing_preference + held_reason 動態 framing） | AC-8.10, 8.18 |
| **8.7** | Stage 7 step 3 員工列印 / 貼 label 完成 | AC-8.11 |
| **8.8** | Stage 8 PDA 離倉掃箱 + 全箱掃完才 outbound departed | AC-8.12, 8.20 |
| **8.9** | admin 後台 retry / cancel label / force cancel + WMS dashboard banner | AC-8.16, 8.17 |
| **8.10** | Cross-service sync + multi-box partial label 失敗處理 + 並發 race 測試 | AC-8.13, 8.21, 8.23 + §7.5 |

每完成一步跑對應 AC 測試 + Phase 4-7 既有功能不破壞驗證。

**Sub-step 細節**：

### 8.0 schema 地基

- 建 outbound_boxes / box_inbound_links / outbound_box_weights / outbound_scans
- inbound_scans type enum 擴充
- outbound_action_logs action enum 擴充
- outbound_requests 新欄位
- clients.preferences.outbound_processing_preference 語意更新
- carriers.supports_label_api 改 true
- 修 Bug 2/3/4/5（OMS error-list / sync 邏輯 / cancel break）
- 同步更新 Phase 7 markdown v1.2（見 §9.1）

### 8.1 揀貨

- POST `/api/wms/outbound/:id/pick/scan`（PDA）
- POST `/api/wms/outbound/:id/pick/batch`（桌面）
- frontend `/scan/pick` PDA UI + `/operations/pick` 桌面 UI
- PDA 揀完通知 + 桌面待裝箱清單 polling 30 秒
- 驗證 Bug 6 修法（item_locations.locationCode 不變）

### 8.2 裝箱

- POST `/api/wms/outbound/:id/box`（建箱）
- POST `/api/wms/outbound/:id/pack/complete`
- frontend `/operations/pack` 桌面 UI
- box_no 自動生成 + box_inbound_links append-only

### 8.3 複重

- POST `/api/wms/outbound/:id/box/:box_id/weigh`
- POST `/api/wms/outbound/:id/weigh/complete` trigger 推 OMS
- frontend `/scan/weigh` PDA + `/operations/weigh` 桌面
- 容差判斷 0.5kg + override Modal
- 推 OMS sync `outbound-weight-verified` 含箱級資訊
- OMS 端 oms.outbound_boxes mirror schema 建立

### 8.4 carrier label adapter

- MockCarrierLabelAdapter + getLabel + cancelLabel 完整實作
- pdfService.generateMockLabel（A6 size + [MOCK] 警告）
- pdfService.mergeBoxLabels（多 PDF 合併）
- YunExpressLabelAdapter / FuuffyLabelAdapter（getLabel placeholder，prod 切換才實作）
- 4 種 mock_force_error_type 涵蓋

### 8.5 triggerLabelGeneration

- core function 涵蓋路線 1 + 路線 2 共用邏輯
- pre-flight check（餘額 / carrier auth / capacity）
- per box getLabel + 失敗降級 status=pending_client_label
- multi-box partial label 失敗處理（已成功 box 不 rollback）

### 8.6 OMS confirm-label UI

- frontend `/zh-hk/outbound/[id]/confirm-label` 改造
- 依 processing_preference + held_reason 動態 framing
- 支援 capacity_violation 顯示 violations 列表 + 「請聯絡 CS」提示

### 8.7 員工列印 / 貼 label

- POST `/api/wms/outbound/:id/label/print-complete`
- frontend `/operations/label-print` 桌面 UI
- pdfService.mergeBoxLabels 串接

### 8.8 離倉

- POST `/api/wms/box/depart`
- frontend `/scan/depart` PDA UI
- 全箱掃完判斷 + outbound departed + inbound departed
- 推 OMS sync `outbound-departed`

### 8.9 admin 後台 + dashboard banner

- admin-retry-label / admin-cancel-label / admin-force-cancel endpoints
- frontend admin 操作 UI（沿用 Phase 7 outbound 詳情頁加按鈕）
- WMS dashboard banner（待 label 超 2 工作天）+ 對應清單頁
- 工作天計算 helper（v1 排除週六日）

### 8.10 sync + 並發測試

- 全 sync endpoints
- multi-box partial label 失敗 case 測試
- 並發 race 測試
- 跑全部 AC

---

## 9. Phase 7 markdown 同步更新（v1.2）

### 9.1 Phase 7 v1.2 變更摘要

寫 Phase 8 markdown 時同步要更新 Phase 7：

| 章節 | 變更內容 |
|---|---|
| §0.3 範圍 | 加註：「processing_preference 語意 v1.2 更新，見 §1.4 改造」|
| §1.4 處理偏好設定 | 兩個 enum 描述更新：auto = 系統自動 trigger（複重後 0 秒）+ 失敗降級到 confirm_before_label 流程；confirm_before_label = 客戶手動點 |
| §1.6 Outbound 取消 | 取消條件加嚴：`label_obtaining` 後不可取消（Phase 8 業主對齊 Q3）|
| §1.9 出貨前確認模式取 label | 改寫：此頁原 confirm_before_label 專屬，v1.2 起變所有路線通用；UI framing 依 processing_preference + held_reason 動態 |
| §2.1 outbound_requests | held_reason enum 擴充 3 個（carrier_auth_failed / capacity_violation / carrier_api_failed），跨 reference Phase 8 §2.1 |
| §2.4 clients | 加註：「single 模式強制 auto，不 follow 此 default」|
| §6 AC-7.7 取消 | 加狀態：label_obtaining 後 4xx |
| §6 AC-7.8 confirm-label | 改寫支援所有路線（不只 confirm_before_label），UI framing 不同 |
| §7 風險點 | 加 7.x 取消 race（業主對齊 Q3 自動取 label 優先）|
| §9 變更紀錄 | 加 v1.2：「processing_preference 語意更新 / 取消條件加嚴 / single 強制 auto / confirm-label 頁變所有路線通用 / held_reason 擴充」|

實際操作：寫完 Phase 8 markdown 後跑 Phase 7 update（沿用 str_replace 模式）。

---

## 10. 變更紀錄

| 版本 | 日期 | 說明 |
|---|---|---|
| v1.0 | 2026-05-08 | Phase 8 首次定稿。業務決策：4 階段（揀貨 / 裝箱 / 複重 / 離倉，不做 palletize）/ 揀貨 PDA + 桌面雙路徑 / PDA 揀完通知去桌面裝箱 / 裝箱桌面 only / 複重 PDA + 桌面雙路徑（前 2 步），客戶取 label 強制 OMS / 0.5kg 容差 + override 無需理據 / 箱數對不上必擋 / 取 label 主導權回歸客戶（Phase 7 對齊 v1.2）/ 路線 1 single 強制 auto + 系統 0 秒自動 trigger / 路線 1 失敗降級到 pending_client_label / 路線 2 客戶手動 / 取 label 後不可取消（admin 介入）/ multi-box per box 一張 label / 離倉 PDA 逐箱掃裝箱號全箱掃完才 outbound departed / 2 工作天 SLA WMS dashboard banner / mock 完整實作（pdfService + 4 種 error type）/ 修 ShipItAsia Bug 2-6 / Phase 7 v1.2 同步更新 |
