import 'server-only';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { toWhatsAppNumber } from './integrations/whatsapp';

export const CODE_TTL_MINUTES = 10;
export const RESEND_AFTER_SECONDS = 60;
export const MAX_ATTEMPTS = 5;

export function newCode() {
  return String(randomInt(100000, 1000000));
}

// Codes are stored as an HMAC bound to the account and number, never in plain text.
export function hashCode(userId, phone, code) {
  const secret = process.env.PHONE_CODE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return createHmac('sha256', secret).update(`${userId}:${toWhatsAppNumber(phone)}:${code}`).digest('hex');
}

export function codeMatches(row, userId, phone, code) {
  const expected = Buffer.from(row.code_hash);
  const actual = Buffer.from(hashCode(userId, phone, String(code || '').trim()));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
