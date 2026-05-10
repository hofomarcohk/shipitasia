# Phase 3：客戶錢包儲值（OMS）

> 集運 OMS+WMS v1 開發規格
> 版本：v1.0
> 日期：2026-05-08
> 範圍：客戶錢包系統（餘額 + 流水）+ 客戶儲值申請 + WMS admin 核准 / 調整 / 退費 schema 預備
> 前置：Phase 1（cryptoService、Resend）已完成；Phase 2（carrier 綁定）平行開發或已完成

---

## 0. 前設

### 0.1 v1 業務參數（全局）

**這份參數適用於整個 v1 開發，後續所有 phase 都 reference 此節**：

| 項目 | v1 設定 | 備註 |
|---|---|---|
| 幣別 | **HKD**（港元）| 全局單一幣別。schema 預留 `currency` 欄位但只用 HKD |
| 處理費單價 | **HKD$5 / 包** | 寫 `.env`：`HANDLING_FEE_PER_PACKAGE=5`，後台可改 |
| 入庫地 | **日本** | Phase 4 預報、Phase 5 PDA 簽入用 |
| 收貨地 | **香港** | Phase 7 出庫派送地址 default |
| 客戶面 | 香港為主 | UI 文案 zh-HK 為主，繁中 zh-TW 次要 |
| 金流商 | **不接**（純線下手動）| schema 留 `gateway / gateway_ref` 欄位但 v1 都填 `manual` / null |

### 0.2 業務量假設

v1 上線半年內 ≤ 50 客戶。儲值頻率假設每客戶每月 1-2 次 → 全系統 ≤ 100 筆 / 月儲值。設計不需考慮：
- 即時 dashboard
- 自動 cron / 排程
- 高併發優化
- 批次入帳 UI

### 0.3 範圍

**包含**：
- 客戶 OMS「我的錢包」頁（餘額 + 流水）
- 客戶 OMS 儲值申請流程（填金額 + 上傳匯款證明）
- WMS 後台 admin 核准 / 駁回儲值
- WMS 後台 admin 手動調整餘額（補償 / 修正錯誤）
- `wallet_transactions` 流水表（append-only）
- `topup_requests` 儲值申請表
- `walletService` 統一進出口（charge / topup / refund / adjustment）
- 退費功能的 schema + service（v1 客戶端不主動觸發；Phase 6 / 8 內部觸發）

**不包含**：
- 簽入時自動扣處理費（Phase 5 觸發 `walletService.charge_inbound()`）
- 出庫餘額閘 / held 狀態（Phase 7）
- 細粒度權限（admin / finance 角色分離 — Phase 4 員工管理一次處理）
- 對外金流商接入（v1 不接）

### 0.4 技術棧

沿用 ShipItAsia 既有 + Phase 1 已建：

- **檔案儲存**：本機檔案系統 `/uploads/topup-proofs/{client_id}/{topup_id}_{timestamp}.{ext}`
- Next.js static serve 透過 `/api/files/topup-proofs/...` route（含 auth 驗證，不能直接公開）
- **Email**：Phase 1 Resend，用於儲值核准 / 駁回通知

### 0.5 UI 設計風格

完全沿用 ShipItAsia 既有 layout / 元件 / 色系 / 字體。新增頁面參照既有頁面對映（見 §3.1）。

---

## 1. 業務流程

### 1.1 客戶看餘額 + 流水

#### 1.1.1 進入「我的錢包」

- 路徑：`/zh-hk/wallet`（**新頁**）
- Sidebar 新增「我的錢包」入口（Tabler icon: `IconWallet`）
- 頁面分為三區：
  - **餘額卡片**（最上方大字顯示）：
    - 數字：`HKD$ {balance}`
    - 顏色：balance ≥ 0 用既有主色；< 0 **紅字 + 警告 icon**（Tabler `IconAlertTriangle`）
    - 副文字：負餘額時顯示「您的帳戶處於負值，請儘快儲值以免影響出貨」
  - **動作按鈕**：「申請儲值」（主按鈕）
  - **流水列表**（下方）：
    - 預設顯示最近 30 天，可選日期區間
    - 欄位：時間 / 類型 / 金額 / 異動後餘額 / 備註 / 對應單號
    - 類型 badge：topup（綠）/ charge_inbound（紅）/ refund_*（藍）/ adjustment（灰）

#### 1.1.2 流水欄位顯示規則

