"use client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { http_request } from "@/lib/httpRequest";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { LanguageBar } from "./lang-bar";
import { GoogleAuthButton } from "./google-auth-button";

type ClientType = "business" | "end_user";

export const RegisterForm = () => {
  const t = useTranslations();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [clientType, setClientType] = useState<ClientType>("end_user");
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [taxId, setTaxId] = useState("");
  const [invoiceTitle, setInvoiceTitle] = useState("");
  const [invoiceAddress, setInvoiceAddress] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);

  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const [resendMessage, setResendMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        email,
        password,
        client_type: clientType,
        display_name: displayName,
        phone,
        terms_accepted: termsAccepted,
      };
      if (clientType === "business") {
        body.company_info = {
          tax_id: taxId,
          invoice_title: invoiceTitle,
          invoice_address: invoiceAddress,
        };
      }
      const res = await http_request("POST", "/api/cms/auth/register", body);
      const data = await res.json();
      if (res.ok && data.status === 200) {
        setSubmittedEmail(email);
        return;
      }
      // zod errors from middleware come back as data.data array
      if (Array.isArray(data.data)) {
        setError(
          data.data
            .map((e: any) => e.message ?? JSON.stringify(e))
            .join("; ")
        );
      } else {
        setError(data.message || "Register failed");
      }
    } catch (err) {
      console.error(err);
      setError("An unexpected error occurred");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (!submittedEmail) return;
    setResendMessage("");
    try {
      const res = await http_request(
        "POST",
        "/api/cms/auth/resend-verify",
        { email: submittedEmail }
      );
      const data = await res.json();
      setResendMessage(data.message || "");
    } catch (err) {
      console.error(err);
    }
  };

  if (submittedEmail) {
    return (
      <Card className="mx-auto w-[60%] max-w-2xl">
        <CardHeader />
        <CardContent>
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="text-3xl font-semibold">
              {t("auth.register.success_title")}
            </div>
            <div className="text-gray-600 text-center max-w-md">
              {t("auth.register.success_body").replace(
                "{email}",
                submittedEmail
              )}
            </div>
            <div className="flex flex-col items-center gap-2 mt-2">
              <Button variant="outline" onClick={handleResend}>
                {t("auth.register.resend")}
              </Button>
              {resendMessage && (
                <p className="text-sm text-gray-500">{resendMessage}</p>
              )}
            </div>
            <Link href="/zh-hk/login" className="underline text-sm mt-2">
              {t("auth.forgot.back_to_login")}
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mx-auto w-[60%] max-w-2xl">
      <CardHeader />
      <CardContent>
        <div className="grid gap-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-3xl font-semibold">
                {t("auth.register.title")}
              </div>
              <div className="text-gray-600 text-sm mt-1">
                {t("auth.register.description")}{" "}
                <Link href="/zh-hk/login" className="underline">
                  {t("auth.register.login_link")}
                </Link>
              </div>
            </div>
            <LanguageBar />
          </div>

          <GoogleAuthButton />
          <div className="flex items-center gap-2">
            <div className="h-px bg-gray-200 flex-1" />
            <span className="text-xs text-gray-400">or</span>
            <div className="h-px bg-gray-200 flex-1" />
          </div>

          <form onSubmit={handleSubmit} className="grid gap-4">
            {/* Account type */}
            <div className="grid gap-2">
              <Label>{t("auth.register.client_type")}</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={clientType === "end_user" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setClientType("end_user")}
                >
                  {t("auth.register.type_end_user")}
                </Button>
                <Button
                  type="button"
                  variant={clientType === "business" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setClientType("business")}
                >
                  {t("auth.register.type_business")}
                </Button>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="email">{t("auth.register.email")}</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="password">{t("auth.register.password")}</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <p className="text-xs text-gray-500">
                {t("auth.register.password_hint")}
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="display_name">
                {t("auth.register.display_name")}
              </Label>
              <Input
                id="display_name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={
                  clientType === "business"
                    ? t("auth.register.display_name_business_hint")
                    : t("auth.register.display_name_end_user_hint")
                }
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="phone">{t("auth.register.phone")}</Label>
              <Input
                id="phone"
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </div>

            {clientType === "business" && (
              <div className="grid gap-3 rounded-md border p-4 bg-gray-50">
                <div className="text-sm font-semibold">
                  {t("auth.register.company_info_title")}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="tax_id">
                    {t("auth.register.company_tax_id")}
                  </Label>
                  <Input
                    id="tax_id"
                    value={taxId}
                    onChange={(e) => setTaxId(e.target.value)}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="invoice_title">
                    {t("auth.register.company_invoice_title")}
                  </Label>
                  <Input
                    id="invoice_title"
                    value={invoiceTitle}
                    onChange={(e) => setInvoiceTitle(e.target.value)}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="invoice_address">
                    {t("auth.register.company_invoice_address")}
                  </Label>
                  <Input
                    id="invoice_address"
                    value={invoiceAddress}
                    onChange={(e) => setInvoiceAddress(e.target.value)}
                    required
                  />
                </div>
              </div>
            )}

            <div className="flex items-start gap-2">
              <Checkbox
                id="terms"
                checked={termsAccepted}
                onCheckedChange={(v) => setTermsAccepted(v === true)}
                required
              />
              <Label htmlFor="terms" className="text-sm font-normal leading-5">
                {t("auth.register.terms")}{" "}
                <Link href="#" className="underline">
                  {t("auth.register.terms_link")}
                </Link>{" "}
                {t("auth.register.and")}{" "}
                <Link href="#" className="underline">
                  {t("auth.register.privacy_link")}
                </Link>
              </Label>
            </div>

            {error && (
              <p className="text-red-500 text-sm" role="alert">
                {error}
              </p>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={submitting || !termsAccepted}
            >
              {submitting
                ? t("auth.register.submitting")
                : t("auth.register.submit")}
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
};
