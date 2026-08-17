import { useCallback, useEffect, useRef } from "react";

/**
 * Thin wrapper over the browser Notification API for local reminders while
 * the app is open (streak-at-risk, daily goal nudges). This is NOT push —
 * it only fires while a tab is open, which is an honest limitation of a
 * backend-free app. Wiring real push/email reminders later just means
 * calling a server from the same call sites.
 */
export function useNotifications(enabled) {
  const permissionRef = useRef(typeof Notification !== "undefined" ? Notification.permission : "unsupported");

  const requestPermission = useCallback(async () => {
    if (typeof Notification === "undefined") return "unsupported";
    const result = await Notification.requestPermission();
    permissionRef.current = result;
    return result;
  }, []);

  const notify = useCallback(
    (title, options) => {
      if (!enabled) return;
      if (typeof Notification === "undefined") return;
      if (Notification.permission !== "granted") return;
      try {
        new Notification(title, { icon: undefined, badge: undefined, ...options });
      } catch {
        /* some browsers restrict Notification() outside a service worker */
      }
    },
    [enabled]
  );

  return { notify, requestPermission, permission: permissionRef.current };
}

export function useStreakRiskReminder(enabled, { streak, lastActiveDate, notify }) {
  useEffect(() => {
    if (!enabled || !streak) return;
    const todayStr = new Date().toDateString();
    if (lastActiveDate === todayStr) return;
    const now = new Date();
    if (now.getHours() < 20) return;
    const t = setTimeout(() => {
      notify(`Keep your ${streak}-day streak alive`, {
        body: "You haven't logged any work today yet — a few minutes keeps it going.",
      });
    }, 1500);
    return () => clearTimeout(t);
  }, [enabled, streak, lastActiveDate, notify]);
}
