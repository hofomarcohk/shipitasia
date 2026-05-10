"use client";

import { fetchGet, fetchUser } from "@/app/actions/getter";
import { callSelectWarehouse } from "@/components/helpers/common-callback";
import PdaPageLayout from "@/components/pda-page-layout";
import PdaPageStepperLayout from "@/components/pda-page-stepper";
import PdaPageTitleLayout from "@/components/pda-page-title";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePdaMsg } from "@/context/pdaMsg";
import { cn } from "@/lib/utils";
import { PdaUser } from "@/types/Pda";
import { IconHomeSearch, IconX } from "@tabler/icons-react";
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
      name: "scan-location",
      title: t("pda.location.check.steps.scanLocation.title"),
      description: t("pda.location.check.steps.scanLocation.desc"),
    },
    {
      name: "list-result",
      title: t("pda.location.check.steps.listResult.title"),
      description: t("pda.location.check.steps.listResult.desc"),
    },
  ];
  const [step, setStep] = useState(steps[0].name);
  const [, setUser] = useState<PdaUser>();
  const [searchLocationCode, setSearchLocationCode] = useState("");
  const [inventoryList, setInventoryList] = useState<any[]>([]);

  const checkUserWarehouse = async () => {
    const res = await fetchUser(setUser);
    if (!res || !res.data.warehouseCode || res.data.warehouseCode === "") {
      pdaMsg("error", t("pda.common.noWarehouse"), callSelectWarehouse());
    }
  };

  const handleInventorySearch = async () => {
    if (searchLocationCode === "") {
      return;
    }
    const locationCode = searchLocationCode.trim();
    const json = await fetchGet(
      "/api/wms/pda/warehouse/location",
      { locationCode },
      { set: setInventoryList }
    );

    if (json.status != 200) {
      pdaMsg("error", t("pda.common.no_location"), {
        message: json.message,
      });
      return;
    }

    setStep("list-result");
  };

  const init = async () => {
    checkUserWarehouse();
    (document.querySelector("#location-code") as HTMLInputElement)?.focus();
  };

  useEffect(() => {
    init();
  }, []);

  return (
    <PdaPageLayout {...prop}>
      <PdaPageTitleLayout
        icon={<IconHomeSearch size={20} stroke={1} />}
        title={t("pdaMenu.location_check")}
      />

      <PdaPageStepperLayout
        steps={steps}
        currentStep={step}
        setStep={setStep}
      />

      {/* upper section  */}
      {step === "list-result" && (
        <div className="pb-[150px] scrollbar w-full">
          <div className="">
            {inventoryList.map((item: any, i) => {
              return (
                <div
                  key={i}
                  className={cn(
                    "p-4 w-full border-b-4 border-gray-100",
                    "dark:border-bottom-gray-900",
                    "flex justify-between items-center gap-4"
                  )}
                >
                  <div>
                    <div className="">{item.to?.contactPerson}</div>
                    <div className="">{item.trackingNo}</div>
                    <div className="text-[10px]">{item.orderId}</div>
                    <div className="text-[10px]">{item.to?.address || ""}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* bottom section  */}
      <div className="fixed left-0 bottom-0 pda-content w-full p-4 bg-white">
        {step === "scan-location" && (
          <div className="">
            <div className="px-4 py-2 relative">
              {searchLocationCode && (
                <div
                  className={cn(
                    "absolute right-6 top-5 h-4 w-4",
                    "text-muted-foreground cursor-pointer"
                  )}
                  onClick={() => {
                    setSearchLocationCode("");
                  }}
                >
                  <IconX stroke={1} size={16} />
                </div>
              )}
              <Input
                className="w-full "
                placeholder={t("pda.common.search_item_code")}
                id="searchCode"
                value={searchLocationCode}
                onChange={(e) => setSearchLocationCode(e.target.value)}
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
        {step === "list-result" && (
          <div className="w-full p-4 flex justify-center items-center gap-4">
            <Button
              className="w-full"
              onClick={() => {
                setStep("scan-location");
              }}
            >
              {t("button.confirm")}
            </Button>
          </div>
        )}
      </div>
    </PdaPageLayout>
  );
}
