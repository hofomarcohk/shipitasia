# Phase 1：OMS 客戶帳號管理

> 集運 OMS+WMS v1 開發規格
> 版本：v1.0
> 日期：2026-05-08
> 範圍：客戶在 OMS 的整個帳號生命週期（註冊、登入、登出、個人資料、改密碼、忘記密碼）+ WMS admin 看客戶清單

---

## 0. 前設

### 0.1 業務量假設

**v1 上線半年內 ≤ 50 客戶**。所有設計以此為基準，避免過度設計：

- 不做 cron 自動 retry / 排程任務（CS 手動處理）
- 不做 webhook 重試 queue（失敗 → email 通知 CS）
- 不做批次操作 UI
- 不做即時 dashboard KPI
- 不做 audit log UI（log 還是要寫，UI 延後）
- 不做 cache 優化
- 不做 rate limit / DDOS 防護

### 0.2 技術棧

沿用 ShipItAsia 既有：

- **Frontend / Backend**：Next.js 16.1.3 + Turbopack + React 18 + TypeScript
- **DB**：MongoDB 8（OMS 用 `vw_sms` DB）
- **Cache**：Redis（ioredis） — Phase 1 用於存 OTP / verify token
- **Auth**：custom JWT + Google OAuth 2.0（**新增**）
- **驗證**：zod schemas
- **UI**：Tailwind + shadcn/ui + Tabler icons
- **Email**：Resend（**新增**）

### 0.3 UI 設計風格

**完全沿用 ShipItAsia 既有 layout / 元件 / 色系 / 字體**。

新增頁面參照既有頁面對映（見 §3.1）。新增元件先看既有有沒有類似的（list table、form wrapper、modal），有就抄，沒有再造。Tabler icon set 不換成 Lucide 等。

### 0.4 環境

開發階段全本地：

- MongoDB / Redis 走 brew services（無 auth）
- Resend 用免費 tier（每天 100 封、每月 3,000 封）+ sandbox domain
- Google OAuth 用 testing mode + 加 testing users（避免 verification 流程）
- 加密 key 寫 `.env`，未來改 KMS / vault 改 `cryptoService` 內部即可

---

## 1. 業務流程

### 1.1 註冊（Email + Password 路徑）

1. 客戶進 OMS `/zh-hk/register`（**新頁面**）
2. 填表單（見 §2.1 註冊欄位）
3. 提交 → server-side
   - zod 驗證
   - email 唯一性檢查
   - bcrypt hash 密碼
   - 寫 `clients`，`status = pending_verification`、`email_verified = false`
   - 寄 verify email（含一次性 token）
4. 客戶開信 → 點 verify link → 落到 `/zh-hk/verify-email?token=xxx`
5. server 驗 token、改 `status = active` + `email_verified = true`、刪 token
6. 自動登入 → 跳轉 OMS 首頁

**Verify token 規格**：
- 32 byte random hex
- TTL 24 小時
- 存 Redis：`verify:email:{token}` → `clientId`
- 點過即失效（一次性）
- 同 email 60 秒內最多重發 1 次

### 1.2 註冊（Google OAuth 路徑）

1. 客戶在 `/zh-hk/login` 或 `/zh-hk/register` 點「使用 Google 登入」
2. 跳轉 Google OAuth consent screen
3. Google callback → `/api/cms/auth/google/callback`
4. server 拿 access_token、取 Google `userinfo`（email / name / picture）
5. 查 `clients` 是否已存在（用 email 比對）：
   - 存在 → 更新 `oauth_providers`、發 JWT、登入
   - 不存在 → 建立新 client：
     - `email`、`display_name`（從 Google）、`status = active`、`email_verified = true`（Google 已驗證）
     - **不**設密碼（密碼欄位 nullable）
     - **缺 client_type / phone**：跳轉 `/zh-hk/onboarding` 補欄位（必填表單，不填不能進系統）
   - 補完後 → 進 OMS 首頁

**Google 驗證的 email 直接視為已驗證**，跳過 verify link 流程。

### 1.3 登入 / 登出

