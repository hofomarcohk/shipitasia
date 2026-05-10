# Phase 6：無頭件處理 — CS 指派 + 客戶確認接收 + 客戶主動認領

> 集運 OMS+WMS v1 開發規格
> 版本：v1.0
> 日期：2026-05-08
> 範圍：WMS CS 看 unclaimed_inbounds 並指派客戶 / 客戶在 OMS 確認接收 + 補填資訊 / 客戶在預報建單時主動認領無頭件 / 撤銷指派 / disposed 流程
> 前置：Phase 1-5 已完成，特別依賴 Phase 4（inbound_request schema）+ Phase 5（unclaimed_inbounds + inbound_scans schema）
> 業務地位：v1 無頭件閉環 phase，連結倉庫實體貨物跟客戶帳號的「身份歸屬」決策

---

## 0. 前設

### 0.1 v1 業務參數（沿用 Phase 3-5）

| 項目 | v1 設定 |
|---|---|
| 全局幣別 | HKD |
| 處理費單價 | HKD$5 / 包（每筆 inbound）|
| 入庫地 | 日本（v1 一個倉：埼玉）|
| 收貨地 | 香港 |
| 申報幣別 | 依倉庫適配（埼玉倉 = JPY）|

### 0.2 業務量假設

v1 無頭件比例假設 5-10%（每天 1-2 筆）。半年累積 < 500 筆。CS 工作量小，UI 不需高度自動化。

### 0.3 範圍

**包含**：

- WMS CS 看 unclaimed_inbounds 列表 + 詳情頁（看照片 / 重量 / 員工備註）
- WMS CS 指派客戶（搜尋 / 直接輸入 client_id）
- WMS CS 指派時系統自動匹配既有 inbound_request → 提示 merge
- WMS CS 5 分鐘倒計時 + 客戶反應前可撤銷指派
- WMS CS 認定 disposed（v1 純改 status，物理 SOP 不在系統）
- OMS 客戶預報列表新增「待確認」tab（顯示被指派的無頭件）
- OMS 客戶接受 / 拒收（接受 = 跳獨立補填頁、拒收 = 退回 pending_assignment）
- OMS 客戶主動認領（建預報時 onBlur 自動匹配 unclaimed → inline 提示 + Modal 詳情）
- 認領後客戶建單頁加 banner，提交時走 received 流程（不跳頁）
- 客戶接受 / 認領補填提交 → 建 inbound_request status=received + 扣 HK$5
- assignment_history append-only 紀錄
- inbound_scans 寫 type=`unclaimed_assigned` / `unclaimed_self_claimed` / `unclaimed_rejected` / `unclaimed_disposed`
- expires_at schema 預備（v1 不啟用 expiry service）
- CS 指派 / 拒收的 4 種 reject_reason enum + email template（沿用 Phase 1 Resend）

**不包含**：

- v1 不做 expiry 自動 disposed（service 不啟用，schema 留 expires_at）
- 物理銷毀 SOP（業務範圍）
- AI 自動指派建議（後 phase）
- 客戶主動「瀏覽無頭件池認領」（v1 不開，太複雜）
- CS 工單 / 客戶溝通備註欄位（純制式通知，CS 自定備註不做）
- cs_action_logs 獨立 collection（靠 inbound_scans + assignment_history 已足）

### 0.4 技術棧

完全沿用 Phase 1-5 已建：

- mongo session transaction（指派 / 接受 / merge 流程跨 collection 寫入）
- walletService.charge_inbound（接受時觸發）
- outboundService.autoCreateForSingle（客戶主動認領選 single 時觸發，受 PHASE7_OUTBOUND_ENABLED env flag 控制）
- Resend email（CS 指派 / 客戶拒收通知）
- Phase 4 既有 trackingNo 重複檢查 lookup API（Phase 6 擴充）

### 0.5 UI 設計風格

完全沿用 ShipItAsia 既有 + Phase 4-5 慣例。新增頁面：

| 路徑 | 形態 | 場景 |
|---|---|---|
| `/zh-hk/operations/unclaimed-inbounds/[id]/assign` | Desktop-first | CS 指派頁 |
| `/zh-hk/inbound/confirm/[unclaimed_id]` | Mobile-friendly + Desktop | 客戶接收確認 + 補填獨立頁 |
| `/zh-hk/inbound/list` 加 tab | 既有頁加 tab「待確認」 | 客戶看被指派的無頭件 |
| `/zh-hk/inbound/new` 改造 | 既有預報建單頁 | onBlur 自動匹配 + inline 提示 + Modal + 認領 banner |

---

## 1. 業務流程

### 1.1 兩條無頭件處理路徑（總覽）

```
                  ┌────────────────────────┐
                  │  unclaimed_inbounds      │
                  │  status=pending_assignment│
                  └────────┬───────────────┘
                           │
              ┌────────────┴───────────────┐
              │                            │
       【路徑 A：CS 指派】          【路徑 B：客戶主動認領】
       CS 在 WMS 主動找客戶          客戶建預報時系統提示

         CS 指派 + 通知客戶          inline 提示 + Modal 詳情
              │                            │
        客戶 OMS 接受 / 拒收        客戶建單頁 [認領此貨]
              │                            │
       (接受) → 補填獨立頁         banner + 提交時走 received
              │                            │
              └──────┬─────────────────────┘
                     │
              建 inbound_request
              status=received
              扣 HK$5
              unclaimed.status=assigned
              assignment_history append
              inbound_scans 寫一筆
```

兩條路徑互斥（mongo atomic 防 race），但邏輯重疊 80%（共用補填頁 component / merge 邏輯）。

### 1.2 路徑 A：CS 指派 + 客戶接受

#### 1.2.1 CS 看 unclaimed 清單

路徑：`/zh-hk/operations/unclaimed-inbounds`（Phase 5 已建 read-only 列表，Phase 6 加指派按鈕）

```
[Unclaimed 清單 - Desktop 1280px]
═══════════════════════════════════════════════════════════════

篩選: [status: pending_assignment ▼] [carrier ▼] [日期區間]

┌──────────────────────────────────────────────────────────────┐
│ U-20260508-0001  / 佐川急便 / ABC123 / 2.5kg / 5/8 14:30   │
│ 員工備註: 外箱寫 ABC Trading                                  │
│ 已被 0 客戶拒收                                               │
│ [查看詳情] [指派客戶]                                         │
├──────────────────────────────────────────────────────────────┤
│ U-20260508-0002  / 雲途 / XYZ456 / 1.2kg / 5/8 15:10       │
│ 員工備註: 無發件人資訊                                        │
│ 已被 1 客戶拒收（client_def: not_mine）                       │
│ [查看詳情] [指派客戶]                                         │
└──────────────────────────────────────────────────────────────┘
```

#### 1.2.2 CS 指派頁

路徑：`/zh-hk/operations/unclaimed-inbounds/[id]/assign`

```
[CS 指派頁 - Desktop]
═══════════════════════════════════════════════════════════════

╔═ 無頭件詳情（左 60%）═════════╗ ╔═ 指派客戶（右 40%）═════════╗
║                                  ║ ║                                ║
║ U-20260508-0001                  ║ ║ 找客戶：                       ║
║ 入庫快遞: 佐川急便               ║ ║ [搜尋框：client_code/公司名]   ║
║ 追蹤號: ABC123                   ║ ║                                ║
║ 重量: 2.5 kg                     ║ ║ 或直接輸入 client_id:          ║
║ 尺寸: 30x25x15 cm                ║ ║ [text input]                   ║
║ 到倉: 2026-05-08 14:30           ║ ║                                ║
║ 員工備註: 外箱寫 ABC Trading     ║ ║ ─ 系統自動匹配 ─               ║
║                                  ║ ║ 此 trackingNo 同時存在於：     ║
║ ┌─ 照片預覽 ────────┐           ║ ║ ⚠️ 客戶 ABC Trading 已建預報   ║
║ │ [barcode photo]    │           ║ ║   I-20260509-0005 status=pend │
║ │ [package photo]    │           ║ ║   [一鍵 Merge 到此預報]        │
║ └────────────────────┘           ║ ║                                ║
║                                  ║ ║ ─────────────────              ║
║ 拒收歷史 (0):                    ║ ║                                ║
║ （無）                           ║ ║ [指派給客戶]（disabled，需選）  ║
║                                  ║ ║                                ║
║                                  ║ ║ [認定無人認領 → disposed]      ║
╚══════════════════════════════════╝ ╚════════════════════════════════╝

注意：
- 「自動匹配」是 server-side query：unclaimed.tracking_no_normalized 對應
  inbound_requests.tracking_no_normalized + status IN [pending, expired]
- 對到 → 提示「一鍵 Merge」
- 對不到 → 顯示「無自動匹配，請手動選客戶」
- 拒收歷史顯示之前哪些客戶拒收過（避免 CS 重複指派）
```

#### 1.2.3 CS 指派動作

CS 點 [指派給客戶 ABC] → server 執行：