| Type | UI 顯示 | 金額顯示 |
|---|---|---|
| topup | 「儲值入帳」 | `+5,000` 綠色 |
| topup_rejected | 「儲值申請被駁回」（badge 灰）| `-`（不影響餘額）|
| charge_inbound | 「簽入扣費」+ inbound 單號 | `-5` 紅色 |
| refund_unclaimed | 「退費 - 無頭件」+ unclaimed 單號 | `+5` 綠色 |
| refund_label_failed | 「退費 - 出貨取消」+ outbound 單號 | `+x` 綠色 |
| adjustment | 「人工調整」+ 備註 | `±x` 依正負色 |

**客戶看不到的東西**：
- ❌ 哪個 admin 操作的（`operator_staff_id`）
- ❌ Internal note 欄位（admin 內部備註）
- ❌ 匯款證明圖片以外的客戶 metadata

### 1.2 客戶申請儲值

#### 1.2.1 流程

1. 客戶在 `/zh-hk/wallet` 點「申請儲值」
2. 跳出 modal `TopupRequestModal`，欄位：
   - 儲值金額（HKD，必填，整數，最低 HKD$100）
   - 匯款日期（必填，date picker）
   - 匯款帳號末 4 碼（選填，文字）
   - 匯款證明圖片（必填，支援 jpg / png / pdf，單檔 ≤ 5MB）
   - 備註（選填，textarea，≤ 200 字）
3. 提交：
   - server 驗證：金額 ≥ 100、檔案副檔名與大小、必填欄位
   - 檔案存 `/uploads/topup-proofs/{client_id}/{topup_id}_{timestamp}.{ext}`
   - 寫 `topup_requests`，status = `pending`
   - 回 `{ success: true, topup_id, message: "申請已提交，請等待客服確認" }`
4. **客戶不會看到 balance 變化**（待確認儲值不顯示在 balance 內）
5. 客戶可在 `/zh-hk/wallet/topup-requests` 看到自己所有儲值申請列表（狀態 `pending` / `approved` / `rejected`）

#### 1.2.2 客戶看到的儲值申請列表

- 路徑：`/zh-hk/wallet/topup-requests`（**新頁**）
- 欄位：申請時間 / 金額 / 狀態 / 完成時間 / 駁回原因（若 rejected）
- 動作：點某筆看詳情（含自己上傳的證明預覽）
- **不能取消**（v1 簡化；客戶想撤回 → 找客服）

### 1.3 WMS admin 核准 / 駁回儲值

#### 1.3.1 待處理儲值列表

- 路徑：`/zh-hk/topup-requests`（**WMS 新頁**）
- Sidebar 新增「儲值審核」入口
- 預設 filter：`status=pending`，最舊在最上（先進先處理）
- 欄位：申請時間 / 客戶 / 金額 / 匯款日期 / 證明 / 動作
- 動作：核准 / 駁回 / 看詳情

#### 1.3.2 核准流程

1. admin 在列表點「核准」按鈕，或進詳情頁點「核准入帳」
2. 跳確認對話框：「確認入帳 HKD$5,000 到客戶 [name] 的錢包？」
3. 確認 → 呼叫 `POST /api/wms/topup-requests/:id/approve`
4. server 邏輯：
   - 驗證 status=pending（並發保護：用 mongo `findOneAndUpdate({ _id, status: 'pending' }, ...)`）
   - 呼叫 `walletService.topup({ client_id, amount, gateway: 'manual', gateway_ref: null, operator_staff_id, note, reference_type: 'topup', reference_id: topup_request_id })`
   - walletService 內部：
     - 寫一筆 `wallet_transactions`（type=topup, amount=+5000）
     - 更新 `clients.balance` += 5000（mongo `$inc`，原子操作）
     - return `{ wallet_transaction_id, balance_after }`
   - 更新 `topup_requests.status` = `approved`、`approved_at`、`approved_by_staff_id`、`wallet_transaction_id`
   - 觸發通知（email）：「您的儲值申請 HKD$5,000 已入帳，當前餘額 HKD$xxx」
5. 客戶 OMS 立即可看到 balance 增加

#### 1.3.3 駁回流程

