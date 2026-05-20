"use client";

import PageLayout from "@/components/page-layout";
import { NewShipmentDialog } from "@/components/shipment/NewShipmentDialog";
import { ShipmentDetailProvider } from "@/components/shipment/ShipmentDetailProvider";
import { ShipmentPipeline, type ShipmentStageKey } from "@/components/shipment/ShipmentPipeline";
import { StageHintBanner } from "@/components/shipment/StageHintBanner";
import { Toaster } from "@/components/ui/toaster";
import { StageConsolidatedView } from "@/components/shipment/views/StageConsolidatedView";
import { StageDispatchedView } from "@/components/shipment/views/StageDispatchedView";
import { StageShelvedView } from "@/components/shipment/views/StageShelvedView";
import { StageWaitingConsolidateView } from "@/components/shipment/views/StageWaitingConsolidateView";
import { StageWaitingDispatchView } from "@/components/shipment/views/StageWaitingDispatchView";
import { StageWaitingInboundView } from "@/components/shipment/views/StageWaitingInboundView";
import { Button } from "@/components/ui/button";
import { usePipelineCounts } from "@/hooks/use-shipment-overview";
import { STAGES, STAGE_META } from "@/lib/shipment-mock";
import { IconDownload, IconPlus } from "@tabler/icons-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

const STAGE_KEYS: ShipmentStageKey[] = [
  "waiting_inbound",
  "shelved",
  "waiting_consolidate",
  "consolidated",
  "waiting_dispatch",
  "dispatched",
];

export default function ShipmentsPage() {
  const params = useParams<{ locale: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();

  const stageFromUrl =
    (searchParams.get("stage") as ShipmentStageKey | null) ||
    "waiting_inbound";
  const newFromUrl = searchParams.get("new") === "1";

  const [selectedStage, setSelectedStage] =
    useState<ShipmentStageKey>(stageFromUrl);
  const [dialogOpen, setDialogOpen] = useState(newFromUrl);

  // Keep state in sync with URL
  useEffect(() => {
    setSelectedStage(stageFromUrl);
  }, [stageFromUrl]);
  useEffect(() => {
    setDialogOpen(newFromUrl);
  }, [newFromUrl]);

  const updateUrl = useCallback(
    (next: { stage?: ShipmentStageKey; openNew?: boolean }) => {
      const sp = new URLSearchParams(searchParams.toString());
      if (next.stage) sp.set("stage", next.stage);
      if (next.openNew === true) sp.set("new", "1");
      if (next.openNew === false) sp.delete("new");
      router.replace(`/${params.locale}/shipments?${sp.toString()}`);
    },
    [searchParams, router, params.locale]
  );

  const handleStageChange = (key: ShipmentStageKey) => {
    setSelectedStage(key);
    updateUrl({ stage: key });
  };

  const handleOpenNew = () => {
    setDialogOpen(true);
    updateUrl({ openNew: true });
  };
  const handleCloseNew = (open: boolean) => {
    setDialogOpen(open);
    if (!open) updateUrl({ openNew: false });
  };

  const handleSubmitted = () => {
    // Land the user on Stage 1 「等待入庫」 so they see the just-submitted
    // forecast appear (event-driven refetch already fired from the dialog).
    setSelectedStage("waiting_inbound");
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("stage", "waiting_inbound");
    sp.delete("new");
    router.replace(`/${params.locale}/shipments?${sp.toString()}`);
  };

  // Keyboard ← / → to switch stage
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        document.activeElement &&
        ["INPUT", "TEXTAREA", "SELECT"].includes(
          document.activeElement.tagName
        )
      )
        return;
      const idx = STAGE_KEYS.indexOf(selectedStage);
      if (e.key === "ArrowRight" && idx < STAGE_KEYS.length - 1) {
        handleStageChange(STAGE_KEYS[idx + 1]);
      } else if (e.key === "ArrowLeft" && idx > 0) {
        handleStageChange(STAGE_KEYS[idx - 1]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStage]);

  const meta = STAGE_META[selectedStage];
  const { counts } = usePipelineCounts();

  const livePipeline = useMemo(
    () =>
      STAGES.map((s) => ({
        ...s,
        count: counts ? counts[s.key] ?? 0 : s.count,
        zero: counts ? (counts[s.key] ?? 0) === 0 : s.zero,
      })),
    [counts]
  );

  const view = useMemo(() => {
    switch (selectedStage) {
      case "waiting_inbound":
        return <StageWaitingInboundView />;
      case "shelved":
        return <StageShelvedView />;
      case "waiting_consolidate":
        return <StageWaitingConsolidateView />;
      case "consolidated":
        return <StageConsolidatedView />;
      case "waiting_dispatch":
        return <StageWaitingDispatchView />;
      case "dispatched":
        return <StageDispatchedView />;
    }
  }, [selectedStage]);

  return (
    <PageLayout path={[{ name: "shipments.title", href: "#" }]}>
      <ShipmentDetailProvider>
        <div className="space-y-5">
          {/* Page top bar */}
          <div className="flex items-end justify-between gap-3 flex-wrap">
            <StageHintBanner title={meta.title} hint={meta.hint} />
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm">
                <IconDownload size={14} className="mr-1.5" />
                匯出 CSV
              </Button>
              <Button size="sm" onClick={handleOpenNew}>
                <IconPlus size={14} className="mr-1.5" />
                新增預報
              </Button>
            </div>
          </div>

          {/* Pipeline */}
          <div className="rounded-lg border border-border bg-background p-5">
            <ShipmentPipeline
              stages={livePipeline}
              selected={selectedStage}
              onChange={handleStageChange}
            />
          </div>

          {/* Stage view */}
          {view}
        </div>

        <NewShipmentDialog
          open={dialogOpen}
          onOpenChange={handleCloseNew}
          onSubmitted={handleSubmitted}
        />
        <Toaster />
      </ShipmentDetailProvider>
    </PageLayout>
  );
}
