"use client";
import { createContext, useContext } from "react";
export const ServerDataContext = createContext(null);

// Provider
export function ServerDataProvider({
  children,
  serverData,
}: {
  children: any;
  serverData: any;
}) {
  return (
    <ServerDataContext.Provider value={serverData}>
      {children}
    </ServerDataContext.Provider>
  );
}

export function useServerData(): any {
  const context = useContext(ServerDataContext);
  if (!context) {
    throw new Error("useServerData must be used within a ServerDataProvider");
  }
  return context;
}
