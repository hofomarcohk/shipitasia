# Phase 2：客戶綁定 Carrier 帳號（OMS）

> 集運 OMS+WMS v1 開發規格
> 版本：v1.0
> 日期：2026-05-08
> 範圍：OMS 客戶綁定自己的 carrier 帳號 + WMS admin 維護 carrier 主檔
> 前置：Phase 1（客戶帳號管理、cryptoService）已完成

---

## 0. 前設

### 0.1 業務量假設

v1 上線半年內 ≤ 50 客戶。每客戶最多綁 5 個 carrier 帳號 → 全系統 ≤ 250 筆 carrier 帳號紀錄。設計不需考慮分頁、不需 cache、不需 batch UI。

### 0.2 v1 支援的 Carrier

**v1 上線時支援兩家**：

| Carrier | 授權模式 | API Doc | 測試環境 |
|---|---|---|---|
| **雲途（YunExpress）** | API key + ApiSecret（Base64 編碼後 HTTP Basic Auth）| https://（PDF 文件，需放 carrier_docs/）| `http://omsapi.uat.yunexpress.com`，PDF 有公開測試帳號 |
| **Fuuffy** | OAuth 2.0 | https://api-docs.fuuffy.com | sandbox 環境，需寄信 `support@fuuffy.com` 申請 |

### 0.3 範圍

**包含**：
- WMS admin 的 carrier 主檔 CRUD UI
- OMS 客戶端「物流帳號」管理頁
- `client_carrier_accounts` 子集合 + service
- credentials 加密儲存（用 Phase 1 cryptoService）
- carrier 動態欄位配置（不同 carrier 不同表單欄位）
- OAuth flow（v1 為 Fuuffy 設計，callback 接好但不一定真打通；等 Phase 5 真用 label 時驗證）

**不包含**：
- Carrier abstract layer 抽象層 service（橫向地基，9 phase 走完後一次性處理）
- 真的呼叫 carrier API 取 label / quote / tracking（Phase 5 / 7 / 8 / 9）
- 連線測試按鈕（v1 不做，等 Phase 5 真用 API 時自然驗證）

### 0.4 技術棧

沿用 ShipItAsia 既有 + Phase 1 cryptoService。新增：
- `simple-oauth2` library（處理 OAuth 2.0 flow 與 token refresh）
- env flag `PHASE2_USE_MOCK_OAUTH`：dev / staging 走 mock OAuth（跳過真實 Fuuffy authorize / token exchange），prod 走真實 OAuth。**v1 dev 階段一律 mock**，業主驗收通過要上 prod 才切真實（見 §1.4 Mock OAuth 流程）。

### 0.4.1 v1 Mock 策略總覽（涵蓋 Phase 2 / 7 / 8 / 9）

v1 dev / staging 階段 **所有外部 carrier API 都走 mock**，避免 dev 階段被 carrier sandbox 申請延遲卡住（Fuuffy OAuth）/ 雲途 sandbox 連線不穩。

| env flag | 控制範圍 | dev/staging | prod 上線 |
|---|---|---|---|
| `PHASE2_USE_MOCK_OAUTH` | Fuuffy OAuth flow | true | false |
| `PHASE7_USE_MOCK_CARRIER` | rate quote API call | true | false |
| `PHASE8_USE_MOCK_CARRIER` | get / cancel label API call | true | false |
| `PHASE9_USE_MOCK_WEBHOOK` | tracking webhook 接收 | true | false |

切換時機：所有 phase（1-9）開發 + dev test 完成 → 業主驗收通過 → 上 prod 前一次切（或分階段切，取決於 carrier credentials 取得進度）。

dev / staging 不需要任何真實 carrier credentials 即可跑完整流程。

### 0.5 UI 設計風格

完全沿用 ShipItAsia 既有 layout / 元件 / 色系 / 字體。新增頁面參照既有頁面對映（見 §3.1）。

---

## 1. 業務流程

### 1.1 系統開發方一次性工作（不在客戶 UI 流程內）

**這是你們團隊上線前要做的事，不是客戶要做的事**。spec 列出來確保 Claude Code 知道要建這些初始資料。

1. **註冊 Fuuffy developer account**：寄信 `support@fuuffy.com` 申請 sandbox OAuth client → 拿 `client_id` + `client_secret` → 設 callback URL：`http://localhost:3002/api/cms/carrier/oauth/callback`
2. **記錄雲途 sandbox 測試帳號**（PDF 已提供）：
   - 客戶編號：`ITC0893791`
   - ApiSecret：`axzc2utvPbfc9UbJDOh+7w==`
   - Base URL：`http://omsapi.uat.yunexpress.com`
3. **寫 carrier 主檔的 seed data**（首次啟動專案時自動建這兩筆）

### 1.2 客戶在 OMS 看到 / 做的事

#### 1.2.1 進入「物流帳號」頁

