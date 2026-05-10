import { ResetPasswordForm } from "@/components/reset-password-form";
import { Suspense } from "react";

export default function Page() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center px-4">
      <Suspense fallback={null}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
