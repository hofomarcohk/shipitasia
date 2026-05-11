"use client";

import PageLayout from "@/components/page-layout";
import { OperationsDepart } from "@/components/wms/operations-depart";

export default function Page() {
  return (
    <PageLayout
      title="wms_ops.depart.page_title"
      description="wms_ops.depart.page_subtitle"
      path={[{ name: "wms_ops.depart.page_title", href: "#" }]}
    >
      <OperationsDepart />
    </PageLayout>
  );
}