1. admin 在列表點「駁回」按鈕
2. 跳對話框，**必填**駁回原因（textarea，例：「找不到對應匯款」「金額不符」）
3. 呼叫 `POST /api/wms/topup-requests/:id/reject` body `{ reject_reason }`
4. server 邏輯：
   - 驗證 status=pending
   - 寫一筆 `wallet_transactions`（type=`topup_rejected`, amount=0, reference_id=topup_request_id, note=reject_reason）— **金額 0，僅留紀錄**
   - 更新 `topup_requests.status` = `rejected`、`rejected_at`、`rejected_by_staff_id`、`reject_reason`
   - 觸發通知（email）：「您的儲值申請 HKD$5,000 已被駁回，原因：xxx」
5. 客戶 OMS 看到狀態變 rejected

### 1.4 WMS admin 手動調整餘額

#### 1.4.1 用途

涵蓋以下情境：
- 客戶投訴補償
- CS 操作錯誤後修正
- 年度結餘調整
- 儲值優惠贈送（行銷活動）

#### 1.4.2 流程

1. admin 進 `/zh-hk/clients/[id]`（Phase 1 既有頁）→ 「錢包」tab → 點「手動調整餘額」
2. 跳 modal `AdjustmentModal`，欄位：
   - 調整金額（必填，可正可負，例：+200 或 -50）
   - 理由（必填，textarea，**會顯示給客戶看**作為流水備註）
   - Internal note（選填，僅 admin 內部看，不給客戶看）
3. 提交：
   - 呼叫 `walletService.adjustment({ client_id, amount, operator_staff_id, customer_note, internal_note })`
   - walletService 內部：寫 `wallet_transactions`（type=adjustment）+ 更新 balance
4. 客戶 OMS 看到流水多一筆「人工調整」+ 你填的理由

### 1.5 退費流程設計（schema + service 預備）

**v1 客戶不能主動觸發退費**。退費由系統內部呼叫，觸發點：

- **Phase 6 觸發**：無頭件已扣費後客戶拒認 → `walletService.refund_unclaimed({ client_id, amount, reference_id: unclaimed_id, ... })`
- **Phase 8 觸發**：label 取得失敗 + 客戶取消出庫 → `walletService.refund_label_failed({ ... })`

**Phase 3 範圍**：把 `walletService.refund_*()` 函式建好，但不接到任何 UI。Phase 6 / 8 直接呼叫。

退費邏輯：
- 寫 `wallet_transactions`（type=refund_unclaimed / refund_label_failed）amount 為正數
- balance += amount
- reference_type / reference_id 指向原扣費單

---

## 2. Schema 變更

### 2.1 `wallet_transactions`（**新增** OMS `vw_sms.wallet_transactions`）

**append-only**，不允許 update / delete。錯了寫 reversal（再寫一筆抵銷）。

| 欄位 | 型別 | 說明 |
|---|---|---|
| `_id` | string | transaction ID |
| `client_id` | string | FK to clients._id |
| `type` | enum | `topup` / `topup_rejected` / `charge_inbound` / `refund_unclaimed` / `refund_label_failed` / `adjustment` |
| `amount` | number | 正數=入帳，負數=扣款；`topup_rejected` 永遠是 0 |
| `currency` | string | 預設 `HKD`（v1 全部 HKD）|
| `balance_before` | number | 異動前餘額（snapshot，方便對帳）|
| `balance_after` | number | 異動後餘額（snapshot）|
| `reference_type` | enum? | `topup_request` / `inbound` / `unclaimed` / `outbound` / `manual` |
| `reference_id` | string? | 對應業務單 ID |
| `gateway` | string | `manual`（v1 全部 manual；未來電子支付擴充用）|
| `gateway_ref` | string? | 金流商交易 ID（v1 都 null）|
| `operator_staff_id` | string? | 若為人工操作（topup approve / adjustment / 駁回），記哪個 admin 操作；客戶端觸發（將來自助）為 null |
| `customer_note` | string? | 顯示給客戶看的備註 |
| `internal_note` | string? | 僅 admin 看的內部備註 |
| `metadata` | object? | 自由 JSON，未來擴充用（fuuffy B1 借鏡）|
| `createdAt` | date | 異動時間，**不允許修改** |

**Indexes**：
- `client_id + createdAt desc`（客戶看流水的查詢路徑）
- `type + createdAt desc`（admin 報表 / 對帳）
- `reference_type + reference_id`（從業務單反查流水）

**禁止**：`updatedAt` 欄位（append-only 概念）；任何 update 操作。

### 2.2 `topup_requests`（**新增** OMS `vw_sms.topup_requests`）

