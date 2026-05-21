// P17 — GET /api/wms/queue
//
// Flat task list for the handoff #queue page. Zero-count tasks are
// filtered server-side so the UI can render an empty-state when the
// list returns [].

import { NextRequest } from "next/server";

import { cmsMiddleware } from "@/app/api/cms/cms-middleware";
import { requireStaff } from "@/app/api/wms/scan/_helpers/staff-context";
import { listQueueTasks } from "@/services/dashboard/task-queue";
import { ApiReturn } from "@/types/Api";

export async function GET(request: NextRequest) {
  return cmsMiddleware(
    request,
    null,
    async (): Promise<ApiReturn> => {
      const principal = requireStaff(request);
      const tasks = await listQueueTasks(principal.warehouseCode);
      return { status: 200, message: "Success", data: { tasks } };
    }
  );
}
