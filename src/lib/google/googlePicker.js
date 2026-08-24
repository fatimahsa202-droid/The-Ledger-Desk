import { GOOGLE_PICKER_API_KEY } from "./googleConfig.js";

let gapiLoadPromise = null;
function loadGapiPicker() {
  if (window.google?.picker) return Promise.resolve();
  if (gapiLoadPromise) return gapiLoadPromise;
  gapiLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://apis.google.com/js/api.js";
    script.async = true;
    script.defer = true;
    script.onload = () => {
      window.gapi.load("picker", { callback: resolve, onerror: () => reject(new Error("Failed to load the Google Picker library.")) });
    };
    script.onerror = () => reject(new Error("Failed to load Google's API script — check your connection and try again."));
    document.head.appendChild(script);
  });
  return gapiLoadPromise;
}

/**
 * Opens Google's own file picker, scoped to Spreadsheets, using the
 * short-lived access token from google-oauth-exchange. Resolves with
 * { id, name } for the chosen spreadsheet, or null if the user cancels.
 * Only ever grants access to whatever the user explicitly picks here
 * (the drive.file scope) — never a broader Drive listing.
 */
export async function openSheetPicker(accessToken) {
  await loadGapiPicker();
  return new Promise((resolve, reject) => {
    try {
      const view = new window.google.picker.DocsView(window.google.picker.ViewId.SPREADSHEETS).setIncludeFolders(true).setSelectFolderEnabled(false);
      const picker = new window.google.picker.PickerBuilder()
        .setOAuthToken(accessToken)
        .setDeveloperKey(GOOGLE_PICKER_API_KEY)
        .addView(view)
        .setCallback((data) => {
          if (data.action === window.google.picker.Action.PICKED) {
            const doc = data.docs?.[0];
            resolve(doc ? { id: doc.id, name: doc.name } : null);
          } else if (data.action === window.google.picker.Action.CANCEL) {
            resolve(null);
          }
        })
        .build();
      picker.setVisible(true);
    } catch (err) {
      reject(err);
    }
  });
}
