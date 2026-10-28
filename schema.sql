-- Moose Management - Maintenance  |  schema.sql
-- Run once (it is safe to re-run) in the "Moose Management - Maintenance" Supabase project.
-- Built in: append-only history, no deletes anywhere, RLS by role,
-- costs admin-only (crew never sees pay/cost), door/lockbox codes + Wi-Fi in their own table (admin + tech only).

create extension if not exists pgcrypto;
create extension if not exists pg_cron;

-- ---------- people / access ----------
create table if not exists allowed_users (
  id            uuid primary key default gen_random_uuid(),
  email         text,                        -- sign-in email (null = can be assigned, can't sign in yet)
  alt_email     text,                        -- second sign-in email for the same person
  name          text not null unique,
  role          text not null default 'viewer' check (role in ('admin','tech','viewer')),
  bw_person_id  bigint unique,               -- Breezeway person id (assignment sync)
  bw_name       text,                        -- name as Breezeway shows it ("Dave Buddy")
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);
create unique index if not exists allowed_users_email_lower on allowed_users (lower(email));
alter table allowed_users add column if not exists alt_email text;

create or replace function app_role() returns text
language sql stable security definer set search_path = public as $$
  select role from allowed_users where active and lower(auth.jwt()->>'email') in (lower(email), lower(alt_email))
$$;
create or replace function actor() returns text
language sql stable as $$
  select coalesce(nullif(current_setting('app.actor', true),''), auth.jwt()->>'email', 'system')
$$;

-- Only allowed emails can get an account (magic-link sign-up is refused otherwise).
create or replace function public.only_allowed_signups() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.allowed_users where active and lower(new.email) in (lower(email), lower(alt_email))) then
    raise exception 'This email is not on the Moose maintenance list.';
  end if;
  return new;
end $$;
drop trigger if exists only_allowed_signups on auth.users;
create trigger only_allowed_signups before insert on auth.users
  for each row execute function public.only_allowed_signups();

-- ---------- core tables ----------
create table if not exists properties (
  id                  text primary key,          -- slug, e.g. 'bhv-5482a'
  code                text unique not null,      -- desk home code, e.g. 'BHV 5482A'
  name                text not null,             -- Breezeway name
  address             text,
  area                text,                      -- community: BHV, BHL, PL, ...
  owner               text,
  access_notes        text,                      -- where the lockbox / key is (codes live in property_access)
  bw_home_id          bigint unique,
  kind                text not null default 'str' check (kind in ('str','second_home','lease','company')),
  beds                int,
  next_guest_checkin  timestamptz,               -- maint_sync fills from Track reservations
  active              boolean not null default true,
  created_at          timestamptz not null default now()
);
alter table properties drop constraint if exists access_notes_no_codes;

-- Codes + Wi-Fi: admin and tech only (viewers never see them). Every change is logged.
create table if not exists property_access (
  property_id     text primary key references properties(id),
  lockbox_code    text,
  door_code       text,
  garage_code     text,
  gate_code       text,
  owner_closet    text,
  wifi_name       text,
  wifi_password   text,
  notes           text,
  updated_by      text not null default actor(),
  updated_at      timestamptz not null default now()
);
create table if not exists property_access_log (
  id           bigint generated always as identity primary key,
  property_id  text not null,
  at           timestamptz not null default now(),
  by_email     text not null default actor(),
  fields       text[] not null           -- which fields changed (values are not copied here)
);

create table if not exists assets (
  id            bigint generated always as identity primary key,
  property_id   text not null references properties(id),
  type          text not null,                   -- HVAC, water heater, hot tub, appliance, ...
  make          text, model text, serial text,
  install_date  date,
  warranty_end  date,
  notes         text,
  legacy_id     text unique,
  created_at    timestamptz not null default now()
);

create table if not exists vendors (
  id          bigint generated always as identity primary key,
  name        text not null,
  trade       text,
  phone       text,
  email       text,
  notes       text,
  preferred   boolean not null default false,   -- "USE FIRST" company-wide
  active      boolean not null default true,    -- removed = inactive, never deleted
  legacy_id   text unique,
  created_at  timestamptz not null default now()
);

