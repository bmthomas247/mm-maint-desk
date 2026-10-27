-- Moose Locks  |  locks_schema.sql
-- Our own lock system, in the "Moose Management - Maintenance" Supabase project (same sign-in, same roles).
-- Safe to re-run. Nothing is deleted: history tables are append-only, removed things are active = false.
--
-- How it fits together
--   lock_homes      which homes are in the test, and which section (ours / lynx / brivo) for the scorecard
--   lock_hubs       one Home Assistant Green per home. Hubs only talk to the lock-hub Edge Function with their own secret.
--   locks           the Z-Wave locks each hub reports
--   lock_stays      Track reservations for our homes (locks_sync.py on the ThinkStation fills this every 15 min)
--   lock_staff_codes crew / vendor codes
--   lock_assign     which code sits in which slot of which lock (wanted -> hub writes it -> reads it back -> verified)
--   lock_commands   unlock / lock / add lock / remove lock / wipe old codes / test code, picked up by the hub
--   lock_events     everything that happened at the door (append-only)
--   lock_alerts     hub offline, lock offline, low battery, code not ready, jammed (open/close by themselves)

create extension if not exists pgcrypto;
create extension if not exists pg_net;
create extension if not exists pg_cron;

-- ---------------------------------------------------------------- tables
create table if not exists lock_homes (
  property_id    text primary key references properties(id),
  section        text not null default 'ours' check (section in ('ours','lynx','brivo')),
  enabled        boolean not null default true,          -- ours only: hub manages codes
  lead_hours     int not null default 12,                -- (locks without schedules) code goes on this long before check-in
  preload_days   int not null default 3,                 -- (locks with schedules) code + its time window go on this many days early
  grace_minutes  int not null default 60,                -- and comes off this long after check-out
  wipe_foreign   boolean not null default true,          -- clear codes we didn't put there (in our slot ranges)
  -- thermostats: warm the home up before guests arrive, set it back after they leave
  warm_to        int not null default 68,                -- heat setpoint for arrival (F)
  warm_hours     int not null default 3,                 -- start warming this long before check-in
  vacant_heat    int not null default 60,                -- heat setpoint once empty (keeps pipes safe)
  vacant_cool    int default 78,                         -- AC setpoint once empty (thermostats already on cool)
  cool_to        int,                                    -- summer: cool setpoint for arrival (null = leave cooling alone)
  -- governors: guests can change the thermostat, but only inside these limits (the hub snaps it back at once)
  heat_max       int default 72,                         -- heat can't be set above this
  heat_min       int default 55,                         -- or below this (pipes)
  cool_min       int default 68,                         -- AC can't be set below this
  too_cold       int not null default 50,                -- alert below this
  too_hot        int not null default 88,                -- alert above this
  -- Brivo-style rules
  after_hours_from time not null default '21:00',        -- crew/vendor/backup code used between these hours -> "After hours use"
  after_hours_to   time not null default '07:00',
  auto_lock_min  int default 15,                         -- "Unoccupied lock": empty home + door unlocked this long -> lock it (null = off)
  notes          text,
  guide_url      text,                                   -- TouchStay guide for this home (shown on the guest page)
  arrival_note   text,                                   -- guest-facing "getting in" note (parking, which entrance, front desk)
  extra_codes    jsonb not null default '[]',            -- other public codes from Track (hot tub, side garage...): [{name, code}]
  track_unit_id  bigint,                                 -- Track unit id (locks_sync fills it)
  install        jsonb not null default '{}',             -- install checklist: {step: {by, at}}
  installed_at   timestamptz,
  noise_limit    int not null default 80,                 -- dB: alert when louder than this ...
  noise_minutes  int not null default 10,                 -- ... for this many minutes during quiet hours (3x as long during the day)
  quiet_from     time not null default '22:00',
  quiet_to       time not null default '08:00',
  added_by       text not null default actor(),
  created_at     timestamptz not null default now()
);

-- Parent / child homes. Two kinds, same table:
--   combo:  parent is a combo listing (ST 14 = ST 1 + ST 4, UM 3013 = UM 301 + UM 303, BHV 5482AB = 5482A + B).
--           A parent booking gets its code on every child's doors.
--   shared: parent holds a shared door (building entry, "Access to ALL locks"). Child guests get their code on the
--           parent's doors that are marked shared.
create table if not exists lock_home_links (
  parent_id   text not null references properties(id),
  child_id    text not null references properties(id),
  active      boolean not null default true,
  added_by    text not null default actor(),
  created_at  timestamptz not null default now(),
  primary key (parent_id, child_id),
  check (parent_id <> child_id)
);

-- system settings (deploy_locks.py writes hub_version / hub_zip_url so hubs update themselves)
create table if not exists lock_settings (key text primary key, value text, updated_at timestamptz not null default now());
alter table lock_settings enable row level security;
drop policy if exists lock_settings_read on lock_settings;
create policy lock_settings_read on lock_settings for select to authenticated using (app_role() in ('admin','tech'));

create or replace view lock_links_on with (security_invoker = true) as select parent_id, child_id from lock_home_links where active;

create table if not exists lock_hubs (
  id            uuid primary key default gen_random_uuid(),
  property_id   text references properties(id),
  name          text,
  token_hash    text unique not null,                     -- sha256 of the hub's own secret (the secret never leaves the hub)
  fingerprint   text,                                     -- Z-Wave home id of the stick
  pair_code     text,                                     -- 6 digits, for claiming when "find hub" can't see it
  public_ip     text,
  version       text,
  last_seen     timestamptz,
  status        jsonb not null default '{}',
  claimed_at    timestamptz,
  claimed_by    text,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);
create unique index if not exists lock_hubs_pair on lock_hubs (pair_code) where claimed_at is null and active;

create table if not exists locks (
  id            uuid primary key default gen_random_uuid(),
  hub_id        uuid not null references lock_hubs(id),
  property_id   text references properties(id),
  node_id       int not null,
  name          text not null default 'New lock',
  model         text,
  battery       int,
  online        boolean,
  state         text,                                     -- locked / unlocked / jammed / unknown
  unlocked_since timestamptz,
  slots         int,                                      -- how many user codes the lock can hold (hub reports it)
  slots_used    int,                                      -- how many codes are on the lock right now (ours + any left from Brivo)
  last_seen     timestamptz,
  for_guests    boolean not null default true,            -- false = garage/side door that only crew codes go on
  shared        boolean not null default false,
  schedules_ok  boolean not null default true,            -- lock keeps its own time windows (set false if it refuses them)           -- true = shared door: guests of every child home get their code on it
  master_code   text,                                     -- the lock's Yale master PIN (admin + tech only), for pairing / resets
  installed_on  date,                                     -- when this lock went on the door (for replacement planning)
  replace_years int not null default 7,                   -- plan to replace after this many years (change per lock)
  last_battery_change timestamptz,                        -- spotted automatically when the battery jumps up
  rssi          int,                                      -- Z-Wave signal at the hub (dBm, closer to 0 = stronger)
  rtt           int,                                      -- round trip (ms)
  dropped       int,                                      -- dropped messages since the hub started
  battery_days  int,                                      -- learned: how long a set of batteries lasts in this lock
  staff_from    int not null default 2,
  staff_to      int not null default 120,
  guest_from    int not null default 121,
  guest_to      int not null default 150,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (hub_id, node_id)
);

create table if not exists thermostats (
  id            uuid primary key default gen_random_uuid(),
  hub_id        uuid not null references lock_hubs(id),
  property_id   text references properties(id),
  node_id       int not null,
  name          text not null default 'Thermostat',
  model         text,
  temp          numeric,                                  -- current temperature (F)
  mode          text,                                     -- off / heat / cool / auto
  heat_sp       numeric,
  cool_sp       numeric,
  online        boolean,
  battery       int,
  last_seen     timestamptz,
  applied       text,                                     -- last automatic step done, e.g. 'warm:<res>' / 'vacant:<res>'
  rssi          int,
  rtt           int,
  dropped       int,
  installed_on  date,
  replace_years int not null default 10,
  managed       boolean not null default true,            -- false = leave this one alone
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (hub_id, node_id)
);

-- leak sensors and door/window sensors on the same hub
create table if not exists sensors (
  id            uuid primary key default gen_random_uuid(),
  hub_id        uuid not null references lock_hubs(id),
  property_id   text references properties(id),
  node_id       int not null,
  name          text not null default 'Sensor',
  kind          text not null default 'other',            -- leak / contact / other
  rssi          int,
  state         text,                                     -- wet / dry / open / closed
  battery       int,
  online        boolean,
  last_seen     timestamptz,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  entity        text,                                     -- Home Assistant entity for Wi-Fi sensors (noise)
  value         numeric,                                  -- noise: sound level (dB)
  over_since    timestamptz,                              -- noise: loud since
  unique (hub_id, node_id)
);

-- TVs the hub can see (Roku, Google TV / Android TV, Fire TV, Samsung, LG - whatever Home Assistant finds on the Wi-Fi)
create table if not exists lock_tvs (
  id            uuid primary key default gen_random_uuid(),
  hub_id        uuid not null references lock_hubs(id),
  property_id   text references properties(id),
  entity        text not null,
  name          text not null default 'TV',
  platform      text,
  state         text,                                     -- on / off / playing / idle / unavailable
  app           text,
  volume        numeric,
  muted         boolean,
  last_seen     timestamptz,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (hub_id, entity)
);

-- Brivo has ~60 company-wide crew/vendor codes, so crew slots run 2-120 and guests 121-150 (Yale Assure holds 250)
alter table locks alter column staff_to set default 120;
alter table locks alter column guest_from set default 121;
alter table locks alter column guest_to set default 150;

create table if not exists lock_stays (
  res_id        text primary key,                         -- Track reservation id
  property_id   text not null references properties(id),
  unit          text,
  guest         text,
  kind          text not null default 'guest' check (kind in ('guest','owner','lease')),
  status        text not null default 'confirmed',       -- confirmed / checked_in / checked_out / cancelled
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  phone_last4   text,
  agreement     text,                                     -- Track agreementStatus: received / not-needed / sent / viewed / not-sent
  code          text not null,
  code_source   text not null default 'phone',            -- phone / random / manual
  portal_token  text unique not null default encode(gen_random_bytes(18),'hex'),
  out_at        timestamptz,                              -- guest has left (door locked from outside on check-out day, Track checked out, or check-out time)
  out_how       text,
  updated_at    timestamptz not null default now(),
  created_at    timestamptz not null default now()
);
create index if not exists lock_stays_prop on lock_stays (property_id, ends_at);

-- Employee, vendor and backup codes (brought over from Brivo with the same numbers).
-- (kinds: employee / vendor / backup / owner / hoa / county)
-- Time rules: optional start/end dates, plus optional days of the week and hours (Mountain time).
-- The lock itself has no clock rules, so the hub puts the code on at the start of each window and takes it off at the end.
create table if not exists lock_staff_codes (
  id            bigint generated always as identity primary key,
  property_ids  text[],                                   -- homes picked (null + areas null = every home in our section)
  areas         text[],                                   -- neighborhoods picked (Track area codes: RJ, BHV...); adds every home there
  kind          text not null default 'employee' check (kind in ('employee','vendor','backup','owner','hoa','county','housekeeping')),
  label         text not null,                            -- "Shelby Huffaker", "A+ Carpet", "Spare - November"
  code          text not null check (code ~ '^[0-9]{4,8}$'),
  starts_at     timestamptz,
  ends_at       timestamptz,
  days          int[],                                    -- 0 = Sunday ... 6 = Saturday; null = every day
  time_from     time,                                     -- null = all day
  time_to       time,
  brivo_ref     text unique,                              -- Brivo user this came from
  person        text,                                     -- first + last name ("Shelby Huffaker")
  company       text,                                     -- vendor company ("ABC Hot Tubs")
  role          text,                                     -- trade / job ("Hot tubs", "Maintenance", "Owner")
  active        boolean not null default true,
  added_by      text not null default actor(),
  created_at    timestamptz not null default now()
);

create table if not exists lock_assign (
  id            bigint generated always as identity primary key,
  lock_id       uuid not null references locks(id),
  slot          int not null,
  ref_kind      text not null check (ref_kind in ('stay','staff','test','foreign')),
  ref_id        text not null,
  label         text,
  code          text,
  sched         jsonb,                                    -- time window the lock itself enforces (null = any time)
  wanted        boolean not null default true,
  state         text not null default 'pending' check (state in ('pending','verified','failed','clearing','cleared')),
  tries         int not null default 0,
  err           text,
  created_at    timestamptz not null default now(),
  set_at        timestamptz,
  verified_at   timestamptz,
  cleared_at    timestamptz,
  updated_at    timestamptz not null default now()
);
create unique index if not exists lock_assign_live_slot on lock_assign (lock_id, slot) where state <> 'cleared';
create index if not exists lock_assign_ref on lock_assign (ref_kind, ref_id);

create table if not exists lock_commands (
  id            bigint generated always as identity primary key,
  hub_id        uuid not null references lock_hubs(id),
  lock_id       uuid references locks(id),
  thermostat_id uuid,
  kind          text not null,             -- unlock lock include exclude stop wipe refresh audit climate
  args          jsonb not null default '{}',
  source        text not null default 'admin',            -- admin / guest / system
  created_by    text not null default actor(),
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default now() + interval '2 minutes',
  picked_at     timestamptz,
  done_at       timestamptz,
  ok            boolean,
  result        jsonb
);
create index if not exists lock_commands_open on lock_commands (hub_id) where picked_at is null;

create table if not exists lock_events (
  id            bigint generated always as identity primary key,
  at            timestamptz not null default now(),
  property_id   text,
  hub_id        uuid,
  lock_id       uuid,
  kind          text not null,           -- unlock_code / unlock_phone / unlock_manual / unlock_remote / lock / jammed / code_set / code_failed / code_cleared / hub_online ...
  slot          int,
  who_kind      text,                    -- stay / staff / test / foreign
  who_id        text,
  who           text,
  detail        jsonb not null default '{}'
);
create index if not exists lock_events_prop on lock_events (property_id, at desc);

-- GPS for every unit (from Track), so an installer standing at a home can pick it by location
create table if not exists lock_places (
  property_id text primary key references properties(id),
  lat         double precision not null,
  lng         double precision not null,
  address     text,
  updated_at  timestamptz not null default now()
);
alter table lock_places enable row level security;
drop policy if exists lock_places_read on lock_places;
create policy lock_places_read on lock_places for select to authenticated using (app_role() in ('admin','tech'));

-- Brivo's master code report, waiting for each lock to be paired and named (then copied onto locks.master_code)
create table if not exists lock_master_staging (unit text, door text, master_code text, at timestamptz default now(), primary key (unit, door));
alter table lock_master_staging enable row level security;   -- service role only