| 欄位 | 型別 | 說明 |
|---|---|---|
| `_id` | string | T + 時戳，可顯示給客戶 |
| `client_id` | string | FK |
| `amount` | number | HKD |
| `currency` | string | 預設 `HKD` |
| `transfer_date` | date | 客戶填的匯款日期 |
| `transfer_account_last4` | string? | 客戶填的匯款帳號末 4 碼（選填）|
| `proof_file_path` | string | 匯款證明檔案路徑（相對路徑，存 `/uploads/topup-proofs/...`）|
| `proof_file_size` | number | bytes |
| `proof_file_mime` | string | image/jpeg / image/png / application/pdf |
| `customer_note` | string? | 客戶填的備註 |
| `status` | enum | `pending` / `approved` / `rejected` |
| `submitted_at` | date | 提交時間 |
| `approved_at` | date? | |
| `approved_by_staff_id` | string? | |
| `rejected_at` | date? | |
| `rejected_by_staff_id` | string? | |
| `reject_reason` | string? | 駁回原因（給客戶看）|
| `wallet_transaction_id` | string? | 核准後對應的 wallet_transaction（reference 用）|
| `createdAt / updatedAt` | date | 稽核 |

**Indexes**：
- `client_id + status + submitted_at desc`
- `status + submitted_at asc`（admin 處理列表，pending 先進先出）

### 2.3 `clients.balance`（Phase 1 已預留，Phase 3 啟用）

- 預設 0
- 可為負（業務決策 G）
- **本身是 cache**，由 `wallet_transactions` 累加得出
- **禁止任何地方直接 update**（除了 walletService 內部的 `$inc` 操作）

#### 2.3.1 重建機制（rebuild）

提供一個 admin script `/scripts/rebuild-balance.ts`：

- 對每個 client，從 `wallet_transactions` 全部累加 sum(amount)
- 跟 `clients.balance` 比對
- 不一致 → log warning + 修正 `clients.balance`

**v1 用途**：上線前測試 / 出 bug 後對帳。不做自動定時 rebuild（沒必要）。

### 2.4 `walletService` 統一進出口設計

**位置**：OMS `src/services/wallet/`

```typescript
// walletService.ts 介面（給 Claude Code 參考）

interface ChargeInput {
  client_id: string;
  amount: number;  // 正數，service 內部會轉負
  reference_type: 'inbound' | 'unclaimed' | 'outbound';
  reference_id: string;
  customer_note?: string;
  internal_note?: string;
  metadata?: Record<string, any>;
}

interface TopupInput {
  client_id: string;
  amount: number;  // 正數
  reference_type: 'topup_request' | 'manual';
  reference_id?: string;
  gateway: string;  // v1 都是 'manual'
  gateway_ref?: string;
  operator_staff_id?: string;
  customer_note?: string;
  internal_note?: string;
}

interface RefundInput {
  client_id: string;
  amount: number;  // 正數
  type: 'refund_unclaimed' | 'refund_label_failed';
  reference_type: 'unclaimed' | 'outbound';
  reference_id: string;
  operator_staff_id?: string;
  customer_note?: string;
  internal_note?: string;
}

interface AdjustmentInput {
  client_id: string;
  amount: number;  // 可正可負
  operator_staff_id: string;  // 必填，因為一定是人工
  customer_note: string;  // 必填，給客戶看
  internal_note?: string;
}

interface TransactionResult {
  transaction_id: string;
  balance_before: number;
  balance_after: number;
}

// 公開 API
class WalletService {
  async charge(input: ChargeInput): Promise<TransactionResult>;
  async topup(input: TopupInput): Promise<TransactionResult>;
  async refund(input: RefundInput): Promise<TransactionResult>;
  async adjustment(input: AdjustmentInput): Promise<TransactionResult>;

  async getBalance(clientId: string): Promise<number>;
  async getTransactions(clientId: string, options: { from?, to?, type?, limit?, offset? }): Promise<Transaction[]>;
}
```

#### 2.4.1 內部執行邏輯（所有方法共用）

每次異動的 atomic 操作：

1. 用 mongo session 開 transaction（保證 wallet_transactions 寫入 + balance 更新原子）
2. 取當前 balance（`findOne`）
3. 計算 balance_before / balance_after
4. 寫 `wallet_transactions` 一筆
5. 更新 `clients.balance`（用 `$inc` 確保並發安全）
6. commit transaction
7. 失敗 → rollback、throw error

#### 2.4.2 強制使用 walletService（防呆）

ShipItAsia 既有 mongoose schema 加 pre-save hook（在 `Client` model 上）：

