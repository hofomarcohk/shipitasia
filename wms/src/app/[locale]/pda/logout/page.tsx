"use client";

import PdaPageLayout from "@/components/pda-page-layout";
import PdaPageTitleLayout from "@/components/pda-page-title";
import { Button } from "@/components/ui/button";
import { get_request } from "@/lib/httpRequest";
import { IconLogout } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

export default function Page(param: any) {
  const [langCode, setLangCode] = useState("en");

  const prop = {
    path: [{ name: "menu.pda", href: "#" }],
  };

  const t = useTranslations();
  const init = async () => {
    const response = await param.params;
    setLangCode(response.locale);
  };

  useEffect(() => {
    init();
  }, []);

  return (
    <PdaPageLayout {...prop}>
      <PdaPageTitleLayout
        icon={<IconLogout size={20} stroke={1} />}
        title={t("pdaMenu.logout")}
      />

      <div className="flex flex-col justify-center pda-content h-[calc(100vh-40px)] px-4 ">
        <div className="p-4 w-full flex justify-center items-center gap-4 text-md text-bold">
          {t("logout.confirm")}
        </div>
        <div className="flex justify-center items-center gap-4 text-bold">
          <Button
            className="rounded-lg p-2 w-full"
            variant="destructive"
            onClick={async () => {
              await get_request("/api/wms/logout");
              window.location.href = "/" + langCode + "/login";
            }}
          >
            {t("button.confirm")}
          </Button>
          <Button
            className="rounded-lg p-2 w-full"
            variant="secondary"
            onClick={async () => {
              history.back();
            }}
          >
            {t("button.cancel")}
          </Button>
        </div>
      </div>
    </PdaPageLayout>
  );
}
