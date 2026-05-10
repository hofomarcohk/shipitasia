"use client";

import { fetchInboundRequestList, fetchUser } from "@/app/actions/getter";
import { arriveInbound } from "@/app/actions/setter";
import { callSelectWarehouse } from "@/components/helpers/common-callback";
import PdaPageLayout from "@/components/pda-page-layout";
import PdaPageStepperLayout from "@/components/pda-page-stepper";
import PdaPageTitleLayout from "@/components/pda-page-title";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePdaMsg } from "@/context/pdaMsg";

import { PdaUser } from "@/types/Pda";
import { IconCircleCheckFilled, IconClipboardCheck } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

interface InboundRequestList {
  trackingNo: string;
  orderId: string;
  destination: any;
}

export default function Page(param: any) {
  const { pdaMsg } = usePdaMsg();
  const prop = {};
  const t = useTranslations();

  const [user, setUser] = useState<PdaUser>();
  const [isLoading, setIsLoading] = useState(false);
  const [langCode, setLangCode] = useState("en");
  const steps = [
    {
      name: "search-item",
      title: t("pda.inbound.arrive.steps.searchItem.title"),
      description: t("pda.inbound.arrive.steps.searchItem.desc"),
    },
    {
      name: "list-result",
      title: t("pda.inbound.arrive.steps.listResult.title"),
      description: t("pda.inbound.arrive.steps.listResult.desc"),
    },
  ];
  const [step, setStep] = useState(steps[0].name);

  // variables
  const [searchCode, setSearchCode] = useState("");
  const [itemId, setItemId] = useState("");
  const [inboundRequestList, setInboundRequestList] = useState<
    InboundRequestList[]
  >([]);

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

  const handleSearch = async () => {
    // search code
    const json = await fetchInboundRequestList(setInboundRequestList, {
      scan: searchCode,
      warehouseCode: user?.warehouseCode,
      status: "pending",
      pageSize: 50,
    });

    if (json.status !== 200) {
      pdaMsg("error");
      return;
    } else {
      if (json.data.results.length == 0) {
        pdaMsg("error", t("pda.common.no_item_found"), {
          callback: () => {
            setIsLoading(true);
            window.location.href =
              "/pda/inbound/unknownInbound?code=" + searchCode;
          },
          button: "button.confirm",
        });
        return;
      }
      if (json.data.results.length == 1) {
        setItemId(json.data.results[0].orderId);
        handleArrive();
        return;
      }
    }
    setStep("list-result");
  };

  const handleArrive = async () => {
    // arrive
    if (itemId === "") {
      return;
    }
    const json = await arriveInbound(itemId);
    if (json.status !== 200) {
      pdaMsg("error", t("pda.inbound.receive.fail"), {
        message: json.message,
      });
      return;
    }
    pdaMsg("success", t("pda.inbound.receive.success"), {
      callback: () => {
        setStep("search-item");
      },
      button: "button.confirm",
    });
  };

  useEffect(() => {
    if (step === "search-item") {
      (document.querySelector("#searchCode") as HTMLInputElement)?.focus();
      setSearchCode("");
      setItemId("");
    }
  }, [step]);

  useEffect(() => {
    checkUserWarehouse();
  }, [langCode]);

  useEffect(() => {
    init();
    (document.querySelector("#location-code") as HTMLInputElement)?.focus(); // focus on input
  }, []);

  return (
    <PdaPageLayout {...prop} isLoading={isLoading}>
      <PdaPageTitleLayout
        icon={<IconClipboardCheck size={20} stroke={1} />}
        title={t("pdaMenu.arrive")}
      />
      <PdaPageStepperLayout
        steps={steps}
        currentStep={step}
        setStep={setStep}
      />

      <div className="h-[calc(100vh-100px)] left-0 bottom-0 w-full overflow-auto  pda-content ">
        <>
          {step === "search-item" && (
            <div className="absolute bottom-0 w-full p-4 ">
              <div className="px-4 py-2">
                <Input
                  className="w-full "
                  placeholder={t("pda.common.search_item_code")}
                  id="searchCode"
                  value={searchCode}
                  onChange={(e) => setSearchCode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSearch();
                  }}
                />
              </div>
              <div className="w-full px-4 py-2 flex justify-center items-center gap-4">
                <Button className="w-full" onClick={handleSearch}>
                  {t("button.search")}
                </Button>
              </div>
            </div>
          )}

          {step === "list-result" && (
            <div className="w-full h-[calc(100vh-100px)]">
              <div className="overflow-auto h-[calc(100vh-180px)] ">
                {inboundRequestList.map((item: any, i) => {
                  return (
                    <div
                      key={i}
                      onClick={() => {
                        setItemId(item.orderId);
                      }}
                      className={
                        "p-4 w-full border-b-4 border-gray-100 dark:border-bottom-gray-900 flex justify-between items-center gap-4" +
                        (item.orderId === itemId
                          ? " bg-gray-100 dark:bg-gray-900"
                          : "")
                      }
                    >
                      <div>
                        <div className="">{item.trackingNo}</div>
                        <div className="text-[10px]">{item.orderId}</div>
                        <div className="text-[10px]">
                          {item.destination?.address || ""}
                        </div>
                      </div>
                      <div className="w-[30px]">
                        {item.orderId == itemId ? (
                          <IconCircleCheckFilled
                            size={24}
                            stroke={1}
                            color=" #00a854"
                            className="opacity-80"
                          />
                        ) : (
                          <></>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="w-full p-4 flex justify-center items-center gap-4 bottom-0 absolute z-10 bg-white">
                <Button
                  className="w-full"
                  disabled={!itemId || itemId === ""}
                  onClick={() => {
                    handleArrive();
                  }}
                >
                  {t("button.confirm")}
                </Button>
              </div>
            </div>
          )}
        </>
      </div>
    </PdaPageLayout>
  );
}
