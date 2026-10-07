import 'server-only';
import { appUrl, missingEnv, requireEnv } from './config';

// Meta WhatsApp Cloud API. Business-initiated messages must use templates approved in
// WhatsApp Manager. https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-message-templates
const KEYS = ['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'];

export function isWhatsAppConfigured() {
  return missingEnv(KEYS).length === 0;
}

// WhatsApp is off until WHATSAPP_ENABLED=true (and the keys are set). While it is off,
// every learner message goes by email and phone numbers are saved without a code.
export function isWhatsAppEnabled() {
  return process.env.WHATSAPP_ENABLED === 'true' && isWhatsAppConfigured();
}

// Cloud API wants the number in international format, digits only (e.g. 919876543210).
export function toWhatsAppNumber(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

async function sendTemplate(to, name, components) {
  const { WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID } = requireEnv('WhatsApp', KEYS);
  const number = toWhatsAppNumber(to);
  if (!number) throw new Error('Invalid WhatsApp number');

  const version = process.env.WHATSAPP_API_VERSION || 'v23.0';
  const response = await fetch(`https://graph.facebook.com/${version}/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}` },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: number,
      type: 'template',
      template: { name, language: { code: process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en' }, components },
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`WhatsApp send failed (${response.status}): ${data?.error?.message || 'unknown error'}`);
  }
  return data.messages?.[0]?.id || null;
}

// Authentication template with a "Copy code" button. Body: "{{1}} is your verification code."
export function sendVerificationCode(to, code) {
  const template = process.env.WHATSAPP_TEMPLATE_OTP || 'emw_verification_code';
  return sendTemplate(to, template, [
    { type: 'body', parameters: [{ type: 'text', text: code }] },
    { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] },
  ]);
}

// Utility template sent 2 minutes before class.
// Body: "Hi {{1}}, your live class begins in 2 minutes. Lesson: {{2}}"
// URL button: <NEXT_PUBLIC_APP_URL>/student/live/{{1}}  (the suffix is the session id)
export function sendClassStartingReminder(to, { firstName, lessonTitle, sessionId }) {
  const template = process.env.WHATSAPP_TEMPLATE_CLASS_REMINDER || 'emw_class_starting';
  return sendTemplate(to, template, [
    { type: 'body', parameters: [{ type: 'text', text: firstName }, { type: 'text', text: lessonTitle }] },
    { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: sessionId }] },
  ]);
}

export function liveClassUrl(sessionId) {
  return appUrl(`/student/live/${sessionId}`);
}
