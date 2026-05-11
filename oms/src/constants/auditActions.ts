// audit_logs.action enum — centralized per review §6.1.
// Adding a new action: extend AUDIT_ACTIONS first, then call auditService.log().
// Bare strings will be rejected by TypeScript at the call site.

export const AUDIT_ACTIONS = {
  // ── Phase 1 — client account ───────────────────────────────
  client_registered: "client_registered",
  client_email_verified: "client_email_verified",
  client_email_verify_resent: "client_email_verify_resent",
  client_logged_in: "client_logged_in",
  client_login_failed: "client_login_failed",
  client_password_changed: "client_password_changed",
  client_password_reset_requested: "client_password_reset_requested",
  client_password_reset_completed: "client_password_reset_completed",
  client_local_password_set: "client_local_password_set",
  client_oauth_google_linked: "client_oauth_google_linked",
  client_oauth_google_signed_up: "client_oauth_google_signed_up",
  client_onboarding_completed: "client_onboarding_completed",
  client_profile_updated: "client_profile_updated",
  // admin-on-client actions (WMS admin operating client account)
  admin_client_status_toggled: "admin_client_status_toggled",
  admin_client_password_reset_link_generated:
    "admin_client_password_reset_link_generated",

  // ── Phase 2 — carrier master + client carrier binding ────────
  admin_carrier_created: "admin_carrier_created",
  admin_carrier_updated: "admin_carrier_updated",
  admin_carrier_status_toggled: "admin_carrier_status_toggled",
  client_carrier_account_created: "client_carrier_account_created",
  client_carrier_account_updated: "client_carrier_account_updated",
  client_carrier_account_set_default: "client_carrier_account_set_default",
  client_carrier_account_disabled: "client_carrier_account_disabled",
  client_carrier_account_enabled: "client_carrier_account_enabled",
  client_carrier_account_deleted: "client_carrier_account_deleted",
  client_carrier_oauth_started: "client_carrier_oauth_started",
  client_carrier_oauth_completed: "client_carrier_oauth_completed",
  client_carrier_oauth_failed: "client_carrier_oauth_failed",
  admin_carrier_reauth_link_sent: "admin_carrier_reauth_link_sent",
  cross_service_sync_failed: "cross_service_sync_failed",

  // ── Phase 3 — wallet ─────────────────────────────────────────
  wallet_topup_requested: "wallet_topup_requested",
  wallet_topup_approved: "wallet_topup_approved",
  wallet_topup_rejected: "wallet_topup_rejected",
  wallet_charged: "wallet_charged",
  wallet_refunded: "wallet_refunded",
  wallet_adjusted: "wallet_adjusted",
  wallet_balance_rebuilt: "wallet_balance_rebuilt",

  // ── Phase 4 — inbound declaration ────────────────────────────
  inbound_created: "inbound_created",
  inbound_updated: "inbound_updated",
  inbound_cancelled: "inbound_cancelled",
  inbound_abandoned_by_client: "inbound_abandoned_by_client",
  inbound_abandoned_by_admin: "inbound_abandoned_by_admin",
  admin_inbound_created_for_client: "admin_inbound_created_for_client",

  // ── Phase 5 — WMS scan ───────────────────────────────────────
  inbound_arrived: "inbound_arrived",
  inbound_arrive_cancelled: "inbound_arrive_cancelled",
  inbound_received: "inbound_received",
  inbound_anomaly_detected: "inbound_anomaly_detected",
  inbound_status_adjusted: "inbound_status_adjusted",
  unclaimed_arrived: "unclaimed_arrived",
  staff_abandoned_handled: "staff_abandoned_handled",

  // ── Phase 6 — unclaimed processing ───────────────────────────
  unclaimed_assigned: "unclaimed_assigned",
  unclaimed_assignment_cancelled: "unclaimed_assignment_cancelled",
  unclaimed_accepted_by_client: "unclaimed_accepted_by_client",
  unclaimed_rejected_by_client: "unclaimed_rejected_by_client",
  unclaimed_self_claimed: "unclaimed_self_claimed",
  unclaimed_disposed: "unclaimed_disposed",
  unclaimed_merged_to_existing: "unclaimed_merged_to_existing",

  // ── Phase 7 — outbound creation + rate quote + label ─────────
  outbound_created: "outbound_created",
  outbound_held: "outbound_held",
  outbound_held_released: "outbound_held_released",
  outbound_cancelled: "outbound_cancelled",
  outbound_single_completed: "outbound_single_completed",
  outbound_rate_quoted: "outbound_rate_quoted",
  outbound_label_obtaining: "outbound_label_obtaining",
  outbound_label_obtained: "outbound_label_obtained",
  outbound_label_failed: "outbound_label_failed",
  outbound_balance_reserved: "outbound_balance_reserved",

  // ── Phase 8 — WMS outbound flow (pick/pack/weigh/depart) ────
  outbound_picking_progress: "outbound_picking_progress",
  outbound_picked: "outbound_picked",
  outbound_packing_progress: "outbound_packing_progress",
  outbound_packed: "outbound_packed",
  outbound_weighing_progress: "outbound_weighing_progress",
  outbound_weight_verified: "outbound_weight_verified",
  outbound_box_created: "outbound_box_created",
  outbound_box_weight_override: "outbound_box_weight_override",
  outbound_label_printed: "outbound_label_printed",
  outbound_departed: "outbound_departed",
  outbound_box_departed: "outbound_box_departed",
  outbound_cancelled_after_label: "outbound_cancelled_after_label",
  outbound_label_client_confirmed: "outbound_label_client_confirmed",
  outbound_admin_retry_label: "outbound_admin_retry_label",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export const AUDIT_ACTOR_TYPES = {
  client: "client",
  admin: "admin",
  staff: "staff",
  wms_staff: "wms_staff",
  system: "system",
  anonymous: "anonymous",
} as const;

export type AuditActorType =
  (typeof AUDIT_ACTOR_TYPES)[keyof typeof AUDIT_ACTOR_TYPES];

export const AUDIT_TARGET_TYPES = {
  client: "client",
  inbound: "inbound",
  outbound: "outbound",
  outbound_box: "outbound_box",
  wallet: "wallet",
  wallet_transaction: "wallet_transaction",
  carrier_account: "carrier_account",
  carrier: "carrier",
  box: "box",
  staff: "staff",
  unclaimed_inbound: "unclaimed_inbound",
  topup_request: "topup_request",
} as const;

export type AuditTargetType =
  (typeof AUDIT_TARGET_TYPES)[keyof typeof AUDIT_TARGET_TYPES];
