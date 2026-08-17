import { useState, useEffect, useRef, useCallback } from "react";
import { storage } from "../lib/storage.js";

/**
 * State that hydrates from the storage adapter on mount and persists back
 * to it (debounced) whenever it changes. Mirrors the original tracker's
 * load/save effects but generalized into one hook per key.
 */
export function useStoredState(key, initialValue, { debounceMs = 500 } = {}) {
  const [value, setValue] = useState(initialValue);
  const [loaded, setLoaded] = useState(false);
  const skipNextPersist = useRef(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await storage.get(key);
        if (!cancelled && stored !== undefined) {
          setValue((prev) =>
            typeof initialValue === "object" && initialValue !== null && !Array.isArray(initialValue)
              ? { ...initialValue, ...stored }
              : stored
          );
        }
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!loaded) return;
    if (skipNextPersist.current) {
      skipNextPersist.current = false;
      return;
    }
    const t = setTimeout(() => {
      storage.set(key, value);
    }, debounceMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, loaded, key, debounceMs]);

  return [value, setValue, loaded];
}

export function useDebouncedCommit(id, value, onCommit, delay = 500) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const t = setTimeout(() => {
      if (local !== value) onCommit(local);
    }, delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local]);
  return [local, setLocal];
}
