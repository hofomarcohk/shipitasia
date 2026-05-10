# Phase 7：客戶建出庫單 + 試算 + 處理偏好（OMS）

> 集運 OMS+WMS v1 開發規格
> 版本：v1.0
> 日期：2026-05-08
> 範圍：客戶在 OMS 合併建立出庫單 / 選 carrier / 收貨地址 / rate quote 試算 / 餘額閘 / 處理偏好（全託管 vs 出貨前確認）/ outbound 取消 / single 模式補資訊頁 / 客戶端「出貨前確認」模式取 label
> 前置：Phase 1（客戶帳號）、Phase 2（carrier 綁定）、Phase 3（walletService）、Phase 4（inbound_request）、Phase 5（received 狀態 + outboundService.autoCreateForSingle 介面）、Phase 6（from_unclaimed_*）已完成
> 業務地位：v1 客戶端閉環的最後 phase（Phase 7 完成 = 客戶能完整自助走完從預報到送單）；Phase 8 才接 WMS 真實取 label + 倉內動作
> 前提共識：採設計 B「WMS 取 label」為 default，但給客戶 checkbox 切換「出貨前確認」模式

---

## 0. 前設

### 0.1 v1 業務參數（沿用 Phase 3-6）

| 項目 | v1 設定 |
|---|---|
| 全局幣別 | HKD |
| 處理費單價 | HKD$5 / 包（每筆 inbound，receive 階段已扣）|
| 入庫地 | 日本（v1 一個倉：埼玉）|
| 收貨地 | 香港 |
| 申報幣別 | 依倉庫適配（埼玉倉 = JPY）|
| 出庫運費 | **不收**（客戶用自己 carrier 帳號付）|
| v1 carrier | 雲途（API key）+ Fuuffy（OAuth）|

### 0.2 業務量假設

v1 上線半年內 ≤ 50 客戶。每月 100-200 筆 outbound（合併出庫 + single 直發混合）。設計考量：
- rate quote API 呼叫頻率不高（每筆 outbound 1-3 次試算）
- carrier API failure 處理寬鬆（失敗 retry，不做 circuit breaker）
- v1 不做 carrier rate variance alert（差 X% 才通知留後 phase）

### 0.3 範圍

**包含**：

- 客戶 OMS 看可出庫的 inbound 列表（status=received + 同倉 + 自己擁有 + 未被 link 到 outbound）
- 客戶選多筆 inbound 合併建 outbound
- 客戶選 carrier（從 client_carrier_accounts active 列出）
- 客戶選收貨地址（default_shipping_address 或自填臨時地址）
- carrier rate quote 試算（rate_card_service abstract layer + 雲途 / Fuuffy adapter）
- carrier capacity 檢查（client + server 雙驗）
- 處理偏好 checkbox（全託管 default / 出貨前確認）
- 客戶在 settings 設 default 處理偏好
- outbound 餘額閘（balance < 0 → held）
- outbound 取消（picking 之前可取消）
- single 模式 outbound 補資訊頁（Phase 5 已建 placeholder，Phase 7 補完整 UI）
- 客戶端「出貨前確認」模式取 label（pack 完成 → 客戶看實重 vs 試算 → 點 [取得 Label]）
- label 取得失敗的 retry 邏輯（客戶端）
- rate_quote_logs audit
- carrier rate / label service mock（dev 環境用，PHASE7_USE_MOCK_CARRIER env flag）
- migration script：Phase 5 既存 phase7_not_ready outbound 解 held

**不包含**：

- WMS 倉內 pick / pack / palletize / departure（**Phase 8**）
- WMS 員工點 [取得 Label]（**Phase 8**，全託管模式）
- carrier webhook 接收 tracking 更新（**Phase 9**）
- 跨倉合併（v1 一倉，無此問題）
- 通知託管模式（差 X% 通知，留後 phase）
- carrier rate cache 後台 UI（v1 純 server cache 5 分鐘，無 admin 設定）
- carrier API rate limiting / circuit breaker（v1 簡化）

### 0.4 技術棧

完全沿用 Phase 1-6 已建。新增：

- carrier rate / label service abstract layer（adapter pattern）
- env flag `PHASE7_USE_MOCK_CARRIER`：dev / staging 走 mock（**v1 default true**），prod 走真實 API
- env flag `PHASE7_OUTBOUND_ENABLED`：Phase 5 既有，Phase 7 上線時設 true
- env flag `PDF_GENERATION_ENABLED`：Phase 7 用於 mock label PDF 生成（共用 component，Phase 8 / 9 也用）
- mongo session transaction（建 outbound + 改 inbound link + 餘額閘原子）
- Phase 3 walletService（檢查餘額 + held 解綁）
- `pdfkit` library：動態生成 mock label PDF（共用 pdfService，Phase 8 真實 label 也走同 service）

### 0.4.1 v1 Mock 策略（沿用 Phase 2 §0.4.1）

v1 dev / staging 階段 **所有 carrier API call 走 mock**：

| env flag | dev/staging | prod |
|---|---|---|
| `PHASE2_USE_MOCK_OAUTH` | true | false |
| `PHASE7_USE_MOCK_CARRIER` | **true** | false |
| `PHASE8_USE_MOCK_CARRIER` | true | false |
| `PHASE9_USE_MOCK_WEBHOOK` | true | false |

mock 行為策略（Q1+Q2 對齊結果）：

- **rate quote 走「(a)+(b) 行為模擬」**：依重量 / 收貨地區 / carrier 不同 multiplier 算假價，雲途比 Fuuffy 便宜（dev 看得出 carrier 差異）
- **PDF label 走「(b) 動態生成」**：用 pdfkit 動態產 PDF，含 outbound_id / 假追蹤號 / 收貨地址 / 重量 — 看起來「像」真 label
- **失敗 case 也要模擬**：mock adapter 提供 `MOCK_FORCE_ERROR` URL parameter / outbound metadata 觸發 mock 失敗（測試客戶端 retry / WMS 員工錯誤處理 UI）
- **切真實 API 時機**：**所有 phase 完成 + 業主驗收通過 + 上 prod 前一次切**（dev / staging 全程 mock）

mock 階段資料**不能** migrate 到 prod（同 Phase 2 §8.1.1）。

### 0.5 UI 設計風格

完全沿用 ShipItAsia 既有 + Phase 4-6 慣例。新增頁面：

| 路徑 | 形態 | 場景 |
|---|---|---|
| `/zh-hk/outbound/list` | 既有，沿用 ShipItAsia outbound 列表頁面（改造）| 客戶看出庫單列表 |
| `/zh-hk/outbound/new` | **新增** | 合併建出庫單頁 |
| `/zh-hk/outbound/[id]` | 既有，改造 | 出庫單詳情頁 |
| `/zh-hk/outbound/[id]/edit` | **新增**（single 補資訊用） | single 模式補資訊頁 |
| `/zh-hk/outbound/[id]/confirm-label` | **新增** | 出貨前確認模式取 label 頁 |
| `/zh-hk/settings/preferences` | 既有 settings，加 section | 客戶設處理偏好 default |

---

## 1. 業務流程

### 1.1 兩條路徑總覽

```
                  ┌──────────────────────────────┐
                  │  inbound_request status=received│
                  └────────┬─────────────────────┘
                           │
              ┌────────────┴───────────────┐
              │                            │
       【路徑 A：合併建單】          【路徑 B：single 補資訊】
       客戶主動建出庫合併多筆        Phase 5 自動建（held=phase7_not_ready）
       /zh-hk/outbound/new          /zh-hk/outbound/[id]/edit

         選多筆 inbound 勾選         看 inbound 已綁
         選 carrier                  選 carrier（single_shipping carrier 預填）
         選 收貨地址                 確認收貨地址
         勾處理偏好                  勾處理偏好
         試算                        試算
              │                            │
              └──────┬─────────────────────┘
                     │
              outbound.status check 餘額閘
                     │
                ┌────┴────┐
                │         │
        balance ≥ 0   balance < 0
                │         │
   status=ready_for_  status=held
   label              held_reason='insufficient_balance'
                │         │
                └────┬────┘
                     │
              【Phase 8 接手】
              處理偏好決定後續流程：
              - 全託管 → WMS 員工取 label
              - 出貨前確認 → WMS pack 後 status=pending_client_label，等客戶
```

### 1.2 路徑 A：合併建出庫單

#### 1.2.1 進入合併建單頁

路徑：`/zh-hk/outbound/new`
入口：
- OMS sidebar「出庫管理」→「建立出庫單」
- 預報列表「已上架」tab → 多選 → 點 [建立出庫單]（帶入預選 inbound）

#### 1.2.2 UI 流程

```
[合併建單頁 - Desktop / Mobile responsive]
═══════════════════════════════════════════════════════════════

╔═ Step 1：選擇要出庫的 inbound（左 50%）═══════════════════════╗
║                                                                 ║
║ 倉庫: [日本埼玉倉 ▼]（v1 只一個，dropdown 預設選好）            ║
║                                                                 ║
║ 可出庫的 inbound（status=received，未被 link 到 outbound）:    ║
║                                                                 ║
║ ☑ I-20260508-0001  2.5kg  30x25x15cm  到倉 5/8                ║
║ ☑ I-20260508-0002  1.2kg  20x15x10cm  到倉 5/8                ║
║ ☐ I-20260509-0003  3.0kg  40x30x20cm  到倉 5/9                ║
║ ☐ I-20260509-0004  ...                                          ║
║                                                                 ║
║ 已選 2 件，總重 3.7 kg                                          ║
║                                                                 ║
╚════════════════════════════════════════════════════════════════╝

╔═ Step 2：選 carrier + 收貨地址（右 50%）══════════════════════╗
║                                                                 ║
║ 物流商 *：                                                      ║
║   [雲途 (帳號 ITC0893791) ▼]                                   ║
║   * 從您已綁定的 carrier 列出（active 帳號）                    ║
║                                                                 ║
║ 收貨地址 *：                                                    ║
║   ⚪ 使用預設地址（[您的 default 地址預覽]）                    ║
║   ⚪ 自填臨時地址                                               ║
║     [姓名] [電話] [國家] [地址] [郵編]                          ║
║   ☐ 儲存為預設地址                                              ║
║                                                                 ║
║ 處理偏好 *：                                                    ║
║   ⚪ 全託管（推薦）— WMS 直接 pack + 取 label + 出貨            ║
║   ⚪ 出貨前確認 — WMS pack 後通知您看實重，您確認才取 label    ║
║                                                                 ║
║ ─ Capacity 即時驗證 ─                                          ║
║ ✅ 雲途允許：總重 ≤ 30kg / 單邊 ≤ 60cm                         ║
║ 您目前 3.7kg / 30x25x15cm                                       ║
║                                                                 ║
║ [試算運費]                                                      ║
║                                                                 ║
║ ─ 試算結果（試算後顯示）─                                       ║
║ 雲途試算: HK$58 (5 分鐘內有效，最終以 carrier label 為準)      ║
║                                                                 ║
║       [送出建立出庫單]    [取消]                                ║
╚════════════════════════════════════════════════════════════════╝
```

#### 1.2.3 客戶送出建單動作

