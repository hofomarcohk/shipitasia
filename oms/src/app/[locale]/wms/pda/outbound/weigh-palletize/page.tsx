"use client";

import { PdaLayout } from "@/components/wms/pda-layout";
import { PdaWeighPalletize } from "@/components/wms/pda-weigh-palletize";

export default function Page() {
  return (
    <PdaLayout titleKey="wms_scan.page_title_weigh_palletize">
      <PdaWeighPalletize />
    </PdaLayout>
  );
}
