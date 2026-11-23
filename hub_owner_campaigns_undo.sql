-- Undo for hub_owner_campaigns.sql. Removes the two functions only, so no new campaigns can be made.
-- Keeps the table, its rows and the batch columns (we never delete data); the page hides campaigns when the functions are gone
-- only if you also roll back marketing.html.
drop function if exists mkt_campaign_make(text, text, date, text, text[]);
drop function if exists mkt_campaign_set(bigint, boolean);