```typescript
async function clientCreateOutbound({ form_data, client_id }) {
  const session = await mongoose.startSession();
  let outbound_id;
  
  await session.withTransaction(async () => {
    // 1. atomic 驗證 inbound 們狀態
    //    - status=received
    //    - client_id=當前客戶
    //    - 未被 link 到 active outbound（沒在 outbound_inbound_links 且 unlinked_at=null）
    const inbounds = await InboundRequest.find({
      _id: { $in: form_data.inbound_ids },
      client_id,
      status: 'received',
    }, null, { session });
    
    if (inbounds.length !== form_data.inbound_ids.length) {
      throw new Error('SOME_INBOUNDS_NOT_AVAILABLE');
    }
    
    // 檢查未被 link
    const existingLinks = await OutboundInboundLink.find({
      inbound_id: { $in: form_data.inbound_ids },
      unlinked_at: null,
    }, null, { session });
    if (existingLinks.length > 0) {
      throw new Error('SOME_INBOUNDS_ALREADY_LINKED', { details: existingLinks });
    }
    
    // 2. carrier capacity check
    const carrier = await Carrier.findOne({ code: form_data.carrier_code });
    if (!carrier) throw new Error('CARRIER_NOT_FOUND');
    
    const totals = aggregate(inbounds);  // total_weight, max_dimension, item_count
    const capacityResult = await capacityCheck(carrier.capacity_rules, totals);
    if (!capacityResult.passed) {
      throw new Error('CAPACITY_VIOLATION', { details: capacityResult.violations });
    }
    
    // 3. 驗證 client_carrier_account 屬於當前客戶 + active
    const clientCarrierAccount = await ClientCarrierAccount.findOne({
      _id: form_data.carrier_account_id,
      client_id,
      status: 'active',
    });
    if (!clientCarrierAccount) throw new Error('CARRIER_ACCOUNT_INVALID');
    
    // 4. 驗證 receiver_address
    let receiver_address;
    if (form_data.use_default_address) {
      const client = await Client.findById(client_id);
      if (!client.default_shipping_address) throw new Error('NO_DEFAULT_ADDRESS');
      receiver_address = client.default_shipping_address;
    } else {
      receiver_address = form_data.receiver_address;
      // 驗證必填欄位
      if (form_data.save_as_default) {
        await Client.updateOne(
          { _id: client_id },
          { default_shipping_address: receiver_address },
          { session }
        );
      }
    }
    
    // 5. 試算 rate quote（snapshot 存到 outbound）
    const rateQuote = await rateCardService.getQuote({
      carrier,
      client_carrier_account: clientCarrierAccount,
      receiver_address,
      totals,
    });
    
    // 6. 建 outbound_request
    outbound_id = await generateOutboundId();  // OUT-YYYYMMDD-NNNN
    const balance = await walletService.getBalance(client_id);
    const status = balance >= 0 ? 'ready_for_label' : 'held';
    const held_reason = status === 'held' ? 'insufficient_balance' : null;
    
    await OutboundRequest.create([{
      _id: outbound_id,
      client_id,
      warehouseCode: form_data.warehouseCode,
      carrier_code: form_data.carrier_code,
      carrier_account_id: form_data.carrier_account_id,
      receiver_address,
      processing_preference: form_data.processing_preference, // 'auto' / 'confirm_before_label'
      rate_quote_at_create: rateQuote,  // snapshot
      shipment_type: 'consolidated',  // 路徑 A 走 consolidated
      total_weight_estimate: totals.total_weight,
      total_dimension_estimate: totals.dimension_summary,
      item_count: inbounds.length,
      status,
      held_reason,
      created_at: new Date(),
    }], { session });
    
    // 7. 建 outbound_inbound_links 中介表
    const links = inbounds.map(inb => ({
      outbound_id,
      inbound_id: inb._id,
      linked_at: new Date(),
      unlinked_at: null,
    }));
    await OutboundInboundLink.insertMany(links, { session });
    
    // 8. inbound 主檔狀態流轉（v1 暫不改 status，因為 picking 才改）
    //    但加 cache 欄位 outbound_id 方便查詢
    await InboundRequest.updateMany(
      { _id: { $in: form_data.inbound_ids } },
      { active_outbound_id: outbound_id },
      { session }
    );
    
    // 9. 寫 outbound_action_logs（audit）
    await OutboundActionLog.create([{
      outbound_id,
      action: 'created',
      operator_type: 'client',
      operator_id: client_id,
      details: { inbound_ids: form_data.inbound_ids, rate_quote: rateQuote },
    }], { session });
    
    // 10. 寫 notification
    await Notification.create([{
      client_id,
      type: status === 'held' ? 'outbound_held_insufficient_balance' : 'outbound_created',
      payload: { outbound_id, status, held_reason },
    }], { session });
  });
  
  return { outbound_id };
}
```

提交後：
- 跳 outbound 詳情頁顯示成功 toast
- status=ready_for_label：訊息「已建立出庫單，倉庫將安排處理」
- status=held：訊息「餘額不足 HK$X，請至錢包儲值」+ 連結

### 1.3 路徑 B：single 模式 outbound 補資訊

#### 1.3.1 場景

Phase 5 客戶建 inbound 選 single → receive 後自動建 outbound（status=held + held_reason='phase7_not_ready'）。Phase 7 啟用後，這些 outbound 的 held_reason 自動轉成依餘額判斷（migration script）。

客戶在 outbound 列表看到：
```
OUT-20260508-0001  / single 模式 / 1 件 / 狀態：等待補完資訊
[補完資訊]
```

#### 1.3.2 補資訊頁 UI

路徑：`/zh-hk/outbound/[id]/edit`

```
[Single 補資訊頁]
═══════════════════════════════════════════════════════════════

╔═ inbound 資訊（read-only）═══════════════════════╗
║ I-20260508-0001                                  ║
║ 重量 2.5 kg / 尺寸 30x25x15 cm                  ║
║ 從預報延伸 single_shipping:                      ║
║ - carrier: 雲途（已預填）                        ║
║ - 收貨地址: [Phase 4 填的地址]（已預填）         ║
╚══════════════════════════════════════════════════╝

╔═ 補完資訊 ═════════════════════════════════════╗
║                                                  ║
║ 確認 carrier:                                    ║
║ [雲途 (帳號 ITC0893791) ▼]（已預填，可改）      ║
║                                                  ║
║ 確認收貨地址:                                    ║
║ [Phase 4 single_shipping 地址預覽]              ║
║ [✏️ 編輯地址]                                   ║
║                                                  ║
║ 處理偏好 *：                                     ║
║   ⚪ 全託管（推薦）                              ║
║   ⚪ 出貨前確認                                  ║
║                                                  ║
║ ─ 試算 ─                                       ║
║ [試算運費]                                       ║
║ 雲途試算: HK$28（5 分鐘內有效）                 ║
║                                                  ║
║         [確認送出]    [取消]                     ║
╚══════════════════════════════════════════════════╝
```

#### 1.3.3 客戶確認送出動作

```typescript
async function clientCompleteSingleOutbound({ outbound_id, form_data, client_id }) {
  const session = await mongoose.startSession();
  
  await session.withTransaction(async () => {
    // 1. atomic 驗證 outbound 狀態
    const outbound = await OutboundRequest.findOneAndUpdate(
      {
        _id: outbound_id,
        client_id,
        status: 'held',
        held_reason: { $in: ['phase7_not_ready', 'awaiting_client_input'] },
        shipment_type: 'single',
      },
      {
        carrier_code: form_data.carrier_code,
        carrier_account_id: form_data.carrier_account_id,
        receiver_address: form_data.receiver_address,
        processing_preference: form_data.processing_preference,
        rate_quote_at_create: form_data.rate_quote,
        // status 暫存 held，下面餘額閘決定
      },
      { new: true, session }
    );
    
    if (!outbound) throw new Error('OUTBOUND_NOT_AVAILABLE');
    
    // 2. carrier capacity check（同路徑 A）
    
    // 3. 餘額閘
    const balance = await walletService.getBalance(client_id);
    if (balance >= 0) {
      await OutboundRequest.updateOne(
        { _id: outbound_id },
        { status: 'ready_for_label', held_reason: null },
        { session }
      );
    } else {
      await OutboundRequest.updateOne(
        { _id: outbound_id },
        { held_reason: 'insufficient_balance' },
        { session }
      );
    }
    
    // 4. 寫 outbound_action_logs + notification
  });
}
```

### 1.4 處理偏好設定（settings）

#### 1.4.1 客戶 settings 頁加 section

路徑：`/zh-hk/settings/preferences`

```
[Settings - 偏好設定]
═══════════════════════════════════════════════════

預設出庫處理偏好：
○ 全託管（推薦）
○ 出貨前確認
[儲存]

說明：
- 全託管：複重通過後系統 0 秒內自動以您的 carrier 帳號取得 label
  - 失敗則降級到「等待運單」狀態，您需要 OMS 手動處理
- 出貨前確認：複重通過後通知您看實重 / 箱數，您確認後才取 label
- 不論選哪個，運費都由您的 carrier 帳號支付
- ⚠️ single 直發出貨單強制走「全託管」（建 inbound 時即決定）
```

#### 1.4.2 schema

`clients.preferences.outbound_processing_preference` enum：`auto` / `confirm_before_label`，default `auto`。

每次建單時：
- 表單 default = client.preferences.outbound_processing_preference
- 客戶可 override 此次選擇
- **single 模式 inbound 自動建 outbound 強制 `auto`，不 follow 此設定**（Phase 8 v1.2）

#### 1.4.3 v1.2 語意更新（Phase 8 對齊）

| enum 值 | v1.0 / v1.1 語意 | v1.2 語意（Phase 8 對齊後）|
|---|---|---|
| `auto`（全託管）| WMS 員工取 label | **複重通過後系統 0 秒內自動 trigger**（不再員工點按鈕；失敗降級到 confirm_before_label 流程）|
| `confirm_before_label`（出貨前確認）| WMS pack 後 status=pending_client_label 等客戶 | 複重通過後 status=pending_client_label 等客戶手動 |

主導權變化：
- v1.0 / v1.1：WMS 員工取 label 為主（auto 模式員工點按鈕 + confirm 模式客戶點）
- **v1.2：客戶（或系統替客戶）取 label 為主**（auto 模式系統自動 + confirm 模式客戶手動）

### 1.5 餘額閘 + held 解綁邏輯

#### 1.5.1 建 outbound 時

```typescript
const balance = await walletService.getBalance(client_id);
const status = balance >= 0 ? 'ready_for_label' : 'held';
const held_reason = status === 'held' ? 'insufficient_balance' : null;
```

**注意**：v1 不在建 outbound 時扣費（出庫運費走客戶 carrier 帳號）。**餘額閘只是檢查，不扣**。

#### 1.5.2 walletService.topup_approved hook 解綁

Phase 3 walletService 在 admin 核准儲值時觸發 hook：

```typescript
async function onTopupApproved({ client_id, transaction_id }) {
  // 既有 Phase 3 邏輯：寫流水、更新 client.balance
  
  // Phase 7 新增：解綁 held outbound
  const balance = await walletService.getBalance(client_id);
  if (balance >= 0) {
    const heldOutbounds = await OutboundRequest.find({
      client_id,
      status: 'held',
      held_reason: 'insufficient_balance',
    });
    
    for (const outbound of heldOutbounds) {
      await OutboundRequest.updateOne(
        { _id: outbound._id, status: 'held' },  // atomic 防 race
        { status: 'ready_for_label', held_reason: null }
      );
      
      await OutboundActionLog.create({
        outbound_id: outbound._id,
        action: 'held_released',
        operator_type: 'system',
        details: { released_reason: 'topup_approved', balance_after: balance },
      });
      
      await Notification.create({
        client_id,
        type: 'outbound_held_released',
        payload: { outbound_id: outbound._id },
      });
    }
  }
}
```

#### 1.5.3 walletService.adjustment（admin 後台手動調整）

同樣觸發 hook（Phase 3 既有 service 點）：admin 替客戶補餘額 → 解綁 held outbound。

#### 1.5.4 排除非 'insufficient_balance' 的 held 不解綁

held_reason 列舉：

| held_reason | 解綁條件 |
|---|---|
| `insufficient_balance` | walletService.topup_approved / adjustment hook 觸發 |
| `phase7_not_ready` | Phase 7 上線時 migration script 解綁 |
| `awaiting_client_input` | 客戶完成 single 補資訊頁觸發 |
| `label_failed_retry` | Phase 8 範圍，客戶 retry 觸發 |

