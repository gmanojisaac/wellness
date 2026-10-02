-- ============================================================================
-- Student portal: accounts linked to registrations, class progress, and the
-- functions a signed-in student uses to see and complete their course.
--
-- Security model
--   * A registration belongs to the auth user in registrations.user_id, set by the
--     Next.js server (service role) when the student registers.
--   * Students have no direct table access. Everything goes through the
--     student_*() functions below, which only ever act on the caller's own rows.
--   * Draft classes and weeks that are not released yet are never returned.
--
-- Safe to run more than once: every statement checks for or replaces what exists.
-- Run the WHOLE file. It ends with the line "-- END OF FILE".
-- ============================================================================

alter table public.registrations
  add column if not exists user_id uuid references auth.users (id) on delete set null;

create index if not exists registrations_user_idx on public.registrations (user_id);

-- A week is open when it has no release date, or the date has arrived (India time).
create or replace function public.week_is_released(p_release_date date)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_release_date is null or p_release_date <= (now() at time zone 'Asia/Kolkata')::date;
$$;

-- ---------------------------------------------------------------------------
-- register_participant(): now also links the registration to the student's account.
-- ---------------------------------------------------------------------------
drop function if exists public.register_participant(text, text, text, boolean, text, text, text, text, text);

create or replace function public.register_participant(
  p_full_name           text,
  p_email               text,
  p_phone               text,
  p_whatsapp_opt_in     boolean,
  p_group_id            text,
  p_time_slot           text,
  p_participation_style text,
  p_primary_goal        text,
  p_notes               text,
  p_user_id             uuid default null
)
returns public.registrations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_capacity integer;
  v_taken    integer;
  v_cohort   integer;
  v_number   text;
  v_row      public.registrations;
