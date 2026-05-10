export const Inbound = {
  page_list: {
    title: {
      en: "Inbound Order",
      "zh-hk": "入庫訂單",
      "zh-cn": "入库订单",
    },
    description: {
      en: "Manage Inbound Order",
      "zh-hk": "管理入庫訂單",
      "zh-cn": "管理入库订单",
    },
  },
  modal: {
    create: {
      title: {
        en: "Create Inbound Request",
        "zh-hk": "新增入庫訂單",
        "zh-cn": "新增入库订单",
      },
      description: {
        en: "Fill in the form below to create a new Inbound Request.",
        "zh-hk": "填寫以下表格以創建新的入庫訂單。",
        "zh-cn": "填写以下表格以创建新的入库订单。",
      },
    },
    edit: {
      title: {
        en: "Edit Inbound Request",
        "zh-hk": "編輯入庫訂單",
        "zh-cn": "编辑入库订单",
      },
      description: {
        en: "Fill in the form below to edit the Inbound Request.",
        "zh-hk": "填寫以下表格以編輯入庫訂單。",
        "zh-cn": "填写以下表格以编辑入库订单。",
      },
    },
  },
  status: {
    pending: {
      en: "Pending",
      "zh-cn": "待处理",
      "zh-hk": "待處理",
    },
    arrived: {
      en: "Arrived",
      "zh-hk": "已到達",
      "zh-cn": "已到达",
    },
    received: {
      en: "Received",
      "zh-hk": "已入庫",
      "zh-cn": "已入库",
    },

    toOutbound: {
      en: "Scheduled",
      "zh-hk": "待出庫",
      "zh-cn": "待出库",
    },
    outbounding: {
      en: "Outbounding",
      "zh-cn": "出库中",
      "zh-hk": "出庫中",
    },
    outbounded: {
      en: "Outbounded",
      "zh-cn": "已出库",
      "zh-hk": "已出庫",
    },
    cancelled: {
      en: "Cancelled",
      "zh-cn": "已取消",
      "zh-hk": "已取消",
    },
  },
  fields: {
    orderId: {
      en: "ID",
      "zh-hk": "訂單編號",
      "zh-cn": "订单编号",
    },
    category: {
      en: "Category",
      "zh-hk": "貨物分類",
      "zh-cn": "货物分类",
    },
    restrictionTags: {
      en: "Restriction Tags",
      "zh-hk": "限制標籤",
      "zh-cn": "限制标签",
    },
    trackingNo: {
      en: "Tracking No",
      "zh-hk": "追踪編號",
      "zh-cn": "追踪号",
    },
    referenceNo: {
      en: "Reference No",
      "zh-hk": "參考編號",
      "zh-cn": "参考编号",
    },

    dimension: {
      en: "Dimension",
      "zh-hk": "尺寸",
      "zh-cn": "尺寸",
    },
    width: {
      en: "Width",
      "zh-hk": "寬度",
      "zh-cn": "宽度",
    },
    height: {
      en: "Height",
      "zh-hk": "高度",
      "zh-cn": "高度",
    },
    length: {
      en: "Length",
      "zh-hk": "長度",
      "zh-cn": "长度",
    },
    weight: {
      en: "Weight",
      "zh-hk": "重量",
      "zh-cn": "重量",
    },
    declaredValue: {
      en: "Declared Value",
      "zh-hk": "申報價值",
      "zh-cn": "申报价值",
    },
    is_add_from_address: {
      en: "Add From Address",
      "zh-hk": "加入發貨地址",
      "zh-cn": "新增发货地址",
    },
    from_address: {
      en: "Shipping Origin",
      "zh-hk": "發貨地址",
      "zh-cn": "发货地址",
    },
    isCustomToAddress: {
      "zh-hk": "自定收貨地址",
      "zh-cn": "自定收货地址",
      en: "Custom Address",
    },
    is_add_address_list: {
      en: "Add To Address List",
      "zh-hk": "加入地址清單",
      "zh-cn": "新增地址清单",
    },
    to_address: {
      en: "Shipping Destination",
      "zh-hk": "收貨地址",
      "zh-cn": "收货地址",
    },

    willArrivedAt: {
      en: "Will Arrived At",
      "zh-hk": "預計到達",
      "zh-cn": "预计到达",
    },

    inboundingAt: {
      en: "Inbounding At",
      "zh-hk": "開始入庫時間",
      "zh-cn": "开始入库时间",
    },
    inboundedAt: {
      en: "Inbounded At",
      "zh-hk": "入庫完成時間",
      "zh-cn": "入库完成时间",
    },
    cancelledAt: {
      en: "Cancelled At",
      "zh-hk": "取消時間",
      "zh-cn": "取消时间",
    },
    outboundingAt: {
      en: "Outbounding At",
      "zh-hk": "開始出庫時間",
      "zh-cn": "开始出库时间",
    },
    outboundedAt: {
      en: "Outbounded At",
      "zh-hk": "出庫完成時間",
      "zh-cn": "出库完成时间",
    },
    remarks: {
      en: "Remarks",
      "zh-hk": "備註",
      "zh-cn": "备注",
    },
  },
  descriptions: {
    createOutbound: {
      "zh-hk": "把已選擇的入庫訂單轉成出庫訂單",
      "zh-cn": "把已选中的入库订单转成出库订单",
      en: "Convert selected Inbound Orders to Outbound Orders",
    },
  },
};
