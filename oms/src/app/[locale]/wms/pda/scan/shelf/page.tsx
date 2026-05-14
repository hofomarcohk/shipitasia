"use client";

import { PdaLayout } from "@/components/wms/pda-layout";
import { PdaShelfPick } from "@/components/wms/pda-shelf-pick";

export default function Page() {
  return (
    <PdaLayout titleKey="wms_pda.shelf_pick.page_title">
      <PdaShelfPick />
    </PdaLayout>
  );
}
