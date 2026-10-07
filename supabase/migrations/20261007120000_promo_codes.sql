-- ============================================================================
-- Promo-code enrolment
--
-- The first learners (about 100) enrol free with a promo code instead of paying.
-- An admin turns "promo checkout" on or off and manages the codes:
--   * promo checkout ON  : the enrolment page asks for a promo code; Razorpay is not offered.
--   * promo checkout OFF : the normal Razorpay checkout (payments, webhooks) is used.
-- A valid code moves the registration ACTIVATED / PAYMENT_PENDING -> ENROLLED, the same
-- as a successful payment, and is recorded in promo_redemptions.
--
-- Safe to run more than once. Run the WHOLE file. It ends with the line "-- END OF FILE".
-- Requires 20261005120000_enrollment_lifecycle.sql.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- App settings (a single row)
-- ---------------------------------------------------------------------------
create table if not exists public.app_settings (
  id                     boolean primary key default true check (id),
  promo_checkout_enabled boolean not null default true,
  updated_at             timestamptz not null default now()
);

insert into public.app_settings (id) values (true) on conflict (id) do nothing;

alter table public.app_settings enable row level security;

drop policy if exists "Admins read app settings" on public.app_settings;
create policy "Admins read app settings"
  on public.app_settings for select
  to authenticated
  using ((select public.is_admin()));

drop policy if exists "Admins update app settings" on public.app_settings;
create policy "Admins update app settings"
  on public.app_settings for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

revoke all on public.app_settings from anon;
revoke insert, delete, truncate on public.app_settings from authenticated;

-- ---------------------------------------------------------------------------
-- Promo codes. Codes are stored upper-case; learners may type them in any case.
-- max_uses null = unlimited. group_id null = valid for every group.
-- ---------------------------------------------------------------------------
create table if not exists public.promo_codes (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (code ~ '^[A-Z0-9_-]{3,32}$'),
  description text not null default '' check (char_length(description) <= 200),
  group_id    text references public.groups (id) on delete cascade,
  max_uses    integer check (max_uses is null or max_uses > 0),
  used_count  integer not null default 0 check (used_count >= 0),
  active      boolean not null default true,
  expires_at  timestamptz,
  created_at  timestamptz not null default now()
);

alter table public.promo_codes enable row level security;

drop policy if exists "Admins manage promo codes" on public.promo_codes;
create policy "Admins manage promo codes"
  on public.promo_codes for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

revoke all on public.promo_codes from anon;

-- One redemption per registration. A used code cannot be deleted (deactivate it instead).
create table if not exists public.promo_redemptions (
  registration_id uuid primary key references public.registrations (id) on delete cascade,
  promo_code_id   uuid not null references public.promo_codes (id) on delete restrict,
  redeemed_at     timestamptz not null default now()
);

create index if not exists promo_redemptions_code_idx on public.promo_redemptions (promo_code_id, redeemed_at desc);

alter table public.promo_redemptions enable row level security;

drop policy if exists "Admins read promo redemptions" on public.promo_redemptions;
create policy "Admins read promo redemptions"
  on public.promo_redemptions for select
  to authenticated
  using ((select public.is_admin()));

revoke all on public.promo_redemptions from anon;
revoke insert, update, delete, truncate on public.promo_redemptions from authenticated;

-- ---------------------------------------------------------------------------
-- promo_checkout_enabled(): whether learners enrol with a promo code instead of paying.
-- ---------------------------------------------------------------------------
create or replace function public.promo_checkout_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select promo_checkout_enabled from public.app_settings where id), false);
$$;

-- ---------------------------------------------------------------------------
-- student_redeem_promo(): enrols one of the caller's registrations with a promo code.
-- Errors: EP001 promo checkout is off, EP002 unknown / inactive / expired / other group,
--         EP003 the code has been used up, ES002 the registration does not need payment.
-- ---------------------------------------------------------------------------
create or replace function public.student_redeem_promo(p_registration_id uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reg  public.registrations;
  v_code public.promo_codes;
begin
  select * into v_reg from public.registrations
  where id = p_registration_id and user_id = (select auth.uid())
  for update;
  if v_reg.id is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if not public.promo_checkout_enabled() then
    raise exception 'Promo codes are not accepted right now' using errcode = 'EP001';
  end if;

  if v_reg.state not in ('activated', 'payment_pending') then
    raise exception 'This enrolment does not need a payment' using errcode = 'ES002';
  end if;

  -- Row lock so two learners cannot both take the last use of a code
  select * into v_code from public.promo_codes
  where code = upper(btrim(coalesce(p_code, '')))
  for update;

  if v_code.id is null
     or not v_code.active
     or (v_code.expires_at is not null and v_code.expires_at <= now())
     or (v_code.group_id is not null and v_code.group_id <> v_reg.group_id) then
    raise exception 'Invalid promo code' using errcode = 'EP002';
  end if;

  if v_code.max_uses is not null and v_code.used_count >= v_code.max_uses then
    raise exception 'Promo code used up' using errcode = 'EP003';
  end if;

  insert into public.promo_redemptions (registration_id, promo_code_id) values (v_reg.id, v_code.id);
  update public.promo_codes set used_count = used_count + 1 where id = v_code.id;

  update public.registrations
  set state = 'enrolled', enrolled_at = coalesce(enrolled_at, now())
  where id = v_reg.id
  returning * into v_reg;

  return jsonb_build_object('state', v_reg.state, 'code', v_code.code);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke execute on function public.promo_checkout_enabled() from public, anon;
revoke execute on function public.student_redeem_promo(uuid, text) from public, anon;
grant execute on function public.promo_checkout_enabled() to authenticated, service_role;
grant execute on function public.student_redeem_promo(uuid, text) to authenticated;

-- END OF FILE
