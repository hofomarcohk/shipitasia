"use client";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { getCurrentLangCode, lang } from "@/lang/base";
import { get_request } from "@/lib/httpRequest";

import { usePdaMsg } from "@/context/pdaMsg";
import { cn } from "@/lib/utils";
import React, { useEffect } from "react";
import { PdaPageMsgLayout } from "./pda-page-message";

export default function PdaPageLayout(props: {
  langCode?: string;
  title?: string;
  path?: { name: string; href: string }[];
  children?: React.ReactNode;
  isLoading?: boolean;
}) {
  const { pdaMsg } = usePdaMsg();
  const langCode = props.langCode ?? getCurrentLangCode();
  const isLoading = props.isLoading ?? false;

  const init = async () => {
    const res = await get_request("/api/wms/menu-pda");
    const json = await res.json();
    if (json.status == 401) {
      pdaMsg("error", lang("error.UNAUTHORIZED", langCode), {
        callback: () => {
          window.location.href = "/" + langCode + "/login";
        },
        button: "button.confirm",
        message: lang("utils.unauthorizedDesc", langCode),
      });
      return;
    }
  };

  useEffect(() => {
    init();
  }, []);

  return (
    <SidebarProvider>
      <SidebarInset>
        <div className="flex flex-col gap-4  scrollbar">
          <div className={cn("flex-1 flex-col p-1 md:flex scrollbar relative")}>
            <PdaPageMsgLayout langCode={langCode}>
              {isLoading && <></>}
              {!isLoading && props.children}
            </PdaPageMsgLayout>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
