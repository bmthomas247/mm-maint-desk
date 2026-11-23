-- hub_owner_campaigns.sql — Owner campaigns on Advertising ▸ Owners (Brandon 2026-11-23: "build it with the same timing").
-- Copies the ZPoint Spring 2025 owner campaign: 3 mail drops to the same owners 5 weeks apart, an email 3 weeks after
-- each drop, digital ads running the whole time. Day offsets from the start (Spring 2025: Mar 17, Mar 24, Apr 7, Apr 21,
-- May 12, May 26, Jun 16, Jun 25):
--   drop 1 = day 0 · ads start = day 7 · email 1 = day 21 · drop 2 = day 35 · email 2 = day 56 · drop 3 = day 70
--   email 3 = day 91 · ads end = day 100
-- A campaign = 3 ordinary postcard batches (mkt_postcard_make, hub_owner_leads.sql) tagged with campaign_id / drop_no /
-- drop_on, plus Plan for Owners cards (mkt_ideas) for the 3 emails and the ads. Nothing mails by itself: each drop is
-- mailed from its batch row (🎨 design, 👀 test preview, 📮 Mail) by a person, same as any batch.
-- Needs hub_owner_leads.sql first. Additive only (never deletes data). Undo: hub_owner_campaigns_undo.sql.

create table if not exists mkt_owner_campaigns (
  id           bigserial primary key,
  name         text not null check (length(name) between 1 and 200),
  audience     text,                                   -- how the owners were picked, e.g. "Prime prospects · Bear Hollow"
  start_on     date not null,                          -- drop 1
  card         text,                                   -- what's on the card (for the record)
  lead_keys    text[] not null default '{}',           -- serp_finds.key of the owners (kind area_owner)
  off          boolean not null default false,         -- parked; never deleted
  created_by   uuid default auth.uid(),
  created_name text default user_name(auth.uid()),
  created_at   timestamptz not null default now(),
  updated_name text,
  updated_at   timestamptz
);
alter table mkt_owner_campaigns enable row level security;
drop policy if exists mkt_owner_campaigns_read on mkt_owner_campaigns;
create policy mkt_owner_campaigns_read on mkt_owner_campaigns for select to authenticated using ((select hub_can('advertising')));
revoke all on mkt_owner_campaigns from anon;
revoke insert, update, delete on mkt_owner_campaigns from authenticated;   -- changes only through the functions below
grant select on mkt_owner_campaigns to authenticated;

alter table mkt_postcard_batches add column if not exists campaign_id bigint references mkt_owner_campaigns(id);
alter table mkt_postcard_batches add column if not exists drop_no int;
alter table mkt_postcard_batches add column if not exists drop_on date;

-- Make a campaign: 3 batches (one per drop) for the same owners + Plan for Owners cards for the emails and ads.
create or replace function mkt_campaign_make(p_name text, p_audience text, p_start date, p_card text, p_keys text[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare cid bigint; bid bigint; n int; bname text; d int[] := array[0, 35, 70];
begin
  if not hub_can('advertising') then raise exception 'Only the Advertising desk can start owner campaigns'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Give the campaign a name'; end if;
  if p_start is null or p_start < (now() at time zone 'America/Denver')::date then raise exception 'Pick a start date from today on'; end if;
  if coalesce(array_length(p_keys, 1), 0) = 0 then raise exception 'Tick some owners first'; end if;
  if array_length(p_keys, 1) > 5000 then raise exception 'That''s more than 5,000 owners; split it up'; end if;

  insert into mkt_owner_campaigns (name, audience, start_on, card, lead_keys)
  values (trim(p_name), nullif(trim(coalesce(p_audience, '')), ''), p_start, nullif(trim(coalesce(p_card, '')), ''), p_keys)
  returning id into cid;

  for n in 1..3 loop
    bname := trim(p_name) || ' · Drop ' || n || ' of 3';
    perform mkt_postcard_make(bname, coalesce(p_card, ''), p_keys);
    select max(id) into bid from mkt_postcard_batches where name = bname and campaign_id is null and created_at > now() - interval '5 minutes';
    if bid is null then raise exception 'Couldn''t make the batch for drop %', n; end if;
    update mkt_postcard_batches set campaign_id = cid, drop_no = n, drop_on = p_start + d[n] where id = bid;
  end loop;

  insert into mkt_ideas (tab, kind, status, title, details, due) values
    ('owners', 'campaign', 'planned', trim(p_name) || ' · Ads start',
     'Start digital ads to these owners (runs to ' || to_char(p_start + 100, 'Mon DD') || '). Spring 2025 spent $1,011 on ads (ZPoint campaign dashboard).', p_start + 7),
    ('owners', 'task', 'planned', trim(p_name) || ' · Email 1', 'Email the owners we have an email for, 3 weeks after drop 1. RentCast leads have no emails, so only owners we already know.', p_start + 21),
    ('owners', 'task', 'planned', trim(p_name) || ' · Email 2', 'Email 3 weeks after drop 2.', p_start + 56),
    ('owners', 'task', 'planned', trim(p_name) || ' · Email 3', 'Email 3 weeks after drop 3.', p_start + 91),
    ('owners', 'task', 'planned', trim(p_name) || ' · Ads end + results', 'Stop the ads and count signed homes from this campaign on Advertising ▸ Owners.', p_start + 100);

  return jsonb_build_object('id', cid, 'owners', array_length(p_keys, 1));
end $$;
revoke all on function mkt_campaign_make(text, text, date, text, text[]) from public, anon;
grant execute on function mkt_campaign_make(text, text, date, text, text[]) to authenticated;

-- Park / unpark a campaign (its batches stay; cancel those from their rows).
create or replace function mkt_campaign_set(p_id bigint, p_off boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not hub_can('advertising') then raise exception 'Only the Advertising desk can change owner campaigns'; end if;
  update mkt_owner_campaigns set off = p_off, updated_name = user_name(auth.uid()), updated_at = now() where id = p_id;
  if not found then raise exception 'No campaign %', p_id; end if;
end $$;
revoke all on function mkt_campaign_set(bigint, boolean) from public, anon;
grant execute on function mkt_campaign_set(bigint, boolean) to authenticated;