```typescript
async function assignUnclaimed({ unclaimed_id, client_id, cs_staff_id }) {
  const session = await mongoose.startSession();
  await session.withTransaction(async () => {
    // 1. mongo atomic 驗證 status=pending_assignment
    const unclaimed = await UnclaimedInbound.findOneAndUpdate(
      { _id: unclaimed_id, status: 'pending_assignment' },
      { 
        $push: {
          assignment_history: {
            client_id,
            assigned_at: new Date(),
            assigned_by_staff_id: cs_staff_id,
            cancelled_at: null,
            rejected_at: null,
            accepted_at: null,
            reject_reason: null
          }
        }
      },
      { new: true, session }
    );
    
    if (!unclaimed) throw new Error('UNCLAIMED_NOT_AVAILABLE');
    
    // 2. 拒收歷史檢查（避免重複指派被拒過的客戶）
    const previouslyRejected = unclaimed.assignment_history?.some(
      h => h.client_id === client_id && h.rejected_at
    );
    if (previouslyRejected) throw new Error('PREVIOUSLY_REJECTED_BY_CLIENT');
    
    // 3. 寫 notification 給客戶
    await Notification.create({
      client_id,
      type: 'inbound_unclaimed_assigned',
      payload: { unclaimed_id, /* 制式內容 */ }
    }, { session });
    
    // 4. 寄 email（透過 Resend）
    await sendEmail({
      to: client.email,
      template: 'unclaimed_assigned',
      data: { unclaimed_id, deep_link: `/zh-hk/inbound/list?tab=pending_confirm` }
    });
    
    // 5. **不建 inbound_request**（客戶接受才建）
  });
}
```

**重點**：CS 指派階段**不建 inbound_request**，純粹寫 unclaimed.assignment_history + 通知。

#### 1.2.4 CS 撤銷指派（客戶反應前可撤）

CS 後悔 / 點錯 → 「客戶反應前」可撤銷：

```typescript
async function cancelAssignment({ unclaimed_id, cs_staff_id }) {
  // 找最新一筆 assignment_history
  const unclaimed = await UnclaimedInbound.findById(unclaimed_id);
  const latest = unclaimed.assignment_history?.slice(-1)[0];
  
  if (!latest) throw new Error('NO_ASSIGNMENT_TO_CANCEL');
  if (latest.cancelled_at) throw new Error('ALREADY_CANCELLED');
  if (latest.rejected_at) throw new Error('ALREADY_REJECTED_BY_CLIENT');
  if (latest.accepted_at) throw new Error('ALREADY_ACCEPTED_BY_CLIENT');
  
  // 標記 cancelled（append-only，不刪 record）
  await UnclaimedInbound.updateOne(
    { _id: unclaimed_id, 'assignment_history.assigned_at': latest.assigned_at },
    { $set: { 'assignment_history.$.cancelled_at': new Date() } }
  );
  
  // follow-up 通知客戶「先前指派已撤回」
  await Notification.create({
    client_id: latest.client_id,
    type: 'inbound_unclaimed_assignment_cancelled',
    payload: { unclaimed_id }
  });
}
```

撤銷條件（依「客戶反應」狀態判斷，沒時間視窗）：
- assignment_history 最後一筆 cancelled_at / rejected_at / accepted_at 都 null → 可撤
- 任一非 null → 不可撤

UI 設計：
- CS 在 unclaimed 詳情頁看到「已指派給客戶 ABC，等待回應」+ [撤銷指派] 按鈕
- 客戶接受 / 拒收後 → 按鈕 disabled

### 1.3 路徑 A：客戶接受 / 拒收（OMS 端）

#### 1.3.1 客戶看「待確認」tab

路徑：`/zh-hk/inbound/list?tab=pending_confirm`

預報列表頁加新 tab：

```
[預報列表 - OMS]
═══════════════════════════════════════════════════

[全部] [待到倉] [處理中] [已上架] [待確認 (1)] ← 新 tab
                                       ↑ 紅色 badge 數字

待確認 tab 內容：
┌────────────────────────────────────────────────┐
│ 🎯 系統指派的無頭件，請確認                    │
│                                                  │
│ U-20260508-0001                                  │
│ 入庫快遞: 佐川急便                               │
│ 追蹤號: ABC123                                   │
│ 重量: 2.5 kg / 尺寸: 30x25x15 cm                │
│ 到倉時間: 2026-05-08 14:30                       │
│ [貨物照片 thumbnail x 2]                         │
│ 員工備註: 外箱寫 ABC Trading                     │
│                                                  │
│ [接受並補填] [拒收]                              │
└────────────────────────────────────────────────┘
```

tab 內列表來源：unclaimed_inbounds 的 assignment_history 最後一筆 client_id = 當前登入客戶 + accepted_at / rejected_at / cancelled_at 都 null。

#### 1.3.2 客戶接受 → 跳補填獨立頁

點 [接受並補填] → 跳 `/zh-hk/inbound/confirm/U-20260508-0001`

```
[接收確認補填頁 - Mobile + Desktop responsive]
═══════════════════════════════════════════════════════════════

╔═ 貨物資訊（已填）═════════════════════════════╗
║ U-20260508-0001                                ║
║ 入庫快遞: 佐川急便    追蹤號: ABC123          ║
║ 重量: 2.5 kg          尺寸: 30x25x15 cm       ║
║ 到倉: 5/8 14:30                                ║
║ [照片 barcode] [照片 包裹]                    ║
║ 員工備註: 外箱寫 ABC Trading                   ║
╚════════════════════════════════════════════════╝

╔═ 補填資訊 ═══════════════════════════════════╗
║                                                  ║
║ 出貨方式: ⚪ 合併寄送（強制）                    ║
║   *CS 指派的貨物統一合併寄送，需單件出貨請建出庫單 ║
║                                                  ║
║ 入庫來源 *：                                     ║
║   ⚪ 海淘  ⚪ 退運  ⚪ 寄樣  ⚪ 其他              ║
║                                                  ║
║ 申報品項 *：                                     ║
║   [+ 新增品項] (drawer)                         ║
║   ┌─────────────────────────────────────┐    ║
║   │ 1. 類別[電子產品▼] 子類[手機殼▼]      │    ║
║   │    名稱[iPhone case]  數量[2]         │    ║
║   │    單價[800] JPY 小計[1,600]          │    ║
║   │    [✕ 刪除]                            │    ║
║   └─────────────────────────────────────┘    ║
║                                                  ║
║ 申報總值: 1,600 JPY (自動計算)                  ║
║                                                  ║
║ ─ 提示 ─                                       ║
║ 提交後將立即上架完成並扣處理費 HK$5            ║
║                                                  ║
║         [送出並接受]    [取消（回上頁）]        ║
╚══════════════════════════════════════════════╝
```

UI 重點：
- 上方貨物資訊 read-only（unclaimed 來的，客戶不能改）
- shipment_type 寫死 consolidated，不顯示選項（only 文字提示）
- 補填只有 inbound_source + declared_items
- size_estimate 自動由 actualDimension 推（small/medium/large 邊界由業主後台 .env 設）
- 提交按鈕同時觸發接受 + 建 inbound_request

#### 1.3.3 客戶提交「接受並補填」動作

