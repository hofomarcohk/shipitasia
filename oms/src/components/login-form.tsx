"use client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { http_request } from "@/lib/httpRequest";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LanguageBar } from "./lang-bar";
import { GoogleAuthButton } from "./google-auth-button";

export const LoginForm = () => {
  const t = useTranslations();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await http_request("POST", "/api/cms/login", {
        email,
        password,
      });

      const data = await response.json();
      if (response.ok && data.status === 200) {
        router.push(`./inbound/list`);
        return;
      }
      setError(data.message || "Login failed");
    } catch (err) {
      console.error("Error during login:", err);
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="mx-auto w-[60%]">
      <CardHeader></CardHeader>
      <CardContent>
        <div className="flex justify-center">
          <div className="w-1/2 flex flex-col justify-top align-top relative">
            <div className="text-4xl font-600 mb-2">{t("login.login")}</div>
            <div className="text-gray-600 text-sm">
              {t("login.login_desc")}
            </div>
            <div className="absolute bottom-0">
              <LanguageBar />
            </div>
          </div>
          <div className="w-1/2">
            <form onSubmit={handleSubmit} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="email">{t("auth.register.email")}</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">{t("login.password")}</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              {error && (
                <p className="text-red-500 text-sm" role="alert">
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? t("common.loading") : t("login.login")}
              </Button>
            </form>

            <div className="my-4 flex items-center gap-2">
              <div className="h-px bg-gray-200 flex-1" />
              <span className="text-xs text-gray-400">or</span>
              <div className="h-px bg-gray-200 flex-1" />
            </div>

            <GoogleAuthButton />

            <div className="mt-6 text-center text-sm flex items-center justify-between">
              <div>
                {t("login.dont_have_account")}{" "}
                <Link href="/zh-hk/register" className="underline">
                  {t("login.signup")}
                </Link>
              </div>
              <div>
                <Link
                  href="/zh-hk/forgot-password"
                  className="ml-auto inline-block text-sm underline"
                >
                  {t("login.forgot_password")}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