- 路徑：`/zh-hk/carrier-accounts`（**新頁**）
- Sidebar 新增「物流帳號」入口（Tabler icon: `IconTruck`）
- 頁面顯示：客戶已綁的 carrier 帳號列表
  - 欄位：暱稱 / Carrier 名稱 / 授權模式 / 狀態 / 上次使用 / 動作
  - 狀態：`active` / `expired` / `revoked`
  - 動作：編輯（暱稱）/ 停用 / 刪除（軟刪）/ 設為預設

#### 1.2.2 新增 carrier 帳號

1. 客戶點「新增物流帳號」按鈕
2. 出 modal：選 carrier（dropdown 顯示主檔內 active 的 carriers）
3. 選完 carrier → 依該 carrier 的 `auth_type` 渲染不同 UI：
   - **API key 模式**（雲途）：表單顯示該 carrier 的 `credentialFields` 配置欄位（雲途：客戶編號、ApiSecret、暱稱）
   - **OAuth 模式**（Fuuffy）：顯示「跳轉至 Fuuffy 授權」按鈕 + 暱稱欄位
4. 提交：
   - **API key**：server 加密儲存 → 跳回列表，新增成功
   - **OAuth**：跳轉至 Fuuffy `authorize` URL → 客戶授權 → callback 寫 token → 跳回列表

#### 1.2.3 編輯 carrier 帳號

- 只能改：暱稱、是否預設
- **不能改 credentials**（避免 UI 暴露既有 token）；要改 → 刪除後重綁

#### 1.2.4 停用 / 刪除

- **停用**：status 改 `revoked`，不能再用，但歷史出庫單仍可 reference
- **刪除（軟刪）**：`deleted_at` 設值，UI 隱藏；歷史出庫單仍可 reference 不會 broken
- **不做硬刪**：保留 audit trail

#### 1.2.5 設為預設 carrier 帳號

- 客戶可在列表勾選一個帳號為「預設」
- Phase 7（建出庫單）會用這個預設值
- 一客戶一個預設；切換時舊的取消預設

### 1.3 Admin 在 WMS 端做的事

#### 1.3.1 Carrier 主檔 CRUD

- 路徑：`/zh-hk/carriers`（**新頁**，admin only）
- 列表欄位：carrier_code / 中文名 / 英文名 / auth_type / status / 排序
- 動作：新增、編輯、停用 / 啟用、調整排序

新增 / 編輯時填的欄位（對映 §2.2 schema）：
- carrier_code（唯一，例：`yunexpress`、`fuuffy`）
- name_zh / name_en
- auth_type（enum: `api_key` / `oauth`）
- credential_fields（JSON 配置，定義動態表單欄位 — 見 §2.3）
- oauth_config（若 auth_type=oauth）
- base_url（API 主機）
- sandbox_url（sandbox API 主機，可選）
- logo_url（可選）
- sort_order

#### 1.3.2 Admin 看客戶 carrier 綁定

- 在 WMS `/zh-hk/clients/[id]` 詳情頁（Phase 1 建的）新增 tab「Carrier 帳號」
- 顯示該客戶綁的所有 carrier 帳號：
  - 暱稱 / Carrier 名稱 / 狀態 / 上次使用
  - **不顯示 credentials**（即使解密也不顯示，UI 完全不接觸敏感資料）
- 動作：
  - 寄「重新授權連結」給客戶（用於 OAuth token 過期、credentials 失效時）
  - **不能**：停用、刪除、編輯（這些是客戶自己的權限）

### 1.4 Mock OAuth 流程（dev / staging 用）

當 `PHASE2_USE_MOCK_OAUTH=true` 時，Fuuffy OAuth 路徑全程不打真實 API：

#### 1.4.1 Mock 流程

```
1. 客戶在 OMS 點「跳轉至 Fuuffy 授權」
   ↓
2. server 一樣產生 state token（流程跟 prod 一致）
   ↓
3. 但**不**redirect 去 Fuuffy authorize URL
   改 redirect 到內部 mock 授權頁：
   /api/cms/carrier/oauth/mock-authorize?state={token}
   ↓
4. Mock 授權頁顯示：
   ┌────────────────────────────────────┐
   │ [Mock] Fuuffy 授權頁                 │
   │                                      │
   │ ⚠️ 這是 dev 環境的假 OAuth 流程      │
   │                                      │
   │ Carrier: Fuuffy                      │
   │ Client App: ShipItAsia v1            │
   │ Scopes: shipment:read shipment:write │
   │                                      │
   │ [模擬授權成功] [模擬授權失敗]        │
   └────────────────────────────────────┘
   ↓
5. 客戶點「模擬授權成功」
   ↓
6. server 走跟 prod callback 一樣的 logic：
   - 驗 state token
   - **不**呼叫 Fuuffy token exchange
   - 寫入假 token：
     access_token = "mock_fuuffy_token_" + random hex 32
     refresh_token = "mock_fuuffy_refresh_" + random hex 32
     access_token_expires_at = now + 30 天
     refresh_token_expires_at = now + 365 天
   - 加密 → 寫 client_carrier_accounts 跟 prod 一樣
   ↓
7. redirect /zh-hk/carrier-accounts?success=1
```

