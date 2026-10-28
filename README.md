# CompassED

**The online campus for a school.** Activities to explore by category, competitions and challenges with judging, the school calendar and news, announcements with read receipts, and a full schoolwork toolkit (units, lessons, playlists, quizzes, mastery checkpoints, homework with drafts and rubric marking, a spaced-repetition review queue and a class overview heatmap). A student portal, a separate staff portal, and a public home page.

Colours: white `#ffffff`, cyan `#4cc4cf`, black `#000000`. No build step: plain HTML, CSS and JavaScript, hosted on GitHub Pages at **https://compass-ed.github.io/**.

CompassED is standalone. It has its own accounts (username + password), its own classes and its own content; it does not depend on any other site or service apart from one Supabase database.

## Files

```
index.html            Public home page: categories, open competitions, whole-school events, news
about.html            About page                 signin.html   Sign in / create account (students use a join code, staff an invite code)
app.html              Student portal (hash-routed)              -> assets/student.js
teach.html            Staff portal (teachers + administrator)   -> assets/teacher.js
assets/app.css        Design system              assets/icons.js  Hand-drawn SVG icon set
assets/core.js        API, sessions, router, block renderer, calendar + .ics export
assets/config.js      Supabase URL / key, preview-mode switch
assets/demo.js        Preview mode: a sample campus in the browser that mirrors every database function
supabase/compassed-v2.0.sql     The database: tables ed_* and functions ed_login/ed_signup/ed_claim, ed_s_* (students), ed_t_* (staff), ed_a_* (admin)
supabase/patches/drop-v1-tables.sql   Only if the earlier v1.0 script was run: removes its tables
```

## Setting it up

### 1. Database (required, five minutes)
1. Open your Supabase project > **SQL Editor** > **New query**.
2. Open `supabase/compassed-v2.0.sql`. **Change the three values in section 8** near the end: the admin password, the student join code and the teacher invite code.
3. Paste the whole file and **Run**. It is safe to run again; it never deletes anything.
4. `assets/config.js` must point at that project (`supabaseUrl` and the publishable/anon key from Project Settings > API). The key is safe to publish: every table is locked down and only the `ed_*` functions can be called.

Then sign in at the site as `admin` with the password you chose. Under **People & classes** create classes, add staff (or give them the invite code), and hand students the join code (or create their accounts for them).

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
- Five wrong sign-ins from one connection lock it for one minute.
- All `ed_*` tables have row-level security on with no policies, so the only way in is through the `security definer` functions, each of which checks the caller's token and role.
- Students can only read and write their own submissions, entries, review cards and completions, and only see assignments for their class.

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
