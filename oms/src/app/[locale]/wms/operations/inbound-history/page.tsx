"use client";

import PageLayout from "@/components/page-layout";
import { ScanHistory } from "@/components/wms/scan-history";

export default function Page() {
  return (
    <PageLayout
      title="wms_scan.page_title_history"
      description=""
      path={[{ name: "wms_scan.page_title_history", href: "#" }]}
    >
      <ScanHistory />
    </PageLayout>
  );
}
