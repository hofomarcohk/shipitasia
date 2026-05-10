export const Account = {
  page_list: {
    title: {
      en: "Profile",
      zh_hk: "個人資料",
      zh_cn: "个人信息",
    },
    description: {
      en: "Manage information about you and your preferences in various services",
      zh_hk: "管理有關您及您在各項服務中偏好設定的資料",
      zh_cn: "管理有关您及您在各项服务中偏好设置的资料",
    },
  },

  fields: {
    // profile
    profile: {
      en: "Profile",
      zh_hk: "個人資料",
      zh_cn: "个人资料",
    },
    username: {
      en: "Username",
      zh_hk: "用戶名稱",
      zh_cn: "用户名称",
    },
    firstname: {
      en: "First Name",
      zh_hk: "名字",
      zh_cn: "名字",
    },
    lastname: {
      en: "Last Name",
      zh_hk: "姓氏",
      zh_cn: "姓氏",
    },
    avatar: {
      en: "Avatar",
      zh_hk: "個人頭像",
      zh_cn: "个人头像",
    },
    email: {
      en: "Email",
      zh_hk: "電子郵箱",
      zh_cn: "电子邮箱",
    },

    // address
    address: {
      en: "Address",
      zh_hk: "地址設置",
      zh_cn: "地址设置",
    },

    // account
    account: {
      en: "Account",
      zh_hk: "帳戶設定",
      zh_cn: "账户设置",
    },
    passwordChange: {
      en: "Change Password",
      zh_hk: "更改密碼",
      zh_cn: "更改密码",
    },
    currentPassword: {
      en: "Current Password",
      zh_hk: "目前密碼",
      zh_cn: "当前密码",
    },
    newPassword: {
      en: "New Password",
      zh_hk: "新密碼",
      zh_cn: "新密码",
    },
    confirmPassword: {
      en: "Confirm Password",
      zh_hk: "確認密碼",
      zh_cn: "确认密码",
    },

    // payment
    paymentSetting: {
      en: "Payment Setting",
      zh_hk: "付款設定",
      zh_cn: "付款设置",
    },
    payment: {
      en: "Payment",
      zh_hk: "付款資料",
      zh_cn: "付款数据",
    },
    paymentMethod: {
      en: "Payment Method",
      zh_hk: "付款方式",
      zh_cn: "付款方式",
    },
    cardNumber: {
      en: "Card Number",
      zh_hk: "卡號",
      zh_cn: "卡号",
    },
    holderName: {
      en: "Holder",
      zh_hk: "持有人",
      zh_cn: "持有人",
    },
    expirationDate: {
      en: "Expiration Date",
      zh_hk: "到期日",
      zh_cn: "到期日",
    },
    cvv: {
      en: "CVV",
      zh_hk: "CVV (安全碼)",
      zh_cn: "CVV (安全码)",
    },
    creditCard: {
      en: "Credit Card",
      zh_hk: "信用卡",
      zh_cn: "信用卡",
    },

    // appearance
    appearance: {
      en: "Appearance",
      zh_hk: "外觀",
      zh_cn: "外观",
    },
    theme: {
      en: "Theme",
      zh_hk: "主題",
      zh_cn: "主题",
    },
    light: {
      en: "Light",
      zh_hk: "淺色",
      zh_cn: "浅色",
    },
    dark: {
      en: "Dark",
      zh_hk: "深色",
      zh_cn: "深色",
    },

    // notifications
    notifications: {
      en: "Notifications",
      zh_hk: "通知",
      zh_cn: "通知",
    },
    is_email_enabled: {
      en: "Email Notifications",
      zh_hk: "電子郵件通知",
      zh_cn: "电子邮件通知",
    },

    // api
    api: {
      en: "API Settings",
      zh_hk: "API 設置",
      zh_cn: "API 设置",
    },
    // our API
    is_api_enabled: {
      en: "API feature",
      zh_hk: "API功能",
      zh_cn: "API功能",
    },
    apiKey: {
      en: "API Key",
      zh_hk: "API金鑰",
      zh_cn: "API密钥",
    },
    secret: {
      en: "Secret Key",
      zh_hk: "密鑰",
      zh_cn: "密钥",
    },

    // 3rd party API
    connect_3rd_party: {
      en: "Connect 3rd Party Services",
      zh_hk: "連接第三方服務",
      zh_cn: "连接第三方服务",
    },
    platform: {
      en: "Platform",
      zh_hk: "平台",
      zh_cn: "平台",
    },
    token: {
      en: "Token",
      zh_hk: "令牌",
      zh_cn: "令牌",
    },

    // notify API
    notifyApiUrl: {
      en: "Notify API URL",
      zh_hk: "通知API網址",
      zh_cn: "通知API网址",
    },
    url: {
      en: "URL",
      zh_hk: "網址",
      zh_cn: "网址",
    },

    externalTokens: {
      en: "External Tokens",
      zh_hk: "外部令牌",
      zh_cn: "外部令牌",
    },

    apiTokens: {
      en: "API Tokens",
      zh_hk: "API令牌",
      zh_cn: "API令牌",
    },
  },
  description: {
    passwordChange: {
      en: "Change your password",
      zh_hk: "更改您的密碼",
      zh_cn: "更改您的密码",
    },

    // appearance
    theme: {
      en: "Set the theme you want to use in the dashboard.",
      zh_hk: "設置您想在儀表板中使用的主題",
      zh_cn: "设置您想在仪表板中使用的主题",
    },

    // notifications
    is_email_enabled: {
      en: "Enable email notifications",
      zh_hk: "啟用電子郵件通知功能",
      zh_cn: "启用电子邮件通知功能",
    },

    // api
    is_api_enabled: {
      en: "Enable API feature to get data",
      zh_hk: "啟用API連接系統獲取數據",
      zh_cn: "启用API连接系统获取数据",
    },
    secret: {
      en: "This is the Secret key. It will only be shown once. Please keep it safe and do not share it with anyone.",
      zh_hk: "這是您的密鑰，只會顯示一次，請妥善保管，不要與任何人分享。",
      zh_cn: "这是您的密钥，只会显示一次，请妥善保管，不要与任何人分享。",
    },

    // notify API
    notifyApiUrl: {
      zh_hk: "當訂單更新時，將會發送通知到指定的API網址",
      zh_cn: "当订单更新时，将会发送通知到指定的API网址",
      en: "When the order is updated, it will send a notification to the specified API URL",
    },
  },
};