#### 1.4.2 Mock 「模擬授權失敗」路徑

提供失敗測試 UX：
- 客戶選 [模擬授權失敗] → server 回 redirect /zh-hk/carrier-accounts?error=user_denied
- 客戶端顯示「您已取消授權」

這個確保 dev 階段能測「OAuth 失敗」的 UI flow。

#### 1.4.3 Mock token refresh

呼叫 carrier API 前（Phase 7+）若 access_token 已過期：

```typescript
async function refreshFuuffyToken(account) {
  if (process.env.PHASE2_USE_MOCK_OAUTH === 'true') {
    // 純粹更新 expires_at，不打真 API
    account.oauth_meta.access_token_expires_at = addDays(new Date(), 30);
    account.oauth_meta.last_refreshed_at = new Date();
    // access_token / refresh_token 字串不變（dev 不需要真新）
    await account.save();
    return;
  }
  
  // prod: 真打 Fuuffy token endpoint
  // ...
}
```

#### 1.4.4 切真實 OAuth 時機

業主驗收所有 phase 後，切換步驟：

1. 業主寄信 Fuuffy 拿到 sandbox client_id / client_secret
2. 設 `.env` 的 `FUUFFY_OAUTH_CLIENT_ID` / `FUUFFY_OAUTH_CLIENT_SECRET`
3. **mock 階段建立的客戶 client_carrier_accounts 全部失效**（mock token prod 環境用不了）
4. 客戶要重新走 OAuth flow 真實綁定一次
5. 設 `PHASE2_USE_MOCK_OAUTH=false`

mock 階段資料**不會**自動 migrate 到真實 OAuth。spec 上明確：dev / staging 跑的客戶綁定不算 prod 資料，prod 上線時必須清庫並要求客戶重新綁。

---

## 2. Schema 變更

### 2.1 `carriers`（**新增** WMS `vw_wms.carriers` + OMS `vw_sms.carriers`，雙服務同步）

| 欄位 | 型別 | 說明 |
|---|---|---|
| `_id` | string | carrier ID |
| `carrier_code` | string | 唯一索引，例：`yunexpress`、`fuuffy` |
| `name_zh` | string | 中文名（例：「雲途物流」）|
| `name_en` | string | 英文名（例：「YunExpress」）|
| `auth_type` | enum | `api_key` / `oauth` |
| `credential_fields` | array | 動態表單欄位配置（見 §2.3）|
| `oauth_config` | object? | OAuth 配置（auth_type=oauth 必填，見 §2.4）|
| `base_url` | string | API 主機（production）|
| `sandbox_url` | string? | sandbox 主機 |
| `logo_url` | string? | logo 圖片 URL |
| `status` | enum | `active` / `disabled` |
| `sort_order` | number | dropdown 排序 |
| `createdAt / updatedAt` | date | 稽核 |

**v1 seed data**（首次啟動建這兩筆）見 §6。

### 2.2 `client_carrier_accounts`（**新增** OMS `vw_sms.client_carrier_accounts`）

| 欄位 | 型別 | 說明 |
|---|---|---|
| `_id` | string | account ID |
| `client_id` | string | FK to clients._id |
| `carrier_code` | string | FK to carriers.carrier_code |
| `nickname` | string | 客戶自訂暱稱（如「我的雲途主帳號」）|
| `auth_type` | enum | `api_key` / `oauth`（冗餘欄位，方便查詢；同 carriers.auth_type）|
| `credentials_enc` | string | 加密儲存的 credentials（JSON.stringify 後加密）|
| `oauth_meta` | object? | OAuth metadata（access_token 過期時間、refresh_token 過期時間等，**非加密**部分）|
| `is_default` | boolean | 是否為該客戶的預設 |
| `status` | enum | `active` / `expired` / `revoked` |
| `last_used_at` | date? | 上次成功呼叫 carrier API 的時間（除錯用，Phase 5 後才會更新）|
| `deleted_at` | date? | 軟刪除標記，預設 null |
| `createdAt / updatedAt` | date | 稽核 |

**Indexes**：
- `client_id + carrier_code + nickname`（複合，同客戶同 carrier 不能同暱稱，防誤建）
- `client_id + is_default`（每客戶最多一個 default，靠 application logic 維護）

### 2.3 `carriers.credential_fields` 動態配置格式

每個 carrier 自訂該 carrier 需要哪些欄位 + 驗證規則。前端依此配置動態渲染表單。

