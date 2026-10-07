import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { missingEnv, requireEnv } from './config';

// Razorpay Orders API + Standard Checkout. https://razorpay.com/docs/api/orders/
const API = 'https://api.razorpay.com/v1';
const KEYS = ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET'];

export function isRazorpayConfigured() {
  return missingEnv(KEYS).length === 0;
}

function safeEqualHex(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

function hmac(secret, payload) {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

// Creates an order the browser checkout pays. amountPaise is in the smallest unit (₹1 = 100).
export async function createOrder({ amountPaise, currency = 'INR', receipt, notes = {} }) {
  const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } = requireEnv('Razorpay', KEYS);
  const response = await fetch(`${API}/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64')}`,
    },
    body: JSON.stringify({ amount: amountPaise, currency, receipt: String(receipt).slice(0, 40), notes }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Razorpay order failed (${response.status}): ${data?.error?.description || 'unknown error'}`);
  }
  return { orderId: data.id, amountPaise: data.amount, currency: data.currency, keyId: RAZORPAY_KEY_ID };
}

// Signature the checkout returns on success: HMAC-SHA256(order_id|payment_id, key secret).
export function verifyCheckoutSignature({ orderId, paymentId, signature }) {
  const { RAZORPAY_KEY_SECRET } = requireEnv('Razorpay', KEYS);
  return safeEqualHex(hmac(RAZORPAY_KEY_SECRET, `${orderId}|${paymentId}`), signature);
}

// X-Razorpay-Signature on webhooks: HMAC-SHA256(raw body, webhook secret).
export function verifyWebhookSignature(rawBody, signature) {
  const { RAZORPAY_WEBHOOK_SECRET } = requireEnv('Razorpay webhooks', ['RAZORPAY_WEBHOOK_SECRET']);
  return safeEqualHex(hmac(RAZORPAY_WEBHOOK_SECRET, rawBody), signature);
}
