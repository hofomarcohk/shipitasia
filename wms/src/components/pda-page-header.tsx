"use client";

import { get_request } from "@/lib/httpRequest";
import { IconHome, IconUserCircle } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

export default function PdaPageHeaderLayout() {
  const [user, setUser] = useState({
    firstName: "",
    lastName: "",
    email: "",
    profilePic: "",
    warehouseCode: "",
  });
  const t = useTranslations();
  useEffect(() => {
    get_request("/api/wms/account").then((response) => {
      response.json().then((json) => {
        if (json.data) {
          setUser(json.data);
        }
      });
    });
  }, []);

  return (
    <div className="w-full rounded-xl bg-gray-100 dark:bg-gray-900 p-4 flex gap-4 justify-between">
      <div className="flex justify-start items-center w-1/2">
        <div className="p-1">
          <IconUserCircle size={36} stroke={1} />
        </div>
        <div>
          <div className="text-[12px] opacity-80">{t("pda.staff")}</div>
          <div className="font-bold">{user.firstName}</div>
        </div>
      </div>
      <div className="flex justify-start items-center w-1/2">
        <div className="p-1">
          <IconHome size={24} stroke={1} />
        </div>
        <div>
          <div className="text-[12px] opacity-80">{t("pda.warehouse")}</div>
          <div className="font-bold">
            {user.warehouseCode && user.warehouseCode != ""
              ? user.warehouseCode
              : "N/A"}
          </div>
        </div>
      </div>
    </div>
  );
}