`phase7_not_ready` migration script 邏輯：

```typescript
async function migratePhase7HeldOutbounds() {
  const oldHelds = await OutboundRequest.find({
    status: 'held',
    held_reason: 'phase7_not_ready',
  });
  
  for (const outbound of oldHelds) {
    if (outbound.shipment_type === 'single' && !outbound.carrier_code) {
      // single 但客戶沒補資訊 → 改 held_reason='awaiting_client_input'
      await OutboundRequest.updateOne(
        { _id: outbound._id },
        { held_reason: 'awaiting_client_input' }
      );
    } else {
      // 走餘額閘
      const balance = await walletService.getBalance(outbound.client_id);
      if (balance >= 0) {
        await OutboundRequest.updateOne(
          { _id: outbound._id },
          { status: 'ready_for_label', held_reason: null }
        );
      } else {
        await OutboundRequest.updateOne(
          { _id: outbound._id },
          { held_reason: 'insufficient_balance' }
        );
      }
    }
  }
}
```

### 1.6 Outbound 取消

#### 1.6.1 取消條件（v1.2 加嚴）

| 狀態 | 客戶可取消 | admin 可取消 | 處理 |
|---|---|---|---|
| `ready_for_label` | ✅ | ✅ | 改 status=cancelled，inbound 們解 link，audit |
| `held` | ✅ | ✅ | 同上 |
| `pending_client_label` | ✅ | ✅ | 同上（出貨前確認模式 / auto 失敗降級）|
| `picking` | ❌ | ✅（force-cancel）| 物理動作開始，僅 admin 介入 |
| `picked` / `packing` / `packed` / `weighing` / `weight_verified` | ❌ | ✅（force-cancel）| 物理動作進行中 |
| **`label_obtaining`** | ❌（v1.2 加嚴）| ✅（force-cancel）| **業主對齊：自動取 label 優先，不可取消** |
| `label_obtained` / `label_printed` | ❌ | ✅（admin-cancel-label）| 已取 label，要 carrier cancelLabel + 退費邏輯 |
| `departed` / `cancelled` | ❌ | ❌ | 已出倉或已取消 |

**v1.2 業主對齊（Phase 8 Q3）**：自動取 label 優先，做到 label_obtaining 步驟客戶就不能取消，必須 admin 介入。

#### 1.6.2 客戶取消動作

```typescript
async function clientCancelOutbound({ outbound_id, client_id, cancel_reason }) {
  const session = await mongoose.startSession();
  
  await session.withTransaction(async () => {
    // 1. atomic 驗證（v1.2 status 列表加嚴：去掉 label_obtaining 後狀態）
    const outbound = await OutboundRequest.findOneAndUpdate(
      {
        _id: outbound_id,
        client_id,
        status: { $in: ['ready_for_label', 'held', 'pending_client_label'] },
      },
      {
        status: 'cancelled',
        cancelled_at: new Date(),
        cancel_reason,
      },
      { new: true, session }
    );
    
    if (!outbound) throw new Error('OUTBOUND_NOT_CANCELLABLE');
    
    // 2. 解 link 中介表（append-only：set unlinked_at，不刪 record）
    await OutboundInboundLink.updateMany(
      { outbound_id, unlinked_at: null },
      { unlinked_at: new Date() },
      { session }
    );
    
    // 3. inbound 主檔 active_outbound_id 清空
    const linkedInbounds = await OutboundInboundLink.find(
      { outbound_id }, null, { session }
    );
    await InboundRequest.updateMany(
      { _id: { $in: linkedInbounds.map(l => l.inbound_id) } },
      { $unset: { active_outbound_id: '' } },
      { session }
    );
    
    // 4. 寫 inbound_scans type=outbound_unlinked 給每個 inbound
    for (const link of linkedInbounds) {
      await InboundScan.create([{
        _id: await generateScanId(),
        inbound_request_id: link.inbound_id,
        type: 'outbound_unlinked',
        operator_staff_id: 'SYSTEM',
        staff_note: `Outbound ${outbound_id} cancelled: ${cancel_reason}`,
      }], { session });
    }
    
    // 5. 寫 outbound_action_logs + notification
    await OutboundActionLog.create([{
      outbound_id,
      action: 'cancelled',
      operator_type: 'client',
      operator_id: client_id,
      details: { cancel_reason },
    }], { session });
    
    await Notification.create([{
      client_id,
      type: 'outbound_cancelled',
      payload: { outbound_id, cancel_reason },
    }], { session });
  });
}
```

#### 1.6.3 inbound 退回 received 不退費

inbound 之前在 receive 階段已扣 HK$5（Phase 5）。outbound 取消後 inbound 退回 received，**不退費**（業主決策 D.3：扣費基於 receive 動作，跟 outbound 無關）。

inbound 可以再次被加進另一個 outbound（或客戶再建合併單）。

### 1.7 Carrier Rate / Label Service 抽象層

#### 1.7.1 設計目標

避坑 fuuffy A1（沒有 carrier 抽象層）：
- 主邏輯不 hardcoded if/else carrier
- 新增 carrier 只加 adapter，不動主邏輯
- v1 兩個 carrier：雲途（API key）+ Fuuffy（OAuth）

#### 1.7.2 介面定義

```typescript
interface CarrierRateAdapter {
  getQuote(input: RateQuoteInput): Promise<RateQuoteOutput>;
  // Phase 8 才用：
  getLabel?(input: GetLabelInput): Promise<GetLabelOutput>;
  cancelLabel?(input: CancelLabelInput): Promise<void>;
  getTracking?(input: GetTrackingInput): Promise<TrackingOutput>;
}

interface RateQuoteInput {
  carrier: Carrier;
  client_carrier_account: ClientCarrierAccount;
  receiver_address: Address;
  totals: { total_weight: number; dimension_summary: object; item_count: number };
}

interface RateQuoteOutput {
  carrier_code: string;
  fee_amount: number;
  fee_currency: string;
  service_type: string;  // 例如 '雲途特惠線' / 'Fuuffy 標準'
  estimated_delivery_days: number;
  raw_response: object;  // carrier 原始回應 snapshot（audit）
  quoted_at: Date;
}
```

#### 1.7.3 Adapter Factory

```typescript
function carrierRateServiceFactory(carrier_code: string): CarrierRateAdapter {
  if (process.env.PHASE7_USE_MOCK_CARRIER === 'true') {
    return new MockCarrierRateAdapter(carrier_code);
  }
  
  switch (carrier_code) {
    case 'yun_express': return new YunExpressRateAdapter();
    case 'fuuffy': return new FuuffyRateAdapter();
    default:
      throw new Error(`Unsupported carrier: ${carrier_code}`);
  }
}
```

#### 1.7.4 Mock Adapter（dev / staging 用，行為模擬版）

依 Q1 對齊「(a)+(b) 行為模擬」：依重量 / 收貨地區 / carrier 不同 multiplier 算假價，看得出 carrier 差異。

```typescript
// 雲途 / Fuuffy 不同 multiplier，rate quote 看起來有差異
const CARRIER_MULTIPLIERS = {
  yun_express: { base: 15, per_kg: 8, multiplier: 1.0 },   // 雲途便宜
  fuuffy: { base: 25, per_kg: 12, multiplier: 1.2 },        // Fuuffy 貴 20%
};

// 收貨國家不同 multiplier
const COUNTRY_MULTIPLIERS = {
  HK: 1.0,    // 香港 base
  TW: 1.3,    // 台灣 +30%
  CN: 0.8,    // 中國 -20%
  SG: 1.5,    // 新加坡 +50%
  US: 2.5,    // 美國 +150%
  default: 1.8,
};

class MockCarrierRateAdapter implements CarrierRateAdapter {
  constructor(private carrier_code: string) {}
  
  async getQuote(input: RateQuoteInput): Promise<RateQuoteOutput> {
    // 模擬 1 秒 carrier API delay
    await sleep(800 + Math.random() * 400);
    
    // 失敗測試：metadata 標記 force_error → throw（dev 測 retry / 錯誤 UI）
    if (input.metadata?.mock_force_error) {
      throw new Error('MOCK_CARRIER_ERROR: Simulated rate quote failure');
    }
    
    const carrierConfig = CARRIER_MULTIPLIERS[this.carrier_code] || CARRIER_MULTIPLIERS.yun_express;
    const countryMultiplier = COUNTRY_MULTIPLIERS[input.receiver_address.country] || COUNTRY_MULTIPLIERS.default;
    
    // base + per_kg × weight，再乘 carrier multiplier 跟 country multiplier
    const baseFee = carrierConfig.base + carrierConfig.per_kg * input.totals.total_weight;
    const finalFee = Math.round(baseFee * carrierConfig.multiplier * countryMultiplier);
    
    return {
      carrier_code: this.carrier_code,
      fee_amount: finalFee,
      fee_currency: 'HKD',
      service_type: `Mock ${this.carrier_code} 標準線`,
      estimated_delivery_days: this.carrier_code === 'yun_express' ? 7 : 5,
      raw_response: {
        mock: true,
        formula: `${carrierConfig.base} + ${carrierConfig.per_kg}*${input.totals.total_weight}*${carrierConfig.multiplier}*${countryMultiplier}`,
        carrier_config: carrierConfig,
        country_multiplier: countryMultiplier,
      },
      quoted_at: new Date(),
    };
  }
  
  // Phase 8 範圍實作（Phase 7 範圍此 adapter 不打 getLabel）
  async getLabel?(input: GetLabelInput): Promise<GetLabelOutput> {
    await sleep(2000 + Math.random() * 1000);  // 模擬 carrier API 慢
    
    if (input.metadata?.mock_force_error) {
      throw new Error('MOCK_CARRIER_ERROR: Simulated label fetch failure');
    }
    
    // 動態生成假 PDF 走共用 pdfService
    const pdfPath = await pdfService.generateMockLabel({
      carrier_code: this.carrier_code,
      outbound_id: input.outbound_id,
      tracking_no: `MOCK-${this.carrier_code.toUpperCase()}-${Date.now()}`,
      receiver_address: input.receiver_address,
      weight: input.totals.total_weight,
      dimension: input.totals.dimension_summary,
    });
    
    return {
      tracking_no: `MOCK-${this.carrier_code.toUpperCase()}-${Date.now()}`,
      label_pdf_path: pdfPath,
      fee_amount: input.expected_fee || 0,  // mock 直接 echo expected fee
      raw_response: { mock: true, pdf_generated: pdfPath },
      label_obtained_at: new Date(),
    };
  }
}
```

#### 1.7.5 Mock 失敗測試入口

dev / staging 階段測試「carrier API 失敗」UX 的方法：

- **方法 1**：客戶建單時 form data 加 `_mock_force_error=true`（hidden field，dev tool 可改）→ adapter throw error
- **方法 2**：admin 後台改 outbound.metadata.mock_force_error=true → 下一次 carrier call 失敗
- **方法 3**：env flag `MOCK_FORCE_ALL_ERRORS=true` → 所有 carrier call 失敗（壓力測試 retry 邏輯）

dev / staging 必跑的 mock 失敗測試：
- rate quote 失敗 → 客戶看錯誤訊息可重試
- get label 失敗 → 客戶 / WMS 員工看錯誤可重試
- 連續 retry N 次都失敗 → CS 看 carrier_api_logs 處理（v1 不做後台 retry UI）

#### 1.7.6 PDF Service（共用 component）

mock label PDF 生成走 `pdfService.generateMockLabel`：

