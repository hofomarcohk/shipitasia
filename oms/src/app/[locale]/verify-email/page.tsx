import { VerifyEmailForm } from "@/components/verify-email-form";
import { Suspense } from "react";

export default function Page() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center px-4">
      <Suspense fallback={null}>
        <VerifyEmailForm />
      </Suspense>
    </div>
  );
}
