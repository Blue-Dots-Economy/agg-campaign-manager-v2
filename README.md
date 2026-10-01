# Purple Dots Campaign Manager

Build "Operation Rozgar — Mission Control", a master operations dashboard for managing voice-AI job-outreach campaigns. It must be CONFIGURABLE for two programs — KKB (Kaam Ki Baat) and DKB — selectable via a program switcher, where each program has its own connected Google Sheet, its own column schema, its own KPIs/metrics, and its own campaign-launch flow.

=== DESIGN ===
Clean, modern, flat dashboard. Left sidebar in a deep teal brand color (#0F6E56) with white/light-teal text; light neutral page background; white rounded cards with subtle borders (no heavy shadows, no gradients). Sentence case everywhere. Use Recharts for charts and shadcn/ui for tables, tabs, dialogs, selects. Professional and uncluttered — think a calm analytics console, not a flashy SaaS landing page.

Sidebar contents (top to bottom):
- Brand: "Operation Rozgar" with a small briefcase icon; subtitle changes per program ("KKB · voice outreach" / "DKB · skilling outreach").
- A PROGRAM SWITCHER segmented control: [KKB] [DKB]. Switching it re-drives the entire app from that program's config.
- Nav items: Overview, Campaigns, Launch, Schedule, Analytics, Data & uploads, Settings.
- Footer: "Connected: {program} master sheet · ● connected".

Top bar: greeting "Hello, Aryan", a small subtitle "Here's how {PROGRAM} is performing", a program badge pill, an "Upload CSV" button and a primary "Launch campaign" button.

=== CONFIG-DRIVEN ARCHITECTURE (important) ===
Create a program config registry: src/programs/registry.ts exporting { kkb, dkb }. Each ProgramConfig declares: id, label, subtitle, brandColor, connected sheet (a sheetCsvUrl field, may be empty for now), the column schema, an array of KPI definitions {key,label,icon,format}, the drop-reason bucket list, and the launch-flow steps. Every view reads from the active ProgramConfig — no hardcoded program logic in components. Adding a third program later = one new config file.

KKB config:
- KPIs: Total calls, Answered %, Engaged %, Applications, High-intent (score ≥ 5).
- Drop-reason buckets: early_hangup, user_declined, no_matching_jobs, apply_failed, profile_loop, other.
- Column schema (29 columns, this exact order): campaign_day, campaign_date, campaign_type, language, call_id, phone, call_duration_seconds, call_datetime_ist, call_outcome, call_answered, call_engaged, applied_to_job, applications_count, jobs_shown, primary_topic, call_language, call_recording_url, final_summary, call_transcript, tried_to_apply, drop_reason, city_campaign, seeker_name, user_intent, jobs_recommended, jobs_applied, jobs_failed_to_apply, Intent Score, Intent Score Reasoning.
- Launch flow steps: "Upload seeker CSV", "Auto-detect region (KA / GZB)", "Match + derive columns", "Schedule call window", "Push batch to Raya".
DKB config (placeholder values, clearly different so the switcher visibly changes things):
- KPIs: Total calls, Answered %, Counselled %, Interviews, High-intent. (success metric is Interviews, not Applications)
- Drop-reason buckets: not_interested, callback_later, course_full, wrong_trade, language, other.
- Its own (different) column schema — start with a reasonable skilling-oriented set; mark it as TBD/configurable.
- Launch flow steps: "Upload candidate CSV", "Map course / trade interest", "Assign counsellor slot", "Schedule call window", "Push batch to Raya".

=== DATA ===
The source of truth is each program's Google Sheet (a row per call). Build a data layer that, per program, would read that program's sheet. For now seed REALISTIC MOCK DATA generated to match the KKB 29-column schema (a few hundred rows across campaign_day Day 1..Day 8, languages Hindi/Kannada, cities Ghaziabad/Hubli-Dharwad, varied call_outcome/answered/engaged/applied, jobs_applied/jobs_failed JSON arrays, and an Intent Score 0–10). Abstract data access behind a single function getCampaignData(programConfig) so swapping mock → live (published-CSV fetch from config.sheetCsvUrl) is a one-line change later. Compute all KPIs, charts, and tables FROM this row data — never hardcode the numbers.

=== PAGES ===
1) Overview: KPI cards (each with a small circular progress ring), a "Campaign performance" line chart (answered/engaged/converted by campaign day), a "Drop reasons" donut, an "Intent score distribution" bar chart, and a "Region split" (KA vs GZB) small chart. All computed from the active program's data.
2) Campaigns: a table of campaigns grouped by campaign_day (date, type, language, rows, answered %, applied/interviews, high-intent count, status). Clicking a campaign opens a detail view with that campaign's seeker rows (phone, seeker_name, outcome, engaged, applied, drop_reason, Intent Score) and filters.
3) Launch: a drag-and-drop CSV uploader. On upload, auto-detect region from the filename (filename contains "KA"/Kannada/Hubli → KA/Kannada/Hubli-Dharwad; contains "GZB"/"Hindi"/Ghaziabad → GZB/Hindi/Ghaziabad), show detected region (overridable), show row count and a preview table of the first 20 rows, and show the program's launch-flow steps as a numbered checklist. Add a "Create & schedule batch" button that is currently a STUB (Phase 2 — Raya integration pending). Make a typed RayaClient interface (createBatch, scheduleBatch, listExecutions) with TODO implementations so it's ready to wire to the real API later.
4) Schedule: a list/calendar of scheduled batches with date/time, program, status (scheduled/running/done) — mock data for now.
5) Analytics: deeper charts — trends over time, drop-reason breakdown, intent distribution, comparison across campaign days.
6) Data & uploads: a history table of past uploads/appends (date, program, file, rows added, status).
7) Settings: editable per-program config — connected sheet URL, Raya agent id, from-number, and the KPI/drop-reason definitions (read from the config registry).

Make the program switcher actually change: brand subtitle, badge, connected-sheet label, the KPI set, the drop-reason buckets, the launch-flow steps, and the column schema used in Campaigns. Use clean Recharts visuals, rounded white cards, and the teal brand. Keep all numbers rounded. Start on the Overview page with KKB selected.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://purpledotscampaigmanager.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/f9ce44d6-63df-4899-8da5-c22f8ecf437b).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
