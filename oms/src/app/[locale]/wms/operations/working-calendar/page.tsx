"use client";

import PageLayout from "@/components/page-layout";
import { WorkingCalendarAdmin } from "@/components/wms/working-calendar-admin";

export default function Page() {
  return (
    <PageLayout
      title="wms_working_calendar.page_title"
      description="wms_working_calendar.page_subtitle"
      path={[{ name: "wms_working_calendar.page_title", href: "#" }]}
    >
      <WorkingCalendarAdmin />
    </PageLayout>
  );
}