```typescript
async function clientAcceptUnclaimed({ unclaimed_id, client_id, declared_items, inbound_source }) {
  const session = await mongoose.startSession();
  let inbound_id, scan_id;
  
  await session.withTransaction(async () => {
    // 1. mongo atomic 驗證 unclaimed.status=pending_assignment + 最新 assignment_history.client_id 是當前客戶
    const unclaimed = await UnclaimedInbound.findOne({
      _id: unclaimed_id,
      status: 'pending_assignment',
      'assignment_history': {
        $elemMatch: {
          client_id,
          accepted_at: null,
          rejected_at: null,
          cancelled_at: null
        }
      }
    }, null, { session });
    
    if (!unclaimed) throw new Error('UNCLAIMED_NOT_AVAILABLE_FOR_CLIENT');
    
    // 2. 撞號檢查 + 自動 merge（衍生問題 c 邏輯）
    const existing = await InboundRequest.findOne({
      client_id,
      tracking_no_normalized: unclaimed.tracking_no_normalized,
      status: { $in: ['pending', 'expired'] }
    }, null, { session });
    
    if (existing) {
      // Merge：把 unclaimed 屬性灌到既有 inbound_request
      inbound_id = existing._id;
      await InboundRequest.updateOne(
        { _id: existing._id },
        {
          status: 'received',
          actualWeight: unclaimed.weight,
          actualDimension: unclaimed.dimension,
          arrivedAt: unclaimed.arrived_at,
          receivedAt: new Date(),
          declared_items, // 客戶補填的覆蓋
          inbound_source,
          // shipment_type 保留既有（客戶原本建的，可能 single 或 consolidated）
        },
        { session }
      );
      // declared_items 子集合處理：刪舊建新
      await InboundDeclaredItem.deleteMany({ inbound_request_id: existing._id }, { session });
      await InboundDeclaredItem.insertMany(declared_items.map(d => ({ ...d, inbound_request_id: existing._id })), { session });
    } else {
      // 新建 inbound_request
      inbound_id = await generateInboundId(); // I-YYYYMMDD-NNNN
      await InboundRequest.create([{
        _id: inbound_id,
        client_id,
        warehouseCode: unclaimed.warehouseCode,
        carrier_inbound_code: unclaimed.carrier_inbound_code,
        tracking_no: unclaimed.tracking_no,
        tracking_no_normalized: unclaimed.tracking_no_normalized,
        shipment_type: 'consolidated',  // CS 指派強制 consolidated
        inbound_source,
        declared_items_count: declared_items.length,
        declared_value_total: sum(declared_items.map(d => d.subtotal)),
        declared_currency: unclaimed.declared_currency || warehouse.declared_currency,
        size_estimate: deriveSizeEstimate(unclaimed.dimension), // 從 actualDimension 自動推
        actualWeight: unclaimed.weight,
        actualDimension: unclaimed.dimension,
        arrivedAt: unclaimed.arrived_at,
        receivedAt: new Date(),
        status: 'received',
        from_unclaimed_id: unclaimed._id,  // 追溯 reference
      }], { session });
      await InboundDeclaredItem.insertMany(declared_items.map(d => ({ ...d, inbound_request_id: inbound_id })), { session });
    }
    
    // 3. 寫 inbound_scans
    scan_id = await generateScanId(); // S20260508_NNNN
    await InboundScan.create([{
      _id: scan_id,
      inbound_request_id: inbound_id,
      unclaimed_inbound_id: unclaimed_id,
      client_id,
      type: 'unclaimed_assigned',  // 由 CS 指派路徑
      operator_staff_id: 'SYSTEM',  // 客戶端動作走 SYSTEM
      createdAt: new Date(),
    }], { session });
    
    // 4. 更新 item_locations（unclaimed 已寫，這裡關聯到 inbound_id）
    await ItemLocation.updateOne(
      { itemCode: `unclaimed_${unclaimed_id}` },
      { itemCode: inbound_id }
    , { session });
    
    // 5. unclaimed 狀態更新
    await UnclaimedInbound.updateOne(
      { _id: unclaimed_id },
      {
        status: 'assigned',
        assigned_at: new Date(),
        assigned_to_client_id: client_id,
        assigned_to_inbound_id: inbound_id,
        'assignment_history.$[latest].accepted_at': new Date(),
      },
      { 
        arrayFilters: [{ 'latest.client_id': client_id, 'latest.accepted_at': null, 'latest.rejected_at': null, 'latest.cancelled_at': null }],
        session
      }
    );
    
    // 6. walletService.charge -HK$5
    await walletService.charge({
      client_id,
      amount: 5,
      type: 'charge_inbound',
      reference_type: 'inbound',
      reference_id: inbound_id,
      session
    });
    
    // 7. 寫 notification（給客戶）
    await Notification.create({
      client_id,
      type: 'inbound_received',
      payload: { inbound_id, charged: 5 }
    }, { session });
  });
  
  return { inbound_id, scan_id };
}
```

提交後：
- 跳預報列表頁，顯示成功 toast
- 「待確認」tab 計數 -1
- 「已上架」tab 多 1 筆

#### 1.3.4 客戶拒收

點 [拒收] → 跳 Modal 選原因：

```
┌─ 拒收原因 ────────────────────┐
│ ⚪ 不是我的貨物                  │
│ ⚪ 收件地址錯誤                  │
│ ⚪ 已從別處收到                  │
│ ⚪ 其他（必填備註）              │
│                                  │
│ 備註: [text 200 字，選 other 必填]│
│                                  │
│ [確認拒收] [取消]                │
└────────────────────────────────┘
```

提交：

```typescript
async function clientRejectUnclaimed({ unclaimed_id, client_id, reject_reason, reject_note }) {
  if (reject_reason === 'other' && !reject_note) throw new Error('REJECT_NOTE_REQUIRED');
  
  // assignment_history 最新一筆標 rejected_at + reject_reason
  await UnclaimedInbound.updateOne(
    { _id: unclaimed_id },
    {
      $set: {
        'assignment_history.$[latest].rejected_at': new Date(),
        'assignment_history.$[latest].reject_reason': reject_reason,
        'assignment_history.$[latest].reject_note': reject_note,
      }
      // status 仍是 pending_assignment（CS 重新指派）
    },
    { 
      arrayFilters: [{ 'latest.client_id': client_id, 'latest.accepted_at': null, 'latest.rejected_at': null, 'latest.cancelled_at': null }]
    }
  );
  
  // 寫 inbound_scans type=unclaimed_rejected
  await InboundScan.create({
    _id: await generateScanId(),
    unclaimed_inbound_id: unclaimed_id,
    client_id,
    type: 'unclaimed_rejected',
    staff_note: `Reason: ${reject_reason}, Note: ${reject_note || '-'}`,
    operator_staff_id: 'SYSTEM',
  });
  
  // 通知 CS（WMS 端 banner 顯示「N 筆無頭件被客戶拒收，需重新指派」）
  // v1 走 banner 顯示拒收計數，不發 push
}
```

拒收後：
- unclaimed.status 仍 pending_assignment
- CS 在 WMS 列表看到 assignment_history 含 rejected → 知道此客戶不對 → 換人或 disposed
- **不扣費**

### 1.4 路徑 B：客戶主動認領（OMS 端）

#### 1.4.1 onBlur 自動匹配

客戶在 `/zh-hk/inbound/new` 預報建單頁輸入 trackingNo onBlur → 觸發 lookup API（Phase 4 既有 API 擴充）：

```
POST /api/cms/inbound/check-tracking
body: {
  carrier_inbound_code: 'sagawa',
  tracking_no: 'ABC123'
}

Response:
{
  "tracking_no": "ABC123",
  "tracking_no_normalized": "abc123",
  "duplicated_in_own": false,         // Phase 4 既有
  "duplicated_in_own_inbound_id": null,
  "matched_unclaimed": true,          // Phase 6 新增
  "unclaimed_summary": {
    "unclaimed_id": "U-20260508-0001",
    "carrier_inbound_code": "sagawa",
    "weight": 2.5,
    "dimension": { "length": 30, "width": 25, "height": 15 },
    "arrived_at": "2026-05-08T14:30:00Z",
    "photo_paths": ["...", "..."],
    "staff_note": "外箱寫 ABC Trading"
  }
}
```

匹配條件（server-side query）：
- unclaimed.tracking_no_normalized = 客戶輸入 normalize 後
- unclaimed.status = pending_assignment
- 沒被當前客戶拒收過（assignment_history 不含當前 client_id 的 rejected_at）
- carrier_inbound_code 不一定要對（業務上客戶可能不知道實際 carrier）

#### 1.4.2 inline 提示（持續顯示）

```
[預報建單頁 - 部分 UI]

入庫快遞: [佐川急便 ▼]
追蹤號:   [ABC123      ]
                 ↓ onBlur 後

inline 提示（持續顯示，可重複點，直到客戶明確選 [認領] 或 [跳過]）：
        ┌─────────────────────────────────────┐
        │ 🎯 系統發現匹配的無頭件 U-20260508-0001 │
        │ 2.5 kg / 佐川急便 / 5/8 14:30 到倉   │
        │ [查看詳情] [認領此貨] [跳過]          │
        └─────────────────────────────────────┘
```

UX 細節：
- inline 永遠存在於 trackingNo 下方（除非客戶點 [認領] 或 [跳過]）
- [跳過] 後 inline 收起 → 顯示小字「已跳過此匹配 [還原]」（給後悔機會）
- [認領] 後 inline 變成綠色 banner：「✅ 已認領 U-... 提交後將上架」+ [取消認領]

#### 1.4.3 Modal 詳情（可重複開）

點 [查看詳情] → Modal：

```
┌──────────────────────────────────┐
│ 📦 無頭件 U-20260508-0001         │
│                                    │
│ 入庫快遞: 佐川急便                 │
│ 追蹤號: ABC123                     │
│ 重量: 2.5 kg                       │
│ 尺寸: 30x25x15 cm                  │
│ 到倉時間: 2026-05-08 14:30          │
│                                    │
│ [貨物照片 - barcode 全螢幕預覽]    │
│ [貨物照片 - 包裹外觀]              │
│                                    │
│ 員工備註: 外箱寫 ABC Trading       │
│                                    │
│ ─ 提示 ─                          │
│ 認領後將自動帶入此貨物的重量/尺寸， │
│ 您仍可選擇出貨方式（合併或單件）。  │
│                                    │
│ [是，認領此貨並繼續建單] [取消]    │
└──────────────────────────────────┘
```

點 [是，認領此貨] → Modal 收起 → 建單頁 inline 變綠 banner + 隱藏 field `_unclaimed_id` 設值。

#### 1.4.4 認領後的建單頁狀態