```typescript
ClientSchema.pre('save', function(next) {
  if (this.isModified('balance') && !this.$locals.viaWalletService) {
    return next(new Error('FORBIDDEN: balance can only be modified via walletService'));
  }
  next();
});
```

`walletService` 內部更新 balance 時呼叫 `client.$locals.viaWalletService = true` 後再 save。其他地方任何嘗試直接改 balance 都會被擋。

---

## 3. 頁面 / API 清單

### 3.1 OMS 新增頁面

| 路徑 | 對映 ShipItAsia 既有頁 |
|---|---|
| `/zh-hk/wallet` | 仿既有 detail / dashboard 卡片 layout |
| `/zh-hk/wallet/topup-requests` | 仿既有 list 頁 |
| `/zh-hk/wallet/topup-requests/[id]` | 仿既有 detail 頁 |

**Sidebar 改造**：
- 新增「我的錢包」項目（Tabler `IconWallet`），位置在 Phase 1「個人資料」之上
- **既有「Bills」項目隱藏**（不刪頁面，只從 sidebar 拿掉，因為棄用但 schema 還在）

### 3.2 OMS 新增 API endpoints

```
GET    /api/cms/wallet/balance             取自己的餘額
GET    /api/cms/wallet/transactions        取流水（支援 from/to/type/limit/offset）
POST   /api/cms/wallet/topup-requests      申請儲值（multipart/form-data 含檔案）
GET    /api/cms/wallet/topup-requests      自己的申請列表
GET    /api/cms/wallet/topup-requests/:id  自己的申請詳情

# 檔案下載（auth 限制：只有自己 + admin 能看自己的證明）
GET    /api/files/topup-proofs/:topupId    下載匯款證明（驗 JWT 內 client_id 對應 + admin 全可看）
```

### 3.3 WMS 新增頁面

| 路徑 | 用途 |
|---|---|
| `/zh-hk/topup-requests` | 儲值審核列表（admin only） |
| `/zh-hk/topup-requests/[id]` | 儲值申請詳情 + 核准 / 駁回 |
| `/zh-hk/clients/[id]` | Phase 1 既有，新增「錢包」tab |

### 3.4 WMS 新增 API endpoints

```
GET    /api/wms/topup-requests             儲值申請列表（filter by status / 客戶 / 日期）
GET    /api/wms/topup-requests/:id         詳情
POST   /api/wms/topup-requests/:id/approve 核准
POST   /api/wms/topup-requests/:id/reject  駁回 body { reject_reason }

GET    /api/wms/clients/:clientId/balance        admin 看某客戶餘額
GET    /api/wms/clients/:clientId/transactions   admin 看某客戶流水（含 internal_note）
POST   /api/wms/clients/:clientId/adjustment     admin 手動調整餘額
```

---

## 4. ShipItAsia 既有現況對映

| 既有 | 處理 |
|---|---|
| `clients.balance` 欄位 | **啟用**（Phase 1 已預留，Phase 3 開始寫入）|
| 既有 `bills` collection / 模組 | **棄用**：不刪 schema（避免破壞依賴），但 sidebar 移除入口、不再寫入。新業務全走 `wallet_transactions` |
| 既有 `bill/list` 頁面（Bug 12 已修） | **保留檔案不動**，sidebar 移除連結 |
| Phase 1 cryptoService | **不用於 Phase 3**（錢包資料非敏感等級加密；單純存 number 即可。客戶身份識別走 JWT） |

---

## 5. Fuuffy 借鏡

### 5.1 借鏡 B1（log_item_action 結構化動作日誌 ⭐⭐⭐⭐⭐）

`wallet_transactions` schema 直接套用 fuuffy B1 的設計哲學：

| 機制 | wallet_transactions 對映 |
|---|---|
| enum 欄位（可篩選查詢）| `type` |
| JSON metadata 欄位（自由擴充）| `metadata` |
| append-only（不允許 update）| schema 無 `updatedAt`、service 不提供 update 方法 |
| 操作者紀錄 | `operator_staff_id` |
| 時間戳 | `createdAt` 不可修改 |

### 5.2 死守 A4（沒 wallet → 每張單獨立付款）

**Phase 3 是 ShipItAsia 對 fuuffy 第一個產品 leverage 的核心實作**。Claude Code 落地時若有任何「簡化成每筆出庫獨立付款」的提案，**拒絕**。

