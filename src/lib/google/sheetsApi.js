/**
 * Direct, read-only calls to the Google Sheets API using the short-lived
 * access token from google-oauth-exchange — safe to do straight from the
 * browser at setup time (the same token already drives the Picker; this
 * is just a preview read for column mapping, not the ongoing sync, which
 * happens server-side in sheets-sync).
 */

async function sheetsFetch(path, accessToken) {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error?.message || `Google Sheets API error (${res.status})`);
  return body;
}

/** All tab (sheet/tab) names in a spreadsheet. */
export async function listSheetTabs(accessToken, spreadsheetId) {
  const body = await sheetsFetch(`${spreadsheetId}?fields=sheets.properties(sheetId,title)`, accessToken);
  return (body.sheets || []).map((s) => ({ sheetId: s.properties.sheetId, title: s.properties.title }));
}

/** Row 1 of a tab — the header row used to populate the Name/Date column-mapping dropdowns. */
export async function getHeaderRow(accessToken, spreadsheetId, tabTitle) {
  const range = encodeURIComponent(`'${tabTitle}'!1:1`);
  const body = await sheetsFetch(`${spreadsheetId}/values/${range}`, accessToken);
  return (body.values?.[0] || []).map((v) => String(v || "").trim()).filter(Boolean);
}
