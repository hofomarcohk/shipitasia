"use client";

import { fetchGet, fetchUser } from "@/app/actions/getter";
import { setActiveWarehouse } from "@/app/actions/setter";
import PdaPageLayout from "@/components/pda-page-layout";
import PdaPageTitleLayout from "@/components/pda-page-title";
import { cn } from "@/lib/utils";
import { Address } from "@/types/Address";
import { PdaUser } from "@/types/Pda";
import { OptionItemList } from "@/types/Utils";
import { IconCheck, IconHomeQuestion } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

type Warehouse = {
  address: Address;
  name: string;
  warehouseCode: string;
};

export default function Page(param: any) {
  const prop = {};
  const [, setUser] = useState<PdaUser>();
  const [langCode, setLangCode] = useState("en");

  const [countryList, setCountryList] = useState<OptionItemList>([]);
  const [activeWarehouseCode, setActiveWarehouseCode] = useState("");
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const t = useTranslations();

  const init = async () => {
    const response = await param.params;
    const lang = response.locale;
    setLangCode(lang);
    fetchGet("/api/wms/list/country", { lang }, { set: setCountryList });
    fetchGet("/api/wms/warehouse", { lang }, { set: setWarehouses });
  };

  const checkUserWarehouse = async () => {
    const res = await fetchUser(setUser);
    if (!res || !res.data.warehouseCode || res.data.warehouseCode === "") {
    } else {
      await setActiveWarehouseCode(res.data.warehouseCode);
    }
  };

  useEffect(() => {
    init();
    checkUserWarehouse();
  }, []);

  return (
    <PdaPageLayout {...prop}>
      <PdaPageTitleLayout
        icon={<IconHomeQuestion size={20} stroke={1} />}
        title={t("pdaMenu.warehouse_select")}
      />

      <div className="overflow-auto pda-content">
        <div
          className={cn(
            "p-4 w-full border-b-4 border-gray-100",
            "dark:border-bottom-gray-900",
            "flex justify-between items-center gap-4",
            "text-[18px] text-bold overflow-auto",
          )}
        >
          {t("pda.select_warehouse.desc")}
        </div>
        {warehouses.map((item) => {
          return (
            <div
              key={item.warehouseCode}
              onClick={async () => {
                await setActiveWarehouse(item.warehouseCode);
                window.location.href = window.location.href;
              }}
              className="p-4 w-full border-b-4 border-gray-100 dark:border-bottom-gray-900 flex justify-between items-center gap-4"
            >
              <div className="w-[100px]">{item.warehouseCode}</div>
              <div className="w-full">
                <div>
                  {countryList.find((c) => c.value === item.address.country)
                    ?.label || ""}
                </div>
                <div className="text-[10px]">{item.address.address}</div>
              </div>
              <div className="w-[30px]">
                {item.warehouseCode == activeWarehouseCode ? (
                  <IconCheck size={30} stroke={1} color="#1890ff" />
                ) : (
                  <></>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </PdaPageLayout>
  );
}
