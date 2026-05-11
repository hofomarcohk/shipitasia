"use client";

import { PdaLayout } from "@/components/wms/pda-layout";
import { PdaDepart } from "@/components/wms/pda-depart";

export default function Page() {
  return (
    <PdaLayout titleKey="wms_scan.depart.page_title">
      <PdaDepart />
    </PdaLayout>
  );
}