```json
[
  {
    "key": "customer_code",
    "label_zh": "客戶編號",
    "label_en": "Customer Code",
    "type": "text",
    "required": true,
    "placeholder": "例：ITC0893791",
    "validation": { "pattern": "^[A-Z0-9]+$", "min_length": 5, "max_length": 50 },
    "is_secret": false
  },
  {
    "key": "api_secret",
    "label_zh": "API Secret",
    "label_en": "API Secret",
    "type": "password",
    "required": true,
    "placeholder": "向 carrier 申請取得",
    "validation": { "min_length": 10, "max_length": 200 },
    "is_secret": true
  }
]
```

**欄位定義**：
- `key`：儲存到 credentials 物件的 key
- `label_zh / label_en`：UI 顯示
- `type`：`text` / `password`（password 用 input type=password 隱藏輸入）
- `required`：是否必填
- `validation`：zod 規則（pattern / min_length / max_length）
- `is_secret`：標記是否為敏感資料（log 不可印出、UI 顯示時遮蔽如 `****`）

### 2.4 `carriers.oauth_config` 格式（auth_type=oauth 必填）

```json
{
  "client_id_env": "FUUFFY_OAUTH_CLIENT_ID",
  "client_secret_env": "FUUFFY_OAUTH_CLIENT_SECRET",
  "authorize_url": "https://api-docs.fuuffy.com/oauth/authorize",
  "token_url": "https://api-docs.fuuffy.com/oauth/token",
  "scope": ["shipment:read", "shipment:write", "tracking:read"],
  "redirect_path": "/api/cms/carrier/oauth/callback",
  "extra_params": {}
}
```

**設計原因**：`client_id` / `client_secret` 不直接存 DB，存 env var name；DB 只存「指向哪個 env var」。這樣換 secret 不用動 DB，且 secret 不會出現在 DB dump。

### 2.5 `client_carrier_accounts.credentials_enc` 解密後格式

**API key 模式（雲途範例）**：
```json
{
  "customer_code": "ITC0893791",
  "api_secret": "axzc2utvPbfc9UbJDOh+7w==",
  "use_sandbox": true
}
```

**OAuth 模式（Fuuffy 範例）**：
```json
{
  "access_token": "xxx",
  "refresh_token": "yyy",
  "token_type": "Bearer"
}
```

### 2.6 `client_carrier_accounts.oauth_meta` 格式（非加密）

```json
{
  "access_token_expires_at": "2026-05-09T10:30:00Z",
  "refresh_token_expires_at": "2026-08-08T10:30:00Z",
  "last_refreshed_at": "2026-05-08T10:30:00Z",
  "carrier_user_id": "fuuffy_user_xxx"
}
```

**設計原因**：過期時間需頻繁查詢（前端顯示「即將過期」warning、未來 cron 自動 refresh），不放加密 blob 內，避免每次都要解密。

---

## 3. 頁面 / API 清單

### 3.1 OMS 新增頁面

| 路徑 | 對映 ShipItAsia 既有頁 |
|---|---|
| `/zh-hk/carrier-accounts` | 仿 ShipItAsia 既有 list 頁 layout |
| `/zh-hk/carrier-accounts/new` | modal-style，仿既有 form modal |
| `/zh-hk/carrier-accounts/[id]/edit` | 仿既有 detail edit 頁 |

### 3.2 OMS 新增 API endpoints

```
GET    /api/cms/carriers                     列出可用 carrier 主檔（給 dropdown）
GET    /api/cms/carriers/:carrierCode/fields  取該 carrier 的 credential_fields 配置

GET    /api/cms/carrier-accounts             列出自己綁的帳號
POST   /api/cms/carrier-accounts             新增（API key 模式直接寫；OAuth 模式回 authorize URL）
GET    /api/cms/carrier-accounts/:id         單筆詳情（不含 credentials）
PATCH  /api/cms/carrier-accounts/:id         改暱稱、設預設
DELETE /api/cms/carrier-accounts/:id         軟刪（status=revoked + deleted_at）
POST   /api/cms/carrier-accounts/:id/disable 停用
POST   /api/cms/carrier-accounts/:id/enable  啟用

# OAuth flow
GET    /api/cms/carrier/oauth/authorize?carrier_code=fuuffy&nickname=xxx
                                             跳轉至 carrier authorize URL
GET    /api/cms/carrier/oauth/callback       OAuth callback
```

### 3.3 WMS 新增頁面 / API

| 路徑 | 用途 |
|---|---|
| `/zh-hk/carriers/list` | carrier 主檔 admin 列表 |
| `/zh-hk/carriers/new` | 新增 carrier |
| `/zh-hk/carriers/[id]/edit` | 編輯 carrier |
| `/zh-hk/clients/[id]` | Phase 1 既有，新增「Carrier 帳號」tab |

