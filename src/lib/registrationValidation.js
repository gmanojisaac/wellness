import {
  TIME_SLOTS, PARTICIPATION_STYLES, DEFAULT_TIME_SLOT, DEFAULT_PARTICIPATION_STYLE,
  DEFAULT_PRIMARY_GOAL,
} from './programs';
import { GROUP_ID_RE } from './groups';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 72;

function str(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function isTrue(value) {
  return value === true || value === 'true';
}

// Validates and normalizes the public registration payload.
export function parseRegistration(body = {}) {
  const errors = [];

  const fullName = str(body.fullName, 120);
  if (fullName.length < 2) errors.push('Full name is required (at least 2 characters).');

  const email = str(body.email, 254).toLowerCase();
  if (!EMAIL_RE.test(email)) errors.push('A valid email address is required.');

  // Becomes the student's portal login. Never trimmed, echoed back or logged.
  const password = typeof body.password === 'string' ? body.password : '';
  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    errors.push(`Choose a password of at least ${MIN_PASSWORD_LENGTH} characters for your student login.`);
  }

  const phone = str(body.phone, 32);
  if (phone && !/^\+?[0-9\s()-]{6,32}$/.test(phone)) errors.push('Phone number contains invalid characters.');

  // Only the shape is checked here; register_participant() rejects groups that are not open.
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
    value: {
      fullName,
      email,
      password,
      phone,
      whatsAppOptIn: Boolean(phone) && isTrue(body.whatsAppOptIn),
      groupId,
      timeSlot: TIME_SLOTS[body.timeSlot] ? body.timeSlot : DEFAULT_TIME_SLOT,
      participationStyle: PARTICIPATION_STYLES[body.participationStyle]
        ? body.participationStyle
        : DEFAULT_PARTICIPATION_STYLE,
      primaryGoal: str(body.primaryGoal, 200) || DEFAULT_PRIMARY_GOAL,
      notes: str(body.notes, 2000),
    },
  };
}
