"use client";

import PageLayout from "@/components/page-layout";
import { OutboundNewForm } from "@/components/outbound-new-form";

export default function Page() {
  return (
    <PageLayout
      title="outbound_v1.new.title"
      description="outbound_v1.page_subtitle"
      path={[
        { name: "outbound_v1.page_title", href: "/zh-hk/outbound/list" },
        { name: "outbound_v1.new.title", href: "#" },
      ]}
    >
      <OutboundNewForm />
    </PageLayout>
  );
}