-- every home whose bookings can reach a door of p: p itself and its parents (combo booking)
create or replace function lock_home_up(p text) returns setof text language sql stable as $$
  select p union select parent_id from lock_links_on where child_id = p
$$;
-- homes whose codes can sit on the same doors as p (for "is this code already taken?")
create or replace function lock_home_family(p text) returns setof text language sql stable as $$
  select p
  union select parent_id from lock_links_on where child_id = p
  union select child_id from lock_links_on where parent_id = p
  union select l2.child_id from lock_links_on l1 join lock_links_on l2 on l2.parent_id = l1.parent_id where l1.child_id = p
$$;

create table if not exists lock_alerts (
  id            bigint generated always as identity primary key,
  kind          text not null,           -- hub_offline / lock_offline / battery_low / code_not_ready / jammed / slots_full
  property_id   text,
  hub_id        uuid,
  lock_id       uuid,
  ref           text not null default '',
  opened_at     timestamptz not null default now(),
  closed_at     timestamptz,
  detail        text,
  bw_task       text                     -- Breezeway task link once locks_sync.py makes one
);
create unique index if not exists lock_alerts_open on lock_alerts (kind, coalesce(hub_id::text,''), coalesce(lock_id::text,''), ref) where closed_at is null;

-- Updates the hubs can take: Home Assistant (core / OS / supervisor), add-ons (Z-Wave JS), the Z-Wave stick, and lock /
-- thermostat firmware. One row per hub + update + version. Home Assistant parts install themselves in a quiet window
-- (2-5 am, nobody arriving), test hub first; firmware waits for an admin to press "Update now".
create table if not exists lock_updates (
  id            bigint generated always as identity primary key,
  hub_id        uuid not null references lock_hubs(id),
  entity        text not null,                            -- Home Assistant update entity (update.home_assistant_core_update ...)
  kind          text not null,                            -- core / os / supervisor / addon / stick / device / other
  title         text,
  node_id       int,                                      -- for device firmware
  from_ver      text,
  to_ver        text not null,
  first_seen    timestamptz not null default now(),
  started_at    timestamptz,
  started_by    text,                                     -- auto / name of the admin
  done_at       timestamptz,
  ok            boolean,
  err           text,
  unique (hub_id, entity, to_ver)
);

-- no deletes anywhere; history tables are append-only
do $$ declare t text; begin
  foreach t in array array['lock_homes','lock_home_links','lock_hubs','locks','thermostats','sensors','lock_stays','lock_staff_codes','lock_assign','lock_commands','lock_events','lock_alerts','lock_updates'] loop
    execute format('drop trigger if exists %1$s_nodelete on %1$s', t);
    execute format('create trigger %1$s_nodelete before delete on %1$s for each row execute function forbid_delete()', t);
  end loop;
end $$;
drop trigger if exists lock_events_noupdate on lock_events;
create trigger lock_events_noupdate before update on lock_events for each row execute function forbid_change();

-- ---------------------------------------------------------------- RLS
-- Admin + tech see everything about locks (they already see door codes). Viewers see nothing here.
-- Writes go through the functions below, not straight into the tables.
do $$ declare t text; begin
  foreach t in array array['lock_homes','lock_home_links','lock_hubs','locks','thermostats','sensors','lock_stays','lock_staff_codes','lock_assign','lock_commands','lock_events','lock_alerts','lock_updates','lock_tvs'] loop
    execute format('alter table %1$s enable row level security', t);
    execute format('drop policy if exists %1$s_crew_read on %1$s', t);
    execute format('create policy %1$s_crew_read on %1$s for select to authenticated using (app_role() in (''admin'',''tech''))', t);
  end loop;
end $$;
-- the hub secret hash is never readable from the browser
revoke select on lock_hubs from anon, authenticated;
grant select (id, property_id, name, fingerprint, pair_code, public_ip, version, last_seen, status, claimed_at, claimed_by, active, created_at)
  on lock_hubs to authenticated;

-- ---------------------------------------------------------------- helpers
create or replace function lock_is_crew() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(app_role() in ('admin','tech'), false)
$$;

create or replace function lock_caller_ip() returns text language sql stable as $$
  select nullif(trim(coalesce(
    (current_setting('request.headers', true)::json)->>'cf-connecting-ip',
    (current_setting('request.headers', true)::json)->>'x-real-ip',
    split_part((current_setting('request.headers', true)::json)->>'x-forwarded-for', ',', 1))), '')
$$;

-- A guest's code is only made live (lock, guest page, Track) once the rental agreement is back.
-- Owner and lease stays don't need one. Track says 'received' (signed) or 'not-needed'.
create or replace function lock_stay_cleared(st lock_stays) returns boolean language sql immutable as $$
  select st.kind in ('owner','lease') or coalesce(st.agreement, '') in ('received','not-needed')
$$;

-- Is a crew / vendor / backup code allowed in right now? (dates, days of week, hours - Mountain time)
create or replace function lock_staff_window_open(c lock_staff_codes) returns boolean
language plpgsql stable as $$
declare t timestamp := now() at time zone 'America/Denver';
begin
  if c.starts_at is not null and now() < c.starts_at then return false; end if;
  if c.ends_at is not null and now() >= c.ends_at then return false; end if;
  if c.days is not null and array_length(c.days, 1) > 0 and not (extract(dow from t)::int = any(c.days)) then return false; end if;
  if c.time_from is not null and c.time_to is not null then
    if c.time_from <= c.time_to then
      return t::time >= c.time_from and t::time < c.time_to;
    else                                   -- overnight window, e.g. 22:00 - 06:00
      return t::time >= c.time_from or t::time < c.time_to;
    end if;
  end if;
  return true;
end $$;

-- A code is "taken" at a home if another stay overlapping (with an hour either side) or an active crew code uses it.
-- which homes a crew/vendor/owner code reaches: picked homes + every home in the picked neighborhoods; nothing picked = all
create or replace function lock_code_covers(p_props text[], p_areas text[], p_prop text) returns boolean
language sql stable security definer set search_path = public as $$
  select (p_props is null and p_areas is null) or p_prop = any(coalesce(p_props, '{}'))
      or (select area from properties where id = p_prop) = any(coalesce(p_areas, '{}'))
$$;
create or replace function lock_code_homes(p_props text[], p_areas text[]) returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(id), '{}') from properties where lock_code_covers(p_props, p_areas, id)
$$;

create or replace function lock_code_taken(p_prop text, p_code text, p_from timestamptz, p_to timestamptz, p_res text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from lock_stays s
                 where s.property_id in (select lock_home_family(p_prop)) and s.code = p_code and s.res_id is distinct from p_res
                   and s.status not in ('cancelled')
                   and s.starts_at < p_to + interval '4 days' and s.ends_at > p_from - interval '4 days')   -- codes sit on the lock up to 3 days early
      or exists (select 1 from lock_staff_codes c
                 where c.active and c.code = p_code and exists (select 1 from lock_home_family(p_prop) f(pid) where lock_code_covers(c.property_ids, c.areas, f.pid)))
$$;

create or replace function lock_code_pick(p_prop text, p_last4 text, p_from timestamptz, p_to timestamptz, p_res text, out code text, out src text)
language plpgsql security definer set search_path = public as $$
declare i int := 0;
begin
  if p_last4 ~ '^[0-9]{4}$' and p_last4 not in ('0000','1111','1234','9999')
     and not lock_code_taken(p_prop, p_last4, p_from, p_to, p_res) then
    code := p_last4; src := 'phone'; return;
  end if;
  loop
    code := lpad((floor(random() * 9000) + 1000)::int::text, 4, '0'); i := i + 1;
    exit when code !~ '^(\d)\1{3}$' and code not in ('1234','4321') and not lock_code_taken(p_prop, code, p_from, p_to, p_res);
    if i > 200 then raise exception 'no free code'; end if;
  end loop;
  src := 'random';
end $$;

-- who was in a slot at a moment
create or replace function lock_who(p_lock uuid, p_slot int, p_at timestamptz, out who_kind text, out who_id text, out who text)
language sql stable security definer set search_path = public as $$
  select a.ref_kind, a.ref_id, coalesce(a.label, a.ref_id) from lock_assign a
  where a.lock_id = p_lock and a.slot = p_slot and a.created_at <= p_at + interval '1 minute'
    and (a.cleared_at is null or a.cleared_at >= p_at)
  order by a.created_at desc limit 1
$$;

-- ---------------------------------------------------------------- Track -> stays (service role only)
-- rows: [{res_id, unit, guest, kind, status, starts_at, ends_at, phone_last4}]
create or replace function lock_upsert_stays(rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb; prop text; cur lock_stays; pick record; n_new int := 0; n_upd int := 0; n_skip int := 0;
begin
  for r in select * from jsonb_array_elements(rows) loop
    select p.id into prop from properties p
     where (p.code = r->>'unit' or p.code = regexp_replace(r->>'unit', '^(2H-|L-)', ''))
       and (exists (select 1 from lock_homes h where h.property_id = p.id and h.section = 'ours')
            or exists (select 1 from lock_links_on k join lock_homes h on h.property_id = k.child_id and h.section = 'ours'
                        where k.parent_id = p.id))
     limit 1;
    if prop is null then n_skip := n_skip + 1; continue; end if;
    select * into cur from lock_stays where res_id = r->>'res_id';
    if not found then
      select * into pick from lock_code_pick(prop, r->>'phone_last4', (r->>'starts_at')::timestamptz, (r->>'ends_at')::timestamptz, r->>'res_id');
      insert into lock_stays (res_id, property_id, unit, guest, kind, status, starts_at, ends_at, phone_last4, agreement, code, code_source)
      values (r->>'res_id', prop, r->>'unit', r->>'guest', coalesce(r->>'kind','guest'), coalesce(r->>'status','confirmed'),
              (r->>'starts_at')::timestamptz, (r->>'ends_at')::timestamptz, r->>'phone_last4', r->>'agreement', pick.code, pick.src);
      n_new := n_new + 1;
    else
      -- the code never changes once made (the guest may already have it)
      update lock_stays set property_id = prop, unit = r->>'unit', guest = r->>'guest', kind = coalesce(r->>'kind', kind),
             status = coalesce(r->>'status', status), starts_at = (r->>'starts_at')::timestamptz, ends_at = (r->>'ends_at')::timestamptz,
             phone_last4 = r->>'phone_last4', agreement = coalesce(r->>'agreement', agreement), updated_at = now()
       where res_id = cur.res_id
         and (status, starts_at, ends_at, guest, property_id, agreement) is distinct from
             (coalesce(r->>'status', status), (r->>'starts_at')::timestamptz, (r->>'ends_at')::timestamptz, r->>'guest', prop,
              coalesce(r->>'agreement', agreement));
      if found then n_upd := n_upd + 1; end if;
    end if;
  end loop;
  perform lock_plan();
  return jsonb_build_object('new', n_new, 'updated', n_upd, 'not_ours', n_skip);
end $$;
revoke all on function lock_upsert_stays(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------- the plan: what should be on every lock right now
-- Locks that keep their own schedule (Yale Assure Z-Wave: Schedule Entry Lock): codes are loaded days early
-- (preload_days) with a time window the LOCK enforces, so a late hub or internet outage never leaves a guest
-- without a working code. Locks that can't take schedules fall back to adding the code lead_hours before check-in.
-- Either way the code is also taken off after check-out.
create or replace function lock_local(t timestamptz) returns text language sql immutable as $$
  select to_char(t at time zone 'America/Denver', 'YYYY-MM-DD"T"HH24:MI')
$$;
create or replace function lock_staff_sched(c lock_staff_codes, p_ends timestamptz) returns jsonb language sql stable as $$
  select case
    when c.time_from is not null and c.time_to is not null then
      jsonb_build_object('type', 'daily',
        'weekdays', to_jsonb(coalesce(c.days, array[0,1,2,3,4,5,6])),
        'start', to_char(c.time_from, 'HH24:MI'),
        'minutes', (extract(epoch from (case when c.time_to > c.time_from then c.time_to - c.time_from
                                              else c.time_to - c.time_from + interval '24 hours' end)) / 60)::int)
    when c.days is not null and array_length(c.days, 1) > 0 then
      jsonb_build_object('type', 'daily', 'weekdays', to_jsonb(c.days), 'start', '00:00', 'minutes', 1439)
    when c.starts_at is not null or c.ends_at is not null then
      jsonb_build_object('type', 'year', 'start', lock_local(coalesce(c.starts_at, now())),
                                        'stop', lock_local(coalesce(c.ends_at, now() + interval '10 years')))
  end
$$;

create or replace function lock_plan() returns int
language plpgsql security definer set search_path = public as $$
declare l record; d record; s int; n int := 0;
begin
  for l in select k.*, h.lead_hours, h.grace_minutes, h.preload_days from locks k
           join lock_hubs b on b.id = k.hub_id and b.active and b.claimed_at is not null
           join lock_homes h on h.property_id = k.property_id and h.section = 'ours' and h.enabled
           where k.active loop
    -- 1) what should be there
    create temp table if not exists _want (ref_kind text, ref_id text, label text, code text, staff boolean, sched jsonb) on commit drop;
    truncate _want;
    if l.for_guests then
      insert into _want select 'stay', st.res_id, coalesce(st.guest, 'Guest') || ' (' || st.kind || ')', st.code, false,
             case when l.schedules_ok then jsonb_build_object('type', 'year', 'start', lock_local(st.starts_at - interval '1 hour'),
                                                              'stop', lock_local(st.ends_at + make_interval(mins => l.grace_minutes))) end
        from lock_stays st
       where (st.property_id in (select lock_home_up(l.property_id))
              or (l.shared and st.property_id in (select child_id from lock_links_on where parent_id = l.property_id)))
         and st.status not in ('cancelled','checked_out')
         and lock_stay_cleared(st)
         and now() >= st.starts_at - case when l.schedules_ok then make_interval(days => l.preload_days)
                                          else make_interval(hours => l.lead_hours) end
         and now() <  st.ends_at + make_interval(mins => l.grace_minutes);
    end if;
    -- crew / vendor / backup: with a schedule-capable lock the code stays on and the lock enforces days/hours;
    -- otherwise the code is added when its window opens and removed when it closes
    insert into _want select 'staff', c.id::text,
           case c.kind when 'hoa' then 'HOA' when 'county' then 'County' when 'housekeeping' then 'Housekeeping' else initcap(c.kind) end || ': ' || coalesce(c.person, c.company, c.label), c.code, true,
           case when l.schedules_ok then lock_staff_sched(c, c.ends_at) end
      from lock_staff_codes c
     where c.active and lock_code_covers(c.property_ids, c.areas, l.property_id)
       and case when l.schedules_ok
                then (c.starts_at is null or now() >= c.starts_at - make_interval(days => l.preload_days))
                     and (c.ends_at is null or now() < c.ends_at)
                else lock_staff_window_open(c) end;
    insert into _want select 'test', cm.id::text, 'Test code', cm.args->>'code', true, null from lock_commands cm
     where cm.lock_id = l.id and cm.kind = 'refresh' and cm.args ? 'code' and cm.created_at > now() - interval '10 minutes';

    -- 2) anything live that shouldn't be (or whose code / time window changed) gets cleared
    update lock_assign a set wanted = false, state = 'clearing', tries = 0, err = null, updated_at = now()
     where a.lock_id = l.id and a.wanted and a.state <> 'cleared'
       and not exists (select 1 from _want w where w.ref_kind = a.ref_kind and w.ref_id = a.ref_id and w.code = a.code
                         and w.sched is not distinct from a.sched);

    -- 3) anything wanted that isn't live gets a free slot
    for d in select w.* from _want w
             where not exists (select 1 from lock_assign a where a.lock_id = l.id and a.wanted and a.state <> 'cleared'
                               and a.ref_kind = w.ref_kind and a.ref_id = w.ref_id and a.code = w.code
                               and a.sched is not distinct from w.sched) loop
      select g into s from generate_series(case when d.staff then l.staff_from else l.guest_from end,
                                          case when d.staff then l.staff_to   else l.guest_to   end) g
       where not exists (select 1 from lock_assign a where a.lock_id = l.id and a.slot = g and a.state <> 'cleared')
       order by g limit 1;
      if s is null then
        insert into lock_alerts (kind, property_id, hub_id, lock_id, ref, detail)
        values ('slots_full', l.property_id, l.hub_id, l.id, '', 'No free code slot for ' || d.label)
        on conflict do nothing;
        continue;
      end if;
      insert into lock_assign (lock_id, slot, ref_kind, ref_id, label, code, sched) values (l.id, s, d.ref_kind, d.ref_id, d.label, d.code, d.sched);
      n := n + 1;
    end loop;
  end loop;
  return n;
