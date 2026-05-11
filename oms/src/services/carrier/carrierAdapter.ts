// Phase 7 — ICarrierAdapter mock implementation.
//
// Per Marco's pivot, real carrier APIs (Yun Express / Fuuffy) are deferred
// to production cut-over. v1 ships entirely on mock adapters so the UI and
// state machine are exercisable end-to-end.
//
// Each adapter implements four entry points:
//   - rateQuote: returns the price breakdown for a (carrier, country, weight)
//   - getLabel:  returns a mock PDF label URL + tracking_no
//   - cancelLabel: idempotent void
//   - getTracking: returns a stub tracking blob (real impl in P9 calls UPS etc.)

import { ApiError } from "@/app/api/api-error";
import { collections } from "@/cst/collections";
import { connectToDatabase } from "@/lib/mongo";
import { RateQuoteBreakdown } from "@/types/OutboundV1";
import { generateMockLabel } from "@/services/util/pdfService";

// ── Tunable mock configuration (review.md §3.4) ────────────────

interface CarrierMockConfig {
  carrier_code: string;
  base_fee: number;
  per_kg_fee: number;
  carrier_multiplier: number;
  // Capacity rules: kg / cm dims. Reject if exceeded.
  max_weight_kg: number;
  // Country support (allowlist). "*" means all.
  supported_countries: string[] | "*";
  // Random failure rate (0-1) for forced label-fetch failures in dev.
  fail_rate: number;
}

// Mock config keyed by carrier_code. We accept both legacy spec aliases
// (yun_express) and the seeded carrier_code (yunexpress) so naming churn
// during pre-prod doesn't break the demo.
export const CARRIER_MOCK_CONFIG: Record<string, CarrierMockConfig> = {
  yunexpress: {
    carrier_code: "yunexpress",
    base_fee: 15,
    per_kg_fee: 8,
    carrier_multiplier: 1.0,
    max_weight_kg: 30,
    supported_countries: "*",
    fail_rate: 0,
  },
  yun_express: {
    carrier_code: "yun_express",
    base_fee: 15,
    per_kg_fee: 8,
    carrier_multiplier: 1.0,
    max_weight_kg: 30,
    supported_countries: "*",
    fail_rate: 0,
  },
  fuuffy: {
    carrier_code: "fuuffy",
    base_fee: 25,
    per_kg_fee: 12,
    carrier_multiplier: 1.2,
    max_weight_kg: 20,
    supported_countries: ["HK", "TW", "CN", "JP", "SG"],
    fail_rate: 0,
  },
};

export const COUNTRY_MULTIPLIER: Record<string, number> = {
  HK: 1.0,
  TW: 1.3,
  CN: 0.8,
  SG: 1.5,
  JP: 0.7,
  US: 2.5,
  GB: 2.2,
  AU: 2.4,
};

const DEFAULT_COUNTRY_MULTIPLIER = 1.8;

function countryMultiplier(code: string): number {
  return COUNTRY_MULTIPLIER[code] ?? DEFAULT_COUNTRY_MULTIPLIER;
}

// ── Adapter contract ──────────────────────────────────────────

export interface ICarrierAdapter {
  carrier_code: string;
  rateQuote(input: RateQuoteRequest): Promise<RateQuoteBreakdown>;
  getLabel(input: GetLabelRequest): Promise<GetLabelResponse>;
  cancelLabel(input: CancelLabelRequest): Promise<void>;
  getTracking(input: GetTrackingRequest): Promise<TrackingResponse>;
}

export interface RateQuoteRequest {
  destination_country: string;
  weight_kg: number;
}

export interface GetLabelRequest {
  outbound_id: string;
  destination_country: string;
  weight_kg: number;
  receiver_name: string;
  receiver_address: string;
}

export interface GetLabelResponse {
  label_url: string;
  tracking_no: string;
  charged_amount: number;
}

export interface CancelLabelRequest {
  outbound_id: string;
  tracking_no: string;
}

export interface GetTrackingRequest {
  tracking_no: string;
}

export interface TrackingResponse {
  tracking_no: string;
  status: string;
  last_event_at: Date | null;
  events: { code: string; at: Date; location: string | null }[];
}

// ── Shared mock logic ─────────────────────────────────────────

function quoteForConfig(
  cfg: CarrierMockConfig,
  destination_country: string,
  weight_kg: number
): RateQuoteBreakdown {
  if (
    Array.isArray(cfg.supported_countries) &&
    !cfg.supported_countries.includes(destination_country)
  ) {
    throw new ApiError("CARRIER_DESTINATION_UNSUPPORTED", {
      code: cfg.carrier_code,
      country: destination_country,
    });
  }
  if (weight_kg > cfg.max_weight_kg) {
    throw new ApiError("CAPACITY_VIOLATION", {
      detail: `weight ${weight_kg}kg > max ${cfg.max_weight_kg}kg for ${cfg.carrier_code}`,
    });
  }
  const cm = countryMultiplier(destination_country);
  const baseAndKg = cfg.base_fee + cfg.per_kg_fee * weight_kg;
  const total = Math.round(baseAndKg * cm * cfg.carrier_multiplier);
  return {
    carrier_code: cfg.carrier_code,
    base_fee: cfg.base_fee,
    per_kg_fee: cfg.per_kg_fee,
    weight_kg,
    country_multiplier: cm,
    carrier_multiplier: cfg.carrier_multiplier,
    surcharge: 0,
    total,
    currency: "HKD",
  };
}

