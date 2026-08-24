/**
 * Baked-in Google OAuth Client ID for the deployed Ledger Desk build, same
 * pattern as src/lib/cloud/deployedConfig.js for the Supabase URL/anon key.
 *
 * Safe to commit and ship in a public client bundle: an OAuth Client ID is
 * not a secret — Google's own docs treat it as public, embeddable
 * information, the same way the Supabase anon key is. It only identifies
 * which app is requesting authorization; it grants no access by itself.
 * The Google Client Secret — the one that *would* be privileged — never
 * appears here or anywhere else in this app. It lives only as a Supabase
 * Edge Function secret, used solely inside google-oauth-exchange.
 */

export const GOOGLE_OAUTH_CLIENT_ID = "414572547619-itfm9r14c7aajvb211s3bgn3su94jcih.apps.googleusercontent.com";

/** Minimum scopes needed: drive.file for Picker access to only files the user explicitly opens (never full Drive), spreadsheets (read+write) for reading Sheet data and writing Ledger Desk's own hidden identity column. */
export const GOOGLE_OAUTH_SCOPES = "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets";