**登入**：
- UI：`/zh-hk/login`（**改造既有頁**）— 加 Google login 按鈕
- API：`POST /api/cms/login`（**保留既有**）
- 邏輯：查 `clients` 比對 password、確認 `status = active`、發 JWT
- `status != active` → 提示「帳號未啟用」並重發 verify link

**登出**：清 cookie、redirect to `/zh-hk/login`

### 1.4 個人資料 / 改密碼

- UI：`/zh-hk/profile`（**新頁**）
- 顯示：display_name、email（不可改）、phone、client_type（不可改）、company_info（business 才顯示）
- 動作：改 phone、改 display_name、改 company_info、改密碼

**改密碼**：
- 必須輸入舊密碼
- Google OAuth 註冊的客戶（無密碼）：顯示「您使用 Google 登入，請至 Google 帳戶管理密碼」+ 提供「設定本地密碼」按鈕（讓他可以日後也能用 email/password 登入）

### 1.5 忘記密碼

1. 客戶在登入頁點「忘記密碼」
2. 進 `/zh-hk/forgot-password`，填 email
3. server 寄 reset link（含 token，TTL 1 小時，存 Redis `reset:password:{token}` → `clientId`）
4. 點 link 落到 `/zh-hk/reset-password?token=xxx`
5. 填新密碼 → server 驗 token、bcrypt 新密碼、刪 token
6. 自動登入

**注意**：Google OAuth 註冊但無本地密碼的客戶，走「忘記密碼」會提示「您未設定本地密碼，請使用 Google 登入或先設定本地密碼」。

### 1.6 WMS Admin 看客戶清單

- UI：`/zh-hk/clients/list`（**WMS 新頁**）
- 權限：admin only
- 顯示欄位：display_name / client_type / email / phone / status / created_at
- 動作：
  - 點進詳情頁
  - 停用 / 啟用（toggle status）
  - 重設密碼（產 reset link 給客服複製寄客戶）
- **不做**：admin 直接代客戶建帳號（保持自助註冊作為唯一入口）

---

## 2. Schema 變更

### 2.1 `clients`（OMS `vw_sms.clients` — 修改既有）

| 欄位 | 操作 | 型別 | 說明 |
|---|---|---|---|
| email | 保留 | string | 唯一索引 |
| password | 改 nullable | string? | bcrypt hash；Google OAuth 註冊可為 null |
| client_type | **新增** | enum | `business` / `end_user`，註冊必填 |
| display_name | **新增** | string | 個人姓名 / 公司名稱 |
| phone | 保留 | string | 必填 |
| company_info | **新增** | object? | `{ tax_id, invoice_title, invoice_address }`，client_type=business 必填 |
| status | **新增** | enum | `pending_verification` / `active` / `disabled`，預設 pending_verification（OAuth 路徑直接 active）|
| email_verified | **新增** | boolean | 預設 false |
| balance | **新增（預留）** | number | 預設 0，Phase 3 使用 |
| preferred_carrier_code | **新增（預留）** | string? | Phase 4 使用 |
| terms_accepted_at | **新增** | date | 同意條款時間 |
| oauth_providers | **新增** | array | 子集合 `[{ provider, provider_user_id, linked_at }]` |
| createdAt / updatedAt | 保留 | date | 既有 |

**Indexes**：
- `email` 唯一
- `oauth_providers.provider + oauth_providers.provider_user_id` 複合唯一（防 Google 帳號被多綁）

### 2.2 移除既有欄位

無。既有欄位都保留向下相容。

### 2.3 Redis keys（Phase 1 新增）

| Key pattern | TTL | 用途 |
|---|---|---|
| `verify:email:{token}` | 24h | 註冊 email 驗證 token |
| `reset:password:{token}` | 1h | 忘記密碼 token |
| `verify:resend:{email}` | 60s | 重發冷卻 |
| `reset:resend:{email}` | 60s | 重發冷卻 |

---

## 3. 頁面 / API 清單

### 3.1 OMS 新增 / 改造頁面

