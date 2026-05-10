"use client";

import { fetchGet, fetchPost, fetchUser } from "@/app/actions/getter";
import { callSelectWarehouse } from "@/components/helpers/common-callback";
import PdaPageLayout from "@/components/pda-page-layout";
import PdaPageStepperLayout from "@/components/pda-page-stepper";
import PdaPageTitleLayout from "@/components/pda-page-title";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { usePdaMsg } from "@/context/pdaMsg";
import { cn } from "@/lib/utils";
import { PdaUser } from "@/types/Pda";
import {
  IconChevronLeft,
  IconHttpGet,
  IconQrcode,
  IconScan,
  IconX,
} from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

export default function Page(param: any) {
  const t = useTranslations();
  const { pdaMsg } = usePdaMsg();

  const prop = {};
  const [user, setUser] = useState<PdaUser>();
  const [langCode, setLangCode] = useState("en");
  const steps = [
    {
      name: "search-location",
      title: t("pda.inventory.get.steps.scanLocation.title"),
      description: t("pda.inventory.get.steps.scanLocation.desc"),
    },
    {
      name: "search-item",
      title: t("pda.inventory.get.steps.scanItem.title"),
      description: t("pda.inventory.get.steps.scanItem.desc"),
    },
    {
      name: "confirm-item",
      title: t("pda.inventory.get.steps.confirmItem.title"),
      description: t("pda.inventory.get.steps.confirmItem.desc"),
    },
  ];
  const [step, setStep] = useState(steps[0].name);

  // variables
  const [searchLocationCode, setSearchLocationCode] = useState("");
  const [locationCode, setLocationCode] = useState("");
  const [searchItemCode, setSearchItemCode] = useState("");
  const [inventoryList, setInventoryList] = useState<any[]>([]);

  const [selectedOrderId, setSelectedOrderId] = useState("");

  const checkUserWarehouse = async () => {
    const res = await fetchUser(setUser);
    if (!res || !res.data.warehouseCode || res.data.warehouseCode === "") {
      pdaMsg("error", t("pda.common.noWarehouse"), callSelectWarehouse());
    }
  };

  const handleLocationSearch = async () => {
    if (searchLocationCode === "") {
      return;
    }

    const json = await fetchGet("/api/wms/warehouse/location", {
      warehouseCode: user?.warehouseCode,
      locationCode: searchLocationCode,
    });

    setSearchLocationCode("");

    if (json.status != 200) {
      pdaMsg("error", t("pda.common.sysError"), {
        message: json.message,
      });
      return;
    }
    if (json.data.results.length == 0) {
      pdaMsg("error", t("pda.common.no_location"));
      return;
    }

    setStep("search-item");
    setLocationCode(searchLocationCode);
  };

  const handleInventorySearch = async () => {
    if (searchItemCode === "") {
      return;
    }

    const json = await fetchGet("/api/wms/pda/warehouse/inventory/take-item", {
      locationCode: locationCode,
      itemCode: searchItemCode,
    });

    if (json.status != 200) {
      pdaMsg("error", t("pda.common.sysError"), {
        message: json.message,
      });
    }

    if (json.data.results.length == 0) {
      pdaMsg("error", t("pda.common.no_item_found"));
      return;
    }

    if (json.data.results.length > 1) {
      setInventoryList(json.data.results);
      setStep("confirm-item");
      return;
    }

    if (json.data.results.length == 1) {
      // handle take item
      handleTakeItem(json.data.results[0].orderId);
      return;
    }
  };

  const handleTakeItem = async (orderId: string) => {
    // handle take item
    const json = await fetchPost("/api/wms/pda/warehouse/inventory/take-item", {
      locationCode,
      orderId,
    });
    if (json.status != 200) {
      pdaMsg("error", t("pda.common.sysError"), {
        message: json.message,
      });
      return;
    }

    pdaMsg("success", t("pda.inventory.get.success"), {
      callback: () => {
        setStep("search-item");
        setSearchItemCode("");
      },
    });
    setSearchItemCode("");
  };

  useEffect(() => {
    if (step === "search-location") {
      (document.querySelector("#location-code") as HTMLInputElement)?.focus();
    }
    if (step === "search-item") {
      (document.querySelector("#item-code") as HTMLInputElement)?.focus();
    }
    if (step === "confirm-item") {
      setSelectedOrderId("");
    }
  }, [step]);

  const init = async () => {
    checkUserWarehouse();
    const response = await param.params;
    setLangCode(response.locale);
    (document.querySelector("#location-code") as HTMLInputElement)?.focus();
  };

  useEffect(() => {
    init();
  }, []);

  return (
    <PdaPageLayout {...prop}>
      <PdaPageTitleLayout
        icon={<IconHttpGet size={20} stroke={1} />}
        title={t("pdaMenu.inventory_take")}
      />

      <PdaPageStepperLayout
        steps={steps}
        currentStep={step}
        setStep={setStep}
      />

      {/* upper section  */}
      <div className="pb-[150px] scrollbar w-full">
        {step === "search-item" && (
          <div className="">
            <div className="w-full p-2 flex justify-between items-center gap-2 text-sm">
              <div
                className="flex items-center cursor-pointer"
                onClick={() => {
                  setStep("search-location");
                  setSearchItemCode("");
                }}
              >
                <IconChevronLeft size={20} stroke={1} />
                {locationCode}
              </div>
            </div>
          </div>
        )}

        {step === "confirm-item" && (
          <div className="">
            <div className="w-full p-2 flex justify-between items-center gap-2 text-sm">
              <div
                className="flex items-center cursor-pointer"
                onClick={() => {
                  setStep("search-location");
                  setSearchItemCode("");
                }}
              >
                <IconChevronLeft size={20} stroke={1} />
                {locationCode}
              </div>
            </div>
            {inventoryList.map((item: any, i) => {
              return (
                <div
                  key={i}
                  className={cn(
                    "p-4 w-full border-b-4 border-gray-100 dark:border-bottom-gray-900 flex justify-between items-center gap-4",
                    item.orderId == selectedOrderId && "bg-gray-100",
                  )}
                  onClick={() => {
                    setSelectedOrderId(item.orderId);
                  }}
                >
                  <div className={cn("w-full")}>
                    <div className="flex items-end justify-between gap-2">
                      <div className="">{item.to?.contactPerson}</div>
                      <div className="text-xs">{item.to?.mobile}</div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex justify-start items-center gap-1">
                        <IconScan size={12} stroke={1} />
                        <div className="text-sm">{item.trackingNo}</div>
                      </div>
                      <Separator orientation="vertical" />
                      <div className=" flex justify-end items-center gap-1">
                        <IconQrcode size={12} stroke={1} />
                        <div className="text-sm">{item.orderId}</div>
                      </div>
                    </div>
                    <div className="text-[10px]">{item.to?.address || ""}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* bottom section  */}
      <div className="fixed left-0 bottom-0 pda-content w-full p-4 bg-white">
        {step === "search-location" && (
          <div className="">
            <div className="px-4 py-2 relative">
              {searchLocationCode && (
                <div
                  className="absolute right-6 top-5 h-4 w-4 text-muted-foreground cursor-pointer"
                  onClick={() => {
                    setSearchLocationCode("");
                  }}
                >
                  <IconX stroke={1} size={16} />
                </div>
              )}
              <Input
                className="w-full "
                placeholder={t("pda.common.search_location_code")}
                id="location-code"
                value={searchLocationCode}
                onChange={(e) => setSearchLocationCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleLocationSearch();
                }}
              />
            </div>
            <div className="w-full px-4 py-2 flex justify-center items-center gap-4">
              <Button className="w-full" onClick={handleLocationSearch}>
                {t("button.search")}
              </Button>
            </div>
          </div>
        )}

        {step === "search-item" && (
          <div className="">
            <div className="px-4 py-2">
              <Input
                className="w-full "
                placeholder={t("pda.common.search_item_code")}
                id="item-code"
                value={searchItemCode}
                onChange={(e) => setSearchItemCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleInventorySearch();
                }}
              />
            </div>
            <div className="w-full px-4 py-2 flex justify-center items-center gap-4">
              <Button className="w-full" onClick={handleInventorySearch}>
                {t("button.search")}
              </Button>
            </div>
          </div>
        )}

        {step === "confirm-item" && (
          <div className="">
            <div
              className={cn(
                "w-full px-4 py-2 flex justify-center items-center gap-4",
              )}
            >
              <Button
                className="w-full"
                disabled={selectedOrderId == ""}
                onClick={() => {
                  handleTakeItem(selectedOrderId);
                }}
              >
                {t("button.search")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </PdaPageLayout>
  );
}
