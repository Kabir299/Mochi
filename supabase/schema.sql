-- Live buddy sync. Paste all of this into Supabase -> SQL Editor -> Run. Safe to run again.
--
-- There are no accounts. Each phone holds a long random secret and the database keeps only its
-- hash. Progress arrives already encrypted, with a key the server never receives, so this
-- database can't read anyone's habits. The app can only call the functions below: the tables
-- themselves are closed to it.

create table if not exists public.buddy_members (
  id uuid primary key default gen_random_uuid(),
  secret_hash bytea not null unique,
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
create index if not exists buddy_members_created on public.buddy_members (created_at);
create index if not exists buddy_members_seen on public.buddy_members (last_seen);

-- One row per friendship. Until someone joins it is an invite, with an expiry.
create table if not exists public.buddy_links (
  id text primary key check (id ~ '^[0-9a-f]{64}$'),
  inviter uuid not null references public.buddy_members (id) on delete cascade,
  joiner uuid references public.buddy_members (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  check (inviter <> joiner)
);
create index if not exists buddy_links_inviter on public.buddy_links (inviter);
create index if not exists buddy_links_joiner on public.buddy_links (joiner);
create index if not exists buddy_links_expiry on public.buddy_links (expires_at);

-- Only the latest update from each person on each link is kept.
create table if not exists public.buddy_updates (
  link_id text not null references public.buddy_links (id) on delete cascade,
  sender uuid not null references public.buddy_members (id) on delete cascade,
  payload text not null check (length(payload) <= 64000),
  updated_at timestamptz not null default now(),
  primary key (link_id, sender)
);
create index if not exists buddy_updates_sender on public.buddy_updates (sender);

alter table public.buddy_members enable row level security;
alter table public.buddy_links enable row level security;
alter table public.buddy_updates enable row level security;
revoke all on public.buddy_members, public.buddy_links, public.buddy_updates
  from public, anon, authenticated;

-- Finds the phone behind a secret, optionally creating it. Internal: the app can't call this.
create or replace function public.buddy_member(p_secret text, p_create boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash bytea;
  v_id uuid;
begin
  if p_secret is null or p_secret !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'bad_secret';
  end if;
  v_hash := sha256(convert_to(p_secret, 'UTF8'));

  select id into v_id from public.buddy_members where secret_hash = v_hash;
  if v_id is not null then
    update public.buddy_members set last_seen = now()
      where id = v_id and last_seen < now() - interval '1 day';
    return v_id;
  end if;
  if not p_create then
    raise exception 'unknown_member';
  end if;

  -- The key that reaches this function ships inside the app, so limit how fast rows can be made.
  if (select count(*) from public.buddy_members
      where created_at > now() - interval '1 minute') >= 60 then
    raise exception 'busy';
  end if;
  insert into public.buddy_members (secret_hash) values (v_hash)
    on conflict (secret_hash) do update set last_seen = now()
    returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.buddy_link_count(p_member uuid)
returns bigint
language sql
security definer
set search_path = ''
as $$
  select count(*) from public.buddy_links where inviter = p_member or joiner = p_member;
$$;

create or replace function public.create_buddy_invite(p_secret text, p_link text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.buddy_member(p_secret, true);
begin
  -- Tidy up whenever someone invites: dead invites, and phones unused for 6 months.
  delete from public.buddy_links where expires_at < now();
  delete from public.buddy_members where last_seen < now() - interval '180 days';

  if public.buddy_link_count(v_me) >= 50 then
    raise exception 'too_many';
  end if;
  insert into public.buddy_links (id, inviter, expires_at)
    values (p_link, v_me, now() + interval '7 days');
end;
$$;

-- Safe to retry: joining a link you already joined just succeeds.
create or replace function public.accept_buddy_invite(p_secret text, p_link text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.buddy_member(p_secret, true);
  v_link public.buddy_links%rowtype;
begin
  select * into v_link from public.buddy_links where id = p_link for update;
  if not found then
    raise exception 'invite_invalid';
  end if;
  if v_link.inviter = v_me then
    raise exception 'own_invite';
  end if;
  if v_link.joiner = v_me then
    return;
  end if;
  if v_link.joiner is not null or v_link.expires_at < now() then
    raise exception 'invite_invalid';
  end if;
  if public.buddy_link_count(v_me) >= 50 then
    raise exception 'too_many';
  end if;
  update public.buddy_links set joiner = v_me, expires_at = null where id = p_link;
end;
$$;

create or replace function public.push_buddy_update(p_secret text, p_link text, p_payload text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.buddy_member(p_secret, false);
begin
  if not exists (
    select 1 from public.buddy_links
    where id = p_link and joiner is not null and (inviter = v_me or joiner = v_me)
  ) then
    raise exception 'link_gone';
  end if;
  if exists (
    select 1 from public.buddy_updates
    where link_id = p_link and sender = v_me and updated_at > now() - interval '2 seconds'
  ) then
    raise exception 'slow_down';
  end if;
  insert into public.buddy_updates (link_id, sender, payload)
    values (p_link, v_me, p_payload)
    on conflict (link_id, sender)
    do update set payload = excluded.payload, updated_at = now();
end;
$$;

-- Every link this phone is on, with the other person's latest update.
create or replace function public.pull_buddy_updates(p_secret text)
returns table (link_id text, joined boolean, payload text, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.buddy_member(p_secret, false);
begin
  return query
    select l.id, l.joiner is not null, u.payload, u.updated_at
    from public.buddy_links l
    left join public.buddy_updates u on u.link_id = l.id and u.sender <> v_me
    where (l.inviter = v_me or l.joiner = v_me)
      and (l.expires_at is null or l.expires_at >= now());
end;
$$;

-- Ends a friendship for both people at once, along with both people's stored updates.
create or replace function public.remove_buddy_link(p_secret text, p_link text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.buddy_member(p_secret, false);
begin
  delete from public.buddy_links where id = p_link and (inviter = v_me or joiner = v_me);
end;
$$;

-- "Delete all data": removes this phone and everything linked to it.
create or replace function public.delete_buddy_member(p_secret text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_secret is null or p_secret !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'bad_secret';
  end if;
  delete from public.buddy_members where secret_hash = sha256(convert_to(p_secret, 'UTF8'));
end;
$$;

revoke all on function public.buddy_member(text, boolean) from public, anon, authenticated;
revoke all on function public.buddy_link_count(uuid) from public, anon, authenticated;

revoke all on function public.create_buddy_invite(text, text) from public, authenticated;
revoke all on function public.accept_buddy_invite(text, text) from public, authenticated;
revoke all on function public.push_buddy_update(text, text, text) from public, authenticated;
revoke all on function public.pull_buddy_updates(text) from public, authenticated;
revoke all on function public.remove_buddy_link(text, text) from public, authenticated;
revoke all on function public.delete_buddy_member(text) from public, authenticated;

grant execute on function public.create_buddy_invite(text, text) to anon;
grant execute on function public.accept_buddy_invite(text, text) to anon;
grant execute on function public.push_buddy_update(text, text, text) to anon;
grant execute on function public.pull_buddy_updates(text) to anon;
grant execute on function public.remove_buddy_link(text, text) to anon;
grant execute on function public.delete_buddy_member(text) to anon;
