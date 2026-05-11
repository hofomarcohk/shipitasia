"use client";

import { http_request } from "@/lib/httpRequest";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

interface InvoiceItem {
  product_name: string;
  category_name: string | null;
  subcategory_name: string | null;
  quantity: number;
  unit_price: number;
  currency: string;
  subtotal: number;
  source_inbound_id: string;
}

interface InvoicePayload {
  outbound: {
    _id: string;
    carrier_code: string;
    tracking_no: string | null;
    destination_country: string;
    shipment_type: string;
    actual_weight_kg: number | null;
    declared_weight_kg: number | null;
    box_count: number;
    createdAt: string;
    label_obtained_at: string | null;
  };
  sender: {
    name: string;
    address: string;
    phone: string;
    country_code: string;
    postal_code: string;
  };
  receiver: {
    name: string;
    phone: string;
    country_code: string;
    city: string;
    district: string | null;
    address: string;
    postal_code: string | null;
  };
  inbound_ids: string[];
  items: InvoiceItem[];
  totals: {
    items_count: number;
    total_quantity: number;
    grand_total: number;
    currency: string;
  };
}

export default function Page() {
  const t = useTranslations();
  const params = useParams<{ outboundId: string }>();
  const [data, setData] = useState<InvoicePayload | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const r = await http_request(
        "GET",
        `/api/wms/outbound/${params.outboundId}/invoice-data`,
        {}
      );
      const d = await r.json();
      if (d.status === 200) {
        setData(d.data);
      } else {
        setError(d.message ?? "load failed");
      }
    })();
  }, [params.outboundId]);

  if (error) {
    return <p className="p-8 text-red-600">{error}</p>;
  }
  if (!data) {
    return <p className="p-8 text-gray-500">{t("common.loading")}</p>;
  }

  const fmtMoney = (n: number, cur: string) =>
    `${cur} ${n.toLocaleString(undefined, { minimumFractionDigits: 0 })}`;
  const fmtDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString() : "—";

  return (
    <>
      <style>{`
        @page { size: A4; margin: 16mm; }
        body { background: #f6f6f6; }
        .invoice-toolbar { display: flex; gap: 8px; justify-content: flex-end;
          padding: 12px 16px; background: white; border-bottom: 1px solid #e5e5e5;
          position: sticky; top: 0; z-index: 10; }
        .invoice-toolbar button { padding: 6px 14px; border-radius: 6px;
          border: 1px solid #d4d4d4; background: white; cursor: pointer;
          font-size: 14px; }
        .invoice-toolbar button.primary { background: #111; color: white;
          border-color: #111; }
        .invoice-page { background: white; max-width: 800px; margin: 24px auto;
          padding: 32px 36px; box-shadow: 0 1px 4px rgba(0,0,0,0.08);
          font-family: "Noto Sans HK", "Noto Sans SC", sans-serif; color: #111;
          font-size: 12px; line-height: 1.55; }
        .invoice-title { font-size: 24px; font-weight: 700; margin: 0 0 4px; }
        .invoice-sub { color: #555; margin: 0 0 18px; font-size: 11px; }
        .invoice-meta { display: grid; grid-template-columns: 1fr 1fr;
          gap: 16px; padding: 12px 14px; border: 1px solid #d4d4d4;
          border-radius: 6px; margin-bottom: 18px; }
        .invoice-meta dt { font-size: 10px; color: #888; text-transform: uppercase;
          letter-spacing: 0.04em; }
        .invoice-meta dd { margin: 0 0 6px; font-weight: 600; }
        .invoice-addr { display: grid; grid-template-columns: 1fr 1fr; gap: 16px;
          margin-bottom: 18px; }
        .invoice-addr h3 { font-size: 11px; margin: 0 0 6px;
          color: #888; text-transform: uppercase; letter-spacing: 0.04em; }
        .invoice-addr .name { font-weight: 700; font-size: 14px; }
        .invoice-items { width: 100%; border-collapse: collapse;
          margin-bottom: 16px; }
        .invoice-items th, .invoice-items td { padding: 8px 6px;
          border-bottom: 1px solid #eee; text-align: left; vertical-align: top; }
        .invoice-items thead th { background: #fafafa; font-size: 10px;
          color: #555; text-transform: uppercase; letter-spacing: 0.04em;
          border-bottom: 1px solid #d4d4d4; }
        .invoice-items td.num, .invoice-items th.num { text-align: right;
          font-variant-numeric: tabular-nums; }
        .invoice-cat { font-size: 10px; color: #888; }
        .invoice-totals { display: flex; justify-content: flex-end; }
        .invoice-totals table { font-size: 12px; }
        .invoice-totals td { padding: 4px 8px; }
        .invoice-totals tr.grand td { font-size: 16px; font-weight: 700;
          border-top: 2px solid #111; padding-top: 8px; }
        .invoice-footer { display: flex; justify-content: space-between;
          margin-top: 36px; padding-top: 16px; border-top: 1px solid #e5e5e5;
          font-size: 10px; color: #777; }
        .invoice-sig { width: 200px; }
        .invoice-sig .line { border-bottom: 1px solid #333; height: 36px;
          margin-bottom: 4px; }

        @media print {
          .invoice-toolbar { display: none; }
          body { background: white; }
          .invoice-page { box-shadow: none; margin: 0; max-width: none;
            padding: 0; }
        }
      `}</style>

      <div className="invoice-toolbar">
        <button onClick={() => window.print()} className="primary">
          {t("invoice.print")}
        </button>
        <button onClick={() => window.close()}>
          {t("invoice.close")}
        </button>
      </div>

      <article className="invoice-page">
        <h1 className="invoice-title">{t("invoice.title")}</h1>
        <p className="invoice-sub">
          {t("invoice.subtitle", { id: data.outbound._id })}
        </p>

        <dl className="invoice-meta">
          <div>
            <dt>{t("invoice.meta.outbound_id")}</dt>
            <dd className="font-mono">{data.outbound._id}</dd>
            <dt>{t("invoice.meta.carrier")}</dt>
            <dd>{data.outbound.carrier_code.toUpperCase()}</dd>
            <dt>{t("invoice.meta.tracking_no")}</dt>
            <dd className="font-mono">{data.outbound.tracking_no ?? "—"}</dd>
            <dt>{t("invoice.meta.shipment_type")}</dt>
            <dd>{data.outbound.shipment_type}</dd>
          </div>
          <div>
            <dt>{t("invoice.meta.date_created")}</dt>
            <dd>{fmtDate(data.outbound.createdAt)}</dd>
            <dt>{t("invoice.meta.date_dispatched")}</dt>
            <dd>{fmtDate(data.outbound.label_obtained_at)}</dd>
            <dt>{t("invoice.meta.weight")}</dt>
            <dd>
              {(data.outbound.actual_weight_kg ??
                data.outbound.declared_weight_kg ??
                0
              ).toFixed(2)}{" "}
              kg
            </dd>
            <dt>{t("invoice.meta.boxes_inbounds")}</dt>
            <dd>
              {t("invoice.meta.boxes_inbounds_fmt", {
                boxes: data.outbound.box_count,
                inbounds: data.inbound_ids.length,
              })}
            </dd>
          </div>
        </dl>

        <div className="invoice-addr">
          <div>
            <h3>{t("invoice.sender")}</h3>
            <div className="name">{data.sender.name}</div>
            <div>{data.sender.address}</div>
            <div>
              {data.sender.postal_code} {data.sender.country_code}
            </div>
            <div>{data.sender.phone}</div>
          </div>
          <div>
            <h3>{t("invoice.receiver")}</h3>
            <div className="name">{data.receiver.name}</div>
            <div>{data.receiver.address}</div>
            <div>
              {data.receiver.district && `${data.receiver.district}, `}
              {data.receiver.city} {data.receiver.postal_code ?? ""}{" "}
              {data.receiver.country_code}
            </div>
            <div>{data.receiver.phone}</div>
          </div>
        </div>

        <table className="invoice-items">
          <thead>
            <tr>
              <th style={{ width: "8%" }}>#</th>
              <th>{t("invoice.col.product")}</th>
              <th className="num">{t("invoice.col.qty")}</th>
              <th className="num">{t("invoice.col.unit_price")}</th>
              <th className="num">{t("invoice.col.subtotal")}</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((it, i) => (
              <tr key={i}>
                <td className="num">{i + 1}</td>
                <td>
                  <div>{it.product_name}</div>
                  {(it.category_name || it.subcategory_name) && (
                    <div className="invoice-cat">
                      {[it.category_name, it.subcategory_name]
                        .filter(Boolean)
                        .join(" › ")}
                    </div>
                  )}
                </td>
                <td className="num">{it.quantity}</td>
                <td className="num">{fmtMoney(it.unit_price, it.currency)}</td>
                <td className="num">{fmtMoney(it.subtotal, it.currency)}</td>
              </tr>
            ))}
            {data.items.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", color: "#888" }}>
                  {t("invoice.empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="invoice-totals">
          <table>
            <tbody>
              <tr>
                <td>{t("invoice.totals.items_count")}</td>
                <td className="num">{data.totals.items_count}</td>
              </tr>
              <tr>
                <td>{t("invoice.totals.total_quantity")}</td>
                <td className="num">{data.totals.total_quantity}</td>
              </tr>
              <tr className="grand">
                <td>{t("invoice.totals.grand_total")}</td>
                <td className="num">
                  {fmtMoney(data.totals.grand_total, data.totals.currency)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="invoice-footer">
          <div>
            {t("invoice.footer.generated_at", {
              ts: new Date().toLocaleString(),
            })}
          </div>
          <div className="invoice-sig">
            <div className="line"></div>
            <div>{t("invoice.footer.signature")}</div>
          </div>
        </div>
      </article>
    </>
  );
}
