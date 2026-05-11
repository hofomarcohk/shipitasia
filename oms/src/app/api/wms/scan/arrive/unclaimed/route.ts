import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { requireStaff } from "@/app/api/wms/scan/_helpers/staff-context";
import { parseMultipart } from "@/app/api/wms/scan/_helpers/multipart";
import { registerUnclaimed } from "@/services/scan/scan-service";
import { savePhotos } from "@/services/scan/photo-upload";
import { nextDailyId } from "@/services/util/daily-counter";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const parsed = await parseMultipart(request);
  return cmsMiddleware(
    request,
    parsed.fields as any,
    async (): Promise<ApiReturn> => {
      const principal = requireStaff(request);
      const stub = await nextDailyId("U");
      // Single combined photo bucket for unclaimed (barcode + package
      // captured at the same step — store under `barcode` type for
      // consistency with arrive)
      const photos = await savePhotos({
        warehouseCode: principal.warehouseCode,
        scan_id: stub,
        type: "barcode",
        files: [
          ...(parsed.files.photo_barcode ?? []),
          ...(parsed.files.photo_package ?? []),
        ],
      });
      const result = await registerUnclaimed(
        {
          tracking_no: parsed.fields.tracking_no,
          carrier_inbound_code: parsed.fields.carrier_inbound_code,
          weight: Number(parsed.fields.weight),
          dimension: parsed.fields.dimension
            ? JSON.parse(parsed.fields.dimension)
            : { length: 0, width: 0, height: 0 },
          photo_paths: photos.paths,
          staff_note: parsed.fields.staff_note,
        },
        principal,
        photos
      );
      return { status: 200, message: "Success", data: result };
    }
  );
}
