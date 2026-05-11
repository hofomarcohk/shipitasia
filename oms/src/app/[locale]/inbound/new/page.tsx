"use client";

import PageLayout from "@/components/page-layout";
import { InboundNewForm } from "@/components/inbound-new-form";

export default function Page() {
  return (
    <PageLayout
      title="inbound_v1.new.title"
      description="inbound_v1.page_subtitle"
      path={[
        { name: "inbound_v1.page_title", href: "/zh-hk/inbound/list" },
        { name: "inbound_v1.new.title", href: "#" },
      ]}
    >
      <InboundNewForm />
    </PageLayout>
  );
}
