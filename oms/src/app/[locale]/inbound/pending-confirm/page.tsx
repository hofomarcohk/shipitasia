"use client";

import PageLayout from "@/components/page-layout";
import { InboundPendingConfirm } from "@/components/inbound-pending-confirm";

export default function Page() {
  return (
    <PageLayout
      title="unclaimed_ui.pending_confirm_page_title"
      description=""
      path={[
        { name: "inbound_v1.page_title", href: "/zh-hk/inbound/list" },
        { name: "unclaimed_ui.pending_confirm_page_title", href: "#" },
      ]}
    >
      <InboundPendingConfirm />
    </PageLayout>
  );
}
