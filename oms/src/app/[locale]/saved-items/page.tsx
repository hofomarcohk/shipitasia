"use client";

import PageLayout from "@/components/page-layout";
import { SavedItemsPage } from "@/components/saved-items-page";

export default function Page() {
  return (
    <PageLayout
      title="saved_items.page_title"
      description="saved_items.page_subtitle"
      path={[{ name: "saved_items.page_title", href: "#" }]}
    >
      <SavedItemsPage />
    </PageLayout>
  );
}