```typescript
async function generateMockLabel(input: MockLabelInput): Promise<string> {
  const PDFDocument = require('pdfkit');
  const fs = require('fs');
  const doc = new PDFDocument({ size: 'A6' });  // label 標準尺寸 105×148mm
  const filename = `mock_label_${input.outbound_id}_${Date.now()}.pdf`;
  const filepath = `/uploads/labels/${input.outbound_id}/${filename}`;
  
  ensureDir(dirname(filepath));
  doc.pipe(fs.createWriteStream(filepath));
  
  // PDF 內容：模擬真 carrier label
  doc.fontSize(20).text(`[MOCK] ${input.carrier_code.toUpperCase()}`, { align: 'center' });
  doc.fontSize(12).text(`Tracking: ${input.tracking_no}`);
  doc.text(`Outbound: ${input.outbound_id}`);
  doc.text(`Weight: ${input.weight} kg`);
  doc.text(`To: ${input.receiver_address.name}`);
  doc.text(input.receiver_address.address_line1);
  doc.text(`${input.receiver_address.city}, ${input.receiver_address.country}`);
  doc.fontSize(8).text('⚠️ This is a MOCK label generated for dev/staging testing only.', { color: 'red' });
  
  doc.end();
  return filepath;
}
```

PDF 內容明確標 `[MOCK]` 跟警告文字，dev / staging 列印出來不會誤認為真 label。

prod 切真實 API 時，labelService.getLabel 走 carrier 真實 API 拿真 PDF binary 寫入檔案系統（Phase 8 實作）。

#### 1.7.7 Adapter Factory 更新

#### 1.7.5 Rate Quote Cache

cache 5 分鐘減少 carrier API 呼叫：

```typescript
async function getQuote(input: RateQuoteInput): Promise<RateQuoteOutput> {
  const cacheKey = `rate_quote:${input.carrier.code}:${input.client_carrier_account._id}:${hash(input.receiver_address)}:${hash(input.totals)}`;
  
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);
  
  const adapter = carrierRateServiceFactory(input.carrier.code);
  const quote = await adapter.getQuote(input);
  
  // 寫 audit log
  await RateQuoteLog.create({
    carrier_code: input.carrier.code,
    client_id: input.client_carrier_account.client_id,
    input_summary: { weight: input.totals.total_weight, address: input.receiver_address.country },
    output_summary: { fee: quote.fee_amount, currency: quote.fee_currency },
    raw_response: quote.raw_response,
    queried_at: new Date(),
  });
  
  await redis.setex(cacheKey, 300, JSON.stringify(quote));  // 5 分鐘
  return quote;
}
```

### 1.8 Carrier Capacity 檢查

#### 1.8.1 carriers.capacity_rules schema

`carriers` 主檔加 `capacity_rules` JSON 欄位（Phase 2 carriers 主檔擴充）：

```json
{
  "max_total_weight_kg": 30,
  "max_single_dimension_cm": 60,  // 單邊
  "max_volumetric_weight_kg": 35,
  "max_girth_cm": 200,  // 2*(W+H)+L
  "max_item_count": 50,
  "min_total_weight_kg": 0.1,
  "min_single_dimension_cm": 1
}
```

v1 雲途 + Fuuffy 各自配置（業主提供 / Phase 7 落地時補）。

#### 1.8.2 檢查邏輯

```typescript
function capacityCheck(rules: CapacityRules, totals: OutboundTotals): CapacityCheckResult {
  const violations = [];
  
  if (rules.max_total_weight_kg && totals.total_weight > rules.max_total_weight_kg) {
    violations.push({
      rule: 'max_total_weight_kg',
      limit: rules.max_total_weight_kg,
      actual: totals.total_weight,
    });
  }
  
  // 其他 rules 同樣 check
  
  return { passed: violations.length === 0, violations };
}
```

#### 1.8.3 client + server 雙驗

- client：建單頁 inbound 多選時即時加總 + carrier dropdown 選好後即時驗證 → 違規顯示警告但不擋（避免 UX 過度阻塞）
- server：提交建單時 server-side 重驗 → 違規 4xx

### 1.9 客戶取 label 流程（v1.2：所有路線通用）

> v1.2 改造（Phase 8 對齊）：此頁原本只給 confirm_before_label 模式用，v1.2 起變成「所有路線客戶取 label」的通用頁面。auto 模式下系統自動 trigger 失敗（capacity / auth 等問題）也會走此頁讓客戶手動處理。UI framing 依 `processing_preference + held_reason` 動態顯示。

#### 1.9.1 觸發點（v1.2 擴展）

兩條路線都會走進此頁：

- `processing_preference='confirm_before_label'` → 複重通過後 status=pending_client_label（**正常流程**，等客戶手動點）
- `processing_preference='auto'` → 複重通過後系統 0 秒 trigger label，**失敗則降級** status=pending_client_label + held_reason 標明失敗原因（客戶手動處理）

兩種情境共用同一個頁面 `/zh-hk/outbound/[id]/confirm-label`，UI framing 不同（見 Phase 8 §1.5.5 詳細）。

#### 1.9.2 客戶看詳情頁

路徑：`/zh-hk/outbound/[id]/confirm-label`

```
[出貨前確認頁]
═══════════════════════════════════════════════════════════════

╔═ 實際出庫資訊（WMS 已量好）═════════════════════╗
║                                                  ║
║ 總重量: 12.5 kg                                  ║
║   建立時試算: 11 kg                              ║
║   差異: +1.5 kg ⚠️                              ║
║                                                  ║
║ 總尺寸: 50x40x30 cm                              ║
║   建立時試算: 48x40x30 cm                        ║
║                                                  ║
║ 重新試算運費（雲途）：                           ║
║ HK$58                                            ║
║   建立時試算: HK$50                              ║
║   差異: +HK$8                                    ║
║                                                  ║
║ ⚠️ 實際運費以 carrier label 取得時為準           ║
║                                                  ║
╚══════════════════════════════════════════════════╝

╔═ 動作 ═════════════════════════════════════════╗
║                                                  ║
║ 確認以您的雲途帳號取得 Shipping Label。          ║
║ 取得後即無法取消，運費將由 carrier 直接計費。    ║
║                                                  ║
║   [取得 Shipping Label]    [取消出庫單]          ║
║                                                  ║
╚══════════════════════════════════════════════════╝
```

#### 1.9.3 客戶點 [取得 Shipping Label] 動作

```typescript
async function clientConfirmAndGetLabel({ outbound_id, client_id }) {
  // 1. atomic 驗證 outbound.status=pending_client_label + processing_preference='confirm_before_label'
  const outbound = await OutboundRequest.findOneAndUpdate(
    {
      _id: outbound_id,
      client_id,
      status: 'pending_client_label',
      processing_preference: 'confirm_before_label',
    },
    { status: 'label_obtaining' },  // 中間態，防 double click
    { new: true }
  );
  
  if (!outbound) throw new Error('OUTBOUND_NOT_PENDING_CONFIRM');
  
  try {
    // 2. 取最新實重 / 實尺寸（Phase 8 WMS pack 完成後寫的）
    // 3. 重新 rate quote（不用 cache，最新報價）
    // 4. 呼叫 carrier label API（Phase 8 範圍邏輯，Phase 7 此處先 stub）
    
    // Phase 7 v1 範圍：實際 label 取得交給 Phase 8 共用 service
    // 但 Phase 7 完成 client_self_label flow 的入口
    const labelResult = await labelService.getLabel({
      outbound_id,
      operator_type: 'client',
      operator_id: client_id,
    });
    
    // 5. status: label_obtaining → label_obtained
    await OutboundRequest.updateOne(
      { _id: outbound_id },
      {
        status: 'label_obtained',
        label_obtained_at: new Date(),
        label_obtained_by: 'client',
        label_pdf_path: labelResult.label_pdf_path,
        tracking_no_carrier: labelResult.tracking_no,
        actual_label_fee: labelResult.fee_amount,
      }
    );
    
    // 6. notification + outbound_action_logs
  } catch (err) {
    // label 取得失敗 → 退回 pending_client_label + 標記 retry
    await OutboundRequest.updateOne(
      { _id: outbound_id },
      {
        status: 'pending_client_label',
        last_label_error: err.message,
        label_retry_count: { $inc: 1 },
      }
    );
    
    throw new Error('LABEL_FETCH_FAILED', { details: err.message });
  }
}
```

#### 1.9.4 失敗 retry

- 客戶看 error message 即時顯示
- 詳情頁顯示「上次嘗試失敗：[錯誤訊息]」
- 客戶可再次點 [取得 Shipping Label]
- v1 不做自動 retry，純客戶端 retry
- 失敗 N 次（v1 不限）→ CS 看 carrier_api_logs 處理（v1 不做後台 retry UI）

### 1.10 Notification Type 清單（Phase 7 範圍）

| Type | 觸發點 | 收件人 | 訊息 |
|---|---|---|---|
| `outbound_created` | 客戶建 outbound 成功 status=ready_for_label | 客戶 | 「出庫單 OUT-... 已建立，倉庫將安排處理」 |
| `outbound_held_insufficient_balance` | 建立時 status=held | 客戶 | 「餘額不足 HK$X，請至錢包儲值，儲值後系統自動繼續處理」 |
| `outbound_held_released` | walletService topup approved 解綁 held outbound | 客戶 | 「您的出庫單 OUT-... 已解除暫停，倉庫將安排處理」 |
| `outbound_cancelled` | 客戶取消 outbound | 客戶 | 「出庫單 OUT-... 已取消」 |
| `outbound_pending_client_label` | Phase 8 範圍 WMS pack 完成（出貨前確認模式）| 客戶 | 「您的出庫單已 pack 完成，請確認並取得 Shipping Label」 |
| `outbound_label_obtained` | 客戶或 WMS 取 label 成功 | 客戶 | 「Shipping Label 已取得，追蹤號 XXX，貨物即將出倉」 |

### 1.11 Cross-service Sync

#### 1.11.1 OMS → WMS

```
POST /api/wms/sync/outbound-created       OMS 通知 WMS：新 outbound（含 inbound_ids 列表）
POST /api/wms/sync/outbound-cancelled     OMS 通知 WMS：outbound 取消
POST /api/wms/sync/outbound-status         OMS 通知 WMS：status 變更（held → ready_for_label etc.）
```

#### 1.11.2 WMS → OMS

Phase 8 範圍（WMS 改 outbound status，例如 picking / packed / pending_client_label / label_obtained / departed）。

---

## 2. Schema 變更

### 2.1 `outbound_requests`（**新增主檔**）

| 欄位 | 型別 | 說明 |
|---|---|---|
| `_id` | string | OUT-YYYYMMDD-NNNN |
| `client_id` | string | FK to clients |
| `warehouseCode` | string | FK to warehouses |
| `carrier_code` | string? | FK to carriers，single 模式建立時可能 null |
| `carrier_account_id` | string? | FK to client_carrier_accounts |
| `receiver_address` | object | snapshot from client.default_shipping_address or 自填 |
| `processing_preference` | enum | `auto` / `confirm_before_label` |
| `shipment_type` | enum | `consolidated` / `single` |
| `from_inbound_id` | string? | 若 single 模式從 inbound 觸發 |
| `total_weight_estimate` | number | client + server 算的總重量 |
| `total_dimension_estimate` | object | summary（max_dimension / volumetric_weight 等）|
| `item_count` | number | linked inbound 數量 |
| `rate_quote_at_create` | object | snapshot of RateQuoteOutput at 建立時 |
| `actual_label_fee` | number? | Phase 8 取 label 後寫 |
| `tracking_no_carrier` | string? | Phase 8 取 label 後寫 |
| `label_pdf_path` | string? | Phase 8 範圍 |
| `label_obtained_at` | date? | |
| `label_obtained_by` | enum? | `client` / `wms_staff` |
| `label_retry_count` | number | default 0 |
| `last_label_error` | string? | |
| `status` | enum | `ready_for_label` / `held` / `picking` / `packed` / `pending_client_label` / `label_obtaining` / `label_obtained` / `palletized` / `departed` / `cancelled` |
| `held_reason` | enum? | `insufficient_balance` / `phase7_not_ready` / `awaiting_client_input` / `label_failed_retry` / `carrier_auth_failed` / `capacity_violation` / `carrier_api_failed`（後 3 個 v1.2 Phase 8 新增）|
| `cancelled_at` | date? | |
| `cancel_reason` | string? | |
| `created_at / updated_at` | date | |

