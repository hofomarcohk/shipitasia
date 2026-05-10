"use client";

import { fetchGet, fetchUser } from "@/app/actions/getter";
import { callSelectWarehouse } from "@/components/helpers/common-callback";
import PdaPageLayout from "@/components/pda-page-layout";
import PdaPageStepperLayout from "@/components/pda-page-stepper";
import PdaPageTitleLayout from "@/components/pda-page-title";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePdaMsg } from "@/context/pdaMsg";
import { utils } from "@/cst/utils";
import { cn } from "@/lib/utils";
import { PdaUser } from "@/types/Pda";
import { IconDeviceIpadHorizontalSearch, IconX } from "@tabler/icons-react";
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
      name: "search-item",
      title: t("pda.inventory.check.steps.scanItem.title"),
      description: t("pda.inventory.check.steps.scanItem.desc"),
    },
    {
      name: "list-result",
      title: t("pda.inventory.check.steps.listResult.title"),
      description: t("pda.inventory.check.steps.listResult.desc"),
    },
  ];

  const [step, setStep] = useState(steps[0].name);
  const [, setUser] = useState<PdaUser>();
  const [langCode, setLangCode] = useState("en");
  const [searchItemCode, setSearchItemCode] = useState("");
  const [inventoryList, setInventoryList] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const pageSize = utils.PDA_PAGE_SIZE;

  const checkUserWarehouse = async () => {
    const res = await fetchUser(setUser);
    if (!res || !res.data.warehouseCode || res.data.warehouseCode === "") {
      pdaMsg("error", t("pda.common.noWarehouse"), callSelectWarehouse());
    }
  };
  const init = async () => {
    await checkUserWarehouse();
    (document.querySelector("#location-code") as HTMLInputElement)?.focus();
  };

  const handleInventorySearch = async () => {
    if (searchItemCode === "") {
      return;
    }
    const itemCode = searchItemCode.trim();
    const json = await fetchGet(
      "/api/wms/pda/warehouse/inventory/check",
      { itemCode, page, pageSize },
      { set: setInventoryList }
    );

    setSearchItemCode("");

    if (json.status != 200) {
      pdaMsg("error", t("pda.common.sysError"), {
        message: json.message,
      });
      return;
    }
    if (page == 0 || json.data.results.length == 0) {
      pdaMsg("error", t("pda.inventory.check.fail"), {
        message: t("pda.inventory.check.no_result"),
      });
      return;
    }

    setStep("list-result");
  };

  useEffect(() => {
    init();
  }, []);

  return (
    <PdaPageLayout {...prop}>
      <PdaPageTitleLayout
        icon={<IconDeviceIpadHorizontalSearch size={20} stroke={1} />}
        title={t("pdaMenu.inventory_check")}
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
                    "p-4 w-full border-b-4 border-gray-100 dark:border-bottom-gray-900 flex justify-between items-center gap-4"
                  )}
                >
                  <div className="w-full">
                    <div className="flex justify-between w-full">
                      <div className="">{item.to?.contactPerson}</div>
                      <Badge className=" font-bold ">{item.locationCode}</Badge>
                    </div>

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
        {step === "search-item" && (
          <div className="">
            <div className="px-4 py-2 relative">
              {searchItemCode && (
                <div
                  className="absolute right-6 top-5 h-4 w-4 text-muted-foreground cursor-pointer"
                  onClick={() => {
                    setSearchItemCode("");
                  }}
                >
                  <IconX stroke={1} size={16} />
                </div>
              )}
              <Input
                className="w-full "
                placeholder={t("pda.common.search_item_code")}
                id="searchCode"
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
        {step === "list-result" && (
          <div className="w-full p-4 flex justify-center items-center gap-4">
            <Button
              className="w-full"
              onClick={() => {
                setStep("search-item");
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