```
# carrier 主檔
GET    /api/wms/carriers
POST   /api/wms/carriers
GET    /api/wms/carriers/:id
PATCH  /api/wms/carriers/:id
PATCH  /api/wms/carriers/:id/status

# admin 看客戶 carrier
GET    /api/wms/clients/:clientId/carrier-accounts   admin 看某客戶綁的 carrier
POST   /api/wms/clients/:clientId/carrier-accounts/:accountId/send-reauth
                                                     寄重新授權連結給客戶
```

---

## 4. ShipItAsia 既有現況對映

| 既有 | 處理 |
|---|---|
| `logistic_parties` 主檔（兩服務都有）| **棄用**，被 `carriers` 取代。但 schema 不刪（避免破壞其他依賴），新模組不再寫入。Phase 6 收尾時統一處理。 |
| `logistic-service/route.ts` 的 hardcoded yunexpress switch | **不在 Phase 2 範圍**，等 Phase 5 carrier 抽象層時統一重構（Bug 8）|
| Bug 9（logistic_parties 沒 CRUD）| **不修**，因為新模組改用 `carriers` 主檔，舊 schema 棄用 |

---

## 5. Fuuffy 借鏡

Phase 2 沒有特別的 fuuffy schema 可抄（fuuffy 是集運業者，沒有「客戶綁 carrier」概念，它的 `tbl_courier` 只是 last-mile 主檔）。

**但有兩個原則性借鏡**：

### 5.1 借鏡 B4（client-id header 雙服務驗證）

雖然 Phase 2 不做 carrier 抽象層，但 carrier 主檔同步雙服務（OMS + WMS）時，可預先建立 sync header 機制：

- WMS 改 carrier 主檔 → 同步呼叫 OMS API
- 雙方都帶 `X-Internal-Sync: <signature>` header（用 env shared secret 簽名）
- 防止 OMS / WMS 之間的內部 API 被外部誤打

**v1 簡化**：因為跑本地，可暫不做簽名（用 env 設定的 internal token 驗證即可）。

### 5.2 避坑 A1（嚴禁 hardcoded if/else carrier）

**整個 Phase 2 程式碼禁止以下 pattern**：

```typescript
// ❌ 禁止
if (carrier_code === 'yunexpress') { /* ... */ }
else if (carrier_code === 'fuuffy') { /* ... */ }

// ✅ 正確：用主檔配置驅動
const carrier = await getCarrierByCode(carrier_code);
const fields = carrier.credential_fields;  // 從 DB 取
```

理由：未來加第三家 carrier 時，只需 DB 加一筆 carriers 紀錄 + 加一個 adapter file，不用改 service 主檔。Phase 5 的 carrier 抽象層會接續這個原則。

### 5.3 避坑 A2（silent stub return success）

OAuth callback 在 Fuuffy sandbox 還沒接通前，**不要**寫成假的 return success。寫成：

```typescript
throw new Error("FUUFFY_OAUTH_NOT_CONFIGURED: 請先設定 .env 的 FUUFFY_OAUTH_CLIENT_ID");
```

讓開發階段直接看到問題。

---

## 6. v1 Seed Data（carriers 主檔初始資料）

**首次啟動專案時自動建這兩筆**（建議寫在 `/scripts/seed-carriers.ts`）：

### 6.1 雲途（YunExpress）

```json
{
  "carrier_code": "yunexpress",
  "name_zh": "雲途物流",
  "name_en": "YunExpress",
  "auth_type": "api_key",
  "credential_fields": [
    {
      "key": "customer_code",
      "label_zh": "客戶編號",
      "label_en": "Customer Code",
      "type": "text",
      "required": true,
      "placeholder": "例：ITC0893791",
      "validation": { "pattern": "^[A-Z0-9]+$", "min_length": 5, "max_length": 50 },
      "is_secret": false
    },
    {
      "key": "api_secret",
      "label_zh": "API Secret",
      "label_en": "API Secret",
      "type": "password",
      "required": true,
      "placeholder": "向雲途業務部申請取得",
      "validation": { "min_length": 10, "max_length": 200 },
      "is_secret": true
    },
    {
      "key": "use_sandbox",
      "label_zh": "使用測試環境",
      "label_en": "Use Sandbox",
      "type": "checkbox",
      "required": false,
      "is_secret": false
    }
  ],
  "oauth_config": null,
  "base_url": "http://oms.api.yunexpress.com",
  "sandbox_url": "http://omsapi.uat.yunexpress.com",
  "logo_url": null,
  "status": "active",
  "sort_order": 10
}
```

**雲途認證機制備忘**（給 Phase 5 用）：
- Token = `Base64(customer_code + "&" + api_secret)`
- HTTP header: `Authorization: Basic {Token}`（注意 Basic 與 token 之間有空格）

### 6.2 Fuuffy

