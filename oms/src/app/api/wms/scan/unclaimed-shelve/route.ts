// P17 — S3 upshelve for unclaimed pool rows.
//
// Counterpart to /scan/receive but for parcels sitting in
// unclaimed_inbounds (created by quick-arrive). Captures location,
// weight, dimension and photos. Status stays at pending_assignment;
// the claim flow (U3.1 customer self-claim / U3.2 CS assign) is
// downstream.
//
// Multipart shape mirrors /scan/receive so the PDA can reuse its
// photo-upload helpers verbatim.

import { NextRequest } from "next/server";

import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { parseMultipart } from "@/app/api/wms/scan/_helpers/multipart";
import { requireStaff } from "@/app/api/wms/scan/_helpers/staff-context";
import { performUnclaimedShelve } from "@/services/scan/scan-service";
import { savePhotos } from "@/services/scan/photo-upload";
import { nextDailyId } from "@/services/util/daily-counter";
import { ApiReturn } from "@/types/Api";

export async function POST(request: NextRequest) {
  const parsed = await parseMultipart(request);
  const body: any = {
    unclaimed_id: parsed.fields.unclaimed_id || undefined,
    tracking_no: parsed.fields.tracking_no || undefined,
    locationCode: parsed.fields.locationCode,
    weight: parsed.fields.weight ? Number(parsed.fields.weight) : undefined,
    dimension: parsed.fields.dimension
      ? JSON.parse(parsed.fields.dimension)
      : undefined,
    carrier_inbound_code: parsed.fields.carrier_inbound_code || undefined,
    staff_note: parsed.fields.staff_note || undefined,
  };
  return cmsMiddleware(
    request,
    {
      ...body,
      photo_barcode_count: parsed.files.photo_barcode?.length ?? 0,
      photo_package_count: parsed.files.photo_package?.length ?? 0,
    },
    async (): Promise<ApiReturn> => {
      const principal = requireStaff(request);
      const stub = await nextDailyId("S");
      const barcode = await savePhotos({
        warehouseCode: principal.warehouseCode,
        scan_id: stub,
        type: "barcode",
        files: parsed.files.photo_barcode ?? [],
      });
      const pkg = await savePhotos({
        warehouseCode: principal.warehouseCode,
        scan_id: stub,
        type: "package",
        files: parsed.files.photo_package ?? [],
      });
      const result = await performUnclaimedShelve(body, principal, {
        barcode_paths: barcode.paths,
        package_paths: pkg.paths,
        metadata: [...barcode.metadata, ...pkg.metadata],
      });
      return { status: 200, message: "Success", data: result };
    }
  );
}