create table if not exists work_orders (
  id                  bigint generated always as identity primary key,
  property_id         text not null references properties(id),
  asset_id            bigint references assets(id),
  title               text not null,
  description         text,
  priority            text not null default 'normal' check (priority in ('urgent','high','normal','low')),
  status              text not null default 'new'
                        check (status in ('new','assigned','in_progress','waiting_parts','done','cancelled')),
  source              text not null default 'staff'
                        check (source in ('guest','inspection','owner','preventive','staff')),
  origin              text not null default 'site'
                        check (origin in ('site','breezeway','slack','asana','freshdesk','desk')),
  reported_by         text,
  assigned_to         uuid references allowed_users(id),
  vendor_id           bigint references vendors(id),
  due_date            date,
  guest_checkin_next  timestamptz,
  pm_id               bigint,
  push_to_bw          boolean not null default true,       -- false for trash (Asana) and unassigned reminders
  legacy_id           text unique,                       -- old desk id: 'bw-171529128', 'slack-C0..', 'dp-..'
  bw_task_id          bigint unique,                     -- its Breezeway task
  bw_sync_error       text,
  created_by          text not null default actor(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  closed_at           timestamptz
);
create index if not exists wo_open on work_orders (status) where status not in ('done','cancelled');
create index if not exists wo_prop on work_orders (property_id);

create table if not exists work_order_events (
  id             bigint generated always as identity primary key,
  work_order_id  bigint not null references work_orders(id),
  at             timestamptz not null default now(),
  by_email       text not null default actor(),
  kind           text not null check (kind in ('created','import','status','assign','priority','due','edit','note','photo','cost','sync')),
  from_value     text,
  to_value       text,
  note           text
);
create index if not exists woe_wo on work_order_events (work_order_id, at);

create table if not exists photos (
  id             bigint generated always as identity primary key,
  work_order_id  bigint not null references work_orders(id),
  storage_path   text not null unique,              -- bucket wo-photos (or 'bw:<url>' for imported Breezeway photos)
  phase          text not null default 'before' check (phase in ('before','after','receipt','other')),
  uploaded_by    text not null default actor(),
  captured_at    timestamptz not null default now()
);

-- Costs sit apart from work_orders so the crew never sees them (admin-only RLS).
create table if not exists work_order_costs (
  id                bigint generated always as identity primary key,
  work_order_id     bigint references work_orders(id),     -- null = not tied to a job (fuel, shop stock)
  property_id       text references properties(id),
  kind              text not null check (kind in ('parts','labor','fee','vendor','fuel')),
  amount            numeric(10,2) not null,
  description       text,
  receipt_photo_id  bigint references photos(id),
  invoice_url       text,                                   -- vendor invoice or Breezeway receipt link
  time_source_url   text,                                   -- labor: Breezeway task clock / Hubstaff day
  vendor_name       text,
  spent_on          date,
  legacy_id         text unique,
  created_by        text not null default actor(),
  created_at        timestamptz not null default now()
);

create table if not exists pm_schedule (
  id              bigint generated always as identity primary key,
  property_id     text references properties(id),
  property_ids    text[],                                   -- one task across many homes
  asset_id        bigint references assets(id),
  task            text not null,
  frequency_days  int check (frequency_days > 0),           -- null = once a year at next_due
  push_to         text not null default 'reminder' check (push_to in ('breezeway','asana','reminder')),
                                                            -- breezeway: its work orders get a Breezeway task
                                                            -- asana: trash (lives in Asana, never Breezeway)
                                                            -- reminder: on the site only until someone assigns it
  season_from     text check (season_from ~ '^\d\d-\d\d$'),     -- 'MM-DD': only comes due inside this window
  season_to       text check (season_to   ~ '^\d\d-\d\d$'),
  last_done       date,
  next_due        date,
  assigned_to     uuid references allowed_users(id),
  active          boolean not null default true,
  draft           boolean not null default false,           -- drafts never make work orders
  notes           text,
  legacy_id       text unique,
  created_at      timestamptz not null default now()
);

-- Notes/edits from the old desk waiting for maint_sync to import their job.
create table if not exists import_staging (
  id          bigint generated always as identity primary key,
  legacy_id   text not null,
  kind        text not null,       -- note | status | bill | cost
  at          timestamptz not null,
  by_email    text,
  payload     jsonb not null,
  applied_at  timestamptz,
  unique (legacy_id, kind, at)
);

-- ---------- history: append-only, nothing deleted ----------
create or replace function forbid_change() returns trigger language plpgsql as $$
begin raise exception '% is append-only (no % allowed)', tg_table_name, lower(tg_op); end $$;
create or replace function forbid_delete() returns trigger language plpgsql as $$
begin raise exception 'Nothing is deleted in % - use a status or the active flag', tg_table_name; end $$;

drop trigger if exists woe_no_update on work_order_events;
create trigger woe_no_update before update or delete on work_order_events for each row execute function forbid_change();
drop trigger if exists woe_no_truncate on work_order_events;
create trigger woe_no_truncate before truncate on work_order_events for each statement execute function forbid_change();
drop trigger if exists pal_no_change on property_access_log;
create trigger pal_no_change before update or delete on property_access_log for each row execute function forbid_change();

create or replace function access_log() returns trigger language plpgsql security definer set search_path = public as $$
declare f text[] := '{}';
begin
  new.updated_at := now(); new.updated_by := actor();
  if tg_op = 'INSERT' then f := array['created'];
  else
    if new.lockbox_code  is distinct from old.lockbox_code  then f := f || 'lockbox_code'::text; end if;
    if new.door_code     is distinct from old.door_code     then f := f || 'door_code'::text; end if;
    if new.garage_code   is distinct from old.garage_code   then f := f || 'garage_code'::text; end if;
    if new.gate_code     is distinct from old.gate_code     then f := f || 'gate_code'::text; end if;
    if new.owner_closet  is distinct from old.owner_closet  then f := f || 'owner_closet'::text; end if;
    if new.wifi_name     is distinct from old.wifi_name     then f := f || 'wifi_name'::text; end if;
    if new.wifi_password is distinct from old.wifi_password then f := f || 'wifi_password'::text; end if;
    if new.notes         is distinct from old.notes         then f := f || 'notes'::text; end if;
  end if;
  if array_length(f,1) > 0 then insert into property_access_log (property_id, fields) values (new.property_id, f); end if;
  return new;
end $$;
drop trigger if exists access_log on property_access;
create trigger access_log before insert or update on property_access for each row execute function access_log();

do $$ declare t text; begin
  foreach t in array array['allowed_users','properties','assets','vendors','work_orders','photos','work_order_costs','pm_schedule','import_staging','property_access'] loop
    execute format('drop trigger if exists %1$s_no_delete on %1$s', t);
    execute format('create trigger %1$s_no_delete before delete on %1$s for each row execute function forbid_delete()', t);
    execute format('drop trigger if exists %1$s_no_truncate on %1$s', t);
    execute format('create trigger %1$s_no_truncate before truncate on %1$s for each statement execute function forbid_delete()', t);
  end loop;
end $$;

-- Every work-order change writes an event row.
create or replace function wo_log() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text := actor(); is_import boolean := coalesce(current_setting('app.import', true),'') = 'on';
begin
  if tg_op = 'INSERT' then
    insert into work_order_events (work_order_id, at, by_email, kind, to_value, note)
    values (new.id, case when is_import then new.created_at else now() end, who,
            case when is_import then 'import' else 'created' end, new.status,
            case when is_import then 'Imported from the old Maintenance Desk (' || new.origin || coalesce(' ' || new.legacy_id, '') || ')' end);
    return new;
  end if;
  if new.status is distinct from old.status then
    insert into work_order_events (work_order_id,by_email,kind,from_value,to_value) values (new.id,who,'status',old.status,new.status); end if;
  if new.assigned_to is distinct from old.assigned_to then
    insert into work_order_events (work_order_id,by_email,kind,from_value,to_value)
    values (new.id,who,'assign',(select name from allowed_users where id=old.assigned_to),(select name from allowed_users where id=new.assigned_to)); end if;
  if new.priority is distinct from old.priority then
    insert into work_order_events (work_order_id,by_email,kind,from_value,to_value) values (new.id,who,'priority',old.priority,new.priority); end if;
  if new.due_date is distinct from old.due_date then
    insert into work_order_events (work_order_id,by_email,kind,from_value,to_value) values (new.id,who,'due',old.due_date::text,new.due_date::text); end if;
  if new.title is distinct from old.title or new.description is distinct from old.description
     or new.property_id is distinct from old.property_id or new.asset_id is distinct from old.asset_id
     or new.vendor_id is distinct from old.vendor_id then
    insert into work_order_events (work_order_id,by_email,kind,from_value,to_value)
    values (new.id,who,'edit',left(old.title||' | '||coalesce(old.description,''),500),left(new.title||' | '||coalesce(new.description,''),500));
  end if;
  if new.bw_task_id is distinct from old.bw_task_id and new.bw_task_id is not null then
    insert into work_order_events (work_order_id,by_email,kind,to_value,note) values (new.id,who,'sync',new.bw_task_id::text,'Linked to Breezeway task');
  end if;
  return new;
end $$;

create or replace function wo_before() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if new.created_at is distinct from old.created_at and coalesce(current_setting('app.import',true),'') <> 'on' then
      new.created_at := old.created_at;      -- original dates are kept
    end if;
    new.updated_at := now();
  end if;
  if new.status = 'done' and new.closed_at is null then new.closed_at := now(); end if;
  if new.status not in ('done','cancelled') then new.closed_at := null; end if;
  if new.assigned_to is not null and new.status = 'new' then new.status := 'assigned'; end if;
  if new.guest_checkin_next is null then
    select next_guest_checkin into new.guest_checkin_next from properties where id = new.property_id;
  end if;
  return new;
end $$;

drop trigger if exists wo_before on work_orders;
create trigger wo_before before insert or update on work_orders for each row execute function wo_before();
drop trigger if exists wo_log on work_orders;
create trigger wo_log after insert or update on work_orders for each row execute function wo_log();

create or replace function photo_log() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into work_order_events (work_order_id,at,by_email,kind,to_value)
  values (new.work_order_id, case when coalesce(current_setting('app.import',true),'')='on' then new.captured_at else now() end,
          actor(),'photo',new.phase||' photo');
  return new;
end $$;
drop trigger if exists photo_log on photos;
create trigger photo_log after insert on photos for each row execute function photo_log();

create or replace function cost_log() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.work_order_id is not null then   -- the crew sees that a cost changed, never the amount
    insert into work_order_events (work_order_id,at,by_email,kind,note)
    values (new.work_order_id,now(),actor(),'cost', case when tg_op='INSERT' then 'Cost added' else 'Cost updated' end);
  end if;
  return new;
end $$;
drop trigger if exists cost_log on work_order_costs;
create trigger cost_log after insert or update on work_order_costs for each row execute function cost_log();

-- PM: finishing its work order moves the schedule forward.
create or replace function pm_done() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.pm_id is not null and new.status = 'done' and old.status is distinct from 'done' then
    update pm_schedule set last_done = current_date,
      next_due = case when frequency_days is not null then current_date + frequency_days else coalesce(next_due, current_date) + 365 end
    where id = new.pm_id
      and not exists (select 1 from work_orders w where w.pm_id = new.pm_id and w.id <> new.id and w.status not in ('done','cancelled'));
  end if;
  return new;
end $$;
drop trigger if exists pm_done on work_orders;
create trigger pm_done after update on work_orders for each row execute function pm_done();

-- ---------- views ----------
create or replace function user_name(uid uuid) returns text
language sql stable security definer set search_path = public as $$ select name from allowed_users where id = uid $$;

create or replace view board with (security_invoker = true) as
select w.id, w.property_id, p.code as property_code, p.area, w.title, w.priority, w.status, w.source, w.origin,
       w.assigned_to, user_name(w.assigned_to) as assigned_name, w.due_date, w.created_at, w.updated_at, w.bw_task_id, w.bw_sync_error,
       coalesce(p.next_guest_checkin, w.guest_checkin_next) as guest_checkin_next,
       (w.status not in ('done','cancelled')
        and coalesce(p.next_guest_checkin, w.guest_checkin_next) between now() and now() + interval '48 hours') as guest_flag,
       (select count(*) from photos ph where ph.work_order_id = w.id) as photo_count
from work_orders w
join properties p on p.id = w.property_id;

create or replace view cost_lines with (security_invoker = true) as
select c.*, (c.receipt_photo_id is not null or nullif(c.invoice_url,'') is not null
             or (c.kind = 'labor' and nullif(c.time_source_url,'') is not null)) as verified
from work_order_costs c;

create or replace view property_spend with (security_invoker = true) as
select coalesce(c.property_id, w.property_id) as property_id,
       sum(c.amount) as total, coalesce(sum(c.amount) filter (where not c.verified),0) as unverified
from cost_lines c left join work_orders w on w.id = c.work_order_id
group by 1;

-- names for the assign list (no emails); readable by any allowed user
create or replace function people() returns table (id uuid, name text, role text)
language sql stable security definer set search_path = public as $$
  select id, name, role from allowed_users where active and app_role() is not null order by name
$$;

-- ---------- RLS ----------
alter table allowed_users     enable row level security;
alter table properties        enable row level security;
alter table assets            enable row level security;
alter table vendors           enable row level security;
alter table work_orders       enable row level security;
alter table work_order_events enable row level security;
alter table photos            enable row level security;
alter table work_order_costs  enable row level security;
alter table pm_schedule       enable row level security;
alter table import_staging    enable row level security;   -- service role only
alter table property_access   enable row level security;
alter table property_access_log enable row level security;
drop policy if exists access_crew on property_access;
create policy access_crew on property_access for select to authenticated using (app_role() in ('admin','tech'));
drop policy if exists access_crew_ins on property_access;
create policy access_crew_ins on property_access for insert to authenticated with check (app_role() in ('admin','tech'));
drop policy if exists access_crew_upd on property_access;
create policy access_crew_upd on property_access for update to authenticated using (app_role() in ('admin','tech')) with check (app_role() in ('admin','tech'));
drop policy if exists access_log_admin on property_access_log;
create policy access_log_admin on property_access_log for select to authenticated using (app_role() = 'admin');

do $$ declare t text; begin
  foreach t in array array['properties','assets','vendors','work_orders','work_order_events','photos','pm_schedule'] loop
    execute format('drop policy if exists %1$s_read on %1$s', t);
    execute format('create policy %1$s_read on %1$s for select to authenticated using (app_role() is not null)', t);
  end loop;
  foreach t in array array['properties','vendors','pm_schedule'] loop
    execute format('drop policy if exists %1$s_admin_ins on %1$s', t);
    execute format('create policy %1$s_admin_ins on %1$s for insert to authenticated with check (app_role() = ''admin'')', t);
    execute format('drop policy if exists %1$s_admin_upd on %1$s', t);
    execute format('create policy %1$s_admin_upd on %1$s for update to authenticated using (app_role() = ''admin'') with check (app_role() = ''admin'')', t);
  end loop;
end $$;

drop policy if exists me_read on allowed_users;
create policy me_read on allowed_users for select to authenticated
  using (lower(auth.jwt()->>'email') in (lower(email), lower(alt_email)) or app_role() = 'admin');
drop policy if exists users_admin_ins on allowed_users;
create policy users_admin_ins on allowed_users for insert to authenticated with check (app_role() = 'admin');
drop policy if exists users_admin_upd on allowed_users;
create policy users_admin_upd on allowed_users for update to authenticated using (app_role() = 'admin') with check (app_role() = 'admin');

drop policy if exists wo_ins on work_orders;
create policy wo_ins on work_orders for insert to authenticated with check (app_role() in ('admin','tech'));
drop policy if exists wo_upd on work_orders;
create policy wo_upd on work_orders for update to authenticated
  using (app_role() in ('admin','tech')) with check (app_role() in ('admin','tech'));

drop policy if exists woe_ins on work_order_events;
create policy woe_ins on work_order_events for insert to authenticated
  with check (app_role() in ('admin','tech') and lower(by_email) = lower(auth.jwt()->>'email') and kind = 'note');

drop policy if exists ph_ins on photos;
create policy ph_ins on photos for insert to authenticated
  with check (app_role() in ('admin','tech') and lower(uploaded_by) = lower(auth.jwt()->>'email'));

drop policy if exists assets_ins on assets;
create policy assets_ins on assets for insert to authenticated with check (app_role() in ('admin','tech'));
drop policy if exists assets_upd on assets;
create policy assets_upd on assets for update to authenticated
  using (app_role() in ('admin','tech')) with check (app_role() in ('admin','tech'));

drop policy if exists costs_read on work_order_costs;
create policy costs_read on work_order_costs for select to authenticated using (app_role() = 'admin');
drop policy if exists costs_ins on work_order_costs;
create policy costs_ins on work_order_costs for insert to authenticated with check (app_role() = 'admin');
drop policy if exists costs_upd on work_order_costs;
create policy costs_upd on work_order_costs for update to authenticated using (app_role() = 'admin') with check (app_role() = 'admin');

grant select on board, cost_lines, property_spend to authenticated;
grant execute on function people() to authenticated;
grant execute on function user_name(uuid) to authenticated;

-- ---------- storage: private photo bucket, no deletes ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wo-photos','wo-photos', false, 10485760, array['image/jpeg','image/png','image/webp','image/heic'])
on conflict (id) do nothing;
drop policy if exists wo_photos_read on storage.objects;
create policy wo_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'wo-photos' and public.app_role() is not null);
drop policy if exists wo_photos_ins on storage.objects;
create policy wo_photos_ins on storage.objects for insert to authenticated
  with check (bucket_id = 'wo-photos' and public.app_role() in ('admin','tech'));
