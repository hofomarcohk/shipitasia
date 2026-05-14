"use client";

import PageLayout from "@/components/page-layout";
import { OperationsPickBatchList } from "@/components/wms/operations-pick-batch-list";

export default function Page() {
  return (
    <PageLayout
      title="wms_ops.pick_batch.page_title"
      description="wms_ops.pick_batch.page_subtitle"
      path={[{ name: "wms_ops.pick_batch.page_title", href: "#" }]}
    >
      <OperationsPickBatchList />
    </PageLayout>
  );
}
