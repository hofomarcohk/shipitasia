"use client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { http_request } from "@/lib/httpRequest";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

interface Profile {
  _id: string;
  email: string;
  display_name: string;
  phone: string;
  client_type: "business" | "end_user";
  company_info: {
    tax_id: string;
    invoice_title: string;
    invoice_address: string;
  } | null;
  status: string;
  email_verified: boolean;
  has_local_password: boolean;
  oauth_providers: { provider: string; linked_at: string }[];
  balance: number;
  createdAt: string;
  updatedAt: string;
}

export const ProfileForm = () => {
  const t = useTranslations();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState("");

  // Editable fields
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [taxId, setTaxId] = useState("");
  const [invoiceTitle, setInvoiceTitle] = useState("");
  const [invoiceAddress, setInvoiceAddress] = useState("");

  const loadProfile = async () => {
    setLoading(true);
    try {
      const res = await http_request("GET", "/api/cms/profile", {});
      const data = await res.json();
      if (res.ok && data.status === 200) {
        const p = data.data as Profile;
        setProfile(p);
        setDisplayName(p.display_name);
        setPhone(p.phone);
        setTaxId(p.company_info?.tax_id ?? "");
        setInvoiceTitle(p.company_info?.invoice_title ?? "");
        setInvoiceAddress(p.company_info?.invoice_address ?? "");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, []);

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    setSaveMessage("");
    setSaveError("");
    try {
      const body: Record<string, unknown> = {
        display_name: displayName,
        phone,
      };
      if (profile.client_type === "business") {
        body.company_info = {
          tax_id: taxId,
          invoice_title: invoiceTitle,
          invoice_address: invoiceAddress,
        };
      }
      const res = await http_request("PATCH", "/api/cms/profile", body);
      const data = await res.json();
      if (res.ok && data.status === 200) {
        setProfile(data.data);
        setSaveMessage(t("common.save_success"));
        setEditing(false);
      } else {
        setSaveError(data.message || t("common.save_failed"));
      }
    } catch (err) {
      console.error(err);
      setSaveError(t("common.save_failed"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-center py-12">{t("common.loading")}</div>;
  }
  if (!profile) {
    return (
      <div className="text-center py-12 text-red-500">
        Failed to load profile
      </div>
    );
  }

  const status = profile.status as keyof typeof profile.status &
    "pending_verification" | "active" | "disabled" | "inactive" | "locked" | "deleted";
  const ct = profile.client_type;

  return (
    <div className="grid gap-6 max-w-3xl mx-auto py-8 px-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-semibold">{t("profile.title")}</h1>
              <p className="text-gray-600 text-sm">{t("profile.subtitle")}</p>
            </div>
            {!editing ? (
              <Button onClick={() => setEditing(true)}>
                {t("profile.edit")}
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditing(false);
                    loadProfile();
                  }}
                  disabled={saving}
                >
                  {t("profile.cancel")}
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? t("common.loading") : t("profile.save")}
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid sm:grid-cols-2 gap-4">
            <Field label={t("profile.fields.email")}>
              <span>{profile.email}</span>
              <span className="ml-2 text-xs text-gray-400">
                {t("profile.fields.email_locked")}
              </span>
            </Field>
            <Field label={t("profile.fields.client_type")}>
              <span>
                {ct === "business"
                  ? t("profile.client_type.business")
                  : t("profile.client_type.end_user")}
              </span>
              <span className="ml-2 text-xs text-gray-400">
                {t("profile.fields.client_type_locked")}
              </span>
            </Field>
            <Field label={t("profile.fields.display_name")}>
              {editing ? (
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              ) : (
                profile.display_name
              )}
            </Field>
            <Field label={t("profile.fields.phone")}>
              {editing ? (
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              ) : (
                profile.phone
              )}
            </Field>
            <Field label={t("profile.fields.status")}>
              <StatusBadge status={profile.status} t={t} />
            </Field>
            <Field label={t("profile.fields.balance")}>
              <span
                className={
                  profile.balance < 0 ? "text-red-600 font-medium" : ""
                }
              >
                HK$ {profile.balance.toLocaleString()}
              </span>
            </Field>
            <Field label={t("profile.fields.created_at")}>
              {new Date(profile.createdAt).toLocaleString()}
            </Field>
            <Field label={t("profile.fields.updated_at")}>
              {new Date(profile.updatedAt).toLocaleString()}
            </Field>
          </dl>

          {ct === "business" && (
            <div className="mt-6 rounded-md border p-4 bg-gray-50">
              <h3 className="font-semibold mb-3">
                {t("profile.fields.company_info")}
              </h3>
              <dl className="grid sm:grid-cols-2 gap-4">
                <Field label={t("profile.fields.company_tax_id")}>
                  {editing ? (
                    <Input
                      value={taxId}
                      onChange={(e) => setTaxId(e.target.value)}
                    />
                  ) : (
                    profile.company_info?.tax_id ?? "—"
                  )}
                </Field>
                <Field label={t("profile.fields.company_invoice_title")}>
                  {editing ? (
                    <Input
                      value={invoiceTitle}
                      onChange={(e) => setInvoiceTitle(e.target.value)}
                    />
                  ) : (
                    profile.company_info?.invoice_title ?? "—"
                  )}
                </Field>
                <Field
                  label={t("profile.fields.company_invoice_address")}
                  span2
                >
                  {editing ? (
                    <Input
                      value={invoiceAddress}
                      onChange={(e) => setInvoiceAddress(e.target.value)}
                    />
                  ) : (
                    profile.company_info?.invoice_address ?? "—"
                  )}
                </Field>
              </dl>
            </div>
          )}

          {saveMessage && (
            <div className="mt-4 rounded-md bg-green-50 border border-green-200 p-3 text-sm text-green-700">
              {saveMessage}
            </div>
          )}
          {saveError && (
            <div className="mt-4 rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
              {saveError}
            </div>
          )}
        </CardContent>
      </Card>

      <PasswordCard
        hasLocalPassword={profile.has_local_password}
        onChanged={loadProfile}
      />

      <GoogleLinkCard
        oauthProviders={profile.oauth_providers}
      />
    </div>
  );
};

function Field({
  label,
  children,
  span2,
}: {
  label: string;
  children: React.ReactNode;
  span2?: boolean;
}) {
  return (
    <div className={span2 ? "sm:col-span-2" : undefined}>
      <dt className="text-xs uppercase text-gray-500 mb-1">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function StatusBadge({
  status,
  t,
}: {
  status: string;
  t: (key: string) => string;
}) {
  const cls =
    status === "active"
      ? "bg-green-100 text-green-700 border-green-300"
      : status === "pending_verification"
      ? "bg-amber-100 text-amber-700 border-amber-300"
      : "bg-gray-100 text-gray-700 border-gray-300";
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded border text-xs ${cls}`}
    >
      {t(`profile.status.${status}`)}
    </span>
  );
}

function PasswordCard({
  hasLocalPassword,
  onChanged,
}: {
  hasLocalPassword: boolean;
  onChanged: () => void;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSubmit = async () => {
    setError("");
    setSuccess("");
    if (next !== confirm) {
      setError(t("auth.reset.mismatch"));
      return;
    }
    setSubmitting(true);
    try {
      const url = hasLocalPassword
        ? "/api/cms/profile/change-password"
        : "/api/cms/profile/set-password";
      const body = hasLocalPassword
        ? { current_password: current, new_password: next }
        : { new_password: next };
      const res = await http_request("POST", url, body);
      const data = await res.json();
      if (res.ok && data.status === 200) {
        setSuccess(
          hasLocalPassword
            ? t("profile.password.success")
            : t("profile.password.set_success")
        );
        setCurrent("");
        setNext("");
        setConfirm("");
        setOpen(false);
        onChanged();
        return;
      }
      if (Array.isArray(data.data)) {
        setError(
          data.data
            .map((e: any) => e.message ?? JSON.stringify(e))
            .join("; ")
        );
      } else {
        setError(data.message || "Failed");
      }
    } catch (err) {
      console.error(err);
      setError("An unexpected error occurred");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <h2 className="text-xl font-semibold">{t("profile.password.title")}</h2>
        {!hasLocalPassword && (
          <p className="text-sm text-gray-600 mt-1">
            {t("profile.password.set_local_hint")}
          </p>
        )}
      </CardHeader>
      <CardContent>
        {!open ? (
          <Button variant="outline" onClick={() => setOpen(true)}>
            {hasLocalPassword
              ? t("profile.password.change")
              : t("profile.password.set_local")}
          </Button>
        ) : (
          <div className="grid gap-3 max-w-md">
            {hasLocalPassword && (
              <div className="grid gap-1">
                <Label htmlFor="current_pw">
                  {t("profile.password.current")}
                </Label>
                <Input
                  id="current_pw"
                  type="password"
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                />
              </div>
            )}
            <div className="grid gap-1">
              <Label htmlFor="new_pw">{t("profile.password.new")}</Label>
              <Input
                id="new_pw"
                type="password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="confirm_pw">
                {t("profile.password.confirm")}
              </Label>
              <Input
                id="confirm_pw"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <div className="flex gap-2">
              <Button onClick={handleSubmit} disabled={submitting}>
                {submitting ? t("common.loading") : t("profile.password.submit")}
              </Button>
              <Button variant="outline" onClick={() => setOpen(false)}>
                {t("profile.cancel")}
              </Button>
            </div>
          </div>
        )}
        {success && (
          <div className="mt-3 rounded-md bg-green-50 border border-green-200 p-3 text-sm text-green-700">
            {success}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function GoogleLinkCard({
  oauthProviders,
}: {
  oauthProviders: { provider: string; linked_at: string }[];
}) {
  const t = useTranslations();
  const linked = oauthProviders.some((p) => p.provider === "google");

  const handleLink = async () => {
    // Placeholder per Marco's pivot — backend route returns 501 with the
    // friendly "coming soon" message; surface it directly to the user.
    try {
      const res = await http_request(
        "POST",
        "/api/cms/profile/link-google",
        {}
      );
      const data = await res.json();
      alert(data.message || t("profile.google.link_unavailable"));
    } catch {
      alert(t("profile.google.link_unavailable"));
    }
  };

  return (
    <Card>
      <CardHeader>
        <h2 className="text-xl font-semibold">{t("profile.google.title")}</h2>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <span className="text-sm">
            {linked
              ? t("profile.google.linked")
              : t("profile.google.not_linked")}
          </span>
          {!linked && (
            <Button variant="outline" onClick={handleLink}>
              {t("profile.google.link")}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