| 路徑 | 狀態 | 對映 ShipItAsia 既有頁 |
|---|---|---|
| `/zh-hk/login` | **改造**：加 Google 登入按鈕 | 既有 |
| `/zh-hk/register` | **新增** | 仿 `/zh-hk/login` 的 layout |
| `/zh-hk/verify-email` | **新增** | 簡單 result 頁，仿 ShipItAsia 既有 message 頁 |
| `/zh-hk/forgot-password` | **新增** | 仿 `/zh-hk/login` |
| `/zh-hk/reset-password` | **新增** | 仿 `/zh-hk/login` |
| `/zh-hk/onboarding` | **新增** | OAuth 註冊後補資料；仿既有 form layout |
| `/zh-hk/profile` | **新增** | sidebar 加入口；仿既有 detail 頁 |

### 3.2 OMS 新增 API endpoints

```
POST   /api/cms/auth/register             註冊 (email/password)
POST   /api/cms/auth/verify-email         點 verify link (帶 token)
POST   /api/cms/auth/resend-verify        重發 verify email
POST   /api/cms/auth/forgot-password      請求重設
POST   /api/cms/auth/reset-password       提交新密碼 (帶 token)
GET    /api/cms/auth/google               跳轉 Google OAuth
GET    /api/cms/auth/google/callback      OAuth callback
POST   /api/cms/auth/onboarding           OAuth 後補欄位

GET    /api/cms/profile                   取自己的 profile
PATCH  /api/cms/profile                   改 phone / display_name / company_info
POST   /api/cms/profile/change-password   改密碼（需舊密碼）
POST   /api/cms/profile/set-password      OAuth 用戶首次設本地密碼
POST   /api/cms/profile/link-google       已存在帳號綁 Google
```

**保留既有**：`POST /api/cms/login`、`POST /api/cms/logout`

### 3.3 WMS 新增頁面 / API

| 路徑 | 用途 |
|---|---|
| `/zh-hk/clients/list` | admin 客戶清單 |
| `/zh-hk/clients/[id]` | 客戶詳情 |

```
GET    /api/wms/clients/list              admin 取客戶清單
GET    /api/wms/clients/:id               詳情
PATCH  /api/wms/clients/:id/status        停用 / 啟用
POST   /api/wms/clients/:id/reset-password 產 reset link
```

---

## 4. ShipItAsia 既有現況對映

| 既有 | 處理 |
|---|---|
| `clients` collection 已存在 | **保留**，新增欄位 |
| `POST /api/cms/login` | **保留**，內部邏輯加 status 檢查 |
| `/zh-hk/login` 頁面 | **改造**，加 Google 登入按鈕 |
| 既有測試帳號 `admin / admin123456` | **保留**做 admin 用；上線前清掉 |
| client `notifyApis` 欄位（schema 有但無實作）| **不在 Phase 1 範圍**，留給 Phase 3 通知系統 |
| WMS 端原本透過 admin API + callWmsApi 建 client 的路徑 | **棄用**（保持自助註冊為唯一入口），但既有 endpoint 不刪（避免破壞其他依賴）|

---

## 5. Fuuffy 借鏡

Phase 1 沒有特別的 fuuffy 設計值得抄。唯一一個小細節：

- **`is_email_verified` 獨立欄位**（fuuffy `tbl_member` 有）— 我們已採用（§2.1 的 `email_verified`），把驗證狀態跟 `status` 分開，避免日後加 SMS 驗證、第三方 KYC 時要重構 enum。

避坑：

- **A2（fuuffy 坑）silent stub return success**：Phase 1 的 Google OAuth 還沒接好之前，不要用 placeholder return success。寫 `throw new Error("NOT_IMPLEMENTED")` 讓開發階段直接看到。
- **A6（fuuffy 坑）萬能 remarks 欄位**：Phase 1 的 client schema 不加 remarks 欄位。日後若有客戶屬性需求 → 開新欄位 / 子集合。

---

## 6. 安全 / 加密

### 6.1 cryptoService 包裝層

**所有加解密透過此 service**，未來改 KMS / vault 只改 service 內部：

```typescript
// /lib/cryptoService.ts
import crypto from 'crypto';

const ALGO = 'aes-256-gcm';
const KEY = Buffer.from(process.env.ENCRYPTION_KEY!, 'base64'); // 32 bytes

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decrypt(payload: string): string {
  const buf = Buffer.from(payload, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = crypto.createDecipheriv(ALGO, KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}
```

**Phase 1 暫時用不到加密**（沒有要存 carrier credential），但 service 先建好給 Phase 2 / 4 用。

