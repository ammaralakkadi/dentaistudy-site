-- DentAIstudy Partners: production backend foundation
-- Applied to the DentAIstudy Supabase project via migration:
-- create_partner_backend_foundation
--
-- Partner operations remain manual: no Paddle partner webhook and no payout bot.
-- Browser access is protected by Supabase Auth + RLS.
-- Admin authorization uses auth.users app_metadata.partner_admin = true.

create table public.partner_settings (
  id smallint primary key default 1 check (id = 1),
  program_status text not null default 'active'
    check (program_status in ('active', 'paused')),
  minimum_confirmed_paid_users smallint not null default 10
    check (minimum_confirmed_paid_users > 0),
  initial_pro_months smallint not null default 3
    check (initial_pro_months > 0),
  qualified_pro_months smallint not null default 12
    check (qualified_pro_months > 0),
  monthly_first_payment_rate numeric(5, 2) not null default 50
    check (monthly_first_payment_rate between 0 and 100),
  monthly_renewal_rate numeric(5, 2) not null default 20
    check (monthly_renewal_rate between 0 and 100),
  monthly_renewal_count smallint not null default 5
    check (monthly_renewal_count >= 0),
  annual_first_payment_rate numeric(5, 2) not null default 30
    check (annual_first_payment_rate between 0 and 100),
  approval_days smallint not null default 30
    check (approval_days > 0),
  minimum_payout_usd numeric(10, 2) not null default 50
    check (minimum_payout_usd >= 0),
  payout_window text not null default '1–5 of each month',
  updated_at timestamptz not null default now()
);

insert into public.partner_settings (id)
values (1);

create table public.partner_creators (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete set null,
  name text not null check (btrim(name) <> ''),
  initials text,
  email text not null check (btrim(email) <> ''),
  promo_code text not null check (btrim(promo_code) <> ''),
  account_status text not null default 'active'
    check (account_status in ('active', 'paused', 'ended')),
  payout_method text not null default 'Not added',
  accepted_at timestamptz not null default now(),
  pro_access_until date,
  qualified_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index partner_creators_email_lower_uidx
  on public.partner_creators (lower(email));

create unique index partner_creators_promo_code_upper_uidx
  on public.partner_creators (upper(promo_code));

create index partner_creators_user_id_idx
  on public.partner_creators (user_id);

create table public.partner_payouts (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.partner_creators (id),
  amount_usd numeric(10, 2) not null check (amount_usd > 0),
  payment_method text not null default 'Wise or bank transfer',
  scheduled_date date,
  status text not null default 'ready'
    check (status in ('ready', 'paid', 'cancelled')),
  transfer_reference text,
  paid_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partner_payouts_paid_details_check check (
    status <> 'paid'
    or (
      transfer_reference is not null
      and btrim(transfer_reference) <> ''
      and paid_date is not null
    )
  ),
  constraint partner_payouts_id_creator_unique unique (id, creator_id)
);

create unique index partner_payouts_transfer_reference_uidx
  on public.partner_payouts (transfer_reference)
  where transfer_reference is not null;

create index partner_payouts_creator_created_idx
  on public.partner_payouts (creator_id, created_at desc);

create table public.partner_referrals (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.partner_creators (id),
  customer_token uuid not null,
  payment_date date not null,
  plan text not null check (plan in ('monthly', 'annual')),
  payment_type text not null
    check (payment_type in ('first_payment', 'renewal')),
  renewal_number smallint not null default 0
    check (renewal_number >= 0),
  paddle_total_earnings numeric(10, 2) not null
    check (paddle_total_earnings >= 0),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'refunded', 'disputed')),
  approval_due_date date not null,
  approved_at timestamptz,
  commission_rate numeric(5, 2) not null
    check (commission_rate between 0 and 100),
  commission_amount numeric(10, 2) not null
    check (commission_amount >= 0),
  payout_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partner_referrals_payment_sequence_check check (
    (payment_type = 'first_payment' and renewal_number = 0)
    or (
      plan = 'monthly'
      and payment_type = 'renewal'
      and renewal_number > 0
    )
  ),
  constraint partner_referrals_customer_sequence_unique unique (
    creator_id,
    customer_token,
    payment_type,
    renewal_number
  ),
  constraint partner_referrals_id_creator_unique unique (id, creator_id),
  constraint partner_referrals_payout_creator_fkey foreign key (
    payout_id,
    creator_id
  ) references public.partner_payouts (id, creator_id)
);

