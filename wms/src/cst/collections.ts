export const collections = {
  // WMS
  STAFF: "staffs",
  STAFF_ROLE: "staff_roles",
  MENU: "menu_urls",
  MENU_PDA: "pda_menu_urls",
  ADMIN: "admins",

  // Warehouse
  WAREHOUSE: "warehouses",
  LOCATION: "locations",
  ITEM_LOCATION: "item_locations",
  LOGISTIC_PARTY: "logistic_parties",

  // inbound
  INBOUND: "inbound_requests",
  ARRIVE_LOG: "arrive_logs",
  RECEIVE_LOG: "receive_logs",

  // Outbound
  OUTBOUND: "outbound_requests",
  PICK_LIST: "pick_lists",
  PICK_LOG: "pick_logs",
  PACK_LIST: "pack_lists",
  PACK_BOXES: "pack_boxes",
  PACK_LOG: "pack_logs",
  PALLET_LIST: "pallet_lists",
  DEPARTURE_LIST: "departure_lists",
  DEPARTURE_LOG: "departure_logs",

  // List
  COUNTRY: "countries",
  RESTRICTION: "restrictions",
  CATEGORY: "categories",

  // Logs
  INCOMING_API_LOG: "incoming_api_logs",
  OUTGOING_API_LOG: "outgoing_api_logs",
  INBOUND_LOG: "inbound_logs",
  OUTBOUND_LOG: "outbound_logs",
  CLIENT_LOG: "client_logs",
  CRONJOB_LOG: "cronjob_logs",
};

export const ID_Prefix: {
  [key: string]: string;
} = {
  [collections.STAFF]: "S",
  [collections.ADMIN]: "C",
  [collections.INBOUND]: "I",
  [collections.OUTBOUND]: "O",
};