end $$;
revoke all on function lock_plan() from public, anon, authenticated;


-- ---------------------------------------------------------------- thermostats: warm up before arrival, set back after check-out
-- One step per change, never fighting the guest: when a stay is warm_hours from check-in we set heat to warm_to
-- (and cool to cool_to if set); once the home is empty (check-out + grace, no one arriving within warm_hours) we set heat
-- to vacant_heat. Guests can change it in between; we don't touch it again until the next step.
create or replace function lock_climate_plan() returns int
language plpgsql security definer set search_path = public as $$
declare t record; st lock_stays; nxt lock_stays; step text; args jsonb; n int := 0;
begin
  for t in select th.*, h.warm_to, h.warm_hours, h.vacant_heat, h.vacant_cool, h.cool_to, h.grace_minutes from thermostats th
           join lock_hubs b on b.id = th.hub_id and b.active and b.claimed_at is not null
           join lock_homes h on h.property_id = th.property_id and h.section = 'ours' and h.enabled
           where th.active and th.managed loop
    step := null;
    -- someone arriving soon (or here now)?
    select * into nxt from lock_stays s where s.property_id in (select lock_home_up(t.property_id)) and s.status not in ('cancelled','checked_out')
       and s.starts_at <= now() + make_interval(hours => t.warm_hours) and s.ends_at > now() and s.out_at is null
     order by s.starts_at limit 1;
    if found then
      step := 'warm:' || nxt.res_id;
      -- a thermostat already on COOL stays on cool (summer); everything else is warmed up
      args := case when t.mode = 'cool' then case when t.cool_to is not null then jsonb_build_object('cool', t.cool_to) end
                   else jsonb_build_object('mode', 'heat', 'heat', t.warm_to) end;
    else
      -- last stay ended and nobody is in the home
      select * into st from lock_stays s where s.property_id in (select lock_home_up(t.property_id)) and s.status <> 'cancelled'
         and (s.ends_at + make_interval(mins => t.grace_minutes) <= now() or s.out_at <= now() - interval '15 minutes')
       order by least(s.ends_at, coalesce(s.out_at, s.ends_at)) desc limit 1;
      if found and st.ends_at > now() - interval '3 days' then
        step := 'vacant:' || st.res_id;
        args := case when t.mode = 'cool' then case when t.vacant_cool is not null then jsonb_build_object('cool', t.vacant_cool) end
                     else jsonb_build_object('mode', 'heat', 'heat', t.vacant_heat) end;
      end if;
    end if;
    if step is null or args is null or step is not distinct from t.applied then continue; end if;
    if exists (select 1 from lock_commands c where c.thermostat_id = t.id and c.kind = 'climate' and c.args->>'step' = step
                 and (c.done_at is null and c.expires_at > now() or c.ok)) then continue; end if;
    insert into lock_commands (hub_id, thermostat_id, kind, args, source, created_by, expires_at)
    values (t.hub_id, t.id, 'climate', args || jsonb_build_object('step', step), 'system', 'climate rule', now() + interval '30 minutes');
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function lock_climate_plan() from public, anon, authenticated;

-- crew sets a thermostat by hand from the site
create or replace function lock_climate(p_thermostat uuid, p_mode text, p_heat numeric, p_cool numeric) returns bigint
language plpgsql security definer set search_path = public as $$
declare t thermostats; cid bigint;
begin
  if not lock_is_crew() then raise exception 'Only crew'; end if;
  select * into t from thermostats where id = p_thermostat;
  if p_mode not in ('off','heat','cool','auto') then raise exception 'mode must be off, heat, cool or auto'; end if;
  insert into lock_commands (hub_id, thermostat_id, kind, args, source)
  values (t.hub_id, t.id, 'climate', jsonb_build_object('mode', p_mode, 'heat', p_heat, 'cool', p_cool, 'step', 'manual'), 'admin')
  returning id into cid;
  return cid;
end $$;

