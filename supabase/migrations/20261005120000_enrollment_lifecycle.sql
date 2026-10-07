-- ============================================================================
-- Enrollment lifecycle, payments, weekly class times, live sessions and reminders
--
-- The learner journey becomes:
--   interest form -> activation email -> set password, confirm phone, accept terms
--   -> payment (Razorpay) -> choose a weekly class time -> cohort assigned
--   -> live classes (LiveKit) with email and WhatsApp reminders.
--
-- registrations.state follows that journey:
--   invited -> activated -> payment_pending -> enrolled -> cohort_assigned -> active
--   -> program_complete -> certified
-- plus the exception states withdrawn, account_locked and certificate_review.
-- A failed payment keeps the registration in payment_pending (payments.status = 'failed').
--
-- Security model
--   * Interest, activation, payment results, live attendance and reminders are written
--     by the Next.js server with the service-role key, through the functions below.
--   * Students choose their class time and read their sessions through student_*()
--     functions that only act on the caller's own registrations.
--   * Course content (student_course, student_video_source) now needs a cohort.
--
-- Safe to run more than once. Run the WHOLE file. It ends with the line "-- END OF FILE".
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Weekly class times (previously fixed in src/lib/programs.js)
-- ---------------------------------------------------------------------------
create table if not exists public.time_slots (
  id               text primary key check (id ~ '^[a-z0-9_]{2,40}$'),
  label            text not null check (char_length(label) between 2 and 80),
  code             text not null unique check (code ~ '^[A-Z0-9-]{2,20}$'),
  weekday          smallint not null check (weekday between 0 and 6),  -- 0 = Sunday, like extract(dow)
  start_time       time not null,                                       -- India time
  duration_minutes integer not null default 10 check (duration_minutes between 5 and 180),
  active           boolean not null default true,
  sort_order       integer not null default 0
);

insert into public.time_slots (id, label, code, weekday, start_time, duration_minutes, sort_order) values
  ('sat_morning',   'Saturday · 10:00 AM', 'SAT-1000', 6, '10:00', 10, 1),
  ('sat_afternoon', 'Saturday · 3:00 PM',  'SAT-1500', 6, '15:00', 10, 2),
  ('sun_morning',   'Sunday · 10:00 AM',   'SUN-1000', 0, '10:00', 10, 3),
  ('sun_evening',   'Sunday · 6:00 PM',    'SUN-1800', 0, '18:00', 10, 4)
on conflict (id) do nothing;

alter table public.time_slots enable row level security;

drop policy if exists "Admins manage time slots" on public.time_slots;
create policy "Admins manage time slots"
  on public.time_slots for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

revoke all on public.time_slots from anon;

-- ---------------------------------------------------------------------------
-- Group fee
-- ---------------------------------------------------------------------------
alter table public.groups add column if not exists fee_paise integer not null default 0;
alter table public.groups add column if not exists currency text not null default 'INR';

alter table public.groups drop constraint if exists groups_fee_paise_check;
alter table public.groups add constraint groups_fee_paise_check check (fee_paise >= 0);

-- The spec's fee for the 52-week adult program (₹14,999 inclusive). Other groups stay
-- free until an admin sets a fee.
update public.groups set fee_paise = 1499900 where id = 'group1' and fee_paise = 0;

-- ---------------------------------------------------------------------------
-- Registrations: lifecycle state; class time and cohort are chosen after payment
-- ---------------------------------------------------------------------------
alter table public.registrations drop constraint if exists registrations_time_slot_check;
alter table public.registrations alter column time_slot drop not null;
alter table public.registrations alter column cohort_number drop not null;
alter table public.registrations alter column cohort_code drop not null;
alter table public.registrations alter column seat_number drop not null;
alter table public.registrations alter column participation_style set default 'active_voice';
alter table public.registrations alter column primary_goal set default 'Personal Mental Wellness & Habit Building';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'registrations_time_slot_fkey') then
    alter table public.registrations
      add constraint registrations_time_slot_fkey foreign key (time_slot) references public.time_slots (id);
  end if;
end;
$$;

