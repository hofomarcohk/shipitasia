"use client";

import { useToast } from "@/hooks/use-toast";
import { post_request } from "@/lib/httpRequest";
import { useCallback } from "react";

interface MutationOptions {
  /** Success toast title; default "已送出" */
  successTitle?: string;
  /** Optional success toast description */
  successDescription?: string;
}

/**
 * Wraps an OMS mutation `fetch` with a uniform toast UX.
 * - 200 → success toast
 * - non-200 → destructive toast with API-provided message
 * - thrown / network → destructive toast with the error message
 *
 * Note: stage views use mock row IDs that won't exist in the real DB; expect
 * 404 INBOUND_NOT_FOUND etc until backed by live data hooks.
 */
export function useShipmentMutation() {
  const { toast } = useToast();

  return useCallback(
    async (
      url: string,
      body: unknown = {},
      opts: MutationOptions = {}
    ): Promise<{ ok: boolean; data?: unknown; message?: string }> => {
      try {
        const r = await post_request(url, body);
        const json = await r.json();
        if (json.status === 200) {
          toast({
            title: opts.successTitle ?? "已送出",
            description: opts.successDescription,
          });
          return { ok: true, data: json.data };
        }
        toast({
          title: "操作失敗",
          description: json.message ?? `HTTP ${json.status}`,
          variant: "destructive",
        });
        return { ok: false, message: json.message };
      } catch (e) {
        toast({
          title: "網絡錯誤",
          description: e instanceof Error ? e.message : String(e),
          variant: "destructive",
        });
        return { ok: false, message: String(e) };
      }
    },
    [toast]
  );
}