具體禁止：
- ❌ outbound_request 直接綁 payment_id（不透過 wallet）
- ❌ 多錢包 / 多 balance 欄位（v1 嚴守單一 balance）
- ❌ 任何 service 直接 update `clients.balance`（防呆 hook 已擋，但禁止繞過）

### 5.3 避坑 A2（silent stub return success）

退費 service（`refund_unclaimed` / `refund_label_failed`）在 Phase 3 完成 schema + walletService 函式，但**呼叫端**（Phase 6 / 8）尚未實作。

開發階段若 Phase 6 / 8 還沒做完，**不要**為了讓流程跑通寫假退費。Phase 3 結束時，refund 函式會被測試呼叫驗證可工作，但業務流程上無人會觸發它（直到 Phase 6 / 8）。

### 5.4 避坑 A6（萬能 remarks 欄位）

`wallet_transactions` 故意把備註拆成兩個欄位：
- `customer_note`（客戶看的）
- `internal_note`（admin 看的）

**禁止**未來合併成一個 `remarks` 欄位再用 enum 區分（A6 反例：fuuffy 萬能 remarks 不能查詢）。

---

## 6. v1 業務參數定義（給 Claude Code 寫入 .env / config）

```
# .env 範例（v1 全局）
DEFAULT_CURRENCY=HKD
HANDLING_FEE_PER_PACKAGE=5
DEFAULT_INBOUND_COUNTRY=JP
DEFAULT_OUTBOUND_COUNTRY=HK
WALLET_MIN_TOPUP=100
WALLET_MAX_NEGATIVE_BALANCE=-99999  # 不限制下限，但 schema 上有理論值（可改）

# 上傳限制
TOPUP_PROOF_MAX_SIZE_MB=5
TOPUP_PROOF_ALLOWED_EXTENSIONS=jpg,jpeg,png,pdf

# 檔案儲存路徑（v1 本機）
UPLOADS_BASE_PATH=/Volumes/External/.../shipitasia_uploads
```

**處理費單價（HKD$5）使用點**：
- Phase 5 PDA arrive 時呼叫 `walletService.charge()` 帶 `amount = parseInt(process.env.HANDLING_FEE_PER_PACKAGE)`
- 後台改：直接改 `.env` + 重啟服務（v1 簡化；不做後台 UI 改設定，避免複雜化）

---

## 7. Acceptance Criteria（給 Claude Code）

### AC-3.1 客戶看餘額

**Given** 客戶已登入 OMS，clients.balance = 1500
**When** GET `/api/cms/wallet/balance`
**Then**
- 回應 `{ balance: 1500, currency: "HKD" }`
- 不包含 internal_note 之類欄位

**測試**：未登入 → 401

### AC-3.2 客戶看流水

**Given** 客戶有 5 筆 wallet_transactions
**When** GET `/api/cms/wallet/transactions?limit=20`
**Then**
- 回應陣列，按 createdAt desc 排序
- 每筆只含：`_id / type / amount / balance_after / customer_note / reference_type / reference_id / createdAt`
- **不**含：`operator_staff_id / internal_note / metadata`

**測試**：
- 試圖查別的客戶流水 → 403 / 404
- type filter 正確過濾

### AC-3.3 客戶申請儲值

**Given** 客戶已登入
**When** POST `/api/cms/wallet/topup-requests` 帶 multipart/form-data:
- `amount=5000`
- `transfer_date=2026-05-08`
- `transfer_account_last4=1234`
- `proof_file=<image>`
- `customer_note=匯款 from HSBC`
**Then**
- server 驗證金額 ≥ 100、檔案 ≤ 5MB、副檔名合法
- 檔案存 `/uploads/topup-proofs/{client_id}/{topup_id}_{timestamp}.{ext}`
- topup_requests 寫一筆 status=pending
- 回 `{ success: true, topup_id }`
- **不更新 clients.balance**（要等 admin 核准）

**測試**：
- 金額 < 100 → 4xx `AMOUNT_TOO_LOW`
- 檔案 > 5MB → 4xx `FILE_TOO_LARGE`
- 副檔名不合法 → 4xx `FILE_TYPE_NOT_ALLOWED`
- 缺必填 → 4xx
- 客戶查 balance → 仍為原值（沒提早入帳）

### AC-3.4 客戶看自己的儲值申請列表

**Given** 客戶有 3 筆 topup_requests（pending / approved / rejected 各 1）
**When** GET `/api/cms/wallet/topup-requests`
**Then**
- 回應 3 筆
- 每筆含 status / amount / submitted_at / approved_at? / rejected_at? / reject_reason?
- **不**含 internal_note 等內部欄位

