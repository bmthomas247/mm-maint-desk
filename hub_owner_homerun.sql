-- hub_owner_homerun.sql (2026-11-23, Brandon: "Yes, build it" = the home-run owner campaign from hub_site/OWNER_HOMERUN_RESEARCH.md)
-- One card per owner (mkt_hr_leads), a follow-up cadence with a logged touch for every call/text/email (mkt_hr_touches),
-- spend by channel (mkt_hr_spend) so we judge by cost per signed home. Leads come from:
--   warm        = ZPoint landing-page inquiries + QR scans not signed (mkt_owner_inquiries), with what ContactPoint says happened (cp_*)
--   new_buyer   = county records: bought in the last 120 days, doesn't live there, within 800 m of one of our homes (RentCast area_owner)
--   our_building= county records: doesn't live there, within 150 m of our homes in a community where we have 3+ homes
-- Skips: Hideout / Shoreline (not nightly), Black Rock Ridge (plan: don't actively market), don't-contact owners, our own homes' addresses.
-- Read + work = Advertising desk (hub_can('advertising')). No deletes. Run after hub_owner_campaign_history.sql.

alter table mkt_owner_inquiries add column if not exists cp_pipeline text;
alter table mkt_owner_inquiries add column if not exists cp_stage text;
alter table mkt_owner_inquiries add column if not exists cp_status text;
alter table mkt_owner_inquiries add column if not exists cp_assigned text;
alter table mkt_owner_inquiries add column if not exists cp_updated timestamptz;
alter table mkt_owner_inquiries add column if not exists cp_note text;

create table if not exists mkt_hr_leads (
  id          bigserial primary key,
  key         text not null unique,              -- 'inq:<id>' | 'own:<serp key>'
  segment     text not null check (segment in ('warm','new_buyer','our_building','switcher','other')),
  priority    int not null default 5,             -- 1 = call first
  why         text,                               -- one line: why this owner is on the list
  name        text,
  email       text,
  phone       text,
  address     text,                               -- the home
  mailing     text,                               -- where the owner gets mail
  community   text,
  near_home   text,                               -- our nearest home
  serp_key    text,                               -- area_owner key (for postcards)
  inquiry_id  bigint,
  start_on    date not null default ((now() at time zone 'America/Denver')::date),
  step        int not null default 0,             -- position in the cadence
  next_due    timestamptz,
  status      text not null default 'new' check (status in ('new','working','talking','proposal','signed','not_now','not_interested','dont_contact')),
  owner_name  text,                               -- who works it
  signed_home text,
  note        text,
  off         boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_name text,
  updated_at  timestamptz
);
create index if not exists mkt_hr_leads_due on mkt_hr_leads (next_due) where not off;
create table if not exists mkt_hr_touches (
  id bigserial primary key, lead_id bigint not null references mkt_hr_leads(id), kind text not null,
  note text, by_name text, at timestamptz not null default now()
);
create table if not exists mkt_hr_spend (
  id bigserial primary key, day date not null, channel text not null, amount numeric not null check (amount >= 0),
  note text, by_name text, at timestamptz not null default now(), off boolean not null default false
);
alter table mkt_hr_leads enable row level security;
alter table mkt_hr_touches enable row level security;
alter table mkt_hr_spend enable row level security;
do $$ declare t text; begin
  foreach t in array array['mkt_hr_leads','mkt_hr_touches','mkt_hr_spend'] loop
    execute format('drop policy if exists %1$s_read on %1$s', t);
    execute format('create policy %1$s_read on %1$s for select to authenticated using ((select hub_can(''advertising'')))', t);
    execute format('revoke all on %1$s from anon', t);
    execute format('revoke insert, update, delete on %1$s from authenticated', t);
    execute format('grant select on %1$s to authenticated', t);
  end loop; end $$;

-- The cadence (Vida 17-day outbound cadence, adapted; source in OWNER_OUTREACH_ARTICLES_20261123.md). day = days after start.
create or replace function mkt_hr_cadence() returns jsonb language sql immutable as $$
  select '[{"day":0,"do":"call","say":"Call. Talk, or leave a short voicemail"},
           {"day":0,"do":"text","say":"Text if no answer: who we are + the estimator link"},
           {"day":1,"do":"email","say":"Email: what their home would earn, from our homes in their building"},
           {"day":2,"do":"call","say":"Call again"},
           {"day":4,"do":"call","say":"Call (no voicemail)"},
           {"day":7,"do":"email","say":"Email: a real story from a home near theirs + call"},
           {"day":10,"do":"video","say":"Short personal video or voicemail"},
           {"day":14,"do":"call","say":"Call"},
           {"day":17,"do":"email","say":"Last email: we will stop here, door open"}]'::jsonb
$$;
create or replace function mkt_hr_cadence_mail() returns jsonb language sql immutable as $$
  select '[{"day":0,"do":"card","say":"Postcard 1 (QR to the estimator)"},
           {"day":35,"do":"card","say":"Postcard 2 (switcher / new-buyer angle)"},
           {"day":70,"do":"card","say":"Postcard 3 (last call, book a call)"}]'::jsonb