**Indexes**：
- `{ client_id: 1, status: 1, created_at: -1 }`（客戶看自己列表）
- `{ status: 1, processing_preference: 1, created_at: -1 }`（WMS 看待出庫清單）
- `{ carrier_code: 1, status: 1 }`（後 phase carrier 統計）
- `{ held_reason: 1 }`（held 解綁 hook 用）
- `{ from_inbound_id: 1 }`（追溯 single 模式來源）

**Status 流轉圖**（含 Phase 8 範圍預覽）：

```
                  ┌─→ cancelled（任何時候客戶 picking 之前可取消）
                  │
ready_for_label ─┼─→ picking ─→ packed
                  │   (Phase 8)  (Phase 8)
held              │                  ↓
  ↑               │       ┌──────────┴──────────┐
  └────餘額閘─────┤       │                      │
                  │   processing_preference?
awaiting_client   │       │                      │
_input            │  =auto                   =confirm_before_label
(single 補資訊)   │       │                      │
                  │   label_obtaining       pending_client_label
                  │   (WMS 員工點)            (等客戶點)
                  │       │                      │
                  │       └──────────┬──────────┘
                  │                  ↓
                  │             label_obtained
                  │                  ↓
                  │             palletized
                  │                  ↓
                  │             departed
```

### 2.2 `outbound_inbound_links`（**新增中介表**）

借鏡 fuuffy B6 多包裹綁主出貨單。

| 欄位 | 型別 | 說明 |
|---|---|---|
| `_id` | string | |
| `outbound_id` | string | FK to outbound_requests |
| `inbound_id` | string | FK to inbound_requests |
| `linked_at` | date | |
| `unlinked_at` | date? | outbound 取消時 set，append-only 不刪 |

**Indexes**：
- `{ outbound_id: 1, inbound_id: 1 }` unique 加 `unlinked_at: 1`（同 outbound + inbound 可有歷史紀錄，但 active 只一筆）
- `{ inbound_id: 1, unlinked_at: 1 }`（查 inbound 是否已被 link）

**規則**：
- 一個 inbound 同時只能有一筆 active link（unlinked_at=null）
- outbound 取消 → unlinked_at = now（不刪 record）
- 同 inbound 可以重新被 link 到別的 outbound（舊 record 留 audit）

### 2.3 `inbound_requests`（**擴充** Phase 4 / 5 / 6）

| 欄位 | 型別 | 既有 / 新增 | 說明 |
|---|---|---|---|
| `active_outbound_id` | string? | **新增** | cache：當前 active outbound（Phase 7 列表查詢 efficient） |

**Indexes**：
- 新增 `{ client_id: 1, status: 1, active_outbound_id: 1 }`（合併建單頁 inbound 列表查詢）

### 2.4 `clients`（**擴充** Phase 1）

| 欄位 | 型別 | 既有 / 新增 | 說明 |
|---|---|---|---|
| `default_shipping_address` | object? | 既有 Phase 4 預備 | 收貨地址 default |
| `preferences.outbound_processing_preference` | enum? | **新增** | `auto` / `confirm_before_label`，default `auto`。**v1.2 Phase 8 對齊**：single 模式 inbound 自動建 outbound 強制 `auto`，**不 follow 此 default**（業主對齊：single 直發已隱含同意全託管）|

`default_shipping_address` 結構（沿用 Phase 4 預備）：

```json
{
  "name": "John Doe",
  "phone": "+85291234567",
  "country": "HK",
  "address_line1": "...",
  "address_line2": "...",
  "city": "...",
  "postal_code": "..."
}
```

### 2.5 `carriers`（**擴充** Phase 2）

| 欄位 | 型別 | 既有 / 新增 | 說明 |
|---|---|---|---|
| `capacity_rules` | object? | **新增** | JSON: max_total_weight_kg / max_single_dimension_cm 等 |
| `supports_rate_quote` | boolean | **新增** | default true，false 時 UI 不顯示試算按鈕 |
| `supports_label_api` | boolean | **新增** | default true，Phase 8 範圍 |

**v1 seed 補完**：雲途 + Fuuffy 各自的 capacity_rules（業主提供 / 從 PDF 找）。

### 2.6 `outbound_action_logs`（**新增**，audit）

借鏡 Phase 6 assignment_history 風格 + fuuffy B1。

| 欄位 | 型別 | 說明 |
|---|---|---|
| `_id` | string | |
| `outbound_id` | string | FK |
| `action` | enum | `created` / `cancelled` / `held_released` / `label_obtaining` / `label_obtained` / `label_failed` / `picking_started` / `packed` / `palletized` / `departed`（Phase 8 用後 6 種）|
| `operator_type` | enum | `client` / `wms_staff` / `system` |
| `operator_id` | string | client_id / staff_id / 'SYSTEM' |
| `details` | object | action 對應 metadata（cancel_reason / rate_quote / fee 等）|
| `createdAt` | date | append-only |

**Indexes**：
- `{ outbound_id: 1, createdAt: -1 }`

### 2.7 `rate_quote_logs`（**新增**，audit）

| 欄位 | 型別 | 說明 |
|---|---|---|
| `_id` | string | |
| `client_id` | string | |
| `carrier_code` | string | |
| `outbound_id` | string? | 若已建立 outbound |
| `input_summary` | object | { weight, dimension, address_country } |
| `output_summary` | object | { fee_amount, fee_currency, service_type } |
| `raw_response` | object | carrier API 原始回應（debug 用）|
| `queried_at` | date | |
| `cache_hit` | boolean | 是否 cache 命中 |

**Indexes**：
- `{ client_id: 1, queried_at: -1 }`
- `{ carrier_code: 1, queried_at: -1 }`

**保留期**：v1 不做 cron 清理，未來成本上升再加。

### 2.8 `inbound_scans`（**擴充** Phase 5/6）

`type` enum 加：

| Type | 寫入時機 |
|---|---|
| `outbound_linked` | inbound 被 link 到新 outbound |
| `outbound_unlinked` | outbound 取消 / inbound 從 outbound 移除 |

### 2.9 daily_counters（沿用 Phase 4-6）

擴充 prefix：`outbound_2026-05-08` → OUT-20260508-NNNN

### 2.10 `notifications`（既有 Phase 4 預備）

加 6 種 type（見 §1.10）。

---

## 3. 頁面 / API 清單

### 3.1 OMS 頁面

| 路徑 | 形態 | 說明 |
|---|---|---|
| `/zh-hk/outbound/list` | 既有改造 | 出庫單列表 + tab（全部 / 處理中 / 已出貨 / 已取消）|
| `/zh-hk/outbound/new` | **新增** | 合併建單頁 |
| `/zh-hk/outbound/[id]` | 既有改造 | 出庫單詳情頁 |
| `/zh-hk/outbound/[id]/edit` | **新增** | single 模式補資訊頁 |
| `/zh-hk/outbound/[id]/confirm-label` | **新增** | 出貨前確認模式取 label 頁 |
| `/zh-hk/settings/preferences` | 既有 settings 加 section | 處理偏好 default 設定 |
| `/zh-hk/inbound/list` | 既有 Phase 4 + 6 | 多選後加 [建立出庫單] 按鈕 |

### 3.2 WMS 頁面（Phase 7 範圍只看，Phase 8 才操作）

| 路徑 | 形態 | 說明 |
|---|---|---|
| `/zh-hk/operations/outbound-list` | Desktop | admin 看出庫單列表（read-only Phase 7）|
| `/zh-hk/operations/outbound/[id]` | Desktop | admin 看詳情（read-only） |

### 3.3 OMS API endpoints

```
# inbound 列表（建單頁用）
GET    /api/cms/inbound/available-for-outbound  status=received + 自己擁有 + 同倉 + 未被 link

# carrier + capacity
GET    /api/cms/carriers                         客戶已綁的 active carrier
GET    /api/cms/carrier/:code/capacity-rules    capacity 配置（client-side check 用）

# rate quote
POST   /api/cms/outbound/quote                  試算（不建立 outbound，純查詢）

# outbound CRUD
POST   /api/cms/outbound                        建合併出庫單
GET    /api/cms/outbound                        列表（filter / pagination）
GET    /api/cms/outbound/:id                    詳情
PATCH  /api/cms/outbound/:id/complete-single    補完 single 資訊
POST   /api/cms/outbound/:id/cancel             客戶取消
POST   /api/cms/outbound/:id/confirm-label      出貨前確認模式取 label

# settings
GET    /api/cms/clients/me/preferences          看自己 preferences
PUT    /api/cms/clients/me/preferences          改 preferences

# default address
GET    /api/cms/clients/me/default-address      看 default address
PUT    /api/cms/clients/me/default-address      改 default address
```

### 3.4 WMS API endpoints（Phase 7 範圍 read-only）

```
GET    /api/wms/outbound                        admin 看 outbound 列表
GET    /api/wms/outbound/:id                    admin 看詳情
GET    /api/wms/outbound/:id/action-logs        看 audit logs
```

### 3.5 Cross-service Sync API

```
POST   /api/wms/sync/outbound-created           OMS 推 WMS：新 outbound
POST   /api/wms/sync/outbound-cancelled         OMS 推 WMS：取消
POST   /api/wms/sync/outbound-status            OMS 推 WMS：status 變更
```

### 3.6 Sidebar 改造

OMS sidebar 改造：

```
[既有 sidebar]

出庫管理
  ├── 出庫單列表       → /outbound/list
  └── 建立出庫單       → /outbound/new
```

WMS sidebar 不變（Phase 8 才會加完整出庫操作入口）。

---

## 4. ShipItAsia 既有現況對映

| 既有 | 處理 |
|---|---|
| ShipItAsia outbound_requests schema（如有）| **重做**：欄位太薄弱，不支援多 carrier / capacity / processing_preference / rate_quote snapshot 等。|
| ShipItAsia 既有客戶端建出庫頁 | **重做**：流程 / UI / API 都重寫 |
| ShipItAsia 既有 carrier hardcoded（如有 YunExpress 寫死）| **棄用**：Phase 7 走 carrier 抽象層 |
| Phase 5 outboundService.autoCreateForSingle 介面 | 沿用，Phase 7 解 PHASE7_OUTBOUND_ENABLED env flag |
| Phase 5 既存 phase7_not_ready outbound | migration script 解綁（§1.5.4）|

---

## 5. Fuuffy 借鏡

### 5.1 借鏡 B5（主檔 vs 動作快照）— 持續沿用

`outbound_requests` 主檔 + `outbound_action_logs` 子集合（fuuffy B1 風格）。

主檔可被 update（status / actual_label_fee 等），action_logs append-only。

### 5.2 借鏡 B6（多包裹綁主出貨單）⭐⭐⭐⭐⭐ — Phase 7 核心借鏡

`outbound_inbound_links` 中介表完整實作：
- outbound : inbound = 1 : N
- 中介表記錄 linked_at / unlinked_at
- append-only：取消不刪 record

### 5.3 借鏡 B1（log_item_action 結構化動作日誌）

`outbound_action_logs` 走 enum action + 結構化 details + operator_type / operator_id。

### 5.4 死守 A4（沒 wallet → 每張單獨立付款）

Phase 7 餘額閘走 walletService。建 outbound 不繞過直接訪問 client.balance。

### 5.5 死守 A1（沒有 carrier 抽象層）⭐⭐⭐⭐⭐ — Phase 7 核心避坑

carrier rate / label service adapter pattern 完整實作：
- `CarrierRateAdapter` interface
- 雲途 + Fuuffy + Mock 三個 adapter
- adapter factory 依 carrier_code switch
- 主邏輯不 hardcoded if/else