```json
{
  "carrier_code": "fuuffy",
  "name_zh": "Fuuffy",
  "name_en": "Fuuffy",
  "auth_type": "oauth",
  "credential_fields": [],
  "oauth_config": {
    "client_id_env": "FUUFFY_OAUTH_CLIENT_ID",
    "client_secret_env": "FUUFFY_OAUTH_CLIENT_SECRET",
    "authorize_url": "https://api-docs.fuuffy.com/oauth/authorize",
    "token_url": "https://api-docs.fuuffy.com/oauth/token",
    "scope": ["shipment:read", "shipment:write", "tracking:read"],
    "redirect_path": "/api/cms/carrier/oauth/callback",
    "extra_params": {}
  },
  "base_url": "https://api.fuuffy.com",
  "sandbox_url": "https://sandbox.api.fuuffy.com",
  "logo_url": null,
  "status": "active",
  "sort_order": 20
}
```

**注意**：`authorize_url` / `token_url` / `base_url` / `sandbox_url` 是**佔位值**，等寄信申請拿到實際 endpoint 後 admin 在 WMS 後台更新。Claude Code 落地時若這些 URL 還沒拿到，可先填 placeholder + 留 TODO comment。

---

## 7. Acceptance Criteria（給 Claude Code）

### AC-2.1 WMS admin 維護 carrier 主檔

**Given** admin 已登入 WMS
**When** 進入 `/zh-hk/carriers/list` → 新增 → 填表 → 提交
**Then**
- 兩服務 `carriers` collection 都寫入新紀錄（雙寫，透過 cross-service sync）
- 必填驗證通過（carrier_code、name_zh、auth_type、credential_fields）
- carrier_code 唯一檢查通過
- 回應 `{ success: true, carrier: <created> }`

**測試**：
- 重複 carrier_code → 4xx `CARRIER_CODE_DUPLICATED`
- auth_type=oauth 但 oauth_config 空 → 4xx
- 非 admin 訪問 → 403

### AC-2.2 OMS 客戶看 carrier dropdown

**Given** 客戶已登入 OMS
**When** 進入新增 carrier 帳號頁
**Then**
- 呼叫 `GET /api/cms/carriers`
- 回應只含 `status=active` 的 carriers
- 結果按 `sort_order` 排序
- 每筆只回 `carrier_code / name_zh / name_en / auth_type / logo_url`，**不含 credential_fields / oauth_config**（後者敏感）

### AC-2.3 客戶綁 carrier - API key 模式

**Given** 客戶選了「雲途」
**When** 取 `GET /api/cms/carriers/yunexpress/fields` → 渲染表單 → 填入 customer_code + api_secret + 暱稱 → 提交
**Then**
- server 用 zod 驗證每個欄位（依 credential_fields 配置動態驗證）
- 用 cryptoService 加密 credentials（JSON.stringify 整個物件後加密）
- 寫 `client_carrier_accounts`：
  - `client_id` / `carrier_code=yunexpress` / `nickname` / `auth_type=api_key` / `credentials_enc` / `status=active` / `is_default` 依規則
  - 若客戶**第一個** carrier 帳號 → `is_default=true`，否則 false
- 回應 `{ success: true, account_id: xxx }`

**測試**：
- 缺必填欄位 → 4xx
- credentials 不通過 validation → 4xx
- 同 client + 同 carrier_code + 同 nickname 重複 → 4xx
- DB 內 credentials_enc 不可解開為明文（log / DB dump 都看不到原始值）

### AC-2.4 客戶綁 carrier - OAuth 模式

**Given** 客戶選了「Fuuffy」
**When** 點「跳轉至 Fuuffy 授權」按鈕

**Then 在 PHASE2_USE_MOCK_OAUTH=true 時（dev / staging）**：
- server 產生 state token，寫 Redis：`oauth:state:{token}` → `{ client_id, carrier_code, nickname }`，TTL 10 分鐘
- redirect 到 internal mock 授權頁 `/api/cms/carrier/oauth/mock-authorize?state={token}`
- 客戶在 mock 頁點 [模擬授權成功]
- server 不呼叫 Fuuffy token exchange，產生假 access_token / refresh_token（前綴 `mock_fuuffy_`）
- access_token_expires_at = now + 30 天
- 加密寫 client_carrier_accounts → status=active
- redirect `/zh-hk/carrier-accounts?success=1`

**Then 在 PHASE2_USE_MOCK_OAUTH=false 時（prod）**：
- server 產生 state token，寫 Redis（同上）
- redirect to `https://api-docs.fuuffy.com/oauth/authorize?client_id={env.FUUFFY_OAUTH_CLIENT_ID}&redirect_uri={callback}&scope=shipment:read+shipment:write+tracking:read&state={token}`

