-- hub_owner_campaign_history.sql (2026-11-23, Brandon: "Yes, load them")
-- Past ZPoint / OwnerPoint owner campaigns + their landing-page inquiries and QR scans, matched to Track, so
-- Advertising ▸ Owners ▸ Owner campaigns shows what each one cost and which homes it brought in.
-- Sources: OwnerPoint campaign dashboards (read 2026-11-23) + Track owner-unit start dates (read only).
-- Run after hub_owner_campaigns.sql. Additive only. Data is loaded by hub_site/owner_campaign_history_load.py.

alter table mkt_owner_campaigns add column if not exists source   text not null default 'hub';   -- hub | zpoint
alter table mkt_owner_campaigns add column if not exists ext_id   text;                            -- OwnerPoint campaign id
alter table mkt_owner_campaigns add column if not exists mail_end date;
alter table mkt_owner_campaigns add column if not exists cards    int;
alter table mkt_owner_campaigns add column if not exists emails   int;
alter table mkt_owner_campaigns add column if not exists inquiries int;
alter table mkt_owner_campaigns add column if not exists qr_scans int;
alter table mkt_owner_campaigns add column if not exists cost     numeric;
alter table mkt_owner_campaigns add column if not exists traced   jsonb not null default '[]';     -- [{home, who, lead_on, how, started, still, ended}]
alter table mkt_owner_campaigns add column if not exists note     text;
create unique index if not exists mkt_owner_campaigns_ext on mkt_owner_campaigns (source, ext_id) where ext_id is not null;

-- One row per person who asked on the landing page, or per owner+address that scanned a card's QR code.
create table if not exists mkt_owner_inquiries (
  id          bigserial primary key,
  key         text not null unique,                 -- md5 of source/kind/name/email/address (re-runs update, never duplicate)
  source      text not null default 'zpoint',
  kind        text not null check (kind in ('inquiry','qr')),
  campaign    text,                                  -- campaign whose page listed it
  lead_on     date,                                  -- inquiry date / first scan
  last_on     date,                                  -- last scan
  scans       int,
  name        text,
  email       text,
  phone       text,
  address     text,
  city        text,
  track_home  text,                                  -- matched Track home (if any)
  track_start date,
  status      text not null default 'new' check (status in ('new','contacted','talking','signed','not_interested','already_ours')),
  note        text,
  off         boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_name text,
  updated_at  timestamptz
);
create table if not exists mkt_owner_inquiry_log (
  id bigserial primary key, inquiry_id bigint, old_status text, new_status text, note text,
  by_name text, at timestamptz not null default now()
);
alter table mkt_owner_inquiries enable row level security;
alter table mkt_owner_inquiry_log enable row level security;
drop policy if exists mkt_owner_inquiries_read on mkt_owner_inquiries;
create policy mkt_owner_inquiries_read on mkt_owner_inquiries for select to authenticated using ((select hub_can('advertising')));
drop policy if exists mkt_owner_inquiry_log_read on mkt_owner_inquiry_log;
create policy mkt_owner_inquiry_log_read on mkt_owner_inquiry_log for select to authenticated using ((select hub_can('advertising')));
revoke all on mkt_owner_inquiries, mkt_owner_inquiry_log from anon;
revoke insert, update, delete on mkt_owner_inquiries, mkt_owner_inquiry_log from authenticated;
grant select on mkt_owner_inquiries, mkt_owner_inquiry_log to authenticated;

create or replace function mkt_inquiry_set(p_id bigint, p_status text, p_note text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare o text; nm text := user_name(auth.uid());
begin
  if not hub_can('advertising') then raise exception 'Not allowed'; end if;
  if p_status not in ('new','contacted','talking','signed','not_interested','already_ours') then raise exception 'Pick a status'; end if;
  if length(coalesce(p_note,'')) > 1000 then raise exception 'Keep the note under 1,000 characters'; end if;
  select status into o from mkt_owner_inquiries where id = p_id;
  if not found then raise exception 'No inquiry %', p_id; end if;
  update mkt_owner_inquiries set status = p_status,
         note = case when coalesce(trim(p_note),'') = '' then note else penny_mask(trim(p_note)) end,
         updated_name = nm, updated_at = now() where id = p_id;
  insert into mkt_owner_inquiry_log (inquiry_id, old_status, new_status, note, by_name)
  values (p_id, o, p_status, nullif(penny_mask(coalesce(trim(p_note),'')),''), nm);
end $$;
revoke all on function mkt_inquiry_set(bigint, text, text) from public, anon;
grant execute on function mkt_inquiry_set(bigint, text, text) to authenticated;
