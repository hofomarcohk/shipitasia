export const Pda = {
  staff: {
    en: "Staff",
    "zh-hk": "員工",
    "zh-cn": "员工",
  },
  warehouse: {
    en: "Warehouse",
    "zh-hk": "倉庫",
    "zh-cn": "仓库",
    select_warehouse: {
      description: {
        en: "Please select a warehouse",
        "zh-hk": "請選擇倉庫",
        "zh-cn": "请选择仓库",
      },
    },
  },
  inbound: {
    arrive: {
      select_item: {
        en: "Select Item",
        "zh-hk": "選擇貨品",
        "zh-cn": "选择货品",
      },
      success: {
        "zh-hk": "成功完成到貨登記",
        "zh-cn": "成功完成到货登记",
        en: "Arrived Successfully",
      },
      fail: {
        "zh-hk": "到貨登記失敗",
        "zh-cn": "到货登记失败",
        en: "Arrive Failed",
      },
      steps: {
        searchItem: {
          en: "Search Item",
          "zh-hk": "搜尋包裹",
          "zh-cn": "搜索包裹",
          desc: {
            en: "Please scan the item code",
            "zh-hk": "請掃描包裹編號:",
            "zh-cn": "请扫描包裹编号:",
          },
        },
        listResult: {
          en: "Confirm Item",
          "zh-hk": "確認包裹",
          "zh-cn": "确认包裹",
          desc: {
            en: "Plesae select item:",
            "zh-hk": "請選擇包裹:",
            "zh-cn": "请选择包裹:",
          },
        },
      },
    },
    receive: {
      pls_select_item: {
        en: "Please select item",
        "zh-hk": "請選擇貨品",
        "zh-cn": "请选择货品",
      },
      selected_item: {
        en: "Selected Item",
        "zh-hk": "已選擇的貨品",
        "zh-cn": "已选择的货品",
      },
      success: {
        "zh-hk": "成功完成貨物入庫",
        "zh-cn": "成功完成货物入库",
        en: "Received Successfully",
      },
      fail: {
        "zh-hk": "貨物入庫失敗",
        "zh-cn": "货物入库失败",
        en: "Receive Failed",
      },
      steps: {
        scanLocation: {
          en: "Scan Location",
          "zh-hk": "掃描庫位",
          "zh-cn": "扫描库位",
          desc: {
            en: "Please scan the location code",
            "zh-hk": "請掃描庫位編號:",
            "zh-cn": "请扫描库位编号:",
          },
        },
        scanItem: {
          en: "Scan Item",
          "zh-hk": "掃描包裹",
          "zh-cn": "扫描包裹",
          desc: {
            en: "Please scan the item code",
            "zh-hk": "請掃描包裹編號:",
            "zh-cn": "请扫描包裹编号:",
          },
        },
      },
    },
  },
  outbound: {
    pick: {
      success: {
        "zh-hk": "成功完成出庫提取",
        "zh-cn": "成功完成出库提取",
        en: "Picked Successfully",
      },
      already_picked: {
        "zh-hk": "已完成出庫提取",
        "zh-cn": "已完成出库提取",
        en: "Already Picked",
      },
      fail: {
        "zh-hk": "出庫提取失敗",
        "zh-cn": "出库提取失败",
        en: "Pick Failed",
      },
      itemNotFound: {
        "zh-hk": "找不到貨品",
        "zh-cn": "找不到货品",
        en: "Item Not Found",
      },
      picked: {
        "zh-hk": "成功",
        "zh-cn": "成功",
        en: "Picked",
      },
      steps: {
        selectTask: {
          en: "Select Task",
          "zh-hk": "選擇任務",
          "zh-cn": "选择任务",
          desc: {
            en: "Please select a outbound task",
            "zh-hk": "請選擇出庫任務:",
            "zh-cn": "请选择出库任务:",
          },
        },
        scanLocation: {
          en: "Scan Location",
          "zh-hk": "掃描庫位",
          "zh-cn": "扫描库位",
          desc: {
            en: "Please scan the location code",
            "zh-hk": "請掃描庫位編號:",
            "zh-cn": "请扫描库位编号:",
          },
        },
        scanItem: {
          en: "Scan Item",
          "zh-hk": "掃描包裹",
          "zh-cn": "扫描包裹",
          desc: {
            en: "Please scan the item code",
            "zh-hk": "請掃描包裹編號:",
            "zh-cn": "请扫描包裹编号:",
          },
        },
      },
      selectTaskFailed: {
        "zh-hk": "選擇出庫任務失敗",
        "zh-cn": "选择出库任务失败",
        en: "Select Outbound Task Failed",
      },
      deselectTaskFailed: {
        en: "Deselect Task Failed",
        "zh-hk": "取消任務失敗",
        "zh-cn": "取消任务失败",
      },
      locationNotInclude: {
        "zh-hk": "所選的出庫任務內不包含此庫位的貨品",
        "zh-cn": "所选的出库任务內不包含此库位的货品",
        en: "No Outbound task item found in location ",
      },
    },
    palletize: {
      success: {
        "zh-hk": "貨物成功裝盤",
        "zh-cn": "货物成功装盘",
        en: "Item Palletized Successfully",
      },
      fail: {
        "zh-hk": "貨物裝盤失敗",
        "zh-cn": "货物装盘失败",
        en: "Palletize Failed",
      },
      steps: {
        scanPallet: {
          en: "Scan Pallet",
          "zh-hk": "掃描卡板",
          "zh-cn": "扫描栈板",
          desc: {
            en: "Please scan the pallet code",
            "zh-hk": "請掃描卡板編號:",
            "zh-cn": "请扫描栈板编号:",
          },
        },
        scanBox: {
          en: "Scan Logistic Box",
          "zh-hk": "掃描物流箱",
          "zh-cn": "扫描物流箱",
          desc: {
            en: "Please scan the logistic box code",
            "zh-hk": "請掃描物流箱編號:",
            "zh-cn": "请扫描物流箱编号:",
          },
        },
      },
    },
    departure: {
      success: {
        "zh-hk": "成功完成出庫",
        "zh-cn": "成功完成出库",
        en: "Departed Successfully",
      },
      fail: {
        "zh-hk": "出庫失敗",
        "zh-cn": "出库失败",
        en: "Departure Failed",
      },
    },
  },
  logout: {
    confirm: {
      en: "Are you sure you want to log out?",
      "zh-hk": "你確定要登出嗎？",
      "zh-cn": "你确定要登出吗？",
    },
  },
  inventory: {
    put: {
      steps: {
        scanLocation: {
          en: "Scan Location",
          "zh-hk": "輸入庫位",
          "zh-cn": "输入库位",
          desc: {
            en: "Please enter the location code:",
            "zh-hk": "請輸入庫位編號:",
            "zh-cn": "请输入库位编号:",
          },
        },
        scanItem: {
          en: "Scan Item",
          "zh-hk": "輸入條碼",
          "zh-cn": "输入条码",
          desc: {
            en: "Please enter the item code:",
            "zh-hk": "請輸入貨品條碼:",
            "zh-cn": "请输入货品条码:",
          },
        },
        listResult: {
          en: "Confirm Item",
          "zh-hk": "確認貨品",
          "zh-cn": "确认货品",
          desc: {
            en: "Search Result:",
            "zh-hk": "搜尋結果:",
            "zh-cn": "搜索结果:",
          },
        },
        confirmItem: {
          en: "Confirm Item",
          "zh-hk": "確認貨品",
          "zh-cn": "确认货品",
          desc: {
            en: "Please select the item:",
            "zh-hk": "請選擇貨品:",
            "zh-cn": "请选择货品:",
          },
        },
      },
      success: {
        en: "Put Item Success",
        "zh-hk": "成功放置貨品",
        "zh-cn": "成功放置货品",
      },
    },
    get: {
      steps: {
        scanLocation: {
          en: "Scan Location",
          "zh-hk": "輸入庫位",
          "zh-cn": "输入库位",
          desc: {
            en: "Please enter the location code:",
            "zh-hk": "請輸入庫位編號:",
            "zh-cn": "请输入库位编号:",
          },
        },
        scanItem: {
          en: "Scan Item",
          "zh-hk": "輸入條碼",
          "zh-cn": "输入条码",
          desc: {
            en: "Please enter the item code:",
            "zh-hk": "請輸入貨品條碼:",
            "zh-cn": "请输入货品条码:",
          },
        },
        listResult: {
          en: "Confirm Item",
          "zh-hk": "確認貨品",
          "zh-cn": "确认货品",
          desc: {
            en: "Search Result:",
            "zh-hk": "搜尋結果:",
            "zh-cn": "搜索结果:",
          },
        },
        confirmItem: {
          en: "Confirm Item",
          "zh-hk": "確認貨品",
          "zh-cn": "确认货品",
          desc: {
            en: "Please select the item:",
            "zh-hk": "請選擇貨品:",
            "zh-cn": "请选择货品:",
          },
        },
      },
      success: {
        en: "Get Item Success",
        "zh-hk": "成功提取貨品",
        "zh-cn": "成功提取货品",
      },
    },
    check: {
      steps: {
        scanItem: {
          en: "Scan Item",
          "zh-hk": "輸入貨品條碼",
          "zh-cn": "输入货品条码",
          desc: {
            en: "Please enter the item code:",
            "zh-hk": "請輸入貨品條碼:",
            "zh-cn": "请输入货品条码:",
          },
        },
        listResult: {
          en: "Confirm Item",
          "zh-hk": "確認貨品",
          "zh-cn": "确认货品",
          desc: {
            en: "Search Result:",
            "zh-hk": "搜尋結果:",
            "zh-cn": "搜索结果:",
          },
        },
      },
      fail: {
        en: "Inventory not found",
        "zh-hk": "未能找到庫存",
        "zh-cn": "未能找到库存",
      },
      no_result: {
        en: "No result found",
        "zh-hk": "沒有找到任何匹配項目",
        "zh-cn": "没有找到任何匹配项目",
      },
    },
  },
  location: {
    check: {
      steps: {
        scanLocation: {
          en: "Scan Location",
          "zh-hk": "輸入庫位",
          "zh-cn": "输入库位",
          desc: {
            en: "Please enter the location code:",
            "zh-hk": "請輸入庫位編號:",
            "zh-cn": "请输入库位编号:",
          },
        },
        listResult: {
          en: "Confirm Location",
          "zh-hk": "確認庫位",
          "zh-cn": "确认库位",
          desc: {
            en: "Search Result:",
            "zh-hk": "搜尋結果:",
            "zh-cn": "搜索结果:",
          },
        },
      },
    },
  },
  common: {
    sysError: {
      en: "System Error",
      "zh-hk": "系統錯誤",
      "zh-cn": "系统错误",
    },
    noWarehouse: {
      en: "Please select a warehouse",
      "zh-hk": "請選擇倉庫",
      "zh-cn": "请选择仓库",
    },
    search_item_code: {
      en: "Search Item Code",
      "zh-hk": "輸入貨品編號",
      "zh-cn": "输入货品编号",
    },
    no_item_found: {
      en: "No item found",
      "zh-hk": "沒有找到貨品",
      "zh-cn": "没有找到货品",
    },
    search_location_code: {
      en: "Search Location Code",
      "zh-hk": "輸入庫位編號",
      "zh-cn": "输入库位编号",
    },
    no_location: {
      en: "Location not found",
      "zh-hk": "找不到庫位",
      "zh-cn": "找不到库位",
    },
    search_pallet_code: {
      en: "Search Pallet Code",
      "zh-hk": "輸入卡板編號",
      "zh-cn": "输入栈板编号",
    },
    search_box_code: {
      en: "Search Logistic Box Code",
      "zh-hk": "輸入物流箱編號",
      "zh-cn": "输入物流箱编号",
    },
    no_more_data: {
      en: "No more data",
      "zh-hk": "沒有更多資料",
      "zh-cn": "没有更多数据",
    },
  },
};
