"use client";

import PageLayout from "@/components/page-layout";
import { PdaReceive } from "@/components/wms/pda-receive";

export default function Page() {
  return (
    <PageLayout
      title="wms_scan.page_title_receive"
      description=""
      path={[{ name: "wms_scan.page_title_receive", href: "#" }]}
    >
      <PdaReceive />
    </PageLayout>
  );
}
