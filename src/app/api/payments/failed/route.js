import { NextResponse } from 'next/server';
import { createSessionClient } from '../../../../lib/supabase/server';
import { createServiceClient } from '../../../../lib/supabase/service';
import { findPayment, recordPaymentResult } from '../../../../lib/payments';
import { fail, serverError } from '../../../../lib/apiErrors';

// Called by the checkout's "payment.failed" handler so the attempt shows as failed right
// away. The account and program stay saved and the learner can retry (PAYMENT_PENDING).
export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const orderId = String(body.orderId || '');
  if (!orderId) return fail(400, 'Missing order.');

  try {
    const session = await createSessionClient();
    const { data: { user } } = await session.auth.getUser();
    if (!user) return fail(401, 'Please sign in again.');

    const service = createServiceClient();
    const payment = await findPayment(service, orderId);
    if (!payment || payment.registrations.user_id !== user.id) return fail(404, 'Payment not found.');

    const result = await recordPaymentResult(service, {
      orderId,
      paymentId: String(body.paymentId || ''),
      status: 'failed',
      reason: String(body.reason || 'Payment failed').slice(0, 500),
    });
    return NextResponse.json({ success: true, state: result.state, paymentStatus: result.payment_status });
  } catch (error) {
    return serverError('api/payments/failed', error);
  }
}
