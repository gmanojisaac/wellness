-- ============================================================================
-- Everyday Mental Wellness: public registrations + admin access
--
-- Security model
--   * anon (public site)      : no direct table access. Registrations are written
--                               by the Next.js server using the service-role key,
--                               through register_participant().
--   * authenticated (admins)  : read-only access to registrations, only when the
--                               user has a row in public.admins (enforced by RLS).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Admins
-- ---------------------------------------------------------------------------
create table public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;

create policy "Admins can read their own admin row"
  on public.admins for select
  to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.admins from anon;
revoke insert, update, delete, truncate on public.admins from authenticated;

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- Registrations
-- ---------------------------------------------------------------------------
create table public.registrations (
  id                  uuid primary key default gen_random_uuid(),
  registration_number text not null unique,
  full_name           text not null check (char_length(full_name) between 2 and 120),
  email               text not null check (email = lower(email) and email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  phone               text not null default '' check (char_length(phone) <= 32),
  whatsapp_opt_in     boolean not null default false,
  group_id            text not null check (group_id in ('group1', 'group2', 'group3', 'group4')),
  time_slot           text not null check (time_slot in ('sat_morning', 'sat_afternoon', 'sun_morning', 'sun_evening')),
  cohort_number       integer not null check (cohort_number > 0),
  cohort_code         text not null,
  seat_number         integer not null check (seat_number between 1 and 6),
  participation_style text not null check (participation_style in ('active_voice', 'listener_first')),
  primary_goal        text not null check (char_length(primary_goal) <= 200),
  notes               text not null default '' check (char_length(notes) <= 2000),
  status              text not null default 'confirmed',
  registered_at       timestamptz not null default now(),
  unique (email, group_id)
);

create index registrations_registered_at_idx on public.registrations (registered_at desc);
create index registrations_group_slot_idx on public.registrations (group_id, time_slot);

alter table public.registrations enable row level security;

create policy "Admins can read registrations"
  on public.registrations for select
  to authenticated
  using ((select public.is_admin()));

-- No insert/update/delete policies: writes happen only through register_participant().
revoke all on public.registrations from anon;
revoke insert, update, delete, truncate on public.registrations from authenticated;

-- ---------------------------------------------------------------------------
-- register_participant(): validated insert + seat allocation (6 per room per group & slot)
-- Called only by the Next.js server with the service-role key.
-- Raises unique_violation (23505) when the email is already registered for the group.
-- ---------------------------------------------------------------------------
create function public.register_participant(
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
  v_taken  integer;
  v_cohort integer;
  v_number text;
  v_row    public.registrations;
begin
  -- Serialize seat allocation per group + slot so concurrent sign-ups never share a seat
  perform pg_advisory_xact_lock(hashtext('emw_registration:' || p_group_id || ':' || p_time_slot));

  select count(*) into v_taken
  from public.registrations
  where group_id = p_group_id and time_slot = p_time_slot;

  v_cohort := v_taken / 6 + 1;

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
    v_taken % 6 + 1, p_participation_style, p_primary_goal, coalesce(p_notes, '')
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function public.register_participant(text, text, text, boolean, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.register_participant(text, text, text, boolean, text, text, text, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- group_registration_counts(): aggregate counts for public seat availability
-- ---------------------------------------------------------------------------
create function public.group_registration_counts()
returns table (group_id text, total bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select r.group_id, count(*) from public.registrations r group by r.group_id;
$$;

revoke execute on function public.group_registration_counts() from public, anon, authenticated;
grant execute on function public.group_registration_counts() to service_role;

-- ---------------------------------------------------------------------------
-- admin_list_registrations(): filtered, sorted, paginated listing for the admin panel.
-- security invoker: the RLS policy above decides what the caller can see.
-- p_from / p_to are inclusive calendar dates in the admin's time zone (p_tz).
-- ---------------------------------------------------------------------------
create function public.admin_list_registrations(
  p_q         text    default null,
  p_group_id  text    default null,
  p_time_slot text    default null,
  p_from      date    default null,
  p_to        date    default null,
  p_tz        text    default 'UTC',
  p_sort      text    default 'registeredAt',
  p_order     text    default 'desc',
  p_limit     integer default 25,
  p_offset    integer default 0
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_sort_col text;
  v_dir      text := case when lower(p_order) = 'asc' then 'asc' else 'desc' end;
  v_like     text;
  v_total    bigint;
  v_rows     jsonb;
  v_where    text := $w$
    where ($1 is null or r.full_name ilike $1 or r.email ilike $1 or r.phone ilike $1
                      or r.registration_number ilike $1 or r.cohort_code ilike $1)
      and ($2 is null or r.group_id = $2)
      and ($3 is null or r.time_slot = $3)
      and ($4 is null or r.registered_at >= ($4::timestamp at time zone $6))
      and ($5 is null or r.registered_at <  (($5 + 1)::timestamp at time zone $6))
  $w$;
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  v_sort_col := case p_sort
    when 'fullName'   then 'lower(r.full_name)'
    when 'email'      then 'r.email'
    when 'groupId'    then 'r.group_id'
    when 'cohortCode' then 'r.cohort_code'
    else 'r.registered_at'
  end;

  if nullif(trim(p_q), '') is not null then
    -- Escape LIKE wildcards so the search is a plain substring match
    v_like := '%' || replace(replace(replace(trim(p_q), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  execute 'select count(*) from public.registrations r ' || v_where
    into v_total
    using v_like, nullif(p_group_id, ''), nullif(p_time_slot, ''), p_from, p_to, coalesce(p_tz, 'UTC');

  execute format(
    'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from (
       select r.* from public.registrations r %s
       order by %s %s, r.registered_at desc
       limit $7 offset $8
     ) t',
    v_where, v_sort_col, v_dir)
    into v_rows
    using v_like, nullif(p_group_id, ''), nullif(p_time_slot, ''), p_from, p_to, coalesce(p_tz, 'UTC'),
          least(greatest(coalesce(p_limit, 25), 1), 1000), greatest(coalesce(p_offset, 0), 0);

  return jsonb_build_object('total', v_total, 'rows', v_rows);
end;
$$;

revoke execute on function public.admin_list_registrations(text, text, text, date, date, text, text, text, integer, integer)
  from public, anon;
grant execute on function public.admin_list_registrations(text, text, text, date, date, text, text, text, integer, integer)
  to authenticated;

-- ---------------------------------------------------------------------------
-- admin_registration_stats(): summary numbers for the admin dashboard
-- ---------------------------------------------------------------------------
create function public.admin_registration_stats()
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

  return jsonb_build_object(
    'total',          (select count(*) from public.registrations),
    'last7Days',      (select count(*) from public.registrations where registered_at >= now() - interval '7 days'),
    'whatsAppOptIns', (select count(*) from public.registrations where whatsapp_opt_in),
    'byGroup',        coalesce((select jsonb_object_agg(group_id, n)
                                from (select group_id, count(*) as n from public.registrations group by group_id) g),
                               '{}'::jsonb)
  );
end;
$$;

revoke execute on function public.admin_registration_stats() from public, anon;
grant execute on function public.admin_registration_stats() to authenticated;
