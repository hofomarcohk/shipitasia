export const ACCOUNT_ERROR = {
  CURRENT_PASSWORD_NOT_MATCH: {
    status: 400,
    sys_code: "1000001", // 10: Account Error, 0: Internal Error, 0000: Error no
    message: "Current password not match",
    zh_hk: "當前密碼不符",
    zh_cn: "当前密码不符",
    en: "Current password not match",
  },
  NEW_PASSWORD_NOT_MATCH: {
    status: 400,
    sys_code: "1000002",
    message: "New password and confirm password not match",
    zh_hk: "新密碼與確認密碼不符",
    zh_cn: "新密码与确认密码不符",
    en: "New password and confirm password not match",
  },
  MULTIPLE_ACTIVE_EXTERNAL_TOKEN_IN_PLATFORM: {
    status: 400,
    sys_code: "1000003",
    message: "Multiple active external token in one platform",
    zh_hk: "同一平台中存在多個的啟用中的外部令牌",
    zh_cn: "同一平台中存在多个的啟用中的外部令牌",
    en: "Multiple active external token in one platform",
  },

  API_TOKEN_NOT_FOUND: {
    status: 400,
    sys_code: "1000004",
    message: "Api token not found",
    zh_hk: "找不到API令牌",
    zh_cn: "找不到API令牌",
    en: "Api token not found",
  },

  // ── P1 register / verify / forgot-password ───────────────────
  EMAIL_ALREADY_EXISTS: {
    status: 400,
    sys_code: "1000010",
    message: "Email already registered",
    zh_hk: "電郵已被註冊",
    zh_cn: "邮箱已被注册",
    en: "Email already registered",
  },
  // INVALID_CREDENTIALS is intentionally not redefined here — see
  // common-error.ts (sys_code 9900002, status 401). Account-domain login
  // failures bubble up as that generic error to avoid revealing whether
  // the email exists.
  EMAIL_NOT_VERIFIED: {
    status: 400,
    sys_code: "1000012",
    message: "Email not verified, please complete verification first",
    zh_hk: "尚未完成電郵驗證，請先驗證電郵",
    zh_cn: "尚未完成邮箱验证，请先验证邮箱",
    en: "Email not verified, please complete verification first",
  },
  ACCOUNT_DISABLED: {
    status: 400,
    sys_code: "1000013",
    message: "Account disabled, please contact customer support",
    zh_hk: "帳號已停用，請聯絡客服",
    zh_cn: "账号已停用，请联系客服",
    en: "Account disabled, please contact customer support",
  },
  TOKEN_EXPIRED: {
    status: 400,
    sys_code: "1000014",
    message: "Token expired, please request a new one",
    zh_hk: "驗證連結已過期，請重新申請",
    zh_cn: "验证链接已过期，请重新申请",
    en: "Token expired, please request a new one",
  },
  TOKEN_INVALID: {
    status: 400,
    sys_code: "1000015",
    message: "Token invalid or already used",
    zh_hk: "驗證連結無效或已使用",
    zh_cn: "验证链接无效或已使用",
    en: "Token invalid or already used",
  },
  RESEND_TOO_FREQUENT: {
    status: 429,
    sys_code: "1000016",
    message: "Resend requested too frequently, please try again later",
    zh_hk: "重發請求過於頻繁，請稍後再試",
    zh_cn: "重发请求过于频繁，请稍后再试",
    en: "Resend requested too frequently, please try again later",
  },
  ACCOUNT_ALREADY_ACTIVE: {
    status: 400,
    sys_code: "1000017",
    message: "Account is already active, please log in",
    zh_hk: "帳號已啟用，請直接登入",
    zh_cn: "账号已启用，请直接登录",
    en: "Account is already active, please log in",
  },
  PASSWORD_NOT_SET: {
    status: 400,
    sys_code: "1000018",
    message:
      "No local password set; please log in via Google or set a local password first",
    zh_hk: "未設定本地密碼，請改用 Google 登入或先設定本地密碼",
    zh_cn: "未设定本地密码，请改用 Google 登录或先设定本地密码",
    en: "No local password set; please log in via Google or set a local password first",
  },
  PASSWORD_ALREADY_SET: {
    status: 400,
    sys_code: "1000019",
    message: "Local password already set; use change-password instead",
    zh_hk: "已設定過本地密碼，請改用「修改密碼」功能",
    zh_cn: "已设定过本地密码，请改用「修改密码」功能",
    en: "Local password already set; use change-password instead",
  },
  COMPANY_INFO_REQUIRED: {
    status: 400,
    sys_code: "1000020",
    message: "company_info is required for business clients",
    zh_hk: "商業客戶必須提供公司資訊",
    zh_cn: "商业客户必须提供公司资讯",
    en: "company_info is required for business clients",
  },
};
