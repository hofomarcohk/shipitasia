// P16 — admin CRUD for working_calendars. The table feeds the P15 sweep's
// SLA arithmetic. Empty calendar = Mon-Fri fallback, so an empty table is
// a valid state; staff populate it warehouse-by-warehouse as needed.

import { ApiError } from "@/app/api/api-error";
import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";

export const WORKING_CALENDAR_TYPES = ["holiday", "non_working"] as const;
export type WorkingCalendarType = (typeof WORKING_CALENDAR_TYPES)[number];

export interface WorkingCalendarEntry {
  warehouseCode: string;
  date: string; // YYYY-MM-DD
  type: WorkingCalendarType;
  label: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validateDate(s: string): string {
  if (!DATE_RE.test(s)) throw new ApiError("WORKING_CALENDAR_INVALID_DATE");
  // Round-trip through Date to catch impossible values like 2026-02-31.
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    throw new ApiError("WORKING_CALENDAR_INVALID_DATE");
  }
  return s;
}

export async function listWorkingCalendar(
  warehouseCode?: string,
  range?: { from?: string; to?: string }
): Promise<WorkingCalendarEntry[]> {
  const db = await connectToDatabase();
  const filter: any = {};
  if (warehouseCode) filter.warehouseCode = warehouseCode;
  if (range?.from || range?.to) {
    filter.date = {};
    if (range.from) filter.date.$gte = validateDate(range.from);
    if (range.to) filter.date.$lte = validateDate(range.to);
  }
  const docs = await db
    .collection(collections.WORKING_CALENDAR)
    .find(filter)
    .sort({ warehouseCode: 1, date: 1 })
    .toArray();
  return docs.map((d: any) => ({
    warehouseCode: d.warehouseCode,
    date: d.date,
    type: d.type,
    label: d.label ?? null,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  }));
}

export async function upsertWorkingCalendarEntry(input: {
  warehouseCode: string;
  date: string;
  type: WorkingCalendarType;
  label?: string;
}): Promise<WorkingCalendarEntry> {
  if (!input.warehouseCode)
    throw new ApiError("WORKING_CALENDAR_WAREHOUSE_REQUIRED");
  const date = validateDate(input.date);
  if (!WORKING_CALENDAR_TYPES.includes(input.type))
    throw new ApiError("WORKING_CALENDAR_INVALID_TYPE");
  const db = await connectToDatabase();
  const now = new Date();
  await db.collection(collections.WORKING_CALENDAR).updateOne(
    { warehouseCode: input.warehouseCode, date },
    {
      $set: {
        type: input.type,
        label: (input.label ?? "").trim() || null,
        updatedAt: now,
      },
      $setOnInsert: {
        warehouseCode: input.warehouseCode,
        date,
        createdAt: now,
      },
    },
    { upsert: true }
  );
  const doc = await db
    .collection(collections.WORKING_CALENDAR)
    .findOne({ warehouseCode: input.warehouseCode, date });
  return {
    warehouseCode: doc!.warehouseCode,
    date: doc!.date,
    type: doc!.type,
    label: doc!.label ?? null,
    createdAt: doc!.createdAt,
    updatedAt: doc!.updatedAt,
  };
}

export async function deleteWorkingCalendarEntry(input: {
  warehouseCode: string;
  date: string;
}): Promise<void> {
  const date = validateDate(input.date);
  const db = await connectToDatabase();
  const res = await db
    .collection(collections.WORKING_CALENDAR)
    .deleteOne({ warehouseCode: input.warehouseCode, date });
  if (res.deletedCount === 0)
    throw new ApiError("WORKING_CALENDAR_ENTRY_NOT_FOUND");
}
