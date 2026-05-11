"use client";

import PageLayout from "@/components/page-layout";
import { PdaDepart } from "@/components/wms/pda-depart";

export default function Page() {
  return (
    <PageLayout
      title="wms_scan.depart.page_title"
      description=""
      path={[{ name: "wms_scan.depart.page_title", href: "#" }]}
    >
      <PdaDepart />
    </PageLayout>
  );
}