**Fuuffy callback 回來時（prod）**：
- 驗 state token（從 Redis 取，不存在 → 4xx）
- 用 code 換 access_token（呼叫 Fuuffy `token_url`）
- 加密 `{ access_token, refresh_token, token_type }` → 寫 credentials_enc
- 寫 oauth_meta：`{ access_token_expires_at, refresh_token_expires_at, last_refreshed_at }`
- 寫 client_carrier_accounts → status=active
- redirect to `/zh-hk/carrier-accounts?success=1`

**測試**：
- mock 模式 [模擬授權失敗] → redirect `/zh-hk/carrier-accounts?error=user_denied`，UI 顯示「您已取消授權」
- mock 產生的 access_token 字串前綴必須是 `mock_fuuffy_`（之後切 prod 時 audit 區分）
- state token 不對或過期 → 4xx（mock / prod 同）
- prod token exchange 失敗 → 顯示錯誤頁面
- 已存在同 client + carrier + nickname → 4xx（mock / prod 同）

### AC-2.5 列出自己的 carrier 帳號

**Given** 客戶已登入
**When** GET `/api/cms/carrier-accounts`
**Then**
- 回應只含該 client 的 accounts（過濾 client_id = JWT 內的 clientId）
- 排除 `deleted_at != null` 的紀錄
- **回應不含 credentials_enc 欄位**（即使是自己的也不送，安全原則）
- 包含：`_id / carrier_code / nickname / auth_type / status / is_default / last_used_at / createdAt`

### AC-2.6 編輯暱稱 / 設預設

**Given** 客戶已登入，已綁 2 個 carrier 帳號
**When** PATCH `/api/cms/carrier-accounts/:id` body `{ nickname, is_default: true }`
**Then**
- nickname 更新
- 若 is_default=true：該 client 的其他 accounts 全部 `is_default=false`，此筆設 true
- 不允許改 credentials / carrier_code / client_id（4xx）

### AC-2.7 停用 / 啟用 / 軟刪除

**Given** 客戶已綁 carrier 帳號
**When** 客戶在 OMS 點停用
**Then**
- status 改 `revoked`
- 該客戶其他 active 帳號不受影響
- 若被停用的是 default，且還有其他 active 帳號 → 自動轉移 default 到最早建立的 active 帳號

**軟刪除**（DELETE）：
- `deleted_at` 設值
- status 改 `revoked`
- UI 隱藏，但歷史出庫單仍可 reference

### AC-2.8 Admin 看客戶 carrier 帳號（不接觸 credentials）

**Given** admin 已登入 WMS
**When** GET `/api/wms/clients/:clientId/carrier-accounts`
**Then**
- 回應 client 所有 accounts（含已停用 / 已軟刪）
- **不含** credentials_enc（即使解密也不送）
- 包含 oauth_meta（admin 可看 token 過期時間）

### AC-2.9 Admin 寄重新授權連結

**Given** admin 看到客戶某 carrier 帳號 token 過期
**When** POST `/api/wms/clients/:clientId/carrier-accounts/:accountId/send-reauth`
**Then**
- 產一個 reauth token，寫 Redis：`carrier:reauth:{token}` → `{ client_id, account_id }`，TTL 24 小時
- 用 Phase 1 的 Resend 寄信給該客戶 → 信內含 reauth link
- 客戶點 link → 進 OMS → 跳 OAuth flow（API key 模式則跳到該帳號編輯頁讓客戶重填）

### AC-2.10 Cross-service carrier 主檔同步

**Given** admin 在 WMS 改 carrier 主檔
**When** WMS 寫入完成
**Then**
- WMS service 呼叫 OMS API：`POST /api/sync/carrier`，body 帶完整 carrier object
- 帶 header `X-Internal-Sync: {env.INTERNAL_SYNC_TOKEN}`
- OMS 驗 header → 寫入或更新自己的 carriers collection
- **失敗處理**：WMS 寫成功但 OMS 同步失敗 → 寫 `sync_failed_logs` collection，admin UI 顯示警告

---

## 8. 風險點 + 已知 gotcha

### 8.1 Fuuffy OAuth 申請延遲

寄信 `support@fuuffy.com` 申請 sandbox OAuth client，回信時間不確定（1-3 工作天）。

**v1 解法（重要設計變更）**：dev / staging 階段全程走 `PHASE2_USE_MOCK_OAUTH=true`（見 §1.4）。Fuuffy OAuth 申請延遲**不影響 dev 進度**，雲途 + Fuuffy 兩條路徑都可以全程開發 + 測試。業主驗收所有 phase 後再申請 sandbox 切真實 OAuth。

雲途路徑同樣有對應 mock 邏輯（API key 模式 dev 階段填假 key，Phase 7 / 8 carrier API call 走 mock adapter，見 Phase 7 §1.7）。

### 8.1.1 Mock 階段資料不能 migrate 到 prod

