// P17 — sentinels for system-owned (no-customer) flows.
//
// Used by:
//   - YT auto-outbound rows in outbound_requests / outbound_inbound_links
//   - System carrier accounts in client_carrier_accounts
//
// Defined here rather than in yt-service so pack / weigh / depart code
// can branch on it without importing the YT module (avoids cycles).

export const SYSTEM_CLIENT_ID = "SYS-YT";
