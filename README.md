# Compass Ed

**The online campus for a school.** Activities to explore by category, competitions and challenges with judging, the school calendar and news, announcements with read receipts, and a full schoolwork toolkit (units, lessons, playlists, quizzes, mastery checkpoints, homework with drafts and rubric marking, a spaced-repetition review queue and a class overview heatmap). A student portal, a separate staff portal, and a public home page.

Colours: white `#ffffff`, cyan `#4cc4cf`, black `#000000`. No build step: plain HTML, CSS and JavaScript, hosted on GitHub Pages at **https://compass-ed.github.io/**.

Compass Ed is standalone. It has its own accounts (username + password), its own classes and its own content; it does not depend on any other site or service apart from one Supabase database.

## Files

```
index.html            Public home page: categories, open competitions, whole-school events, news
about.html            About page                 signin.html   Sign in / create account (students use a join code, staff an invite code)
student/index.html    Student portal (hash-routed)              -> assets/student.js
teacher/index.html    Staff portal (teachers + administrator)   -> assets/teacher.js
versions.html         Version history with animated previews   CHANGELOG.md
assets/app.css        Design system              assets/icons.js  Hand-drawn SVG icon set
assets/core.js        API, sessions, router, block renderer, calendar + .ics export
assets/campus.js      The campus home page as one renderer: used by index.html and by #/campus in both portals
assets/config.js      Supabase URL / key, preview-mode switch
assets/demo.js        Preview mode: a sample campus in the browser that mirrors every database function
supabase/compassed-v2.0.sql     The database: tables ed_* and functions ed_login/ed_signup/ed_claim, ed_s_* (students), ed_t_* (staff), ed_a_* (admin)
supabase/compassed-v2.1.sql     Run after v2.0: houses and points, clubs, question bank, timed quizzes, peer review, newsletter issues, gallery, parent links, uploads
supabase/compassed-v2.3.sql     Run after v2.1: login codes, consent, admin overview, calendar feeds (.ics), Compass Dash link
supabase/compassed-v2.4.2-feedback.sql   Run after v2.3: the feedback button (admin-only inbox)
privacy.html terms.html cookies.html consent.html   Legal pages and the printable parent/carer consent form
parent.html / assets/parent.js  Read-only weekly summary opened from a student's private parent link
sw.js                           Offline support: keeps the app shell and pages you have opened
supabase/content-pack.sql       Starter content: 16 activities, 4 competitions, 5 clubs, news, a launch event (run once on a fresh campus)
supabase/patches/drop-v1-tables.sql   Only if the earlier v1.0 script was run: removes its tables
```

## Setting it up

### 1. Database (required, five minutes)
1. Open your Supabase project > **SQL Editor** > **New query**.
2. Open `supabase/compassed-v2.0.sql`. **Change the three values in section 8** near the end: the admin password, the student join code and the teacher invite code.
3. Paste the whole file and **Run**. It is safe to run again; it never deletes anything.
3b. Then paste `supabase/compassed-v2.1.sql` and **Run** it too, then `supabase/compassed-v2.3.sql`.
3d. For calendar feeds (Global Campus etc.) enable the **http** extension: Database > Extensions > search "http" > enable. Optional: schedule `select public.ed_feeds_sync_all();` hourly with pg_cron.
3c. Optional but recommended: run `supabase/content-pack.sql` once so the campus starts with real activities, competitions, clubs and news instead of empty pages. It adds houses and points, clubs, the question bank, timed quizzes, peer review, newsletter issues, the winners' gallery, parent links and the `uploads` storage bucket (10 MB per file, images, PDFs, audio and MP4).
4. `assets/config.js` must point at that project (`supabaseUrl` and the publishable/anon key from Project Settings > API). The key is safe to publish: every table is locked down and only the `ed_*` functions can be called.

Then sign in at the site as `admin` with the password you chose. Keep that password out of git: the committed file only ever holds the placeholder `change-me-now`; if a real one was ever committed, change it under Settings straight away. Under **People & classes** create classes, add staff (or give them the invite code), and hand students the join code (or create their accounts for them).

If you ran the earlier `compassed-v1.0.sql`, also run `supabase/patches/drop-v1-tables.sql` once to tidy up.

### 2. Hosting
Push to the `compass-ed/compass-ed.github.io` repository. For a repository named `<account>.github.io` GitHub Pages is on automatically and the site is served from `main`.

### 3. Preview mode (no database needed)
On `localhost` / `127.0.0.1`, or with `?demo=1` on any address, the site runs against a sample campus kept in the browser. The sign-in page lists the preview accounts (students `alice.j`, `cara.m`, `finn.s` with password `student123`; staff `ms_khan`, `mr_ode` with `teach1234`; `admin` with `admin1234`; join code `COMPASS-2026`, invite code `TEACH-2026`). Add `?demo=0` to switch back. Set `allowDemo: false` in `config.js` to remove preview mode.

Run it locally with:

```bash
python3 -m http.server 8766
```