-- no update/delete policies for this bucket

-- ---------- PM: daily job makes a work order when one comes due ----------
create or replace function pm_generate() returns int
language plpgsql security definer set search_path = public as $$
declare r record; pid text; n int := 0;
begin
  perform set_config('app.actor','pm-schedule',true);
  for r in select * from pm_schedule where active and not draft and push_to <> 'asana' and next_due is not null and next_due <= current_date + 7 loop
    foreach pid in array coalesce(r.property_ids, array[r.property_id]) loop
      continue when pid is null;
      continue when r.season_from is not null and r.season_to is not null
        and not (to_char(current_date,'MM-DD') between r.season_from and r.season_to);
      continue when exists (select 1 from work_orders where pm_id = r.id and property_id = pid and status not in ('done','cancelled'));
      continue when exists (select 1 from work_orders where pm_id = r.id and property_id = pid and created_at::date >= r.next_due - 7);
      insert into work_orders (property_id, asset_id, title, description, priority, status, source, origin, assigned_to, due_date, pm_id, push_to_bw)
      values (pid, r.asset_id, r.task, r.notes, 'normal', 'new', 'preventive', 'site', r.assigned_to, r.next_due, r.id, r.push_to <> 'asana');
      n := n + 1;
    end loop;
  end loop;
  return n;
end $$;

do $$ begin perform cron.unschedule('pm-daily'); exception when others then null; end $$;
select cron.schedule('pm-daily', '0 12 * * *', $$select public.pm_generate()$$);   -- 6am MDT / 5am MST

