"use client";

import PageLayout from "@/components/page-layout";
import { TopupRequestsList } from "@/components/topup-requests-list";

export default function Page() {
  return (
    <PageLayout
      title="wallet.requests.title"
      description="wallet.subtitle"
      path={[
        { name: "wallet.title", href: "/zh-hk/wallet" },
        { name: "wallet.requests.title", href: "#" },
      ]}
    >
      <TopupRequestsList />
    </PageLayout>
  );
}