```
[預報建單頁 - 認領模式]
═══════════════════════════════════════════════════════════════

╔═ 認領 banner ════════════════════════════════════════╗
║ ✅ 已認領無頭件 U-20260508-0001                       ║
║   重量 2.5kg / 尺寸 30x25x15cm（已自動帶入，不可改）  ║
║   提交後將直接上架並扣處理費 HK$5                     ║
║                                            [取消認領] ║
╚══════════════════════════════════════════════════════╝

入庫倉庫: [日本埼玉倉 ▼]（可改）
入庫快遞: [佐川急便]（已自動帶入）
追蹤號:   [ABC123]（已自動帶入，不可改）

出貨方式: 
  ⚪ 合併寄送（推薦）  ⚪ 單件直發
  ↓ 客戶可選 single（衍生問題 3）

入庫來源: ⚪ 海淘  ⚪ 退運  ⚪ 寄樣  ⚪ 其他

申報品項: [+ 新增品項] drawer ...

(若選 single → 展開 single_shipping 區塊：收貨地址 + carrier + 儲存常用)

         [送出並認領上架]    [取消（清除認領）]
```

UI 重點：
- 客戶仍可選 shipment_type（衍生問題 3 對齊：客戶主動認領保留選擇權）
- 重量 / 尺寸從 unclaimed 帶入，**不可改**（物理已量過）
- carrier_inbound + tracking_no 從 unclaimed 帶入，**不可改**
- 申報品項 / inbound_source / shipment_type / single_shipping 客戶要填

#### 1.4.5 提交「認領 + 建單」動作

```typescript
async function clientCreateInboundWithClaim({ form_data, _unclaimed_id, client_id }) {
  // 流程跟 1.3.3 客戶接受 unclaimed 90% 重疊，差別：
  // - 此處走「客戶主動認領」路徑（沒經過 CS 指派）
  // - inbound_scans.type = 'unclaimed_self_claimed'
  // - shipment_type 走客戶選的（不強制 consolidated）
  // - 若選 single → 觸發 outboundService.autoCreateForSingle（Phase 5 既有 fail-soft）
  
  const session = await mongoose.startSession();
  await session.withTransaction(async () => {
    // 1. atomic 驗證 unclaimed available（沒被 CS 指派、沒被 disposed）
    const unclaimed = await UnclaimedInbound.findOneAndUpdate(
      { _id: _unclaimed_id, status: 'pending_assignment' },
      {
        status: 'assigned',
        assigned_at: new Date(),
        assigned_to_client_id: client_id,
        $push: {
          assignment_history: {
            client_id,
            assigned_at: new Date(),
            assigned_by_staff_id: 'SYSTEM',  // 客戶自助
            accepted_at: new Date(),  // 同時 accepted（客戶主動認領無中間態）
            cancelled_at: null,
            rejected_at: null,
            source: 'client_self_claim'
          }
        }
      },
      { new: true, session }
    );
    
    if (!unclaimed) throw new Error('UNCLAIMED_NOT_AVAILABLE');
    
    // 2. 建 inbound_request（merge 邏輯同 1.3.3，少有 race 因為客戶剛輸入 tracking_no）
    // ... shipment_type 走 form_data
    
    // 3. inbound_scans type='unclaimed_self_claimed'
    
    // 4. walletService.charge
    
    // 5. 若 shipment_type=single → 觸發 outboundService.autoCreateForSingle
    if (form_data.shipment_type === 'single') {
      await outboundService.autoCreateForSingle({ inbound_id, client_id, session });
    }
    
    // 6. notification
  });
}
```

### 1.5 disposed 流程（CS 認定無人認領）

#### 1.5.1 觸發

CS 在 unclaimed 詳情頁看到「已被 N 客戶拒收 / 放置 60 天無處理 / 物理 SOP 處理」→ 點 [認定無人認領 → disposed]：

```
┌─ 認定無人認領 ────────────────┐
│ U-20260508-0001                  │
│                                    │
│ 處置原因 *：                       │
│ [textarea，必填]                   │
│ 例：「3 客戶拒收，6 月後物理銷毀」 │
│                                    │
│ ⚠️ 此動作不可逆                   │
│                                    │
│ [確認 disposed] [取消]            │
└──────────────────────────────────┘
```

CS 確認 → server 執行：

```typescript
async function disposeUnclaimed({ unclaimed_id, cs_staff_id, disposed_reason }) {
  // atomic 驗證 status=pending_assignment（assigned 不可 dispose）
  const unclaimed = await UnclaimedInbound.findOneAndUpdate(
    { _id: unclaimed_id, status: 'pending_assignment' },
    {
      status: 'disposed',
      disposed_at: new Date(),
      disposed_reason
    },
    { new: true }
  );
  
  if (!unclaimed) throw new Error('CANNOT_DISPOSE_NON_PENDING');
  
  // 寫 inbound_scans type=unclaimed_disposed
  await InboundScan.create({
    _id: await generateScanId(),
    unclaimed_inbound_id: unclaimed_id,
    type: 'unclaimed_disposed',
    operator_staff_id: cs_staff_id,
    staff_note: disposed_reason,
  });
  
  // 物理動作走業務 SOP（v1 不在系統處理）
}
```

#### 1.5.2 disposed 限制

- assigned 狀態不可 dispose（已歸客戶）
- pending_assignment 才可 dispose
- 物理動作（銷毀 / 拍賣 / 送回）走業務 SOP

### 1.6 Notification Type 清單（Phase 6 範圍）

| Type | 觸發點 | 收件人 | 訊息 |
|---|---|---|---|
| `inbound_unclaimed_assigned` | CS 指派完成 | 客戶 | 「您有一筆無頭件被指派，請至 OMS 確認接收」+ deep link |
| `inbound_unclaimed_assignment_cancelled` | CS 撤銷指派 | 客戶 | 「先前指派已撤回，您無需處理」 |
| `inbound_unclaimed_rejected_to_cs` | 客戶拒收（給 CS）| WMS banner | 「N 筆無頭件被客戶拒收，需重新處理」（v1 走 WMS 列表 banner，不發 email） |
| `inbound_received` | 接受 / 認領完成 | 客戶 | 「您的貨已上架，扣處理費 HK$5，餘額 HK$xxx」（沿用 Phase 5 type） |

CS 端拒收 / disposed 的 audit 走 inbound_scans + assignment_history，不另發 notification 給 CS。

### 1.7 拒收後 CS 重新指派的限制

依拒收歷史檢查：

```typescript
function canAssignToClient(unclaimed, client_id) {
  const previouslyRejected = unclaimed.assignment_history?.some(
    h => h.client_id === client_id && h.rejected_at && !h.cancelled_at
  );
  return !previouslyRejected;
}
```

CS 試圖重新指派被拒過的客戶 → 4xx `PREVIOUSLY_REJECTED_BY_CLIENT`，UI 顯示「此客戶曾拒收（原因：not_mine）」。

CS 強制覆蓋（罕見業務需求）→ admin 後台手動清拒收歷史（v1 不開後台 UI，admin 直接 mongo 處理）。

### 1.8 race condition 處理

#### 1.8.1 客戶接受 vs CS 撤銷指派

T0：CS 指派 unclaimed_X 給客戶 ABC，assignment_history append 一筆
T1a：客戶 ABC 點 [接受]
T1b：同時 CS 點 [撤銷指派]

mongo atomic：
- T1a 走 `findOneAndUpdate(unclaimed_id, accepted_at: null, ...)` → 寫 accepted_at
- T1b 走 `findOneAndUpdate(unclaimed_id, accepted_at: null, ...)` → 寫 cancelled_at

兩個都用同一個 mongo update path，atomic 保證只有一個成功。
失敗者 4xx，UI 顯示「狀態已變更」要求重整。

#### 1.8.2 客戶 A 自助認領 vs CS 指派客戶 B

T0：unclaimed_X status=pending_assignment
T1a：CS 在 WMS 點 [指派給客戶 B]
T1b：同時客戶 A 在 OMS 建預報 onBlur 觸發 lookup → 看到 inline 提示 → 點 [認領]

mongo atomic：
- T1a 走 `findOneAndUpdate(unclaimed_id, status: 'pending_assignment', { $push: assignment_history })`
- T1b 走 `findOneAndUpdate(unclaimed_id, status: 'pending_assignment', { status: 'assigned', ... })`

一個成功改 status=assigned 後，另一個 query 條件 `status: 'pending_assignment'` 不滿足 → null → 4xx。
UI 顯示「此貨剛被處理，請重整列表」。

#### 1.8.3 客戶建單時 unclaimed 已被處理（race）

T0：客戶 OMS 建預報，onBlur 看到 inline 提示
T1：客戶花 3 分鐘填表
T2：期間 CS 把 unclaimed 給別人 / disposed
T3：客戶提交 [送出並認領上架]

提交時 atomic 檢查失敗 → 4xx `UNCLAIMED_NOT_AVAILABLE`，UI 顯示：

```
⚠️ 此無頭件已被處理，無法認領。
您的預報資料已保留，請選擇：
[正常建單（不認領）] [取消]
```

點 [正常建單] → 移除 _unclaimed_id、status=pending、走 Phase 4 既有建單流程。

### 1.9 自動 size_estimate 推算邏輯

依 actualDimension 自動推 size_estimate（small/medium/large）：