### 6.2 密碼

- bcrypt cost factor 10
- 最少 8 字元 + 至少 1 字母 + 1 數字（zod 規則）

### 6.3 JWT

沿用 ShipItAsia 既有 JWT 機制。token payload 加 `client_type` 欄位（前端可用來顯示 / 隱藏 business-only 功能）。

### 6.4 Google OAuth 設定

```
.env:
GOOGLE_OAUTH_CLIENT_ID=xxx
GOOGLE_OAUTH_CLIENT_SECRET=xxx
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3002/api/cms/auth/google/callback

scope:
- openid
- email
- profile
（不要其他 scope，避免 verification）
```

### 6.5 Resend 設定

```
.env:
RESEND_API_KEY=xxx
RESEND_FROM_EMAIL=onboarding@resend.dev  # dev 階段
# 上線前改 noreply@yourdomain.com 並驗證 DNS

EMAIL_VERIFY_BASE_URL=http://localhost:3002/zh-hk/verify-email
PASSWORD_RESET_BASE_URL=http://localhost:3002/zh-hk/reset-password
```

### 6.6 Email 模板

dev 階段用最簡單 plain text + 一個 button link，不做華麗 HTML。模板放 `/lib/email/templates/`：

- `verify-email.ts`
- `reset-password.ts`

格式統一加 footer：「此為系統發信，請勿回覆」+ CS 聯絡方式 placeholder。

---

## 7. Acceptance Criteria（給 Claude Code）

### AC-1.1 Email/Password 註冊

**Given** 使用者進入 `/zh-hk/register`
**When** 填寫合法表單並提交
**Then**
- `clients` 寫入新紀錄，`status=pending_verification`、`email_verified=false`
- Resend API 被呼叫一次，target email 為註冊 email
- 回應 `{ success: true, message: "請至信箱完成驗證" }`
- Redis 新增 `verify:email:{token}` key，TTL = 86400

**測試**：
- 重複 email 註冊 → 回 4xx `EMAIL_ALREADY_EXISTS`
- 密碼不符規則 → zod 4xx
- 缺必填欄位 → zod 4xx
- business 缺 company_info → 4xx
- 60 秒內同 email 重發 → 4xx `RESEND_TOO_FREQUENT`

### AC-1.2 Verify email

**Given** 註冊後收到 verify link
**When** 點擊 link 進入 `/zh-hk/verify-email?token=xxx`
**Then**
- token 從 Redis 取得 clientId、validate
- `clients.status` 從 `pending_verification` 改為 `active`
- `clients.email_verified` 改為 true
- Redis token 刪除（一次性）
- 自動發 JWT、登入、跳轉首頁

**測試**：
- 過期 token → 4xx `TOKEN_EXPIRED`
- 已用 token → 4xx `TOKEN_INVALID`
- 已 active 帳號再點 → 4xx 但溫和提示「帳號已啟用」+ 跳登入頁

### AC-1.3 Google OAuth 註冊

**Given** 使用者點「使用 Google 登入」
**When** Google callback 帶回 valid code、且該 email 在 `clients` 不存在
**Then**
- 新建 `clients`：`status=active`、`email_verified=true`、`password=null`
- 寫 `oauth_providers`：`{ provider: 'google', provider_user_id: <Google ID>, linked_at: now }`
- 跳轉 `/zh-hk/onboarding` 補 `client_type` / `phone` / `display_name`（如 Google name 為空才需補）/ 條件補 `company_info`
- 補完後發 JWT、登入

**測試**：
- 該 email 已存在但無 Google 綁定 → 自動 link Google 到既有帳號（用既有 status）+ 跳首頁，不進 onboarding
- 該 email 已存在且有 Google 綁定 → 直接登入
- callback 缺 code 或 invalid → 4xx，跳回登入頁帶錯誤訊息

### AC-1.4 登入

**Given** 已 active 客戶
**When** 用正確 email + password 登入
**Then**
- 比對 bcrypt 通過
- 發 JWT（含 clientId、client_type）
- 寫 cookie

