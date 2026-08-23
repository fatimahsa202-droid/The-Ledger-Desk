// Two distinct Supabase clients, matching the two distinct trust levels
// every function in this integration needs:
//
//  - adminClient(): uses the service_role key, which Supabase injects
//    automatically into every Edge Function's environment as
//    SUPABASE_SERVICE_ROLE_KEY — nothing to configure for this one.
//    Bypasses RLS entirely, which is exactly why it's the only thing
//    allowed to touch google_oauth_tokens (that table has zero
//    client-facing policies at all).
//
//  - callerClient(req): uses the anon key plus the caller's own
//    Authorization header, so auth.getUser() resolves to the REAL signed-
//    in user making this request. Never trust a user_id passed in a
//    request body — always derive it this way.
import { createClient } from "npm:@supabase/supabase-js@2";

export function adminClient() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, serviceRoleKey);
}

export async function requireCallerUserId(req: Request): Promise<string> {
  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new Error("Missing Authorization header");

  const client = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data, error } = await client.auth.getUser();
  if (error || !data?.user) throw new Error("Not authenticated");
  return data.user.id;
}