```typescript
function deriveSizeEstimate({ length, width, height }) {
  const volume_cm3 = length * width * height;
  
  // 邊界由 .env 設（業主後台調整 v1 走 .env，未來走 master data）
  const SMALL_MAX = process.env.SIZE_ESTIMATE_SMALL_MAX || 5000;   // 例：5,000 cm³
  const MEDIUM_MAX = process.env.SIZE_ESTIMATE_MEDIUM_MAX || 30000; // 例：30,000 cm³
  
  if (volume_cm3 <= SMALL_MAX) return 'small';
  if (volume_cm3 <= MEDIUM_MAX) return 'medium';
  return 'large';
}
```

客戶接受 / 認領補填頁不顯示 size_estimate 欄位（系統自動推）。

---

## 2. Schema 變更

### 2.1 `unclaimed_inbounds`（**擴充** Phase 5 已建）

| 欄位 | 型別 | 既有 / 新增 | 說明 |
|---|---|---|---|
| `assignment_history` | array | **新增** | append-only 指派紀錄（見下）|
| `expires_at` | date? | **新增** schema 預備 | v1 不啟用 expiry，留欄位給後 phase |
| `assigned_at` | date? | 既有 Phase 5 | 最後一次 accepted 時間（cache，避免每次掃 array）|
| `assigned_to_client_id` | string? | 既有 Phase 5 | 同上 cache |
| `assigned_to_inbound_id` | string? | 既有 Phase 5 | 同上 cache |
| `disposed_at` | date? | 既有 Phase 5 | |
| `disposed_reason` | string? | 既有 Phase 5 | |

#### `assignment_history` 子物件結構

```typescript
{
  client_id: string;              // 被指派的客戶
  assigned_at: date;              // 指派時間
  assigned_by_staff_id: string;   // CS staff_id 或 'SYSTEM'（客戶自助認領時）
  source: enum;                   // 'cs_assignment' / 'client_self_claim'
  cs_note: string?;               // v1 不開放，schema 預備（純制式 Q6 = A）
  
  // 客戶反應狀態（互斥，三選一 set 後不可改）
  cancelled_at: date?;            // CS 撤銷指派
  rejected_at: date?;             // 客戶拒收
  reject_reason: enum?;           // 'not_mine' / 'wrong_address' / 'already_received_elsewhere' / 'other'
  reject_note: string?;           // reject_reason='other' 必填
  accepted_at: date?;             // 客戶接受
}
```

**Indexes**：
- 既有 Phase 5 indexes 保留
- 新增 `{ 'assignment_history.client_id': 1, 'assignment_history.accepted_at': 1, 'assignment_history.rejected_at': 1, 'assignment_history.cancelled_at': 1 }`（客戶看「待確認」tab 用）

**append-only 規則**：
- assignment_history 只能 push 新 element，不能刪
- 已 set 的 cancelled_at / rejected_at / accepted_at 不可改
- 撤銷不刪 record，只 set cancelled_at

### 2.2 `inbound_requests`（**擴充** Phase 4 已建）

| 欄位 | 型別 | 既有 / 新增 | 說明 |
|---|---|---|---|
| `from_unclaimed_id` | string? | **新增** | 從 unclaimed 接受 / 認領而來時填 reference |
| `from_unclaimed_source` | enum? | **新增** | 'cs_assignment' / 'client_self_claim'（追溯來源）|

merge 場景下（既有 inbound_request 灌入 unclaimed 屬性）：
- from_unclaimed_id 填 unclaimed_id
- from_unclaimed_source 依 caller path 填

**Indexes**：
- 新增 `{ from_unclaimed_id: 1 }`（追溯查詢）

### 2.3 `inbound_scans`（**擴充** Phase 5 已建）

`type` enum 加：

| Type | 寫入時機 |
|---|---|
| `unclaimed_assigned` | 客戶接受 CS 指派 |
| `unclaimed_self_claimed` | 客戶主動認領 |
| `unclaimed_rejected` | 客戶拒收 |
| `unclaimed_disposed` | CS 認定無人認領 |
| `unclaimed_assignment_cancelled` | CS 撤銷指派（客戶反應前） |

無新增 schema 欄位，沿用 Phase 5 既有結構。

---

## 3. 頁面 / API 清單

### 3.1 WMS 新增 / 改造頁面

| 路徑 | 形態 | 說明 |
|---|---|---|
| `/zh-hk/operations/unclaimed-inbounds` | Desktop | 既有 Phase 5 列表 → Phase 6 加指派按鈕 + 拒收計數 |
| `/zh-hk/operations/unclaimed-inbounds/[id]` | Desktop | 既有 Phase 5 詳情 → Phase 6 加指派 / disposed / 撤銷指派按鈕 |
| `/zh-hk/operations/unclaimed-inbounds/[id]/assign` | Desktop | **新增** CS 指派頁 |

### 3.2 OMS 新增 / 改造頁面

| 路徑 | 形態 | 說明 |
|---|---|---|
| `/zh-hk/inbound/list` | 既有 Phase 4 | 加新 tab「待確認」+ badge 數字 |
| `/zh-hk/inbound/confirm/[unclaimed_id]` | Mobile + Desktop | **新增** 接受 + 補填獨立頁 |
| `/zh-hk/inbound/new` | 既有 Phase 4 | onBlur 加 unclaimed 匹配 + inline 提示 + Modal + 認領 banner |

### 3.3 WMS API endpoints

```
# CS 指派
POST   /api/wms/unclaimed/:id/assign            CS 指派客戶
POST   /api/wms/unclaimed/:id/cancel-assignment CS 撤銷指派（客戶反應前）
POST   /api/wms/unclaimed/:id/dispose           CS 認定無人認領

# CS 查詢輔助
GET    /api/wms/unclaimed/:id/match-existing    系統自動匹配既有 inbound_request（給「一鍵 Merge」用）
GET    /api/wms/clients/search                  CS 找客戶 type-ahead（client_code / 公司名 / email）

# 既有 Phase 5（沿用）
GET    /api/wms/unclaimed-inbounds              清單
GET    /api/wms/unclaimed-inbounds/:id          詳情
```

### 3.4 OMS API endpoints

```
# 客戶接受 / 拒收（CS 指派路徑）
GET    /api/cms/inbound/pending-confirm         查當前客戶的「待確認」清單
POST   /api/cms/inbound/confirm/:unclaimed_id   客戶接受 + 補填提交
POST   /api/cms/inbound/reject/:unclaimed_id    客戶拒收 + reject_reason

# 客戶主動認領（建單頁路徑）
POST   /api/cms/inbound/check-tracking          擴充既有 lookup API：duplicated 檢查 + unclaimed 匹配
POST   /api/cms/inbound                         建單 API 改造：支援 _unclaimed_id field（提交時走認領流程）
```

### 3.5 Cross-service Sync

```
POST   /api/cms/sync/unclaimed-status           WMS 推 OMS：unclaimed.status 變化（pending_assignment → assigned / disposed）
                                                 OMS 端維護 unclaimed_inbounds mirror，給「待確認」tab 顯示
```

### 3.6 Sidebar 改造

WMS sidebar 不變（Phase 5 已建「無頭件清單」入口）。

OMS sidebar 不變，但「我的預報」item 加 badge 數字（待確認筆數）：

```
我的預報 [3]   ← badge：3 筆待確認
  └─ 預報列表 → tab「待確認」
```

---

## 4. ShipItAsia 既有現況對映

| 既有 | 處理 |
|---|---|
| 無對應功能 | Phase 6 全新功能 |
| Phase 4 inbound_request schema | 加 from_unclaimed_id / from_unclaimed_source 欄位 |
| Phase 4 trackingNo 重複檢查 lookup API | 擴充：加 unclaimed 匹配回傳 |
| Phase 4 預報建單頁 | 改造：onBlur 加 unclaimed 匹配 + inline + Modal + 認領 banner |
| Phase 4 預報列表頁 | 加 tab「待確認」+ badge |
| Phase 5 unclaimed_inbounds schema | 加 assignment_history + expires_at |
| Phase 5 inbound_scans type enum | 加 5 種新 type |
| Phase 5 walletService.charge_inbound | 沿用，接受 / 認領時觸發 |
| Phase 5 outboundService.autoCreateForSingle | 沿用，客戶主動認領選 single 時觸發 |

---

## 5. Fuuffy 借鏡

### 5.1 借鏡 B5（主檔 vs 動作快照拆分 ⭐⭐⭐⭐⭐）— 持續沿用

unclaimed → inbound_request 轉換時：
- inbound_scans 寫一筆 type=unclaimed_assigned / unclaimed_self_claimed，記錄轉換動作
- inbound_request 主檔開新一筆（或 merge 既有一筆），但 actualWeight / actualDimension / 照片 / item_locations 都從 unclaimed 繼承
- unclaimed.status=assigned 但**不刪資料**，assignment_history append-only

跟 Phase 5 inbound_scans append-only 一致。

### 5.2 借鏡 B1（log_item_action 結構化動作日誌）