function makeAdapter(cfg: CarrierMockConfig): ICarrierAdapter {
  return {
    carrier_code: cfg.carrier_code,
    async rateQuote(input) {
      return quoteForConfig(cfg, input.destination_country, input.weight_kg);
    },
    async getLabel(input) {
      // Optional dev-side forced failure.
      if (cfg.fail_rate > 0 && Math.random() < cfg.fail_rate) {
        throw new ApiError("LABEL_FETCH_FAILED", {
          reason: `simulated transient failure for ${cfg.carrier_code}`,
        });
      }
      const quote = quoteForConfig(
        cfg,
        input.destination_country,
        input.weight_kg
      );
      const tracking_no = mockTrackingNo(cfg.carrier_code);
      const label_url = await generateMockLabel({
        outbound_id: input.outbound_id,
        carrier_code: cfg.carrier_code,
        tracking_no,
        destination_country: input.destination_country,
        weight_kg: input.weight_kg,
        receiver_name: input.receiver_name,
        receiver_address: input.receiver_address,
      });
      return { label_url, tracking_no, charged_amount: quote.total };
    },
    async cancelLabel() {
      // mock: always succeed
    },
    async getTracking({ tracking_no }) {
      return {
        tracking_no,
        status: "in_transit",
        last_event_at: new Date(),
        events: [
          { code: "label_created", at: new Date(), location: null },
          { code: "picked_up", at: new Date(), location: "JP-SAITAMA" },
        ],
      };
    },
  };
}

function mockTrackingNo(carrier_code: string): string {
  const prefix = carrier_code.toUpperCase().slice(0, 3);
  const random = Math.random().toString(36).slice(2, 10).toUpperCase();
  return `${prefix}${Date.now().toString(36).toUpperCase()}${random}`;
}

// ── Registry / factory ─────────────────────────────────────────

const ADAPTER_CACHE: Map<string, ICarrierAdapter> = new Map();

export async function getCarrierAdapter(
  carrier_code: string
): Promise<ICarrierAdapter> {
  // Cache the adapter so consecutive calls in the same process reuse.
  const cached = ADAPTER_CACHE.get(carrier_code);
  if (cached) return cached;

  const cfg = CARRIER_MOCK_CONFIG[carrier_code];
  if (!cfg) {
    // Fall back: if a new carrier is added in P2 admin UI without a mock
    // override, synthesize a "default" mock so demos still work. Real
    // adapters arrive at production cut-over per Marco's pivot.
    const db = await connectToDatabase();
    const doc = await db
      .collection(collections.CARRIER)
      .findOne({ carrier_code, status: "active" });
    if (!doc) throw new ApiError("CARRIER_NOT_ENABLED", { code: carrier_code });
    const fallback: CarrierMockConfig = {
      carrier_code,
      base_fee: 20,
      per_kg_fee: 10,
      carrier_multiplier: 1.1,
      max_weight_kg: 25,
      supported_countries: "*",
      fail_rate: 0,
    };
    const adapter = makeAdapter(fallback);
    ADAPTER_CACHE.set(carrier_code, adapter);
    return adapter;
  }
  const adapter = makeAdapter(cfg);
  ADAPTER_CACHE.set(carrier_code, adapter);
  return adapter;
}

// ── Quote with logging (writes rate_quote_logs) ────────────────

export async function rateQuoteWithLog(input: {
  outbound_id: string | null;
  client_id: string;
  carrier_code: string;
  destination_country: string;
  weight_kg: number;
}): Promise<RateQuoteBreakdown> {
  const start = Date.now();
  const db = await connectToDatabase();
  let breakdown: RateQuoteBreakdown | null = null;
  let success = false;
  let error_code: string | null = null;
  let error_message: string | null = null;
  try {
    const adapter = await getCarrierAdapter(input.carrier_code);
    breakdown = await adapter.rateQuote({
      destination_country: input.destination_country,
      weight_kg: input.weight_kg,
    });
    success = true;
    return breakdown;
  } catch (err: any) {
    error_code = err?.code ?? err?.name ?? "UNKNOWN";
    error_message = String(err?.message ?? err);
    throw err;
  } finally {
    await db.collection(collections.RATE_QUOTE_LOG).insertOne({
      outbound_id: input.outbound_id,
      client_id: input.client_id,
      carrier_code: input.carrier_code,
      destination_country: input.destination_country,
      weight_kg: input.weight_kg,
      breakdown,
      success,
      error_code,
      error_message,
      latency_ms: Date.now() - start,
      createdAt: new Date(),
    });
  }
}
