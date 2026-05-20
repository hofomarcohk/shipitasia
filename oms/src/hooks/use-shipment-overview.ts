"use client";

import type { ShipmentStageKey } from "@/components/shipment/ShipmentPipeline";
import { get_request } from "@/lib/httpRequest";
import { useCallback, useEffect, useRef, useState } from "react";

interface UseOverviewResult<T> {
  data: T | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Fetch the stage-specific overview data + poll every `pollMs`.
 * The response shape varies per stage — caller asserts the type.
 *
 *   useShipmentOverview<{ rows: WaitingInboundRow[] }>("waiting_inbound")
 */
export function useShipmentOverview<T>(
  stage: ShipmentStageKey,
  opts: { pollMs?: number } = {}
): UseOverviewResult<T> {
  const pollMs = opts.pollMs ?? 30_000;
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const fetcher = useCallback(async () => {
    try {
      const r = await get_request(`/api/cms/shipments/overview`, { stage });
      const json = await r.json();
      if (!mountedRef.current) return;
      if (json.status === 200) {
        setData(json.data as T);
        setError(null);
      } else {
        setError(json.message ?? `HTTP ${json.status}`);
      }
    } catch (e) {
      if (!mountedRef.current) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, [stage]);

  useEffect(() => {
    mountedRef.current = true;
    setIsLoading(true);
    void fetcher();
    const iv = setInterval(() => {
      void fetcher();
    }, pollMs);
    const onFocus = () => fetcher();
    const onRevalidate = () => fetcher();
    window.addEventListener("focus", onFocus);
    window.addEventListener("shipments:refetch", onRevalidate);
    return () => {
      mountedRef.current = false;
      clearInterval(iv);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("shipments:refetch", onRevalidate);
    };
  }, [fetcher, pollMs]);

  return { data, isLoading, error, refetch: fetcher };
}

/**
 * Pipeline node badges. Polls counts/30s.
 */
export function usePipelineCounts(opts: { pollMs?: number } = {}) {
  const pollMs = opts.pollMs ?? 30_000;
  const [counts, setCounts] = useState<Record<ShipmentStageKey, number> | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);
  const mountedRef = useRef(true);

  const fetcher = useCallback(async () => {
    try {
      const r = await get_request(`/api/cms/shipments/counts`);
      const json = await r.json();
      if (!mountedRef.current) return;
      if (json.status === 200) {
        setCounts(json.data as Record<ShipmentStageKey, number>);
      }
    } catch {
      // silently ignore — pipeline shows last-known counts
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    setIsLoading(true);
    void fetcher();
    const iv = setInterval(() => {
      void fetcher();
    }, pollMs);
    const onFocus = () => fetcher();
    const onRevalidate = () => fetcher();
    window.addEventListener("focus", onFocus);
    window.addEventListener("shipments:refetch", onRevalidate);
    return () => {
      mountedRef.current = false;
      clearInterval(iv);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("shipments:refetch", onRevalidate);
    };
  }, [fetcher, pollMs]);

  return { counts, isLoading, refetch: fetcher };
}