assignment_history array 走 fuuffy B1 結構：
- 結構化 enum（reject_reason、source）
- 自由文字（reject_note、cs_note）跟結構化分開
- 操作者紀錄（assigned_by_staff_id）
- 時間戳不可修改（append-only）

### 5.3 避坑 A1（沒有 carrier 抽象層）

CS 找客戶 + 系統匹配既有 inbound_request 都走 master data + service，無 hardcoded if/else carrier 邏輯。

### 5.4 避坑 A6（萬能 remarks）

reject_reason / disposed_reason 都走結構化 enum + 必要時補 note 欄位。CS 後續查報表走 enum query，不靠 note 字串解析。

### 5.5 死守 A4（沒 wallet → 每張單獨立付款）

接受 / 認領時走 walletService.charge_inbound（不繞過）。負餘額允許（Phase 3 業主決策 G）。

---

## 6. Acceptance Criteria（給 Claude Code）

### AC-6.1 CS 指派基本流程

**Given** unclaimed_id=U-20260508-0001 status=pending_assignment，CS 已登入
**When** CS POST `/api/wms/unclaimed/U-/assign` body `{ client_id: 'client_abc' }`
**Then**

- unclaimed.assignment_history append 一筆 { client_id, assigned_at, assigned_by_staff_id, source: 'cs_assignment', accepted_at: null, rejected_at: null, cancelled_at: null }
- unclaimed.status 仍 pending_assignment（**不變**）
- **不建** inbound_request
- 寫 notification type=inbound_unclaimed_assigned 給客戶
- 寄 email 透過 Resend（template: unclaimed_assigned）
- 客戶 OMS 「待確認」tab 即時看到此筆

**測試**：

- unclaimed 不存在 → 4xx
- unclaimed.status=assigned → 4xx `UNCLAIMED_NOT_AVAILABLE`
- unclaimed.status=disposed → 4xx
- client_id 不存在 → 4xx
- 此 client_id 曾被此 unclaimed 拒收過 → 4xx `PREVIOUSLY_REJECTED_BY_CLIENT`
- 已有 active assignment（最後一筆 cancelled/rejected/accepted 都 null）→ 4xx `ALREADY_ASSIGNED`

### AC-6.2 CS 撤銷指派（客戶反應前）

**Given** unclaimed 已被 CS 指派給 client_abc，客戶尚未接受 / 拒收
**When** CS POST `/api/wms/unclaimed/U-/cancel-assignment`
**Then**

- assignment_history 最後一筆 set cancelled_at = now
- unclaimed.status 仍 pending_assignment
- 寫 notification type=inbound_unclaimed_assignment_cancelled 給客戶
- 寫 inbound_scans type=unclaimed_assignment_cancelled
- CS 可再次指派同個或別個客戶

**測試**：

- 客戶已 accepted → 4xx `ALREADY_ACCEPTED_BY_CLIENT`
- 客戶已 rejected → 4xx `ALREADY_REJECTED_BY_CLIENT`
- 已 cancelled → 4xx `ALREADY_CANCELLED`
- 沒指派紀錄 → 4xx `NO_ASSIGNMENT_TO_CANCEL`

### AC-6.3 CS 自動匹配既有 inbound_request

**Given** unclaimed.tracking_no_normalized='abc123'，client_abc 已建 inbound_request I-20260509-0005 status=pending tracking_no_normalized='abc123'
**When** CS GET `/api/wms/unclaimed/U-/match-existing`
**Then**

- 回應 `{ matched: true, inbound_request: { _id: 'I-20260509-0005', client_id: 'client_abc', ... } }`

CS 點 [一鍵 Merge] → server：

- 跳過 assignment_history append 流程
- 直接走客戶接受邏輯（merge 到既有 inbound_request）
- inbound_request status: pending → received，灌入 actualWeight / actualDimension / arrivedAt
- walletService.charge -HK$5
- unclaimed.status=assigned + assignment_history 寫一筆 source='cs_merge'，accepted_at = now（不需客戶確認）

**測試**：

- 多個客戶有同 trackingNo pending（不該發生但測 schema）→ 回應 array，CS UI 列出讓 CS 選
- 對應 inbound_request status 已 received → 不顯示為匹配（已處理過）

### AC-6.4 客戶接受 + 補填基本流程

**Given** unclaimed 已被指派給 client_abc，client_abc 登入 OMS
**When** client_abc POST `/api/cms/inbound/confirm/U-` body `{ inbound_source: 'taobao', declared_items: [...] }`
**Then**

- atomic 驗證 unclaimed.status=pending_assignment + assignment_history 最新一筆 client_id=client_abc + accepted_at/rejected_at/cancelled_at 都 null
- 建 inbound_request status=received，shipment_type='consolidated'（強制），from_unclaimed_id=U-，from_unclaimed_source='cs_assignment'
- inbound_request._id 走 daily_counters（I-YYYYMMDD-NNNN）
- declared_items 子集合寫入
- size_estimate 自動由 unclaimed.dimension 推算
- actualWeight / actualDimension / arrivedAt 從 unclaimed 繼承
- receivedAt = now
- walletService.charge -HK$5
- 寫 inbound_scans type=unclaimed_assigned
- item_locations 已存在（unclaimed 階段建的，itemCode='unclaimed_U-...'）→ 改 itemCode=I-...
- unclaimed.status=assigned + assignment_history 最新一筆 set accepted_at=now
- 寫 notification type=inbound_received

**測試**：

- 缺 declared_items → 4xx
- 缺 inbound_source → 4xx
- form 試圖傳 shipment_type=single → 4xx `SHIPMENT_TYPE_FIXED_FOR_CS_ASSIGNED`（CS 指派強制 consolidated）
- unclaimed 已被別人 accepted → 4xx `UNCLAIMED_NOT_AVAILABLE_FOR_CLIENT`
- assignment_history 最新一筆已 cancelled / rejected → 4xx
- 客戶餘額不足（< -∞ 不可能，但仍允許負餘額） → 仍允許（Phase 3 業主決策 G）

### AC-6.5 客戶接受時 trackingNo 撞號自動 merge

**Given** unclaimed 已被指派給 client_abc，client_abc 自己已建 I-20260509-0005 status=pending 同 trackingNo
**When** client_abc 接受 unclaimed 提交
**Then**

- 不建新 inbound_request
- 既有 I-20260509-0005 灌入 actualWeight / actualDimension / arrivedAt / receivedAt
- I-20260509-0005 status: pending → received
- declared_items 從客戶補填覆蓋（先刪舊 declared_items insertMany 新的）
- I-20260509-0005.shipment_type 保持原值（不強制 consolidated，因客戶已選過）
- I-20260509-0005.from_unclaimed_id = U-...
- 走 charge / inbound_scans / unclaimed.status=assigned 同 AC-6.4
- 客戶 UI 顯示 toast：「您已預報過此單，已自動合併」

**測試**：

- I-20260509-0005 status=received → 不 merge，4xx `EXISTING_INBOUND_NOT_MERGEABLE`
- I-20260509-0005 declared_items 已存在 → 全刪重建
- I-20260509-0005 shipment_type=single 且有 single_shipping → 保留

### AC-6.6 客戶拒收

**Given** unclaimed 被指派給 client_abc，未接受
**When** client_abc POST `/api/cms/inbound/reject/U-` body `{ reject_reason: 'not_mine' }`
**Then**

- assignment_history 最新一筆 set rejected_at=now + reject_reason='not_mine'
- unclaimed.status 仍 pending_assignment（CS 重新處理）
- 寫 inbound_scans type=unclaimed_rejected
- **不扣費**
- WMS 端 banner 拒收計數 +1

**測試**：

- reject_reason='other' 缺 reject_note → 4xx
- reject_reason 不在 enum → 4xx
- assignment_history 最新一筆已 accepted / cancelled → 4xx

### AC-6.7 客戶主動認領（onBlur 匹配 + 提交建單）

**Given** unclaimed_X status=pending_assignment，client_abc 在 OMS 預報建單頁，輸入 tracking_no 同 unclaimed_X
**When** client_abc onBlur → POST `/api/cms/inbound/check-tracking` body `{ carrier_inbound_code, tracking_no }`
**Then**

- 回應 matched_unclaimed=true + unclaimed_summary
- 客戶端 inline 提示顯示 + Modal 可開

**Then** client_abc 點 [認領此貨] + 填完表單 + 點 [送出並認領上架]
- POST `/api/cms/inbound` body 含 `_unclaimed_id: 'U-X'` + form 完整資料（含 shipment_type / declared_items / 等）
- atomic 驗證 unclaimed available
- 建 inbound_request status=received，shipment_type 走客戶選的（**保留 single 選項**）
- from_unclaimed_id=U-X, from_unclaimed_source='client_self_claim'
- 走 charge / inbound_scans / unclaimed.status=assigned
- assignment_history append 一筆 source='client_self_claim', assigned_by_staff_id='SYSTEM', accepted_at=now
- inbound_scans type=unclaimed_self_claimed
- 若 shipment_type=single → 觸發 outboundService.autoCreateForSingle（Phase 5 既有 fail-soft）

