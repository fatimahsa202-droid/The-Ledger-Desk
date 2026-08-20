import React, { createContext, useContext, useEffect, useSyncExternalStore, useCallback } from "react";
import { cloudSync } from "../lib/cloud/CloudSyncEngine.js";
import { subscribe, getSnapshot } from "../lib/cloud/diagnostics.js";

const CloudSyncContext = createContext(null);

export function useCloudSync() {
  const ctx = useContext(CloudSyncContext);
  if (!ctx) throw new Error("useCloudSync must be used within CloudSyncProvider");
  return ctx;
}

export function CloudSyncProvider({ children }) {
  const diagnostics = useSyncExternalStore(subscribe, getSnapshot);

  useEffect(() => {
    // Auto-connect on startup: uses a stored per-device override if one
    // exists (set from Advanced), otherwise the build's baked-in default.
    // A no-op if neither is available (e.g. a local dev checkout with no
    // baked-in config).
    cloudSync.initFromStorage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = useCallback((url, anonKey) => cloudSync.connect(url, anonKey), []);
  const disconnect = useCallback(() => cloudSync.disconnect(), []);
  const resetToDefault = useCallback(() => cloudSync.resetToDefault(), []);
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
    resetToDefault,
    requestSignInEmail,
    completeSignIn,
    reconcileNow,
    flushOutboxNow,
  };

  return <CloudSyncContext.Provider value={value}>{children}</CloudSyncContext.Provider>;
}