$$;
create or replace function mkt_hr_steps(l mkt_hr_leads) returns jsonb language sql stable as $$
  select case when coalesce(l.phone,'') = '' and coalesce(l.email,'') = '' then mkt_hr_cadence_mail() else mkt_hr_cadence() end
$$;

create or replace function mkt_hr_touch(p_id bigint, p_kind text, p_note text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare l mkt_hr_leads; nm text := user_name(auth.uid()); s jsonb; nxt timestamptz; st text;
begin
  if not hub_can('advertising') then raise exception 'Not allowed'; end if;
  if p_kind not in ('call_talked','call_no_answer','voicemail','text','email','video','card','meeting','proposal','note','skip') then raise exception 'Pick what you did'; end if;
  if length(coalesce(p_note,'')) > 1000 then raise exception 'Keep the note under 1,000 characters'; end if;
  select * into l from mkt_hr_leads where id = p_id and not off for update;
  if not found then raise exception 'No lead %', p_id; end if;
  insert into mkt_hr_touches (lead_id, kind, note, by_name) values (p_id, p_kind, nullif(penny_mask(coalesce(trim(p_note),'')),''), nm);
  st := case when p_kind in ('call_talked','meeting') then 'talking' when p_kind = 'proposal' then 'proposal'
             when l.status = 'new' and p_kind <> 'note' then 'working' else l.status end;
  if p_kind = 'note' then nxt := l.next_due;
  elsif st in ('talking','proposal') then nxt := now() + interval '3 days';          -- in a conversation: check back in 3 days
  else
    s := mkt_hr_steps(l);
    if l.step + 1 >= jsonb_array_length(s) then nxt := null; st := 'not_now';       -- cadence finished, no answer
    else nxt := greatest(now(), (l.start_on + ((s->(l.step+1))->>'day')::int)::timestamp at time zone 'America/Denver' + interval '9 hours'); end if;
  end if;
  update mkt_hr_leads set step = case when p_kind in ('note','call_talked','meeting','proposal') then step else step + 1 end,
         status = st, next_due = nxt, updated_name = nm, updated_at = now(),
         owner_name = coalesce(owner_name, nm) where id = p_id;
  return jsonb_build_object('status', st, 'next_due', nxt);
end $$;

create or replace function mkt_hr_set(p_id bigint, p_status text, p_owner text, p_note text, p_next date, p_home text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare nm text := user_name(auth.uid()); o mkt_hr_leads;
begin
  if not hub_can('advertising') then raise exception 'Not allowed'; end if;
  if p_status is not null and p_status not in ('new','working','talking','proposal','signed','not_now','not_interested','dont_contact') then raise exception 'Pick a status'; end if;
  if p_status = 'signed' and coalesce(trim(p_home),'') = '' then raise exception 'Which home signed? (home code)'; end if;
  select * into o from mkt_hr_leads where id = p_id; if not found then raise exception 'No lead %', p_id; end if;
  update mkt_hr_leads set status = coalesce(p_status, status), owner_name = coalesce(nullif(trim(p_owner),''), owner_name),
         note = case when coalesce(trim(p_note),'') = '' then note else penny_mask(trim(p_note)) end,
         next_due = case when p_status in ('signed','not_interested','dont_contact') then null
                         when p_next is not null then (p_next::timestamp at time zone 'America/Denver') + interval '9 hours' else next_due end,
         signed_home = coalesce(nullif(upper(trim(p_home)),''), signed_home), updated_name = nm, updated_at = now() where id = p_id;
  insert into mkt_hr_touches (lead_id, kind, note, by_name)
  values (p_id, 'status', concat_ws(' · ', 'status ' || coalesce(p_status, o.status), nullif(trim(p_owner),''), nullif(upper(trim(p_home)),''), nullif(penny_mask(coalesce(trim(p_note),'')),'')), nm);
  if p_status = 'dont_contact' and o.serp_key is not null then
    insert into mkt_owner_leads (lead_key, dont_contact, updated_name, updated_at) values (o.serp_key, true, nm, now())
    on conflict (lead_key) do update set dont_contact = true, updated_name = nm, updated_at = now();
  end if;
end $$;

create or replace function mkt_hr_spend_add(p_day date, p_channel text, p_amount numeric, p_note text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not hub_can('advertising') then raise exception 'Not allowed'; end if;
  if p_channel not in ('postcards','email','meta_ads','google_ads','realtor_referral','print','software','staff_time','other') then raise exception 'Pick a channel'; end if;
  if p_amount is null or p_amount < 0 or p_amount > 100000 then raise exception 'Check the amount'; end if;
  insert into mkt_hr_spend (day, channel, amount, note, by_name) values (coalesce(p_day, current_date), p_channel, p_amount, nullif(trim(coalesce(p_note,'')),''), user_name(auth.uid()));
end $$;

-- Fill / refresh the list (service key or admins). Never changes a lead someone has worked (status <> 'new' or touches).
create or replace function mkt_hr_refresh() returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare n_w int; n_b int; n_o int;
begin
  if auth.uid() is not null and not hub_is_admin() then raise exception 'Not allowed'; end if;
  -- warm: ZPoint inquiries + scans not signed
  insert into mkt_hr_leads (key, segment, priority, why, name, email, phone, address, inquiry_id, start_on, next_due, owner_name)
  select 'inq:' || i.id, 'warm',
         case when i.cp_status is null then 1                                   -- never reached ContactPoint
              when i.cp_status = 'open' and i.cp_pipeline ilike 'Property Owner%' then 1
              when i.cp_pipeline ilike 'z-Cold%' then 2
              when i.cp_pipeline ilike 'zz-Unsub%' then 9
              else 3 end,
         concat_ws(' · ', case when i.kind = 'qr' then 'scanned a ZPoint card' else 'asked on the ZPoint landing page' end || ' ' || to_char(i.lead_on, 'Mon YYYY'),
                   case when i.cp_status is null then 'never reached ContactPoint'
                        else 'ContactPoint: ' || coalesce(i.cp_stage, i.cp_pipeline) || ' (' || i.cp_status || coalesce(', ' || to_char(i.cp_updated, 'Mon YYYY'), '') || coalesce(', ' || nullif(i.cp_assigned,''), '') || ')' end),
         i.name, i.email, i.phone, nullif(concat_ws(', ', i.address, i.city), ''), i.id, current_date, now(), nullif(i.cp_assigned, '')
  from mkt_owner_inquiries i
  where not i.off and i.status not in ('signed','already_ours','not_interested')
  on conflict (key) do nothing;
  get diagnostics n_w = row_count;
  -- unsubscribed in ContactPoint = don't email (still callable); mark once
  update mkt_hr_leads l set note = coalesce(l.note, 'Unsubscribed in ContactPoint: phone only, no email')
  from mkt_owner_inquiries i where l.inquiry_id = i.id and i.cp_pipeline ilike 'zz-Unsub%' and l.note is null;

  with ours as (select community, count(*) n from hub_homes where active and community is not null group by 1),
  own as (
    select s.key, s.data d, h.community comm, coalesce(o.n,0) n_ours
    from serp_finds s left join hub_homes h on h.code = s.data->>'nearest_home' left join ours o on o.community = h.community
    where s.kind = 'area_owner' and not s.gone
      and coalesce((s.data->>'owner_occupied')::boolean, false) = false
      and s.data->>'address' !~* '(hideout|shoreline)' and coalesce(h.community,'') <> 'Black Rock Ridge'
      and not exists (select 1 from mkt_owner_leads ml where ml.lead_key = s.key and ml.dont_contact)
      and not exists (select 1 from hub_homes x where x.active and x.address is not null
                      and lower(split_part(x.address, ',', 1)) = lower(split_part(s.data->>'address', ',', 1)))
  )
  insert into mkt_hr_leads (key, segment, priority, why, name, address, mailing, community, near_home, serp_key, start_on, next_due)
  select 'own:' || key,
         case when (d->>'new_owner')::boolean or (d->>'last_sale')::date >= current_date - 120 then 'new_buyer' else 'our_building' end,
         case when (d->>'new_owner')::boolean or (d->>'last_sale')::date >= current_date - 120 then 2 else 4 end,
         case when (d->>'new_owner')::boolean or (d->>'last_sale')::date >= current_date - 120
              then 'bought ' || coalesce(to_char((d->>'last_sale')::date, 'Mon DD, YYYY'), 'recently') || ', lives elsewhere · ' || (d->>'meters_to_ours') || ' m from ' || (d->>'nearest_home')
              else 'lives elsewhere · ' || coalesce(comm, '') || ' (we manage ' || n_ours || ' there) · ' || (d->>'meters_to_ours') || ' m from ' || (d->>'nearest_home') end,
         (select string_agg(x, ' & ') from jsonb_array_elements_text(d->'owners') x),
         d->>'address', d->>'mailing', comm, d->>'nearest_home', key, current_date, now()
  from own
  where ((d->>'new_owner')::boolean or (d->>'last_sale')::date >= current_date - 120) and coalesce((d->>'meters_to_ours')::int, 99999) <= 800
     or (n_ours >= 3 and coalesce((d->>'meters_to_ours')::int, 99999) <= 150)
  on conflict (key) do nothing;
  get diagnostics n_b = row_count;
  select count(*) into n_o from mkt_hr_leads where not off;
  return jsonb_build_object('added_warm', n_w, 'added_owners', n_b, 'total', n_o);
end $$;
revoke all on function mkt_hr_touch(bigint,text,text), mkt_hr_set(bigint,text,text,text,date,text), mkt_hr_spend_add(date,text,numeric,text), mkt_hr_refresh() from public, anon;
grant execute on function mkt_hr_touch(bigint,text,text), mkt_hr_set(bigint,text,text,text,date,text), mkt_hr_spend_add(date,text,numeric,text), mkt_hr_refresh() to authenticated;
grant execute on function mkt_hr_cadence(), mkt_hr_cadence_mail() to authenticated;
