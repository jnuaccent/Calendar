# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Planned ground-up rebuild of a club (동아리) Google Calendar viewer/booking web
app for ~200 members. **No implementation exists yet** — the only files here are
this CLAUDE.md and `README.md` (an analysis of an older, unrelated prototype
found in a sibling repo, kept as historical reference — see "Prior art" below).
Not yet a git repository.

The approved implementation plan lives at
`C:\Users\sws18\.claude\plans\ui-swift-blossom.md` — **read it before doing any
work here**. It has the full rationale, admin-write design, spreadsheet schema,
and manual verification checklist. This file is only the at-a-glance summary.

## What this app is

A calendar for a club's shared Google Calendar (month/week grid views), covering
both member-booked slots (band practice, lessons) and club-run events
(performances, etc.).

- **Viewing is fully public, no login.** Any of the ~200 members opens the link
  and sees the grid immediately — plain read-only viewer behavior.
- **Writing (create/edit/delete) is admin-only**, via a separate, unlinked
  `admin.html` page gated by Google sign-in, backed by a Google Apps Script Web
  App — not the browser doing OAuth writes directly, and not a paid backend.
  Regular members never get write access. Full rationale: plan doc's "관리자
  쓰기 기능 설계" / "인계/유지보수" sections.
- **Weekly cap is a soft warning, not enforcement.** Rule: each team ≤ 2
  bookings/week. The admin UI shows a live count and pops a confirm dialog past
  the cap; admins can override for exceptions. No server-side hard block.
- **Teams are tagged by a stable `teamId`, not the display name**, so renaming a
  team in the roster spreadsheet never breaks weekly-count history. Team removal
  is a soft-delete (an "활성" checkbox in the spreadsheet) — never a deleted row.
- **No recurring events** — the club doesn't use them, so don't build
  `singleEvents`/recurrence-expansion handling.
- **Week starts Monday** everywhere (month grid, "this week" weekly-cap calc).
- **Everything lives under club-owned accounts, not personal ones**: Calendar,
  Apps Script project, Google Cloud API-key project, roster spreadsheet, GitHub
  repo (→ a club GitHub Organization). No service requiring a billing card. This
  app must keep working after the current maintainer is gone — see the plan
  doc's succession checklist before changing account/ownership assumptions.

## Deployment model (drives every technical constraint below)

- **Static site on GitHub Pages** — no server, no build pipeline. Exact repo/org
  is still undecided; keep all asset references relative so it works from any
  path.
- No bundler, no npm install. Plain HTML/CSS/JS, native
  `<script type="module">` in `index.html`/`admin.html`. No
  build/lint/test command exists because there is no tooling — verification is
  manual (open in a browser).
- **`type="module"` will not load over `file://`** — always serve locally
  (`npx serve .`, `python -m http.server`, etc.) before checking changes in a
  browser; never double-click `index.html`.
- **Read path**: Google Calendar API v3 (`GET /calendars/{id}/events`), API key,
  called directly from the browser (no proxy). One key only — restricted via
  HTTP-referrer allowlist (prod Origin + `http://localhost:*/*`) + API scope in
  Google Cloud Console, not hidden. No separate dev key. This is intentional;
  don't "fix" the visible key by adding a backend unless asked.
- **Write path**: `admin.html` calls a **Google Apps Script Web App** (deployed
  by hand-copying `apps-script/Code.gs` into the Apps Script editor — no `clasp`
  build step). The script checks the signed-in Google account's email against
  an admin allowlist kept in a spreadsheet before allowing any create/edit/delete.

## Intended file layout (per the approved plan — create these as work proceeds)

```
index.html                  # public read-only page shell: header/tabs/dropdowns/today+week-arrows/status+error regions/grids/detail panel
admin.html                  # admin-only page (not linked from public nav): Google sign-in + event CRUD form
css/styles.css              # hand-written CSS (no Tailwind/CDN) — tokens, layout, responsive, dark mode, focus states
js/config.js                # CALENDAR_ID, API_KEY, TIME_ZONE, APPS_SCRIPT_URL, display constants
js/googleCalendarApi.js     # read-only fetch layer: builds request, normalizes events, throws distinguishable errors
js/dateUtils.js             # pure date helpers (month grid Monday-start, week range, ISO week calc, formatting) — no DOM
js/colorUtil.js             # title -> hue -> {solid, translucentBg, border}, generated directly (no string mutation)
js/state.js                 # plain state object + setters (view, viewDate, selectedDate, events, loading, error, fetched-range cache)
js/viewMonth.js             # month grid renderer
js/viewWeek.js              # week grid renderer (taller cells, more events shown than month view)
js/dayDetail.js             # selected-day detail panel renderer
js/app.js                   # public page entry point: DOM wiring, event listeners, fetch/render orchestration
js/adminApi.js              # Apps Script Web App call layer: Google sign-in, CRUD requests, weekly-count lookup
js/admin.js                 # admin page entry point: sign-in UI, team dropdown, live weekly count, warning popup, CRUD wiring
apps-script/Code.gs         # Apps Script backend source mirror (version control/reference — deploy by hand-copying into the Apps Script editor)
ANALYSIS.md                 # (rename of current README.md) analysis of the old prototype this replaces
README.md                   # (new) run/deploy instructions, API key restriction checklist, ops/handoff manual
```

Keep this flat, no-framework structure — it's a small club project; don't
introduce a bundler, framework, or state-management library.

## Prior art

The current `README.md` documents an older single-file HTML/JS calendar
prototype (found in a sibling repo) used only as an informal UI/feature
reference — not code to reuse or patch. Fixes this rebuild must carry forward:
replace the fragile `hsl(...) -> hsla(...)` string-replace color trick, add
visible loading/error states (the old version only did `console.error`), and
give the week view its own layout instead of reusing month view's "2 events +
overflow badge" cells.
