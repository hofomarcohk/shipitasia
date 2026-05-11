"use client";

import PageLayout from "@/components/page-layout";
import { AdminTopupQueue } from "@/components/admin-topup-queue";

export default function Page() {
  return (
    <PageLayout
      title="admin_wallet.queue_title"
      description="admin_wallet.queue_subtitle"
      path={[
        { name: "admin_wallet.queue_title", href: "#" },
      ]}
    >
      <AdminTopupQueue />
    </PageLayout>
  );
}
