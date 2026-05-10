"use client";

import PageLayout from "@/components/layout/page-layout";
import {
  m_cards,
  m_checkbox,
  m_custom,
  m_hr,
  m_icon,
  m_plain,
  m_select,
  m_select_card,
  m_split,
  m_tab,
  m_table,
  m_text,
} from "@/components/modal/custom-modal-item";
import { get_request, post_request } from "@/lib/httpRequest";
import { cn } from "@/lib/utils";
import { Alert, pushAlert } from "@/types/Utils";
import {
  IconCheck,
  IconCubePlus,
  IconPackage,
  IconSearch,
  IconTrash,
} from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

export default function Page() {
  const t = useTranslations();
  const [boxes, setBoxes] = useState<any[]>([]);
  const [boxPrefix, setBoxPrefix] = useState("");
  const [orderItems, setOrderItems] = useState<any[]>([]);
  const [boxItemMap, setBoxItemMap] = useState<{ [key: string]: any[] }>({});

  let setCustomContent: any;
  const formData = useRef<any>();
  const alerts = useRef<any>(() => {});
  const setFormData = useRef<any>(() => {});

  const setFormDataByKeys = (value: any) => {
    setFormData.current(value);
  };

  const pushAlert = (a: Alert) => {
    alerts?.current(a);
  };

  const init = async () => {};

  const actions = {
    searchScanCode: (getModalDataByKey: any) => {
      const scanCode = getModalDataByKey("scanCode");
      if (!scanCode || scanCode.trim() === "") {
        return;
      }

      const mode = getModalDataByKey("mode");
      if (mode == "orderItems") {
        // displa order items
        const filteredOrderItem = orderItems.filter(
          (a) => a.trackingNo == scanCode || a.orderId == scanCode
        );

        if (filteredOrderItem.length == 0) {
          pushAlert({ type: "error", message: "No items found" });
          return;
        }
        if (filteredOrderItem.length > 1) {
          pushAlert({ type: "error", message: "Multiple items found" });
          return;
        }

        const foundOrderItem = filteredOrderItem[0];
        if (foundOrderItem) {
          // if box selected, add item to box
          const selectedBox = getModalDataByKey("boxes");
          if (!selectedBox) {
            pushAlert({ type: "error", message: "Please select box" });
            return;
          }

          const boxItems = getModalDataByKey("boxItems");
          if (boxItems?.find((a: any) => a.orderId == foundOrderItem.orderId)) {
            return;
          }

          let scanned = false;
          Object.entries(boxItemMap).forEach(([, items]) => {
            items.map((i) => {
              if (i.orderId == foundOrderItem.orderId) {
                scanned = true;
              }
            });
          });

          if (scanned) {
            pushAlert({ type: "error", message: "Item already scanned" });
            return;
          }

          setFormDataByKeys({
            scanCode: "",
            boxItems: [...boxItems, foundOrderItem],
          });

          // set packing item
          post_request("/api/wms/outbound/pack/packItem", {
            selectedBox,
            orderId: foundOrderItem.orderId,
          })
            .then(async (res) => {
              if (res.status != 200) {
                const json = await res.json();
                setFormDataByKeys({
                  boxItems: [...boxItems],
                });
                alert(json.message);
                return;
              }
              setBoxItemMap((prev) => {
                const boxItemMap = { ...prev };
                if (!boxItemMap[selectedBox]) {
                  boxItemMap[selectedBox] = [];
                }
                boxItemMap[selectedBox].push(foundOrderItem);
                return boxItemMap;
              });
            })
            .catch((error: any) => {
              setFormDataByKeys({
                boxItems: [...boxItems],
              });
              alert(error.message);
            });
        }
      } else {
        setFormDataByKeys({
          outboundBoxs: [],
        });
        setBoxes([]);
        get_request("/api/wms/outbound/pack/search", {
          scanCode,
        }).then(async (data: any) => {
          const json = await data.json();
          setBoxPrefix("");
          setFormDataByKeys({
            boxItems: [],
            outboundBoxs: [],
            outboundRequests: json?.data.map((a: any) => {
              return {
                ...a,
                itemCount: a.items.length,
              };
            }),
          });
        });
      }
    },

    selectOutboundRequest: (getModalDataByKey: any) => {
      const selectedOutboundRequest = getModalDataByKey(
        "outboundRequests"
      ).find((item: any) => item.isDefault === true);

      if (selectedOutboundRequest) {
        setOrderItems(selectedOutboundRequest.items);
        setFormDataByKeys({
          boxes: "",
          selectedOutboundId: selectedOutboundRequest.orderId,
          mode: "orderItems",
          scanCode: "",
          outboundBoxs: selectedOutboundRequest.items,
          boxItems: [],
        });
        setBoxPrefix("B" + selectedOutboundRequest.orderId.slice(1));
        get_request("/api/wms/outbound/pack/packedItem", {
          orderId: selectedOutboundRequest.orderId,
        }).then(async (data: any) => {
          const json = await data.json();
          const boxes = json.data.map((item: any) => {
            return {
              value: item.boxCode,
              label: item.boxCode,
            };
          });
          setBoxes(boxes);

          setBoxItemMap(
            json.data.reduce((acc: any, item: any) => {
              acc[item.boxCode] = item.items;
              return acc;
            }, {})
          );
        });

        // focus scanCode input
        setTimeout(() => {
          const scanCodeInput = document.getElementById("scanCode");
          if (scanCodeInput) {
            scanCodeInput.focus();
          }
        }, 100);
      }
    },

    printLabel: async (data: any) => {
      post_request("/api/wms/outbound/pack/finish", data).then(
        async (res: any) => {
          const json = await res.json();
          const uuid = "print-" + new Date().getTime();

          // set local storage
          localStorage.setItem(uuid, JSON.stringify(json.data));
          window.open("/outbound/label" + "?uuid=" + uuid); // popup print window
        }
      );
    },

    emptyBox: (getModalDataByKey: any, setData: any) => {
      const selectedBox = getModalDataByKey("boxes");
      if (!selectedBox || selectedBox.trim() === "") {
        return;
      }
      if (confirm(t("pack.page.confirm_emptyBox"))) {
        post_request("/api/wms/outbound/pack/emptyBox", {
          selectedBox,
        })
          .then(async (res) => {
            if (res.status != 200) {
              const json = await res.json();
              alert(json.message);
              return;
            }

            const json = await res.json();
            if (json.status != 200) {
              pushAlert({ type: "error", message: json.message });
              return;
            }

            setFormDataByKeys({ boxItems: [] });
            setBoxItemMap({
              ...boxItemMap,
              [selectedBox]: [],
            });
          })
          .catch((error: any) => {
            alert(error.message);
          });
      }
    },

    newBox: () => {
      // to do : use redis to get box sn
      if (boxPrefix === "") {
        return;
      }

      const maxBoxNo = parseInt(process.env.NEXT_PUBLIC_MAX_BOX_NO || "10");
      if (boxes.length >= maxBoxNo) {
        pushAlert({
          type: "error",
          message: t("pack.page.maxBox", { maxBoxNo }),
        });
        return;
      }
      let boxNo = boxPrefix + "-";
      for (let i = 1; i <= 99; i++) {
        const tempboxNo = boxNo + i.toString().padStart(2, "0");
        if (!boxes.find((box: any) => box.value === tempboxNo)) {
          boxNo = tempboxNo;
          break;
        }
      }

      setBoxes([...boxes, { value: boxNo, label: boxNo }]);
      setBoxItemMap((prev) => {
        const boxItemMap = { ...prev };
        boxItemMap[boxNo] = [];
        return boxItemMap;
      });
      setFormDataByKeys({ boxes: boxNo, boxItems: [] });
    },

    reloadScannedBoxs: () => {
      let scanned: any = {};
      Object.entries(boxItemMap).forEach(([, items]) => {
        items.map((i) => {
          scanned["scanned_" + i.orderId] = (
            <IconCheck size={16} color="#00FF00" />
          );
        });
      });
      if (setCustomContent) {
        setCustomContent(scanned);
      }
    },
  };

  useEffect(() => {
    actions.reloadScannedBoxs();
  }, [boxItemMap]);

  const form = {
    id: "form_pack",
    fields: [
      m_split(
        "",
        "splits",
        [
          {
            fields: [
              m_text("", "scanCode", {
                id: "scanCode",
                placeholder: t("pack.page.scanCode"),
                className: "col-span-2 mb-[5px]",
                icon: <IconSearch size={16} />,
                onSubmit: (getModalDataByKey: any) => {
                  actions.searchScanCode(getModalDataByKey);
                },
              }),

              m_tab(
                "",
                "mode",
                [
                  {
                    className: " ",
                    text: t("pack.page.selectOrder"),
                    value: "selectOrder",
                    fields: [
                      m_select_card("", "outboundRequests", {
                        fields: [
                          m_plain("", "contactPerson", {
                            className: "font-bold",
                          }),
                          m_plain("", "itemCount", {
                            className:
                              "bg-gray-800 text-white rounded-full min-w-[25px] ml-auto",
                            textClassName:
                              "items-center justify-center text-sm",
                          }),
                          m_plain("", "fullAddress", {
                            className: "col-span-2 mb-3",
                          }),
                        ],
                        is_readonly: true,
                        className: "col-span-2 mb-3 ",
                        cardClassName: "pt-0",
                        is_expanded: true,
                        onClick: actions.selectOutboundRequest,
                      }),
                    ],
                  },
                  {
                    text: t("pack.page.orderItems"),
                    value: "orderItems",
                    fields: [
                      m_table("", "outboundBoxs", {
                        className: "col-span-2 mb-3",
                        columns: [
                          m_text(t("inbound.fields.orderId"), "orderId"),
                          m_text(t("inbound.fields.trackingNo"), "trackingNo"),
                          m_custom("", "scanned", {
                            contentId: (item: any) => {
                              return "scanned_" + item.orderId;
                            },
                          }),
                        ],
                        is_readonly: true,
                        options: {
                          expanded: true,
                          render: (setter: any) => {
                            setCustomContent = setter;
                          },
                        },
                      }),
                    ],
                    className: "pl-2",
                  },
                ],
                {
                  className: "col-span-2 mt-[20px] mb-3 divide-x gap-2 ",
                }
              ),
            ],
          },
          {
            fields: [
              m_select("", "boxes", boxes, {
                l_side: (
                  <div title={t("pack.page.selectBox")}>
                    <IconPackage size={24} stroke={1} />
                  </div>
                ),
                l_className: "mr-2",
                onChange: (
                  getModalDataByKey: any,
                  setDataSet: any,
                  value: any,
                  pushAlert: pushAlert
                ) => {
                  if (!value || value.trim() === "") {
                    return;
                  }
                  const boxItems = boxItemMap[value]?.map((item: any) => {
                    return {
                      orderId: item.orderId,
                      trackingNo: item.trackingNo,
                    };
                  });
                  setDataSet({
                    boxes: value,
                    boxItems,
                  });
                },
              }),
              m_split(
                "",
                "tool",
                [
                  {
                    fields: [
                      m_icon(t("pack.page.newBox"), "newBox", {
                        className:
                          "my-2 col-span-2 ml-auto opacity-50 hover:opacity-100",
                        icon: <IconCubePlus size={18} />,
                        onClick: actions.newBox,
                      }),
                    ],
                  },
                  {
                    fields: [
                      m_icon(t("pack.page.emptyBox"), "emptyBox", {
                        className:
                          "my-2 col-span-2 ml-auto opacity-50 hover:opacity-100",
                        icon: <IconTrash size={18} color="#FF0000" />,
                        onClick: (getModalDataByKey: any, setData: any) => {
                          actions.emptyBox(getModalDataByKey, setData);
                        },
                      }),
                    ],
                  },
                ],
                {
                  className: "flex gap-x-4 px-1 w-fit ",
                }
              ),
              m_hr(),

              m_table(t("pack.page.scannedItems"), "boxItems", {
                className:
                  "col-span-2 mb-3 min-h-[calc(100vh-380px)] scrollbar",
                columns: [
                  m_text(t("inbound.fields.orderId"), "orderId"),
                  m_text(t("inbound.fields.trackingNo"), "trackingNo"),
                ],
                is_readonly: true,
                options: {
                  expanded: true,
                },
              }),
            ],
            className: "pl-2",
          },
        ],
        { className: "col-span-2 divide-x gap-2 pb-0" }
      ),
    ],
    buttons: [
      // {
      //   text: t("button.update"),
      //   actions: ["PUT:/api/wms/account", "reload"],
      // },
    ],
    options: {
      //  tab: "horizontal",
    },
  };

  // modal
  const modalPrint = {
    id: "modal_print",
    title: t("pack.modal.print.title"),
    description: t("pack.modal.print.description"),
    fields: [
      // m_alert("aaa"),
      // m_multiselect(t("pack.page.selectBox"), "printBoxs", boxes),
      m_cards(t("pack.page.boxDetail"), "boxes", {
        className: "col-span-2",
        fields: [
          m_text(t("pack.page.boxNo"), "boxNo", {
            is_readonly: true,
          }),
          m_checkbox(t("pack.modal.print.title"), "isPrint"),
          m_text(t("outbound.fields.width"), "width"),
          m_text(t("outbound.fields.height"), "height"),
          m_text(t("outbound.fields.length"), "length"),
          m_text(t("outbound.fields.weight"), "weight"),
        ],
        is_freeze_count: true,
        is_expanded: true,
      }),
    ],
    buttons: [
      {
        text: t("button.print"),
        className: "bg-blue-500 text-white hover:bg-blue-600",
        actions: [actions.printLabel],
      },
    ],
    default: {
      boxes: boxes.map((box: any) => {
        return {
          boxNo: box.value,
          isPrint: true,
          width: "",
          height: "",
          length: "",
          weight: "",
        };
      }),
    },
  };

  const props = {
    title: "pack.page.title",
    description: "pack.page.description",
    path: [
      { name: "menu.outbound", href: "#" },
      { name: "menu.outbound_pack", href: "#" },
    ],
    confirm: [modalPrint],
    modals: [modalPrint],
    toolbar: [
      {
        type: "button",
        text: t("button.done"),
        modal: "modal_print",
        api: {
          url: "/api/wms/outbound/pack/getBoxDetail",
          data: () => {
            return { orderId: formData.current?.selectedOutboundId };
          },
        },
      },
    ],
    form,
    init,
    default: {},
    formData,
    setFormData,
    alerts,
  };
  return (
    <>
      <div className={cn("flex justify-center items-center h-screen")}>
        <PageLayout {...props}></PageLayout>;
      </div>
    </>
  );
}
