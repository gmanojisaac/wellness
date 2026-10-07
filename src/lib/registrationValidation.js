import { GROUP_ID_RE } from './groups';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9\s()-]{6,32}$/;
export const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 72;

// Bump when the terms or privacy notice change; stored with each learner's consent.
export const TERMS_VERSION = '2026-10-05';

function str(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function isTrue(value) {
  return value === true || value === 'true';
}

// Public interest form: no password and no payment. The learner sets a password after
// opening the activation email.
export function parseInterest(body = {}) {
  const errors = [];

  const fullName = str(body.fullName, 120);
  if (fullName.length < 2) errors.push('Full name is required (at least 2 characters).');

  const email = str(body.email, 254).toLowerCase();
  if (!EMAIL_RE.test(email)) errors.push('A valid email address is required.');

  const phone = str(body.phone, 32);
  if (phone && !PHONE_RE.test(phone)) errors.push('Phone number contains invalid characters.');

  // Only the shape is checked here; create_interest() rejects groups that are not open.
  const groupId = typeof body.groupId === 'string' && GROUP_ID_RE.test(body.groupId) ? body.groupId : null;
  if (!groupId) errors.push('Please select a valid learning group.');

  if (!isTrue(body.is18OrOver)) {
    errors.push('You must confirm you are 18 years of age or older to join this adult program.');
  }
  if (!isTrue(body.agreedToGuidelines)) {
    errors.push('You must agree to the peer community guidelines and crisis non-service boundaries.');
  }

  return {
    errors,
    value: { fullName, email, phone, whatsAppOptIn: Boolean(phone) && isTrue(body.whatsAppOptIn), groupId },
  };
}

// Account activation: password, phone (with WhatsApp code when WhatsApp is set up), consent.
export function parseActivation(body = {}) {
  const errors = [];

  // Never trimmed, echoed back or logged.
  const password = typeof body.password === 'string' ? body.password : '';
  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    errors.push(`Choose a password of ${MIN_PASSWORD_LENGTH} to ${MAX_PASSWORD_LENGTH} characters.`);
  }

  const phone = str(body.phone, 32);
  if (!phone || !PHONE_RE.test(phone)) errors.push('Enter your mobile / WhatsApp number.');

  const code = str(body.code, 12);
  if (!isTrue(body.acceptTerms)) errors.push('Please accept the program terms and privacy notice.');

  return { errors, value: { password, phone, code, whatsAppOptIn: isTrue(body.whatsAppOptIn) } };
}

export function isValidEmail(value) {
  return EMAIL_RE.test(String(value || '').trim().toLowerCase());
}
