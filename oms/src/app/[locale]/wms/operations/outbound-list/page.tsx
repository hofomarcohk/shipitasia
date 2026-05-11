"use client";

import PageLayout from "@/components/page-layout";
import { OperationsOutboundList } from "@/components/wms/operations-outbound-list";

export default function Page() {
  return (
    <PageLayout
      title="wms_ops.outbound_list.page_title"
      description="wms_ops.outbound_list.page_subtitle"
      path={[{ name: "wms_ops.outbound_list.page_title", href: "#" }]}
    >
      <OperationsOutboundList />
    </PageLayout>
  );
}
