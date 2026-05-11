"use client";

import PageLayout from "@/components/page-layout";
import { OperationsReceive } from "@/components/wms/operations-receive";

export default function Page() {
  return (
    <PageLayout
      title="wms_ops.receive.page_title"
      description="wms_ops.receive.page_subtitle"
      path={[{ name: "wms_ops.receive.page_title", href: "#" }]}
    >
      <OperationsReceive />
    </PageLayout>
  );
}
