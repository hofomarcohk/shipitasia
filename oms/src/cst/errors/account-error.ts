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
};
