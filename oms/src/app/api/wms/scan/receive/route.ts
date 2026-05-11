import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { requireStaff } from "@/app/api/wms/scan/_helpers/staff-context";
import { parseMultipart } from "@/app/api/wms/scan/_helpers/multipart";
import { performReceive } from "@/services/scan/scan-service";
import { savePhotos } from "@/services/scan/photo-upload";
import { nextDailyId } from "@/services/util/daily-counter";
import { ApiReturn } from "@/types/Api";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const parsed = await parseMultipart(request);
  const body: any = {
    inbound_id: parsed.fields.inbound_id,
    locationCode: parsed.fields.locationCode,
    weight: parsed.fields.weight ? Number(parsed.fields.weight) : undefined,
    dimension: parsed.fields.dimension
      ? JSON.parse(parsed.fields.dimension)
      : undefined,
    anomalies: parsed.fields.anomalies
      ? JSON.parse(parsed.fields.anomalies)
      : [],
    staff_note: parsed.fields.staff_note || undefined,
    photo_barcode_paths: [],
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
      const anomalyPhotos = await savePhotos({
        warehouseCode: principal.warehouseCode,
        scan_id: stub,
        type: "anomaly",
        files: parsed.files.photo_anomaly ?? [],
      });
      if (anomalyPhotos.paths.length > 0 && body.anomalies.length > 0) {
        if (!body.anomalies[0].photo_paths || body.anomalies[0].photo_paths.length === 0) {
          body.anomalies[0].photo_paths = anomalyPhotos.paths;
        }
      }
      body.photo_barcode_paths = barcode.paths;
      body.photo_package_paths = pkg.paths;
      const result = await performReceive(body, principal, {
        barcode_paths: barcode.paths,
        package_paths: pkg.paths,
        metadata: [...barcode.metadata, ...pkg.metadata, ...anomalyPhotos.metadata],
      });
      return { status: 200, message: "Success", data: result };
    }
  );
}
