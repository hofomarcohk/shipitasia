"use client";

import PageLayout from "@/components/page-layout";
import { OperationsPick } from "@/components/wms/operations-pick";

export default function Page() {
  return (
    <PageLayout
      title="wms_ops.pick.page_title"
      description="wms_ops.pick.page_subtitle"
      path={[{ name: "wms_ops.pick.page_title", href: "#" }]}
    >
      <OperationsPick />
    </PageLayout>
  );
}