### 5.6 避坑 A2（silent stub return success）

Phase 7 的 carrier rate quote 失敗時：
- adapter 層 throw error（不靜默回 success）
- service 層接住，包裝成業務 error
- frontend 顯示明確錯誤訊息：「Carrier 呼叫失敗：[error message]，請稍後重試」

**Mock adapter 同樣遵守此原則**（對齊 Q1）：
- mock 不能永遠 return success（否則 dev 階段沒測到真實 carrier 失敗 case）
- mock 透過 `metadata.mock_force_error` / `MOCK_FORCE_ALL_ERRORS` env flag 可觸發失敗
- mock 失敗 throw 跟 prod 真實 carrier API 失敗一樣的 error format
- dev / staging test 必須涵蓋 carrier 失敗 retry / 客戶錯誤 UI / WMS 員工錯誤 UI

### 5.7 避坑 A6（萬能 remarks）

cancel_reason / held_reason / processing_preference 都走結構化 enum。客戶 cancel 時可選原因（自由文字 reject_note 走 notes 欄位，不混 enum）。

### 5.8 借鏡 B7（warehouse-level config）

v1 carrier 走 carrier-level config（capacity_rules）。warehouse 不影響 carrier 行為（v1 一倉，未來多倉時加 warehouse-level override 留後 phase）。

---

## 6. Acceptance Criteria（給 Claude Code）

### AC-7.1 客戶看可出庫的 inbound

**Given** 客戶 ABC 有 5 筆 inbound：3 筆 status=received（其中 1 筆已 link 到 OUT-X）+ 2 筆 status=picking
**When** GET `/api/cms/inbound/available-for-outbound?warehouseCode=JP-SAITAMA-01`
**Then**

- 回應 2 筆 status=received + active_outbound_id=null
- 不含已 link 的 inbound
- 不含 picking 後狀態的 inbound

**測試**：

- 跨 client 不誤回（client_id 從 JWT 取）
- 跨倉不誤回
- inbound from_unclaimed_id（Phase 6）也包含在內（沒特殊處理）

### AC-7.2 客戶建合併出庫單基本流程

**Given** 客戶 ABC 有 2 筆 inbound status=received，已綁 carrier 雲途 active，已設 default_shipping_address
**When** POST `/api/cms/outbound` body 含 inbound_ids / carrier_code='yun_express' / use_default_address=true / processing_preference='auto'
**Then**

- 寫 outbound_requests _id=OUT-20260508-0001 status=ready_for_label（假設餘額 ≥ 0）
- 寫 outbound_inbound_links 2 筆 linked_at=now / unlinked_at=null
- 寫 outbound_action_logs action=created
- inbound_requests.active_outbound_id 寫入 OUT-...
- 寫 notification type=outbound_created
- 同步 WMS

**測試**：

- inbound 不屬於當前 client → 4xx
- inbound status≠received → 4xx
- inbound 已 link 到 active outbound → 4xx
- carrier_code 不在 client 已綁列表 → 4xx
- carrier_account status=disabled → 4xx
- 餘額 < 0 → status=held + held_reason='insufficient_balance'
- capacity check 失敗 → 4xx + 顯示 violations
- WMS 同步失敗 → OMS 寫成功不 rollback，sync_failed_logs 寫一筆

### AC-7.3 Capacity Check（雙驗）

**Given** 雲途 capacity_rules { max_total_weight_kg: 30 }，客戶選 inbound 總重 35 kg
**When** client-side：建單頁加總 35kg 顯示警告
**When** server-side：POST `/api/cms/outbound` 提交
**Then**

- 4xx `CAPACITY_VIOLATION`
- response details 含 [{ rule: 'max_total_weight_kg', limit: 30, actual: 35 }]
- frontend 顯示對應錯誤訊息

**測試**：

- 不同 carrier 不同 capacity_rules（雲途 30kg、Fuuffy 50kg）
- max_single_dimension_cm 違反 → 同樣返回 violations
- carrier 沒設 capacity_rules → 走預設無限制（passed）

### AC-7.4 Rate Quote 試算

**Given** 客戶選 2 inbound + 雲途 + 收貨地址
**When** POST `/api/cms/outbound/quote` body 同建單格式（不建 outbound）
**Then**

- 呼叫 carrierRateServiceFactory('yun_express').getQuote(input)
- 寫 rate_quote_logs（cache_hit=false）
- redis cache 5 分鐘
- 回應 RateQuoteOutput（fee_amount / fee_currency / service_type / estimated_delivery_days）

**測試**：

- 5 分鐘內同樣 input 重打 → cache hit，rate_quote_logs.cache_hit=true
- carrier API throw error → 4xx + adapter error message
- mock mode（PHASE7_USE_MOCK_CARRIER=true）→ 走 MockCarrierRateAdapter
- carrier.supports_rate_quote=false → 4xx `RATE_QUOTE_NOT_SUPPORTED`

### AC-7.5 Single 模式補資訊

**Given** Phase 5 既存 outbound OUT-X status=held + held_reason='phase7_not_ready' + shipment_type=single
**When** Phase 7 上線跑 migration → outbound 變 status=held + held_reason='awaiting_client_input'
**When** 客戶進 `/zh-hk/outbound/[id]/edit` 補完 carrier / 地址 / preference
**When** PATCH `/api/cms/outbound/:id/complete-single` body 含補完資料
**Then**

- atomic 驗證 outbound.status=held + held_reason='awaiting_client_input' + client_id 一致
- 寫入 carrier_code / carrier_account_id / receiver_address / processing_preference / rate_quote_at_create
- 餘額閘：≥ 0 → status=ready_for_label，< 0 → held_reason='insufficient_balance'
- 寫 outbound_action_logs + notification

**測試**：

- outbound 不屬於當前 client → 4xx
- status≠held 或 held_reason≠'awaiting_client_input' → 4xx
- shipment_type≠single → 4xx
- 缺必填 → 4xx

### AC-7.6 餘額閘 + held 解綁

**Given** outbound OUT-X status=held + held_reason='insufficient_balance'，客戶儲值申請被 admin 核准
**When** walletService.onTopupApproved 觸發
**Then**

- 檢查 client.balance ≥ 0
- 找該 client 所有 status=held + held_reason='insufficient_balance' outbound
- atomic 改成 status=ready_for_label + held_reason=null
- 寫 outbound_action_logs action=held_released
- 寫 notification type=outbound_held_released

**測試**：

- 儲值後 balance 仍 < 0 → 不解綁
- 同時有多個 held outbound → 全部解
- held_reason='phase7_not_ready' → **不解綁**（migration script 才負責）
- held_reason='awaiting_client_input' → **不解綁**（要客戶補完才解）
- adjustment hook 同邏輯（admin 手動調整餘額）

### AC-7.7 Outbound 取消（v1.2 加嚴）

**Given** outbound OUT-X status=ready_for_label，客戶想取消
**When** POST `/api/cms/outbound/:id/cancel` body { cancel_reason: '客戶反悔' }
**Then**

- atomic 驗證 status ∈ ['ready_for_label', 'held', 'pending_client_label']
- status: → cancelled，cancelled_at = now，cancel_reason snapshot
- outbound_inbound_links unlinked_at = now（all active links）
- inbound_requests.active_outbound_id $unset
- 為每個 inbound 寫 inbound_scans type=outbound_unlinked
- 寫 outbound_action_logs + notification
- inbound 仍 status=received，可再次 link 別的 outbound

**測試（v1.2 加嚴）**：

- status=picking / packed / weighing / weight_verified → 4xx `OUTBOUND_NOT_CANCELLABLE`
- **status=label_obtaining → 4xx `OUTBOUND_NOT_CANCELLABLE`**（v1.2 對齊：自動取 label 優先）
- status=label_obtained / label_printed / departed → 4xx
- status=cancelled（重複取消）→ 4xx
- inbound 退回後可重新建合併單
- **admin 可走 admin-force-cancel endpoint 強制取消 picking 後 outbound**（Phase 8 §1.11.3）

### AC-7.8 客戶取 label（v1.2 通用版，所有路線都走此 endpoint）

> v1.2 改造（Phase 8 對齊）：原本只給 confirm_before_label 模式用，v1.2 起變成所有路線通用。auto 模式失敗降級時客戶也走此 endpoint 手動處理。

**Given** outbound OUT-X status=pending_client_label
**When** 客戶進 `/zh-hk/outbound/[id]/confirm-label` 看實重 / 重新試算 / 點 [取得 Label]
**When** POST `/api/cms/outbound/:id/confirm-label`
**Then**

- atomic 驗證 status=pending_client_label + client_id 一致（**v1.2 不再驗 processing_preference='confirm_before_label'**）
- status: → label_obtaining（中間態防 double click）
- 呼叫 labelService.getLabel（Phase 8 範圍實作）
- 成功 → status=label_obtained + label_obtained_by='client' + label_pdf_path / tracking_no_carrier / actual_label_fee
- 失敗 → status 退回 pending_client_label + last_label_error + label_retry_count++
- 寫 outbound_action_logs + notification

**測試**：

- status≠pending_client_label → 4xx
- processing_preference='auto' → 4xx（auto 模式只能 WMS 員工取）
- carrier API failure → status 退回，可 retry
- 連續點兩次（race）→ 第二次 4xx（status=label_obtaining 已不滿足條件）

### AC-7.9 處理偏好 default

**Given** 客戶在 `/zh-hk/settings/preferences` 設 outbound_processing_preference='confirm_before_label'
**When** PUT `/api/cms/clients/me/preferences` body { outbound_processing_preference: 'confirm_before_label' }
**Then**

- clients.preferences.outbound_processing_preference = 'confirm_before_label'
- 後續客戶建 outbound 表單 default 顯示 'confirm_before_label'
- 客戶仍可每次 override 此次選擇

**測試**：

- enum 不在範圍 → 4xx
- 客戶 override 不影響 default

### AC-7.10 Default Shipping Address

**Given** 客戶建單時勾「儲存為預設地址」
**When** POST `/api/cms/outbound` body 含 receiver_address + save_as_default=true
**Then**

- outbound.receiver_address snapshot
- clients.default_shipping_address 更新

**測試**：

- 客戶下次建單 default 帶入新 default_shipping_address
- save_as_default=false → 不寫 client 主檔

### AC-7.11 Mock Carrier（行為模擬版）

**Given** PHASE7_USE_MOCK_CARRIER=true（dev / staging default）
**When** 客戶選雲途 + 重 5kg + 收貨地 HK，POST `/api/cms/outbound/quote`
**Then**

- 走 MockCarrierRateAdapter
- 計算公式：base 15 + 5kg × 8 = 55，× carrier_multiplier 1.0 × HK 1.0 = 55
- 回 fee_amount=55、currency=HKD、service_type='Mock yun_express 標準線'、estimated_delivery_days=7
- raw_response 含 formula 字串 + carrier_config + country_multiplier
- 寫 rate_quote_logs.raw_response.mock=true
- adapter sleep 800-1200ms 模擬真 API 延遲

**Given** 同樣 input 但選 Fuuffy
**When** 試算
**Then**

- 計算公式：base 25 + 5kg × 12 = 85，× carrier_multiplier 1.2 × HK 1.0 = 102
- fee_amount=102（雲途比 Fuuffy 便宜，符合 carrier 區分）
- estimated_delivery_days=5

**Given** 收貨地改 US（+150% multiplier）
**When** 雲途試算 5kg
**Then**

- fee_amount = (15 + 8×5) × 1.0 × 2.5 = 137.5 → 138（round）

**測試**：

- env flag=false → 走真實 adapter（雲途 / Fuuffy）
- form 含 _mock_force_error=true → throw `MOCK_CARRIER_ERROR`，rate_quote_logs 仍寫一筆 status=failed
- env flag MOCK_FORCE_ALL_ERRORS=true → 所有試算都失敗
- 收貨地 country code 不在 COUNTRY_MULTIPLIERS → 走 default 1.8