dev / staging 階段客戶綁的 mock token 在 prod 環境不能用：
- mock token 字串前綴 `mock_*`，prod 環境拒絕（運行時偵測）
- 切真實 OAuth 時 admin 後台清庫 client_carrier_accounts
- 客戶 prod 上線時必須重新走真實 OAuth flow 一次

spec 上明確：dev / staging 跑的客戶綁定不算 prod 資料。

### 8.2 OAuth callback URL 限制

Fuuffy 的 OAuth callback URL 不一定接受 `http://localhost:3002`。可能要：

- 用 ngrok 暴露 localhost 為 https URL
- 或申請 fuuffy 接受 localhost callback

**v1 簡化**：先試 localhost，不行就上 ngrok。spec 不指定具體做法。

### 8.3 Encryption Key 遺失風險

`process.env.ENCRYPTION_KEY` 一旦遺失 → 所有 credentials_enc 變磚（解不開、客戶要重綁）。

**v1 處理**：
- Key 寫 `.env` + 該檔加入 `.gitignore`
- README 標明：「上線前 production env 設定 ENCRYPTION_KEY，建議用 `openssl rand -base64 32` 產生 32-byte key」
- 換 key 流程：未來改 KMS 時一次性重新加密所有 credentials（cryptoService 內部 migrate function）

### 8.4 OAuth token 自動 refresh

v1 ≤ 50 客戶，**不做** cron 自動 refresh。

**處理**：呼叫 carrier API 前（Phase 5）先檢查 `oauth_meta.access_token_expires_at`，若 < 5 分鐘 → 同步 refresh 一次。Phase 2 不實作此邏輯，但 schema 預留 oauth_meta 欄位。

### 8.5 雲途 PDF 版本管理

雲途文件是 PDF，未來會更新（目前 v1.3.0，2024-11-06）。

**處理**：
- PDF 放 `carrier_docs/yuntu_api_v1.3.0_2024-11-06.pdf`（檔名帶版本）
- 重要修改通知雲途會主動寄信，每次拿到新版**重新給 Claude Code 讀**
- spec / code 內所有引用雲途 endpoint 的地方加 comment：`// per yuntu API v1.3.0`

### 8.6 carrier 主檔棄用 logistic_parties 但不刪

ShipItAsia 既有 `logistic_parties` 在 outbound_request 等表有 reference。Phase 2 引入新 `carriers` 主檔，**但不立刻刪 logistic_parties**，避免破壞既有資料。

**處理**：
- 新模組（Phase 2 之後）一律用 `carriers`
- 既有 outbound 等表保留 `logistic_party_id` 欄位（但業務邏輯不再 reference）
- Phase 6 收尾時做一次性 migration（把舊 logistic_party_id 對映到 carrier_code，然後棄用舊欄位）

### 8.7 同 client 同 carrier 多個帳號的 default 切換

每客戶**一個** carrier_code 內最多一個 `is_default=true`（不限制全局只能一個 default — Phase 7 出庫時客戶仍要選 carrier）。

**v1 修正**：每客戶**全局**一個 default（不分 carrier_code），對應 §1.2.5 的「設為預設 carrier 帳號」。Phase 7 出庫時自動帶這個 default，客戶可改。

---

## 9. 開發順序建議

給 Claude Code 落地的子步驟：

1. **建 `carriers` schema + service + sync 機制（雙寫）**
2. **WMS admin carrier 主檔 CRUD UI + API**
3. **Seed data 寫死兩筆（雲途 + Fuuffy）**
4. **OMS 看 carriers dropdown API + UI**
5. **`client_carrier_accounts` schema + service**
6. **OMS 新增 carrier 帳號 - API key 模式（先做雲途）**
7. **OMS 列表 / 編輯 / 停用 / 軟刪 / 設預設**
8. **OMS 新增 carrier 帳號 - OAuth 模式（Fuuffy，依 credentials 拿到狀況可能延後）**
9. **WMS admin 看客戶 carrier 帳號 + 寄 reauth link**

每完成一步，跑該步對應的 acceptance criteria 測試。

---

## 10. 變更紀錄

| 版本 | 日期 | 說明 |
|---|---|---|
| v1.0 | 2026-05-08 | Phase 2 首次定稿，v1 兩家 carrier：雲途 + Fuuffy |
| v1.1 | 2026-05-10 | 加入 v1 dev / staging mock 策略：Fuuffy OAuth 走 mock（不卡 sandbox 申請）/ 內部 mock 授權頁支援「模擬授權成功」+「模擬授權失敗」/ mock token 前綴 `mock_*` 區分 prod 資料 / 加 §0.4.1 v1 Mock 策略總覽（4 個 env flag 跨 Phase 2/7/8/9）/ AC-2.4 補 mock 路徑測試 / §8.1 改 Fuuffy 申請延遲為 v1 解法（dev mock + prod 切真實）/ §8.1.1 mock 資料 prod 上線必須清庫客戶重新綁 |
