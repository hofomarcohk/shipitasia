"use client";

import { fetchUser } from "@/app/actions/getter";
import { arriveInbound, createUnknownInbound } from "@/app/actions/setter";
import { callSelectWarehouse } from "@/components/helpers/common-callback";
import PdaPageLayout from "@/components/pda-page-layout";
import PdaPageStepperLayout from "@/components/pda-page-stepper";
import PdaPageTitleLayout from "@/components/pda-page-title";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePdaMsg } from "@/context/pdaMsg";

import { PdaUser } from "@/types/Pda";
import { IconClipboardCheck } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function Page(param: any) {
  const { pdaMsg } = usePdaMsg();
  const prop = {};
  const t = useTranslations();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<PdaUser>();
  const [langCode, setLangCode] = useState("en");
  const [isLoading, setIsLoading] = useState(false);
  const steps = [
    {
      name: "provide-details",
      title: t("pda.inbound.unknownInbound.steps.provideDetails.title"),
      description: t("pda.inbound.unknownInbound.steps.provideDetails.desc"),
    },
  ];
  const [step, setStep] = useState(steps[0].name);

  // variables
  const [addressCode, setAddressCode] = useState("");
  const [trackingNo, setTrackingNo] = useState("");
  const [warehouseCode, setWarehouseCode] = useState("");

  const init = async () => {
    const response = await param.params;
    setLangCode(response.locale);
    setTrackingNo(searchParams.get("code") || "");
  };

  const checkUserWarehouse = async () => {
    const res = await fetchUser(setUser);
    if (!res || !res.data.warehouseCode || res.data.warehouseCode === "") {
      pdaMsg("error", t("pda.common.noWarehouse"), callSelectWarehouse());
    }
    setWarehouseCode(res.data.warehouseCode);
  };

  const handleInbound = async () => {
    // search code
    setIsLoading(true);
    const json = await createUnknownInbound(
      user?.warehouseCode ?? "",
      addressCode,
      trackingNo,
    );
    if (json.status !== 200) {
      pdaMsg("error", json.message);
      setIsLoading(false);
      return;
    } else {
      if (!json.data.inbound.orderId) {
        pdaMsg("error", t("pda.common.no_item_found"));
        setIsLoading(false);
        return;
      }
      await handleArrive(json.data.inbound.orderId);
      setIsLoading(false);
      return;
    }
  };

  const handleArrive = async (orderId: string) => {
    // arrive
    if (orderId === "") {
      return;
    }
    const json = await arriveInbound(orderId);
    if (json.status !== 200) {
      pdaMsg("error", t("pda.inbound.receive.fail"), {
        message: json.message,
      });
      return;
    }
    pdaMsg("success", t("pda.inbound.receive.success"), {
      callback: () => {
        window.location.href = "/pda/inbound/arrive";
      },
      button: "button.confirm",
    });
  };

  useEffect(() => {
    if (step === "provide-details") {
      (document.querySelector("#addressCode") as HTMLInputElement)?.focus();
      setAddressCode("");
      setTrackingNo("");
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
        title={t("pdaMenu.createUnknownInbound")}
      />
      <PdaPageStepperLayout
        steps={steps}
        currentStep={step}
        setStep={setStep}
      />

      <div className="h-[calc(100vh-100px)] left-0 bottom-0 w-full overflow-auto  pda-content ">
        <>
          {step === "provide-details" && (
            <div className="absolute bottom-0 w-full p-4 ">
              <div className="px-4 py-2">
                <label className="bold text-sm">{t("utils.warehouse")}</label>
                <Input
                  className="w-full "
                  value={warehouseCode}
                  readOnly={true}
                />
              </div>
              <div className="px-4 py-2">
                <label className="bold text-sm">{t("utils.addressId")}</label>
                <Input
                  className="w-full "
                  placeholder={t("pda.inbound.unknownInbound.insertAddressId")}
                  id="addressCode"
                  value={addressCode}
                  onChange={(e) => setAddressCode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleInbound();
                  }}
                />
              </div>
              <div className="px-4 py-2">
                <label className="bold text-sm">
                  {t("inbound.fields.trackingNo")}
                </label>
                <Input
                  className="w-full "
                  placeholder={t("pda.common.search_item_code")}
                  id="searchCode"
                  value={trackingNo}
                  onChange={(e) => setTrackingNo(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleInbound();
                  }}
                />
              </div>
              <div className="w-full px-4 py-2 flex justify-center items-center gap-4">
                <Button className="w-full" onClick={handleInbound}>
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
