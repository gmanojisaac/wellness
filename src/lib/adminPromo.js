// Admin-panel data access for promo checkout and promo codes (RLS enforces admin access).
import { AdminAuthError, getSupabase } from './adminApi';

export const PROMO_CODE_RE = /^[A-Z0-9_-]{3,32}$/;

const ERROR_MESSAGES = {
  23505: 'A promo code with that name already exists.',
  23001: 'This code has been used, so it cannot be deleted. Deactivate it instead.',
  23503: 'This code has been used, so it cannot be deleted. Deactivate it instead.',
  23514: 'Codes are 3–32 characters: letters, numbers, - and _.',
};

function unwrap({ data, error }) {
  if (!error) return data;
  if (error.code === '42501' || error.code === 'PGRST301' || error.code === 'PGRST303') {
    throw new AdminAuthError('You do not have access to the admin panel. Please sign in again.');
  }
  throw new Error(ERROR_MESSAGES[error.code] || error.message || 'Request failed.');
}

// ---------- Promo checkout switch ----------

export async function getPromoCheckout() {
  const row = unwrap(await getSupabase().from('app_settings').select('promo_checkout_enabled').maybeSingle());
  return Boolean(row?.promo_checkout_enabled);
}

export async function setPromoCheckout(enabled) {
  unwrap(await getSupabase().from('app_settings')
    .update({ promo_checkout_enabled: enabled, updated_at: new Date().toISOString() })
    .eq('id', true));
}

// ---------- Codes ----------

function toPromoDto(row) {
  return {
    id: row.id,
    code: row.code,
    description: row.description,
    groupId: row.group_id,
    groupName: row.groups?.name || '',
    maxUses: row.max_uses,
    usedCount: row.used_count,
    active: row.active,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

export async function listPromoCodes() {
  const rows = unwrap(await getSupabase()
    .from('promo_codes')
    .select('*, groups(name)')
    .order('created_at', { ascending: false }));
  return rows.map(toPromoDto);
}

function toPromoRow(fields) {
  return {
    code: fields.code.trim().toUpperCase(),
    description: fields.description.trim(),
    group_id: fields.groupId || null,
    max_uses: fields.maxUses === '' ? null : Number(fields.maxUses),
    // The date input gives a day; the code stays valid until the end of that day (IST).
    expires_at: fields.expiresOn ? new Date(`${fields.expiresOn}T23:59:59+05:30`).toISOString() : null,
  };
}

export async function createPromoCode(fields) {
  unwrap(await getSupabase().from('promo_codes').insert(toPromoRow(fields)));
}

export async function updatePromoCode(id, fields) {
  const { code, ...rest } = toPromoRow(fields);
  unwrap(await getSupabase().from('promo_codes').update(rest).eq('id', id));
}

export async function setPromoCodeActive(id, active) {
  unwrap(await getSupabase().from('promo_codes').update({ active }).eq('id', id));
}

export async function deletePromoCode(id) {
  unwrap(await getSupabase().from('promo_codes').delete().eq('id', id));
}

// Learners who enrolled with a code, newest first.
export async function listRedemptions(promoCodeId) {
  const rows = unwrap(await getSupabase()
    .from('promo_redemptions')
    .select('redeemed_at, registrations(id, full_name, email, registration_number)')
    .eq('promo_code_id', promoCodeId)
    .order('redeemed_at', { ascending: false }));
  return rows.map((r) => ({
    redeemedAt: r.redeemed_at,
    registrationId: r.registrations?.id,
    fullName: r.registrations?.full_name || '',
    email: r.registrations?.email || '',
    registrationNumber: r.registrations?.registration_number || '',
  }));
}
