-- hub_owner_homerun_cards.sql (2026-11-23): put mail-only home-run leads into one ordinary postcard batch (mkt_postcard_make)
-- and move each lead to its next postcard step. Run after hub_owner_homerun.sql. Nothing is mailed here: the batch is
-- designed, previewed and mailed from its row under 📬 Postcards like any batch.
create or replace function mkt_hr_card_batch(p_ids bigint[], p_name text, p_card text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare keys text[]; r jsonb; x bigint; n int := 0;
begin
  if not hub_can('advertising') then raise exception 'Not allowed'; end if;
  if coalesce(trim(p_name),'') = '' then raise exception 'Give the batch a name'; end if;
  select array_agg(serp_key) into keys from mkt_hr_leads
   where id = any(p_ids) and not off and serp_key is not null and status not in ('signed','not_interested','dont_contact');
  if coalesce(array_length(keys,1),0) = 0 then raise exception 'None of these owners has a county mailing record'; end if;
  r := mkt_postcard_make(trim(p_name), coalesce(p_card,''), keys);
  for x in select id from mkt_hr_leads where id = any(p_ids) and serp_key = any(keys) loop
    perform mkt_hr_touch(x, 'card', 'In postcard batch "' || trim(p_name) || '" (#' || (r->>'batch') || '); mails when someone presses Mail on that batch');
    n := n + 1;
  end loop;
  return r || jsonb_build_object('leads', n);
end $$;
revoke all on function mkt_hr_card_batch(bigint[], text, text) from public, anon;
grant execute on function mkt_hr_card_batch(bigint[], text, text) to authenticated;
