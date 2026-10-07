import { NextResponse } from 'next/server';
import { createSessionClient } from '../../../../lib/supabase/server';
import { createServiceClient } from '../../../../lib/supabase/service';
import { createOrder } from '../../../../lib/integrations/razorpay';
import { fail, serverError } from '../../../../lib/apiErrors';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAYABLE = new Set(['activated', 'payment_pending']);

// Starts checkout for one of the signed-in learner's registrations. Creates a Razorpay
// order for the group's fee (ACTIVATED -> PAYMENT_PENDING). Free groups enrol directly.
export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  if (!UUID_RE.test(String(body.registrationId || ''))) return fail(400, 'A valid registrationId is required.');

  try {
    const session = await createSessionClient();
    const { data: { user } } = await session.auth.getUser();
    if (!user) return fail(401, 'Please sign in again.');

    const service = createServiceClient();
    const { data: reg, error } = await service
      .from('registrations')
      .select('id, user_id, state, registration_number, full_name, email, phone, groups!inner(name, fee_paise, currency)')
      .eq('id', body.registrationId)
      .maybeSingle();
    if (error) throw error;
    if (!reg || reg.user_id !== user.id) return fail(404, 'This enrolment was not found on your account.');
    if (!PAYABLE.has(reg.state)) return fail(409, 'This enrolment does not need a payment.', { state: reg.state });

    if (reg.groups.fee_paise === 0) {
      const { data: state, error: enrolError } = await service.rpc('enroll_without_payment', { p_registration_id: reg.id });
      if (enrolError) throw enrolError;
      return NextResponse.json({ success: true, free: true, state });
    }

    // While the admin has promo checkout on, enrolment is by promo code only.
    const { data: promoOnly, error: promoError } = await service.rpc('promo_checkout_enabled');
    if (promoError) throw promoError;
    if (promoOnly) return fail(409, 'Please enrol with your promo code.', { promo: true });

    const order = await createOrder({
      amountPaise: reg.groups.fee_paise,
      currency: reg.groups.currency,
      receipt: reg.registration_number,
      notes: { registration_id: reg.id, program: reg.groups.name },
    });

    const { error: insertError } = await service.from('payments').insert({
      registration_id: reg.id,
      provider_order_id: order.orderId,
      amount_paise: order.amountPaise,
      currency: order.currency,
    });
    if (insertError) throw insertError;

    await service.from('registrations').update({ state: 'payment_pending' }).eq('id', reg.id).eq('state', 'activated');

    return NextResponse.json({
      success: true,
      keyId: order.keyId,
      orderId: order.orderId,
      amount: order.amountPaise,
      currency: order.currency,
      programName: reg.groups.name,
      prefill: { name: reg.full_name, email: reg.email, contact: reg.phone },
    });
  } catch (error) {
    return serverError('api/payments/order', error, 'We could not start the payment. Please try again.');
  }
}
