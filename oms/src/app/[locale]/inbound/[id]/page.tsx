"use client";

import PageLayout from "@/components/page-layout";
import { InboundDetail } from "@/components/inbound-detail";
import { useParams } from "next/navigation";

export default function Page() {
  const params = useParams<{ id: string }>();
  return (
    <PageLayout
      title="inbound_v1.detail.title"
      description=""
      path={[
        { name: "inbound_v1.page_title", href: "/zh-hk/inbound/list" },
        { name: "inbound_v1.detail.title", href: "#" },
      ]}
    >
      <InboundDetail id={params.id} />
    </PageLayout>
  );
}
