"use client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { http_request } from "@/lib/httpRequest";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface Category {
  _id: string;
  name_zh: string;
  subcategories: { _id: string; name_zh: string }[];
}

interface ItemDraft {
  draft_id: string;
  category_id: string;
  subcategory_id: string;
  product_name: string;
  product_url: string;
  quantity: number;
  unit_price: number;
}

interface PendingRow {
  _id: string;
  carrier_inbound_code: string;
  tracking_no: string;
  weight: number;
  dimension: { length: number; width: number; height: number };
  staff_note: string;
  arrived_at: string;
}

export const InboundAcceptForm = ({ unclaimedId }: { unclaimedId: string }) => {
  const t = useTranslations();
  const router = useRouter();
  const [pending, setPending] = useState<PendingRow | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<"regular" | "return" | "gift" | "other">(
    "regular"
  );
  const [items, setItems] = useState<ItemDraft[]>([
    {
      draft_id: "1",
      category_id: "",
      subcategory_id: "",
      product_name: "",
      product_url: "",
      quantity: 1,
      unit_price: 0,
    },
  ]);
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      const [pRes, cRes] = await Promise.all([
        http_request("GET", "/api/cms/inbound/pending-confirm", {}),
        http_request("GET", "/api/cms/product-categories", {}),
      ]);
      const pData = await pRes.json();
      const cData = await cRes.json();
      if (cData.status === 200) setCategories(cData.data);
      if (pData.status === 200) {
        const match = (pData.data as PendingRow[]).find(
          (r) => r._id === unclaimedId
        );
        if (match) setPending(match);
      }
      setLoading(false);
    })();
  }, [unclaimedId]);

  const total = items.reduce((s, it) => s + it.quantity * it.unit_price, 0);

  const submit = async () => {
    setError("");
    const cleaned = items.filter(
      (it) =>
        it.category_id && it.subcategory_id && it.product_name && it.quantity > 0
    );
    if (cleaned.length === 0) {
      setError(t("inbound_v1.new.validation_no_items"));
      return;
    }
    setSubmitting(true);
    try {
      const r = await http_request(
        "POST",
        `/api/cms/inbound/confirm/${unclaimedId}`,
        {
          inbound_source: source,
          declared_items: cleaned.map(({ draft_id: _, product_url, ...rest }) => ({
            ...rest,
            product_url: product_url || undefined,
          })),
          customer_remarks: remarks || undefined,
        }
      );
      const d = await r.json();
      if (r.ok && d.status === 200) {
        router.push(`/zh-hk/inbound/${d.data.inbound_id}`);
      } else {
        setError(d.message || "Failed");
      }
    } catch (err) {
      console.error(err);
      setError("Submit failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="text-center py-12">{t("common.loading")}</div>;
  }
  if (!pending) {
    return (
      <div className="max-w-2xl mx-auto py-6 px-4 text-center">
        <p className="text-gray-500">
          {t("unclaimed_ui.pending_confirm_empty")}
        </p>
        <Link href="/zh-hk/inbound/pending-confirm" className="underline mt-2 inline-block">
          {t("unclaimed_ui.accept_back")}
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-4 px-3 grid gap-3">
      <h1 className="text-2xl font-semibold">
        {t("unclaimed_ui.accept_page_title")}
      </h1>
      <Card>
        <CardContent className="py-3">
          <h2 className="font-semibold mb-2">
            {t("unclaimed_ui.accept_section_info")}
          </h2>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <Field label="Unclaimed ID">
              <span className="font-mono">{pending._id}</span>
            </Field>
            <Field label={t("unclaimed_ui.confirm_carrier")}>
              {pending.carrier_inbound_code}
            </Field>
            <Field label={t("unclaimed_ui.confirm_tracking")}>
              <span className="font-mono">{pending.tracking_no}</span>
            </Field>
            <Field label="Weight">{pending.weight} kg</Field>
            <Field label="Dimension">
              {pending.dimension.length} × {pending.dimension.width} ×{" "}
              {pending.dimension.height} cm
            </Field>
            <Field label={t("unclaimed_ui.confirm_arrived")}>
              {new Date(pending.arrived_at).toLocaleString()}
            </Field>
          </dl>
          <p className="text-sm text-gray-500 mt-2">
            {t("unclaimed_ui.confirm_staff_note")}：{pending.staff_note}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-3 grid gap-3">
          <h2 className="font-semibold">
            {t("unclaimed_ui.accept_section_fill")}
          </h2>
          <div>
            <Label>{t("unclaimed_ui.accept_inbound_source")}</Label>
            <div className="flex gap-1 mt-1">
              {(["regular", "return", "gift", "other"] as const).map((s) => (
                <Button
                  key={s}
                  type="button"
                  size="sm"
                  variant={source === s ? "default" : "outline"}
                  onClick={() => setSource(s)}
                >
                  {t(`inbound_v1.inbound_source.${s}` as any)}
                </Button>
              ))}
            </div>
          </div>

          <div className="border-t pt-3">
            <div className="flex items-center justify-between mb-2">
              <Label>{t("unclaimed_ui.accept_declared_items")}</Label>
              <Button
                size="sm"
                type="button"
                onClick={() =>
                  setItems((p) => [
                    ...p,
                    {
                      draft_id: String(Date.now()),
                      category_id: "",
                      subcategory_id: "",
                      product_name: "",
                      product_url: "",
                      quantity: 1,
                      unit_price: 0,
                    },
                  ])
                }
              >
                {t("unclaimed_ui.accept_add_item")}
              </Button>
            </div>
            <div className="grid gap-2">
              {items.map((it, idx) => {
                const cat = categories.find((c) => c._id === it.category_id);
                return (
                  <div
                    key={it.draft_id}
                    className="grid gap-1 rounded-md border p-2 bg-gray-50"
                  >
                    <div className="grid grid-cols-2 gap-1">
                      <select
                        className="border rounded px-2 py-1 text-sm"
                        value={it.category_id}
                        onChange={(e) =>
                          setItems((p) =>
                            p.map((x, i) =>
                              i === idx
                                ? {
                                    ...x,
                                    category_id: e.target.value,
                                    subcategory_id: "",
                                  }
                                : x
                            )
                          )
                        }
                      >
                        <option value="">類別</option>
                        {categories.map((c) => (
                          <option key={c._id} value={c._id}>
                            {c.name_zh}
                          </option>
                        ))}
                      </select>
                      <select
                        className="border rounded px-2 py-1 text-sm"
                        value={it.subcategory_id}
                        onChange={(e) =>
                          setItems((p) =>
                            p.map((x, i) =>
                              i === idx
                                ? { ...x, subcategory_id: e.target.value }
                                : x
                            )
                          )
                        }
                        disabled={!cat}
                      >
                        <option value="">子類別</option>
                        {cat?.subcategories.map((s) => (
                          <option key={s._id} value={s._id}>
                            {s.name_zh}
                          </option>
                        ))}
                      </select>
                    </div>
                    <Input
                      placeholder="Product name"
                      value={it.product_name}
                      onChange={(e) =>
                        setItems((p) =>
                          p.map((x, i) =>
                            i === idx
                              ? { ...x, product_name: e.target.value }
                              : x
                          )
                        )
                      }
                    />
                    <div className="grid grid-cols-3 gap-1">
                      <Input
                        type="number"
                        min={1}
                        placeholder="Qty"
                        value={it.quantity}
                        onChange={(e) =>
                          setItems((p) =>
                            p.map((x, i) =>
                              i === idx
                                ? {
                                    ...x,
                                    quantity:
                                      parseInt(e.target.value, 10) || 1,
                                  }
                                : x
                            )
                          )
                        }
                      />
                      <Input
                        type="number"
                        min={0}
                        placeholder="Unit price"
                        value={it.unit_price}
                        onChange={(e) =>
                          setItems((p) =>
                            p.map((x, i) =>
                              i === idx
                                ? {
                                    ...x,
                                    unit_price:
                                      parseFloat(e.target.value) || 0,
                                  }
                                : x
                            )
                          )
                        }
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600"
                        onClick={() =>
                          setItems((p) =>
                            p.length > 1 ? p.filter((_, i) => i !== idx) : p
                          )
                        }
                      >
                        刪除
                      </Button>
                    </div>
                  </div>
                );
              })}
              <div className="flex justify-between text-sm font-semibold mt-1">
                <span>{t("unclaimed_ui.accept_total")}</span>
                <span>JPY {total.toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div>
            <Label>{t("inbound_v1.new.customer_remarks_label")}</Label>
            <Textarea
              rows={2}
              maxLength={200}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />
          </div>

          <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-xs text-amber-700">
            {t("unclaimed_ui.accept_warning")}
          </div>

          {error && (
            <p className="text-red-500 text-sm" role="alert">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <Link href="/zh-hk/inbound/pending-confirm">
              <Button type="button" variant="outline">
                {t("unclaimed_ui.accept_back")}
              </Button>
            </Link>
            <Button onClick={submit} disabled={submitting} className="flex-1">
              {submitting
                ? t("inbound_v1.new.submitting")
                : t("unclaimed_ui.accept_submit")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs uppercase text-gray-500 mb-1">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
