"use client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { http_request } from "@/lib/httpRequest";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface Carrier {
  carrier_code: string;
  name_zh: string;
  name_en: string;
  auth_type: "api_key" | "oauth";
  logo_url: string | null;
}

interface CredentialField {
  key: string;
  label_zh: string;
  label_en: string;
  type: "text" | "password" | "checkbox";
  required: boolean;
  placeholder?: string;
  validation?: { pattern?: string; min_length?: number; max_length?: number };
  is_secret: boolean;
}

interface CarrierFields {
  carrier_code: string;
  name_zh: string;
  name_en: string;
  auth_type: "api_key" | "oauth";
  credential_fields: CredentialField[];
}

export const CarrierAccountNewForm = () => {
  const t = useTranslations();
  const router = useRouter();
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [selectedCode, setSelectedCode] = useState("");
  const [fields, setFields] = useState<CarrierFields | null>(null);
  const [nickname, setNickname] = useState("");
  const [credentials, setCredentials] = useState<Record<string, unknown>>({});
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await http_request("GET", "/api/cms/carriers", {});
      const data = await res.json();
      if (data.status === 200) setCarriers(data.data);
    })();
  }, []);

  useEffect(() => {
    if (!selectedCode) {
      setFields(null);
      return;
    }
    (async () => {
      const res = await http_request(
        "GET",
        `/api/cms/carriers/${selectedCode}/fields`,
        {}
      );
      const data = await res.json();
      if (data.status === 200) {
        setFields(data.data);
        // Reset credentials shape based on the new carrier's fields
        const seed: Record<string, unknown> = {};
        for (const f of data.data.credential_fields as CredentialField[]) {
          seed[f.key] = f.type === "checkbox" ? false : "";
        }
        setCredentials(seed);
      }
    })();
  }, [selectedCode]);

  const submitApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await http_request(
        "POST",
        "/api/cms/carrier-accounts",
        {
          carrier_code: selectedCode,
          nickname,
          credentials,
        }
      );
      const data = await res.json();
      if (res.ok && data.status === 200) {
        router.push("/zh-hk/carrier-accounts?success=1");
        return;
      }
      if (Array.isArray(data.data)) {
        setError(
          data.data.map((e: any) => e.message ?? JSON.stringify(e)).join("; ")
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

  const submitOAuth = () => {
    if (!selectedCode || !nickname.trim()) return;
    const url =
      `/api/cms/carrier/oauth/authorize?` +
      `carrier_code=${encodeURIComponent(selectedCode)}` +
      `&nickname=${encodeURIComponent(nickname.trim())}`;
    // Browser-level redirect — server returns 302 to mock-authorize / real
    // carrier authorize URL.
    window.location.href = url;
  };

  const selectedCarrier = carriers.find((c) => c.carrier_code === selectedCode);

  return (
    <div className="max-w-2xl mx-auto py-6 px-4 grid gap-4">
      <Card>
        <CardHeader>
          <h1 className="text-2xl font-semibold">
            {t("carriers.new.title")}
          </h1>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6">
            {/* Step 1 — choose carrier */}
            <div>
              <Label className="mb-2 block">
                {t("carriers.new.step_carrier")}
              </Label>
              <div className="grid grid-cols-2 gap-2">
                {carriers.map((c) => (
                  <button
                    key={c.carrier_code}
                    type="button"
                    onClick={() => setSelectedCode(c.carrier_code)}
                    className={`text-left rounded-md border px-4 py-3 transition ${
                      selectedCode === c.carrier_code
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <div className="font-medium">{c.name_zh}</div>
                    <div className="text-xs text-gray-500">
                      {c.name_en} ·{" "}
                      {c.auth_type === "api_key"
                        ? t("carriers.auth_type_api_key")
                        : t("carriers.auth_type_oauth")}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Step 2 — credentials or oauth */}
            {selectedCarrier && fields && (
              <>
                <div>
                  <Label className="mb-2 block">
                    {fields.auth_type === "api_key"
                      ? t("carriers.new.step_credentials")
                      : t("carriers.new.step_oauth")}
                  </Label>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="nickname">
                    {t("carriers.new.nickname")}
                  </Label>
                  <Input
                    id="nickname"
                    placeholder={t("carriers.new.nickname_hint")}
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                  />
                </div>

                {fields.auth_type === "api_key" ? (
                  <form onSubmit={submitApiKey} className="grid gap-4">
                    {fields.credential_fields.map((f) => (
                      <div key={f.key} className="grid gap-1">
                        <Label htmlFor={`field-${f.key}`}>
                          {f.label_zh}
                          {f.required && <span className="text-red-500"> *</span>}
                        </Label>
                        {f.type === "checkbox" ? (
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id={`field-${f.key}`}
                              checked={!!credentials[f.key]}
                              onCheckedChange={(v) =>
                                setCredentials({
                                  ...credentials,
                                  [f.key]: v === true,
                                })
                              }
                            />
                            <Label
                              htmlFor={`field-${f.key}`}
                              className="font-normal"
                            >
                              {f.label_en}
                            </Label>
                          </div>
                        ) : (
                          <>
                            <Input
                              id={`field-${f.key}`}
                              type={f.type === "password" ? "password" : "text"}
                              placeholder={f.placeholder}
                              value={(credentials[f.key] as string) ?? ""}
                              onChange={(e) =>
                                setCredentials({
                                  ...credentials,
                                  [f.key]: e.target.value,
                                })
                              }
                              required={f.required}
                              minLength={f.validation?.min_length}
                              maxLength={f.validation?.max_length}
                            />
                            {f.is_secret && (
                              <p className="text-xs text-gray-500">
                                {t("carriers.new.secret_field_hint")}
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    ))}
                    {error && (
                      <p className="text-red-500 text-sm" role="alert">
                        {error}
                      </p>
                    )}
                    <div className="flex gap-2">
                      <Link href="/zh-hk/carrier-accounts">
                        <Button variant="outline" type="button">
                          {t("carriers.new.back")}
                        </Button>
                      </Link>
                      <Button
                        type="submit"
                        disabled={
                          submitting || !nickname.trim() || !selectedCode
                        }
                      >
                        {submitting
                          ? t("carriers.new.creating")
                          : t("carriers.new.submit_api_key")}
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div className="grid gap-3">
                    <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-700">
                      您將跳轉至 {selectedCarrier.name_zh} 進行授權。授權後您將自動返回此頁。
                    </div>
                    <div className="flex gap-2">
                      <Link href="/zh-hk/carrier-accounts">
                        <Button variant="outline" type="button">
                          {t("carriers.new.back")}
                        </Button>
                      </Link>
                      <Button
                        type="button"
                        onClick={submitOAuth}
                        disabled={!nickname.trim()}
                      >
                        {t("carriers.new.submit_oauth").replace(
                          "{carrier}",
                          selectedCarrier.name_zh
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
