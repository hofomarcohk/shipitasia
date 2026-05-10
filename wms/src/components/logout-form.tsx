"use client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { lang } from "@/lang/base";
import Link from "next/link";
import { LanguageBar } from "./lang-bar";
import { Button } from "./ui/button";

export const LogoutForm = () => {
  return (
    <>
      <Card className="mx-auto w-[60%]">
        <CardHeader></CardHeader>
        <CardContent>
          <div className="flex  justify-center">
            <div className="w-1/2 flex flex-col justify-top align-top relative">
              <div className="text-4xl font-600 mb-2">
                {lang("login.login")}
              </div>
              <div className="text-gray-600 text-sm">
                {lang("login.login_desc")}
              </div>
              <div className="absolute bottom-0 ">
                <LanguageBar />
              </div>
            </div>
            <div className="w-1/2 ">
              <div className="flex w-full items-center justify-center px-4">
                <div className="bg-white  text-center max-w-sm">
                  <div className="text-2xl font-bold  mb-2">
                    {lang("logout.logoutSuccess")}
                  </div>

                  <div className="text-gray-600 text-base mb-6">
                    {lang("logout.thxMsg")}
                  </div>

                  <Link href="/">
                    <Button type="submit" className="w-full mb-[150px]">
                      {lang("logout.backToHome")}
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
};
