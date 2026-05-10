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
