"use client";

import PageLayout from "@/components/page-layout";
import { InboundAcceptForm } from "@/components/inbound-accept-form";
import { useParams } from "next/navigation";

export default function Page() {
  const params = useParams<{ unclaimedId: string }>();
  return (
    <PageLayout
      title="unclaimed_ui.accept_page_title"
      description=""
      path={[
        { name: "inbound_v1.page_title", href: "/zh-hk/inbound/list" },
        {
          name: "unclaimed_ui.pending_confirm_page_title",
          href: "/zh-hk/inbound/pending-confirm",
        },
        { name: "unclaimed_ui.accept_page_title", href: "#" },
      ]}
    >
      <InboundAcceptForm unclaimedId={params.unclaimedId} />
    </PageLayout>
  );
}
