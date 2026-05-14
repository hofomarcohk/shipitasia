"use client";

import PageLayout from "@/components/page-layout";
import { OperationsWeighPalletize } from "@/components/wms/operations-weigh-palletize";

export default function Page() {
  return (
    <PageLayout
      title="wms_ops.weigh.page_title"
      description="wms_ops.weigh.page_subtitle"
      path={[{ name: "wms_ops.weigh.page_title", href: "#" }]}
    >
      <OperationsWeighPalletize />
    </PageLayout>
  );
}