alter table public.registrations add column if not exists state               text;
alter table public.registrations add column if not exists activated_at        timestamptz;
alter table public.registrations add column if not exists phone_verified_at   timestamptz;
alter table public.registrations add column if not exists consent_accepted_at timestamptz;
alter table public.registrations add column if not exists terms_version       text;
alter table public.registrations add column if not exists enrolled_at         timestamptz;
alter table public.registrations add column if not exists cohort_assigned_at  timestamptz;

-- Registrations made before this migration already have a seat and class time
update public.registrations
set state = case when status = 'completed' then 'program_complete' else 'active' end
where state is null;

alter table public.registrations alter column state set default 'invited';
alter table public.registrations alter column state set not null;

alter table public.registrations drop constraint if exists registrations_state_check;
alter table public.registrations add constraint registrations_state_check check (state in (
  'invited', 'activated', 'payment_pending', 'enrolled', 'cohort_assigned', 'active',
  'program_complete', 'certified', 'withdrawn', 'account_locked', 'certificate_review'
));

create index if not exists registrations_cohort_idx
  on public.registrations (group_id, time_slot, cohort_number) where cohort_number is not null;

-- States in which a learner may see course content and join live classes
create or replace function public.state_has_course_access(p_state text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_state in ('cohort_assigned', 'active', 'program_complete', 'certified');
$$;

-- ---------------------------------------------------------------------------
-- create_interest(): the public interest form. No password, no payment.
-- Returns { registration, existing }. When the email already registered for the group
-- the existing registration is returned unchanged, so the server can resend the
-- activation email for a learner who never activated.
-- Called only by the Next.js server with the service-role key.
-- ---------------------------------------------------------------------------
create or replace function public.create_interest(
  p_full_name       text,
  p_email           text,
  p_phone           text,
  p_whatsapp_opt_in boolean,
  p_group_id        text,
  p_user_id         uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing  public.registrations;
  v_row       public.registrations;
  v_number    text;
  v_activated boolean;
begin
  if not exists (select 1 from public.groups where id = p_group_id and status = 'open') then
    raise exception 'Group is not open for registration' using errcode = 'EG001';
  end if;

  select * into v_existing from public.registrations
  where email = lower(p_email) and group_id = p_group_id;

  if v_existing.id is not null then
    if v_existing.user_id is null then
      update public.registrations set user_id = p_user_id where id = v_existing.id returning * into v_existing;
    end if;
    return jsonb_build_object('registration', to_jsonb(v_existing), 'existing', true);
  end if;

  -- An account that has already been activated skips the activation step
  v_activated := exists (
    select 1 from public.registrations
    where user_id = p_user_id and state not in ('invited', 'withdrawn', 'account_locked')
  );

  loop
    v_number := 'EMW-REG-' || (100000 + floor(random() * 900000))::integer;
    exit when not exists (select 1 from public.registrations where registration_number = v_number);
  end loop;

  insert into public.registrations (
    registration_number, full_name, email, phone, whatsapp_opt_in, group_id, user_id, state, activated_at
  ) values (
    v_number, p_full_name, lower(p_email), coalesce(p_phone, ''), coalesce(p_whatsapp_opt_in, false),
    p_group_id, p_user_id,
    case when v_activated then 'activated' else 'invited' end,
    case when v_activated then now() end
  )
  returning * into v_row;

  return jsonb_build_object('registration', to_jsonb(v_row), 'existing', false);
end;
$$;

-- auth_user_id_by_email(): the account for an email, so the interest form can attach a
-- new program to an existing login. Service role only.
create or replace function public.auth_user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$$;

-- ---------------------------------------------------------------------------
-- activate_account(): after the learner set a password, confirmed their phone and
-- accepted the terms. Moves every invited registration of the account to activated.
-- p_phone_verified is decided by the server (WhatsApp code check).
-- ---------------------------------------------------------------------------
create or replace function public.activate_account(
  p_user_id         uuid,
  p_phone           text,
  p_phone_verified  boolean,
  p_whatsapp_opt_in boolean,
  p_terms_version   text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.registrations
  set state               = case when state = 'invited' then 'activated' else state end,
      activated_at        = coalesce(activated_at, now()),
      phone               = coalesce(nullif(p_phone, ''), phone),
      phone_verified_at   = case when p_phone_verified then now() else phone_verified_at end,
      whatsapp_opt_in     = coalesce(p_whatsapp_opt_in, whatsapp_opt_in),
      consent_accepted_at = now(),
      terms_version       = p_terms_version
  where user_id = p_user_id and state not in ('withdrawn', 'account_locked');
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Payments (Razorpay orders). One registration can have several attempts.
-- ---------------------------------------------------------------------------
create table if not exists public.payments (
  id                  uuid primary key default gen_random_uuid(),
  registration_id     uuid not null references public.registrations (id) on delete cascade,
  provider            text not null default 'razorpay',
  provider_order_id   text not null unique,
  provider_payment_id text,
  amount_paise        integer not null check (amount_paise > 0),
  currency            text not null default 'INR',
  status              text not null default 'created' check (status in ('created', 'paid', 'failed')),
  failure_reason      text not null default '' check (char_length(failure_reason) <= 500),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  paid_at             timestamptz
);

create index if not exists payments_registration_idx on public.payments (registration_id, created_at desc);

alter table public.payments enable row level security;

drop policy if exists "Admins can read payments" on public.payments;
create policy "Admins can read payments"
  on public.payments for select
  to authenticated
  using ((select public.is_admin()));

revoke all on public.payments from anon;
revoke insert, update, delete, truncate on public.payments from authenticated;

-- record_payment_result(): from the checkout callback or the Razorpay webhook,
-- whichever arrives first. Idempotent; a paid payment is never turned back to failed.
create or replace function public.record_payment_result(
  p_order_id   text,
  p_payment_id text,
  p_status     text,
  p_reason     text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
begin
  if p_status not in ('paid', 'failed') then
    raise exception 'Unknown payment status %', p_status;
  end if;

  update public.payments
  set status              = case when status = 'paid' then 'paid' else p_status end,
      provider_payment_id = case when status = 'paid' then provider_payment_id
                                 else coalesce(nullif(p_payment_id, ''), provider_payment_id) end,
      failure_reason      = case when p_status = 'failed' and status <> 'paid' then left(coalesce(p_reason, ''), 500)
                                 else failure_reason end,
      paid_at             = case when p_status = 'paid' then coalesce(paid_at, now()) else paid_at end,
      updated_at          = now()
  where provider_order_id = p_order_id
  returning * into v_payment;

  if v_payment.id is null then
    raise exception 'Unknown order' using errcode = 'P0002';
  end if;

  if v_payment.status = 'paid' then
    update public.registrations
    set state = 'enrolled', enrolled_at = coalesce(enrolled_at, now())
    where id = v_payment.registration_id and state in ('activated', 'payment_pending');
  end if;

  return jsonb_build_object(
    'registration_id', v_payment.registration_id,
    'payment_status', v_payment.status,
    'state', (select state from public.registrations where id = v_payment.registration_id)
  );
end;
$$;

-- enroll_without_payment(): groups whose fee is 0.
create or replace function public.enroll_without_payment(p_registration_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state text;
begin
  update public.registrations r
  set state = 'enrolled', enrolled_at = coalesce(r.enrolled_at, now())
  from public.groups g
  where r.id = p_registration_id and g.id = r.group_id and g.fee_paise = 0
    and r.state in ('activated', 'payment_pending')
  returning r.state into v_state;
  return v_state;
end;
$$;

-- ---------------------------------------------------------------------------
-- Phone confirmation codes sent over WhatsApp (hashed by the server; service role only)
-- ---------------------------------------------------------------------------
create table if not exists public.phone_verifications (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  phone      text not null,
  code_hash  text not null,
  attempts   integer not null default 0,
  expires_at timestamptz not null,
  sent_at    timestamptz not null default now()
);

alter table public.phone_verifications enable row level security;
revoke all on public.phone_verifications from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Live class sessions: one per cohort per curriculum week, on the cohort's weekly
-- class time in the week the content is released.
-- ---------------------------------------------------------------------------
create table if not exists public.class_sessions (
  id            uuid primary key default gen_random_uuid(),
  group_id      text not null references public.groups (id) on delete cascade,
  time_slot     text not null references public.time_slots (id),
  cohort_number integer not null check (cohort_number > 0),
  week_id       uuid not null references public.group_weeks (id) on delete cascade,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  room_name     text not null unique default ('emw-' || replace(gen_random_uuid()::text, '-', '')),
  status        text not null default 'scheduled' check (status in ('scheduled', 'cancelled', 'closed')),
  closed_at     timestamptz,
  created_at    timestamptz not null default now(),
  unique (group_id, time_slot, cohort_number, week_id),
  check (ends_at > starts_at)
);

create index if not exists class_sessions_starts_idx on public.class_sessions (starts_at);

alter table public.class_sessions enable row level security;

drop policy if exists "Admins manage class sessions" on public.class_sessions;
create policy "Admins manage class sessions"
  on public.class_sessions for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

revoke all on public.class_sessions from anon;

-- sync_class_sessions(): creates the sessions of every cohort for every released week
-- with published classes, and moves future sessions when a release date or class time
-- changes. Run by the cron endpoint and whenever a cohort is assigned.
create or replace function public.sync_class_sessions(p_group_id text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with cohorts as (
    select distinct r.group_id, r.time_slot, r.cohort_number
    from public.registrations r
    where r.time_slot is not null and r.cohort_number is not null
      and r.state in ('cohort_assigned', 'active')
      and (p_group_id is null or r.group_id = p_group_id)
  ), planned as (
    select c.group_id, c.time_slot, c.cohort_number, w.id as week_id,
           ((w.release_date + ((s.weekday - extract(dow from w.release_date)::integer + 7) % 7))::timestamp
             + s.start_time) at time zone 'Asia/Kolkata' as starts_at,
           s.duration_minutes
    from cohorts c
    join public.time_slots s on s.id = c.time_slot
    join public.group_weeks w on w.group_id = c.group_id
    where w.release_date is not null
      and exists (select 1 from public.classes cl where cl.week_id = w.id and cl.status = 'published')
  )
  insert into public.class_sessions (group_id, time_slot, cohort_number, week_id, starts_at, ends_at)
  select group_id, time_slot, cohort_number, week_id, starts_at, starts_at + make_interval(mins => duration_minutes)
  from planned
  on conflict (group_id, time_slot, cohort_number, week_id) do update
    set starts_at = excluded.starts_at, ends_at = excluded.ends_at
    where public.class_sessions.status = 'scheduled'
      and public.class_sessions.starts_at > now()
      and excluded.starts_at > now()
      and (public.class_sessions.starts_at, public.class_sessions.ends_at)
          is distinct from (excluded.starts_at, excluded.ends_at);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- student_slot_options(): the class times a learner can pick, with seats left in the
-- room that is filling now (a new room opens when it is full).
-- ---------------------------------------------------------------------------
create or replace function public.student_slot_options(p_registration_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_reg      public.registrations;
  v_capacity integer;
begin
  select * into v_reg from public.registrations
  where id = p_registration_id and user_id = (select auth.uid());
  if v_reg.id is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select room_capacity into v_capacity from public.groups where id = v_reg.group_id;

  return jsonb_build_object(
    'state', v_reg.state,
    'room_capacity', v_capacity,
    'slots', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'label', s.label, 'weekday', s.weekday, 'start_time', s.start_time,
        'duration_minutes', s.duration_minutes,
        'seats_remaining', v_capacity - (
          select count(*) from public.registrations r
          where r.group_id = v_reg.group_id and r.time_slot = s.id and r.cohort_number is not null
        ) % v_capacity
      ) order by s.sort_order, s.id)
      from public.time_slots s where s.active
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- student_choose_slot(): confirms the weekly class time and assigns the cohort and seat.
-- ---------------------------------------------------------------------------
create or replace function public.student_choose_slot(p_registration_id uuid, p_time_slot text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reg      public.registrations;
  v_slot     public.time_slots;
  v_capacity integer;
  v_taken    integer;
  v_cohort   integer;
begin
  select * into v_reg from public.registrations
  where id = p_registration_id and user_id = (select auth.uid());
  if v_reg.id is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if v_reg.state <> 'enrolled' then
    raise exception 'Class time can only be chosen after enrolment' using errcode = 'ES001';
  end if;

  select * into v_slot from public.time_slots where id = p_time_slot and active;
  if v_slot.id is null then
    raise exception 'Unknown class time' using errcode = 'P0002';
  end if;

  select room_capacity into v_capacity from public.groups where id = v_reg.group_id;

  -- Same lock as register_participant(), so no two learners ever share a seat
  perform pg_advisory_xact_lock(hashtext('emw_registration:' || v_reg.group_id || ':' || p_time_slot));

  select count(*) into v_taken
  from public.registrations
  where group_id = v_reg.group_id and time_slot = p_time_slot and cohort_number is not null;

  v_cohort := v_taken / v_capacity + 1;

  update public.registrations
  set time_slot          = p_time_slot,
      cohort_number      = v_cohort,
      cohort_code        = upper(v_reg.group_id) || '-' || v_slot.code || '-C' || lpad(v_cohort::text, 2, '0'),
      seat_number        = v_taken % v_capacity + 1,
      state              = 'cohort_assigned',
      cohort_assigned_at = now()
  where id = v_reg.id
  returning * into v_reg;

  perform public.sync_class_sessions(v_reg.group_id);

  return jsonb_build_object(
    'state', v_reg.state, 'time_slot', v_reg.time_slot, 'time_slot_label', v_slot.label,
    'cohort_code', v_reg.cohort_code, 'seat_number', v_reg.seat_number, 'room_capacity', v_capacity
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Live attendance, reported by LiveKit webhooks
-- ---------------------------------------------------------------------------
create table if not exists public.session_attendance (
  session_id      uuid not null references public.class_sessions (id) on delete cascade,
  registration_id uuid not null references public.registrations (id) on delete cascade,
  first_joined_at timestamptz not null,
  last_joined_at  timestamptz,   -- set while connected
  last_left_at    timestamptz,
  joined_seconds  integer not null default 0,
  primary key (session_id, registration_id)
);

alter table public.session_attendance enable row level security;

drop policy if exists "Admins can read session attendance" on public.session_attendance;
create policy "Admins can read session attendance"
  on public.session_attendance for select
  to authenticated
  using ((select public.is_admin()));

revoke all on public.session_attendance from anon;
revoke insert, update, delete, truncate on public.session_attendance from authenticated;

alter table public.student_activity drop constraint if exists student_activity_kind_check;
alter table public.student_activity add constraint student_activity_kind_check
  check (kind in ('video_played', 'class_completed', 'class_uncompleted', 'live_joined'));

-- record_live_event(): p_event is 'joined' or 'left'. Ignores learners who are not in
-- the session's cohort (staff joins are not recorded here).
create or replace function public.record_live_event(
  p_room_name       text,
  p_registration_id uuid,
  p_event           text,
  p_at              timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.class_sessions;
begin
  select s.* into v_session
  from public.class_sessions s
  join public.registrations r
    on r.id = p_registration_id and r.group_id = s.group_id
   and r.time_slot = s.time_slot and r.cohort_number = s.cohort_number
  where s.room_name = p_room_name;

  if v_session.id is null then
    return false;
  end if;

  if p_event = 'joined' then
    insert into public.session_attendance (session_id, registration_id, first_joined_at, last_joined_at)
    values (v_session.id, p_registration_id, p_at, p_at)
    on conflict (session_id, registration_id) do update set last_joined_at = p_at;

    insert into public.student_activity (registration_id, kind) values (p_registration_id, 'live_joined');

    update public.registrations set state = 'active'
    where id = p_registration_id and state = 'cohort_assigned';
  elsif p_event = 'left' then
    update public.session_attendance
    set joined_seconds = joined_seconds + greatest(0, extract(epoch from (p_at - last_joined_at))::integer),
        last_joined_at = null,
        last_left_at   = p_at
    where session_id = v_session.id and registration_id = p_registration_id and last_joined_at is not null;
  else
    raise exception 'Unknown live event %', p_event;
  end if;

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Live class access
-- student_live_session(): a session of the caller's cohort, with its join window.
-- The server issues a LiveKit token only inside that window.
-- ---------------------------------------------------------------------------
create or replace function public.live_session_details(p_session public.class_sessions)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_session.id,
    'room_name', p_session.room_name,
    'status', p_session.status,
    'starts_at', p_session.starts_at,
    'ends_at', p_session.ends_at,
    'join_opens_at', p_session.starts_at - interval '10 minutes',
    'join_closes_at', p_session.ends_at + interval '20 minutes',
    'now', now(),
    'cohort_code', (select r.cohort_code from public.registrations r
                    where r.group_id = p_session.group_id and r.time_slot = p_session.time_slot
                      and r.cohort_number = p_session.cohort_number and r.cohort_code is not null
                    limit 1),
    'group_name', (select g.name from public.groups g where g.id = p_session.group_id),
    'week_number', w.week_number,
    'week_title', w.title,
    'classes', coalesce((select jsonb_agg(c.title order by c.sort_order, c.created_at)
                         from public.classes c where c.week_id = w.id and c.status = 'published'), '[]'::jsonb)
  )
  from public.group_weeks w where w.id = p_session.week_id;
$$;

create or replace function public.student_live_session(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_session public.class_sessions;
  v_reg     public.registrations;
begin
  select s.* into v_session from public.class_sessions s where s.id = p_session_id;

  select r.* into v_reg
  from public.registrations r
  where r.user_id = (select auth.uid())
    and r.group_id = v_session.group_id and r.time_slot = v_session.time_slot
    and r.cohort_number = v_session.cohort_number
    and public.state_has_course_access(r.state);

  if v_session.id is null or v_reg.id is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  return public.live_session_details(v_session)
    || jsonb_build_object('registration_id', v_reg.id, 'participant_name', v_reg.full_name);
end;
$$;

create or replace function public.admin_live_session(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_session public.class_sessions;
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  select s.* into v_session from public.class_sessions s where s.id = p_session_id;
  if v_session.id is null then
    raise exception 'Unknown session' using errcode = 'P0002';
  end if;
  return public.live_session_details(v_session);
end;
$$;

-- student_upcoming_sessions(): the caller's next live classes (still joinable or later).
create or replace function public.student_upcoming_sessions()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(public.live_session_details(s) || jsonb_build_object('registration_id', r.id)
                            order by s.starts_at), '[]'::jsonb)
  from public.registrations r
  join lateral (
    select * from public.class_sessions s
    where s.group_id = r.group_id and s.time_slot = r.time_slot and s.cohort_number = r.cohort_number
      and s.status = 'scheduled' and s.ends_at + interval '20 minutes' > now()
    order by s.starts_at
    limit 3
  ) s on true
  where r.user_id = (select auth.uid()) and public.state_has_course_access(r.state);
$$;

-- ---------------------------------------------------------------------------
-- Class reminders. One row per learner, session, reminder and channel, so a reminder
-- is never sent twice even if two cron runs overlap.
--   reminder_day   : 4 hours before (email), sent until 30 minutes before
--   reminder_final : 2 minutes before (WhatsApp), sent until 10 minutes after the start
-- ---------------------------------------------------------------------------
create table if not exists public.notification_log (
  id                  bigint generated always as identity primary key,
  registration_id     uuid not null references public.registrations (id) on delete cascade,
  session_id          uuid not null references public.class_sessions (id) on delete cascade,
  kind                text not null check (kind in ('reminder_day', 'reminder_final')),
  channel             text not null check (channel in ('email', 'whatsapp')),
  status              text not null default 'sending' check (status in ('sending', 'sent', 'failed')),
  provider_message_id text,
  error               text not null default '',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (registration_id, session_id, kind, channel)
);

alter table public.notification_log enable row level security;

drop policy if exists "Admins can read notifications" on public.notification_log;
create policy "Admins can read notifications"
  on public.notification_log for select
  to authenticated
  using ((select public.is_admin()));

revoke all on public.notification_log from anon;
revoke insert, update, delete, truncate on public.notification_log from authenticated;

-- claim_due_reminders(): records and returns the reminders that are due now.
create or replace function public.claim_due_reminders(p_kind text, p_channel text, p_limit integer default 200)
returns table (
  log_id          bigint,
  registration_id uuid,
  session_id      uuid,
  full_name       text,
  email           text,
  phone           text,
  starts_at       timestamptz,
  group_name      text,
  week_number     integer,
  week_title      text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if p_kind not in ('reminder_day', 'reminder_final') or p_channel not in ('email', 'whatsapp') then
    raise exception 'Unknown reminder %/%', p_kind, p_channel;
  end if;

  return query
  with due as (
    select r.id as reg_id, s.id as sess_id
    from public.class_sessions s
    join public.registrations r
      on r.group_id = s.group_id and r.time_slot = s.time_slot and r.cohort_number = s.cohort_number
    where s.status = 'scheduled'
      and r.state in ('cohort_assigned', 'active')
      and (p_channel <> 'whatsapp' or (r.whatsapp_opt_in and r.phone <> ''))
      and case p_kind
            when 'reminder_day'   then now() >= s.starts_at - interval '4 hours'
                                   and now() <  s.starts_at - interval '30 minutes'
            when 'reminder_final' then now() >= s.starts_at - interval '3 minutes'
                                   and now() <  s.starts_at + interval '10 minutes'
          end
    limit greatest(1, least(coalesce(p_limit, 200), 1000))
  ), claimed as (
    insert into public.notification_log (registration_id, session_id, kind, channel)
    select reg_id, sess_id, p_kind, p_channel from due
    on conflict (registration_id, session_id, kind, channel) do nothing
    returning id, notification_log.registration_id, notification_log.session_id
  )
  select c.id, r.id, s.id, r.full_name, r.email, r.phone, s.starts_at, g.name, w.week_number, w.title
  from claimed c
  join public.registrations r on r.id = c.registration_id
  join public.class_sessions s on s.id = c.session_id
  join public.groups g on g.id = s.group_id
  join public.group_weeks w on w.id = s.week_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- student_dashboard(): as before, plus the lifecycle state and fee
-- ---------------------------------------------------------------------------
create or replace function public.student_dashboard()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',                  r.id,
    'registration_number', r.registration_number,
    'full_name',           r.full_name,
    'group_id',            r.group_id,
    'group_name',          g.name,
    'group_title',         g.title,
    'duration_weeks',      g.duration_weeks,
    'cadence',             g.cadence,
    'room_capacity',       g.room_capacity,
    'fee_paise',           g.fee_paise,
    'currency',            g.currency,
    'time_slot',           r.time_slot,
    'time_slot_label',     (select s.label from public.time_slots s where s.id = r.time_slot),
    'cohort_code',         r.cohort_code,
    'seat_number',         r.seat_number,
    'status',              r.status,
    'state',               r.state,
    'phone',               r.phone,
    'whatsapp_opt_in',     r.whatsapp_opt_in,
    'phone_verified',      r.phone_verified_at is not null,
    'completed_at',        r.completed_at,
    'registered_at',       r.registered_at,
    'total_classes', (
      select count(*) from public.classes c
      join public.group_weeks w on w.id = c.week_id
      where w.group_id = r.group_id and c.status = 'published'
    ),
    'completed_classes', (
      select count(*) from public.class_progress p
      join public.classes c on c.id = p.class_id
      join public.group_weeks w on w.id = c.week_id
      where p.registration_id = r.id and w.group_id = r.group_id and c.status = 'published'
    )
  ) order by r.registered_at desc), '[]'::jsonb)
  from public.registrations r
  join public.groups g on g.id = r.group_id
  where r.user_id = (select auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- student_course(): as before, but only once the learner has a cohort
-- ---------------------------------------------------------------------------
create or replace function public.student_course(p_registration_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_reg public.registrations;
begin
  select * into v_reg from public.registrations
  where id = p_registration_id and user_id = (select auth.uid())
    and public.state_has_course_access(state);

  if v_reg.id is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'registration', jsonb_build_object(
      'id', v_reg.id, 'registration_number', v_reg.registration_number, 'full_name', v_reg.full_name,
      'time_slot', v_reg.time_slot, 'cohort_code', v_reg.cohort_code, 'seat_number', v_reg.seat_number,
      'status', v_reg.status, 'completed_at', v_reg.completed_at
    ),
    'group', (
      select jsonb_build_object('id', g.id, 'name', g.name, 'title', g.title, 'description', g.description,
                                'duration_weeks', g.duration_weeks, 'cadence', g.cadence, 'room_capacity', g.room_capacity)
      from public.groups g where g.id = v_reg.group_id
    ),
    'weeks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', w.id,
        'week_number', w.week_number,
        'title', w.title,
        'release_date', w.release_date,
        'released', public.week_is_released(w.release_date),
        'class_count', (select count(*) from public.classes c where c.week_id = w.id and c.status = 'published'),
        'classes', case when public.week_is_released(w.release_date) then (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', c.id,
            'title', c.title,
            'description', c.description,
            'completed', exists (
              select 1 from public.class_progress p where p.registration_id = v_reg.id and p.class_id = c.id
            ),
            'videos', (
              select coalesce(jsonb_agg(jsonb_build_object(
                'id', v.id, 'title', v.title, 'duration_seconds', v.duration_seconds, 'source_type', v.source_type
              ) order by v.sort_order, v.created_at), '[]'::jsonb)
              from public.class_videos v where v.class_id = c.id
            )
          ) order by c.sort_order, c.created_at), '[]'::jsonb)
          from public.classes c where c.week_id = w.id and c.status = 'published'
        ) else '[]'::jsonb end
      ) order by w.week_number)
      from public.group_weeks w
      where w.group_id = v_reg.group_id
        and exists (select 1 from public.classes c where c.week_id = w.id and c.status = 'published')
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- student_video_source(): as before, but only for learners with a cohort
-- ---------------------------------------------------------------------------
create or replace function public.student_video_source(p_video_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_source   jsonb;
  v_class_id uuid;
  v_reg_id   uuid;
begin
  select jsonb_build_object('source_type', v.source_type, 'url', v.url, 'storage_path', v.storage_path),
         c.id,
         (select r.id from public.registrations r
          where r.user_id = (select auth.uid()) and r.group_id = w.group_id
            and public.state_has_course_access(r.state)
          order by r.registered_at desc limit 1)
  into v_source, v_class_id, v_reg_id
  from public.class_videos v
  join public.classes c on c.id = v.class_id
  join public.group_weeks w on w.id = c.week_id
  where v.id = p_video_id
    and c.status = 'published'
    and public.week_is_released(w.release_date);

  if v_source is null or v_reg_id is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  -- Re-opening the same video within a minute (a page refresh, a double click) is one play
  if not exists (
    select 1 from public.student_activity
    where registration_id = v_reg_id and video_id = p_video_id and kind = 'video_played'
      and created_at > now() - interval '1 minute'
  ) then
    insert into public.student_activity (registration_id, class_id, video_id, kind)
    values (v_reg_id, v_class_id, p_video_id, 'video_played');
  end if;

  return v_source;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke execute on function public.state_has_course_access(text) from public, anon;
grant execute on function public.state_has_course_access(text) to authenticated, service_role;

-- Server-only (service role)
revoke execute on function public.create_interest(text, text, text, boolean, text, uuid) from public, anon, authenticated;
revoke execute on function public.auth_user_id_by_email(text) from public, anon, authenticated;
revoke execute on function public.activate_account(uuid, text, boolean, boolean, text) from public, anon, authenticated;
revoke execute on function public.record_payment_result(text, text, text, text) from public, anon, authenticated;
revoke execute on function public.enroll_without_payment(uuid) from public, anon, authenticated;
revoke execute on function public.sync_class_sessions(text) from public, anon, authenticated;
revoke execute on function public.record_live_event(text, uuid, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.claim_due_reminders(text, text, integer) from public, anon, authenticated;
revoke execute on function public.live_session_details(public.class_sessions) from public, anon, authenticated;
grant execute on function public.create_interest(text, text, text, boolean, text, uuid) to service_role;
grant execute on function public.auth_user_id_by_email(text) to service_role;
grant execute on function public.activate_account(uuid, text, boolean, boolean, text) to service_role;
grant execute on function public.record_payment_result(text, text, text, text) to service_role;
grant execute on function public.enroll_without_payment(uuid) to service_role;
grant execute on function public.sync_class_sessions(text) to service_role;
grant execute on function public.record_live_event(text, uuid, text, timestamptz) to service_role;
grant execute on function public.claim_due_reminders(text, text, integer) to service_role;
grant execute on function public.live_session_details(public.class_sessions) to service_role;

-- Signed-in students and admins
revoke execute on function public.student_slot_options(uuid) from public, anon;
revoke execute on function public.student_choose_slot(uuid, text) from public, anon;
revoke execute on function public.student_live_session(uuid) from public, anon;
revoke execute on function public.admin_live_session(uuid) from public, anon;
revoke execute on function public.student_upcoming_sessions() from public, anon;
grant execute on function public.student_slot_options(uuid) to authenticated;
grant execute on function public.student_choose_slot(uuid, text) to authenticated;
grant execute on function public.student_live_session(uuid) to authenticated;
grant execute on function public.admin_live_session(uuid) to authenticated;
grant execute on function public.student_upcoming_sessions() to authenticated;

-- END OF FILE