### AC-7.11.1 Mock PDF 生成（Phase 8 接續用）

**Given** mock 階段 outbound 走「出貨前確認」模式 + 客戶點 [取得 Shipping Label]
**When** labelService.getLabel 觸發 mock adapter getLabel
**Then**

- 動態生成 PDF：A6 size、含 `[MOCK] YUN_EXPRESS` 標題、tracking_no `MOCK-YUN_EXPRESS-{timestamp}`、收貨地址、重量
- PDF 路徑：`/uploads/labels/{outbound_id}/mock_label_{outbound_id}_{timestamp}.pdf`
- outbound.label_pdf_path 寫入此路徑
- outbound.tracking_no_carrier 寫 mock tracking
- adapter sleep 2-3 秒模擬真 API

**測試**：

- PDF 內容含 `[MOCK]` 標記 + 紅字警告（避免誤認真 label）
- mock_force_error=true → throw error，PDF 不生成
- prod 切換時，labelService 改走真實 carrier label API（adapter 內部分流）

### AC-7.11.2 Mock 階段資料隔離

**Given** dev / staging 跑出來的 carrier_account.credentials 走 Phase 2 mock token（前綴 mock_*）
**When** prod 切真實 API（PHASE2_USE_MOCK_OAUTH=false + PHASE7_USE_MOCK_CARRIER=false）
**Then**

- 系統運行時偵測到 token 前綴 mock_* → 拒絕呼叫真實 carrier API
- 客戶 OMS 看到「您的 carrier 授權失效，請重新綁定」
- admin 後台清庫 client_carrier_accounts 後客戶重新綁

**測試**：

- mock token + 真實 API call → 4xx `INVALID_MOCK_TOKEN_IN_PROD`
- prod 切換流程文件化（README）

### AC-7.12 Outbound 列表 + Tab

**Given** 客戶有 outbound 多筆，狀態各異
**When** 客戶開 `/zh-hk/outbound/list?tab=processing`
**Then**

- 顯示 status 在 ['ready_for_label', 'held', 'picking', 'packed', 'pending_client_label', 'label_obtaining', 'label_obtained', 'palletized'] 的 outbound
- tab 計數準確：全部 / 處理中 / 已出貨（status=departed）/ 已取消

**測試**：

- 客戶 status=held 的 outbound 有特殊 badge 提示
- pending_client_label 的 outbound 有 [前往確認] 按鈕

### AC-7.13 Migration Script

**Given** Phase 5 既存 outbound 多筆，status=held + held_reason='phase7_not_ready'
**When** Phase 7 上線跑 migration script
**Then**

- single + 缺 carrier_code → held_reason='awaiting_client_input'
- 其他 → 走餘額閘決定 status / held_reason
- 寫 outbound_action_logs（action='migrated_from_phase7_pending'，雖然不在主流 enum，但走 audit）

**測試**：

- migration 跑兩次 idempotent（不重複改 status）
- 客戶看自己 outbound 列表反映 migration 結果

### AC-7.14 Cross-service Sync

**Given** OMS 建 outbound 成功
**When** 同步推 WMS
**Then**

- WMS 端 outbound_requests mirror（含 inbound_ids 列表）
- WMS admin 看 outbound 列表（read-only）能看到此筆
- sync 失敗 → OMS 寫 sync_failed_logs，業務不 rollback

**測試**：

- 取消 outbound 同樣推 sync
- WMS 端 schema 跟 OMS 一致

### AC-7.15 Outbound 取消後重新建合併單

**Given** OUT-X 取消，含 inbound A / B 已解 link
**When** 客戶建 OUT-Y 含 inbound A / B
**Then**

- inbound A / B 從 received 重新被 link
- outbound_inbound_links：A 兩筆 record（OUT-X unlinked + OUT-Y linked）
- inbound_scans：A 兩筆（outbound_unlinked from OUT-X + outbound_linked to OUT-Y）
- 完整 audit trail

**測試**：

- 重複取消 / 重建 N 次 → links / scans 累積但不衝突
- inbound 主檔 active_outbound_id 永遠指最新 active outbound

### AC-7.16 Rate Quote Cache Race

**Given** 客戶 14:00 試算 rate=HK$50（cache 寫入）
**When** 客戶 14:03 提交建單，client-side 帶 cached rate
**Then**

- server 重新查 cache hit → 回同 rate
- outbound.rate_quote_at_create 寫此 rate snapshot
- 不重新打 carrier API

**測試**：

- 14:06 提交（cache 過期）→ server 重新打 carrier
- carrier 此時回不同 rate → outbound.rate_quote_at_create 走最新 rate（不 fail）
- 客戶端可重新試算看新 rate

---

## 7. 風險點 + 已知 gotcha

### 7.1 carrier API 慢 / 失敗

雲途 / Fuuffy API 在客戶 dev / prod 環境可能不穩定。

**處理**：

- adapter 層加 timeout（v1 設 30 秒）
- 失敗 throw 給上層 service
- frontend 顯示明確錯誤
- 不做 circuit breaker（v1 業務量小，失敗 retry 即可）
- rate_quote_logs 記錄所有 carrier API call 包括失敗

### 7.2 carrier credentials 過期 / token expired

Phase 2 OAuth token 有 expiry。Phase 7 試算時 token 已過期：

**處理**：

- 試算 / 取 label 前先 refresh token（Phase 2 credential service 既有邏輯）
- token refresh 失敗 → outbound.held_reason='carrier_auth_failed'（新增）
- 通知客戶「您的 carrier 授權已失效，請重新綁定」
- 客戶重新綁 → walletService 風格的 hook 解綁 held outbound

### 7.3 capacity_rules 配置缺失

carriers.capacity_rules 為 null：

**處理**：

- v1 預設無限制（passed）
- 上線前確認雲途 + Fuuffy 都有 capacity_rules（admin 直接 mongo update）
- 後台 UI 留後 phase

### 7.4 receive 後 inbound 物理消失（員工誤操作 / 客戶廢棄）

scenario：客戶選 inbound A 建 outbound，但同時 admin 後台把 inbound A status 改成 abandoned（Phase 5 admin-adjust）。

**處理**：

- 客戶提交建 outbound 時 atomic check inbound.status='received' → 4xx
- 已建立的 outbound 內含 abandoned inbound → admin 後台 audit + 手動處理
- v1 不做自動偵測（業務上罕見）

### 7.5 客戶端建單表單複雜 / 半填離開丟失

合併建單頁欄位多：inbound 多選 / carrier / 地址 / preference / 試算 / 確認。

**處理**：

- v1 不做 form draft 持久化
- 客戶離開 → 提示「未送出資料將丟失」
- 表單 state 純前端 react state
- Phase 7 範圍內不做進階 UX（draft / autosave）

### 7.6 試算 vs 實際 fee 差異揭露

scenario：建單時 rate=HK$50，Phase 8 WMS 取 label 時 carrier 實際 HK$58。

**處理**：

- Phase 7 不擋（純資訊揭露，業務模型「不涉及財務」）
- Phase 8 取 label 後 outbound.actual_label_fee 寫入
- notification type='outbound_label_obtained' payload 含 actual_fee 跟 quoted_fee 差異
- 客戶看詳情頁可比對

### 7.7 出貨前確認模式長期不點

客戶設 confirm_before_label 後 outbound pack 完了不點 → 倉位卡住。

**處理**：

- Phase 7 不做 reminder 自動觸發（Phase 8 WMS pack 完成時的 hook 才觸發 notification）
- v1 業務量小，CS 看 outbound 列表手動跟進
- v1 不做 expiry 自動 escalate（留後 phase）

### 7.8 Phase 5 既存 outbound migration

PHASE7_OUTBOUND_ENABLED env flag 設 true 後跑 migration。但 migration 跑期間有新 single inbound receive：

**處理**：

- migration script idempotent（重跑不衝突）
- env flag 切換時間點 = migration 跑完時間點
- 切換後新 single receive 會直接走 Phase 7 邏輯（Phase 5 §5.7 fail-soft 走另一條 branch）

### 7.9 outbound_inbound_links 多筆 active 風險

理論上一個 inbound 同時只能 active link 一筆 outbound，但 race 可能同時建兩個 outbound 都含同 inbound：

**處理**：

- mongo unique index `{ inbound_id: 1, unlinked_at: 1 }` 部分索引（unlinked_at=null 才 unique）
- 並發提交一個成功一個 4xx
- 客戶看到錯誤訊息：「inbound A 已被建立另一筆出庫單」

### 7.10 client_id 安全

合併建單時客戶可能試圖傳別人 inbound_id：

**處理**：

- server 從 JWT 取 client_id
- 查詢 inbound 時加 client_id filter
- 不通過則 4xx（同 Phase 4 §AC-4.1 邏輯）

### 7.11 default_shipping_address 改了影響舊 outbound？

scenario：客戶 5/8 建 OUT-X 用 default_shipping_address A → 5/9 客戶改 default_shipping_address 為 B → 5/10 OUT-X 還沒出貨。

**處理**：

- outbound.receiver_address 是 **snapshot** at 建立時刻
- 改 default 不影響舊 outbound
- 想改 outbound 收貨地址 → 客戶取消重建（v1 不開 outbound 編輯地址功能）

### 7.12 rate quote 失敗時客戶仍想建單

scenario：carrier rate quote API down，客戶試算多次失敗。

**處理**：

- v1 必須試算成功才能建單（rate_quote_at_create 必填）
- carrier API down → 客戶等
- carrier.supports_rate_quote=false（不支援試算的 carrier）→ 建單表單顯示「此 carrier 不支援試算，運費由 carrier 取 label 時計算」+ 仍可建單
- v1 兩個 carrier 都支援試算（雲途 + Fuuffy），不會碰到此 case

### 7.13 single 模式補資訊頁的 race

scenario：客戶開補資訊頁同時 admin 後台修改該 outbound（罕見）。

**處理**：

- mongo atomic findOneAndUpdate
- 失敗 4xx + UI 顯示「資料已變動，請重整」
- v1 不做 optimistic concurrency control（updated_at version check）

### 7.14 carrier capacity 規則邊緣 case

scenario：總重剛好等於 max（30 kg）。

**處理**：

- 規則用 `<=`（含等號）
- 邊界 case 過 capacity check
- 雲途 / Fuuffy 真實 API 可能對邊界 case 不同處理 → carrier API 試算階段會發現

### 7.15 Mock 階段資料污染 prod

scenario：dev / staging 跑出來的 outbound / rate_quote_logs / carrier_account 在 prod 環境出現。

**處理**：

- 各 collection 加欄位 `is_mock_data: boolean`（Phase 7 schema 預備但 v1 不啟用）
- prod 上線前 admin 後台跑 cleanup script：清 mock 資料
- Phase 2 mock token 前綴 `mock_*` → prod 運行時偵測拒絕
- README 標示「dev / staging 資料庫不能 dump 到 prod」

### 7.16 Mock 階段業主 demo / UAT 風險

scenario：業主用 dev 環境 demo 給投資人 / 客戶 → 看到 `[MOCK]` 字樣覺得不專業。

**處理**：

- staging 環境提供 `MOCK_HIDE_LABEL_WATERMARK=true` env flag（PDF 不顯 [MOCK] 字樣，但 PDF metadata 仍標記）
- demo 結束後 staging 資料 cleanup（避免「真資料 + mock label PDF」混雜）
- UAT 階段業主驗收 → 走「prod-like」環境（mock all true，但 UI / data 看起來像真）
- prod 上線當天才切 mock all false

### 7.17 Mock 失敗模擬不夠真實

scenario：mock 失敗只 throw 通用 error，但真 carrier API 失敗類型多（429 rate limit / 500 server error / 401 auth / 422 validation）→ dev 階段沒測到對應 retry / UI。

