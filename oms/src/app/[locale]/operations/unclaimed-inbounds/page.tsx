"use client";

import PageLayout from "@/components/page-layout";
import { UnclaimedList } from "@/components/wms/unclaimed-list";

export default function Page() {
  return (
    <PageLayout
      title="wms_scan.page_title_unclaimed"
      description=""
      path={[{ name: "wms_scan.page_title_unclaimed", href: "#" }]}
    >
      <UnclaimedList />
    </PageLayout>
  );
}
