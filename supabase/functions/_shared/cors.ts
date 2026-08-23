// Shared CORS headers for every Edge Function in this project. The
// frontend (GitHub Pages) calls these functions cross-origin via
// supabase-js's functions.invoke(), which still needs a normal CORS
// preflight to succeed. No cookies/credentials ever cross this boundary
// (auth is a Bearer token in the Authorization header), so a permissive
// Access-Control-Allow-Origin is safe here — nothing privileged is
// exposed by allowing any origin to *attempt* a call; every function
// still independently verifies the caller's Supabase JWT before doing
// anything.
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function handleCorsPreflight(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return null;
}
