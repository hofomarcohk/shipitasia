// W5 — PC pick-confirm page.
//
// After printing a pick list and physically grabbing items off the
// shelves, warehouse staff returns to PC to re-scan each tracking_no
// for confirmation. Reuses existing /api/wms/outbound/pick-by-tracking
// (with batch_id scope) so the auto-advance to batch.status="picked"
// kicks in on the final scan via pickBatchService.checkBatchPickComplete.

import { PickConfirmPageClient } from "@/components/wms-redesign/pages/pick-confirm-page";

export default function Page() {
  return <PickConfirmPageClient />;
}
