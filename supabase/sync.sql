-- Mochi account sync: one private copy of a signed-in person's data, so it follows them to
-- every device. Run this once in the Supabase SQL Editor (after schema.sql). Safe to re-run.
--
-- Nobody can read the table directly. A signed-in person reaches only their own row, through the
-- functions below, which use the account they signed in with (auth.uid()).

create table if not exists public.user_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data text not null check (length(data) <= 5000000),
  -- Goes up by one on every save, so a device can tell whether it has the newest copy.
  version bigint not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.user_data enable row level security;
revoke all on public.user_data from anon, authenticated;

-- The newest copy. The data is left out when the device already has that version.
create or replace function public.sync_pull(p_have bigint)
returns table (version bigint, data text, updated_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select d.version, case when d.version = p_have then null else d.data end, d.updated_at
  from public.user_data d
  where d.user_id = (select auth.uid());
$$;

-- Saves a new copy made from version p_base. Refused as 'stale' when another device saved in
-- between, so one device can't silently overwrite another's changes. p_force saves anyway.
create or replace function public.sync_push(p_data text, p_base bigint, p_force boolean default false)
returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  current_version bigint;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if length(p_data) > 5000000 then raise exception 'too_big'; end if;

  select d.version into current_version from public.user_data d where d.user_id = uid for update;
  if current_version is null then
    insert into public.user_data (user_id, data) values (uid, p_data)
    on conflict (user_id) do nothing;
    if not found then raise exception 'stale'; end if;
    return 1;
  end if;
  if current_version <> p_base and not p_force then raise exception 'stale'; end if;

  update public.user_data
  set data = p_data, version = current_version + 1, updated_at = now()
  where user_id = uid;
  return current_version + 1;
end;
$$;

-- Deletes the account and its synced copy for good. Data on the person's devices stays there.
create or replace function public.delete_account()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  delete from public.user_data where user_id = uid;
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.sync_pull(bigint) from public, anon;
revoke all on function public.sync_push(text, bigint, boolean) from public, anon;
revoke all on function public.delete_account() from public, anon;
grant execute on function public.sync_pull(bigint) to authenticated;
grant execute on function public.sync_push(text, bigint, boolean) to authenticated;
grant execute on function public.delete_account() to authenticated;
