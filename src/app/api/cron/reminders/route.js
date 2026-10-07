import { NextResponse } from 'next/server';
import { createServiceClient } from '../../../../lib/supabase/service';
import { isAuthorizedCronRequest } from '../../../../lib/integrations/cron';
import { isMailerConfigured, sendMail } from '../../../../lib/integrations/mailer';
import { isWhatsAppEnabled, liveClassUrl, sendClassStartingReminder } from '../../../../lib/integrations/whatsapp';
import { classStartingEmail, classTodayEmail } from '../../../../lib/emails';
import { serverError } from '../../../../lib/apiErrors';

// cron-job.org: every minute, header "Authorization: Bearer <CRON_SECRET>".
//   reminder_day   — email, 4 hours before class
//   reminder_final — join link 2 minutes before class: WhatsApp when WHATSAPP_ENABLED=true,
//                    otherwise email
// Each reminder is claimed in the database first, so overlapping runs never double-send.

const IST = { timeZone: 'Asia/Kolkata', weekday: 'long', hour: 'numeric', minute: '2-digit' };

function lessonTitle(row) {
  return row.week_title ? `Week ${row.week_number}: ${row.week_title}` : `Week ${row.week_number}`;
}

async function finish(service, logId, result) {
  await service.from('notification_log').update({ ...result, updated_at: new Date().toISOString() }).eq('id', logId);
}

async function sendAll(service, kind, channel, send) {
  const { data: rows, error } = await service.rpc('claim_due_reminders', { p_kind: kind, p_channel: channel });
  if (error) throw error;

  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const messageId = await send(row);
      await finish(service, row.log_id, { status: 'sent', provider_message_id: messageId });
      sent += 1;
    } catch (err) {
      console.error(`[cron/reminders] ${kind}/${channel} failed for ${row.registration_id}:`, err.message);
      await finish(service, row.log_id, { status: 'failed', error: String(err.message).slice(0, 500) });
      failed += 1;
    }
  }
  return { sent, failed };
}

async function run(request) {
  if (!isAuthorizedCronRequest(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const service = createServiceClient();
    const result = {};

    const firstName = (row) => row.full_name.split(/\s+/)[0];

    if (isMailerConfigured()) {
      result.dayEmail = await sendAll(service, 'reminder_day', 'email', (row) => {
        const startsAt = new Date(row.starts_at);
        return sendMail({
          to: row.email,
          ...classTodayEmail({
            fullName: firstName(row),
            groupName: row.group_name,
            when: startsAt.toLocaleString('en-IN', IST),
            time: startsAt.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' }),
            lesson: lessonTitle(row),
            url: liveClassUrl(row.session_id),
          }),
        });
      });
    } else {
      result.dayEmail = 'skipped: SMTP not configured';
    }

    if (isWhatsAppEnabled()) {
      result.finalWhatsApp = await sendAll(service, 'reminder_final', 'whatsapp', (row) =>
        sendClassStartingReminder(row.phone, {
          firstName: firstName(row),
          lessonTitle: lessonTitle(row),
          sessionId: row.session_id,
        }));
    } else if (isMailerConfigured()) {
      result.finalEmail = await sendAll(service, 'reminder_final', 'email', (row) =>
        sendMail({
          to: row.email,
          ...classStartingEmail({ fullName: firstName(row), lesson: lessonTitle(row), url: liveClassUrl(row.session_id) }),
        }));
    } else {
      result.finalEmail = 'skipped: SMTP not configured';
    }

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return serverError('api/cron/reminders', error);
  }
}

export const GET = run;
export const POST = run;