create index partner_referrals_creator_date_idx
  on public.partner_referrals (creator_id, payment_date desc);

create index partner_referrals_creator_status_idx
  on public.partner_referrals (creator_id, status);

create index partner_referrals_creator_customer_idx
  on public.partner_referrals (creator_id, customer_token);

create table public.partner_referral_sources (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null unique,
  creator_id uuid not null,
  paddle_customer_id text not null check (btrim(paddle_customer_id) <> ''),
  paddle_transaction_id text not null check (btrim(paddle_transaction_id) <> ''),
  created_at timestamptz not null default now(),
  constraint partner_referral_sources_referral_creator_fkey foreign key (
    referral_id,
    creator_id
  ) references public.partner_referrals (id, creator_id) on delete cascade
);
create unique index partner_referral_sources_transaction_uidx
  on public.partner_referral_sources (paddle_transaction_id);

create index partner_referral_sources_customer_idx
  on public.partner_referral_sources (creator_id, paddle_customer_id);

create table public.partner_activity (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid references public.partner_creators (id) on delete set null,
  actor_user_id uuid references auth.users (id) on delete set null,
  actor_kind text not null default 'system'
    check (actor_kind in ('admin', 'partner', 'system')),
  event_type text not null check (btrim(event_type) <> ''),
  details text,
  visibility text not null default 'admin'
    check (visibility in ('admin', 'partner')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index partner_activity_creator_created_idx
  on public.partner_activity (creator_id, created_at desc);

create index partner_activity_created_idx
  on public.partner_activity (created_at desc);

create table public.partner_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.partner_creators (id),
  requested_by uuid not null references auth.users (id),
  status text not null default 'pending'
    check (status in ('pending', 'resolved', 'declined')),
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  admin_note text,
  constraint partner_deletion_requests_resolution_check check (
    (status = 'pending' and resolved_at is null)
    or (status in ('resolved', 'declined') and resolved_at is not null)
  )
);

create unique index partner_deletion_requests_one_pending_uidx
  on public.partner_deletion_requests (creator_id)
  where status = 'pending';

create index partner_deletion_requests_status_requested_idx
  on public.partner_deletion_requests (status, requested_at desc);

create or replace function public.partner_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.partner_prepare_referral()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  rules public.partner_settings%rowtype;
  original_approval_days integer;
begin
  select *
  into rules
  from public.partner_settings
  where id = 1;

  if not found then
    raise exception 'Partner settings are not configured';
  end if;

  if new.payment_type = 'first_payment' then
    if new.customer_token is null then
      new.customer_token = gen_random_uuid();
    end if;
  else
    if new.customer_token is null then
      raise exception 'Renewals must reuse the existing customer token';
    end if;

    if new.plan <> 'monthly' then
      raise exception 'Annual subscriptions do not use renewal commission';
    end if;

    if
      tg_op = 'INSERT'
      or new.payment_type is distinct from old.payment_type
      or new.renewal_number is distinct from old.renewal_number
    then
      if new.renewal_number > rules.monthly_renewal_count then
        raise exception 'Renewal number exceeds the commissionable renewal limit';
      end if;
    end if;
  end if;

  if tg_op = 'INSERT' then
    if new.payment_type = 'renewal' then
      new.commission_rate = rules.monthly_renewal_rate;
    elsif new.plan = 'monthly' then
      new.commission_rate = rules.monthly_first_payment_rate;
    else
      new.commission_rate = rules.annual_first_payment_rate;
    end if;

    new.commission_amount =
      round(new.paddle_total_earnings * new.commission_rate / 100, 2);
    new.approval_due_date = new.payment_date + rules.approval_days;
  else
    if
      new.plan is distinct from old.plan
      or new.payment_type is distinct from old.payment_type
    then
      if new.payment_type = 'renewal' then
        new.commission_rate = rules.monthly_renewal_rate;
      elsif new.plan = 'monthly' then
        new.commission_rate = rules.monthly_first_payment_rate;
      else
        new.commission_rate = rules.annual_first_payment_rate;
      end if;
    else
      new.commission_rate = old.commission_rate;
    end if;

    if
      new.paddle_total_earnings is distinct from old.paddle_total_earnings
      or new.commission_rate is distinct from old.commission_rate
    then
      new.commission_amount =
        round(new.paddle_total_earnings * new.commission_rate / 100, 2);
    else
      new.commission_amount = old.commission_amount;
    end if;

    if new.payment_date is distinct from old.payment_date then
      original_approval_days = old.approval_due_date - old.payment_date;
      new.approval_due_date = new.payment_date + original_approval_days;
    else
      new.approval_due_date = old.approval_due_date;
    end if;
  end if;

  if new.status = 'approved' then
    if current_date < new.approval_due_date then
      raise exception 'Referral cannot be approved before its approval date';
    end if;

    if new.approved_at is null then
      new.approved_at = now();
    end if;
  end if;

  return new;
end;
$$;

create trigger partner_settings_set_updated_at
before update on public.partner_settings
for each row execute function public.partner_set_updated_at();

create trigger partner_creators_set_updated_at
before update on public.partner_creators
for each row execute function public.partner_set_updated_at();

create trigger partner_payouts_set_updated_at
before update on public.partner_payouts
for each row execute function public.partner_set_updated_at();

create trigger partner_referrals_prepare
before insert or update on public.partner_referrals
for each row execute function public.partner_prepare_referral();

create trigger partner_referrals_set_updated_at
before update on public.partner_referrals
for each row execute function public.partner_set_updated_at();

alter table public.partner_settings enable row level security;
alter table public.partner_creators enable row level security;
alter table public.partner_payouts enable row level security;
alter table public.partner_referrals enable row level security;
alter table public.partner_referral_sources enable row level security;
alter table public.partner_activity enable row level security;
alter table public.partner_deletion_requests enable row level security;

-- Supabase may apply broad default table grants in exposed schemas.
-- Remove them first, then expose only the operations used by the Partner app.
revoke all on public.partner_settings from anon, authenticated;
revoke all on public.partner_creators from anon, authenticated;
revoke all on public.partner_payouts from anon, authenticated;
revoke all on public.partner_referrals from anon, authenticated;
revoke all on public.partner_referral_sources from anon, authenticated;
revoke all on public.partner_activity from anon, authenticated;
revoke all on public.partner_deletion_requests from anon, authenticated;

grant select, update on public.partner_settings to authenticated;
grant select, insert, update, delete on public.partner_creators to authenticated;
grant select, insert, update, delete on public.partner_payouts to authenticated;
grant select, insert, update, delete on public.partner_referrals to authenticated;
grant select, insert, update, delete on public.partner_referral_sources to authenticated;
grant select, insert, update, delete on public.partner_activity to authenticated;
grant select, insert, update on public.partner_deletion_requests to authenticated;

create policy "Partner settings read"
on public.partner_settings
for select
to authenticated
using (
  (select auth.jwt() -> 'app_metadata' ->> 'partner_admin') = 'true'
  or exists (
    select 1
    from public.partner_creators
    where partner_creators.user_id = (select auth.uid())
  )
);

create policy "Partner settings admin update"
on public.partner_settings
for update
to authenticated
using ((select auth.jwt() -> 'app_metadata' ->> 'partner_admin') = 'true')
with check ((select auth.jwt() -> 'app_metadata' ->> 'partner_admin') = 'true');

create policy "Partner creators read"
on public.partner_creators
for select
to authenticated
using (
  (select auth.jwt() -> 'app_metadata' ->> 'partner_admin') = 'true'
  or user_id = (select auth.uid())
);

create policy "Partner creators admin insert"
on public.partner_creators
for insert
to authenticated
with check ((select auth.jwt() -> 'app_metadata' ->> 'partner_admin') = 'true');

create policy "Partner creators admin update"
on public.partner_creators
for update
to authenticated
using ((select auth.jwt() -> 'app_metadata' ->> 'partner_admin') = 'true')
with check ((select auth.jwt() -> 'app_metadata' ->> 'partner_admin') = 'true');

create policy "Partner creators admin delete"
on public.partner_creators
for delete
to authenticated
using ((select auth.jwt() -> 'app_metadata' ->> 'partner_admin') = 'true');

create policy "Partner payouts read"
on public.partner_payouts
for select
to authenticated
using (
  (select auth.jwt() -> 'app_metadata' ->> 'partner_admin') = 'true'
  or exists (
    select 1
    from public.partner_creators
    where partner_creators.id = partner_payouts.creator_id
      and partner_creators.user_id = (select auth.uid())
  )
);

create policy "Partner payouts admin insert"
on public.partner_payouts
for insert
to authenticated
with check ((select auth.jwt() -> 'app_metadata' ->> 'partner_admin') = 'true');

create policy "Partner payouts admin update"
on public.partner_payouts
for update
to authenticated
using ((select auth.jwt() -> 'app_metadata' ->> 'partner_admin') = 'true')
with check ((select auth.jwt() -> 'app_metadata' ->> 'partner_admin') = 'true');

create policy "Partner payouts admin delete"
on public.partner_payouts
for delete
to authenticated
using ((select auth.jwt() -> 'app_metadata' ->> 'partner_admin') = 'true');

create policy "Partner referrals read"
on public.partner_referrals
for select
to authenticated
using (
  (select auth.jwt() -> 'app_metadata' ->> 'partner_admin') = 'true'
  or exists (
    select 1
    from public.partner_creators
    where partner_creators.id = partner_referrals.creator_id
      and partner_creators.user_id = (select auth.uid())
  )
);

create policy "Partner referrals admin insert"
on public.partner_referrals
for insert
to authenticated
with check ((select auth.jwt() -> 'app_metadata' ->> 'partner_admin') = 'true');

create policy "Partner referrals admin update"
on public.partner_referrals
for update
to authenticated
using ((select auth.jwt() -> 'app_metadata' ->> 'partner_admin') = 'true')
with check ((select auth.jwt() -> 'app_metadata' ->> 'partner_admin') = 'true');

create policy "Partner referrals admin delete"
on public.partner_referrals
for delete
to authenticated
using ((select auth.jwt() -> 'app_metadata' ->> 'partner_admin') = 'true');

create policy "Partner referral sources admin read"
on public.partner_referral_sources
for select
to authenticated
using ((select auth.jwt() -> 'app_metadata' ->> 'partner_admin') = 'true');

create policy "Partner referral sources admin insert"
on public.partner_referral_sources
for insert
to authenticated
with check ((select auth.jwt() -> 'app_metadata' ->> 'partner_admin') = 'true');

create policy "Partner referral sources admin update"
on public.partner_referral_sources
for update
to authenticated
using ((select auth.jwt() -> 'app_metadata' ->> 'partner_admin') = 'true')
with check ((select auth.jwt() -> 'app_metadata' ->> 'partner_admin') = 'true');

create policy "Partner referral sources admin delete"
on public.partner_referral_sources
for delete
to authenticated
using ((select auth.jwt() -> 'app_metadata' ->> 'partner_admin') = 'true');

create policy "Partner activity read"
on public.partner_activity
for select
to authenticated
using (
  (select auth.jwt() -> 'app_metadata' ->> 'partner_admin') = 'true'
  or (
    visibility = 'partner'
    and exists (
      select 1
      from public.partner_creators
      where partner_creators.id = partner_activity.creator_id
        and partner_creators.user_id = (select auth.uid())
    )
  )
);

create policy "Partner activity insert"
on public.partner_activity
for insert
to authenticated
with check (
  (select auth.jwt() -> 'app_metadata' ->> 'partner_admin') = 'true'
  or (
    actor_kind = 'partner'
    and actor_user_id = (select auth.uid())
    and event_type = 'partner_signed_in'
    and visibility = 'admin'
    and exists (
      select 1
      from public.partner_creators
      where partner_creators.id = partner_activity.creator_id
        and partner_creators.user_id = (select auth.uid())
    )
  )
);

create policy "Partner activity admin update"
on public.partner_activity
for update
to authenticated
using ((select auth.jwt() -> 'app_metadata' ->> 'partner_admin') = 'true')
with check ((select auth.jwt() -> 'app_metadata' ->> 'partner_admin') = 'true');

create policy "Partner activity admin delete"
on public.partner_activity
for delete
to authenticated
using ((select auth.jwt() -> 'app_metadata' ->> 'partner_admin') = 'true');

create policy "Partner deletion requests read"
on public.partner_deletion_requests
for select
to authenticated
using (
  (select auth.jwt() -> 'app_metadata' ->> 'partner_admin') = 'true'
  or (
    requested_by = (select auth.uid())
    and exists (
      select 1
      from public.partner_creators
      where partner_creators.id = partner_deletion_requests.creator_id
        and partner_creators.user_id = (select auth.uid())
    )
  )
);

create policy "Partner deletion requests insert"
on public.partner_deletion_requests
for insert
to authenticated
with check (
  requested_by = (select auth.uid())
  and exists (
    select 1
    from public.partner_creators
    where partner_creators.id = partner_deletion_requests.creator_id
      and partner_creators.user_id = (select auth.uid())
  )
);

create policy "Partner deletion requests admin update"
on public.partner_deletion_requests
for update
to authenticated
using ((select auth.jwt() -> 'app_metadata' ->> 'partner_admin') = 'true')
with check ((select auth.jwt() -> 'app_metadata' ->> 'partner_admin') = 'true');


-- T7: atomic Admin payout workflow
create or replace function public.partner_create_payout(
  p_creator_id uuid,
  p_scheduled_date date,
  p_notes text
)
returns public.partner_payouts
language plpgsql
security invoker
set search_path = public
as $$
declare
  rules public.partner_settings%rowtype;
  creator public.partner_creators%rowtype;
  payout_row public.partner_payouts%rowtype;
  confirmed_count integer;
  approved_amount numeric(10, 2);
begin
  if coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'partner_admin')::boolean, false) is not true then
    raise exception 'Partner Admin access is required';
  end if;

  select *
  into rules
  from public.partner_settings
  where id = 1;

  if not found then
    raise exception 'Partner settings are not configured';
  end if;

  select *
  into creator
  from public.partner_creators
  where id = p_creator_id;

  if not found then
    raise exception 'Partner not found';
  end if;

  if creator.payout_method is null
     or btrim(creator.payout_method) = ''
     or lower(btrim(creator.payout_method)) = 'not added' then
    raise exception 'Add the Partner payout method before creating a payout';
  end if;

  if exists (
    select 1
    from public.partner_payouts
    where creator_id = p_creator_id
      and status = 'ready'
  ) then
    raise exception 'This Partner already has a ready payout';
  end if;

  select count(distinct customer_token)
  into confirmed_count
  from public.partner_referrals
  where creator_id = p_creator_id
    and payment_type = 'first_payment'
    and status = 'approved';

  if confirmed_count < rules.minimum_confirmed_paid_users then
    raise exception 'This Partner has not reached the confirmed-user payout threshold';
  end if;

  select coalesce(round(sum(commission_amount), 2), 0)
  into approved_amount
  from public.partner_referrals
  where creator_id = p_creator_id
    and status = 'approved'
    and payout_id is null;

  if approved_amount < rules.minimum_payout_usd then
    raise exception 'Approved commission is below the minimum payout';
  end if;

  insert into public.partner_payouts (
    creator_id,
    amount_usd,
    payment_method,
    scheduled_date,
    status,
    notes
  )
  values (
    p_creator_id,
    approved_amount,
    creator.payout_method,
    coalesce(p_scheduled_date, current_date),
    'ready',
    nullif(btrim(coalesce(p_notes, '')), '')
  )
  returning * into payout_row;

  update public.partner_referrals
  set payout_id = payout_row.id
  where creator_id = p_creator_id
    and status = 'approved'
    and payout_id is null;

  insert into public.partner_activity (
    creator_id,
    actor_user_id,
    actor_kind,
    event_type,
    details,
    visibility,
    metadata
  )
  values (
    p_creator_id,
    (select auth.uid()),
    'admin',
    'payout_ready',
    'Payout of $' || to_char(approved_amount, 'FM999999990.00') || ' prepared.',
    'partner',
    jsonb_build_object(
      'status', 'Ready',
      'title', 'Payout ready',
      'payout_id', payout_row.id
    )
  );

  return payout_row;
