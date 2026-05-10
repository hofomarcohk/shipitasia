export const Inbound = {
  page_list: {
    title: {
      en: "Inbound Order",
      zh_hk: "入庫訂單",
      zh_cn: "入库订单",
    },
    description: {
      en: "Manage Inbound Order",
      zh_hk: "管理入庫訂單",
      zh_cn: "管理入库订单",
    },
  },
  modal: {
    create: {
      title: {
        en: "Create Inbound Request",
        zh_hk: "新增入庫訂單",
        zh_cn: "新增入库订单",
      },
      description: {
        en: "Fill in the form below to create a new Inbound Request.",
        zh_hk: "填寫以下表格以創建新的入庫訂單。",
        zh_cn: "填写以下表格以创建新的入库订单。",
      },
    },
    edit: {
      title: {
        en: "Edit Inbound Request",
        zh_hk: "編輯入庫訂單",
        zh_cn: "编辑入库订单",
      },
      description: {
        en: "Fill in the form below to edit the Inbound Request.",
        zh_hk: "填寫以下表格以編輯入庫訂單。",
        zh_cn: "填写以下表格以编辑入库订单。",
      },
    },
  },
  status: {
    pending: {
      en: "Pending",
      zh_cn: "待处理",
      zh_hk: "待處理",
    },
    inbounding: {
      en: "Inbounding",
      zh_hk: "入庫中",
      zh_cn: "入库中",
    },
    inbounded: {
      en: "Inbounded",
      zh_hk: "已入庫",
      zh_cn: "已入库",
    },
    toOutbound: {
      en: "Scheduled",
      zh_hk: "待出庫",
      zh_cn: "待出库",
    },
    outbounding: {
      en: "Outbounding",
      zh_cn: "出库中",
      zh_hk: "出庫中",
    },
    outbounded: {
      en: "Outbounded",
      zh_cn: "已出库",
      zh_hk: "已出庫",
    },
    cancelled: {
      en: "Cancelled",
      zh_cn: "已取消",
      zh_hk: "已取消",
    },
  },
  fields: {
    orderId: {
      en: "ID",
      zh_hk: "訂單編號",
      zh_cn: "订单编号",
    },
    category: {
      en: "Category",
      zh_hk: "貨物分類",
      zh_cn: "货物分类",
    },
    restrictionTags: {
      en: "Restriction Tags",
      zh_hk: "限制標籤",
      zh_cn: "限制标签",
    },
    trackingNo: {
      en: "Tracking No",
      zh_hk: "追踪編號",
      zh_cn: "追踪号",
    },
    referenceNo: {
      en: "Reference No",
      zh_hk: "參考編號",
      zh_cn: "参考编号",
    },

    dimension: {
      en: "Dimension",
      zh_hk: "尺寸",
      zh_cn: "尺寸",
    },
    width: {
      en: "Width",
      zh_hk: "寬度",
      zh_cn: "宽度",
    },
    height: {
      en: "Height",
      zh_hk: "高度",
      zh_cn: "高度",
    },
    length: {
      en: "Length",
      zh_hk: "長度",
      zh_cn: "长度",
    },
    weight: {
      en: "Weight",
      zh_hk: "重量",
      zh_cn: "重量",
    },
    declaredValue: {
      en: "Declared Value",
      zh_hk: "申報價值",
      zh_cn: "申报价值",
    },
    is_add_from_address: {
      en: "Add From Address",
      zh_hk: "加入發貨地址",
      zh_cn: "新增发货地址",
    },
    from_address: {
      en: "Shipping Origin",
      zh_hk: "發貨地址",
      zh_cn: "发货地址",
    },
    isCustomToAddress: {
      zh_hk: "自定收貨地址",
      zh_cn: "自定收货地址",
      en: "Custom Address",
    },
    is_add_address_list: {
      en: "Add To Address List",
      zh_hk: "加入地址清單",
      zh_cn: "新增地址清单",
    },
    to_address: {
      en: "Shipping Destination",
      zh_hk: "收貨地址",
      zh_cn: "收货地址",
    },

    willArrivedAt: {
      en: "Will Arrived At",
      zh_hk: "預計到達",
      zh_cn: "预计到达",
    },

    inboundingAt: {
      en: "Inbounding At",
      zh_hk: "開始入庫時間",
      zh_cn: "开始入库时间",
    },
    inboundedAt: {
      en: "Inbounded At",
      zh_hk: "入庫完成時間",
      zh_cn: "入库完成时间",
    },
    cancelledAt: {
      en: "Cancelled At",
      zh_hk: "取消時間",
      zh_cn: "取消时间",
    },
    outboundingAt: {
      en: "Outbounding At",
      zh_hk: "開始出庫時間",
      zh_cn: "开始出库时间",
    },
    outboundedAt: {
      en: "Outbounded At",
      zh_hk: "出庫完成時間",
      zh_cn: "出库完成时间",
    },
    remarks: {
      en: "Remarks",
      zh_hk: "備註",
      zh_cn: "备注",
    },
  },
  descriptions: {
    createOutbound: {
      zh_hk: "把已選擇的入庫訂單轉成出庫訂單",
      zh_cn: "把已选中的入库订单转成出库订单",
      en: "Convert selected Inbound Orders to Outbound Orders",
    },
  },
};
