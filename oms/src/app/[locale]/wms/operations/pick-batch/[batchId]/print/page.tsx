"use client";

import { PickSheetPrint } from "@/components/wms/pick-sheet-print";
import { use } from "react";

// Standalone print-friendly page. No PageLayout (no sidebar/header) so the
// pick sheet fills the paper. Marco's spec: shelves grouped, each row shows
// tracking + 品名, right column reserved for hand-check; no thumbnail.
// Picker brings the printout to the shelves, then returns to 桌面揀貨 to
// confirm picks by scanning each tracking — the print sheet itself does not
// advance system state.
export default function Page({
  params,
}: {
  params: Promise<{ batchId: string }>;
}) {
  const { batchId } = use(params);
  return <PickSheetPrint batchId={batchId} />;
}
