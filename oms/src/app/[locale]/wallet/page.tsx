"use client";

import PageLayout from "@/components/page-layout";
import { WalletPage } from "@/components/wallet-page";

export default function Page() {
  return (
    <PageLayout
      title="wallet.title"
      description="wallet.subtitle"
      path={[
        { name: "wallet.title", href: "#" },
      ]}
    >
      <WalletPage />
    </PageLayout>
  );
}