then open http://127.0.0.1:8766/.

## Accounts and permissions

| Role | How they get an account | What they see |
|---|---|---|
| Student | Create account with the **join code** (name, username, password, year, optional class number), or a teacher creates it | Their own class's lessons, playlists, assignments, progress and notifications; every activity, competition, news post and whole-school event |
| Teacher | Create account with the **invite code**, or the admin creates it | All campus content (activities, competitions, news), the calendar, announcements, and the classes of their subject (a teacher with no subject sees every class); students in those classes under People |
| Administrator | Created by the SQL script (username `admin`) | Everything, plus staff accounts, every class, the school name and both codes |

- Passwords are stored as bcrypt hashes. Sessions are random tokens (hashed in the database); student sessions last 30 days idle, staff sessions 12 hours in the database and lock after 20 minutes without use in the browser.
- Five wrong sign-ins (or wrong codes) from one connection lock it for one minute.
- **Login codes** (`1234-5678`) are made by staff under Admin > Login codes or inside an account editor. A blank code creates one account on first use; a code made for an existing account signs them in and forces a new password. Codes can be printed as cut-out cards and revoked at any time.
- **Consent**: accounts record when the Terms and Privacy Policy were accepted (and parental consent if given). Existing accounts are asked once at sign-in.
- All `ed_*` tables have row-level security on with no policies, so the only way in is through the `security definer` functions, each of which checks the caller's token and role.
- Students can only read and write their own submissions, entries, review cards and completions, and only see assignments for their class.

## v2.4.2
- **Feedback button** in both portals; only the administrator reads messages, under Admin > Feedback.

## v2.4
- Name: **Compass Ed**. Clubs are **ECA** (extra-curricular activities). The campus home page is also inside both portals at `#/campus`. Motion everywhere, with ambient loops designed in Moda (`assets/art/*-loop.mp4`), all honouring reduced-motion settings.

## Integrations (v2.3)
- **Compass Dash** shares this Supabase project. Compass Ed calls its public `cd_*` functions (never its tables): students link their Compass Dash code + username in Settings; everyone sees the Compass Dash house cup under House points.
- **Global Campus** (Nord Anglia) has no public API. The supported route is its calendar's iCalendar export: Admin > Calendar feeds > add the .ics address > Sync. The same works for Google, Outlook or any school calendar. Add Global Campus as a link under Admin > Links so it shows on home pages.

## Settings every user has
Under Settings in either portal: **light / dark / auto** theme, a **dyslexia-friendly** reading mode (Lexend typeface, wider spacing, shorter lines, warmer page), a **detail level** (compact, standard, detailed) and an **interface transparency** slider. They are kept in the browser.

## Also in v2.1
- **House points and leaderboards**: students pick a house once; points come automatically from activities, entries, places, mastery checkpoints and peer reviews, and staff award them from any class page. Leaderboards by house, student and class.
- **Badges** on the Progress page, computed from what a student has done.
- **File uploads** on assignments and competition entries (Supabase Storage).
- **Parent summary**: a private read-only link from Settings showing the week, work due, marks and events.
- **Clubs** with capacity and sign-ups, run by staff.
- **Newsletter builder**: one click drafts an issue from recent winners, open competitions, news and new activities.
- **Winners' gallery** on the home page (only entries the student allowed), and an **age band** switch (under 11 / 11+).
- **Question bank** with CSV import, pulled into quizzes with one click; a **Topics** view per class showing accuracy per topic tag.
- **Timed assessments** with an open/close window and a countdown that auto-marks, plus a per-question results breakdown for staff.
- **Peer review**: each student reviews two classmates' work after handing in; reviews show in the grading dialog.
- **Register and seating plan** per class, colour-coded by overdue work and activity.
- **Offline**: the app shell and any page already opened keep working without a connection.
- **Search** across both portals.

## Feature map

| Campus (everyone) | Student portal | Staff portal |
|---|---|---|
| Eight categories of **activities** with block content (text, key points, quick checks, images, video, links) | Home with the **"What to do next"** card and campus news | Activity editor with block content |
| **Competitions, challenges, tournaments** with open/close dates and entries | Explore by category, mark activities done | Competition editor, entry judging with places and notes (students are notified) |
| **News & newsletter** posts; featured posts on the home page | Enter competitions, see results | News editor |
| **Calendar** with events, exams, trips, fixtures, deadlines; `.ics` export | Subjects, units, lessons, **playlists**, quizzes, **mastery checkpoints** | Units, lessons, quizzes, playlists, **rubric builder** |
| **Announcements** to a class, year, named students or the school, with read receipts | Assignments with **drafts, hand-in, version history**, rubric and feedback | Assignments, submissions with every version, click-to-mark grading |
| Notifications | **Spaced-repetition review queue** (SM-2 style) | **Class overview heatmap**, progress monitoring, nudges |
| | Progress across subjects, activities and competitions | **People & classes**: create students and staff, reset passwords, classes, join codes |

Made by Rondellgames inc.
