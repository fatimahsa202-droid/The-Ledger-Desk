import React, { useState } from "react";
import { Icon } from "../../lib/Icon.jsx";
import { IconButton } from "../primitives.jsx";
import { connectGoogleAccount, finalizeConnection, abandonPendingConnection } from "../../lib/google/sheetConnectionsApi.js";
import { openSheetPicker } from "../../lib/google/googlePicker.js";
import { listSheetTabs, getHeaderRow } from "../../lib/google/sheetsApi.js";

const STEP = { CONNECT: "connect", PICK: "pick", MAP: "map" };

/** Choose Sheet -> choose Tab -> map Date + Name -> Connect, per the approved flow. Modal, reusing the existing overlay/modal pattern. */
export function ConnectSheetWizard({ onClose, onConnected }) {
  const [step, setStep] = useState(STEP.CONNECT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [connectionId, setConnectionId] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [spreadsheet, setSpreadsheet] = useState(null); // { id, name }
  const [tabs, setTabs] = useState([]);
  const [selectedTab, setSelectedTab] = useState("");
  const [headers, setHeaders] = useState([]);
  const [nameColumn, setNameColumn] = useState("");
  const [dateColumn, setDateColumn] = useState("");
  const [displayName, setDisplayName] = useState("");

  const handleClose = async () => {
    if (connectionId && step !== STEP.CONNECT) {
      // Setup was started but never finished — the row only ever held pending_setup, no Scheduled Names data, safe to remove.
      await abandonPendingConnection(connectionId).catch(() => {});
    }
    onClose();
  };

  const handleConnectGoogle = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await connectGoogleAccount();
      setConnectionId(result.connectionId);
      setAccessToken(result.accessToken);
      const doc = await openSheetPicker(result.accessToken);
      if (!doc) {
        setBusy(false);
        return; // user cancelled the picker — stay on this step, connection row stays pending_setup until Close
      }
      setSpreadsheet(doc);
      setDisplayName(doc.name);
      const tabList = await listSheetTabs(result.accessToken, doc.id);
      setTabs(tabList);
      const firstTab = tabList[0]?.title || "";
      setSelectedTab(firstTab);
      if (firstTab) {
        const headerRow = await getHeaderRow(result.accessToken, doc.id, firstTab);
        setHeaders(headerRow);
      }
      setStep(STEP.MAP);
    } catch (err) {
      setError(err.message || "Something went wrong connecting to Google.");
    } finally {
      setBusy(false);
    }
  };

  const handleTabChange = async (title) => {
    setSelectedTab(title);
    setNameColumn("");
    setDateColumn("");
    setBusy(true);
    setError("");
    try {
      const headerRow = await getHeaderRow(accessToken, spreadsheet.id, title);
      setHeaders(headerRow);
    } catch (err) {
      setError(err.message || "Could not read that tab's columns.");
    } finally {
      setBusy(false);
    }
  };

  const handleFinishConnect = async () => {
    setBusy(true);
    setError("");
    try {
      await finalizeConnection(connectionId, {
        displayName: displayName.trim() || spreadsheet.name,
        spreadsheetId: spreadsheet.id,
        spreadsheetName: spreadsheet.name,
        sheetTab: selectedTab,
        columnMapping: { name: nameColumn, date: dateColumn },
      });
      onConnected?.(connectionId);
    } catch (err) {
      setError(err.message || "Could not save this connection.");
      setBusy(false);
    }
  };

  return (
    <>
      <div className="overlay" onClick={handleClose} />
      <div className="modal">
        <div className="modal-panel" style={{ maxWidth: 520 }} role="dialog" aria-modal="true" aria-label="Connect Google Sheet">
          <div style={{ padding: 22 }}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg fw-bold">Connect Google Sheet</h3>
              <IconButton name="x" label="Close" onClick={handleClose} />
            </div>

            {error && (
              <div className="text-xs mb-3" style={{ color: "var(--rust)", background: "color-mix(in srgb, var(--rust) 10%, transparent)", borderRadius: 8, padding: "8px 10px" }}>
                {error}
              </div>
            )}

            {step === STEP.CONNECT && (
              <div>
                <p className="text-sm dim mb-4">
                  You'll sign in with Google, then pick the spreadsheet you want reflected in Ledger Desk's Calendar. Only the file you choose is shared with Ledger Desk — nothing else in your Drive.
                </p>
                <button className="btn btn-primary" onClick={handleConnectGoogle} disabled={busy}>
                  <Icon name="cloud" size={15} /> {busy ? "Connecting…" : "Connect Google Account"}
                </button>
              </div>
            )}

            {step === STEP.MAP && (
              <div>
                <div className="eyebrow mb-2">Spreadsheet</div>
                <div className="text-sm fw-semibold mb-4 truncate">{spreadsheet?.name}</div>

                <label className="field-label">Tab</label>
                <select className="select mb-3" value={selectedTab} onChange={(e) => handleTabChange(e.target.value)} disabled={busy}>
                  {tabs.map((t) => <option key={t.sheetId} value={t.title}>{t.title}</option>)}
                </select>

                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div>
                    <label className="field-label">Name column</label>
                    <select className="select" value={nameColumn} onChange={(e) => setNameColumn(e.target.value)} disabled={busy || headers.length === 0}>
                      <option value="">Choose a column…</option>
                      {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="field-label">Date column</label>
                    <select className="select" value={dateColumn} onChange={(e) => setDateColumn(e.target.value)} disabled={busy || headers.length === 0}>
                      <option value="">Choose a column…</option>
                      {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                </div>

                {headers.length === 0 && !busy && <div className="text-xs dim mb-3">No header row found on this tab — pick another tab, or add column headers to row 1.</div>}

                <label className="field-label">Connection name</label>
                <input className="input mb-4" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. Reception Schedule" />

                <button className="btn btn-primary" onClick={handleFinishConnect} disabled={busy || !nameColumn || !dateColumn}>
                  {busy ? "Connecting…" : "Connect"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
