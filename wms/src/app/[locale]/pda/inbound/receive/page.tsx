"use client";

import {
  fetchInboundRequestList,
  fetchLocationList,
  fetchUser,
} from "@/app/actions/getter";
import { receiveInbound } from "@/app/actions/setter";
import { callSelectWarehouse } from "@/components/helpers/common-callback";
import PdaPageLayout from "@/components/pda-page-layout";
import PdaPageStepperLayout from "@/components/pda-page-stepper";
import PdaPageTitleLayout from "@/components/pda-page-title";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePdaMsg } from "@/context/pdaMsg";
import { PdaUser } from "@/types/Pda";
import {
  IconChevronLeft,
  IconChevronRight,
  IconPlus,
  IconTruckLoading,
} from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

export default function Page(param: any) {
  const { pdaMsg } = usePdaMsg();
  const t = useTranslations();

  const prop = {
    path: [{ name: "menu.home", href: "#" }],
  };
  const steps = [
    {
      name: "search-location",
      title: t("pda.inbound.receive.steps.scanLocation.title"),
      description: t("pda.inbound.receive.steps.scanLocation.desc"),
    },
    {
      name: "search-item",
      title: t("pda.inbound.receive.steps.scanItem.title"),
      description: t("pda.inbound.receive.steps.scanItem.desc"),
    },
  ];
  const [step, setStep] = useState(steps[0].name);
  const [user, setUser] = useState<PdaUser>();
  const [langCode, setLangCode] = useState("en");

  const [searchLocationCode, setSearchLocationCode] = useState("");
  const [searchItemCode, setSearchItemCode] = useState("");
  const [locationCode, setLocationCode] = useState("");
  const [receiveItems, setReceiveItems] = useState<any[]>([]);
  const [searchItemResult, setSearchItemResult] = useState<any[]>([]);
  const [, setInboundRequestList] = useState<any[]>([]);

  const init = async () => {
    const response = await param.params;
    setLangCode(response.locale);
  };

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
    setReceiveItems([]);
    const json = await fetchLocationList(setInboundRequestList, {
      locationCode: searchLocationCode,
      warehouseCode: user?.warehouseCode,
    });
    if (json.status !== 200) {
      pdaMsg("error", t("pda.common.no_location"));
      return;
    }
    if (json.data.results.length === 0) {
      pdaMsg("error", t("pda.common.no_location"));
      return;
    }

    setStep("search-item");
    setLocationCode(searchLocationCode);
    setSearchLocationCode("");
    setSearchItemCode("");
  };

  const handleItemSearch = async () => {
    // search code
    setSearchItemResult([]);
    if (searchItemCode === "") {
      return;
    }
    const json = await fetchInboundRequestList(setInboundRequestList, {
      scan: searchItemCode,
      warehouseCode: user?.warehouseCode,
      status: "arrived",
      xOrderId: receiveItems.map((item) => item.orderId),
    });
    setSearchItemCode("");

    if (json.status !== 200) {
      pdaMsg("error", t("pda.common.no_item_found"));
      return;
    }
    if (json.data.results.length === 0) {
      pdaMsg("error", t("pda.common.no_item_found"));
      return;
    }
    if (json.data.results.length === 1) {
      setReceiveItems([...receiveItems, json.data.results[0]]);
      return;
    }
    setSearchItemResult(json.data.results);
  };

  const handleReceive = async () => {
    // arrive
    if (receiveItems.length === 0) {
      return;
    }
    setSearchItemResult([]);
    const json = await receiveInbound(
      locationCode,
      receiveItems.map((item) => item.orderId),
    );
    if (json.status != 200) {
      pdaMsg("error", t("pda.inbound.receive.fail"), {
        message: json.message,
      });
      return;
    }
    setReceiveItems([]);
    pdaMsg("success", t("pda.inbound.receive.success"), {
      callback: () => {
        setStep("search-location");
      },
    });
  };

  useEffect(() => {
    if (step === "search-location") {
      setSearchLocationCode("");
      (document.querySelector("#location-code") as HTMLInputElement)?.focus();
    }
    if (step === "search-item") {
      setSearchItemCode("");
      (document.querySelector("#item-code") as HTMLInputElement)?.focus();
    }
  }, [step]);

  useEffect(() => {
    checkUserWarehouse();
  }, [langCode]);

  useEffect(() => {
    init();
    (document.querySelector("#location-code") as HTMLInputElement)?.focus();
  }, []);

  return (
    <PdaPageLayout {...prop}>
      <PdaPageTitleLayout
        icon={<IconTruckLoading size={20} stroke={1} />}
        title={t("pdaMenu.receive")}
      />
      <PdaPageStepperLayout
        steps={steps}
        currentStep={step}
        setStep={setStep}
      />

      {/* upper section  */}
      {step === "search-item" && (
        <div className="pb-[150px] scrollbar">
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

            <div
              className={
                "flex items-center gap-1 cursor-pointer " +
                (receiveItems.length === 0 ? " opacity-50" : "")
              }
              onClick={() => {
                handleReceive();
              }}
            >
              {t("button.next")}
              <Badge>{receiveItems.length}</Badge>
              <IconChevronRight size={20} stroke={1} />
            </div>
          </div>

          <div>
            {searchItemResult.length == 0 &&
              receiveItems &&
              receiveItems.length > 0 && (
                <div className="w-full px-4 py-2 bg-green-100 text-bold">
                  <h3>{t("pda.inbound.receive.selected_item")}</h3>
                </div>
              )}

            {searchItemResult.length == 0 &&
              receiveItems.map((item, i) => {
                return (
                  <div
                    key={i}
                    className="p-4 w-full border-b-4 border-gray-100 dark:border-bottom-gray-900 flex justify-between items-center gap-4"
                  >
                    <div className="">
                      <div>{item?.trackingNo || "--"}</div>
                      <div className="text-[10px]">{item?.orderId || "--"}</div>
                      <div className="text-[10px]">
                        {item?.destination?.address}
                      </div>
                    </div>
                  </div>
                );
              })}

            {searchItemResult && searchItemResult.length > 0 && (
              <div className="w-full px-4 py-2 bg-gray-100 text-bold">
                <h3>{t("pda.inbound.receive.pls_select_item")}</h3>
              </div>
            )}
            <>
              {searchItemResult.map((item, i) => {
                return (
                  <div
                    key={i}
                    className="p-4 w-full border-b-4 border-gray-100 dark:border-bottom-gray-900 flex justify-between items-center gap-4"
                  >
                    <div className="">
                      <div>{item?.trackingNo || "--"}</div>
                      <div className="text-[10px]">{item?.orderId || "--"}</div>
                      <div className="text-[10px]">
                        {item?.destination?.address}
                      </div>
                    </div>
                    <div className="">
                      <IconPlus
                        size={24}
                        stroke={1}
                        onClick={() => {
                          setReceiveItems([...receiveItems, item]);
                          setSearchItemResult([]);
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </>
          </div>
        </div>
      )}

      {/* bottom section  */}
      <div className="fixed left-0 bottom-0 pda-content w-full p-4 ">
        {step === "search-location" && (
          <>
            <div className="w-full p-1 mb-2">
              <Input
                className="w-full"
                placeholder={t("pda.common.search_location_code")}
                id="location-code"
                value={searchLocationCode}
                onChange={(e) => setSearchLocationCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleLocationSearch();
                }}
              />
            </div>
            <div className="w-full p-1">
              <Button className="w-full" onClick={handleLocationSearch}>
                {t("button.search")}
              </Button>
            </div>
          </>
        )}
        {step === "search-item" && (
          <div>
            <div className="w-full p-1 mb-2">
              <Input
                className="w-full"
                placeholder={t("pda.common.search_item_code")}
                id="item-code"
                value={searchItemCode}
                onChange={(e) => setSearchItemCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleItemSearch();
                }}
              />
            </div>
            <div className="w-full p-1">
              <Button className="w-full" onClick={handleItemSearch}>
                {t("button.search")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </PdaPageLayout>
  );
}
