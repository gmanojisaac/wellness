// Client helpers for the admin panel, backed by Supabase (RLS enforces admin access).
import { createClient } from './supabase/client';

export class AdminAuthError extends Error {}

let client;
export function getSupabase() {
  if (!client) client = createClient();
  return client;
}

// Calls a Postgres function, mapping auth failures to AdminAuthError.
export async function adminRpc(fn, args) {
  const { data, error } = await getSupabase().rpc(fn, args);
  if (error) {
    if (error.code === '42501' || error.code === 'PGRST301' || error.code === 'PGRST303') {
      throw new AdminAuthError('You do not have access to the admin panel. Please sign in again.');
    }
    throw new Error(error.message || 'Request failed.');
  }
  return data;
}

// Returns the signed-in user if they are an admin, otherwise null.
export async function getCurrentAdmin() {
  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const isAdmin = await adminRpc('is_admin');
  return isAdmin ? user : null;
}

export async function signOut() {
  await getSupabase().auth.signOut();
}

export function loginRedirectUrl() {
  const next = window.location.pathname + window.location.search;
  return `/admin/login?next=${encodeURIComponent(next)}`;
}
