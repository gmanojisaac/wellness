import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServiceClient } from '../../../lib/supabase/service';
import { parseRegistration } from '../../../lib/registrationValidation';
import { toRegistrationDto } from '../../../lib/registrationDto';
import { toGroupDto } from '../../../lib/groups';

function fail(status, error) {
  return NextResponse.json({ success: false, error }, { status });
}

// Finds or creates the student's login. Returns { userId, created } or { error } for the client.
async function resolveAccount(supabase, { email, password, fullName }) {
  const created = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (!created.error) return { userId: created.data.user.id, created: true };

  if (created.error.code !== 'email_exists' && created.error.status !== 422) throw created.error;

  // The email already has a login. Only link this registration to it if the person
  // registering knows that account's password; otherwise their details would land in
  // an account someone else controls.
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signIn = await anon.auth.signInWithPassword({ email, password });
  if (signIn.error) {
    return {
      error: 'A student account already exists for this email. Enter that account\'s password to add this group to it, or sign in to the student portal.',
    };
  }
  return { userId: signIn.data.user.id, created: false };
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return fail(400, 'Malformed JSON body.');
  }

  const { errors, value } = parseRegistration(body);
  if (errors.length > 0) {
    return NextResponse.json({ success: false, error: errors[0], details: errors }, { status: 400 });
  }

  try {
    const supabase = createServiceClient();

    const account = await resolveAccount(supabase, value);
    if (account.error) return fail(409, account.error);

    const { data, error } = await supabase.rpc('register_participant', {
      p_full_name: value.fullName,
      p_email: value.email,
      p_phone: value.phone,
      p_whatsapp_opt_in: value.whatsAppOptIn,
      p_group_id: value.groupId,
      p_time_slot: value.timeSlot,
      p_participation_style: value.participationStyle,
      p_primary_goal: value.primaryGoal,
      p_notes: value.notes,
      p_user_id: account.userId,
    });

    if (error) {
      // Don't leave behind a login that has no registration
      if (account.created) await supabase.auth.admin.deleteUser(account.userId).catch(() => {});

      if (error.code === 'EG001') {
        return fail(400, 'This group is not open for registration. Please choose another group.');
      }
      if (error.code === '23505') {
        return fail(409, 'You are already registered for this group. Sign in to the student portal to see your classes.');
      }
      throw error;
    }

    const { data: groupRow } = await supabase.from('groups').select('*').eq('id', data.group_id).maybeSingle();
    const registration = toRegistrationDto(data, groupRow ? toGroupDto(groupRow) : undefined);
    return NextResponse.json({
      success: true,
      message: `Welcome ${registration.fullName}! You have been assigned to ${registration.groupName} (${registration.cohortCode}, Seat ${registration.seatNumber} of ${registration.maxRoomCapacity}).`,
      registration,
    }, { status: 201 });
  } catch (error) {
    console.error('[api/register] Registration failed:', error.message || error);
    return fail(503, 'Unable to complete your registration right now. Please try again in a moment.');
  }
}
