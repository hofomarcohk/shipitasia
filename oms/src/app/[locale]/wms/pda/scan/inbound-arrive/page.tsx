"use client";

import { PdaLayout } from "@/components/wms/pda-layout";
import { PdaArrive } from "@/components/wms/pda-arrive";

export default function Page() {
  return (
    <PdaLayout titleKey="wms_scan.page_title_arrive">
      <PdaArrive />
    </PdaLayout>
  );
}
