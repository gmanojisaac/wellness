import 'server-only';
import { appUrl } from './integrations/config';
import { sendMail } from './integrations/mailer';
import { activationEmail, signInEmail } from './emails';

// Activation and sign-in links. Supabase only generates the single-use token
// (auth.admin.generateLink sends nothing); the app emails it through our own SMTP
// account. The link lands on /auth/confirm, which signs the learner in and continues
// to /activate (or /student once activated).

function confirmUrl(properties, type) {
  const params = new URLSearchParams({ token_hash: properties.hashed_token, type, next: '/activate' });
  return appUrl(`/auth/confirm?${params}`);
}

// Creates the account (no password yet) and returns its link. Nothing is emailed here,
// so the caller can save the registration first and then call sendActivationEmail().
export async function createInvitedUser(service, { email, fullName }) {
  const { data, error } = await service.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { data: { full_name: fullName } },
  });
  if (error) throw error;
  return { userId: data.user.id, url: confirmUrl(data.properties, 'invite') };
}

export async function sendActivationEmail({ email, fullName, url }) {
  await sendMail({ to: email, ...activationEmail({ fullName, url }) });
}

// Emails a one-time sign-in link to an existing account. Failures such as an unknown
// email are logged, never shown, so the response does not reveal whether an email has
// an account.
export async function sendSignInLink(service, email) {
  const { data, error } = await service.auth.admin.generateLink({ type: 'magiclink', email });
  if (error) {
    console.warn('[auth] Sign-in link not created:', error.message);
    return;
  }
  try {
    await sendMail({ to: email, ...signInEmail({ url: confirmUrl(data.properties, 'magiclink') }) });
  } catch (err) {
    console.error('[auth] Sign-in email not sent:', err.message);
  }
}