end;
$$;

create or replace function public.partner_mark_payout_paid(
  p_payout_id uuid,
  p_transfer_reference text,
  p_paid_date date
)
returns public.partner_payouts
language plpgsql
security invoker
set search_path = public
as $$
declare
  payout_row public.partner_payouts%rowtype;
  transfer_ref text;
begin
  if coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'partner_admin')::boolean, false) is not true then
    raise exception 'Partner Admin access is required';
  end if;

  transfer_ref = btrim(coalesce(p_transfer_reference, ''));
  if transfer_ref = '' then
    raise exception 'Transfer reference is required';
  end if;

  if p_paid_date is null then
    raise exception 'Paid date is required';
  end if;

  if p_paid_date > current_date then
    raise exception 'Paid date cannot be in the future';
  end if;

  select *
  into payout_row
  from public.partner_payouts
  where id = p_payout_id
  for update;

  if not found then
    raise exception 'Payout not found';
  end if;

  if payout_row.status = 'paid' then
    raise exception 'This payout is already marked as paid';
  end if;

  if payout_row.status <> 'ready' then
    raise exception 'Only ready payouts can be marked as paid';
  end if;

  update public.partner_payouts
  set
    status = 'paid',
    transfer_reference = transfer_ref,
    paid_date = p_paid_date
  where id = p_payout_id
  returning * into payout_row;

  insert into public.partner_activity (
    creator_id,
    actor_user_id,
    actor_kind,
    event_type,
    details,
    visibility,
    metadata
  )
  values (
    payout_row.creator_id,
    (select auth.uid()),
    'admin',
    'payout_paid',
    'Payout of $' || to_char(payout_row.amount_usd, 'FM999999990.00') || ' recorded as paid.',
    'partner',
    jsonb_build_object(
      'status', 'Paid',
      'title', 'Payout paid',
      'payout_id', payout_row.id
    )
  );

  return payout_row;
