import React from "react";

export function ReconciledStamp({ date }) {
  return (
    <div className="reconciled-stamp select-none">
      <div className="font-display" style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.18em" }}>RECONCILED ✓</div>
      <div className="mono" style={{ fontSize: 9, opacity: 0.85, marginTop: 4, paddingTop: 4, borderTop: "1px solid var(--green)", letterSpacing: "0.08em" }}>
        {(date ? new Date(date) : new Date()).toLocaleDateString("en-GB")}
      </div>
    </div>
  );
}
