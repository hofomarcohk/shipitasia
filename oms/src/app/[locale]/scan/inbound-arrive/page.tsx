"use client";

import PageLayout from "@/components/page-layout";
import { PdaArrive } from "@/components/wms/pda-arrive";

export default function Page() {
  return (
    <PageLayout
      title="wms_scan.page_title_arrive"
      description=""
      path={[{ name: "wms_scan.page_title_arrive", href: "#" }]}
    >
      <PdaArrive />
    </PageLayout>
  );
}
