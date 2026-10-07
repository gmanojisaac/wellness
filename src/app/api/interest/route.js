import { NextResponse } from 'next/server';
import { createServiceClient } from '../../../lib/supabase/service';
import { parseInterest } from '../../../lib/registrationValidation';
import { assertMailerConfigured } from '../../../lib/integrations/mailer';
import { createInvitedUser, sendActivationEmail, sendSignInLink } from '../../../lib/authLinks';
import { fail, serverError } from '../../../lib/apiErrors';

const THANK_YOU = 'Thank you. Check your email to activate your learner account.';

// Public interest form. Creates (or reuses) the learner's account without a password and
// emails a single-use activation link through our SMTP account. No payment is taken here.
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return fail(400, 'Malformed JSON body.');
  }

  const { errors, value } = parseInterest(body);
  if (errors.length > 0) return fail(400, errors[0], { details: errors });

  try {
    // No account is created unless the activation email can be sent
    assertMailerConfigured();
    const supabase = createServiceClient();

    // Check before sending any email
    const { data: group, error: groupError } = await supabase
      .from('groups').select('id, status').eq('id', value.groupId).maybeSingle();
    if (groupError) throw groupError;
    if (!group || group.status !== 'open') {
      return fail(400, 'This group is not open for registration. Please choose another group.');
    }

    const { data: existingUserId, error: lookupError } = await supabase.rpc('auth_user_id_by_email', { p_email: value.email });
    if (lookupError) throw lookupError;

    let userId = existingUserId;
    let activationUrl = null;
    if (!userId) {
      ({ userId, url: activationUrl } = await createInvitedUser(supabase, { email: value.email, fullName: value.fullName }));
    }
    const invited = Boolean(activationUrl);

    const { error } = await supabase.rpc('create_interest', {
      p_full_name: value.fullName,
      p_email: value.email,
      p_phone: value.phone,
      p_whatsapp_opt_in: value.whatsAppOptIn,
      p_group_id: value.groupId,
      p_user_id: userId,
    });
    if (error) {
      // Don't leave behind an account that has no registration
      if (invited) await supabase.auth.admin.deleteUser(userId).catch(() => {});
      if (error.code === 'EG001') {
        return fail(400, 'This group is not open for registration. Please choose another group.');
      }
      throw error;
    }

    // Existing accounts get a sign-in link instead of an invite. The answer is the same
    // either way, so the form never reveals whether an email already has an account.
    if (invited) {
      try {
        await sendActivationEmail({ email: value.email, fullName: value.fullName, url: activationUrl });
      } catch (mailError) {
        // The registration is saved; "Send me a new link" on /activate recovers from this
        console.error('[api/interest] Activation email not sent:', mailError.message);
        return fail(502, 'Your interest is saved, but we could not send the activation email. Please try again in a few minutes.');
      }
    } else {
      await sendSignInLink(supabase, value.email);
    }

    return NextResponse.json({ success: true, message: THANK_YOU }, { status: 201 });
  } catch (error) {
    return serverError('api/interest', error, 'We could not save your interest right now. Please try again in a moment.');
  }
}
