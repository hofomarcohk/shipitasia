"use client";
import { LogoutForm } from "@/components/logout-form";
import { http_request } from "@/lib/httpRequest";
import { useEffect } from "react";

// logout page
export default function Page() {
  useEffect(() => {
    const logout = async () => {
      localStorage.setItem("isUnauthorized", "true");
      await http_request("GET", "/api/cms/logout");
    };
    logout();
  }, []);

  return (
    <div className="flex h-screen w-full items-center justify-center px-4 ">
      <LogoutForm />
    </div>
  );
}
