import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { requireStaff } from "@/app/api/wms/scan/_helpers/staff-context";
import { parseMultipart } from "@/app/api/wms/scan/_helpers/multipart";
import { performArrive } from "@/services/scan/scan-service";
import { savePhotos } from "@/services/scan/photo-upload";
import { nextDailyId } from "@/services/util/daily-counter";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const parsed = await parseMultipart(request);
  // Build a body shape ArriveInputSchema understands
  const body: any = {
    tracking_no: parsed.fields.tracking_no,
    inbound_id: parsed.fields.inbound_id || undefined,
    weight: parsed.fields.weight ? Number(parsed.fields.weight) : undefined,
    dimension: parsed.fields.dimension
      ? JSON.parse(parsed.fields.dimension)
      : undefined,
    anomalies: parsed.fields.anomalies
      ? JSON.parse(parsed.fields.anomalies)
      : [],
    staff_note: parsed.fields.staff_note || undefined,
    photo_barcode_paths: [], // populated post-save
    photo_package_paths: [],
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
      // Pre-mint a stub scan_id to namespace photos. The actual scan write
      // will mint its own; we just want a stable prefix on disk.
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
      // anomaly photos arrive already-saved under `anomalies[i].photo_paths`
      // because the client uploads them in a separate step first. For v1
      // we accept inline anomaly photos via fields.anomalies_photos and
      // merge them here.
      const anomalyPhotos = await savePhotos({
        warehouseCode: principal.warehouseCode,
        scan_id: stub,
        type: "anomaly",
        files: parsed.files.photo_anomaly ?? [],
      });
      // Attach anomaly photos to first anomaly entry if user didn't pre-tag
      if (anomalyPhotos.paths.length > 0 && body.anomalies.length > 0) {
        if (!body.anomalies[0].photo_paths || body.anomalies[0].photo_paths.length === 0) {
          body.anomalies[0].photo_paths = anomalyPhotos.paths;
        }
      }

      body.photo_barcode_paths = barcode.paths;
      body.photo_package_paths = pkg.paths;

      const result = await performArrive(body, principal, {
        barcode_paths: barcode.paths,
        package_paths: pkg.paths,
        metadata: [...barcode.metadata, ...pkg.metadata, ...anomalyPhotos.metadata],
      });
      return { status: 200, message: "Success", data: result };
    }
  );
}
