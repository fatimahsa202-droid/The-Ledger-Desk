import React, { createContext, useContext, useEffect, useSyncExternalStore, useCallback } from "react";
import { cloudSync } from "../lib/cloud/CloudSyncEngine.js";
import { subscribe, getSnapshot } from "../lib/cloud/diagnostics.js";
import { getStoredConnection } from "../lib/cloud/supabaseClient.js";

const CloudSyncContext = createContext(null);

export function useCloudSync() {
  const ctx = useContext(CloudSyncContext);
  if (!ctx) throw new Error("useCloudSync must be used within CloudSyncProvider");
  return ctx;
}

export function CloudSyncProvider({ children }) {
  const diagnostics = useSyncExternalStore(subscribe, getSnapshot);

  useEffect(() => {
    if (getStoredConnection()) cloudSync.initFromStorage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = useCallback((url, anonKey) => cloudSync.connect(url, anonKey), []);
  const disconnect = useCallback(() => cloudSync.disconnect(), []);
  const requestSignInEmail = useCallback((email) => cloudSync.requestSignInEmail(email), []);
  const completeSignIn = useCallback((pastedValue) => cloudSync.completeSignIn(pastedValue), []);
  const reconcileNow = useCallback((reason) => cloudSync.reconcileNow(reason), []);
  const flushOutboxNow = useCallback(() => cloudSync.flushOutboxNow(), []);

  const value = {
    diagnostics,
    isConnected: cloudSync.isConnected(),
    authStrategy: cloudSync.authStrategy(),
    connect,
    disconnect,
    requestSignInEmail,
    completeSignIn,
    reconcileNow,
    flushOutboxNow,
  };

  return <CloudSyncContext.Provider value={value}>{children}</CloudSyncContext.Provider>;
}
