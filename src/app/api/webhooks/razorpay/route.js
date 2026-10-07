import { NextResponse } from 'next/server';
import { createServiceClient } from '../../../../lib/supabase/service';
import { verifyWebhookSignature } from '../../../../lib/integrations/razorpay';
import { recordPaymentResult } from '../../../../lib/payments';
import { serverError } from '../../../../lib/apiErrors';

// Razorpay webhook (Dashboard → Accounts & Settings → Webhooks), events:
// payment.captured, payment.failed, order.paid. The source of truth for payments,
// including ones whose browser closed before the success handler ran.
export async function POST(request) {
  const rawBody = await request.text();

  try {
    if (!verifyWebhookSignature(rawBody, request.headers.get('x-razorpay-signature'))) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    const event = JSON.parse(rawBody);
    const payment = event.payload?.payment?.entity;
    const orderId = payment?.order_id || event.payload?.order?.entity?.id;
    if (!orderId) return NextResponse.json({ ignored: true });

    let status = null;
    if (event.event === 'payment.captured' || event.event === 'order.paid') status = 'paid';
    if (event.event === 'payment.failed') status = 'failed';
    if (!status) return NextResponse.json({ ignored: true });

    try {
      await recordPaymentResult(createServiceClient(), {
        orderId,
        paymentId: payment?.id,
        status,
        reason: payment?.error_description || '',
      });
    } catch (error) {
      // Orders created outside this app
      if (error.code === 'P0002') return NextResponse.json({ ignored: true });
      throw error;
    }
    return NextResponse.json({ received: true });
  } catch (error) {
    // A non-2xx answer makes Razorpay retry later
    return serverError('api/webhooks/razorpay', error);
  }
}
