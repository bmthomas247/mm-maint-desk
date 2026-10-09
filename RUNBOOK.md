# Moose Maintenance site — RUNBOOK

Site: https://bmthomas247.github.io/mm-maint-desk/ (GitHub Pages, public repo `bmthomas247/mm-maint-desk`, code only)
Data: Supabase project **Moose Management - Maintenance** (Free plan, org Moose Management, us-west-1)
Programs: `C:\Users\Kim\Documents\moose-track-sync\maintenance_desk\` on the ThinkStation
Status files (Claude reads these): Dropbox `12-TRACK Software\Maintenance Desk Feeds\maint-deploy.json`, `maint-status.json`

## Sign-in
- Email + password. First time or forgot: "Email me a link" → opens the site → set a password (10+ characters).
- Only emails in `allowed_users` (active) can get an account; anyone else is refused by a trigger on `auth.users`.
- Roles: **admin** (everything, costs, access log), **tech** (tickets, notes, photos, codes), **viewer** (read only, no codes, no costs).
- Crew emails + Breezeway ids are filled from Breezeway People by `maint_sync.py`. Change a role: Supabase → Table editor → `allowed_users`.
- Crew sign-in emails need custom SMTP (Brevo, `BREVO_SMTP_USER` / `BREVO_SMTP_KEY` in desk.env); Supabase's built-in email only reaches project team members.

## Rules built into the database
- Nothing is deleted: every table has a delete/truncate block. Cancelled is a status. Removed vendors are `active = false`.
- `work_order_events` is append-only (update/delete blocked). Every status, assignment, priority, due-date and detail change writes an event by trigger; notes are inserted by people.
- Costs live in `work_order_costs` — admin only (crew never sees pay or cost). `cost_lines.verified` = receipt photo, invoice link, or (labor) a time-record link. Unverified shows UNVERIFIED.
- Codes + Wi-Fi live in `property_access` — admin + tech only. Every change logs which fields changed in `property_access_log` (append-only, admin can read). Breezeway fills blanks only; what staff type wins.
- Photos: private Storage bucket `wo-photos` (`<work_order_id>/<time>-<rand>.jpg`, shrunk to 1600 px on the phone). No delete policy.
- 🔴 flag: ticket not done and the home's next guest check-in (from Track reservations) is within 48 h.

## PM schedule (`pm_schedule.push_to`)
- **breezeway** — imported from Breezeway's repeating tasks/inspections. Work orders get a Breezeway task once `MAINT_PM_PUSH=1` (set it after Breezeway's own repeats are turned off, so nothing doubles).
- **reminder** — home care (filters 90 d, private hot tub 30 d, BBQ 60 d May–Oct, fans 180 d, extinguisher yearly, utility room 182 d, portable AC on/off) and seasonal items. Reach Breezeway once someone assigns them.
- **asana** — trash. Shown on the PM calendar only, never a work order or Breezeway task; dates roll weekly. Asana trash check-offs stay as they are.
- Daily jobs (pg_cron): `pm-daily` 12:00 UTC makes work orders for anything due within 7 days; `pm-roll-asana` 12:05 UTC rolls trash dates.

## Breezeway link (maint_sync.py, every 30 min 6am–10pm, task "Moose Maint Sync")
- In: repair tasks + Slack/Asana/Freshdesk jobs from `out_bw/out_slack/out_asana/out_fd` (done there → done here), repeating series → PM, codes/Wi-Fi, next guest check-in, crew ids.
- Out (`MAINT_BW_PUSH=1`): new site tickets → Breezeway task (home, title, details, priority, due, tech); reassign → re-assign. Closing on the site does **not** close Breezeway (no API) — the ticket shows "finish it in Breezeway too".
- Test one push before turning it on: `python maint_sync.py --test-push <ticket #>`.
- Breezeway guard: GET only, plus POST/PATCH to `/auth` and `/inventory/v1/task(/id)`; any delete/archive field refused.

## Rebuild / redeploy
- `deploy_maint.bat` — safe to re-run: creates the project if missing, applies `schema.sql` (idempotent), loads `seed.sql` only into an empty database, sets auth (Site URL + redirect = Pages address, password min 10), pushes the web files, turns on Pages, verifies, writes `maint-deploy.json`.
- `seed.sql` is never pushed to GitHub (it holds addresses and vendor phones). The site holds no data; everything sits behind sign-in + RLS.
- Keys: `desk.env` (Brandon pastes; Claude never types keys). `maint.env` (made by deploy: Supabase URL, service key, DB password) never leaves the PC.

## Import (Oct 9, 2026)
- seed.sql from the old desk: 168 homes + Moose company, 696 appliances (inspection labels), 251 vendors, 816 PM schedules incl. 4 trash routes, 12 desk projects with notes, 38 receipts not tied to a job.
- First `maint_sync.py --import` brings Breezeway/Slack/Asana/Freshdesk jobs with original dates, each logged as an `import` event, then applies staged desk notes, statuses, billing and receipt shares (`import_staging`).
- Older than a year and not done → imported as done.
