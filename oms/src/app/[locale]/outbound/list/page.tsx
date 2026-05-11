// Phase 7 rewrite — replaces the inherited legacy outbound list page that
// drove the old outbound model. The new list is backed by /api/cms/outbound
// which uses v1 schema.

"use client";

import PageLayout from "@/components/page-layout";
import { OutboundList } from "@/components/outbound-list";

export default function Page() {
  return (
    <PageLayout
      title="outbound_v1.page_title"
      description="outbound_v1.page_subtitle"
      path={[{ name: "outbound_v1.page_title", href: "#" }]}
    >
      <OutboundList />
    </PageLayout>
  );
}