### AC-3.5 客戶下載自己的匯款證明

**Given** 客戶 A 上傳了證明
**When** 客戶 A 訪問 `/api/files/topup-proofs/{topupId}`
**Then** 200 + 檔案內容

**測試**：
- 客戶 B 訪問 A 的 → 403
- admin 訪問任何客戶的 → 200
- 未登入 → 401

### AC-3.6 admin 核准儲值

**Given** topup_requests 一筆 pending，金額 5000，客戶 balance=100
**When** admin POST `/api/wms/topup-requests/:id/approve`
**Then**
- topup_requests.status = approved
- topup_requests.approved_at / approved_by_staff_id 更新
- wallet_transactions 寫一筆 type=topup, amount=+5000, balance_before=100, balance_after=5100, gateway=manual, reference_type=topup_request, reference_id=topup_id
- clients.balance 更新為 5100
- topup_requests.wallet_transaction_id 寫入對應 transaction id
- Resend 寄一封 email 給客戶

**測試（並發保護）**：
- 同一筆 pending 兩個 admin 同時點 approve → 只有一個成功，另一個 4xx `TOPUP_ALREADY_PROCESSED`
- approve 已 approved 的 → 4xx
- approve 已 rejected 的 → 4xx
- email 寄送失敗 → topup 仍成功，error 記 log（不 rollback；客戶可從 OMS 看到入帳）

### AC-3.7 admin 駁回儲值

**Given** topup_requests pending，金額 5000
**When** admin POST `/api/wms/topup-requests/:id/reject` body `{ reject_reason: "找不到對應匯款" }`
**Then**
- topup_requests.status = rejected、rejected_at / rejected_by_staff_id / reject_reason 更新
- wallet_transactions 寫一筆 type=topup_rejected, amount=0, customer_note="找不到對應匯款"
- clients.balance **不變**
- 寄 email 通知客戶

**測試**：
- 缺 reject_reason → 4xx
- 已處理過 → 4xx

### AC-3.8 admin 手動調整餘額

**Given** 客戶 balance = 200
**When** admin POST `/api/wms/clients/:clientId/adjustment` body:
```json
{ "amount": -50, "customer_note": "上次計費錯誤修正", "internal_note": "案號 #123" }
```
**Then**
- wallet_transactions 寫 type=adjustment, amount=-50, balance_before=200, balance_after=150, customer_note=...,internal_note=...
- clients.balance = 150

**測試**：
- amount=0 → 4xx `INVALID_ADJUSTMENT_AMOUNT`
- 缺 customer_note → 4xx
- 非 admin → 403

### AC-3.9 walletService 強制統一進出口

**Given** 任意非 walletService 的程式碼
**When** 嘗試 `client.balance = 999; await client.save()`
**Then**
- pre-save hook throw error `FORBIDDEN: balance can only be modified via walletService`
- DB 不變

### AC-3.10 退費 service 函式（Phase 6 / 8 預備）

**Given** 客戶 balance = 100，曾因 inbound 被扣 5
**When** 內部呼叫 `walletService.refund({ client_id, amount: 5, type: 'refund_unclaimed', reference_type: 'unclaimed', reference_id: 'U123', operator_staff_id, customer_note: '無頭件拒認退費' })`
**Then**
- wallet_transactions 寫一筆 type=refund_unclaimed, amount=+5, balance_after=105
- clients.balance = 105

**測試**：
- amount 為負或 0 → 4xx
- type 不是 refund_* → 4xx
- 此 service v1 沒有 UI 觸發；用 unit test 驗

### AC-3.11 並發安全（high-priority）

**Given** 客戶 balance = 100
**When** 同時觸發 5 個 charge 各 -10（5 個並行 request）
**Then**
- 5 筆 wallet_transactions 都成功寫入
- 最終 balance = 50（不會是 60 或 90 之類錯亂值）
- 5 筆 transactions 的 balance_before / balance_after 形成連續鏈（用 mongo transaction + `$inc` 保證）

**測試**：
- 用 promise.all 模擬 5 個並行 charge
- 驗證最終 balance + 每筆 balance_after 連續性

### AC-3.12 流水 rebuild 一致性

**Given** 客戶有任意筆 wallet_transactions
**When** 跑 `/scripts/rebuild-balance.ts`
**Then**
- 對該客戶 sum(amount) 應等於 clients.balance
- 不一致 → log warning + 修正 clients.balance

