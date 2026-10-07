import { NextResponse } from 'next/server';
import { createSessionClient } from '../../../../lib/supabase/server';
import { createServiceClient } from '../../../../lib/supabase/service';
import { TERMS_VERSION, parseActivation } from '../../../../lib/registrationValidation';
import { isWhatsAppEnabled, toWhatsAppNumber } from '../../../../lib/integrations/whatsapp';
import { MAX_ATTEMPTS, codeMatches } from '../../../../lib/phoneCodes';
import { fail, serverError } from '../../../../lib/apiErrors';

// Activation: the learner (signed in by the emailed link) sets their own password,
// confirms their WhatsApp number and accepts the terms. INVITED -> ACTIVATED.
export async function POST(request) {
  const body = await request.json().catch(() => null);
  if (!body) return fail(400, 'Malformed JSON body.');

  const { errors, value } = parseActivation(body);
  if (errors.length > 0) return fail(400, errors[0], { details: errors });

  try {
    const session = await createSessionClient();
    const { data: { user } } = await session.auth.getUser();
    if (!user) return fail(401, 'Your activation link has expired. Request a new one below.');

    const service = createServiceClient();

    // With WhatsApp switched on the number must be confirmed with the code we sent
    let phoneVerified = false;
    if (isWhatsAppEnabled()) {
      const { data: pending } = await service
        .from('phone_verifications').select('*').eq('user_id', user.id).maybeSingle();
      if (!pending || pending.phone !== toWhatsAppNumber(value.phone)) {
        return fail(400, 'Send a confirmation code to this number first.');
      }
      if (new Date(pending.expires_at) < new Date() || pending.attempts >= MAX_ATTEMPTS) {
        return fail(400, 'That code has expired. Send a new one.');
      }
      if (!codeMatches(pending, user.id, value.phone, value.code)) {
        await service.from('phone_verifications').update({ attempts: pending.attempts + 1 }).eq('user_id', user.id);
        return fail(400, 'That code is not right. Check the WhatsApp message and try again.');
      }
      phoneVerified = true;
    }

    const { error: passwordError } = await session.auth.updateUser({ password: value.password });
    if (passwordError) {
      if (passwordError.code === 'weak_password') return fail(400, 'Please choose a stronger password.');
      if (passwordError.code === 'same_password') {
        // Re-activation with the same password is fine
      } else {
        throw passwordError;
      }
    }

    const { data: count, error } = await service.rpc('activate_account', {
      p_user_id: user.id,
      p_phone: value.phone,
      p_phone_verified: phoneVerified,
      p_whatsapp_opt_in: value.whatsAppOptIn,
      p_terms_version: TERMS_VERSION,
    });
    if (error) throw error;
    if (!count) return fail(404, 'We could not find a registration for this account.');

    await service.from('phone_verifications').delete().eq('user_id', user.id);
    return NextResponse.json({ success: true, phoneVerified, next: '/student' });
  } catch (error) {
    return serverError('api/account/activate', error, 'We could not activate your account. Please try again.');
  }
}