**處理**：

- mock adapter 支援 `mock_force_error_type` 參數（rate_limit / server_error / auth_failed / validation）
- 各類型 error 對應特定 HTTP status + error message
- frontend 對應錯誤類型有不同 UI（429 顯示「請稍後重試」、401 顯示「重新授權」）
- v1 範圍內 mock 4 種 error type 涵蓋常見 case，prod 真實後加更多

### 7.18 Mock PDF 累積佔空間

scenario：dev 階段 mock label PDF 堆積在 `/uploads/labels/`，每個 ~10KB，幾個月跑下來 > GB。

**處理**：

- v1 不做 cron 清理（dev 業務量小）
- README 標示「dev 階段建議定期清 /uploads/labels/」
- prod 切換時 cleanup script 清舊 mock PDF
- 未來 phase 加 `is_mock_data` flag + cron cleanup

### 7.19 v1.2 自動取 label 跟客戶取消 race（Phase 8 對齊）

業主對齊（Phase 8 Q3）：自動取 label 優先，做到 label_obtaining 步驟客戶不能取消，必須 admin 介入。

scenario：
```
T0  outbound 複重通過 status=weight_verified + processing_preference=auto
T1a 系統 atomic findOneAndUpdate(status: 'weight_verified' → 'label_obtaining')
T1b 客戶同時點 [取消]：filter status ∈ ['ready_for_label', 'held', 'pending_client_label']
```

**處理**：

- T1b 的 cancellable status 列表**不含** weight_verified / label_obtaining → 此 race 場景客戶取消本來就會 4xx
- T1a 跑成功 → status=label_obtaining → 客戶看 UI 已不顯示取消按鈕（v1.2 加嚴）
- 真正 race window 在 weight_verified ms 級時間（複重通過後到系統 trigger 之間，約 0-100ms） → 業務上罕見
- 萬一 race 後客戶仍堅持取消 → admin 後台 admin-force-cancel endpoint 處理（Phase 8 §1.11.3）

### 7.20 v1.2 capacity 違規降級流程（Phase 8 對齊）

scenario：客戶建單時試算過 capacity OK（基於 inbound 預估重量 / 尺寸），但 Phase 8 員工 pack 後實際 box dimensions 超 carrier 上限。

**處理**：

- 複重通過後系統 server-side 重驗 capacity（基於實際 box dimensions）
- 違規 → 推 OMS 帶 `capacity_violations` array + 純警告（不擋 status 流轉）
- auto 模式：trigger label 時 carrier API 真實打 → 若 carrier 拒 → throw → 降級 status=pending_client_label + held_reason='capacity_violation'
- confirm_before_label 模式：客戶看 UI 顯示違規詳情 + 「請聯絡 CS」提示 + 仍可強制點 [取得 Shipping Label]
- 強制取 → carrier 真實拒 → 走 carrier_api_failed 流程
- v1 不做自動拆箱 / 換 carrier（罕見場景，admin 後台處理）

---

## 8. 開發順序建議（Phase 7 內部分階段）

| Sub-step | 內容 | 對應 AC |
|---|---|---|
| **7.1** | schema：outbound_requests + outbound_inbound_links + outbound_action_logs + rate_quote_logs + clients.preferences + carriers.capacity_rules + inbound_scans type 擴充 | 全部 schema 部分 |
| **7.2** | carrier rate / label service abstract layer + Mock + Yun Express adapter（試算）+ Fuuffy adapter（試算）+ env flag PHASE7_USE_MOCK_CARRIER | AC-7.4, 7.11 |
| **7.3** | OMS 合併建單流程：inbound list API + capacity check 雙驗 + rate quote API + 建單 API + UI | AC-7.1, 7.2, 7.3, 7.4 |
| **7.4** | 餘額閘 + walletService topup_approved hook 解綁 held outbound | AC-7.6 |
| **7.5** | Outbound 列表 / 詳情 / 取消（OMS） | AC-7.7, 7.12, 7.15 |
| **7.6** | Single 模式補資訊頁 + migration script（PHASE7_OUTBOUND_ENABLED）| AC-7.5, 7.13 |
| **7.7** | 出貨前確認模式取 label 客戶端流程（labelService stub，Phase 8 補完整實作）| AC-7.8 |
| **7.8** | 處理偏好 settings + default_shipping_address CRUD | AC-7.9, 7.10 |
| **7.9** | Cross-service sync + WMS read-only 列表 | AC-7.14 |
| **7.10** | 並發測試 + capacity / cache / race 邊緣 case | AC-7.16, 7.9 風險 |

每完成一步跑對應 AC 測試 + capacity / rate quote 邊緣 case 驗證。

**Sub-step 細節**：

### 7.1 schema 地基

- 建 outbound_requests collection + indexes
- 建 outbound_inbound_links + unique index `{ inbound_id, unlinked_at }`
- 建 outbound_action_logs + rate_quote_logs
- inbound_requests 加 active_outbound_id 欄位
- clients.preferences 子物件擴充
- carriers 加 capacity_rules + supports_rate_quote / supports_label_api
- inbound_scans type enum 加 outbound_linked / outbound_unlinked
- migration script 範本（Phase 5 phase7_not_ready）
- README 加 seed：carriers.capacity_rules 雲途 + Fuuffy 配置

### 7.2 carrier service 抽象層 + Mock（dev / staging 範圍）

- `interface CarrierRateAdapter` + types（含 metadata.mock_force_error 欄位）
- **MockCarrierRateAdapter（行為模擬版）**：
  - getQuote 走 CARRIER_MULTIPLIERS + COUNTRY_MULTIPLIERS（雲途比 Fuuffy 便宜，國家不同價差大）
  - sleep 800-1200ms 模擬 carrier API delay
  - 失敗模擬：`MOCK_FORCE_ALL_ERRORS` env / 個別 outbound `metadata.mock_force_error_type`（rate_limit / server_error / auth_failed / validation 4 種 error type）
  - getLabel 動態生成 PDF（pdfService 共用 component）
- YunExpressRateAdapter + FuuffyRateAdapter（rate quote 部分，prod 切換才用）
- carrierRateServiceFactory + env flag handling（PHASE7_USE_MOCK_CARRIER）
- pdfService.generateMockLabel（共用 component，A6 size，含 `[MOCK]` 警告）
- redis cache 5 分鐘
- rate_quote_logs audit（含 raw_response.mock=true 標記）
- 單元測試：mock 涵蓋 4 種 error type + 4 個 carrier multiplier 組合
- mock token prod 偵測 logic（前綴 mock_* 拒絕真實 carrier API call）

### 7.3 合併建單

- GET `/api/cms/inbound/available-for-outbound`
- POST `/api/cms/outbound/quote`
- POST `/api/cms/outbound`
- frontend `/zh-hk/outbound/new` 完整 UI（multi-select inbound + capacity 即時驗 + carrier dropdown + 地址 + preference + 試算 button + 提交）
- mongo session transaction 包整段建單流程

### 7.4 餘額閘

- walletService.onTopupApproved hook（Phase 3 既有 service 加 hook 點）
- walletService.onAdjustment hook
- atomic update held outbound logic
- notification + action_logs

### 7.5 Outbound CRUD

- GET `/api/cms/outbound` + filter + pagination
- GET `/api/cms/outbound/:id`
- POST `/api/cms/outbound/:id/cancel`
- frontend `/zh-hk/outbound/list` + `[id]` 詳情頁
- inbound 取消後 link 解綁邏輯

### 7.6 Single 補資訊

- migration script `migrate-phase7-held-outbounds.ts`
- PATCH `/api/cms/outbound/:id/complete-single`
- frontend `[id]/edit` 頁
- env flag PHASE7_OUTBOUND_ENABLED 切換

### 7.7 出貨前確認

- POST `/api/cms/outbound/:id/confirm-label`
- frontend `[id]/confirm-label` 頁（顯示實重 vs 試算 + 重新試算）
- labelService stub（Phase 8 補完整實作，Phase 7 端先測 status 流轉）
- retry 邏輯

### 7.8 Settings + Default Address

- GET / PUT `/api/cms/clients/me/preferences`
- GET / PUT `/api/cms/clients/me/default-address`
- frontend `/zh-hk/settings/preferences`

### 7.9 Sync + WMS read-only

- POST `/api/wms/sync/outbound-*` 三個 endpoints
- WMS frontend `/zh-hk/operations/outbound-list` + `[id]`（read-only）

### 7.10 並發 + 邊緣 case

- 並發建 outbound 含同 inbound
- rate quote cache hit / miss
- migration idempotent
- capacity boundary case
- 跑全部 AC

---

## 9. 變更紀錄

| 版本 | 日期 | 說明 |
|---|---|---|
| v1.0 | 2026-05-08 | Phase 7 首次定稿。業務決策：(B) 設計 WMS 取 label / 處理偏好 checkbox（auto default + confirm_before_label）/ rate quote 真實 carrier API（cache 5 分鐘）/ capacity 雙驗（client + server）/ 餘額閘 walletService topup_approved hook 解綁 / outbound 取消後 inbound 退 received 不退費 / single 補資訊獨立頁 / migration phase7_not_ready outbound / carrier rate / label service adapter pattern + Mock for dev / outbound_inbound_links append-only 中介表 / Phase 8 接手取 label + 倉內動作 |
| v1.1 | 2026-05-10 | v1 dev / staging 全 mock 策略強化。Mock 行為模擬版（不再純粹 stub）：rate quote 走 CARRIER_MULTIPLIERS + COUNTRY_MULTIPLIERS 算假價（雲途 / Fuuffy 看得出價差、國家不同價差大）/ getLabel 走 pdfService.generateMockLabel 動態生成 A6 size PDF 含 `[MOCK]` 警告 / mock 失敗模擬支援 4 種 error type（rate_limit / server_error / auth_failed / validation）/ mock 階段資料隔離（mock_* token 前綴 prod 拒絕、is_mock_data flag schema 預備）/ 加 §0.4.1 v1 Mock 策略總覽（4 個 env flag 跨 Phase 2/7/8/9）/ §1.7.4-1.7.7 Mock Adapter / PDF Service / 失敗測試入口 / Adapter Factory / AC-7.11 改寫 + AC-7.11.1 Mock PDF + AC-7.11.2 資料隔離 / §7.15-7.18 加 mock vs prod 切換 gotcha（資料污染 / demo / 失敗模擬 / PDF 累積）/ Sub-step 7.2 改寫反映新範圍。**切真實 API 時機**：所有 phase 完成 + 業主驗收 + 上 prod 前一次切。 |
| v1.2 | 2026-05-10 | Phase 8 對齊重大改造：**取 label 主導權回歸客戶**（從 WMS 員工取改為客戶取 / 系統替客戶取）。processing_preference enum 語意更新：auto = 系統複重後 0 秒自動 trigger（失敗降級 pending_client_label）/ confirm_before_label = 客戶手動點。取消條件加嚴：status=label_obtaining 後不可取消（必 admin force-cancel）。§1.4 加 v1.2 語意更新表 + single 強制 auto 註解。§1.6.1 取消條件表加嚴 + label_obtaining 行。§1.9 標題改「客戶取 label 流程（所有路線通用）」+ 觸發點擴展。§2.1 held_reason enum 擴充 3 個（carrier_auth_failed / capacity_violation / carrier_api_failed）。§2.4 clients 加 single 強制 auto 註解。AC-7.7 加 v1.2 status 加嚴測試。AC-7.8 通用化（不只 confirm_before_label，所有路線都走此 endpoint）。§7.19 加 v1.2 取消 race 風險點。§7.20 加 capacity 違規降級流程。**重要**：UI framing 在 confirm-label 頁依 processing_preference + held_reason 動態顯示（auto 失敗 vs confirm 正常流程），詳見 Phase 8 §1.5.5。 |
