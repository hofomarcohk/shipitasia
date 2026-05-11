"use client";

import PageLayout from "@/components/page-layout";
import { OutboundShipped } from "@/components/outbound-shipped";

export default function Page() {
  return (
    <PageLayout
      title="outbound_v1.shipped.page_title"
      description="outbound_v1.shipped.page_subtitle"
      path={[
        { name: "outbound_v1.page_title", href: "/zh-hk/outbound/list" },
        { name: "outbound_v1.shipped.page_title", href: "#" },
      ]}
    >
      <OutboundShipped />
    </PageLayout>
  );
}
