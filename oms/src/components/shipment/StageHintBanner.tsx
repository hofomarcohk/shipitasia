"use client";

import { IconInfoCircle } from "@tabler/icons-react";

interface StageHintBannerProps {
  title: string;
  hint: string;
}

export function StageHintBanner({ title, hint }: StageHintBannerProps) {
  return (
    <div className="flex items-baseline gap-3">
      <h1 className="text-[20px] font-semibold tracking-tight">{title}</h1>
      <span className="inline-flex items-center gap-1 text-[12.5px] text-muted-foreground">
        <IconInfoCircle size={13} />
        {hint}
      </span>
    </div>
  );
}
