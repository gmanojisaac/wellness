import { NextResponse } from 'next/server';
import { createSessionClient } from '../../../../lib/supabase/server';
import { createServiceClient } from '../../../../lib/supabase/service';
import { isWhatsAppEnabled, sendVerificationCode, toWhatsAppNumber } from '../../../../lib/integrations/whatsapp';
import { CODE_TTL_MINUTES, RESEND_AFTER_SECONDS, hashCode, newCode } from '../../../../lib/phoneCodes';
import { fail, serverError } from '../../../../lib/apiErrors';

// GET: whether the activation form should ask for a WhatsApp code.
export function GET() {
  return NextResponse.json({ required: isWhatsAppEnabled() });
}

// Sends a 6-digit confirmation code to the learner's WhatsApp during activation.
// While WhatsApp is switched off the number is saved unconfirmed: { required: false }.
export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const phone = String(body.phone || '').trim();
  if (!toWhatsAppNumber(phone)) return fail(400, 'Enter your mobile / WhatsApp number with the country code.');

  try {
    const session = await createSessionClient();
    const { data: { user } } = await session.auth.getUser();
    if (!user) return fail(401, 'Your activation link has expired. Request a new one below.');

    if (!isWhatsAppEnabled()) {
      return NextResponse.json({ success: true, required: false });
    }

    const service = createServiceClient();
    const { data: previous } = await service
      .from('phone_verifications').select('sent_at').eq('user_id', user.id).maybeSingle();
    if (previous && Date.now() - new Date(previous.sent_at).getTime() < RESEND_AFTER_SECONDS * 1000) {
      return fail(429, `Please wait a minute before asking for another code.`);
    }

    const code = newCode();
    const { error } = await service.from('phone_verifications').upsert({
      user_id: user.id,
      phone: toWhatsAppNumber(phone),
      code_hash: hashCode(user.id, phone, code),
      attempts: 0,
      sent_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000).toISOString(),
    });
    if (error) throw error;

    await sendVerificationCode(phone, code);
    return NextResponse.json({ success: true, required: true });
  } catch (error) {
    return serverError('api/account/phone-code', error, 'We could not send the code. Check the number and try again.');
  }
}