end;
$$;

revoke all on function public.partner_create_payout(uuid, date, text) from public;
revoke all on function public.partner_create_payout(uuid, date, text) from anon;
grant execute on function public.partner_create_payout(uuid, date, text) to authenticated;

revoke all on function public.partner_mark_payout_paid(uuid, text, date) from public;
revoke all on function public.partner_mark_payout_paid(uuid, text, date) from anon;
grant execute on function public.partner_mark_payout_paid(uuid, text, date) to authenticated;

-- T8: payout ledger integrity
create or replace function public.partner_lock_payout_referral()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.payout_id is not null and (
    new.creator_id is distinct from old.creator_id
    or new.customer_token is distinct from old.customer_token
    or new.payment_date is distinct from old.payment_date
    or new.plan is distinct from old.plan
    or new.payment_type is distinct from old.payment_type
    or new.renewal_number is distinct from old.renewal_number
    or new.paddle_total_earnings is distinct from old.paddle_total_earnings
    or new.status is distinct from old.status
    or new.approval_due_date is distinct from old.approval_due_date
    or new.approved_at is distinct from old.approved_at
    or new.commission_rate is distinct from old.commission_rate
    or new.commission_amount is distinct from old.commission_amount
    or new.payout_id is distinct from old.payout_id
  ) then
    raise exception 'Referral is locked because it is already attached to a payout';
  end if;

  return new;
