"use client";

import PageLayout from "@/components/page-layout";
import { ScanHistory } from "@/components/wms/scan-history";

export default function Page() {
  return (
    <PageLayout
      title="wms_inbound_list.page_title"
      description="wms_inbound_list.page_subtitle"
      path={[{ name: "wms_inbound_list.page_title", href: "#" }]}
    >
      <ScanHistory />
    </PageLayout>
  );
}
