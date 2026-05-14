// Display-only SIA code lookup. _id (ObjectId) remains the canonical FK
// everywhere — code is only attached to staff-facing listings so the UI
// shows "SIA0004" instead of "6a030758c8f9a825c3659800".

import { ObjectId } from "mongodb";
import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";

export async function getClientCodeMap(
  client_ids: string[]
): Promise<Map<string, string>> {
  const uniq = Array.from(new Set(client_ids.filter(Boolean)));
  if (uniq.length === 0) return new Map();
  const db = await connectToDatabase();
  const oids: ObjectId[] = [];
  for (const id of uniq) {
    try {
      oids.push(new ObjectId(id));
    } catch {
      // ignore malformed ids
    }
  }
  if (oids.length === 0) return new Map();
  const rows = await db
    .collection(collections.CLIENT)
    .find({ _id: { $in: oids } })
    .project({ _id: 1, code: 1 })
    .toArray();
  const out = new Map<string, string>();
  for (const r of rows as any[]) {
    if (r.code) out.set(String(r._id), r.code);
  }
  return out;
}