begin
  select room_capacity into v_capacity
  from public.groups
  where id = p_group_id and status = 'open';

  if v_capacity is null then
    raise exception 'Group is not open for registration' using errcode = 'EG001';
  end if;

  -- Serialize seat allocation per group + slot so concurrent sign-ups never share a seat
  perform pg_advisory_xact_lock(hashtext('emw_registration:' || p_group_id || ':' || p_time_slot));

  select count(*) into v_taken
  from public.registrations
  where group_id = p_group_id and time_slot = p_time_slot;

  v_cohort := v_taken / v_capacity + 1;

  loop
    v_number := 'EMW-REG-' || (100000 + floor(random() * 900000))::integer;
    exit when not exists (select 1 from public.registrations where registration_number = v_number);
  end loop;

  insert into public.registrations (
    registration_number, full_name, email, phone, whatsapp_opt_in, group_id, time_slot,
    cohort_number, cohort_code, seat_number, participation_style, primary_goal, notes, user_id
  ) values (
    v_number, p_full_name, lower(p_email), coalesce(p_phone, ''), coalesce(p_whatsapp_opt_in, false),
    p_group_id, p_time_slot, v_cohort,
    upper(p_group_id) || '-ROOM-' || lpad(v_cohort::text, 2, '0'),
    v_taken % v_capacity + 1, p_participation_style, p_primary_goal, coalesce(p_notes, ''), p_user_id
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function public.register_participant(text, text, text, boolean, text, text, text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.register_participant(text, text, text, boolean, text, text, text, text, text, uuid)
  to service_role;

-- ---------------------------------------------------------------------------
-- Class progress: one row per class a student has completed
-- ---------------------------------------------------------------------------
create table if not exists public.class_progress (
  registration_id uuid not null references public.registrations (id) on delete cascade,
  class_id        uuid not null references public.classes (id) on delete cascade,
  completed_at    timestamptz not null default now(),
  primary key (registration_id, class_id)
);

alter table public.class_progress enable row level security;

drop policy if exists "Admins can read class progress" on public.class_progress;
create policy "Admins can read class progress"
  on public.class_progress for select
  to authenticated
  using ((select public.is_admin()));

revoke all on public.class_progress from anon;
revoke insert, update, delete, truncate on public.class_progress from authenticated;

-- ---------------------------------------------------------------------------
-- student_dashboard(): the caller's registrations with their progress.
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
    'time_slot',           r.time_slot,
    'cohort_code',         r.cohort_code,
    'seat_number',         r.seat_number,
    'status',              r.status,
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
-- student_course(): one of the caller's courses, week by week. Weeks that are not
-- released yet are listed as locked, without their classes.
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
  where id = p_registration_id and user_id = (select auth.uid());

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
-- student_set_class_completed(): mark or unmark a class. When every published class
-- in the group is done the registration becomes 'completed'; unmarking a class of a
-- completed course returns it to 'active'.
-- ---------------------------------------------------------------------------
create or replace function public.student_set_class_completed(p_registration_id uuid, p_class_id uuid, p_completed boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reg   public.registrations;
  v_total integer;
  v_done  integer;
begin
  select * into v_reg from public.registrations
  where id = p_registration_id and user_id = (select auth.uid());

  if v_reg.id is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.classes c
    join public.group_weeks w on w.id = c.week_id
    where c.id = p_class_id and w.group_id = v_reg.group_id
      and c.status = 'published' and public.week_is_released(w.release_date)
  ) then
    raise exception 'Class is not available' using errcode = 'P0002';
  end if;

  if p_completed then
    insert into public.class_progress (registration_id, class_id)
    values (v_reg.id, p_class_id)
    on conflict do nothing;
  else
    delete from public.class_progress where registration_id = v_reg.id and class_id = p_class_id;
  end if;

  select count(*) into v_total
  from public.classes c
  join public.group_weeks w on w.id = c.week_id
  where w.group_id = v_reg.group_id and c.status = 'published';

  select count(*) into v_done
  from public.class_progress p
  join public.classes c on c.id = p.class_id
  join public.group_weeks w on w.id = c.week_id
  where p.registration_id = v_reg.id and w.group_id = v_reg.group_id and c.status = 'published';

  if v_total > 0 and v_done = v_total then
    update public.registrations
    set status = 'completed', completed_at = coalesce(completed_at, now())
    where id = v_reg.id and status <> 'completed';
  elsif not p_completed then
    update public.registrations
    set status = 'active', completed_at = null
    where id = v_reg.id and status = 'completed';
  end if;

  return jsonb_build_object(
    'status', (select status from public.registrations where id = v_reg.id),
    'completed_classes', v_done,
    'total_classes', v_total
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- student_video_source(): where a video lives, only if the caller may watch it.
-- The Next.js server turns an uploaded file's path into a short-lived signed URL.
-- ---------------------------------------------------------------------------
create or replace function public.student_video_source(p_video_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_source jsonb;
begin
  select jsonb_build_object('source_type', v.source_type, 'url', v.url, 'storage_path', v.storage_path)
  into v_source
  from public.class_videos v
  join public.classes c on c.id = v.class_id
  join public.group_weeks w on w.id = c.week_id
  where v.id = p_video_id
    and c.status = 'published'
    and public.week_is_released(w.release_date)
    and exists (
      select 1 from public.registrations r
      where r.user_id = (select auth.uid()) and r.group_id = w.group_id
    );

  if v_source is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return v_source;
end;
$$;

revoke execute on function public.week_is_released(date) from public, anon;
revoke execute on function public.student_dashboard() from public, anon;
revoke execute on function public.student_course(uuid) from public, anon;
revoke execute on function public.student_set_class_completed(uuid, uuid, boolean) from public, anon;
revoke execute on function public.student_video_source(uuid) from public, anon;
grant execute on function public.week_is_released(date) to authenticated;
grant execute on function public.student_dashboard() to authenticated;
grant execute on function public.student_course(uuid) to authenticated;
grant execute on function public.student_set_class_completed(uuid, uuid, boolean) to authenticated;
grant execute on function public.student_video_source(uuid) to authenticated;

-- END OF FILE
