/**
 * Baked-in Supabase connection for the deployed Ledger Desk build, so the
 * normal user never has to see or enter a Project URL / key.
 *
 * This is safe to commit and ship in a public client bundle: the
 * publishable (anon) key carries no privileged access by itself — it only
 * lets a client ask Supabase to authenticate a real user and then act as
 * that user. Row Level Security (`auth.uid() = user_id` on every table) is
 * what actually protects each account's data, not the secrecy of this key.
 * The service_role key — the one that *would* bypass RLS — never appears
 * here or anywhere else in this app.
 *
 * Left blank in local/dev checkouts on purpose: with no values here, the
 * app simply doesn't auto-connect, and Cloud Sync falls back to manual
 * entry under Settings -> Cloud Sync -> Advanced, which is exactly what a
 * developer testing against their own project wants.
 */

export const DEPLOYED_SUPABASE_URL = "https://kagtwgwgvoskshxjmvsd.supabase.co";
export const DEPLOYED_SUPABASE_ANON_KEY = "sb_publishable_ZCmTyPstZZEi9QwgbCbH9Q_P1_nAG9s";