**測試**：

- 客戶選 single + 缺 single_shipping → 4xx
- _unclaimed_id 對應 unclaimed.status 已 assigned → 4xx，UI 顯示「此貨剛被處理」+ 提示走正常建單
- _unclaimed_id 對應 unclaimed 已被當前客戶拒收過 → 4xx（onBlur 階段就應該過濾掉）
- carrier_inbound_code 跟 unclaimed 的不同 → 允許（業務上客戶可能不知道實際 carrier，以 unclaimed 為準）

### AC-6.8 客戶主動認領 race（unclaimed 期間被 CS 處理）

**Given** client_abc 看到 inline 提示後花 3 分鐘填表
**When** 期間 CS 把 unclaimed 指派給 client_def
**Then** client_abc 提交 [送出並認領上架]

- atomic 驗證 unclaimed.status=pending_assignment 失敗（已 assigned）
- 4xx `UNCLAIMED_NOT_AVAILABLE`
- UI 顯示確認對話框：「此無頭件已被處理，無法認領。您的預報資料已保留，請選擇 [正常建單（不認領）] / [取消]」
- 點 [正常建單] → 移除 _unclaimed_id → POST 建單走 Phase 4 既有路徑（status=pending）

**測試**：

- 客戶選 [取消] → 留在頁面，預報資料不丟
- 提交時 race 第二次（連續兩次都 race）→ 同樣處理

### AC-6.9 disposed 流程

**Given** unclaimed.status=pending_assignment，已被多個客戶拒收 / 物理 SOP 認定銷毀
**When** CS POST `/api/wms/unclaimed/U-/dispose` body `{ disposed_reason: '3 客戶拒收，6 月後銷毀' }`
**Then**

- atomic 驗證 status=pending_assignment（assigned 不可 dispose）
- unclaimed.status: pending_assignment → disposed
- disposed_at = now
- disposed_reason snapshot
- 寫 inbound_scans type=unclaimed_disposed
- WMS 列表 disposed 那筆不再顯示在 pending 清單

**測試**：

- 缺 disposed_reason → 4xx
- status=assigned → 4xx `CANNOT_DISPOSE_NON_PENDING`
- status=disposed（重複 dispose）→ 4xx
- 物理動作走 SOP（系統不執行）

### AC-6.10 待確認 tab 計數準確

**Given** client_abc 有 1 筆 unclaimed 已被 CS 指派，未反應
**When** client_abc 開 OMS 預報列表
**Then**

- 「待確認」tab badge 顯示 1
- tab 內列表顯示該 unclaimed 詳情

**測試**：

- 客戶接受 / 拒收後 → badge -1
- CS 撤銷指派後 → badge -1
- 同個 unclaimed 被 CS 撤銷後重新指派 → badge 仍 1（最新一筆 active）

### AC-6.11 拒收歷史防重複指派

**Given** unclaimed 曾被 client_abc 拒收（reject_reason='not_mine'）
**When** CS 試圖再次指派給 client_abc
**Then**

- 4xx `PREVIOUSLY_REJECTED_BY_CLIENT`
- WMS UI 顯示拒收歷史（CS 看到不指派此客戶）

**admin 強制覆蓋**（罕見）：

- v1 不開後台 UI
- admin 直接 mongo `$pull` 拒收紀錄（不對外）

**測試**：

- 同 client 但 reject_reason 不同（多次拒收）→ 都計入歷史
- 同 client 已 cancelled（CS 撤銷）→ 不算「客戶拒收」，可重新指派

### AC-6.12 OMS 預報建單頁認領 UX

**Given** client 在 `/zh-hk/inbound/new` 輸入 tracking_no，server 回 matched_unclaimed=true
**When** UI 渲染
**Then**

- inline 提示出現於 trackingNo input 下方（持續顯示）
- inline 含 [查看詳情] [認領此貨] [跳過] 三按鈕
- 點 [查看詳情] → Modal 開啟（Modal 內含 [是，認領] [取消]）
- Modal 點 [取消] → Modal 收起，inline 仍在
- 點 [認領此貨] → inline 變綠 banner「✅ 已認領」+ [取消認領]，hidden field _unclaimed_id 設值
- 點 [跳過] → inline 收起，下方小字「已跳過此匹配 [還原]」

**測試**：

- 認領後客戶改 tracking_no 為別的值 → onBlur 重觸發 lookup，inline / banner 重置
- 認領後 onBlur 重複 → 不重複 fetch（前端 cache）
- 認領後刷頁 → _unclaimed_id 丟失（v1 不持久化），客戶要重新走 onBlur

### AC-6.13 lookup API 擴充正確性

**Given** unclaimed_X status=pending_assignment tracking_no_normalized='abc123'
**When** client POST `/api/cms/inbound/check-tracking` body `{ tracking_no: 'AB-123' }`（normalize 後 'abc123' 撞號）
**Then**

- 回應含 matched_unclaimed=true + unclaimed_summary
- 同時若客戶自己有同 trackingNo pending inbound_request → duplicated_in_own=true
- 回應**同時帶兩種訊息**，UI 自行決定優先顯示

**測試**：

- unclaimed.status=assigned → matched_unclaimed=false（已被處理不顯示）
- unclaimed 曾被當前客戶拒收 → matched_unclaimed=false（不再提示）
- 兩種匹配都 hit → 回 both，UI 顯示「您已建過此單，請編輯既有預報」優先（不該認領自己已預報的）

### AC-6.14 自動 size_estimate 推算

**Given** unclaimed.dimension={length:30, width:25, height:15}（11,250 cm³）
**When** 客戶接受 / 認領時建 inbound_request
**Then**

- 系統自動算 volume = 11,250 cm³
- 依 SIZE_ESTIMATE_SMALL_MAX (=5,000) 跟 SIZE_ESTIMATE_MEDIUM_MAX (=30,000) 邊界
- size_estimate = 'medium'（11,250 在 5,000-30,000 之間）
- 客戶 UI 不顯示 size_estimate 欄位

**測試**：

- volume <= SMALL_MAX → 'small'
- SMALL_MAX < volume <= MEDIUM_MAX → 'medium'
- volume > MEDIUM_MAX → 'large'
- env 邊界改 → 重新跑要 reload

### AC-6.15 Cross-service Sync

**Given** WMS 端 CS 指派 / 接受 / 拒收 / disposed
**When** 對應 API 寫成功
**Then**

- 同步推 OMS：unclaimed_inbounds mirror 更新（assignment_history / status / assigned_to_*）
- OMS 端「待確認」tab 即時反映（客戶 refresh 看得到）
- inbound_request 建立 / 更新走 Phase 4 既有 sync

**測試**：

- WMS 寫成功但 OMS sync 失敗 → WMS 寫 sync_failed_logs，業務不 rollback
- X-Internal-Sync header 缺或錯 → 401

### AC-6.16 從 unclaimed 來的 inbound 在 received 狀態下不可編輯

**Given** inbound_request from_unclaimed_id=U- status=received
**When** 客戶試圖編輯 declared_items
**Then**

- 4xx `INBOUND_NOT_EDITABLE_IN_RECEIVED`（沿用 Phase 4 規則）
- admin 後台限定欄位可改（沿用 Phase 4 admin-adjust）

---

## 7. 風險點 + 已知 gotcha

### 7.1 客戶建單時 _unclaimed_id field 偽造

客戶在 frontend 修改 hidden field，把 _unclaimed_id 設成不屬於自己的 unclaimed_id。

**處理**：

- server-side atomic 驗證：unclaimed.status=pending_assignment + 沒被當前客戶拒收
- 通過驗證 → 走認領流程
- 沒通過 → 4xx
- 不需額外驗證「unclaimed 是否之前被指派給當前客戶」（client_self_claim 不需先指派）

### 7.2 assignment_history array 長度過大

罕見場景：unclaimed 被反覆指派 / 撤銷 / 拒收幾十次。array 變大。

**處理**：

- v1 不限 array 長度（業務上不太可能超過 5-10 筆）
- 後 phase 加 max_length 警告
- mongo document 16MB 上限不會撞到

### 7.3 客戶接受時餘額為負

客戶 balance < 0 仍允許接受（Phase 3 業主決策 G）。但餘額更負後，後續 single 模式 outbound 會 held。

**處理**：

- AC-6.4 不擋負餘額接受
- 客戶 UI 提示「目前餘額 -X，接受後將為 -Y，可繼續接受但出庫單可能 held」
- 客戶可選擇先儲值再接受

### 7.4 拒收後 CS 不知道要做什麼

CS 沒看到拒收 banner / 沒及時處理 → unclaimed 卡 pending_assignment 永遠。

**處理**：

- WMS unclaimed 列表 default sort 拒收筆數 desc（拒過的最上面）
- WMS dashboard banner 顯示「N 筆拒收待處理」
- v1 不做 cron 自動 dispose（業務不接受自動銷毀）

### 7.5 客戶主動認領建單 vs CS 指派的拒收歷史

