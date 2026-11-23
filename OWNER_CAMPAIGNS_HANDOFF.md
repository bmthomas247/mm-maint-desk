# Owner campaigns — handoff (2026-11-23)

Built in a cloud Claude session on branch `claude/eloquent-turing-hi9w4q`. **Not live yet**: the SQL hasn't been run, and `marketing.html` on this branch isn't on `main`.

## What it is
This adds **🗓 Owner campaigns** to Advertising ▸ Owners, using the same timing as the ZPoint Spring 2025 owner campaign (source: ZPoint campaign dashboard screenshot, Spring 2025):

| Step | Day | Spring 2025 |
|---|---|---|
| Mail drop 1 | 0 | Mar 17 |
| Ads start | 7 | Mar 24 |
| Email 1 | 21 | Apr 7 |
| Mail drop 2 | 35 | Apr 21 |
| Email 2 | 56 | May 12 |
| Mail drop 3 | 70 | May 26 |
| Email 3 | 91 | Jun 16 |
| Ads end | 100 | Jun 25 |

- Tick owners in Owner leads, then **🗓 Start a 3-drop campaign**. You pick the start date (it defaults to next Monday).
- That makes **3 ordinary postcard batches**, named "<name> · Drop n of 3" with a mail date each, plus **5 Plan for Owners cards**: ads start, emails 1–3, and ads end + results.
- **Nothing mails by itself.** Each drop is designed, previewed and mailed from its own batch row, the same as any batch. Rows show pills: due soon (within 7 days, amber), late (red), mailed (green).
- Each campaign card shows the timeline, owners, cards mailed, QR scans, owners marked Talking/Signed, recorded mail cost, and cost per signed home.
- The section and button stay hidden until the SQL has been run, so pushing the page early is safe.

## To go live (on the ThinkStation)
1. Read `hub_owner_campaigns.sql`. It needs `hub_owner_leads.sql` (already live) and assumes `mkt_postcard_make(text, text, text[])` and `mkt_ideas(tab, kind, status, title, details, due)`. Check both against the live definitions first.
2. Run it in the Supabase SQL editor. It only adds things: a new table `mkt_owner_campaigns`, 3 new columns on `mkt_postcard_batches`, and the functions `mkt_campaign_make` and `mkt_campaign_set`. Undo with `hub_owner_campaigns_undo.sql`, which drops the functions only.
3. Merge this branch's `marketing.html` with the live copy in Dropbox `hub_site`, since that copy may have changed since 12:35 today, then push. Append the SQL to `schema.sql` and add a note to `CLAUDE.md`.
4. Test as an Advertising-desk user: start a campaign on 2–3 owners, check that the 3 batches and 5 plan cards appear, then cancel the batches and park the campaign. Also test as someone without the desk: they should see no campaign data.

## Not covered
- **Emails.** RentCast owners have no email addresses, so the email steps are plan cards only. ZPoint had emails for 1,919 of 2,086 owners (92%, same screenshot), probably from a data-append service.
- **Ads.** These are plan cards only. Nothing connects to Meta or Google.
- **PostGrid's free tier** is 500 pieces a month (postgrid.com/pricing-print-mail). A full drop at Spring 2025 size (2,086) needs a paid plan.

## ZPoint / OwnerPoint / ContactPoint: save what we can before they shut down
This needs a session on the ThinkStation with Chrome, signed in through LastPass. Don't paste passwords into Claude. Export to Dropbox `11a-Advertising Memberships/Rentalz/ZPoint export/`:
- Every campaign's dashboard: settings, dates, counts and cost. Screenshot each, plus any CSV.
- Each campaign's mail and email designs (Design Center): download the PDFs and images.
- OwnerPoint lists, e.g. "Current Owner (198)" and the target homeowner lists. **Export the CSVs, including emails**, because that's the data we can't get from RentCast.
- ContactPoint contacts, pipelines and opportunities as CSV, plus any automations and email templates (screenshots or copied text). `hub_site/CONTACTPOINT.md` and `CP_LEADS_HANDOFF.md` say how the hub talks to it today.
- Which owners signed after each campaign, so we can work out the real cost per signed home. The dashboard's "5–11 acquired" is only ZPoint's target.

Security: Kim's ZPoint password (Jan 20, 2026, group DM) and a ContactPoint API token (Oct 29, 2026, Jeff ↔ Brandon DM) were posted in Slack. Change both and delete those messages.
