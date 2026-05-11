"use client";

import { PdaLayout } from "@/components/wms/pda-layout";
import { PdaReceive } from "@/components/wms/pda-receive";

export default function Page() {
  return (
    <PdaLayout titleKey="wms_scan.page_title_receive">
      <PdaReceive />
    </PdaLayout>
  );
}
