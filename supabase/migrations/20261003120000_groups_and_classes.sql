-- ============================================================================
-- Admin-managed groups (classrooms) and their weekly classes and videos
--
-- Security model
--   * anon (public site)      : no direct table access. Open groups are read by the
--                               Next.js server with the service-role key (/api/groups).
--   * authenticated (admins)  : full access to groups, weeks, classes, videos and the
--                               class-videos storage bucket, only when is_admin().
--   * learners                : no access yet. Learner policies arrive with learner accounts.
-- ============================================================================

-- Stamps who changed a row and when.
create function public.touch_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Groups
-- ---------------------------------------------------------------------------
create sequence public.groups_id_seq start 5;

create table public.groups (
  id                 text primary key default ('group' || nextval('public.groups_id_seq'))
                       check (id ~ '^[a-z0-9][a-z0-9_-]{1,39}$'),
  name               text not null check (char_length(name) between 2 and 80),
  title              text not null default '' check (char_length(title) <= 160),
  audience           text not null default '' check (char_length(audience) <= 160),
  description        text not null default '' check (char_length(description) <= 600),
  eligibility_notice text not null default '' check (char_length(eligibility_notice) <= 300),
  duration_weeks     integer not null check (duration_weeks between 1 and 104),
  cadence            text not null default '' check (char_length(cadence) <= 160),
  room_capacity      integer not null default 6 check (room_capacity between 1 and 100),
  status             text not null default 'draft' check (status in ('draft', 'open', 'closed', 'archived')),
  sort_order         integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  updated_by         uuid references auth.users (id) on delete set null
);

alter sequence public.groups_id_seq owned by public.groups.id;
create index groups_sort_order_idx on public.groups (sort_order, created_at);

-- The four groups that were previously fixed in src/lib/programs.js keep their ids,
-- so existing registrations stay valid.
insert into public.groups (id, name, title, audience, description, eligibility_notice, duration_weeks, cadence, status, sort_order) values
  ('group1', 'General Adults (18+)', 'The Resilience Continuum: Foundational Self-Care', 'General Adults (18+)',
   'Emotional regulation, cognitive defusion, and healthy boundaries for lifelong mental wellness.',
   'Available to any adult aged 18 and above.', 52, '1 Weekend Lesson per Week', 'open', 1),
  ('group2', 'Parents & Caregivers', 'The Regulated Parent: Co-Regulation & Family Climate', 'Parents & Caregivers',
   'Parental self-regulation, emotion coaching for children, and calm family communication without child diagnosis.',
   'Exclusively for parents/guardians. Teaches caregiver skills only; never diagnoses minors.', 52, '1 Weekend Lesson per Week', 'open', 2),
  ('group3', 'University & College Students (18+)', 'Academic Stress, Imposter Syndrome & Social Courage', 'University & College Students (18+)',
   'Study panic de-escalation, imposter syndrome defusion, roommate communication, and campus isolation relief.',
   'Exclusively for college and graduate students aged 18+.', 4, 'Week 1: 7 daily lessons • Weeks 2–4: 1 weekend lesson/week', 'open', 3),
  ('group4', 'Workplace Professionals', 'Corporate Burnout Recovery & Work-Life Boundaries', 'Workplace Professionals',
   'Corporate burnout recovery, asynchronous Slack/email firewalls, and guilt-free boundary formulas.',
   'For working professionals aged 18+. 100% confidential from employers.', 4, 'Week 1: 7 daily lessons • Weeks 2–4: 1 weekend lesson/week', 'open', 4);

-- Seats are numbered from the registration count, so resizing rooms after people
-- have registered would hand out duplicate seats.
create function public.groups_guard_room_capacity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.room_capacity <> old.room_capacity
     and exists (select 1 from public.registrations where group_id = old.id) then
    raise exception 'Room capacity cannot change once a group has registrations' using errcode = 'EG002';
  end if;
  return new;
end;
$$;

create trigger groups_guard_room_capacity before update on public.groups
  for each row execute function public.groups_guard_room_capacity();
create trigger groups_touch before update on public.groups
  for each row execute function public.touch_row();

alter table public.groups enable row level security;

create policy "Admins can manage groups"
  on public.groups for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

revoke all on public.groups from anon;
revoke truncate on public.groups from authenticated;
revoke all on sequence public.groups_id_seq from anon;
grant usage on sequence public.groups_id_seq to authenticated;

