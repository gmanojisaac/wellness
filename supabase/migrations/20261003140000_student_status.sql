-- ============================================================================
-- Student status per registration: active -> completed
--
-- A registration is a student's place in a group. Admins list a group's students
-- and mark them completed once they finish the course.
--
-- Safe to run more than once: every statement checks for or replaces what exists.
-- Run the WHOLE file (114+ lines). It ends with the line "-- END OF FILE".
-- ============================================================================

alter table public.registrations add column if not exists completed_at timestamptz;

alter table public.registrations drop constraint if exists registrations_status_check;
update public.registrations set status = 'active' where status not in ('active', 'completed');
alter table public.registrations alter column status set default 'active';
alter table public.registrations
  add constraint registrations_status_check check (status in ('active', 'completed'));

create index if not exists registrations_group_status_idx
  on public.registrations (group_id, status, registered_at desc);

-- ---------------------------------------------------------------------------
-- admin_list_group_students(): one group's students, filtered by status and search,
-- with the active/completed totals for the tabs.
-- security invoker: the RLS policy on registrations decides what the caller can see.
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_group_students(
  p_group_id text,
  p_status   text    default null,
  p_q        text    default null,
  p_limit    integer default 50,
  p_offset   integer default 0
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_like text;
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if nullif(trim(p_q), '') is not null then
    -- Escape LIKE wildcards so the search is a plain substring match
    v_like := '%' || replace(replace(replace(trim(p_q), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  return jsonb_build_object(
    'counts', jsonb_build_object(
      'active',    (select count(*) from public.registrations where group_id = p_group_id and status = 'active'),
      'completed', (select count(*) from public.registrations where group_id = p_group_id and status = 'completed')
    ),
    'total', (
      select count(*) from public.registrations r
      where r.group_id = p_group_id
        and (nullif(p_status, '') is null or r.status = p_status)
        and (v_like is null or r.full_name ilike v_like or r.email ilike v_like or r.phone ilike v_like
             or r.registration_number ilike v_like or r.cohort_code ilike v_like)
    ),
    'rows', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.registered_at desc)
      from (
        select r.* from public.registrations r
        where r.group_id = p_group_id
          and (nullif(p_status, '') is null or r.status = p_status)
          and (v_like is null or r.full_name ilike v_like or r.email ilike v_like or r.phone ilike v_like
               or r.registration_number ilike v_like or r.cohort_code ilike v_like)
        order by r.registered_at desc
        limit least(greatest(coalesce(p_limit, 50), 1), 200)
        offset greatest(coalesce(p_offset, 0), 0)
      ) t
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.admin_list_group_students(text, text, text, integer, integer) from public, anon;
grant execute on function public.admin_list_group_students(text, text, text, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- admin_set_student_status(): the only way an admin changes a registration.
-- security definer: admins have no UPDATE privilege on registrations, so this
-- function is the single, narrow write path.
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_student_status(p_registration_id uuid, p_status text)
returns public.registrations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.registrations;
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_status not in ('active', 'completed') then
    raise exception 'Unknown status' using errcode = '22023';
  end if;

  update public.registrations
  set status = p_status,
      completed_at = case when p_status = 'completed' then coalesce(completed_at, now()) else null end
  where id = p_registration_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Registration not found' using errcode = 'P0002';
  end if;
  return v_row;
end;
$$;

revoke execute on function public.admin_set_student_status(uuid, text) from public, anon;
grant execute on function public.admin_set_student_status(uuid, text) to authenticated;

-- END OF FILE
