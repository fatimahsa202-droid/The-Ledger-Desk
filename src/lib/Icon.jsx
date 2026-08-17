import React from "react";
import { ICON_PATHS } from "./icon-paths.js";

/**
 * Renders a lucide-style outline icon from a locally embedded path table
 * (no runtime CDN dependency — see src/lib/icon-paths.js).
 */
export function Icon({ name, size = 16, strokeWidth = 2, className = "", style, ...rest }) {
  const inner = ICON_PATHS[name];
  if (!inner) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn(`Icon "${name}" not found`);
    }
    return null;
  }
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`icon icon-${name} ${className}`}
      style={style}
      aria-hidden="true"
      focusable="false"
      dangerouslySetInnerHTML={{ __html: inner }}
      {...rest}
    />
  );
}
