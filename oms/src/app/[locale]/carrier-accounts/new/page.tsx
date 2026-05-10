"use client";

import PageLayout from "@/components/page-layout";
import { CarrierAccountNewForm } from "@/components/carrier-account-new-form";

export default function Page() {
  return (
    <PageLayout
      title="carriers.new.title"
      description="carriers.page_subtitle"
      path={[
        { name: "carriers.page_title", href: "/zh-hk/carrier-accounts" },
        { name: "carriers.new.title", href: "#" },
      ]}
    >
      <CarrierAccountNewForm />
    </PageLayout>
  );
}
