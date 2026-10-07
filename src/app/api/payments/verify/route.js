import { NextResponse } from 'next/server';
import { createSessionClient } from '../../../../lib/supabase/server';
import { createServiceClient } from '../../../../lib/supabase/service';
import { verifyCheckoutSignature } from '../../../../lib/integrations/razorpay';
import { findPayment, recordPaymentResult } from '../../../../lib/payments';
import { fail, serverError } from '../../../../lib/apiErrors';

// Called by the checkout's success handler. The signature proves Razorpay authorised the
// payment for this order; the webhook confirms it again later (both are idempotent).
// PAYMENT_PENDING -> ENROLLED.
export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const orderId = String(body.razorpay_order_id || '');
  const paymentId = String(body.razorpay_payment_id || '');
  const signature = String(body.razorpay_signature || '');
  if (!orderId || !paymentId || !signature) return fail(400, 'Missing payment details.');

  try {
    const session = await createSessionClient();
    const { data: { user } } = await session.auth.getUser();
    if (!user) return fail(401, 'Please sign in again.');

    if (!verifyCheckoutSignature({ orderId, paymentId, signature })) {
      return fail(400, 'The payment could not be verified. If money was taken it will be confirmed shortly.');
    }

    const service = createServiceClient();
    const payment = await findPayment(service, orderId);
    if (!payment || payment.registrations.user_id !== user.id) return fail(404, 'Payment not found.');

    const result = await recordPaymentResult(service, { orderId, paymentId, status: 'paid' });
    return NextResponse.json({ success: true, state: result.state, registrationId: result.registration_id });
  } catch (error) {
    return serverError('api/payments/verify', error, 'We could not confirm the payment yet. Please refresh in a minute.');
  }
}
