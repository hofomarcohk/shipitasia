"use client";

import { PdaLayout } from "@/components/wms/pda-layout";
import { PdaPack } from "@/components/wms/pda-pack";

export default function Page() {
  return (
    <PdaLayout titleKey="wms_scan.page_title_pack">
      <PdaPack />
    </PdaLayout>
  );
}
