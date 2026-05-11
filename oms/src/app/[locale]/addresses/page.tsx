"use client";

import PageLayout from "@/components/page-layout";
import { SavedAddressesPage } from "@/components/saved-addresses";

export default function Page() {
  return (
    <PageLayout
      title="addresses.page_title"
      description="addresses.page_subtitle"
      path={[{ name: "addresses.page_title", href: "#" }]}
    >
      <SavedAddressesPage />
    </PageLayout>
  );
}
