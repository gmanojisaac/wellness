import { NextResponse } from 'next/server';
import { createServiceClient } from '../../../../lib/supabase/service';
import { receiveWebhook, registrationIdFromIdentity } from '../../../../lib/integrations/livekit';
import { NotConfiguredError } from '../../../../lib/integrations/config';
import { serverError } from '../../../../lib/apiErrors';

// LiveKit webhook (Cloud project → Settings → Webhooks). Records live attendance from
// participant_joined / participant_left (time in class per learner and session).
export async function POST(request) {
  const rawBody = await request.text();

  let event;
  try {
    event = await receiveWebhook(rawBody, request.headers.get('authorization') || undefined);
  } catch (error) {
    if (error instanceof NotConfiguredError) return serverError('api/webhooks/livekit', error);
    return NextResponse.json({ error: 'Invalid webhook' }, { status: 401 });
  }

  const kind = { participant_joined: 'joined', participant_left: 'left' }[event.event];
  const registrationId = registrationIdFromIdentity(event.participant?.identity);
  if (!kind || !registrationId || !event.room?.name) return NextResponse.json({ ignored: true });

  try {
    // createdAt is in seconds
    const at = event.createdAt ? new Date(Number(event.createdAt) * 1000) : new Date();
    const { error } = await createServiceClient().rpc('record_live_event', {
      p_room_name: event.room.name,
      p_registration_id: registrationId,
      p_event: kind,
      p_at: at.toISOString(),
    });
    if (error) throw error;
    return NextResponse.json({ received: true });
  } catch (error) {
    return serverError('api/webhooks/livekit', error);
  }
}
