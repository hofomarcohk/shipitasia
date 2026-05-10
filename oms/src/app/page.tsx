"use client";
import { redirect } from "next/navigation";
import { useEffect } from "react";

export default function Page() {
  useEffect(() => {
    const lastLang = localStorage.getItem("lang");
    if (lastLang) {
      redirect(`/${lastLang}/`);
    }
    redirect("/en/");
  }, []);

  return <div>Redirecting...</div>;
}