**測試**：
- 密碼錯 → 4xx `INVALID_CREDENTIALS`
- `status=disabled` → 4xx `ACCOUNT_DISABLED`
- `status=pending_verification` → 4xx `EMAIL_NOT_VERIFIED` + 提供「重發 verify email」CTA

### AC-1.5 改 profile

**Given** 已登入客戶
**When** PATCH `/api/cms/profile` 改 phone
**Then**
- `clients.phone` 更新
- `clients.updatedAt` 自動更新
- 回 `{ success: true, profile: <updated> }`

**測試**：
- 嘗試改 email / client_type → 4xx（這兩欄不可改）
- 嘗試改 balance / status → 4xx（資安）

### AC-1.6 改密碼

**Given** 已登入客戶
**When** 提供正確舊密碼 + 新密碼
**Then**
- bcrypt 新密碼、寫入
- 回 `{ success: true }`

**測試**：
- 舊密碼錯 → 4xx
- OAuth 註冊但無本地密碼的客戶呼叫 `change-password` → 4xx，引導去 `set-password`
- `set-password` 不需要舊密碼，只需要 valid JWT

### AC-1.7 忘記密碼

**Given** 客戶請求重設密碼
**When** POST `/api/cms/auth/forgot-password` 帶 email
**Then**
- 該 email 存在 → 寄 reset link，Redis 寫 `reset:password:{token}`
- 該 email 不存在 → **也回成功**（防 email enumeration），但**不寄信**

**測試**：
- 60 秒重發 → 4xx
- 過期 token reset → 4xx

### AC-1.8 WMS admin 看客戶清單

**Given** WMS admin 登入
**When** 進 `/zh-hk/clients/list`
**Then**
- 顯示所有 client，分頁（每頁 50 筆）
- 篩選：status / client_type / 搜尋 email 或 display_name
- 動作：toggle status、產 reset link

**測試**：
- 非 admin 帳號訪問 → 403
- 停用後該 client 嘗試登入 → AC-1.4 的 disabled 路徑

---

## 8. 風險點 + 已知 gotcha

### 8.1 Google OAuth callback URL 設定

dev / staging / prod 三組 callback URL 都要在 Google Cloud Console 註冊，否則 callback 會被拒。dev 階段先註冊 `http://localhost:3002/api/cms/auth/google/callback`。

### 8.2 Resend sandbox domain 限制

免費 tier 只能寄到「自己的驗證 email」。若要寄到任意 email 必須先驗證 sender domain（DNS 設 SPF + DKIM）。**dev 階段建議申請 Resend 帳號 → 用自己的 email 當 sender → 寄到自己用來測試的 email**，避免被 reject。

### 8.3 Email enumeration 風險

「忘記密碼」回應不能洩漏 email 是否存在（AC-1.7 已處理）。註冊重複 email 的 4xx 訊息**也建議統一**為 `EMAIL_ALREADY_EXISTS`，不要區分「已存在但未驗證」vs「已存在且 active」— 但這跟 UX 衝突（已存在但未驗證的客戶應該要能重發 verify）。

**v1 取捨**：給明確錯誤（接受 enumeration 風險）。理由：50 客戶量級沒人會做 email enum 攻擊，UX 比安全重要。

### 8.4 OAuth 與本地帳號衝突

客戶 X 用 `x@gmail.com` 在你系統先做 email/password 註冊。隔天他改用 Google login 同 email。

**處理（AC-1.3）**：自動 link，不重複建帳號。但**有資安疑慮**：如果 X 的 Google 帳號被盜，攻擊者就能透過 Google login 進入 X 在你系統的本地帳號。

**v1 取捨**：接受此風險（Google OAuth 本身就是把驗證委託給 Google）。如果你有疑慮，可以改成「已存在 email/password 帳號 + 第一次用 Google login」要求先完成 email 驗證流程。

### 8.5 條款 / 隱私政策

註冊表單要勾選同意條款 + 隱私政策。**v1 條款內容請業務 / 法務提供**。Phase 1 spec 不包含條款撰寫。先放 placeholder：

```
[ ] 我已閱讀並同意 [服務條款] 與 [隱私政策]
```

---

## 9. 變更紀錄

| 版本 | 日期 | 說明 |
|---|---|---|
| v1.0 | 2026-05-08 | Phase 1 首次定稿 |