---

## 8. 風險點 + 已知 gotcha

### 8.1 並發 race condition

**問題**：兩個 request 同時對同一客戶扣費 / 入帳，可能造成 balance 計算錯亂。

**處理**：
- walletService 內部用 mongo transaction（v8 支援）
- balance 更新用 `$inc` 操作（原子）
- 高併發下 balance_before / balance_after 可能對同一客戶不連續（中間有別的 transaction），但 sum 會對

**v1 限制**：mongo transaction 需要 replica set。本機開發 brew services 預設是 standalone，**需要把 mongo 改成 replica set 模式**：
```bash
# 一次性設定
mongod --replSet rs0 --bind_ip localhost
mongo --eval "rs.initiate()"
```
Claude Code 落地時要在 README 加這個設定步驟。

### 8.2 檔案儲存路徑跨平台

`UPLOADS_BASE_PATH` 在 Mac 與 Linux 路徑分隔不同。

**處理**：用 Node `path.join()` 不要硬寫 `/`。檔案路徑存 DB 時存「相對路徑」（如 `topup-proofs/client123/abc.jpg`），讀取時拼 `UPLOADS_BASE_PATH`。

### 8.3 檔案 orphan（孤兒檔案）

客戶上傳證明但沒提交成功（網路斷等）→ 檔案留下但 DB 沒紀錄。

**處理**：
- 先寫 DB → 再寫檔案。失敗反向順序：先刪檔再 throw。
- v1 不做 cron 清孤兒檔案（量小無影響）

### 8.4 Resend 寄信失敗不影響業務

核准 / 駁回的 email 通知失敗時：

- **業務操作必須 commit**（topup_requests 狀態 + wallet_transactions）
- email error 寫 log，admin 可在 WMS 後台手動 resend（v1 不做 UI；admin 直接告訴客戶）

### 8.5 餘額顯示精度

HKD 一律整數（沒小數），但 schema 用 `number` 型別。

**處理**：
- 前端顯示用 `Intl.NumberFormat('zh-HK', { style: 'currency', currency: 'HKD' })`
- 後端 zod 驗證 `z.number().int()` 防止小數（v1 簡化）

### 8.6 balance 顯示在 OMS sidebar / header？

**v1 不做**。客戶要看 balance 必須進「我的錢包」頁。

理由：
- ShipItAsia sidebar 沒有預留位置給 balance 顯示，動 layout 太多
- 50 客戶量級客戶不會頻繁看 balance
- Phase 7 出庫單建立時，**該頁**會明顯顯示 balance（因為餘額閘檢查），客戶在那會看到

### 8.7 Phase 5 何時呼叫 walletService.charge()

Phase 3 把 service 建好但 v1 開發過程中 Phase 5 還沒做，**不要在 Phase 3 就接 Phase 5**。Phase 3 結束時 charge() 函式只被 unit test 呼叫，業務流程上沒人觸發（直到 Phase 5）。

### 8.8 多幣別未來擴充

v1 全 HKD。`wallet_transactions.currency` 欄位填 `HKD`。

未來擴充時要做：
- clients 加 `default_currency` 欄位
- 每幣別獨立 balance（多錢包 schema）
- 或者保持單一 balance + 自動匯率轉換

**Phase 3 不處理**，但 schema currency 欄位保留。

---

## 9. 開發順序建議

給 Claude Code 落地的子步驟：

1. **檢查 mongo replica set 設定**（README + 自動化 script）
2. **walletService 與 schema**（wallet_transactions、Client.balance pre-save hook）
3. **基礎 unit test**：charge / topup / refund / adjustment 各方向 + 並發
4. **OMS 我的錢包頁 + balance / transactions API**（先看，後申請）
5. **OMS 申請儲值流程**（含檔案上傳）
6. **檔案 serve API + auth**
7. **WMS 儲值審核列表 + 詳情頁**
8. **WMS 核准 / 駁回 API**（含 email 通知）
9. **WMS 客戶錢包 tab + 手動調整**
10. **`/scripts/rebuild-balance.ts`** 工具

每完成一步跑對應 acceptance criteria 測試。

---

## 10. 變更紀錄

| 版本 | 日期 | 說明 |
|---|---|---|
| v1.0 | 2026-05-08 | Phase 3 首次定稿，v1 業務參數：HKD / HK$5 per package / JP→HK / 純線下入帳 |