-- ---------------------------------------------------------------------------
-- Registrations now reference the groups table instead of a fixed list
-- ---------------------------------------------------------------------------
alter table public.registrations drop constraint registrations_group_id_check;
alter table public.registrations
  add constraint registrations_group_id_fkey
  foreign key (group_id) references public.groups (id) on update cascade on delete restrict;

alter table public.registrations drop constraint registrations_seat_number_check;
alter table public.registrations add constraint registrations_seat_number_check check (seat_number > 0);

-- register_participant(): as before, but the group must be open and its own room
-- capacity sizes the rooms. Raises EG001 when the group is not open for registration.
create or replace function public.register_participant(
  p_full_name           text,
  p_email               text,
  p_phone               text,
  p_whatsapp_opt_in     boolean,
  p_group_id            text,
  p_time_slot           text,
  p_participation_style text,
  p_primary_goal        text,
  p_notes               text
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
    cohort_number, cohort_code, seat_number, participation_style, primary_goal, notes
  ) values (
    v_number, p_full_name, lower(p_email), coalesce(p_phone, ''), coalesce(p_whatsapp_opt_in, false),
    p_group_id, p_time_slot, v_cohort,
    upper(p_group_id) || '-ROOM-' || lpad(v_cohort::text, 2, '0'),
    v_taken % v_capacity + 1, p_participation_style, p_primary_goal, coalesce(p_notes, '')
  )
  returning * into v_row;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Weeks, classes and videos
-- ---------------------------------------------------------------------------
create table public.group_weeks (
  id           uuid primary key default gen_random_uuid(),
  group_id     text not null references public.groups (id) on update cascade on delete cascade,
  week_number  integer not null check (week_number between 1 and 104),
  title        text not null default '' check (char_length(title) <= 120),
  release_date date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users (id) on delete set null,
  unique (group_id, week_number)
);

create table public.classes (
  id          uuid primary key default gen_random_uuid(),
  week_id     uuid not null references public.group_weeks (id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 160),
  description text not null default '' check (char_length(description) <= 2000),
  sort_order  integer not null default 0,
  status      text not null default 'draft' check (status in ('draft', 'published')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users (id) on delete set null
);

create index classes_week_idx on public.classes (week_id, sort_order);

create table public.class_videos (
  id               uuid primary key default gen_random_uuid(),
  class_id         uuid not null references public.classes (id) on delete cascade,
  title            text not null check (char_length(title) between 1 and 160),
  source_type      text not null check (source_type in ('upload', 'link')),
  storage_path     text,
  url              text,
  duration_seconds integer check (duration_seconds >= 0),
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  updated_by       uuid references auth.users (id) on delete set null,
  check (
    (source_type = 'upload' and storage_path is not null and url is null)
    or (source_type = 'link' and url ~ '^https://' and char_length(url) <= 2000 and storage_path is null)
  )
);

create index class_videos_class_idx on public.class_videos (class_id, sort_order);

create trigger group_weeks_touch before update on public.group_weeks
  for each row execute function public.touch_row();
create trigger classes_touch before update on public.classes
  for each row execute function public.touch_row();
create trigger class_videos_touch before update on public.class_videos
  for each row execute function public.touch_row();

alter table public.group_weeks enable row level security;
alter table public.classes enable row level security;
alter table public.class_videos enable row level security;

create policy "Admins can manage weeks"
  on public.group_weeks for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "Admins can manage classes"
  on public.classes for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "Admins can manage class videos"
  on public.class_videos for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

revoke all on public.group_weeks, public.classes, public.class_videos from anon;
revoke truncate on public.group_weeks, public.classes, public.class_videos from authenticated;

-- ---------------------------------------------------------------------------
-- admin_list_groups(): every group with its registration, week and class counts.
-- security invoker: the RLS policies above decide what the caller can see.
-- ---------------------------------------------------------------------------
create function public.admin_list_groups()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(to_jsonb(g) || jsonb_build_object(
      'registration_count', (select count(*) from public.registrations r where r.group_id = g.id),
      'week_count',         (select count(*) from public.group_weeks w where w.group_id = g.id),
      'class_count',        (select count(*) from public.classes c
                             join public.group_weeks w on w.id = c.week_id where w.group_id = g.id)
    ) order by g.sort_order, g.created_at)
    from public.groups g
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.admin_list_groups() from public, anon;
grant execute on function public.admin_list_groups() to authenticated;

-- ---------------------------------------------------------------------------
-- Private storage bucket for uploaded class videos
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('class-videos', 'class-videos', false)
on conflict (id) do nothing;

create policy "Admins can manage class video files"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'class-videos' and (select public.is_admin()))
  with check (bucket_id = 'class-videos' and (select public.is_admin()));
