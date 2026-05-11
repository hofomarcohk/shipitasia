"use client";

import PageLayout from "@/components/page-layout";
import { OperationsLabelPrint } from "@/components/wms/operations-label-print";

export default function Page() {
  return (
    <PageLayout
      title="wms_ops.label_print.page_title"
      description="wms_ops.label_print.page_subtitle"
      path={[{ name: "wms_ops.label_print.page_title", href: "#" }]}
    >
      <OperationsLabelPrint />
    </PageLayout>
  );
}
