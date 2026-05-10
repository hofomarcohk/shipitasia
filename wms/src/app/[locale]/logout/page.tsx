"use client";
import { LogoutForm } from "@/components/logout-form";
import { get_request } from "@/lib/httpRequest";
import { useEffect } from "react";

// logout page
export default function Page() {
  useEffect(() => {
    const logout = async () => {
      localStorage.setItem("is404", "true");
      await get_request("/api/wms/logout");
    };
    logout();
  }, []);

  return (
    <div className="flex h-screen w-full items-center justify-center px-4 ">
      <LogoutForm />
    </div>
  );
}
