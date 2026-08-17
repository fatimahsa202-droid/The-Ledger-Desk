import { useEffect } from "react";

/**
 * Registers global keyboard shortcuts. `map` is { "mod+k": fn, "g d": fn, ... }.
 * "mod" means Cmd on Mac, Ctrl elsewhere. Ignored while typing in an input,
 * textarea, or contenteditable element (except mod+k which always works).
 */
export function useKeyboardShortcuts(map, deps = []) {
  useEffect(() => {
    let chordBuffer = "";
    let chordTimer = null;

    function isTypingTarget(el) {
      if (!el) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
    }

    function handler(e) {
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      if (mod && key === "k") {
        e.preventDefault();
        map["mod+k"]?.(e);
        return;
      }

      if (isTypingTarget(e.target)) return;

      if (mod) {
        const combo = `mod+${key}`;
        if (map[combo]) {
          e.preventDefault();
          map[combo](e);
        }
        return;
      }

      if (e.key === "Escape") {
        map["esc"]?.(e);
        return;
      }

      if (/^[a-z0-9?]$/.test(key)) {
        clearTimeout(chordTimer);
        chordBuffer += (chordBuffer ? " " : "") + key;
        if (map[chordBuffer]) {
          e.preventDefault();
          map[chordBuffer](e);
          chordBuffer = "";
          return;
        }
        const hasPrefix = Object.keys(map).some((k) => k.startsWith(chordBuffer + " "));
        if (!hasPrefix) {
          chordBuffer = /^[a-z0-9?]$/.test(key) ? key : "";
        }
        chordTimer = setTimeout(() => (chordBuffer = ""), 900);
      }
    }

    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
      clearTimeout(chordTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