scenario：CS 之前指派給 client_abc 但拒收 → CS 改指派 client_def → client_def 接受
但 onBlur 時 client_abc 重新建單同 trackingNo → 系統還會推薦 unclaimed 嗎？

**處理**：

- onBlur lookup 邏輯：unclaimed.status=pending_assignment AND 沒被當前客戶拒收
- client_def 已 accepted → unclaimed.status=assigned → matched_unclaimed=false（不再推薦）
- 流程自然處理

### 7.6 merge 時 declared_items 覆蓋 vs 追加

scenario：客戶自己建的 inbound_request 已有 declared_items，接受 unclaimed 補填時提交新的 declared_items。

**處理**：

- 全刪 + 重建（已對齊 AC-6.5）
- 客戶意圖：補填頁是「填這次接受的最新資料」，覆蓋既有合理
- 但歷史 declared_items 丟失 → audit 走 inbound_scans（系統不存歷史 declared_items）
- v1 業務不需要保留歷史 declared_items

### 7.7 unclaimed 物理位置追溯

scenario：unclaimed 員工 receive 時 item_locations 寫的 itemCode='unclaimed_U-...'。客戶接受後改 itemCode=I-...。

**處理**：

- mongo update 改 itemCode（item_locations 主檔不重建）
- 系統設計：item_locations.itemCode 可隨業務變動（追溯走 inbound_scans）
- 物理位置不變（locationCode='A001' 還是 A001）

### 7.8 客戶接受 vs receive 撤銷 race

scenario：CS 在 receive 階段誤上架（admin 後台撤銷），但這時 unclaimed 已 assigned。

**處理**：

- v1 receive 撤銷只走 admin 後台（Phase 5 §1.2.4），不影響 unclaimed assignment 流程
- admin 後台 adjust 是「對 inbound_request 動作」，不動 unclaimed
- unclaimed 一旦 assigned 不可逆

### 7.9 OMS 端「待確認」tab 計數不一致

scenario：WMS sync 失敗 → OMS 端 unclaimed mirror 跟 WMS 不一致 → 客戶看到的 tab 計數錯。

**處理**：

- 客戶端 refresh tab → 即時 fetch 最新（不靠 polling）
- v1 不做 websocket / SSE
- WMS 端 admin dashboard 看 sync_failed_logs，手動處理 sync 失敗

### 7.10 disposed 後物理動作 SOP 不在系統

業主決策：v1 不做物理銷毀流程。disposed 純粹改 status。

**處理**：

- 物理上 CS 走業務 SOP（送回 / 拍賣 / 銷毀）
- 系統不知道物理動作結果
- 未來 phase 可加 dispose_outcome enum（returned / auctioned / destroyed）

### 7.11 客戶接受時 walletService.charge 失敗

mongo session transaction 包整段。charge 失敗 → 全部 rollback：

- inbound_request 不建
- unclaimed.status 不變
- 客戶看錯誤訊息 → 重試

### 7.12 CS 撤銷指派 vs 客戶反應 race

scenario：CS 點 [撤銷] 同時客戶點 [接受]。

mongo atomic：
- arrayFilters 走相同 path（latest assignment_history without 終態）
- 一個成功 set cancelled_at，另一個 set accepted_at
- mongo update operation 順序處理 → 後到的會看到 array 已被改，arrayFilters 不滿足 → no-op
- API 層比對前後狀態：失敗者收 4xx

**測試方式**：在 sandbox 起 2 個並行 request 看哪個贏（罕見場景，v1 不做更複雜的衝突解決）。

### 7.13 拒收 reject_reason='other' 自由文字

CS 看 reject_reason='other' + reject_note 自由文字 → 不容易標準化處理。

**處理**：

- v1 reject_note 純供 CS 看（不做業務邏輯）
- 後 phase 觀察 reject_note pattern → 加新 enum
- enum 演進不破壞既有 record（舊 record reject_reason='other' 保留）

### 7.14 客戶接受時 declared_value_total 計算錯

`declared_value_total = sum(declared_items.subtotal)`，subtotal = quantity * unit_price。

**處理**：

- server-side 強制重算（不信任 frontend 傳的 total）
- subtotal / total 都 server 算，frontend 純顯示
- 沿用 Phase 4 既有邏輯

---

## 8. 開發順序建議（Phase 6 內部分階段）

給 Claude Code 落地的子步驟：

| Sub-step | 內容 | 對應 AC |
|---|---|---|
| **6.1** | unclaimed_inbounds schema 擴充（assignment_history + expires_at）+ inbound_requests 加 from_unclaimed_* + inbound_scans type enum 擴充 | AC-6.1 schema 部分 |
| **6.2** | WMS CS 指派 API + UI（含搜尋客戶 + 一鍵 Merge）+ 撤銷指派 + 拒收歷史防重複 | AC-6.1, 6.2, 6.3, 6.11 |
| **6.3** | WMS CS disposed 流程 | AC-6.9 |
| **6.4** | OMS 「待確認」tab + 計數 | AC-6.10 |
| **6.5** | OMS 客戶接受 + 補填獨立頁 + size_estimate 自動推算 | AC-6.4, 6.5, 6.14, 6.16 |
| **6.6** | OMS 客戶拒收 + reject_reason 流程 | AC-6.6 |
| **6.7** | OMS 預報建單頁 onBlur 擴充 + inline + Modal + 認領 banner | AC-6.7, 6.12, 6.13 |
| **6.8** | OMS 客戶主動認領提交（建單 + 認領一頁完成） | AC-6.7, 6.8 |
| **6.9** | Cross-service sync + email template + notifications | AC-6.15 |
| **6.10** | race condition 測試 + 並發測試 | AC-6.8, 7.12 |

每完成一步跑對應 AC 測試。

**Sub-step 細節**：

### 6.1 schema 地基

- unclaimed_inbounds 加 assignment_history array + expires_at
- 加 mongo index（assignment_history.client_id 複合 index）
- inbound_requests 加 from_unclaimed_id / from_unclaimed_source
- inbound_scans type enum 擴充 5 種
- migration script（既有 unclaimed_inbounds 補空 array）

### 6.2 CS 指派核心

- POST `/api/wms/unclaimed/:id/assign` service + atomic 驗證
- POST `/api/wms/unclaimed/:id/cancel-assignment`
- GET `/api/wms/unclaimed/:id/match-existing`（一鍵 Merge 匹配）
- GET `/api/wms/clients/search` type-ahead
- frontend `/zh-hk/operations/unclaimed-inbounds/[id]/assign` 頁
- 拒收歷史 `previouslyRejected` 檢查邏輯

### 6.3 disposed

- POST `/api/wms/unclaimed/:id/dispose` service
- WMS unclaimed 詳情頁加 [認定無人認領] 按鈕 + Modal
- 寫 inbound_scans type=unclaimed_disposed

### 6.4 OMS tab

- `/zh-hk/inbound/list` 加新 tab「待確認」
- GET `/api/cms/inbound/pending-confirm` API
- badge 計數（sidebar + tab title）

### 6.5 接受 + 補填

- 新建 `/zh-hk/inbound/confirm/[unclaimed_id]` 頁
- POST `/api/cms/inbound/confirm/:unclaimed_id` service（含 merge + atomic + transaction）
- size_estimate 自動推算 helper
- declared_items drawer reuse Phase 4 既有 component

### 6.6 拒收

- POST `/api/cms/inbound/reject/:unclaimed_id` service
- frontend Modal 4 種 reject_reason
- reject_note 必填 logic（other 必填）

### 6.7 onBlur 擴充

- 既有 lookup API 擴充 unclaimed 匹配回傳
- frontend trackingNo 下方 inline 提示
- Modal 詳情頁
- 認領 banner state management

### 6.8 認領提交

- POST `/api/cms/inbound` 改造支援 `_unclaimed_id` 欄位
- 提交時走 client_self_claim 流程
- 觸發 outboundService.autoCreateForSingle（若 single）

### 6.9 sync + email

- POST `/api/cms/sync/unclaimed-status`
- Resend email template 4 種：unclaimed_assigned / unclaimed_assignment_cancelled
- notifications schema 寫入 5 種 type

### 6.10 並發測試

- 寫測試 case 模擬 7.12 race
- 寫 e2e 跑通完整流程（pending_assignment → assigned → received）

---

## 9. 變更紀錄

| 版本 | 日期 | 說明 |
|---|---|---|
| v1.0 | 2026-05-08 | Phase 6 首次定稿。業務決策：(B) 客戶接受才扣費 / 補填獨立頁（解法 C）/ CS 指派不建 inbound_request（客戶接受才建）/ shipment_type CS 指派強制 consolidated、客戶主動認領保留選擇 / size_estimate 由 actualDimension 自動推 / trackingNo 撞號自動 merge / CS 撤銷指派客戶反應前可撤、無時間視窗 / CS 指派純制式通知（無自定備註）/ disposed 寫 inbound_scans / 拒收歷史防重複指派 / Q4-style v1 不做 expiry / 客戶端 onBlur 自動匹配 unclaimed（inline + Modal）/ 認領後不跳頁（建單頁加 banner）/ 兩條路徑共用補填頁 component |