-- ---------- sync functions (service role only; called by maint_sync.py on the ThinkStation) ----------
create or replace function sync_jobs(rows jsonb, p_import boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb; w work_orders; pid text; uid uuid; n_new int := 0; n_closed int := 0; n_linked int := 0; cr timestamptz;
begin
  for r in select * from jsonb_array_elements(rows) loop
    select * into w from work_orders where legacy_id = r->>'legacy_id'
       or (r->>'bw_task_id' is not null and bw_task_id = (r->>'bw_task_id')::bigint) limit 1;
    if not found then
      select id into pid from properties where lower(code) = lower(r->>'property_code') or replace(lower(code),' ','') = replace(lower(coalesce(r->>'property_code','')),' ','') limit 1;
      select id into uid from allowed_users where r->>'assignee' is not null and (lower(name) = lower(r->>'assignee') or lower(bw_name) = lower(r->>'assignee') or lower(split_part(name,' ',1)) = lower(r->>'assignee')) limit 1;
      cr := coalesce((r->>'created_at')::timestamptz, now());
      perform set_config('app.actor', coalesce(r->>'origin','sync'), true);
      perform set_config('app.import', case when p_import then 'on' else '' end, true);
      insert into work_orders (property_id, title, description, priority, status, source, origin, reported_by, assigned_to,
                               due_date, legacy_id, bw_task_id, created_at, closed_at, created_by)
      values (coalesce(pid,'moose-company'), left(coalesce(nullif(r->>'title',''),'(no title)'),300),
              concat_ws(E'\n', nullif(r->>'description',''), case when pid is null and r->>'property_code' is not null then 'Home: '||(r->>'property_code') end, nullif(r->>'link','')),
              coalesce(r->>'priority','normal'),
              case when r->>'status' = 'assigned' and uid is null then 'new' else coalesce(r->>'status','new') end,
              coalesce(r->>'source','staff'), coalesce(r->>'origin','breezeway'),
              r->>'reported_by', uid, (r->>'due_date')::date, r->>'legacy_id', (r->>'bw_task_id')::bigint, cr,
              case when r->>'status' in ('done','cancelled') then coalesce((r->>'closed_at')::timestamptz, cr) end,
              coalesce(r->>'origin','sync'));
      n_new := n_new + 1;
    else
      perform set_config('app.import', '', true);
      if w.bw_task_id is null and r->>'bw_task_id' is not null then
        perform set_config('app.actor', 'breezeway', true);
        update work_orders set bw_task_id = (r->>'bw_task_id')::bigint, bw_sync_error = null where id = w.id;
        n_linked := n_linked + 1;
      end if;
      -- done in the source -> done here (never reopens; a person reopens on the site)
      if r->>'status' = 'done' and w.status not in ('done','cancelled') then
        perform set_config('app.actor', coalesce(r->>'closed_by', r->>'origin', 'sync'), true);
        update work_orders set status = 'done', closed_at = coalesce((r->>'closed_at')::timestamptz, now()) where id = w.id;
        n_closed := n_closed + 1;
      end if;
    end if;
  end loop;
  perform set_config('app.import', '', true);
  return jsonb_build_object('new', n_new, 'closed', n_closed, 'linked', n_linked);
end $$;

create or replace function apply_staging() returns int
language plpgsql security definer set search_path = public as $$
declare s record; w work_orders; n int := 0;
begin
  for s in select * from import_staging where applied_at is null order by at loop
    select * into w from work_orders where legacy_id = s.legacy_id;
    continue when not found;
    perform set_config('app.actor', coalesce(s.by_email,'import'), true);
    if s.kind = 'note' then
      insert into work_order_events (work_order_id, at, by_email, kind, note) values (w.id, s.at, coalesce(s.by_email,'import'), 'note', s.payload->>'text');
    elsif s.kind = 'status' and s.payload->>'status' = 'done' and w.status not in ('done','cancelled') then
      update work_orders set status = 'done', closed_at = s.at where id = w.id;
    elsif s.kind = 'bill' then
      insert into work_order_events (work_order_id, at, by_email, kind, note) values (w.id, s.at, coalesce(s.by_email,'import'), 'cost',
        'Old desk billing: bill to ' || coalesce(s.payload->>'billTo','?') || case when (s.payload->>'sent')::boolean then ', pushed to Breezeway' when (s.payload->>'ready')::boolean then ', ready for Breezeway' else '' end);
      insert into work_order_costs (work_order_id, property_id, kind, amount, description, time_source_url, spent_on, legacy_id, created_by)
      values (w.id, w.property_id, 'labor',
        case when s.payload->>'billTo' = 'courtesy' then 1 else coalesce((s.payload->>'hours')::numeric,0) * coalesce((s.payload->>'rate')::numeric,0) end,
        case when s.payload->>'billTo' = 'courtesy' then 'Labor - courtesy, no charge' else coalesce(s.payload->>'hours','?')||' h x $'||coalesce(s.payload->>'rate','?') end,
        case when w.bw_task_id is not null then 'https://app.breezeway.io/task/'||w.bw_task_id end, s.at::date, 'bill-'||s.legacy_id, 'import')
      on conflict (legacy_id) do nothing;
    elsif s.kind = 'cost' then
      insert into work_order_costs (work_order_id, property_id, kind, amount, description, invoice_url, vendor_name, spent_on, legacy_id, created_by)
      values (w.id, w.property_id, coalesce(s.payload->>'kind','parts'), coalesce((s.payload->>'amount')::numeric,0), s.payload->>'description',
              s.payload->>'invoice_url', s.payload->>'vendor', (s.payload->>'spent_on')::date, s.payload->>'legacy_cost_id', 'import')
      on conflict (legacy_id) do nothing;
    end if;
    update import_staging set applied_at = now() where id = s.id;
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function set_checkins(rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update properties p set next_guest_checkin = (r->>'at')::timestamptz
  from jsonb_array_elements(rows) r where lower(p.code) = lower(r->>'code')
    and p.next_guest_checkin is distinct from (r->>'at')::timestamptz;
  get diagnostics n = row_count;
  update properties set next_guest_checkin = null where next_guest_checkin < now() - interval '1 day';
  return n;
end $$;

create or replace function link_bw(p_id bigint, p_task bigint, p_err text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('app.actor', 'breezeway', true);
  update work_orders set bw_task_id = coalesce(p_task, bw_task_id), bw_sync_error = p_err where id = p_id;
end $$;

create or replace function set_crew_ids(rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update allowed_users u set bw_person_id = coalesce(u.bw_person_id, (r->>'bw_person_id')::bigint),
                             email = coalesce(u.email, nullif(r->>'email',''))
  from jsonb_array_elements(rows) r
  where lower(u.name) = lower(r->>'name') or lower(u.bw_name) = lower(r->>'name');
  get diagnostics n = row_count; return n;
end $$;

create or replace function upsert_pm(rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare r jsonb; n int := 0; pid text; uid uuid;
begin
  for r in select * from jsonb_array_elements(rows) loop
    select id into pid from properties where lower(code) = lower(r->>'property_code') limit 1;
    continue when pid is null;
    select id into uid from allowed_users where lower(name) = lower(r->>'assignee') or lower(bw_name) = lower(r->>'assignee') or lower(split_part(name,' ',1)) = lower(r->>'assignee') limit 1;
    insert into pm_schedule (property_id, task, frequency_days, last_done, next_due, push_to, assigned_to, notes, legacy_id)
    values (pid, r->>'task', (r->>'frequency_days')::int, (r->>'last_done')::date, (r->>'next_due')::date, 'breezeway', uid, r->>'notes', r->>'legacy_id')
    on conflict (legacy_id) do update set last_done = greatest(pm_schedule.last_done, excluded.last_done),
      next_due = case when excluded.last_done > coalesce(pm_schedule.last_done,'1900-01-01') then excluded.next_due else pm_schedule.next_due end;
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function set_access(rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare r jsonb; n int := 0; pid text;
begin
  perform set_config('app.actor','breezeway',true);
  for r in select * from jsonb_array_elements(rows) loop
    select id into pid from properties where bw_home_id = (r->>'bw_home_id')::bigint;
    continue when pid is null;
    insert into property_access (property_id) values (pid) on conflict do nothing;
    update property_access set                      -- fills blanks only; what staff type on the site wins
      lockbox_code  = coalesce(lockbox_code,  nullif(r->>'lockbox_code','')),
      door_code     = coalesce(door_code,     nullif(r->>'door_code','')),
      garage_code   = coalesce(garage_code,   nullif(r->>'garage_code','')),
      gate_code     = coalesce(gate_code,     nullif(r->>'gate_code','')),
      wifi_name     = coalesce(wifi_name,     nullif(r->>'wifi_name','')),
      wifi_password = coalesce(wifi_password, nullif(r->>'wifi_password','')),
      notes         = coalesce(notes,         nullif(r->>'notes',''))
    where property_id = pid;
    n := n + 1;
  end loop;
  return n;
end $$;

do $$ declare f text; begin
  foreach f in array array['upsert_pm(jsonb)','set_access(jsonb)','sync_jobs(jsonb,boolean)','apply_staging()','set_checkins(jsonb)','link_bw(bigint,bigint,text)','set_crew_ids(jsonb)','pm_generate()'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- Trash (push_to = 'asana') makes no work orders; its next date just rolls forward each week.
create or replace function pm_roll_asana() returns int language sql security definer set search_path = public as $$
  with u as (update pm_schedule set next_due = next_due + frequency_days
             where push_to = 'asana' and active and frequency_days is not null and next_due < current_date returning 1)
  select count(*)::int from u
$$;
do $$ begin perform cron.unschedule('pm-roll-asana'); exception when others then null; end $$;
select cron.schedule('pm-roll-asana', '5 12 * * *', $$select public.pm_roll_asana()$$);

-- =====================================================================
-- FULL DESK: the original Maintenance Desk runs on this database too.
-- desk_docs holds every desk collection (feeds, edits, projects, vendors, profiles, receipts, queues ...)
-- exactly as the old desk stored them. Nothing is deleted; every overwrite keeps the old copy in desk_docs_log.
-- =====================================================================
alter table allowed_users add column if not exists initials text;     -- the desk's "by" (BT, CM, ...)

create table if not exists desk_docs (
  collection  text not null,
  id          text not null,
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  text not null default actor(),
  primary key (collection, id)
);
create table if not exists desk_docs_log (
  log_id      bigint generated always as identity primary key,
  collection  text not null,
  id          text not null,
  old_data    jsonb,
  changed_at  timestamptz not null default now(),
  changed_by  text not null default actor()
);
create index if not exists desk_docs_log_doc on desk_docs_log (collection, id, changed_at);

create or replace function desk_docs_keep() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now(); new.updated_by := actor();
  -- keep history for people's work; program feeds (big, rewritten every run) are not logged
  if tg_op = 'UPDATE' and new.collection <> 'feeds' and new.data is distinct from old.data then
    insert into desk_docs_log (collection, id, old_data) values (old.collection, old.id, old.data);
  end if;
  return new;
end $$;
drop trigger if exists desk_docs_keep on desk_docs;
create trigger desk_docs_keep before insert or update on desk_docs for each row execute function desk_docs_keep();
drop trigger if exists desk_docs_no_delete on desk_docs;
create trigger desk_docs_no_delete before delete on desk_docs for each row execute function forbid_delete();
drop trigger if exists desk_docs_log_no_change on desk_docs_log;
create trigger desk_docs_log_no_change before update or delete on desk_docs_log for each row execute function forbid_change();

-- Who sees what. Admin: everything. Tech + viewer: no money, pay, receipts or messages to the owners/Jeff.
create or replace function desk_can_read(c text, i text) returns boolean language sql stable security definer set search_path = public as $$
  select case app_role()
    when 'admin' then true
    when 'tech'  then not (c in ('expenses','taskbill','time','asks','slackq','bwq','config','raw')
                           or (c = 'feeds' and (i like 'bw-fees%' or i like 'hs-time%' or i like 'bw-rcpt-%' or i like 'bw-receipts%' or i = 'usage')))
    when 'viewer' then not (c in ('expenses','taskbill','time','asks','slackq','bwq','config','raw')
                           or (c = 'feeds' and (i like 'bw-fees%' or i like 'hs-time%' or i like 'bw-rcpt-%' or i like 'bw-receipts%' or i = 'usage')))
    else false end
$$;
create or replace function desk_can_write(c text) returns boolean language sql stable security definer set search_path = public as $$
  select case app_role()
    when 'admin' then true
    when 'tech'  then c in ('edits','rlog','projedits','deskprojects','propedits','deskjobs','profiles','bwq','recurring','applimg')
    else false end
$$;

alter table desk_docs enable row level security;
alter table desk_docs_log enable row level security;
drop policy if exists desk_read on desk_docs;
create policy desk_read on desk_docs for select to authenticated using (desk_can_read(collection, id));
drop policy if exists desk_ins on desk_docs;
create policy desk_ins on desk_docs for insert to authenticated with check (desk_can_write(collection));
drop policy if exists desk_upd on desk_docs;
create policy desk_upd on desk_docs for update to authenticated using (desk_can_write(collection)) with check (desk_can_write(collection));
drop policy if exists desk_log_admin on desk_docs_log;
create policy desk_log_admin on desk_docs_log for select to authenticated using (app_role() = 'admin');

-- live updates for the desk (same as the old desk's onSnapshot)
do $$ begin
  alter publication supabase_realtime add table desk_docs;
exception when others then null; end $$;

create or replace function my_desk_identity() returns table (name text, initials text, role text)
language sql stable security definer set search_path = public as $$
  select name, initials, role from allowed_users
  where active and lower(auth.jwt()->>'email') in (lower(email), lower(alt_email)) limit 1
$$;
grant execute on function my_desk_identity() to authenticated;

-- desk initials + the office team from the old desk roster (no email = can't sign in until Brandon adds one)
update allowed_users set initials = v.i from (values ('Brandon Thomas','BT'),('Chris Robinson','CM'),('Dave Lanier','DV'),
  ('Jordan Pineda','JP'),('Shelby Huffaker','SH'),('Klancey Huffaker','KH')) v(n,i) where name = v.n and initials is null;
insert into allowed_users (name, role, initials) values
  ('Victor','tech','VS'),('Janae','admin','JB'),('Pyper','admin','PB'),('Charmayne','admin','CH'),('Kimberley','admin','KB'),
  ('Haylee','admin','HL'),('Keno','admin','KO'),('Cheree','admin','CE'),('Porsha','admin','PT'),('Sheryl','admin','SM')
on conflict (name) do nothing;

-- one-time tidy of the first import (safe to re-run; each change is logged as an event)
do $$ begin
  perform set_config('app.actor','import-cleanup',true);
  update work_orders set status = 'new' where status = 'assigned' and assigned_to is null;
  update work_orders set title = btrim(regexp_replace(regexp_replace(replace(replace(replace(title,'&amp;','&'),'&lt;','<'),'&gt;','>'),
           '<#C[A-Z0-9]+\|([^>]+)>', '#\1', 'g'), '<#C[A-Z0-9]+>\s*-?\s*', '', 'g'))
   where title ~ '(<#C[A-Z0-9]+|&amp;|&lt;|&gt;)';
end $$;

-- Next check-in per home straight from the desk's occupancy feed (Track reservations) - runs in the database every 15 min.
create or replace function checkins_from_occupancy() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with occ as (
    select u.key as code, min((s->>'in')::date) as nxt
    from desk_docs d, jsonb_each(d.data->'units') u, jsonb_array_elements(u.value) s
    where d.collection = 'feeds' and d.id = 'occupancy'
      and (s->>'in')::date >= current_date
      and coalesce(s->>'st','') !~* 'cancel'
    group by u.key)
  update properties p
     set next_guest_checkin = (o.nxt::timestamp + interval '16 hours') at time zone 'America/Denver'
    from occ o
   where lower(p.code) = lower(o.code)
     and p.next_guest_checkin is distinct from (o.nxt::timestamp + interval '16 hours') at time zone 'America/Denver';
  get diagnostics n = row_count;
  update properties set next_guest_checkin = null where next_guest_checkin < now() - interval '1 day';
  return n;
end $$;
revoke all on function checkins_from_occupancy() from public, anon, authenticated;
do $$ begin perform cron.unschedule('checkins'); exception when others then null; end $$;
select cron.schedule('checkins', '*/15 * * * *', $$select public.checkins_from_occupancy()$$);

-- =====================================================================
-- INSTANT: Breezeway task webhook -> desk + work orders (no ThinkStation)
-- The Edge Function "breezeway-hook" hands each event to bw_task_event().
-- =====================================================================
create table if not exists hook_log (
  id bigint generated always as identity primary key,
  source text not null, event text, at timestamptz not null default now(), ok boolean, note text, payload jsonb);
alter table hook_log enable row level security;
drop policy if exists hook_log_admin on hook_log;
create policy hook_log_admin on hook_log for select to authenticated using (app_role() = 'admin');
drop trigger if exists hook_log_no_delete on hook_log;
create trigger hook_log_no_delete before delete on hook_log for each row execute function forbid_delete();

-- one live doc the desk reads before the 2-hourly Breezeway parts (newest copy of a task wins)
create or replace function feed_live_put(doc_id text, job jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  insert into desk_docs (collection, id, data) values ('feeds', doc_id, jsonb_build_object('jobs','[]'::jsonb,'src','live','updatedAt',now_ms))
  on conflict (collection, id) do nothing;
  update desk_docs set data = jsonb_build_object('src','live','updatedAt',now_ms,'jobs',
      coalesce((select jsonb_agg(x) from jsonb_array_elements(data->'jobs') x
                where x->>'id' <> job->>'id' and coalesce((x->>'liveAt')::bigint,0) > now_ms - 3*86400000), '[]'::jsonb)
      || jsonb_build_array(job || jsonb_build_object('liveAt', now_ms)))
  where collection = 'feeds' and id = doc_id;
end $$;

create or replace function bw_task_event(p jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare t jsonb := p->'task'; ev text := coalesce(p->>'event_type', p->>'event', '');
        code text; bwname text; dept text; stcode text; done boolean; auto boolean; crew jsonb; job jsonb; who text;
        mins int := 0; m text[];
begin
  if t is null then return 'no task'; end if;
  select pr.code, pr.name into code, bwname from properties pr where pr.bw_home_id = (t->'home'->>'id')::bigint;
  bwname := coalesce(t->'home'->>'name', bwname);
  dept := lower(coalesce(t->'department'->>'code', t->'department'->>'name', ''));
  stcode := lower(coalesce(t->'status'->>'code', t->'status'->>'name', ''));
  done := (t->>'finished_at') is not null or stcode in ('finished','closed','approved');
  auto := (t->'created_by') is null or (t->'created_by'->>'id') is null;
  select coalesce(jsonb_agg(split_part(a->>'full_name',' ',1)), '[]'::jsonb) into crew
    from jsonb_array_elements(coalesce(t->'assignments','[]'::jsonb)) a where coalesce(a->>'full_name','') <> '';
  -- the desk's rule: Chris is on everything, so he counts only when he's alone
  select coalesce((select x from jsonb_array_elements_text(crew) x where x <> 'Chris' limit 1),
                  (select x from jsonb_array_elements_text(crew) x limit 1)) into who;
  m := regexp_match(coalesce(t->>'total_time',''), '(\d+):(\d+):(\d+)');
  if m is not null then mins := m[1]::int * 60 + m[2]::int; end if;
  if dept not in ('maintenance','inspection') then return 'skipped dept ' || dept; end if;

  job := jsonb_build_object(
    'id', 'bw-' || (t->>'id'), 'src', 'breezeway', 'title', coalesce(t->>'name','task'),
    'detail', left(coalesce(t->>'description',''), 2000), 'prop', coalesce(code,''), 'props', '[]'::jsonb,
    'bwHome', coalesce(bwname,''), 'crew', crew, 'people', jsonb_array_length(crew), 'who', '',
    'created', left(coalesce(t->>'created_at',''),10), 'due', left(coalesce(t->>'due_date',''),10),
    'finished', left(coalesce(t->>'finished_at',''),10), 'updated', left(coalesce(t->>'updated_at', p->>'last_updated',''),10),
    'doneByName', case when done then coalesce(t->'finished_by'->>'full_name','') else '' end,
    'reportedBy', coalesce(t->'created_by'->>'full_name',''), 'auto', auto,
    'kind', case when dept = 'inspection' then 'inspection' when auto then 'recurring' else 'repair' end,
    'list', 'Breezeway · ' || case when dept = 'inspection' then 'Inspection' else 'Maintenance' end,
    'minutes', mins, 'cost', coalesce((select round(sum((c->>'cost')::numeric),2) from jsonb_array_elements(coalesce(t->'costs','[]'::jsonb)) c where c->>'deleted_at' is null),0),
    'chargedTo', case when t->>'bill_to' in ('owner','guest') then t->>'bill_to' else '' end,
    'rk', coalesce(regexp_replace(coalesce(t->>'task_report_url',''), '^.*/', ''), ''),
    'srcUrl', 'https://app.breezeway.io/task/' || (t->>'id'), 'links', '[]'::jsonb, 'comments', 0,
    'officeTask', false, 'vendor', '', 'asg', '',
    'status', case when (t->>'deleted_at') is not null then 'done' when done then 'done' else 'scheduled' end)
    || case when stcode = 'closed' then jsonb_build_object('bwStatus','closed') else '{}'::jsonb end
    || case when (t->>'deleted_at') is not null then jsonb_build_object('bwStatus','deleted') else '{}'::jsonb end;
  perform feed_live_put('jobs-0-live', job);

  -- the work-order board: repair tasks only (same rule as the import)
  if dept = 'maintenance' and not auto then
    perform sync_jobs(jsonb_build_array(jsonb_build_object(
      'legacy_id', 'bw-' || (t->>'id'), 'bw_task_id', (t->>'id')::bigint, 'property_code', code,
      'title', t->>'name', 'description', t->>'description', 'link', 'https://app.breezeway.io/task/' || (t->>'id'),
      'status', case when done then 'done' when who is not null then 'assigned' else 'new' end,
      'origin', 'breezeway', 'source', 'staff', 'priority', case when lower(coalesce(t->'priority'->>'code','')) in ('urgent','high','low') then lower(t->'priority'->>'code') else 'normal' end,
      'reported_by', t->'created_by'->>'full_name', 'assignee', who, 'due_date', nullif(left(coalesce(t->>'due_date',''),10),''),
      'created_at', t->>'created_at', 'closed_at', t->>'finished_at', 'closed_by', t->'finished_by'->>'full_name')), false);
    if (t->>'deleted_at') is not null then
      perform set_config('app.actor','breezeway',true);
      update work_orders set status = 'cancelled' where bw_task_id = (t->>'id')::bigint and status not in ('done','cancelled');
    end if;
  end if;
  return 'ok ' || ev;
end $$;

-- Freshdesk + Slack land on the desk the same way (their own live docs)
create or replace function live_job(doc_id text, job jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare code text; txt text := lower(coalesce(job->>'title','') || ' ' || coalesce(job->>'detail',''));
begin
  if coalesce(job->>'prop','') = '' then      -- find a home code mentioned in the text
    select pr.code into code from properties pr
     where pr.kind <> 'company' and txt ~ ('\m' || regexp_replace(lower(regexp_replace(pr.code,'^(2h-|l-)','','i')),'([^a-z0-9 ])','\\\1','g') || '\M')
     order by length(pr.code) desc limit 1;
    job := job || jsonb_build_object('prop', coalesce(code,''));
  end if;
  perform feed_live_put(doc_id, job);
  return 'ok';
end $$;

do $$ declare f text; begin
  foreach f in array array['bw_task_event(jsonb)','feed_live_put(text,jsonb)','live_job(text,jsonb)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;


-- ===== Moose Hub split (2026-10-27) — copied from hub_site/hub_maint_split.sql so a schema re-run keeps the hub rules =====
-- hub_maint_split.sql (2026-10-27, Brandon): Maintenance desk split. Additive, safe to re-run.
--  * Expenses & Time  -> maintenance manager + admins only (new section key maint_money)
--  * Homes, Vendors   -> own hub desks, every team can open AND edit
--  * Fire & licenses  -> the Licensing desk (licensing team can work its queue items)

alter table hub_desks drop constraint if exists hub_desks_status_check;
alter table hub_desks add constraint hub_desks_status_check check (status in ('live','soon','section'));

create or replace function hub_my_desks() returns table (key text, label text, icon text, url text, status text, sort int)
language sql stable security definer set search_path = public as $$
  select d.key, d.label, d.icon, d.url, d.status, d.sort from hub_desks d
  where hub_can(d.key) and d.status <> 'section' order by d.sort $$;

insert into hub_desks (key,label,icon,url,sort,status,note) values
 ('homes','Homes','home','desk.html?only=homes',32,'live','Every home: basics, appliances, Asana info, recent jobs. Everyone can edit.'),
 ('vendors','Vendors','truck','desk.html?only=vendors',34,'live','Search our vendors by need or trade. Everyone can edit.'),
 ('maint_money','Maintenance · Expenses & Time','dollar',null,0,'section','Section inside Maintenance: maintenance manager + admins only.')
on conflict (key) do update set label=excluded.label, icon=excluded.icon, url=excluded.url, sort=excluded.sort, status=excluded.status, note=excluded.note;
update hub_desks set url='desk.html?only=fire', status='live', icon=coalesce(icon,'badge') where key='licensing';

insert into hub_desk_access (desk_key, team_key)
select d, t.key from unnest(array['homes','vendors']) d, hub_teams t
on conflict do nothing;
insert into hub_desk_access (desk_key, team_key) values ('maint_money','maint_manager') on conflict do nothing;

-- which desk_docs rows are money (expenses, time, billing, receipts, Hubstaff hours, fees)
create or replace function desk_is_money(c text, i text) returns boolean language sql immutable as $$
  select c in ('expenses','taskbill','time')
      or (c = 'feeds' and (i like 'bw-fees%' or i like 'hs-time%' or i like 'bw-rcpt-%' or i like 'bw-receipts%')) $$;

create or replace function desk_can_read(c text, i text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when desk_is_money(c, i) then hub_can('maint_money')
    when c in ('vendoredits','deskvendors') or (c = 'feeds' and i = 'vendors') then hub_can('vendors') or hub_can('maintenance')
    when hub_can('licensing') and ((c = 'slackq' and i like 'lic\_%') or (c = 'bwq' and i like 'fire\_%')) then true
    else case app_role()
      when 'admin' then true
      when 'tech'   then not (c in ('asks','slackq','bwq','config','raw') or (c = 'feeds' and i = 'usage'))
      when 'viewer' then not (c in ('asks','slackq','bwq','config','raw') or (c = 'feeds' and i = 'usage'))
      else false end
  end $$;

create or replace function desk_can_write2(c text, i text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when desk_is_money(c, i) then hub_can('maint_money')
    when c in ('propedits','profiles','applimg') and hub_can('homes') then true
    when c in ('vendoredits','deskvendors') and hub_can('vendors') then true
    when c = 'rlog' and (hub_can('homes') or hub_can('vendors')) then true
    when hub_can('licensing') and ((c = 'slackq' and i like 'lic\_%') or (c = 'bwq' and i like 'fire\_%')) then true
    else case app_role()
      when 'admin' then true
      when 'tech'  then c in ('edits','rlog','projedits','deskprojects','propedits','deskjobs','profiles','bwq','recurring','applimg')
      else false end
  end $$;
revoke all on function desk_can_write2(text,text), desk_is_money(text,text) from public, anon;
grant execute on function desk_can_write2(text,text), desk_is_money(text,text) to authenticated;

drop policy if exists desk_ins on desk_docs;
drop policy if exists desk_upd on desk_docs;
create policy desk_ins on desk_docs for insert to authenticated with check (desk_can_write2(collection, id));
create policy desk_upd on desk_docs for update to authenticated using (desk_can_write2(collection, id)) with check (desk_can_write2(collection, id));

-- reports: Expenses & Time follows the section, Fire & licenses lives on Licensing, desk tabs open by hash
update hub_reports set desk_key='maint_money', admin_only=false, url='desk.html#money' where key='maint_money';
update hub_reports set desk_key='licensing', url='#/licensing' where key='maint_fire';
update hub_reports set url='desk.html#repeats' where key='maint_repeats';

-- 2026-10-27 (Brandon): Homes is renamed "Property Details" and sits under Home, then Vendors. Field techs (maintenance crew) don't get Vendors.
update hub_desks set label='Property Details', sort=2 where key='homes';
update hub_desks set sort=4 where key='vendors';
-- rows are never deleted: access is switched off with hub_desk_access.off
alter table hub_desk_access add column if not exists off boolean not null default false;
create or replace function hub_can(p_desk text) returns boolean
language sql stable security definer set search_path = public as $$
  select hub_uid() is not null and (hub_is_admin() or exists (
    select 1 from hub_desk_access a join hub_member_teams m on m.team_key = a.team_key
    where a.desk_key = p_desk and m.user_id = hub_uid() and not a.off)) $$;
update hub_desk_access set off = true where desk_key='vendors' and team_key='maint_crew';


-- ===== Moose Hub 2026-10-28 (copy of hub_site/hub_2026_10_28.sql so a maintenance re-run keeps it) =====
-- hub_2026_10_28.sql (Brandon, 2026-10-28). Additive, safe to re-run. Runs after hub_home_stays.sql.
--  * owner_contacts section: owner name/phone/email on Property Details (Track feed + hub edits). Every team except maintenance crew.
--  * Reviews desk: admins + every manager + front desk (front desk = reservationists). Still "soon".
--  * hub_prefs: each person's sidebar order + interests for the daily pick (own row only).
--  * Report: Vendors added & removed.

insert into hub_desks (key,label,icon,url,sort,status,note) values
 ('owner_contacts','Property Details · owner contact','home',null,0,'section','Owner name / phone / email on Property Details. Every team except maintenance crew.')
on conflict (key) do update set label=excluded.label, status=excluded.status, note=excluded.note;
insert into hub_desk_access (desk_key, team_key)
select 'owner_contacts', t.key from hub_teams t where t.key <> 'maint_crew' on conflict do nothing;

insert into hub_desk_access (desk_key, team_key)
select 'reviews', t from unnest(array['owner_relations','maint_manager','office_manager','hk_manager','front_desk']) t on conflict do nothing;
update hub_desk_access set off = false where desk_key='reviews' and team_key in ('owner_relations','maint_manager','office_manager','hk_manager','front_desk');

-- desk_docs read/write: same as hub_maint_split.sql plus owner contact rows (feeds/owners from Track, ownercontacts edited in the hub)
create or replace function desk_can_read(c text, i text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when (c = 'feeds' and i = 'owners') or c = 'ownercontacts' then hub_can('owner_contacts')
    when desk_is_money(c, i) then hub_can('maint_money')
    when c in ('vendoredits','deskvendors') or (c = 'feeds' and i = 'vendors') then hub_can('vendors') or hub_can('maintenance')
    when hub_can('licensing') and ((c = 'slackq' and i like 'lic\_%') or (c = 'bwq' and i like 'fire\_%')) then true
    else case app_role()
      when 'admin' then true
      when 'tech'   then not (c in ('asks','slackq','bwq','config','raw') or (c = 'feeds' and i = 'usage'))
      when 'viewer' then not (c in ('asks','slackq','bwq','config','raw') or (c = 'feeds' and i = 'usage'))
      else false end
  end $$;
create or replace function desk_can_write2(c text, i text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when c = 'feeds' and i = 'owners' then false
    when c = 'ownercontacts' then hub_can('owner_contacts') and hub_can('homes')
    when desk_is_money(c, i) then hub_can('maint_money')
    when c in ('propedits','profiles','applimg') and hub_can('homes') then true
    when c in ('vendoredits','deskvendors') and hub_can('vendors') then true
    when c = 'rlog' and (hub_can('homes') or hub_can('vendors')) then true
    when hub_can('licensing') and ((c = 'slackq' and i like 'lic\_%') or (c = 'bwq' and i like 'fire\_%')) then true
    else case app_role()
      when 'admin' then true
      when 'tech'  then c in ('edits','rlog','projedits','deskprojects','propedits','deskjobs','profiles','bwq','recurring','applimg')
      else false end
  end $$;

-- personal settings
create table if not exists hub_prefs (
  user_id uuid primary key references allowed_users(id),
  desk_order text[] not null default '{}',
  interests text[] not null default '{}',
  kinds text[] not null default '{}',
  updated_at timestamptz not null default now());
alter table hub_prefs enable row level security;
alter table hub_prefs force row level security;
revoke all on hub_prefs from anon, public;
grant select on hub_prefs to authenticated;
drop policy if exists hub_prefs_own on hub_prefs;
create policy hub_prefs_own on hub_prefs for select to authenticated using (user_id = hub_uid());
drop trigger if exists hub_prefs_nodelete on hub_prefs;
create trigger hub_prefs_nodelete before delete on hub_prefs for each statement execute function forbid_delete();
drop trigger if exists hub_prefs_notruncate on hub_prefs;
create trigger hub_prefs_notruncate before truncate on hub_prefs for each statement execute function forbid_change();

create or replace function hub_my_prefs() returns json language sql stable security definer set search_path = public as $$
  select coalesce((select json_build_object('desk_order', desk_order, 'interests', interests, 'kinds', kinds) from hub_prefs where user_id = hub_uid()),
                  json_build_object('desk_order', '{}'::text[], 'interests', '{}'::text[], 'kinds', '{}'::text[])) $$;
create or replace function hub_set_prefs(p_desk_order text[], p_interests text[], p_kinds text[]) returns void
language plpgsql security definer set search_path = public as $$
declare v uuid := hub_uid();
begin
  if v is null then raise exception 'not signed in'; end if;
  insert into hub_prefs (user_id, desk_order, interests, kinds, updated_at)
  values (v, coalesce(p_desk_order[1:60], '{}'), coalesce(p_interests[1:20], '{}'), coalesce(p_kinds[1:6], '{}'), now())
  on conflict (user_id) do update set desk_order = excluded.desk_order, interests = excluded.interests, kinds = excluded.kinds, updated_at = now();
end $$;
revoke all on function hub_my_prefs(), hub_set_prefs(text[],text[],text[]) from public, anon;
grant execute on function hub_my_prefs(), hub_set_prefs(text[],text[],text[]) to authenticated;

-- report
insert into hub_reports (key, desk_key, label, note, url, status, admin_only, sort) values
 ('vendors_changes','vendors','Vendors added & removed','Who added or removed a vendor, when and why (this month, last month, 12 months)','desk.html?only=vendors#changes','live',false,10)
on conflict (key) do update set label=excluded.label, note=excluded.note, url=excluded.url, status=excluded.status;

-- Crew cost vs. gain (Hubstaff), Brandon 2026-10-28: Chris (maintenance manager) + admins. Pay cost per tech = money (paycost collection).
create or replace function desk_is_money(c text, i text) returns boolean language sql immutable as $$
  select c in ('expenses','taskbill','time','paycost')
      or (c = 'feeds' and (i like 'bw-fees%' or i like 'hs-time%' or i like 'bw-rcpt-%' or i like 'bw-receipts%')) $$;
insert into hub_reports (key, desk_key, label, note, url, status, admin_only, sort) values
 ('maint_crew_gain','maint_money','Crew cost vs. gain (Hubstaff)','Each maintenance tech: Hubstaff hours x pay cost vs. what their Breezeway work bills, by month','desk.html#money','live',false,5)
on conflict (key) do update set label=excluded.label, note=excluded.note, url=excluded.url, status=excluded.status, desk_key=excluded.desk_key;


-- ===== Moose Hub 2026-10-28: Slack mentions (copy of hub_site/hub_slack_mentions.sql) =====
-- hub_slack_mentions.sql (Brandon, 2026-10-28): Home shows each person their last 5 Slack @-mentions. Additive, safe to re-run.
-- Filled by ThinkStation slack_mentions.py (bot token, read only; public channels only). Each person reads only their own rows.
create table if not exists hub_slack_users (
  user_id uuid primary key references allowed_users(id), slack_id text not null, slack_name text, updated_at timestamptz not null default now());
create table if not exists hub_slack_mentions (
  channel_id text not null, ts text not null, slack_id text not null,
  channel_name text, author text, body text, permalink text, at timestamptz not null,
  primary key (channel_id, ts, slack_id));
create index if not exists hub_slack_mentions_who on hub_slack_mentions (slack_id, at desc);
do $$ declare t text; begin
  foreach t in array array['hub_slack_users','hub_slack_mentions'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('revoke all on %I from anon, public, authenticated', t);
    execute format('drop trigger if exists %I on %I', t||'_nodelete', t);
    execute format('create trigger %I before delete on %I for each statement execute function forbid_delete()', t||'_nodelete', t);
    execute format('drop trigger if exists %I on %I', t||'_notruncate', t);
    execute format('create trigger %I before truncate on %I for each statement execute function forbid_change()', t||'_notruncate', t);
  end loop; end $$;
create or replace function hub_my_mentions(p_n int default 5) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'linked', exists (select 1 from hub_slack_users where user_id = hub_uid()),
    'updated', (select max(updated_at) from hub_slack_users),
    'items', coalesce((select json_agg(x order by x.at desc) from (
        select m.channel_name, m.author, m.body, m.permalink, m.at from hub_slack_mentions m
        where m.slack_id = (select slack_id from hub_slack_users where user_id = hub_uid())
        order by m.at desc limit least(greatest(coalesce(p_n,5),1),20)) x), '[]'::json)) $$;
revoke all on function hub_my_mentions(int) from public, anon;
grant execute on function hub_my_mentions(int) to authenticated;

-- Profile picture (Brandon 2026-10-28): any picture the person picks, shrunk to 160px in the browser, kept on their own prefs row.
alter table hub_prefs add column if not exists avatar text;
create or replace function hub_my_prefs() returns json language sql stable security definer set search_path = public as $$
  select coalesce((select json_build_object('desk_order', desk_order, 'interests', interests, 'kinds', kinds, 'avatar', avatar) from hub_prefs where user_id = hub_uid()),
                  json_build_object('desk_order', '{}'::text[], 'interests', '{}'::text[], 'kinds', '{}'::text[], 'avatar', null)) $$;
create or replace function hub_set_avatar(p_avatar text) returns void
language plpgsql security definer set search_path = public as $$
declare v uuid := hub_uid();
begin
  if v is null then raise exception 'not signed in'; end if;
  if p_avatar is not null and (p_avatar !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$' or length(p_avatar) > 300000) then raise exception 'picture must be a small jpeg/png/webp'; end if;
  insert into hub_prefs (user_id, avatar, updated_at) values (v, p_avatar, now())
  on conflict (user_id) do update set avatar = excluded.avatar, updated_at = now();
end $$;
revoke all on function hub_set_avatar(text) from public, anon;
grant execute on function hub_set_avatar(text) to authenticated;

-- Birthdays (Brandon 2026-10-28): month + day only (no year). Each person sets their own in My settings; admins can set anyone's.
-- Everyone signed in sees names + month/day so Home can celebrate at the start of the month, the week of, and on the day.
create table if not exists hub_birthdays (
  user_id uuid primary key references allowed_users(id),
  month int not null check (month between 1 and 12), day int not null check (day between 1 and 31),
  set_by text, updated_at timestamptz not null default now());
alter table hub_birthdays enable row level security;
alter table hub_birthdays force row level security;
revoke all on hub_birthdays from anon, public, authenticated;
drop trigger if exists hub_birthdays_nodelete on hub_birthdays;
create trigger hub_birthdays_nodelete before delete on hub_birthdays for each statement execute function forbid_delete();
drop trigger if exists hub_birthdays_notruncate on hub_birthdays;
create trigger hub_birthdays_notruncate before truncate on hub_birthdays for each statement execute function forbid_change();
create or replace function hub_birthdays_all() returns json language sql stable security definer set search_path = public as $$
  select case when hub_uid() is null then '[]'::json else coalesce((select json_agg(json_build_object('id', u.id, 'name', u.name, 'month', b.month, 'day', b.day, 'me', u.id = hub_uid()) order by b.month, b.day)
    from hub_birthdays b join allowed_users u on u.id = b.user_id where u.active), '[]'::json) end $$;
create or replace function hub_birthday_people() returns json language sql stable security definer set search_path = public as $$
  select case when not hub_is_admin() then '[]'::json else coalesce((select json_agg(json_build_object('id', u.id, 'name', u.name, 'month', b.month, 'day', b.day) order by u.name)
    from allowed_users u left join hub_birthdays b on b.user_id = u.id where u.active and exists (select 1 from hub_member_teams m where m.user_id = u.id)), '[]'::json) end $$;
create or replace function hub_set_birthday(p_user uuid, p_month int, p_day int) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := hub_uid(); who uuid := coalesce(p_user, hub_uid());
begin
  if me is null then raise exception 'not signed in'; end if;
  if who <> me and not hub_is_admin() then raise exception 'only Brandon or Kim can set someone else''s birthday'; end if;
  if p_month is null or p_day is null or p_day > extract(day from (make_date(2024, p_month, 1) + interval '1 month - 1 day')) then raise exception 'not a real date'; end if;
  insert into hub_birthdays (user_id, month, day, set_by, updated_at) values (who, p_month, p_day, (select name from allowed_users where id = me), now())
  on conflict (user_id) do update set month = excluded.month, day = excluded.day, set_by = excluded.set_by, updated_at = now();
end $$;
revoke all on function hub_birthdays_all(), hub_birthday_people(), hub_set_birthday(uuid,int,int) from public, anon;
grant execute on function hub_birthdays_all(), hub_birthday_people(), hub_set_birthday(uuid,int,int) to authenticated;

-- Sync per data source (Brandon 2026-10-28): A-Z list, what each source feeds, and a "Sync now" per source (admins).
alter table hub_sync_sources add column if not exists feeds text;
alter table hub_sync_sources add column if not exists can_run boolean not null default true;
alter table hub_sync_requests add column if not exists source_key text;
insert into hub_sync_sources (key,label,runs_on,schedule,sort) values
 ('track_owners','Track owners','ThinkStation','daily (inside Maintenance sync)',130),
 ('slack_mentions','Slack mentions','ThinkStation','every 30 min (inside Maintenance sync)',140)
on conflict (key) do nothing;
update hub_sync_sources s set feeds = v.feeds, can_run = v.can_run from (values
 ('asana','Maintenance (Asana jobs, owner-relations jobs, trash routines) · Vendors (vendor info)', true),
 ('autohost','Reservation Desk', true),
 ('breezeway','Maintenance (jobs, receipts, fees) · Locks (door-code tasks) · Licensing (fire suppression tasks) · Property Details (Breezeway home info, last 3 done)', true),
 ('estimator','Revenue Estimator', false),
 ('freshdesk','Maintenance (owner/guest tickets)', true),
 ('hubstaff','Maintenance · Expenses & Time (timesheets, crew cost vs. gain)', true),
 ('locks','Locks · Office and Field (Track door codes, hubs)', true),
 ('maint','Maintenance (all program feeds) · Home (Who''s in house) · new tickets to Breezeway', true),
 ('patrick','Ask Patrick', false),
 ('rates','Rates', false),
 ('slack','Maintenance (jobs from #maintenance_action_items and #maintenance_updates)', true),
 ('slack_mentions','Home (Your Slack mentions)', true),
 ('track_owners','Property Details (owner contact)', true),
 ('track_res','Home (Who''s in house) · Reservation Desk', true)
) v(key, feeds, can_run) where s.key = v.key;
drop function if exists hub_sync_request();
create or replace function hub_sync_request(p_key text default null) returns bigint language plpgsql security definer set search_path = public as $$
declare v bigint;
begin
  if not hub_is_admin() then raise exception 'admins only'; end if;
  if p_key is not null and not exists (select 1 from hub_sync_sources where key = p_key and can_run) then raise exception 'that source can''t be run from the hub'; end if;
  if exists (select 1 from hub_sync_requests where done_at is null and coalesce(source_key,'*') = coalesce(p_key,'*') and requested_at > now() - interval '15 minutes') then
    select id into v from hub_sync_requests where done_at is null and coalesce(source_key,'*') = coalesce(p_key,'*') order by id desc limit 1; return v; end if;
  insert into hub_sync_requests (requested_by, source_key) values ((select name from allowed_users where id = hub_uid()), p_key) returning id into v; return v; end $$;
revoke all on function hub_sync_request(text) from public, anon; grant execute on function hub_sync_request(text) to authenticated;
