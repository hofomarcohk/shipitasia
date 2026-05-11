// Phase 4 rewrite — replaces the inherited 465-line legacy list page
// that drove the old inbound model. The new list is backed by
// /api/cms/inbound + /api/cms/inbound/[id] which use v1 schema.

"use client";

import PageLayout from "@/components/page-layout";
import { InboundList } from "@/components/inbound-list";

export default function Page() {
  return (
    <PageLayout
      title="inbound_v1.page_title"
      description="inbound_v1.page_subtitle"
      path={[{ name: "inbound_v1.page_title", href: "#" }]}
    >
      <InboundList />
    </PageLayout>
  );
}
