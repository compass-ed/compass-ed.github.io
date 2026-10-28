# CompassED

**The schoolwork platform connected to Compass Dash.** Lessons, homework, assignments, quizzes, mastery checkpoints, a spaced-repetition review queue and a "what to do next" card for students; a separate teacher portal with class management, assignment creation, a rubric builder, a class overview heatmap, draft-and-submit with version history, progress monitoring and targeted announcements with read receipts; plus school tools (unified calendar with phone export, announcements, notifications) and a Microsoft Teams connection.

Colours: white `#ffffff`, cyan `#4cc4cf`, black `#000000`. No build step: plain HTML, CSS and JavaScript, hosted like Compass Dash on GitHub Pages.

## How it fits with Compass Dash

| | Compass Dash | CompassED |
|---|---|---|
| What it is | Revision games, XP, shop, houses, leaderboards | Schoolwork: lessons, homework, quizzes, marking |
| Accounts | 4-digit code + username (students), username + password (teachers) | **The same accounts.** Sign-in reuses `cd_auth` and `cd_tok` |
| Database | Supabase project `eqaxgofniwyhvwmdzwsm`, tables `cd_*` | **Same project**, new tables `ce_*`. Nothing in `cd_*` is changed |
| Progress | Written by the game | **Read only**: XP, mastery, topic stages and activity are shown beside schoolwork and on the teacher heatmap |

Classes, student codes and teacher seats stay managed in the Compass Dash Teacher Panel. A class whose subject is set there appears automatically in the CompassED teacher portal for that subject's teachers.

## Files

```
index.html            Public homepage          about.html   About page         signin.html  Student / teacher / Microsoft sign-in
app.html              Student portal (hash-routed single page)   -> assets/student.js
teach.html            Teacher portal (separate interface)        -> assets/teacher.js
assets/app.css        Design system            assets/core.js   API, sessions, router, calendar + .ics export
assets/config.js      Supabase URL/key, Compass Dash URL, Microsoft settings
assets/demo.js        Preview mode: a sample school in the browser that mirrors every database function
assets/ms.js          Microsoft sign-in (PKCE) and calls to the ce-teams function
supabase/compassed-v1.0.sql            Database: tables ce_* and functions ce_s_* (students), ce_t_* (teachers), ce_ms_* (Teams)
supabase/functions/ce-teams/index.ts   Edge function: Microsoft token check, Graph calls, roster/assignment/grade sync
```

## Setting it up

### 1. Database (required)
1. Open the Compass Dash Supabase project > SQL Editor > New query.
2. Paste the whole of `supabase/compassed-v1.0.sql` and run it. It is safe to run again; it never deletes anything.
3. That's it: `assets/config.js` already points at the project with the publishable (anon) key, the same one Compass Dash ships.

Until the SQL has been run, every signed-in page shows "The CompassED database tables are not set up yet".

### 2. Hosting
Push this folder to the repository `CompassED/CompassED.github.io` (an organisation called CompassED). For a repository named `<account>.github.io` GitHub Pages switches itself on, and the site lives at `https://compassed.github.io/`. If you host it anywhere else, add the new address to `ORIGINS` in `supabase/functions/ce-teams/index.ts` and to the Supabase edge function CORS list.

### 3. Preview mode (no database needed)
On `localhost` / `127.0.0.1`, or with `?demo=1` on any address, the site runs against a sample school kept in the browser (`assets/demo.js`). Sign in with the preview accounts shown on the sign-in page (students `alice_j` / 1234, `cara_m` / 3456, teacher `ms_khan` / teach1234). Add `?demo=0` to switch back. Set `allowDemo: false` in `assets/config.js` to remove preview mode entirely.

To run it locally:

```bash
python3 -m http.server 8766
```

then open http://127.0.0.1:8766/.

### 4. Microsoft Teams (needs the school's IT administrator)
What it adds: **Sign in with Microsoft**, **class and roster import** from Teams for Education, **notifications** posted to the class Team's General channel, and **assignment and grade sync** (a Teams assignment is created from a CompassED assignment and returned marks are sent to it).

Everything runs as the signed-in teacher (delegated permissions), so no client secret is stored anywhere. Steps:

1. **Entra ID app registration** (admin): Azure portal > Microsoft Entra ID > App registrations > New.
   - Supported account types: *Accounts in this organizational directory only* (single tenant) is recommended.
   - Platform: **Single-page application**, redirect URIs `https://compassed.github.io/signin.html`, `.../app.html` and `.../teach.html` (plus the localhost ones while testing).
   - API permissions (Microsoft Graph, **delegated**): `User.Read`, `Team.ReadBasic.All`, `EduRoster.ReadBasic`, `EduAssignments.ReadWrite`, `ChannelMessage.Send`, `Chat.Create`, `ChatMessage.Send`. Click **Grant admin consent**.
2. **Config**: paste the Application (client) ID and Directory (tenant) ID into `assets/config.js` under `microsoft`.
3. **Edge function**: install the Supabase CLI, then from this folder:

   ```bash
   supabase functions deploy ce-teams --no-verify-jwt
   ```

   and set the secrets `MS_CLIENT_ID` and `MS_TENANT_ID` (Supabase > Edge Functions > Secrets).
4. **Link accounts**: each teacher and student signs in to CompassED the usual way once, then uses *Settings > Link Microsoft account*. After that "Sign in with Microsoft" works for them. Teachers can also import a Team's roster, which links any member whose Teams display name matches a Compass Dash username in that class.
5. **Link classes**: Teacher portal > Microsoft Teams > sign in to Microsoft > choose the class Team for each class > Save. The *Post to Teams* and *Sync grades to Teams* buttons then appear on assignments.

Without steps 1 to 3 the Microsoft buttons are disabled and explain what is missing; nothing else is affected.

## Integrations that need credentials or approval

| Integration | Needs | Who |
|---|---|---|
| Database tables | Running `supabase/compassed-v1.0.sql` once | Whoever owns the Supabase project |
| Microsoft sign-in, roster, notifications, assignment & grade sync | Entra app registration + admin consent, client/tenant IDs in `config.js`, `ce-teams` deployed with secrets | School Microsoft 365 administrator + Supabase owner |
| Hosting at a new address | Add the origin to `ce-teams` `ORIGINS` and Entra redirect URIs | Developer |

## Permissions model

- **Students** send their code and username with every request. The database resolves them with Compass Dash's `cd_auth` (which also rate-limits guessing) and only returns work for their own class and their own submissions, progress and notifications.
- **Teachers** send the session token issued by Compass Dash's `cd_t_login`. The database resolves it with `cd_tok`; a teacher can only see and edit classes, units, lessons and quizzes for their own subject. The Compass Dash admin key also works and sees everything.
- **Compass Dash data** is only ever read (`ce_cd_summary`): XP, topics mastered, topic stages, questions answered and last activity.
- All `ce_*` tables have row-level security enabled with no policies, so they can only be reached through the `security definer` functions. The `ce_ms_*` functions are granted to the service role only (the edge function).
- Teacher sessions in the browser lock after 20 minutes without use, like the Compass Dash Teacher Panel.

## Feature map

| Student portal | Teacher portal | School tools |
|---|---|---|
| Dashboard with **"What to do next"** card | Dashboard: to-mark count, active students, open work | **Unified calendar**: events, exams, trips, deadlines |
| Subjects, units, lessons (text, key points, quick checks, video, links) | **Class management**: students with Compass Dash stats, detail view | **Phone export** (.ics) of the month or one event |
| **Lesson Playlists** with the next step highlighted | **Class Overview Heatmap**: lessons / checkpoint / quiz / Compass Dash mastery, weakest unit, strugglers | **Targeted announcements** (class, year, named students, school) with **read receipts** |
| Quizzes with explanations; **Mastery Checkpoints** with a pass mark | Lesson editor (blocks), quiz editor, unit editor | Notifications (bell) for new work, marks, announcements, events |
| Assignments and homework: **draft-and-submit with version history**, rubric shown | Assignment creation (homework / assignment / quiz), submissions with every version, **Rubric Builder** and click-to-mark grading | Microsoft Teams: sign-in, roster import, channel posts, assignment & grade sync |
| **Spaced-repetition review queue** (wrong answers and key points, SM-2 style) | Progress monitoring per class and per student | |
| Progress page with Compass Dash XP, mastery and topic stages | Playlist editor | |

Made by Rondellgames inc.
