"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { IconBoxOff } from "@tabler/icons-react";

/** Loading skeleton used by all 6 stage views while data is fetching. */
export function StageLoading({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  );
}

/** Empty state placeholder. */
export function StageEmpty({
  title = "暫時冇貨件",
  description,
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 py-12 text-center">
      <IconBoxOff size={28} className="text-muted-foreground" />
      <p className="mt-2 text-[13px] font-medium text-foreground">{title}</p>
      {description && (
        <p className="mt-1 text-[12px] text-muted-foreground">{description}</p>
      )}
    </div>
  );
}

/** Error state with a retry button. */
export function StageError({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-destructive/40 bg-destructive/5 py-12 text-center">
      <p className="text-[13px] font-medium text-destructive">資料載入失敗</p>
      <p className="mt-1 text-[12px] text-muted-foreground">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-md border border-border bg-background px-3 py-1 text-[12px] hover:bg-muted/40"
        >
          重新載入
        </button>
      )}
    </div>
  );
}
