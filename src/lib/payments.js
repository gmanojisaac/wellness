import 'server-only';

// Loads a payment together with its registration's owner, or null.
export async function findPayment(service, orderId) {
  const { data, error } = await service
    .from('payments')
    .select('id, status, registration_id, registrations!inner(user_id)')
    .eq('provider_order_id', orderId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function recordPaymentResult(service, { orderId, paymentId, status, reason = '' }) {
  const { data, error } = await service.rpc('record_payment_result', {
    p_order_id: orderId, p_payment_id: paymentId || '', p_status: status, p_reason: reason,
  });
  if (error) throw error;
  return data;
}
