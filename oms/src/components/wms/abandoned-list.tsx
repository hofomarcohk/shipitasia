"use client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { http_request } from "@/lib/httpRequest";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

interface Row {
  _id: string;
  client_id: string;
  tracking_no: string;
  abandoned_at: string;
  abandoned_reason: string | null;
  last_scan_at: string | null;
}

export const AbandonedList = () => {
  const t = useTranslations();
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const load = async () => {
    setLoading(true);
    const r = await http_request("GET", "/api/wms/abandoned-inbounds", {});
    const d = await r.json();
    if (d.status === 200) setItems(d.data);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const mark = async (id: string) => {
    const r = await http_request(
      "POST",
      `/api/wms/abandoned-inbounds/${id}/mark-handled`,
      { note: note || null }
    );
    if (r.ok) {
      setNoteFor(null);
      setNote("");
      load();
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-4 px-3 grid gap-3">
      <h1 className="text-2xl font-semibold">
        {t("wms_scan.page_title_abandoned")}
      </h1>
      <Card>
        <CardContent className="py-3">
          {loading ? (
            <p className="text-gray-500 py-6 text-center">
              {t("common.loading")}
            </p>
          ) : items.length === 0 ? (
            <p className="text-gray-500 py-12 text-center">
              {t("wms_scan.abandoned_empty")}
            </p>
          ) : (
            <div className="grid gap-2">
              {items.map((r) => (
                <div
                  key={r._id}
                  className="rounded-md border border-amber-200 bg-amber-50 p-3"
                >
                  <div className="font-mono font-semibold">{r._id}</div>
                  <div className="text-xs text-gray-600 mt-1">
                    tracking: {r.tracking_no} · client:{" "}
                    {r.client_id.substring(0, 8)}…
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    abandoned at {new Date(r.abandoned_at).toLocaleString()}
                    {r.abandoned_reason && ` — ${r.abandoned_reason}`}
                  </div>
                  {noteFor === r._id ? (
                    <div className="mt-2 grid gap-2">
                      <Label className="text-xs">
                        {t("wms_scan.abandoned_note_label")}
                      </Label>
                      <Input
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => mark(r._id)}>
                          Confirm
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setNoteFor(null);
                            setNote("");
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2"
                      onClick={() => setNoteFor(r._id)}
                    >
                      {t("wms_scan.abandoned_mark_handled")}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
