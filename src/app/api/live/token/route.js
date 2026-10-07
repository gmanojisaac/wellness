import { NextResponse } from 'next/server';
import { createSessionClient } from '../../../../lib/supabase/server';
import { createJoinToken, learnerIdentity, staffIdentity } from '../../../../lib/integrations/livekit';
import { fail, isAuthError, serverError } from '../../../../lib/apiErrors';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Issues a LiveKit token for a live class. Checked in the database: signed in, active
// enrolment, the session's own cohort (or an admin/facilitator). Checked here: the join
// window, from 10 minutes before the start until 20 minutes after the end. The token
// expires when the window closes, so there are no permanent meeting links.
export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  if (!UUID_RE.test(String(body.sessionId || ''))) return fail(400, 'A valid sessionId is required.');

  try {
    const session = await createSessionClient();
    const { data: { user } } = await session.auth.getUser();
    if (!user) return fail(401, 'Please sign in to join your class.');

    const { data: isAdmin } = await session.rpc('is_admin');
    const { data: live, error } = await session.rpc(isAdmin ? 'admin_live_session' : 'student_live_session', {
      p_session_id: body.sessionId,
    });
    if (error) {
      if (isAuthError(error) || error.code === 'P0002') {
        return fail(403, 'This class is not part of your cohort.', { reason: 'not_member' });
      }
      throw error;
    }

    const now = new Date(live.now).getTime();
    const opensAt = new Date(live.join_opens_at).getTime();
    const closesAt = new Date(live.join_closes_at).getTime();
    if (live.status !== 'scheduled' || now >= closesAt) {
      return fail(410, 'This class has ended.', { reason: 'closed', session: live });
    }
    if (now < opensAt && !isAdmin) {
      return fail(403, 'This class is not open yet.', { reason: 'not_open', opensAt: live.join_opens_at, session: live });
    }

    const { token, serverUrl } = await createJoinToken({
      room: live.room_name,
      identity: isAdmin ? staffIdentity(user.id) : learnerIdentity(live.registration_id),
      name: isAdmin ? (user.user_metadata?.full_name || 'Facilitator') : live.participant_name,
      ttlSeconds: (closesAt - now) / 1000,
      staff: Boolean(isAdmin),
    });

    return NextResponse.json({ success: true, token, serverUrl, staff: Boolean(isAdmin), session: live });
  } catch (error) {
    return serverError('api/live/token', error, 'We could not open the classroom. Please try again.');
  }
}
