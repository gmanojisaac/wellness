import { NextResponse } from 'next/server';
import { createServiceClient } from '../../../../lib/supabase/service';
import { isAuthorizedCronRequest } from '../../../../lib/integrations/cron';
import { closeRoom, isLiveKitConfigured } from '../../../../lib/integrations/livekit';
import { serverError } from '../../../../lib/apiErrors';

// cron-job.org: every 5 minutes, header "Authorization: Bearer <CRON_SECRET>".
//  1. Schedules live sessions for every cohort's released weeks (and moves future ones
//     when an admin changes a release date or class time).
//  2. Closes rooms whose join window ended (20 minutes after the class), which removes
//     anyone still connected.
async function run(request) {
  if (!isAuthorizedCronRequest(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const service = createServiceClient();

    const { data: scheduled, error } = await service.rpc('sync_class_sessions', { p_group_id: null });
    if (error) throw error;

    const cutoff = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    const { data: ended, error: endedError } = await service
      .from('class_sessions').select('id, room_name').eq('status', 'scheduled').lt('ends_at', cutoff).limit(100);
    if (endedError) throw endedError;

    let closed = 0;
    for (const session of ended) {
      if (isLiveKitConfigured()) await closeRoom(session.room_name);
      await service.from('class_sessions')
        .update({ status: 'closed', closed_at: new Date().toISOString() })
        .eq('id', session.id).eq('status', 'scheduled');
      closed += 1;
    }

    return NextResponse.json({ success: true, scheduled, closed });
  } catch (error) {
    return serverError('api/cron/sessions', error);
  }
}

export const GET = run;
export const POST = run;
