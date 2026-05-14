export const collections = {
  STAFF: "staffs",
  STAFF_ROLE: "staff_roles",
  MENU: "menu_urls",
  CLIENT: "clients",
  WAREHOUSE: "warehouses",
  INBOUND: "inbound_requests",

  OUTBOUND: "outbound_requests",
  AUTO_OUTBOUND_SETTING: "auto_outbound_settings",
  BILL: "client_bills",
  LOCATION: "locations",

  // List
  COUNTRY: "countries",
  RESTRICTION: "restrictions",
  CATEGORY: "categories",
  LOGISTIC_PARTY: "logistic_parties",

  API_RETRY: "api_retries",

  // Logs
  INCOMING_API_LOG: "incoming_api_logs",
  OUTGOING_API_LOG: "outgoing_api_logs",
  INBOUND_LOG: "inbound_logs",
  OUTBOUND_LOG: "outbound_logs",
  CLIENT_LOG: "client_logs",
  CRONJOB_LOG: "cronjob_logs",

  // P1 — append-only structured audit log (review §6.1)
  AUDIT_LOG: "audit_logs",

  // P2 — carrier master + client carrier bindings
  CARRIER: "carriers",
  CLIENT_CARRIER_ACCOUNT: "client_carrier_accounts",
  // P2 — cross-service sync failure log (per review §6.3, schema_def_phase=2)
  SYNC_FAILED_LOG: "sync_failed_logs",

  // P3 — wallet (append-only transactions + topup requests + clients.balance)
  WALLET_TRANSACTION: "wallet_transactions",
  TOPUP_REQUEST: "topup_requests",

  // P4 — inbound declaration
  CARRIER_INBOUND: "carriers_inbound",
  PRODUCT_CATEGORY: "product_categories",
  INBOUND_DECLARED_ITEM: "inbound_declared_items",
  DAILY_COUNTER: "daily_counters",
  NOTIFICATION: "notifications",

  // P5 — WMS scan (arrive + receive)
  INBOUND_SCAN: "inbound_scans",
  UNCLAIMED_INBOUND: "unclaimed_inbounds",
  STAFF_HANDLED_ABANDONED: "staff_handled_abandoned",
  // ITEM_LOCATION pre-existed in cst (legacy LOCATION key); add explicit
  // P5 entry so service code doesn't accidentally reuse LOCATION.
  ITEM_LOCATION: "item_locations",

  // P7 — outbound creation
  OUTBOUND_INBOUND_LINK: "outbound_inbound_links",
  OUTBOUND_ACTION_LOG: "outbound_action_logs",
  RATE_QUOTE_LOG: "rate_quote_logs",

  // P8 — WMS outbound flow (pick / pack / weigh / depart)
  OUTBOUND_BOX: "outbound_boxes",
  BOX_INBOUND_LINK: "box_inbound_links",
  OUTBOUND_BOX_WEIGHT: "outbound_box_weights",
  OUTBOUND_SCAN: "outbound_scans",

  // Bugfix wave 3 — client saved address book
  SAVED_ADDRESS: "saved_addresses",

  // P10 — client-managed saved item library (per-customer template store
  // for declared items, picked at inbound time to skip re-typing).
  SAVED_ITEM: "saved_items",

  // P10 — WMS pick batch (wave) + pallet label (post-weigh staging)
  PICK_BATCH: "pick_batches",
  PALLET_LABEL: "pallet_labels",

  // P11 — item-driven packing (client-scoped multi-outbound consolidation boxes)
  PACK_BOX_V1: "pack_boxes_v1",
  PACK_LOG_V1: "pack_logs_v1",
  BOX_SEQ: "box_seq_counters",

  // P12 — 秤重置板 (weigh + palletize) session lock (per warehouse single doc)
  PACK_SESSION_LOCK: "pack_session_locks",
};

export const ID_Prefix: {
  [key: string]: string;
} = {
  [collections.CLIENT]: "C",
  [collections.INBOUND]: "I",
  [collections.OUTBOUND]: "O",
  [collections.BILL]: "B",
  [collections.AUTO_OUTBOUND_SETTING]: "A",
};