drop function if exists lock_thermostat_update(uuid, text, boolean);
create or replace function lock_thermostat_update(p_thermostat uuid, p_name text, p_managed boolean, p_installed date default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not lock_is_crew() then raise exception 'Only crew'; end if;
  update thermostats set name = coalesce(nullif(p_name,''), name), managed = coalesce(p_managed, managed),
         installed_on = coalesce(p_installed, installed_on) where id = p_thermostat;
end $$;

-- r = {warm_to, warm_hours, vacant_heat, cool_to, too_cold, too_hot, heat_max, heat_min, cool_min, after_hours_from, after_hours_to, auto_lock_min}
create or replace function lock_home_rules(p_property text, r jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not lock_is_crew() then raise exception 'Only crew'; end if;
  update lock_homes set
    warm_to = coalesce((r->>'warm_to')::int, warm_to), warm_hours = coalesce((r->>'warm_hours')::int, warm_hours),
    vacant_heat = coalesce((r->>'vacant_heat')::int, vacant_heat), cool_to = case when r ? 'cool_to' then (r->>'cool_to')::int else cool_to end, vacant_cool = case when r ? 'vacant_cool' then (r->>'vacant_cool')::int else vacant_cool end,
    too_cold = coalesce((r->>'too_cold')::int, too_cold), too_hot = coalesce((r->>'too_hot')::int, too_hot),
    heat_max = case when r ? 'heat_max' then (r->>'heat_max')::int else heat_max end, heat_min = case when r ? 'heat_min' then (r->>'heat_min')::int else heat_min end, cool_min = case when r ? 'cool_min' then (r->>'cool_min')::int else cool_min end,
    after_hours_from = coalesce((r->>'after_hours_from')::time, after_hours_from), after_hours_to = coalesce((r->>'after_hours_to')::time, after_hours_to),
    auto_lock_min = case when r ? 'auto_lock_min' then (r->>'auto_lock_min')::int else auto_lock_min end,
    guide_url = coalesce(nullif(r->>'guide_url',''), guide_url),
    arrival_note = case when r ? 'arrival_note' then nullif(r->>'arrival_note','') else arrival_note end,
    noise_limit = coalesce((r->>'noise_limit')::int, noise_limit), noise_minutes = coalesce((r->>'noise_minutes')::int, noise_minutes),
    quiet_from = coalesce((r->>'quiet_from')::time, quiet_from), quiet_to = coalesce((r->>'quiet_to')::time, quiet_to)
   where property_id = p_property;
end $$;


-- ---------------------------------------------------------------- Brivo-style rules that fire on a door event
--   First time code use  -> "guest_arrived" event (the desk shows it; Slack later if wanted)
--   After hours use      -> alert when a crew/vendor/backup code opens a door between after_hours_from and after_hours_to
--   Flood alert          -> alert the moment a leak sensor reports water
--   Sensor open / close  -> kept as events on the home's history
-- Guest is out -> mark the stay, tell housekeeping in Slack, turn the TVs off. Runs once per stay.
create or replace function lock_guest_out(p_res text, p_at timestamptz, p_how text) returns void
language plpgsql security definer set search_path = public as $$
declare st lock_stays; p properties; nxt lock_stays; ch text; early text;
begin
  update lock_stays set out_at = p_at, out_how = p_how where res_id = p_res and out_at is null returning * into st;
  if not found then return; end if;
  select * into p from properties where id = st.property_id;
  insert into lock_events (at, property_id, kind, who_kind, who_id, who, detail)
  values (p_at, st.property_id, 'guest_out', 'stay', st.res_id, st.guest, jsonb_build_object('how', p_how));
  select * into nxt from lock_stays s where s.property_id in (select lock_home_up(st.property_id)) and s.status <> 'cancelled'
     and s.starts_at > p_at order by s.starts_at limit 1;
  early := case when st.ends_at - p_at > interval '15 minutes'
                then ', ' || case when st.ends_at - p_at >= interval '1 hour' then floor(extract(epoch from st.ends_at - p_at) / 3600)::int || ' h ' else '' end
                     || (floor(extract(epoch from st.ends_at - p_at) / 60)::int % 60) || ' min before check-out' else '' end;
  ch := coalesce((select value from lock_settings where key = 'slack_housekeeping_channel'), 'C062SK5DUMQ');
  if ch <> '' and st.kind = 'guest' and p_how <> 'check-out time' then
    insert into lock_notify (property_id, channel, text)
    values (st.property_id, ch, ':broom: *Guest out - ' || coalesce(p.code, st.property_id) || ' is ready to clean*' || coalesce(' (' || p.name || ')', '')
      || E'\n' || coalesce(st.guest, 'Guest') || ' left at ' || to_char(p_at at time zone 'America/Denver', 'FMHH12:MI am') || early || ' - ' || p_how || '.'
      || coalesce(E'\nNext arrival: ' || to_char(nxt.starts_at at time zone 'America/Denver', 'Dy Mon FMDD FMHH12:MI am'), E'\nNo next arrival booked.'));
    perform lock_notify_kick();
  end if;
  -- TVs off (only if nobody else is checking in right now)
  if nxt.starts_at is null or nxt.starts_at > p_at + interval '1 hour' then
    insert into lock_commands (hub_id, kind, args, source, created_by, expires_at)
    select tv.hub_id, 'tv', jsonb_build_object('entity', tv.entity, 'action', 'off'), 'system', 'guest out', now() + interval '30 minutes'
      from lock_tvs tv where tv.active and tv.property_id in (select lock_home_family(st.property_id)) and coalesce(tv.state,'') not in ('off','unavailable');
  end if;
end $$;
revoke all on function lock_guest_out(text, timestamptz, text) from public, anon, authenticated;

-- Slack messages waiting to go out (sent by the lock-notify Edge Function within seconds)
create table if not exists lock_notify (
  id            bigint generated always as identity primary key,
  at            timestamptz not null default now(),
  property_id   text,
  code_id       bigint,
  channel       text not null,
  text          text not null,
  sent_at       timestamptz,
  tries         int not null default 0,
  err           text
);
alter table lock_notify enable row level security;    -- service role only

create or replace function lock_notify_kick() returns void
language plpgsql security definer set search_path = public as $$
declare u text := (select value from lock_settings where key = 'supabase_url');
begin
  if u is null then return; end if;
  begin
    perform net.http_post(url := u || '/functions/v1/lock-notify', body := '{}'::jsonb, headers := '{"content-type":"application/json"}'::jsonb);
  exception when others then null;     -- pg_net missing: the 5-minute health check tries again
  end;
end $$;
revoke all on function lock_notify_kick() from public, anon, authenticated;

create or replace function lock_notify_visit(p_prop text, p_lock uuid, p_at timestamptz, p_code_id text) returns void
language plpgsql security definer set search_path = public as $$
declare c lock_staff_codes; ch text; p properties; door text; what text;
begin
  if p_code_id !~ '^[0-9]+$' then return; end if;
  select * into c from lock_staff_codes where id = p_code_id::bigint;
  if not found or c.kind not in ('vendor','county') then return; end if;
  ch := case c.kind when 'vendor' then coalesce((select value from lock_settings where key = 'slack_vendor_channel'), 'C0BV3AUR422')
                    else coalesce((select value from lock_settings where key = 'slack_county_channel'), 'C0630V0MN9X') end;
  if ch = '' then return; end if;
  if exists (select 1 from lock_notify n where n.code_id = c.id and n.property_id = p_prop and n.at > p_at - interval '2 hours') then return; end if;
  select * into p from properties where id = p_prop;
  select name into door from locks where id = p_lock;
  what := concat_ws(' · ', coalesce(c.person, c.company, c.label), case when c.person is not null then c.company end, c.role);
  insert into lock_notify (property_id, code_id, channel, text)
  values (p_prop, c.id, ch,
    case c.kind when 'vendor' then ':wrench: *Vendor in ' else ':clipboard: *County inspector in ' end || coalesce(p.code, p_prop) || '*'
    || coalesce(' (' || p.name || ')', '') || E'\n' || what || ' - ' || coalesce(door, 'door') || ' at '
    || to_char(p_at at time zone 'America/Denver', 'FMHH12:MI am, Dy Mon FMDD'));
  perform lock_notify_kick();
end $$;
revoke all on function lock_notify_visit(text, uuid, timestamptz, text) from public, anon, authenticated;

-- the Edge Function takes the waiting messages (service role) and marks them sent
create or replace function lock_notify_take() returns setof lock_notify
language sql security definer set search_path = public as $$
  update lock_notify set tries = tries + 1 where id in (select id from lock_notify where sent_at is null and tries < 10 order by id limit 20) returning *
$$;
create or replace function lock_notify_done(p_id bigint, p_ok boolean, p_err text) returns void
language sql security definer set search_path = public as $$
  update lock_notify set sent_at = case when p_ok then now() end, err = p_err where id = p_id
$$;
revoke all on function lock_notify_take() from public, anon, authenticated;
revoke all on function lock_notify_done(bigint, boolean, text) from public, anon, authenticated;

create or replace function lock_event_rules(p_prop text, p_lock uuid, p_kind text, p_at timestamptz, p_who_kind text, p_who_id text, p_who text, p_node int, p_hub uuid) returns void
language plpgsql security definer set search_path = public as $$
declare hm lock_homes; t time := (p_at at time zone 'America/Denver')::time; late boolean;
begin
  select * into hm from lock_homes where property_id = p_prop;
  if p_kind = 'unlock_code' and p_who_kind = 'stay'
     and not exists (select 1 from lock_events e where e.kind = 'guest_arrived' and e.who_id = p_who_id) then
    insert into lock_events (at, property_id, hub_id, lock_id, kind, who_kind, who_id, who) values (p_at, p_prop, p_hub, p_lock, 'guest_arrived', 'stay', p_who_id, p_who);
  end if;
  -- guest left: on check-out day the guest door is locked from the outside keypad (Yale lock button) -> "guest out, ready to clean"
  if p_kind = 'lock_keypad' then
    perform lock_guest_out(st.res_id, p_at, 'door locked from outside')
       from lock_stays st
      where st.property_id in (select lock_home_up(p_prop)) and st.status not in ('cancelled') and st.out_at is null
        and st.starts_at < p_at and st.ends_at > p_at - interval '2 hours'
        and (st.ends_at at time zone 'America/Denver')::date = (p_at at time zone 'America/Denver')::date
        and (p_at at time zone 'America/Denver')::time >= '06:00'
        and exists (select 1 from locks k where k.id = p_lock and k.for_guests);
  end if;
  -- they came back in with their code: not out after all
  if p_kind = 'unlock_code' and p_who_kind = 'stay' then
    update lock_stays set out_at = null, out_how = null where res_id = p_who_id and out_at is not null and out_at > p_at - interval '3 hours' and ends_at > p_at;
  end if;
  -- vendor / county inspector opened a door -> Slack (#maintenance_updates / #licensing), once per person per home per 2 hours
  if p_kind = 'unlock_code' and p_who_kind = 'staff' then
    perform lock_notify_visit(p_prop, p_lock, p_at, p_who_id);
  end if;
  if p_kind = 'unlock_code' and p_who_kind = 'staff' and hm.property_id is not null then
    late := case when hm.after_hours_from <= hm.after_hours_to then t >= hm.after_hours_from and t < hm.after_hours_to
                 else t >= hm.after_hours_from or t < hm.after_hours_to end;
    if late then
      insert into lock_alerts (kind, property_id, hub_id, lock_id, ref, detail)
      values ('after_hours', p_prop, p_hub, p_lock, p_at::text, coalesce(p_who,'A crew code') || ' opened the door at ' || to_char(p_at at time zone 'America/Denver', 'HH12:MI am'))
      on conflict do nothing;
    end if;
  end if;
  if p_kind = 'leak' then
    update sensors set state = 'wet' where hub_id = p_hub and node_id = p_node;
  elsif p_kind = 'leak_clear' then
    update sensors set state = 'dry' where hub_id = p_hub and node_id = p_node;
  elsif p_kind in ('door_open','door_closed') then
    update sensors set state = case when p_kind = 'door_open' then 'open' else 'closed' end where hub_id = p_hub and node_id = p_node;
  end if;
end $$;
revoke all on function lock_event_rules(text, uuid, text, timestamptz, text, text, text, int, uuid) from public, anon, authenticated;

-- "Unoccupied lock": nobody staying (and no crew window open) + a door left unlocked -> lock it
create or replace function lock_auto_lock() returns int
language plpgsql security definer set search_path = public as $$
declare k record; n int := 0;
begin
  for k in select l.* from locks l join lock_homes h on h.property_id = l.property_id and h.section = 'ours' and h.enabled and h.auto_lock_min is not null
           join lock_hubs b on b.id = l.hub_id and b.active and b.last_seen > now() - interval '10 minutes'
           where l.active and l.state = 'unlocked' and l.unlocked_since < now() - make_interval(mins => h.auto_lock_min) loop
    continue when exists (select 1 from lock_stays s where (s.property_id in (select lock_home_up(k.property_id))
                              or (k.shared and s.property_id in (select child_id from lock_links_on where parent_id = k.property_id)))
                            and s.status not in ('cancelled','checked_out')
                            and now() between s.starts_at and s.ends_at);
    continue when exists (select 1 from lock_commands c where c.lock_id = k.id and c.kind = 'lock' and c.source = 'system' and c.created_at > now() - interval '15 minutes');
    insert into lock_commands (hub_id, lock_id, kind, source, created_by) values (k.hub_id, k.id, 'lock', 'system', 'unoccupied lock rule');
    insert into lock_events (property_id, hub_id, lock_id, kind, who) values (k.property_id, k.hub_id, k.id, 'auto_lock_sent', 'unoccupied lock rule');
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function lock_auto_lock() from public, anon, authenticated;


-- ---------------------------------------------------------------- the system tunes itself (daily, from lock_health)
-- Codes late for a home in the last 30 days -> put codes on earlier there (up to 48 h).
-- Lock that keeps dropping (3+ offline alerts in 14 days) -> say so in the alert so the crew adds a repeater, not just batteries.
-- How long batteries last per lock (from the battery-change history) -> stored on the lock; low-battery tasks come early for short-lived ones.
create or replace function lock_learn() returns jsonb
language plpgsql security definer set search_path = public as $$
declare n_lead int; n_bat int;
begin
  with t as (
    update lock_homes h set lead_hours = least(h.lead_hours + 6, 48),
           notes = coalesce(h.notes || E'\n', '') || to_char(now(), 'YYYY-MM-DD') || ': codes were late here - now going on ' || least(h.lead_hours + 6, 48) || ' h before check-in'
     where h.section = 'ours' and h.lead_hours < 48
       and exists (select 1 from lock_alerts a where a.property_id = h.property_id and a.kind = 'code_not_ready' and a.opened_at > now() - interval '30 days'
                     and a.opened_at > coalesce((select max(e.at) from lock_events e where e.property_id = h.property_id and e.kind = 'lead_tuned'), '-infinity'))
    returning h.property_id, h.lead_hours)
  insert into lock_events (property_id, kind, detail) select property_id, 'lead_tuned', jsonb_build_object('lead_hours', lead_hours) from t;
  get diagnostics n_lead = row_count;
  update locks k set battery_days = sub.days from (
    select lock_id, round(avg(extract(epoch from at - prev_at) / 86400))::int as days
      from (select lock_id, at, lag(at) over (partition by lock_id order by at) as prev_at from lock_events where kind = 'battery_changed') x
     where prev_at is not null group by lock_id) sub
   where sub.lock_id = k.id;
  get diagnostics n_bat = row_count;
  update lock_alerts a set detail = a.detail || ' - this lock has dropped off 3+ times in 2 weeks: move the hub closer or add a Z-Wave repeater'
   where a.closed_at is null and a.kind = 'lock_offline' and a.detail not like '%repeater%'
     and (select count(*) from lock_alerts b where b.lock_id = a.lock_id and b.kind = 'lock_offline' and b.opened_at > now() - interval '14 days') >= 3;
  return jsonb_build_object('lead_tuned', n_lead, 'battery_learned', n_bat);
end $$;
revoke all on function lock_learn() from public, anon, authenticated;
select cron.unschedule('lock-learn') where exists (select 1 from cron.job where jobname = 'lock-learn');
select cron.schedule('lock-learn', '17 9 * * *', $$select public.lock_learn()$$);

-- ---------------------------------------------------------------- health -> alerts (every 5 minutes)
create or replace function lock_health() returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0;
begin
  perform lock_plan();
  perform lock_climate_plan();
  perform lock_auto_lock();
  if exists (select 1 from lock_notify where sent_at is null and tries < 10) then perform lock_notify_kick(); end if;
  create temp table if not exists _cond (kind text, property_id text, hub_id uuid, lock_id uuid, ref text, detail text) on commit drop;
  truncate _cond;
  insert into _cond select 'hub_offline', b.property_id, b.id, null, '', 'Hub last checked in ' || coalesce(to_char(b.last_seen at time zone 'America/Denver', 'Mon DD HH12:MI am'), 'never')
    from lock_hubs b where b.active and b.claimed_at is not null and (b.last_seen is null or b.last_seen < now() - interval '10 minutes');
  insert into _cond select 'lock_offline', k.property_id, k.hub_id, k.id, '', k.name || ' is not answering the hub'
    from locks k join lock_hubs b on b.id = k.hub_id and b.last_seen > now() - interval '10 minutes'
   where k.active and k.online is false;
  insert into _cond select case when k.battery <= 5 then 'battery_dead' when k.battery <= 15 then 'battery_critical' else 'battery_low' end,
         k.property_id, k.hub_id, k.id, '', k.name || ' battery ' || k.battery || '%'
    from locks k where k.active and k.battery is not null and k.battery <= case when k.battery_days < 180 then 40 else 30 end;
  insert into _cond select case when t.battery <= 15 then 'battery_critical' else 'battery_low' end, t.property_id, t.hub_id, null, t.id::text,
         t.name || ' battery ' || t.battery || '%'
    from thermostats t where t.active and t.battery is not null and t.battery <= 30;
  insert into _cond select 'flood', x.property_id, x.hub_id, null, x.id::text, x.name || ' is wet'
    from sensors x where x.active and x.kind = 'leak' and x.state = 'wet';
  -- noise: loud for N minutes in quiet hours, 3x as long during the day
  insert into _cond select 'noise', x.property_id, x.hub_id, null, x.id::text,
         x.name || ' has been loud (' || round(x.value) || ' dB, limit ' || h.noise_limit || ') since ' || to_char(x.over_since at time zone 'America/Denver', 'FMHH12:MI am')
    from sensors x join lock_homes h on h.property_id = x.property_id
   where x.active and x.kind = 'noise' and x.over_since is not null and x.last_seen > now() - interval '15 minutes'
     and x.over_since < now() - make_interval(mins => h.noise_minutes *
           case when (case when h.quiet_from > h.quiet_to then (now() at time zone 'America/Denver')::time >= h.quiet_from or (now() at time zone 'America/Denver')::time < h.quiet_to
                           else (now() at time zone 'America/Denver')::time between h.quiet_from and h.quiet_to end) then 1 else 3 end);
  insert into _cond select 'replace_soon', k.property_id, k.hub_id, k.id, '',
         k.name || ' went in ' || to_char(k.installed_on, 'Mon YYYY') || ' - plan to replace by ' || to_char(k.installed_on + make_interval(years => k.replace_years), 'Mon YYYY')
    from locks k where k.active and k.installed_on is not null and k.installed_on + make_interval(years => k.replace_years) < now() + interval '90 days';
  insert into _cond select 'jammed', k.property_id, k.hub_id, k.id, '', k.name || ' is jammed'
    from locks k where k.active and k.state = 'jammed';
  insert into _cond select 'too_cold', t.property_id, t.hub_id, null, t.id::text, t.name || ' reads ' || round(t.temp) || '°F'
    from thermostats t join lock_homes h on h.property_id = t.property_id
   where t.active and t.temp is not null and t.temp < h.too_cold and t.last_seen > now() - interval '30 minutes';
  insert into _cond select 'too_hot', t.property_id, t.hub_id, null, t.id::text, t.name || ' reads ' || round(t.temp) || '°F'
    from thermostats t join lock_homes h on h.property_id = t.property_id
   where t.active and t.temp is not null and t.temp > h.too_hot and t.last_seen > now() - interval '30 minutes';
  -- one thermostat cooling while another in the same home heats (they fight each other and burn money)
  insert into _cond select 'heat_and_ac', c.property_id, c.hub_id, null, c.property_id,
         c.name || ' is on COOL (' || coalesce(round(c.cool_sp)::text,'?') || '°F) while ' || ht.name || ' is on HEAT (' || coalesce(round(ht.heat_sp)::text,'?') || '°F)'
    from thermostats c join thermostats ht on ht.property_id = c.property_id and ht.id <> c.id and ht.active and ht.mode = 'heat'
          and ht.last_seen > now() - interval '30 minutes'
   where c.active and c.mode = 'cool' and c.last_seen > now() - interval '30 minutes'
     and c.id = (select min(c2.id::text)::uuid from thermostats c2 where c2.property_id = c.property_id and c2.active and c2.mode = 'cool')
     and ht.id = (select min(h2.id::text)::uuid from thermostats h2 where h2.property_id = c.property_id and h2.active and h2.mode = 'heat');
  insert into _cond select 'thermostat_offline', t.property_id, t.hub_id, null, t.id::text, t.name || ' is not answering the hub'
    from thermostats t join lock_hubs b on b.id = t.hub_id and b.last_seen > now() - interval '10 minutes'
   where t.active and t.online is false;
  insert into _cond select distinct 'agreement_missing', st.property_id, null::uuid, null::uuid, st.res_id,
         coalesce(st.guest,'Guest') || ' checks in ' || to_char(st.starts_at at time zone 'America/Denver', 'Mon DD HH12:MI am')
         || ' and the rental agreement is not back (Track: ' || coalesce(st.agreement,'?') || '). No door code until it is.'
    from lock_stays st join lock_homes h on h.property_id = st.property_id and h.section = 'ours' and h.enabled
   where st.status not in ('cancelled','checked_out') and not lock_stay_cleared(st)
     and st.starts_at < now() + interval '48 hours' and st.ends_at > now();
  insert into _cond select 'code_not_ready', st.property_id, k.hub_id, k.id, st.res_id,
         coalesce(st.guest,'Guest') || ' checks in ' || to_char(st.starts_at at time zone 'America/Denver', 'Mon DD HH12:MI am') || ' and the code is not confirmed on ' || k.name
    from lock_stays st join locks k on k.active and k.for_guests
          and (k.property_id = st.property_id or k.property_id in (select child_id from lock_links_on where parent_id = st.property_id)
               or (k.shared and k.property_id in (select parent_id from lock_links_on where child_id = st.property_id)))
    join lock_homes h on h.property_id = k.property_id and h.section = 'ours' and h.enabled
   where st.status not in ('cancelled','checked_out') and lock_stay_cleared(st) and st.starts_at < now() + interval '3 hours' and st.ends_at > now()
     and not exists (select 1 from lock_assign a where a.lock_id = k.id and a.ref_kind = 'stay' and a.ref_id = st.res_id
                      and a.wanted and a.state = 'verified');
  -- updates that went wrong (shown on the desk; not a Breezeway task - the crew can't fix these)
  update lock_updates set done_at = now(), ok = false, err = 'did not finish within 2 hours'
   where started_at < now() - interval '2 hours' and done_at is null;
  insert into _cond select 'update_failed', b.property_id, b.id, null, x.entity || ' ' || x.to_ver,
         coalesce(x.title, x.entity) || ' ' || x.to_ver || ' did not install: ' || coalesce(x.err, '?') || '. Other hubs will skip this version.'
    from lock_updates x join lock_hubs b on b.id = x.hub_id
   where x.ok is false and x.done_at > now() - interval '7 days'
     and not exists (select 1 from lock_updates y where y.hub_id = x.hub_id and y.entity = x.entity and y.ok and y.done_at > x.done_at);
  -- guests still marked in after their check-out time (or checked out in Track) -> out
  perform lock_guest_out(st.res_id, case when st.status = 'checked_out' and st.ends_at > now() then now() else st.ends_at end,
                         case when st.status = 'checked_out' and st.ends_at > now() then 'checked out in Track' else 'check-out time' end)
     from lock_stays st join lock_homes hh on hh.property_id = st.property_id and hh.section = 'ours'
    where st.out_at is null and st.status <> 'cancelled' and st.starts_at < now()
      and (st.ends_at <= now() or st.status = 'checked_out') and st.ends_at > now() - interval '2 days';
  -- open new ones
  insert into lock_alerts (kind, property_id, hub_id, lock_id, ref, detail)
  select c.kind, c.property_id, c.hub_id, c.lock_id, c.ref, c.detail from _cond c
   where not exists (select 1 from lock_alerts a where a.closed_at is null and a.kind = c.kind
                     and a.hub_id is not distinct from c.hub_id and a.lock_id is not distinct from c.lock_id and a.ref = c.ref);
  get diagnostics n = row_count;
  insert into lock_notify (property_id, channel, text)
  select a.property_id, (select value from lock_settings where key = 'slack_noise_channel'),
         ':loud_sound: *Noise at ' || coalesce(p.code, a.property_id) || '* - ' || coalesce(a.detail, 'loud')
    from lock_alerts a left join properties p on p.id = a.property_id
   where a.kind = 'noise' and a.closed_at is null and a.opened_at > now() - interval '6 minutes'
     and coalesce((select value from lock_settings where key = 'slack_noise_channel'), '') <> ''
     and not exists (select 1 from lock_notify n where n.property_id = a.property_id and n.text like ':loud_sound:%' and n.at > now() - interval '1 hour');
  -- close the ones that cleared up
  update lock_alerts a set closed_at = now()
   where a.closed_at is null and a.kind not in ('slots_full','after_hours','keybox_used')
     and not exists (select 1 from _cond c where c.kind = a.kind and c.hub_id is not distinct from a.hub_id
                     and c.lock_id is not distinct from a.lock_id and c.ref = a.ref);
  update lock_alerts a set closed_at = now() where a.closed_at is null and a.kind in ('slots_full','after_hours') and a.opened_at < now() - interval '12 hours';
  update lock_alerts a set closed_at = now() where a.closed_at is null and a.kind = 'keybox_used' and a.bw_task is not null
     and exists (select 1 from lock_stays st where st.res_id = a.ref and st.ends_at < now() - interval '1 day');
  return n;
end $$;
revoke all on function lock_health() from public, anon, authenticated;
select cron.unschedule('lock-health') where exists (select 1 from cron.job where jobname = 'lock-health');
select cron.schedule('lock-health', '*/5 * * * *', $$select public.lock_health()$$);

-- ---------------------------------------------------------------- hub side (called only by the lock-hub Edge Function)
create or replace function lock_hub_register(p_hash text, p_fingerprint text, p_ip text, p_version text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare h lock_hubs; code text; i int := 0;
begin
  select * into h from lock_hubs where token_hash = p_hash;
  if found then
    return jsonb_build_object('hub_id', h.id, 'pair_code', case when h.claimed_at is null then h.pair_code end, 'claimed', h.claimed_at is not null);
  end if;
  loop
    code := lpad((floor(random() * 900000) + 100000)::int::text, 6, '0'); i := i + 1;
    exit when not exists (select 1 from lock_hubs where pair_code = code and claimed_at is null and active) or i > 50;
  end loop;
  insert into lock_hubs (token_hash, fingerprint, pair_code, public_ip, version, last_seen)
  values (p_hash, p_fingerprint, code, p_ip, p_version, now()) returning * into h;
  -- unclaimed hubs older than a day fall off the "find hub" list
  update lock_hubs set active = false where claimed_at is null and active and created_at < now() - interval '1 day' and id <> h.id;
  return jsonb_build_object('hub_id', h.id, 'pair_code', code, 'claimed', false);
end $$;
revoke all on function lock_hub_register(text, text, text, text) from public, anon, authenticated;

-- One round trip: the hub reports what it sees and what it did; gets back what to do.
-- p = {status:{...}, locks:[{node_id,name,model,battery,online,state}], results:[{id,state,err}],
--      cmd_results:[{id,ok,result}], events:[{at,node_id,kind,slot,detail}], audits:[{node_id, slots:[{slot,in_use,code}]}]}
-- Which Home Assistant update (if any) this hub should install right now. One at a time, safest order.
create or replace function lock_update_plan(h lock_hubs) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare canary uuid; wait_h int; new_d int; hr int; u lock_updates;
begin
  if coalesce((select value from lock_settings where key = 'auto_update'), 'on') <> 'on' then return '[]'; end if;
  hr := extract(hour from now() at time zone 'America/Denver');
  if hr not between 2 and 4 then return '[]'; end if;                       -- quiet window 2:00-4:59 am
  -- nobody in the home or arriving in the next 6 hours (this home, its children and its parents)
  if exists (select 1 from lock_stays st
              where st.status not in ('cancelled','checked_out') and st.starts_at < now() + interval '6 hours' and st.ends_at > now()
                and (st.property_id = h.property_id
                     or st.property_id in (select child_id from lock_links_on where parent_id = h.property_id)
                     or st.property_id in (select parent_id from lock_links_on where child_id = h.property_id))) then
    return '[]';
  end if;
  -- the home has trouble right now (leak, cold, jam, code not ready): leave the hub alone
  if exists (select 1 from lock_alerts a where a.closed_at is null and a.property_id = h.property_id
              and a.kind in ('flood','too_cold','too_hot','jammed','code_not_ready','lock_offline')) then return '[]'; end if;
  -- one at a time
  if exists (select 1 from lock_updates x where x.hub_id = h.id and x.started_at is not null and x.done_at is null) then return '[]'; end if;
  wait_h := coalesce((select value from lock_settings where key = 'update_wait_hours')::int, 72);
  new_d  := coalesce((select value from lock_settings where key = 'update_new_days')::int, 3);
  canary := coalesce((select b.id from lock_hubs b join properties p on p.id = b.property_id
                       where b.active and b.claimed_at is not null
                         and p.code = coalesce((select value from lock_settings where key = 'update_canary'), 'BHL 1206')
                       order by b.created_at limit 1),
                     (select b.id from lock_hubs b where b.active and b.claimed_at is not null order by b.created_at limit 1));
  select x.* into u from lock_updates x
   where x.hub_id = h.id and x.done_at is null and x.started_at is null and x.kind in ('supervisor','os','core','addon')
     -- never a version that failed anywhere
     and not exists (select 1 from lock_updates f where f.entity = x.entity and f.to_ver = x.to_ver and f.ok is false)
     and case when h.id = canary
              then x.first_seen < now() - make_interval(days => new_d)       -- test hub: let the release age a few days first
              else exists (select 1 from lock_updates g where g.hub_id = canary and g.entity = x.entity and g.to_ver = x.to_ver
                            and g.ok and g.done_at < now() - make_interval(hours => wait_h))   -- others: only after the test hub ran it
         end
   order by array_position(array['supervisor','os','core','addon'], x.kind), x.id
   limit 1;
  if not found then return '[]'; end if;
  return jsonb_build_array(jsonb_build_object('entity', u.entity, 'to', u.to_ver, 'kind', u.kind));
end $$;
revoke all on function lock_update_plan(lock_hubs) from public, anon, authenticated;

create or replace function lock_hub_sync(p_hash text, p jsonb, p_ip text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare h lock_hubs; r jsonb; s jsonb; k locks; w record; a lock_assign; out_assign jsonb; out_cmds jsonb; nodes jsonb;
begin
  select * into h from lock_hubs where token_hash = p_hash and active;
  if not found then return jsonb_build_object('error', 'unknown hub'); end if;

  update lock_hubs set last_seen = now(), public_ip = coalesce(p_ip, public_ip),
         status = coalesce(p->'status', status), version = coalesce(p->'status'->>'version', version)
   where id = h.id;
  if h.last_seen is null or h.last_seen < now() - interval '10 minutes' then
    insert into lock_events (property_id, hub_id, kind, detail) values (h.property_id, h.id, 'hub_online',
      jsonb_build_object('was_offline_since', h.last_seen));
  end if;

  if h.claimed_at is null then
    return jsonb_build_object('claimed', false, 'pair_code', h.pair_code, 'hub_id', h.id);
  end if;

  -- locks the hub can see
  for r in select * from jsonb_array_elements(coalesce(p->'locks', '[]')) loop
    select * into k from locks where hub_id = h.id and node_id = (r->>'node_id')::int;
    if found and k.battery is not null and (r->>'battery')::int >= k.battery + 30 then
      update locks set last_battery_change = now() where id = k.id;
      insert into lock_events (property_id, hub_id, lock_id, kind, detail)
      values (h.property_id, h.id, k.id, 'battery_changed', jsonb_build_object('from', k.battery, 'to', (r->>'battery')::int));
    end if;
    insert into locks (hub_id, property_id, node_id, name, model, battery, online, state, last_seen, installed_on)
    values (h.id, h.property_id, (r->>'node_id')::int, 'New lock (node ' || (r->>'node_id') || ')', r->>'model',
            (r->>'battery')::int, (r->>'online')::boolean, r->>'state', now(), current_date)
    on conflict (hub_id, node_id) do update set
      model = coalesce(excluded.model, locks.model), battery = coalesce(excluded.battery, locks.battery),
      online = excluded.online, state = coalesce(excluded.state, locks.state), last_seen = now(),
      rssi = (r->>'rssi')::int, rtt = (r->>'rtt')::int, dropped = (r->>'dropped')::int,
      slots = coalesce((r->>'slots')::int, locks.slots), slots_used = coalesce((r->>'slots_used')::int, locks.slots_used),
      unlocked_since = case when coalesce(excluded.state, locks.state) = 'unlocked' then coalesce(locks.unlocked_since, now()) end,
      property_id = h.property_id;
  end loop;

  -- thermostats the hub can see
  for r in select * from jsonb_array_elements(coalesce(p->'thermostats', '[]')) loop
    insert into thermostats (hub_id, property_id, node_id, name, model, temp, mode, heat_sp, cool_sp, online, battery, last_seen)
    values (h.id, h.property_id, (r->>'node_id')::int, 'Thermostat (node ' || (r->>'node_id') || ')', r->>'model',
            (r->>'temp')::numeric, r->>'mode', (r->>'heat')::numeric, (r->>'cool')::numeric, (r->>'online')::boolean, (r->>'battery')::int, now())
    on conflict (hub_id, node_id) do update set
      model = coalesce(excluded.model, thermostats.model), temp = excluded.temp, mode = excluded.mode,
      heat_sp = excluded.heat_sp, cool_sp = excluded.cool_sp, online = excluded.online,
      battery = coalesce(excluded.battery, thermostats.battery), last_seen = now(), property_id = h.property_id,
      rssi = (r->>'rssi')::int, rtt = (r->>'rtt')::int, dropped = (r->>'dropped')::int;
  end loop;

  -- leak + door/window sensors
  for r in select * from jsonb_array_elements(coalesce(p->'sensors', '[]')) loop
    insert into sensors (hub_id, property_id, node_id, name, kind, state, battery, online, last_seen, entity, value, over_since)
    values (h.id, h.property_id, (r->>'node_id')::int,
            coalesce(nullif(r->>'name',''), initcap(coalesce(r->>'kind','sensor')) || ' sensor (node ' || (r->>'node_id') || ')'),
            coalesce(r->>'kind','other'), r->>'state', (r->>'battery')::int, (r->>'online')::boolean, now(), r->>'entity', (r->>'value')::numeric,
            case when r->>'kind' = 'noise' and (r->>'value')::numeric > coalesce((select noise_limit from lock_homes where property_id = h.property_id), 80) then now() end)
    on conflict (hub_id, node_id) do update set kind = excluded.kind, state = coalesce(excluded.state, sensors.state),
      battery = coalesce(excluded.battery, sensors.battery), online = excluded.online, last_seen = now(), property_id = h.property_id,
      rssi = (r->>'rssi')::int, entity = coalesce(r->>'entity', sensors.entity), value = (r->>'value')::numeric,
      over_since = case when r->>'kind' = 'noise' and (r->>'value')::numeric >
                          coalesce((select noise_limit from lock_homes where property_id = h.property_id), 80)
                        then coalesce(sensors.over_since, now()) end;
  end loop;

  -- TVs
  for r in select * from jsonb_array_elements(coalesce(p->'tvs', '[]')) loop
    insert into lock_tvs (hub_id, property_id, entity, name, platform, state, app, volume, muted, last_seen)
    values (h.id, h.property_id, r->>'entity', coalesce(r->>'name','TV'), r->>'platform', r->>'state', r->>'app', (r->>'volume')::numeric, (r->>'muted')::boolean, now())
    on conflict (hub_id, entity) do update set property_id = h.property_id, platform = excluded.platform, state = excluded.state, app = excluded.app,
      volume = excluded.volume, muted = excluded.muted, last_seen = now(),
      name = case when lock_tvs.name = 'TV' or lock_tvs.name is null then excluded.name else lock_tvs.name end;
  end loop;

  -- results of code writes / clears
  for r in select * from jsonb_array_elements(coalesce(p->'results', '[]')) loop
    select * into a from lock_assign where id = (r->>'id')::bigint and lock_id in (select id from locks where hub_id = h.id);
    if not found then continue; end if;
    if r->>'state' = 'verified' and a.wanted then
      update lock_assign set state = 'verified', set_at = coalesce(set_at, now()), verified_at = now(), err = null, updated_at = now() where id = a.id;
      insert into lock_events (property_id, hub_id, lock_id, kind, slot, who_kind, who_id, who)
      values (h.property_id, h.id, a.lock_id, 'code_set', a.slot, a.ref_kind, a.ref_id, a.label);
    elsif r->>'state' = 'cleared' and not a.wanted then
      update lock_assign set state = 'cleared', cleared_at = now(), err = null, updated_at = now() where id = a.id;
      insert into lock_events (property_id, hub_id, lock_id, kind, slot, who_kind, who_id, who)
      values (h.property_id, h.id, a.lock_id, 'code_cleared', a.slot, a.ref_kind, a.ref_id, a.label);
    elsif r->>'state' = 'failed' and r->>'err' = 'no_schedule' then
      -- this lock won't take time windows: switch it to add/remove timing (the hub already took the early code off)
      update locks set schedules_ok = false where id = a.lock_id;
      update lock_assign set wanted = false, state = 'cleared', cleared_at = now(), err = 'lock has no schedules - using add/remove timing', updated_at = now()
       where id = a.id;
      insert into lock_events (property_id, hub_id, lock_id, kind, detail) values (h.property_id, h.id, a.lock_id, 'schedules_off', '{}');
    elsif r->>'state' = 'failed' then
      update lock_assign set tries = tries + 1, err = left(r->>'err', 300), updated_at = now(),
             state = case when wanted then 'failed' else 'clearing' end where id = a.id;
      if a.tries in (0, 4, 19) then
        insert into lock_events (property_id, hub_id, lock_id, kind, slot, who_kind, who_id, who, detail)
        values (h.property_id, h.id, a.lock_id, 'code_failed', a.slot, a.ref_kind, a.ref_id, a.label, jsonb_build_object('err', r->>'err', 'try', a.tries + 1));
      end if;
    end if;
  end loop;

  -- what the locks actually hold (nightly + after pairing): fix drift, clear strangers
  for r in select * from jsonb_array_elements(coalesce(p->'audits', '[]')) loop
    select * into k from locks where hub_id = h.id and node_id = (r->>'node_id')::int;
    if not found then continue; end if;
    for s in select * from jsonb_array_elements(coalesce(r->'slots', '[]')) loop
      select * into a from lock_assign where lock_id = k.id and slot = (s->>'slot')::int and state <> 'cleared';
      if found then
        if a.wanted and a.state = 'verified' and ((s->>'in_use')::boolean is not true or s->>'code' is distinct from a.code) then
          update lock_assign set state = 'pending', err = 'lock lost the code - writing it again', updated_at = now() where id = a.id;
        end if;
      elsif (s->>'in_use')::boolean and coalesce((select wipe_foreign from lock_homes where property_id = k.property_id), true)
            and (((s->>'slot')::int between k.staff_from and k.staff_to) or ((s->>'slot')::int between k.guest_from and k.guest_to)
                 or coalesce((r->>'wipe_all')::boolean, false)) then
        insert into lock_assign (lock_id, slot, ref_kind, ref_id, label, code, wanted, state)
        values (k.id, (s->>'slot')::int, 'foreign', 'slot-' || (s->>'slot'), 'Old code (not ours)', null, false, 'clearing');
      end if;
    end loop;
  end loop;

  -- what happened at the doors
  for r in select * from jsonb_array_elements(coalesce(p->'events', '[]')) loop
    select * into k from locks where hub_id = h.id and node_id = (r->>'node_id')::int;
    select * into w from lock_who(k.id, (r->>'slot')::int, coalesce((r->>'at')::timestamptz, now()));
    insert into lock_events (at, property_id, hub_id, lock_id, kind, slot, who_kind, who_id, who, detail)
    values (coalesce((r->>'at')::timestamptz, now()), h.property_id, h.id, k.id, r->>'kind', (r->>'slot')::int,
            w.who_kind, w.who_id, w.who, coalesce(r->'detail', '{}'));
    if r->>'kind' = 'jammed' and k.id is not null then update locks set state = 'jammed' where id = k.id; end if;
    perform lock_event_rules(h.property_id, k.id, r->>'kind', coalesce((r->>'at')::timestamptz, now()), w.who_kind, w.who_id, w.who, (r->>'node_id')::int, h.id);
  end loop;

  -- command results
  for r in select * from jsonb_array_elements(coalesce(p->'cmd_results', '[]')) loop
    update lock_commands set done_at = now(), ok = (r->>'ok')::boolean, result = r->'result'
     where id = (r->>'id')::bigint and hub_id = h.id and done_at is null;
    update thermostats t set applied = c.args->>'step' from lock_commands c
     where c.id = (r->>'id')::bigint and c.kind = 'climate' and c.thermostat_id = t.id and (r->>'ok')::boolean
       and c.args->>'step' <> 'manual';
    insert into lock_events (property_id, hub_id, kind, who_kind, who, detail)
    select h.property_id, h.id, 'climate_set', c.source, c.created_by, c.args || jsonb_build_object('ok', (r->>'ok')::boolean)
      from lock_commands c where c.id = (r->>'id')::bigint and c.kind = 'climate';
  end loop;

  -- updates the hub can see (Home Assistant, add-ons, stick, device firmware)
  if p ? 'updates' then
    for r in select * from jsonb_array_elements(coalesce(p->'updates', '[]')) loop
      if coalesce(r->>'latest','') <> '' and r->>'latest' is distinct from r->>'installed' then
        insert into lock_updates (hub_id, entity, kind, title, node_id, from_ver, to_ver)
        values (h.id, r->>'entity', coalesce(r->>'kind','other'), r->>'title', (r->>'node_id')::int, r->>'installed', r->>'latest')
        on conflict (hub_id, entity, to_ver) do update set from_ver = coalesce(lock_updates.from_ver, excluded.from_ver), title = excluded.title;
      end if;
      -- it's on now (by us, by hand, or by Home Assistant itself): count it as done
      update lock_updates set done_at = now(), ok = true, err = null
       where hub_id = h.id and entity = r->>'entity' and done_at is null and to_ver = r->>'installed';
      -- a newer version showed up before this one went in: the old row is no longer needed
      update lock_updates set done_at = now(), ok = null, err = 'replaced by ' || (r->>'latest')
       where hub_id = h.id and entity = r->>'entity' and done_at is null and started_at is null
         and coalesce(r->>'latest','') <> '' and to_ver <> r->>'latest' and to_ver <> r->>'installed';
    end loop;
  end if;
  for r in select * from jsonb_array_elements(coalesce(p->'update_results', '[]')) loop
    if (r->>'started')::boolean then
      update lock_updates set started_at = coalesce(started_at, now()), started_by = coalesce(r->>'by', 'auto')
       where hub_id = h.id and entity = r->>'entity' and to_ver = r->>'to' and done_at is null;
      insert into lock_events (property_id, hub_id, kind, who, detail)
      values (h.property_id, h.id, 'update_started', coalesce(r->>'by','auto'), jsonb_build_object('entity', r->>'entity', 'to', r->>'to'));
    elsif (r->>'ok')::boolean is false then
      update lock_updates set done_at = now(), ok = false, err = left(r->>'err', 300)
       where hub_id = h.id and entity = r->>'entity' and to_ver = r->>'to' and done_at is null;
      insert into lock_events (property_id, hub_id, kind, detail)
      values (h.property_id, h.id, 'update_failed', jsonb_build_object('entity', r->>'entity', 'to', r->>'to', 'err', r->>'err'));
    end if;
  end loop;

  perform lock_plan();
  perform lock_climate_plan();

  -- what the hub should do now
  select coalesce(jsonb_agg(jsonb_build_object('id', a2.id, 'node_id', k2.node_id, 'slot', a2.slot, 'code', a2.code,
                                               'wanted', a2.wanted, 'state', a2.state, 'tries', a2.tries, 'sched', a2.sched) order by a2.id), '[]')
    into out_assign
    from lock_assign a2 join locks k2 on k2.id = a2.lock_id
   where k2.hub_id = h.id and a2.state <> 'cleared' and k2.active;

  with picked as (
    update lock_commands c set picked_at = now()
     where c.hub_id = h.id and c.picked_at is null and c.expires_at > now()
    returning c.*)
  select coalesce(jsonb_agg(jsonb_build_object('id', pc.id, 'kind', pc.kind, 'node_id', coalesce(k3.node_id, t3.node_id), 'args', pc.args) order by pc.id), '[]')
    into out_cmds from picked pc left join locks k3 on k3.id = pc.lock_id left join thermostats t3 on t3.id = pc.thermostat_id;

  select coalesce(jsonb_agg(jsonb_build_object('node_id', node_id, 'name', name) order by node_id), '[]') into nodes
    from locks where hub_id = h.id and active;

  return jsonb_build_object('claimed', true, 'hub_id', h.id, 'property_id', h.property_id,
                            'governor', (select jsonb_build_object('heat_max', heat_max, 'heat_min', heat_min, 'cool_min', cool_min,
                                                 'managed', coalesce((select jsonb_agg(node_id) from thermostats where hub_id = h.id and active and managed), '[]'))
                                           from lock_homes where property_id = h.property_id),
                            'assignments', out_assign, 'commands', out_cmds, 'locks', nodes,
                            'audit_due', coalesce((p->'status'->>'last_audit')::timestamptz < now() - interval '20 hours', true),
                            'install_updates', lock_update_plan(h),
                            'latest', (select jsonb_build_object('version', max(value) filter (where key = 'hub_version'),
                                                                 'url', max(value) filter (where key = 'hub_zip_url')) from lock_settings));
end $$;
revoke all on function lock_hub_sync(text, jsonb, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- the hubs' door (free: plain database API, no Edge Function calls)
-- Hubs call /rest/v1/rpc/lock_hub_api with the public key + their own secret. We only ever keep the secret's sha256.
create or replace function lock_hub_api(p_secret text, p_action text, p jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare h text; ip text := lock_caller_ip(); r jsonb;
begin
  if p_secret is null or length(p_secret) < 40 then return jsonb_build_object('error', 'bad secret'); end if;
  h := encode(digest(p_secret, 'sha256'), 'hex');
  if p_action = 'register' then
    return lock_hub_register(h, coalesce(p->>'fingerprint',''), ip, coalesce(p->>'version',''));
  elsif p_action = 'sync' then
    r := lock_hub_sync(h, coalesce(p, '{}'), ip);
    if r ? 'hub_id' then
      r := r || jsonb_build_object('realtime', jsonb_build_object(
        'url', (select replace(value, 'https://', 'wss://') from lock_settings where key = 'supabase_url') || '/realtime/v1/websocket',
        'apikey', (select value from lock_settings where key = 'anon_key'),
        'topic', 'hub-' || (r->>'hub_id')));
    end if;
    return r;
  end if;
  return jsonb_build_object('error', 'unknown action');
end $$;
revoke all on function lock_hub_api(text, text, jsonb) from public;
grant execute on function lock_hub_api(text, text, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------- setup page (Chris): signed-in admin/tech only
-- Hubs that just came online from the same internet connection as this phone.
create or replace function lock_find_hubs() returns table (id uuid, created_at timestamptz, last_seen timestamptz, pair_code text)
language sql stable security definer set search_path = public as $$
  select b.id, b.created_at, b.last_seen, b.pair_code from lock_hubs b
   where lock_is_crew() and b.active and b.claimed_at is null and b.last_seen > now() - interval '30 minutes'
     and b.public_ip is not null and b.public_ip = lock_caller_ip()
   order by b.last_seen desc
$$;

create or replace function lock_claim_hub(p_hub uuid, p_pair text, p_property text, p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare h lock_hubs;
begin
  if not lock_is_crew() then raise exception 'Only crew can add hubs'; end if;
  select * into h from lock_hubs where active and claimed_at is null
     and ((p_hub is not null and id = p_hub and public_ip = lock_caller_ip()) or (p_pair is not null and pair_code = p_pair));
  if not found then raise exception 'Hub not found. Make sure your phone is on the home''s Wi-Fi, or type the 6-digit code.'; end if;
  -- one hub per home: the old one (if any) is retired
  update lock_hubs set active = false where property_id = p_property and active and id <> h.id;
  update locks set active = false where property_id = p_property and hub_id <> h.id and active;
  update lock_hubs set property_id = p_property, name = coalesce(nullif(p_name,''), 'Hub'), claimed_at = now(), claimed_by = actor(), pair_code = null
   where id = h.id;
  insert into lock_homes (property_id) values (p_property) on conflict (property_id) do update set section = 'ours', enabled = true;
  insert into lock_events (property_id, hub_id, kind, detail) values (p_property, h.id, 'hub_added', jsonb_build_object('by', actor()));
  return h.id;
end $$;

create or replace function lock_command(p_hub uuid, p_lock uuid, p_kind text, p_args jsonb default '{}') returns bigint
language plpgsql security definer set search_path = public as $$
declare cid bigint; hub uuid := p_hub;
begin
  if not lock_is_crew() then raise exception 'Only crew'; end if;
  if p_lock is not null then select hub_id into hub from locks where id = p_lock; end if;
  if p_kind not in ('unlock','lock','include','exclude','stop','wipe','refresh','audit','ping','heal','restart','update','tv') then raise exception 'bad command'; end if;
  if p_kind = 'update' and app_role() is distinct from 'admin' then raise exception 'Only admins can start an update'; end if;
  if hub is null then raise exception 'pick a hub or a lock'; end if;
  insert into lock_commands (hub_id, lock_id, kind, args, source, expires_at)
  values (hub, p_lock, p_kind, coalesce(p_args, '{}') || case when p_kind = 'update' then jsonb_build_object('by', actor()) else '{}' end, 'admin',
          now() + case when p_kind in ('include','exclude') then interval '5 minutes' when p_kind = 'update' then interval '30 minutes' else interval '2 minutes' end)
  returning id into cid;
  if p_kind = 'refresh' and p_args ? 'code' then perform lock_plan(); end if;
  if p_kind in ('unlock','lock') then
    insert into lock_events (property_id, hub_id, lock_id, kind, who_kind, who) select property_id, hub_id, id, 'remote_' || p_kind || '_sent', 'crew', actor() from locks where id = p_lock;
  end if;
  return cid;
end $$;

drop function if exists lock_update(uuid, text, boolean, boolean);
drop function if exists lock_update(uuid, text, boolean, boolean, text);
drop function if exists lock_update(uuid, text, boolean, boolean, text, date, int);
create or replace function lock_update(p_lock uuid, p_name text, p_for_guests boolean, p_active boolean, p_master text default null,
                                       p_installed date default null, p_replace_years int default null, p_shared boolean default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not lock_is_crew() then raise exception 'Only crew'; end if;
  if p_master is not null and p_master !~ '^[0-9]{4,8}$' then raise exception 'Master codes are 4 to 8 digits'; end if;
  update locks set name = coalesce(nullif(p_name,''), name), for_guests = coalesce(p_for_guests, for_guests),
         active = coalesce(p_active, active), master_code = coalesce(p_master, master_code),
         installed_on = coalesce(p_installed, installed_on), replace_years = coalesce(p_replace_years, replace_years),
         shared = coalesce(p_shared, shared)
   where id = p_lock;
  perform lock_apply_masters();
  perform lock_plan();
end $$;

create or replace function lock_home_link(p_parent text, p_child text, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if app_role() is distinct from 'admin' then raise exception 'Only admins'; end if;
  insert into lock_home_links (parent_id, child_id, active) values (p_parent, p_child, p_on)
  on conflict (parent_id, child_id) do update set active = p_on;
  perform lock_plan();
end $$;

create or replace function lock_home_set(p_property text, p_section text, p_enabled boolean, p_notes text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if app_role() is distinct from 'admin' then raise exception 'Only admins'; end if;
  insert into lock_homes (property_id, section, enabled, notes) values (p_property, p_section, coalesce(p_enabled, true), p_notes)
  on conflict (property_id) do update set section = excluded.section, enabled = excluded.enabled, notes = coalesce(excluded.notes, lock_homes.notes);
  perform lock_plan();
end $$;

-- add / change an employee, vendor or backup code. r = {id?, kind, label, code, property_ids?, starts_at?, ends_at?, days?, time_from?, time_to?, active?}
create or replace function lock_staff_code(r jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare rid bigint := (r->>'id')::bigint; props text[]; dys int[]; ars text[];
begin
  if not lock_is_crew() then raise exception 'Only crew'; end if;
  if coalesce(r->>'code','') !~ '^[0-9]{4,8}$' then raise exception 'Codes are 4 to 8 digits'; end if;
  props := case when jsonb_typeof(r->'property_ids') = 'array' and jsonb_array_length(r->'property_ids') > 0
                then array(select jsonb_array_elements_text(r->'property_ids')) end;
  ars   := case when jsonb_typeof(r->'areas') = 'array' and jsonb_array_length(r->'areas') > 0
                then array(select jsonb_array_elements_text(r->'areas')) end;
  dys   := case when jsonb_typeof(r->'days') = 'array' and jsonb_array_length(r->'days') > 0
                then array(select jsonb_array_elements_text(r->'days')::int) end;
  if exists (select 1 from lock_staff_codes c where c.active and c.code = r->>'code' and c.id is distinct from rid
               and lock_code_homes(c.property_ids, c.areas) && lock_code_homes(props, ars)) then
    raise exception 'Someone else already has code % at one of those homes', r->>'code';
  end if;
  if rid is null then
    insert into lock_staff_codes (property_ids, kind, label, code, starts_at, ends_at, days, time_from, time_to, person, company, role, areas)
    values (props, coalesce(r->>'kind','employee'),
            coalesce(nullif(r->>'label',''), concat_ws(' - ', nullif(r->>'person',''), nullif(r->>'company',''))), r->>'code',
            (r->>'starts_at')::timestamptz, (r->>'ends_at')::timestamptz, dys, (r->>'time_from')::time, (r->>'time_to')::time,
            nullif(r->>'person',''), nullif(r->>'company',''), nullif(r->>'role',''), ars)
    returning id into rid;
  else
    update lock_staff_codes set property_ids = props, areas = ars, kind = coalesce(r->>'kind', kind), label = coalesce(r->>'label', label), code = r->>'code',
           starts_at = (r->>'starts_at')::timestamptz, ends_at = (r->>'ends_at')::timestamptz, days = dys,
           time_from = (r->>'time_from')::time, time_to = (r->>'time_to')::time, active = coalesce((r->>'active')::boolean, active),
           person = case when r ? 'person' then nullif(r->>'person','') else person end,
           company = case when r ? 'company' then nullif(r->>'company','') else company end,
           role = case when r ? 'role' then nullif(r->>'role','') else role end
     where id = rid;
  end if;
  perform lock_plan();
  return rid;
end $$;

-- Brivo users -> our crew/vendor/backup codes, same numbers (service role only; run by brivo_import.py)
create or replace function lock_import_staff(rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb; n_new int := 0; n_upd int := 0; was_new boolean;
begin
  for r in select * from jsonb_array_elements(rows) loop
    if coalesce(r->>'code','') !~ '^[0-9]{4,8}$' then continue; end if;
    was_new := not exists (select 1 from lock_staff_codes where brivo_ref = r->>'brivo_ref');
    insert into lock_staff_codes (brivo_ref, kind, label, code, property_ids, starts_at, ends_at, days, time_from, time_to, added_by)
    values (r->>'brivo_ref', coalesce(r->>'kind','employee'), r->>'label', r->>'code',
            case when jsonb_typeof(r->'property_ids') = 'array' then array(select jsonb_array_elements_text(r->'property_ids')) end,
            (r->>'starts_at')::timestamptz, (r->>'ends_at')::timestamptz,
            case when jsonb_typeof(r->'days') = 'array' then array(select jsonb_array_elements_text(r->'days')::int) end,
            (r->>'time_from')::time, (r->>'time_to')::time, 'brivo import')
    on conflict (brivo_ref) do update set label = excluded.label, code = excluded.code, kind = excluded.kind,
           starts_at = excluded.starts_at, ends_at = excluded.ends_at, property_ids = excluded.property_ids,
           days = excluded.days, time_from = excluded.time_from, time_to = excluded.time_to;
    if was_new then n_new := n_new + 1; else n_upd := n_upd + 1; end if;
  end loop;
  perform lock_plan();
  return jsonb_build_object('new', n_new, 'updated', n_upd);
end $$;
revoke all on function lock_import_staff(jsonb) from public, anon, authenticated;

-- master PINs from Brivo's master code report, matched by home code + door name (service role only)
create or replace function lock_import_masters(rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare r jsonb; n int := 0;
begin
  for r in select * from jsonb_array_elements(rows) loop
    insert into lock_master_staging (unit, door, master_code) values (r->>'unit', coalesce(r->>'door',''), r->>'master_code')
    on conflict (unit, door) do update set master_code = excluded.master_code, at = now();
    n := n + 1;
  end loop;
  perform lock_apply_masters();
  return n;
end $$;
revoke all on function lock_import_masters(jsonb) from public, anon, authenticated;

-- once a lock is paired and named, it picks up its master PIN from what Brivo had for that home/door
create or replace function lock_apply_masters() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update locks k set master_code = s.master_code
    from properties p, lock_master_staging s
   where p.id = k.property_id and k.master_code is null and s.unit = p.code
     and (s.door = '' or lower(s.door) = lower(k.name)
          or (select count(*) from lock_master_staging s2 where s2.unit = p.code) = 1);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function lock_apply_masters() from public, anon, authenticated;

-- a stay's code can be changed by hand (e.g. guest asks); it then goes back on the lock
create or replace function lock_stay_code(p_res text, p_code text) returns void
language plpgsql security definer set search_path = public as $$
declare st lock_stays;
begin
  if not lock_is_crew() then raise exception 'Only crew'; end if;
  if p_code !~ '^[0-9]{4,6}$' then raise exception 'Codes are 4 to 6 digits'; end if;
  select * into st from lock_stays where res_id = p_res;
  if lock_code_taken(st.property_id, p_code, st.starts_at, st.ends_at, st.res_id) then raise exception 'That code is already in use at this home'; end if;
  update lock_stays set code = p_code, code_source = 'manual', updated_at = now() where res_id = p_res;
  perform lock_plan();
end $$;


-- ---------------------------------------------------------------- Track unit security codes -> guest page (service role only; locks_sync.py)
-- rows: [{unit, track_unit_id, codes:[{type, code, public, start, end}]}]. Track is the source: garage, gate/building, key box,
-- and any other public code (hot tub...) for the guest page. Front door codes (Brivo) are skipped - we make those.
create or replace function lock_set_track_codes(rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare r jsonb; prop text; n int := 0; codes jsonb;
begin
  for r in select * from jsonb_array_elements(rows) loop
    select id into prop from properties where code = r->>'unit';
    if prop is null then continue; end if;
    -- only codes in effect today
    select coalesce(jsonb_agg(c), '[]') into codes from jsonb_array_elements(r->'codes') c
     where (c->>'start' is null or (c->>'start')::date <= current_date) and (c->>'end' is null or (c->>'end')::date >= current_date);
    insert into property_access (property_id) values (prop) on conflict (property_id) do nothing;
    update property_access pa set
      garage_code = coalesce((select x->>'code' from jsonb_array_elements(codes) x where x->>'type' ilike '%garage%' and (x->>'public')::boolean
                               order by (x->>'type' ilike '%main%') desc limit 1), pa.garage_code),
      gate_code = coalesce((select x->>'code' from jsonb_array_elements(codes) x
                             where x->>'type' ~* '(gate|building|lobby|entry|community|front desk)' and x->>'type' !~* 'front door' limit 1), pa.gate_code),
      lockbox_code = coalesce((select x->>'code' from jsonb_array_elements(codes) x where x->>'type' ~* '(key ?box|lock ?box)'
                                order by x->>'start' desc nulls last limit 1), pa.lockbox_code)
     where pa.property_id = prop;
    update lock_homes set track_unit_id = (r->>'track_unit_id')::bigint,
           extra_codes = (select coalesce(jsonb_agg(jsonb_build_object('name', x->>'type', 'code', x->>'code')), '[]')
                            from jsonb_array_elements(codes) x
                           where (x->>'public')::boolean and x->>'type' !~* '(front door|garage|gate|building|lobby|entry|community|key ?box|lock ?box)')
     where property_id = prop;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function lock_set_track_codes(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------- "I can't get in": emergency key box code for the guest
-- Only during the stay. Logs it, opens a keybox_used alert (-> Breezeway task "check the key box" on check-out day),
-- and the lock-guest function posts it to Slack for the office + maintenance.
create or replace function lock_guest_keybox(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare st lock_stays; p properties; pa property_access;
begin
  select * into st from lock_stays where portal_token = p_token;
  if not found or st.status in ('cancelled','checked_out') or now() < st.starts_at - interval '1 hour' or now() >= st.ends_at then
    return jsonb_build_object('error', 'The emergency key is only available during your stay. Please call us.');
  end if;
  select * into p from properties where id = st.property_id;
  select * into pa from property_access where property_id = st.property_id;
  if pa.lockbox_code is null then
    select x.* into pa from property_access x where x.property_id in (select parent_id from lock_links_on where child_id = st.property_id)
       and x.lockbox_code is not null limit 1;
  end if;
  if pa.lockbox_code is null then return jsonb_build_object('error', 'No key box at this home. Please call us right away.'); end if;
  insert into lock_events (property_id, kind, who_kind, who_id, who) values (st.property_id, 'keybox_given', 'stay', st.res_id, st.guest);
  insert into lock_alerts (kind, property_id, ref, detail)
  values ('keybox_used', st.property_id, st.res_id,
          coalesce(st.guest, 'Guest') || ' was given the key box code at ' || to_char(now() at time zone 'America/Denver', 'Mon DD HH12:MI am')
          || '. Check the key is back after check-out (' || to_char(st.ends_at at time zone 'America/Denver', 'Mon DD HH12:MI am') || ').')
  on conflict do nothing;
  return jsonb_build_object('code', pa.lockbox_code, 'where', p.access_notes, 'home', p.code, 'guest', st.guest,
                            'checkout', to_char(st.ends_at at time zone 'America/Denver', 'Mon DD HH12:MI am'),
                            'slack', coalesce((select value from lock_settings where key = 'keybox_slack_channels'), 'C063B9NQJQY'));
end $$;
revoke all on function lock_guest_keybox(text) from public, anon, authenticated;

-- ---------------------------------------------------------------- guest portal (called only by the lock-guest Edge Function)
-- the doors a stay opens: its own home's guest doors, its children's (combo booking), and shared doors of its parents
create or replace function lock_guest_doors(p_res text) returns setof uuid language sql stable security definer set search_path = public as $$
  select k.id from lock_stays st join locks k on k.active and k.for_guests
    and (k.property_id = st.property_id
         or k.property_id in (select child_id from lock_links_on where parent_id = st.property_id)
         or (k.shared and k.property_id in (select parent_id from lock_links_on where child_id = st.property_id)))
  where st.res_id = p_res
$$;
revoke all on function lock_guest_doors(text) from public, anon, authenticated;

create or replace function lock_guest_view(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare st lock_stays; p properties; pa property_access; can_code boolean; can_key boolean;
begin
  select * into st from lock_stays where portal_token = p_token;
  if not found or st.status = 'cancelled' or now() > st.ends_at + interval '1 day' then return jsonb_build_object('error', 'not_found'); end if;
  select * into p from properties where id = st.property_id;
  select * into pa from property_access where property_id = st.property_id;
  can_code := now() >= st.starts_at - interval '7 days' and lock_stay_cleared(st);
  can_key  := now() >= st.starts_at and now() < st.ends_at and st.status not in ('checked_out') and lock_stay_cleared(st);
  return jsonb_build_object(
    'home', p.name, 'code_name', p.code, 'address', p.address, 'guest', split_part(coalesce(st.guest,''), ' ', 1),
    'starts_at', st.starts_at, 'ends_at', st.ends_at, 'status', st.status,
    'code', case when can_code then st.code end,
    'code_hold', case when not lock_stay_cleared(st) then 'agreement' end,
    'code_ready', exists (select 1 from lock_assign a where a.ref_kind = 'stay' and a.ref_id = st.res_id and a.state = 'verified'),
    'phone_key', can_key,
    'guide_url', (select guide_url from lock_homes where property_id = st.property_id),
    -- Wi-Fi from the home's access record (the crew keeps it current on the setup page); shown from the day before check-in
    -- building / gate and garage codes so guests can reach the door (this home's, else its parent building's)
    'building_code', case when now() >= st.starts_at - interval '1 day' then coalesce(pa.gate_code,
        (select x.gate_code from property_access x where x.property_id in (select parent_id from lock_links_on where child_id = st.property_id) and x.gate_code is not null limit 1)) end,
    'garage_code', case when now() >= st.starts_at - interval '1 day' then coalesce(pa.garage_code,
        (select x.garage_code from property_access x where x.property_id in (select parent_id from lock_links_on where child_id = st.property_id) and x.garage_code is not null limit 1)) end,
    'arrival_note', (select arrival_note from lock_homes where property_id = st.property_id),
    'extra_codes', case when now() >= st.starts_at - interval '1 day' then (select extra_codes from lock_homes where property_id = st.property_id) else '[]' end,
    'help', now() >= st.starts_at - interval '1 hour' and now() < st.ends_at and st.status not in ('cancelled','checked_out'),
    'wifi_name', case when now() >= st.starts_at - interval '1 day' then pa.wifi_name end,
    'wifi_password', case when now() >= st.starts_at - interval '1 day' then pa.wifi_password end,
    'doors', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'name', k.name) order by k.name)
                         from locks k join lock_hubs b on b.id = k.hub_id and b.active
                        where k.id in (select lock_guest_doors(st.res_id))), '[]'));
end $$;
revoke all on function lock_guest_view(text) from public, anon, authenticated;

create or replace function lock_guest_unlock(p_token text, p_lock uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare st lock_stays; k locks; cid bigint; recent int;
begin
  select * into st from lock_stays where portal_token = p_token;
  if not found or st.status in ('cancelled','checked_out') or now() < st.starts_at or now() >= st.ends_at or not lock_stay_cleared(st) then
    return jsonb_build_object('error', 'Your phone key works from check-in until check-out, once your rental agreement is signed.');
  end if;
  select * into k from locks where id = p_lock and id in (select lock_guest_doors(st.res_id));
  if not found then return jsonb_build_object('error', 'Door not found'); end if;
  select count(*) into recent from lock_commands where source = 'guest' and created_by = 'guest:' || st.res_id and created_at > now() - interval '10 minutes';
  if recent >= 10 then return jsonb_build_object('error', 'Too many tries. Use your door code, or wait a few minutes.'); end if;
  insert into lock_commands (hub_id, lock_id, kind, source, created_by, expires_at)
  values (k.hub_id, k.id, 'unlock', 'guest', 'guest:' || st.res_id, now() + interval '45 seconds') returning id into cid;
  insert into lock_events (property_id, hub_id, lock_id, kind, who_kind, who_id, who)
  values (st.property_id, k.hub_id, k.id, 'phone_key_tap', 'stay', st.res_id, st.guest);
  return jsonb_build_object('command', cid, 'hub_id', k.hub_id);
end $$;
revoke all on function lock_guest_unlock(text, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- "I'm at a home": nearest units to the installer's phone GPS
create or replace function lock_set_places(rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare r jsonb; n int := 0;
begin
  for r in select * from jsonb_array_elements(rows) loop
    insert into lock_places (property_id, lat, lng, address)
    select p.id, (r->>'lat')::float8, (r->>'lng')::float8, r->>'address' from properties p where p.code = r->>'unit'
    on conflict (property_id) do update set lat = excluded.lat, lng = excluded.lng, address = excluded.address, updated_at = now();
    if found then n := n + 1; end if;
  end loop;
  return n;
end $$;
revoke all on function lock_set_places(jsonb) from public, anon, authenticated;

create or replace function lock_nearby(p_lat float8, p_lng float8)
returns table (property_id text, code text, name text, address text, meters int, section text)
language sql stable security definer set search_path = public as $$
  select p.id, p.code, p.name, pl.address,
         round(6371000 * 2 * asin(sqrt(power(sin(radians(pl.lat - p_lat) / 2), 2)
               + cos(radians(p_lat)) * cos(radians(pl.lat)) * power(sin(radians(pl.lng - p_lng) / 2), 2))))::int as meters,
         h.section
    from lock_places pl join properties p on p.id = pl.property_id and p.active
    left join lock_homes h on h.property_id = p.id
   where lock_is_crew()
   order by 5 limit 6
$$;

-- crew can put the home they're standing at on our system
create or replace function lock_add_home_here(p_property text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not lock_is_crew() then raise exception 'Only crew'; end if;
  insert into lock_homes (property_id, section, added_by) values (p_property, 'ours', actor())
  on conflict (property_id) do update set section = 'ours', enabled = true;
  insert into lock_events (property_id, kind, who) values (p_property, 'home_added', actor());
end $$;

-- ---------------------------------------------------------------- install checklist (crew page Install tab)
create or replace function lock_install_step(p_property text, p_step text, p_done boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not lock_is_crew() then raise exception 'Only crew'; end if;
  if p_step = 'installed' then
    update lock_homes set installed_at = case when p_done then now() end where property_id = p_property;
    insert into lock_events (property_id, kind, who) values (p_property, 'home_installed', actor());
    return;
  end if;
  update lock_homes set install = case when p_done
      then install || jsonb_build_object(p_step, jsonb_build_object('by', coalesce((select name from allowed_users where lower(email) = lower(actor()) limit 1), actor()), 'at', now()))
      else install - p_step end
   where property_id = p_property;
end $$;

-- ---------------------------------------------------------------- "Sync with Track now" button (crew page) -> ThinkStation runs within a minute
create or replace function lock_request_sync() returns timestamptz
language plpgsql security definer set search_path = public as $$
begin
  if not lock_is_crew() then raise exception 'Only crew'; end if;
  insert into lock_settings (key, value) values ('sync_requested_at', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"+00:00"')), ('sync_requested_by', actor())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  return now();
end $$;

-- ---------------------------------------------------------------- what Track's reservation "Door Code" should say (locks_sync.py writes it)
-- Only for homes whose hub is installed (until then Brivo fills it), only once the agreement is back, until check-out.
create or replace view lock_track_doorcodes as
select distinct st.res_id, st.code
  from lock_stays st
 where st.status not in ('cancelled','checked_out') and st.ends_at > now() and lock_stay_cleared(st)
   and exists (select 1 from lock_hubs b join lock_homes h on h.property_id = b.property_id and h.section = 'ours' and h.enabled
                where b.active and b.claimed_at is not null
                  and (b.property_id = st.property_id or b.property_id in (select child_id from lock_links_on where parent_id = st.property_id)));
revoke all on lock_track_doorcodes from anon, authenticated;

-- ---------------------------------------------------------------- scorecard (our section; Lynx/Brivo rows come from locks_scorecard.py)
create or replace view lock_scorecard with (security_invoker = true) as
with st as (
  select s.*, (select min(a.verified_at) from lock_assign a join locks k on k.id = a.lock_id
                where a.ref_kind = 'stay' and a.ref_id = s.res_id and k.for_guests) as first_verified
    from lock_stays s where s.status <> 'cancelled' and s.starts_at < now() and s.starts_at > now() - interval '60 days')
select
  (select count(*) from lock_homes where section = 'ours') as homes,
  count(*) as arrivals_60d,
  count(*) filter (where first_verified is not null and first_verified <= starts_at) as code_ready_on_time,
  round(100.0 * count(*) filter (where first_verified is not null and first_verified <= starts_at) / nullif(count(*), 0), 1) as pct_ready_on_time,
  (select count(*) from lock_alerts where kind = 'hub_offline' and opened_at > now() - interval '60 days') as hub_offline_alerts_60d,
  (select round(sum(extract(epoch from coalesce(closed_at, now()) - opened_at)) / 3600.0, 1) from lock_alerts
    where kind = 'hub_offline' and opened_at > now() - interval '60 days') as hub_offline_hours_60d,
  (select count(*) from lock_alerts where kind = 'lock_offline' and opened_at > now() - interval '60 days') as lock_offline_alerts_60d,
  (select count(*) from lock_events where kind = 'unlock_code' and at > now() - interval '60 days') as code_unlocks_60d,
  (select count(*) from lock_events where kind = 'phone_key_tap' and at > now() - interval '60 days') as phone_key_taps_60d
from st;
grant select on lock_scorecard to authenticated;

-- admin switch for automatic updates (on / off) and which home's hub tries new versions first
create or replace function lock_update_settings(p_auto boolean default null, p_canary text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if app_role() is distinct from 'admin' then raise exception 'Only admins'; end if;
  if p_auto is not null then
    insert into lock_settings (key, value) values ('auto_update', case when p_auto then 'on' else 'off' end)
    on conflict (key) do update set value = excluded.value, updated_at = now();
  end if;
  if p_canary is not null then
    if not exists (select 1 from properties where code = p_canary) then raise exception 'No home %', p_canary; end if;
    insert into lock_settings (key, value) values ('update_canary', p_canary) on conflict (key) do update set value = excluded.value, updated_at = now();
  end if;
end $$;
revoke all on function lock_update_settings(boolean, text) from public, anon;
grant execute on function lock_update_settings(boolean, text) to authenticated;

-- ---------------------------------------------------------------- install step 9 by itself: switch the Track unit off Brivo
-- Due when: hub added, every guest door paired, every guest door passed its test code, and the installer ticked
-- "Take the locks off Brivo". locks_sync.py then clears the unit's lock system in Track (PATCH /api/pms/units/{id})
-- and calls lock_track_switched().
create or replace view lock_track_switch_due as
select h.property_id, h.track_unit_id, p.code
  from lock_homes h join properties p on p.id = h.property_id
 where h.section = 'ours' and h.enabled and h.track_unit_id is not null
   and not (h.install ? 'track') and (h.install ? 'brivo')
   and exists (select 1 from lock_hubs b where b.property_id = h.property_id and b.active and b.claimed_at is not null)
   and exists (select 1 from locks k where k.property_id = h.property_id and k.active and k.for_guests)
   and not exists (select 1 from locks k where k.property_id = h.property_id and k.active and k.for_guests
                     and not exists (select 1 from lock_assign a where a.lock_id = k.id and a.ref_kind = 'test' and a.verified_at is not null));
revoke all on lock_track_switch_due from public, anon, authenticated;

create or replace function lock_track_switched(p_property text, p_ok boolean, p_detail text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_ok then
    update lock_homes set install = install || jsonb_build_object('track', jsonb_build_object('by', 'System (automatic)', 'at', now()))
     where property_id = p_property;
  end if;
  insert into lock_events (property_id, kind, who, detail)
  values (p_property, case when p_ok then 'track_switched' else 'track_switch_failed' end, 'system', jsonb_build_object('detail', p_detail));
end $$;
revoke all on function lock_track_switched(text, boolean, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- set up a new home on our system (Install tab)
-- p_new = brand-new home that never had Brivo: the "Take the locks off Brivo" step is ticked for them.
create or replace function lock_setup_home(p_property text, p_new boolean default false) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not lock_is_crew() then raise exception 'Only crew'; end if;
  if not exists (select 1 from properties where id = p_property) then raise exception 'Home not found'; end if;
  insert into lock_homes (property_id, section, added_by) values (p_property, 'ours', actor())
  on conflict (property_id) do update set section = 'ours', enabled = true;
  if p_new then
    update lock_homes set install = install || jsonb_build_object('brivo', jsonb_build_object('by', 'New home - never on Brivo', 'at', now()))
     where property_id = p_property and not (install ? 'brivo');
  end if;
  insert into lock_events (property_id, kind, who, detail) values (p_property, 'home_added', actor(), jsonb_build_object('new_home', p_new));
end $$;

-- Brivo property master codes (from the Brivo master code report) for the crew page, per home on our system
create or replace function lock_brivo_masters() returns table (property_id text, code text, door text, master_code text)
language sql stable security definer set search_path = public as $$
  select p.id, p.code, s.door, s.master_code from lock_master_staging s join properties p on p.code = s.unit
   where lock_is_crew() and p.id in (select h.property_id from lock_homes h where h.section = 'ours')
$$;

-- new kinds on an existing table (the check above only applies to brand-new tables)
alter table lock_staff_codes drop constraint if exists lock_staff_codes_kind_check;
alter table lock_staff_codes add constraint lock_staff_codes_kind_check check (kind in ('employee','vendor','backup','owner','hoa','county','housekeeping'));

create or replace function lock_tv_update(p_tv uuid, p_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not lock_is_crew() then raise exception 'Only crew'; end if;
  update lock_tvs set name = coalesce(nullif(p_name,''), name) where id = p_tv;
end $$;

-- ---------------------------------------------------------------- brand-new homes: GPS -> neighborhood guess, then create the home
-- Nearest homes we already know (Track GPS) decide the neighborhood: the area most of the closest homes share (within ~1 km).
create or replace function lock_area_guess(p_lat float8, p_lng float8) returns jsonb
language sql stable security definer set search_path = public as $$
  with near as (
    select p.area, p.code, p.name,
           round(6371000 * 2 * asin(sqrt(power(sin(radians(pl.lat - p_lat) / 2), 2)
                 + cos(radians(p_lat)) * cos(radians(pl.lat)) * power(sin(radians(pl.lng - p_lng) / 2), 2))))::int as m
      from lock_places pl join properties p on p.id = pl.property_id
     where lock_is_crew() and p.area is not null and p.area <> 'Moose'
     order by 4 limit 7)
  select jsonb_build_object(
    'area', (select area from near where m < 1000 group by area order by count(*) desc, min(m) limit 1),
    'meters', (select min(m) from near),
    'near', coalesce((select jsonb_agg(jsonb_build_object('code', code, 'area', area, 'meters', m) order by m) from near), '[]'))
$$;

-- Create a home that isn't in Track yet. r = {code, name, address, area, kind, lat, lng}. Same id style as the desk (lower-case code, dashes).
create or replace function lock_create_home(r jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare pid text; c text := upper(trim(coalesce(r->>'code','')));
begin
  if not lock_is_crew() then raise exception 'Only crew'; end if;
  if c !~ '^[A-Z0-9][A-Z0-9 -]{1,20}$' then raise exception 'Home code looks wrong (example: RJ 13536)'; end if;
  select id into pid from properties where upper(code) = c;
  if pid is null then
    pid := lower(regexp_replace(c, '[^A-Za-z0-9]+', '-', 'g'));
    if exists (select 1 from properties where id = pid) then pid := pid || '-' || substr(md5(random()::text), 1, 4); end if;
    insert into properties (id, code, name, address, area, kind, active)
    values (pid, c, coalesce(nullif(trim(r->>'name'),''), c), nullif(trim(r->>'address'),''), nullif(upper(trim(r->>'area')),''),
            coalesce(nullif(r->>'kind',''), 'str'), true);
  end if;
  if (r->>'lat') is not null and (r->>'lng') is not null then
    insert into lock_places (property_id, lat, lng, address) values (pid, (r->>'lat')::float8, (r->>'lng')::float8, nullif(trim(r->>'address'),''))
    on conflict (property_id) do nothing;
  end if;
  perform lock_setup_home(pid, true);
  return pid;
end $$;

-- Is the tech's phone on the same internet connection as this home's hub (or a new hub waiting to be added)?
create or replace function lock_net_check(p_property text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'hub', (select b.public_ip is not null from lock_hubs b where b.property_id = p_property and b.active and b.claimed_at is not null order by b.last_seen desc nulls last limit 1),
    'same_as_hub', exists (select 1 from lock_hubs b where b.property_id = p_property and b.active and b.public_ip = lock_caller_ip()),
    'new_hub_here', (select count(*) from lock_hubs b where b.active and b.claimed_at is null and b.last_seen > now() - interval '30 minutes' and b.public_ip = lock_caller_ip()),
    'other_home', (select p.code from lock_hubs b join properties p on p.id = b.property_id
                    where b.active and b.claimed_at is not null and b.property_id <> p_property and b.public_ip = lock_caller_ip() limit 1))
  where lock_is_crew()
$$;
