import { NextResponse } from 'next/server';
import { isValidEmail } from '../../../../lib/registrationValidation';
import { sendSignInLink } from '../../../../lib/authLinks';
import { createServiceClient } from '../../../../lib/supabase/service';
import { assertMailerConfigured } from '../../../../lib/integrations/mailer';
import { fail, serverError } from '../../../../lib/apiErrors';

// "My activation link expired": emails a fresh sign-in link. Always answers the same way.
export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const email = String(body.email || '').trim().toLowerCase();
  if (!isValidEmail(email)) return fail(400, 'Enter the email you registered with.');

  try {
    assertMailerConfigured();
    await sendSignInLink(createServiceClient(), email);
  } catch (error) {
    return serverError('api/account/resend-link', error);
  }
  return NextResponse.json({ success: true, message: 'If that email is registered, a new link is on its way.' });
}
