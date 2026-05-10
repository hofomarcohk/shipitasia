"use client";

import { fetchGet, fetchPost, fetchUser } from "@/app/actions/getter";
import { callSelectWarehouse } from "@/components/helpers/common-callback";
import PdaPageLayout from "@/components/pda-page-layout";
import PdaPageStepperLayout from "@/components/pda-page-stepper";
import PdaPageTitleLayout from "@/components/pda-page-title";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePdaMsg } from "@/context/pdaMsg";
import { PdaUser } from "@/types/Pda";
import { IconChevronLeft, IconLayoutBoard, IconX } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

export default function Page(param: any) {
  const { pdaMsg } = usePdaMsg();

  const prop = {};
  const [user, setUser] = useState<PdaUser>();
  const [langCode, setLangCode] = useState("en");
  const t = useTranslations();
  const steps = [
    {
      name: "scan-pallet",
      title: t("pda.outbound.palletize.steps.scanPallet.title"),
      description: t("pda.outbound.palletize.steps.scanPallet.desc"),
    },
    {
      name: "scan-logistic-box",
      title: t("pda.outbound.palletize.steps.scanBox.title"),
      description: t("pda.outbound.palletize.steps.scanBox.desc"),
    },
  ];
  const [step, setStep] = useState(steps[0].name);

  // variables
  const [searchLocationCode, setSearchLocationCode] = useState("");
  const [palletCode, setPalletCode] = useState("");
  const [searchBoxNo, setSearchBoxNo] = useState("");

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

    setSearchLocationCode("");
    setStep("scan-logistic-box");
    setPalletCode(searchLocationCode);
  };

  const handleInventorySearch = async () => {
    if (searchBoxNo === "") {
      return;
    }
    const json = await fetchGet("/api/wms/pda/outbound/palletize/search-item", {
      boxNo: searchBoxNo,
    });

    if (json.status != 200) {
      pdaMsg("error", t("pda.common.sysError"), {
        message: json.message,
      });
      return;
    }

    if (json.data.results.length >= 1) {
      // handle take item
      handlePutItem(json.data.results[0].boxNo);
      return;
    }
  };

  const handlePutItem = async (boxNo: string) => {
    // handle take item
    const json = await fetchPost("/api/wms/pda/outbound/palletize/put-item", {
      palletCode,
      boxNo,
    });
    if (json.status != 200) {
      pdaMsg("error", t("pda.common.sysError"), {
        message: json.message,
      });
      return;
    }

    pdaMsg("success", t("pda.inventory.put.success"), {
      callback: () => {
        setStep("scan-logistic-box");
        setSearchBoxNo("");
      },
    });
    setSearchBoxNo("");
  };

  useEffect(() => {
    if (step === "scan-pallet") {
      (document.querySelector("#location-code") as HTMLInputElement)?.focus();
    }
    if (step === "scan-logistic-box") {
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
        icon={<IconLayoutBoard size={20} stroke={1} />}
        title={t("pdaMenu.palletize")}
      />

      <PdaPageStepperLayout
        steps={steps}
        currentStep={step}
        setStep={setStep}
      />

      {/* upper section  */}
      <div className="pb-[150px] scrollbar w-full">
        {step === "scan-logistic-box" && (
          <div className="">
            <div className="w-full p-2 flex justify-between items-center gap-2 text-sm">
              <div
                className="flex items-center cursor-pointer"
                onClick={() => {
                  setStep("scan-pallet");
                  setSearchBoxNo("");
                }}
              >
                <IconChevronLeft size={20} stroke={1} />
                {palletCode}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* bottom section  */}
      <div className="fixed left-0 bottom-0 pda-content w-full p-4 bg-white">
        {step === "scan-pallet" && (
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
                placeholder={t("pda.common.search_pallet_code")}
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

        {step === "scan-logistic-box" && (
          <div className="">
            <div className="px-4 py-2">
              <Input
                className="w-full "
                placeholder={t("pda.common.search_box_code")}
                id="item-code"
                value={searchBoxNo}
                onChange={(e) => setSearchBoxNo(e.target.value)}
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
      </div>
    </PdaPageLayout>
  );
}
