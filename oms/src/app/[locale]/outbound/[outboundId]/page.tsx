"use client";

import PageLayout from "@/components/page-layout";
import { OutboundDetail } from "@/components/outbound-detail";
import { useParams } from "next/navigation";

export default function Page() {
  const params = useParams<{ outboundId: string }>();
  return (
    <PageLayout
      title="outbound_v1.detail.title"
      description=""
      path={[
        { name: "outbound_v1.page_title", href: "/zh-hk/outbound/list" },
        { name: "outbound_v1.detail.title", href: "#" },
      ]}
    >
      <OutboundDetail outboundId={params.outboundId} />
    </PageLayout>
  );
}
