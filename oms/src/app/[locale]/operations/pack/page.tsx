"use client";

import PageLayout from "@/components/page-layout";
import { OperationsPack } from "@/components/wms/operations-pack";

export default function Page() {
  return (
    <PageLayout
      title="wms_ops.pack.page_title"
      description="wms_ops.pack.page_subtitle"
      path={[{ name: "wms_ops.pack.page_title", href: "#" }]}
    >
      <OperationsPack />
    </PageLayout>
  );
}
