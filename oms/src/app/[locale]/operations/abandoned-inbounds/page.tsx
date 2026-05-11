"use client";

import PageLayout from "@/components/page-layout";
import { AbandonedList } from "@/components/wms/abandoned-list";

export default function Page() {
  return (
    <PageLayout
      title="wms_scan.page_title_abandoned"
      description=""
      path={[{ name: "wms_scan.page_title_abandoned", href: "#" }]}
    >
      <AbandonedList />
    </PageLayout>
  );
}
