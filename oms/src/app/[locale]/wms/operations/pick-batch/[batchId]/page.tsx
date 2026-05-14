"use client";

import PageLayout from "@/components/page-layout";
import { OperationsPickBatchDetail } from "@/components/wms/operations-pick-batch-detail";
import { use } from "react";

export default function Page({
  params,
}: {
  params: Promise<{ batchId: string }>;
}) {
  const { batchId } = use(params);
  return (
    <PageLayout
      title="wms_ops.pick_batch.detail_page_title"
      description=""
      path={[
        {
          name: "wms_ops.pick_batch.page_title",
          href: "/zh-hk/wms/operations/pick-batch",
        },
        { name: "wms_ops.pick_batch.detail_page_title", href: "#" },
      ]}
    >
      <OperationsPickBatchDetail batchId={batchId} />
    </PageLayout>
  );
}