end;
$$;

drop trigger if exists partner_referrals_lock_after_payout
on public.partner_referrals;

create trigger partner_referrals_lock_after_payout
before update on public.partner_referrals
for each row
execute function public.partner_lock_payout_referral();

-- T8: Partner Pro qualification date and entitlement extension
alter table public.partner_creators
  add column if not exists qualified_at timestamptz;

create or replace function public.partner_sync_qualification()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  rules public.partner_settings%rowtype;
  confirmed_count integer;
  existing_qualified_at timestamptz;
  qualification_time timestamptz;
  target_until date;
begin
  if new.payment_type <> 'first_payment' or new.status <> 'approved' then
    return new;
  end if;

  select *
  into rules
  from public.partner_settings
  where id = 1;

  if not found then
    return new;
  end if;

  select count(distinct customer_token)
  into confirmed_count
  from public.partner_referrals
  where creator_id = new.creator_id
    and payment_type = 'first_payment'
    and status = 'approved';

  if confirmed_count < rules.minimum_confirmed_paid_users then
    return new;
  end if;

  select qualified_at
  into existing_qualified_at
  from public.partner_creators
  where id = new.creator_id
  for update;

  if not found then
    return new;
  end if;

  qualification_time = coalesce(existing_qualified_at, now());
  target_until =
    (qualification_time::date + make_interval(months => rules.qualified_pro_months))::date;

  update public.partner_creators
  set
    qualified_at = coalesce(qualified_at, qualification_time),
    pro_access_until = greatest(
      coalesce(pro_access_until, target_until),
      target_until
    )
  where id = new.creator_id;

  return new;
end;
$$;

drop trigger if exists partner_referrals_sync_qualification
on public.partner_referrals;

create trigger partner_referrals_sync_qualification
after insert or update of status on public.partner_referrals
for each row
execute function public.partner_sync_qualification();

