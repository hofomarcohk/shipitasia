"use client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { post_request } from "@/lib/httpRequest";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LanguageBar } from "./lang-bar";

export const LoginForm = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();
  const t = useTranslations();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      const response = await post_request("/api/wms/login", {
        username,
        password,
      });

      if (response.ok) {
        const data = await response.json();
        if (data.status === 200) {
          router.push(`./inbound/list`);
        } else {
          setError(t(data.message));
        }
      } else {
        const errorData = await response.json();
        setError(errorData.message || "Login failed");
      }
    } catch (error) {
      setError("An unexpected error occurred");
    }
  };

  return (
    <>
      <Card className="mx-auto w-full lg:w-[60%]">
        <CardHeader></CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row justify-center">
            <div className="w-full md:w-1/2 flex flex-col justify-top align-top relative  mb-4">
              <div className="text-4xl font-600 mb-2">{t("login.login")}</div>
              <div className="text-gray-600 text-sm">
                {t("login.login_desc")}
              </div>
            </div>
            <div className="w-full md:w-1/2 ">
              <form onSubmit={handleSubmit} className="grid gap-4 ">
                <div className="grid gap-2">
                  <Input
                    id="email"
                    type="text"
                    placeholder={t("login.username")}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    placeholder={t("login.password")}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                {error && <p className="text-red-500">{error}</p>}
                <Button type="submit" className="w-full mb-[150px]">
                  {t("login.login")}
                </Button>
              </form>
              <div className="mt-4 text-center text-sm flex items-center justify-between">
                <div>
                  {t("login.dont_have_account")}{" "}
                  <Link href="#" className="underline">
                    {t("login.signup")}
                  </Link>
                </div>
                <div>
                  <Link
                    href="#"
                    className="ml-auto inline-block text-sm underline"
                  >
                    {t("login.forgot_password")}
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <LanguageBar />
        </CardFooter>
      </Card>
    </>
  );
};
