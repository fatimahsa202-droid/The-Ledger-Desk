import { useRef, useCallback } from "react";

/**
 * Tiny synthesized UI sounds via Web Audio — no audio files, so the app
 * stays a single self-contained HTML file. Off by default; gated by the
 * `enabled` flag from Settings.
 */
export function useSound(enabled) {
  const ctxRef = useRef(null);

  const getCtx = useCallback(() => {
    if (!ctxRef.current) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      ctxRef.current = new AudioCtx();
    }
    return ctxRef.current;
  }, []);

  const beep = useCallback(
    (freqs, { duration = 0.12, gain = 0.05, type = "sine", stagger = 0.09 } = {}) => {
      if (!enabled) return;
      const ctx = getCtx();
      if (!ctx) return;
      if (ctx.state === "suspended") ctx.resume();
      freqs.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        const start = ctx.currentTime + i * stagger;
        g.gain.setValueAtTime(0, start);
        g.gain.linearRampToValueAtTime(gain, start + 0.015);
        g.gain.exponentialRampToValueAtTime(0.001, start + duration);
        osc.connect(g).connect(ctx.destination);
        osc.start(start);
        osc.stop(start + duration + 0.02);
      });
    },
    [enabled, getCtx]
  );

  return {
    playComplete: () => beep([523.25, 659.25, 783.99], { type: "triangle" }),
    playLevelUp: () => beep([392, 523.25, 659.25, 783.99, 987.77], { type: "triangle", stagger: 0.08, duration: 0.18 }),
    playBadge: () => beep([659.25, 987.77], { type: "sine", stagger: 0.1, duration: 0.2 }),
    playTick: () => beep([880], { type: "square", duration: 0.04, gain: 0.02 }),
    playStart: () => beep([440, 660], { type: "sine", stagger: 0.06, duration: 0.1 }),
  };
}
