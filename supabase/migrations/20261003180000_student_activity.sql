-- ============================================================================
-- Student activity and the admin student profile
--
-- Every video play and class completion is logged by the database itself (inside
-- the student_*() functions), so attendance cannot be faked from the browser.
-- An "attended day" is a calendar day (India time) with at least one activity.
--
-- Safe to run more than once. It ends with the line "-- END OF FILE".
-- ============================================================================

create table if not exists public.student_activity (
  id              bigint generated always as identity primary key,
  registration_id uuid not null references public.registrations (id) on delete cascade,
  class_id        uuid references public.classes (id) on delete set null,
  video_id        uuid references public.class_videos (id) on delete set null,
  kind            text not null check (kind in ('video_played', 'class_completed', 'class_uncompleted')),
  created_at      timestamptz not null default now()
);

create index if not exists student_activity_registration_idx
  on public.student_activity (registration_id, created_at desc);

alter table public.student_activity enable row level security;

drop policy if exists "Admins can read student activity" on public.student_activity;
create policy "Admins can read student activity"
  on public.student_activity for select
  to authenticated
  using ((select public.is_admin()));

revoke all on public.student_activity from anon;
revoke insert, update, delete, truncate on public.student_activity from authenticated;

-- ---------------------------------------------------------------------------
-- student_video_source(): as before, and now logs the play
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
-- student_set_class_completed(): as before, and now logs the change
-- ---------------------------------------------------------------------------
create or replace function public.student_set_class_completed(p_registration_id uuid, p_class_id uuid, p_completed boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reg     public.registrations;
  v_total   integer;
  v_done    integer;
  v_changed integer;
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
  get diagnostics v_changed = row_count;

  -- Log only real changes, so repeated clicks do not inflate attendance
  if v_changed > 0 then
    insert into public.student_activity (registration_id, class_id, kind)
    values (v_reg.id, p_class_id, case when p_completed then 'class_completed' else 'class_uncompleted' end);
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
-- admin_student_profile(): everything about one student's place in a group:
-- their registration, progress summary, week-by-week classes, and attendance days.
-- ---------------------------------------------------------------------------
create or replace function public.admin_student_profile(p_registration_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_reg public.registrations;
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select * into v_reg from public.registrations where id = p_registration_id;
  if v_reg.id is null then
    raise exception 'Registration not found' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'registration', to_jsonb(v_reg),
    'has_account', v_reg.user_id is not null,
    'group', (select to_jsonb(g) from public.groups g where g.id = v_reg.group_id),

    'weeks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'week_number', w.week_number,
        'title', w.title,
        'release_date', w.release_date,
        'released', public.week_is_released(w.release_date),
        'classes', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', c.id,
            'title', c.title,
            'completed_at', (select p.completed_at from public.class_progress p
                             where p.registration_id = v_reg.id and p.class_id = c.id),
            'plays', (select count(*) from public.student_activity a
                      where a.registration_id = v_reg.id and a.class_id = c.id and a.kind = 'video_played'),
            'first_watched_at', (select min(a.created_at) from public.student_activity a
                                 where a.registration_id = v_reg.id and a.class_id = c.id and a.kind = 'video_played'),
            'last_watched_at', (select max(a.created_at) from public.student_activity a
                                where a.registration_id = v_reg.id and a.class_id = c.id and a.kind = 'video_played')
          ) order by c.sort_order, c.created_at), '[]'::jsonb)
          from public.classes c where c.week_id = w.id and c.status = 'published'
        )
      ) order by w.week_number)
      from public.group_weeks w
      where w.group_id = v_reg.group_id
        and exists (select 1 from public.classes c where c.week_id = w.id and c.status = 'published')
    ), '[]'::jsonb),

    'attendance', coalesce((
      select jsonb_agg(jsonb_build_object(
        'day', d.day, 'video_plays', d.plays, 'classes_completed', d.completed,
        'first_at', d.first_at, 'last_at', d.last_at
      ) order by d.day desc)
      from (
        select (a.created_at at time zone 'Asia/Kolkata')::date as day,
               count(*) filter (where a.kind = 'video_played') as plays,
               count(*) filter (where a.kind = 'class_completed') as completed,
               min(a.created_at) as first_at,
               max(a.created_at) as last_at
        from public.student_activity a
        where a.registration_id = v_reg.id
        group by 1
      ) d
    ), '[]'::jsonb),

    'recent_activity', coalesce((
      select jsonb_agg(jsonb_build_object(
        'kind', x.kind, 'at', x.created_at, 'class_title', x.class_title, 'video_title', x.video_title
      ) order by x.created_at desc)
      from (
        select a.kind, a.created_at, c.title as class_title, v.title as video_title
        from public.student_activity a
        left join public.classes c on c.id = a.class_id
        left join public.class_videos v on v.id = a.video_id
        where a.registration_id = v_reg.id
        order by a.created_at desc
        limit 30
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.admin_student_profile(uuid) from public, anon;
grant execute on function public.admin_student_profile(uuid) to authenticated;

-- END OF FILE
