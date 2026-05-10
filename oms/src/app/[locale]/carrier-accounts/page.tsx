"use client";

import PageLayout from "@/components/page-layout";
import { CarrierAccountsList } from "@/components/carrier-accounts-list";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function ListWithFlash() {
  const t = useTranslations();
  const params = useSearchParams();
  const success = params.get("success");
  const error = params.get("error");
  let flash = "";
  if (success === "1") flash = t("carriers.messages.oauth_success");
  else if (error === "user_denied") flash = t("carriers.messages.user_denied");
  return <CarrierAccountsList initialFlash={flash} />;
}

export default function Page() {
  return (
    <PageLayout
      title="carriers.page_title"
      description="carriers.page_subtitle"
      path={[
        { name: "carriers.page_title", href: "#" },
      ]}
    >
      <div className="px-4 py-6 max-w-4xl mx-auto">
        <Suspense fallback={null}>
          <ListWithFlash />
        </Suspense>
      </div>
    </PageLayout>
  );
}
