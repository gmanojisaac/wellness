import 'server-only';
import nodemailer from 'nodemailer';
import { missingEnv, requireEnv } from './config';

// Every email to learners (activation and sign-in links, class reminders, later
// certificates) is sent by the app through this SMTP account (SMTP_* in .env).
const KEYS = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'];

export function isMailerConfigured() {
  return missingEnv(KEYS).length === 0;
}

// Throws NotConfiguredError (-> 503) when the SMTP settings are missing.
export function assertMailerConfigured() {
  requireEnv('SMTP email', KEYS);
}

let transport;
function getTransport() {
  const { SMTP_HOST, SMTP_USER, SMTP_PASS } = requireEnv('SMTP email', KEYS);
  if (!transport) {
    const port = Number(process.env.SMTP_PORT || 465);
    transport = nodemailer.createTransport({
      host: SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  return transport;
}

export async function sendMail({ to, subject, text, html }) {
  const info = await getTransport().sendMail({ from: process.env.SMTP_FROM, to, subject, text, html });
  return info.messageId || null;
}
