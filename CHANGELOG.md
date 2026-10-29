# Compass Ed version history

Each new version from v2.2 onwards ships with an animated preview in `assets/versions/` and an entry on the site's Versions page.

## v2.6 — 29 October 2026
- **Campus Hub** in both portals, modelled on Nord Anglia's Global Campus: one sub-navigation that gathers the campus pages. Students get **Student Voice** (post an idea, back others', see staff replies and what is planned or done), a **Student Showcase** (winning entries shown with permission, plus your own entries), **Culture & community** (houses, clubs, school services) and a **Digital Student ID** card (name, class, year, house, campus number; printable; backdrop designed in Moda). The News page opens with a **Highlights** strip of recent winners.
- **Staff**: **Campus Insights** (who is taking part and in what: active students, completions by category and by week, competition entries, house points, club capacity; nothing new is tracked), a Student Voice inbox to answer, plan, close or delete ideas, and **Display mode**: a full-screen classroom screen that rotates coming-up events, open competitions, news, house points and clubs with a clock, from the staff portal's Campus Hub.
- Database: `supabase/compassed-v2.6-campus.sql` (run once after v2.4.2) adds the ideas and votes tables and the insights function. Preview mode mirrors all of it.
- Housekeeping: duplicate logo files and an unused headers file removed; the Vercel copy now sends real security headers (`vercel.json`); the changelog is no longer excluded from Vercel; README file map and setup order corrected.

## v2.5 — 29 October 2026
- **The compass transition.** Moving between pages now has one cinematic beat: a black veil blurs the page away while the compass needle spins up and settles precisely on north, then the next page opens from the compass as the rose flies past the camera. It runs on every page-to-page link, after sign-in and on sign-out, on desktop, tablet and phone (about a second in all, with the page load hidden inside it). The compass rose and needle were designed in Moda (`assets/art/compass-rose.png`, `compass-needle.png`); the motion, easing and blur are CSS, because a video overlay cannot be transparent, flicker-free or reduced-motion aware.
- **Route swaps inside the portals** use the browser's View Transitions API where available (Chrome, Edge, Safari 18, Firefox 144): the old content blurs and settles into the new one in a quarter of a second while the sidebar and top bar stay put. Older browsers keep the previous instant render.
- **No flicker, no traps.** `assets/tx.js` runs before the arriving page's first paint, so the veil is already there; it clears itself after 900 ms, on back/forward restores, and never runs for `prefers-reduced-motion` users (who get instant navigation as before). Downloads, external links, in-page anchors, modifier clicks and hash routes are never intercepted.
- Fixes: the Moda badge is painted out of the About page's band image; the calendar page no longer throws if you leave it before its events arrive.

## v2.4.4 — 28 October 2026
- **Less empty space.** Grids are capped at four, three or two columns (no more seven-across category rows with one orphan tile on wide screens); section padding roughly halved so blocks sit closer; the numbers strip docks onto the bottom edge of the hero; recent winners and the school links share one two-column section. Home page height at laptop width went from about 6700 px to 5500 px with nothing removed.
- **Polish pass.** One navigation on every public page (Home, Explore, Competitions, Calendar, Clubs, News, About); the Calendar and News links now land on their sections. Home page reordered so the school's own sections sit between the live campus blocks: hero, numbers, categories, the Principal's welcome, competitions, the learning journey, calendar and news, beyond the classroom, clubs, gallery, links, get started, schoolwork.
- Fixes: the About trailer no longer stretches to the poster's portrait shape; tables (class students, login codes) scroll inside their card on phones instead of pushing the page sideways; filter segments wrap on small screens; the portal campus page no longer keeps its loading skeleton; Clubs, Review queue, Search and Classes pages got the same header line as every other page.

## v2.4.3 — 28 October 2026
- Home page sections modelled on the Compass International School Doha site: a welcome from the Principal with the quote "Every child is different. Every path should be too." (Jamie Hughes, Principal), the learning journey by stage (Early Years, Primary, Secondary, Sixth Form), "Beyond the classroom" (arts, STEAM, sport and wellbeing, social purpose, with the Global Campus collaborations), and "Four steps to get started". The About page lists the Themaid and Madinat Khalifa campuses. Reveal-on-scroll now covers the whole home page.

## v2.4.2 — 28 October 2026
- **Feedback button** in both portals (bottom right), modelled on Compass Dash: a star rating, a category, a message, a honeypot and a 30-second cooldown. Only the administrator can read it, under Admin > Feedback (New/All/category filters, mark as seen, delete, average rating). Database: run `supabase/compassed-v2.4.2-feedback.sql`.
- **v2.4.1**: the Moda export badge is cropped out of every video.

## v2.4 — 28 October 2026
- **Compass Ed** is the name everywhere (pages, portals, policies, manifest, sample data); the live school record was renamed with a one-off patch at the time.
- **ECA**: the Clubs section says "ECA and after school" and "ECA (extra-curricular activities)" instead of "Lunchtime".
- **The campus home page inside both portals** (`#/campus`): the same page as the public site, rendered by one shared module (`assets/campus.js`), so students and staff browse it without signing out. Links go to the right place in each portal.
- **Motion**: "Welcome to campus" rises in word by word with an underline sweep on the sign-in page; sections reveal as you scroll; cards, tiles and list rows lift on hover; buttons press; nav links underline; inputs glow on focus. All of it respects "reduce motion".
- **Ambient loops designed in Moda**: a looping hero animation behind the home-page banner and the campus header in both portals, and a looping panel animation behind the sign-in page, both as small muted videos with a still fallback.
- **Tighter layouts**: smaller section padding, a stat strip under the hero, compact gallery tiles, consistent card and grid gaps, less dead space on the home page and in the portals.
- **Version preview** for this release is hand-coded as an animated SVG (no Moda), as requested.

## v2.3 — 28 October 2026
- **Login codes** in the exact form `1234-5678`: made by staff, unique, printable as cut-out cards, revocable, with a tidy-up for old ones. A blank code creates an account on first use; a code made for an existing account signs them in and asks for a new password (credential reset). New "Use a code" tab on the sign-in page.
- **Admin dashboard** (`#/admin` in the staff portal, administrators only): overview of accounts, activity, codes, security and integrations; login codes; calendar feeds; links. "Sign out everywhere" and "New login code" inside every account editor.
- **Privacy Policy, Terms of Service, Cookie Policy**, a printable parent/carer **consent form**, consent tick boxes on sign-up and code set-up, a one-time consent step for existing accounts, and a cookie notice.
- **Houses** coloured North red, East green, South blue, West yellow everywhere (leaderboards, pills, admin).
- **Global Campus and other calendars**: subscribe to any iCalendar (.ics) feed; events are mirrored into every calendar with a source tag and refreshed on sync (`ed_feeds_sync_all()` for pg_cron). Global Campus has no public API, so the feed is the supported route; the admin can also add Global Campus as a link.
- **Compass Dash connection**: both sites share one database, so Compass Ed calls Compass Dash's own functions. Students link their Compass Dash code and username in Settings and see XP, this week's XP, mastery, assignments and teacher announcements from Compass Dash on Home and Notices; everyone sees the Compass Dash house cup, challenges and leaderboard under House points.
- **Graphics made in Moda**: sign-in page artwork (dot grid, geometric shapes, gradients), a light abstract band for the About page and dark sections, and this version's animated preview. The brand kit (palette, fonts, logos) lives in Moda.
- **Fixes**: sign-in page logo alignment (white logo on the dark panel, no inverted filter); the staff sidebar logo was black on black; the public header logo now flips to white in dark mode; mirrored events cannot be deleted by hand.
- **Security**: the committed SQL no longer contains a real administrator password (placeholder only; change yours under Settings if it was ever committed); `supabase/local/` is git-ignored for local secrets.
- Database: run `supabase/compassed-v2.3.sql` after v2.0 and v2.1. Enable the `http` extension in Supabase for calendar feeds.

## v2.2 — 28 October 2026
- Student and staff portals moved to their own directories: `/student/` and `/teacher/`.
- Simplified navigation: seven grouped sections per portal with sub-tabs instead of a long list.
- Graphics: animated compass hero, patterned category tiles, illustrated empty states, a new campus band on the home page.
- Starter content pack (`supabase/content-pack.sql`): 16 activities across all eight categories, four competitions, five clubs, two news posts and a launch event.
- Versions page with changelog and animated previews.
- Bug fixes: stale demo data after upgrades, hero eyebrow sizing, several empty states.

## v2.1 — 28 October 2026
- Houses, points and leaderboards; badges; file uploads; parent summary links; clubs; newsletter builder; winners' gallery; age bands; question bank with CSV import; topics view; timed assessments with results; peer review; register and seating plan; offline support; search; accessibility settings (dark mode, dyslexia-friendly reading, detail level, transparency).

## v2.0 — 28 October 2026
- Standalone campus platform with its own accounts, classes and content, modelled on a campus hub: activity categories, competitions, news, calendar, announcements alongside the schoolwork toolkit.

## v1.0 — 28 October 2026
- First build as a companion to Compass Dash: student and teacher portals, lessons, playlists, quizzes, mastery checkpoints, assignments with drafts and rubrics, review queue, heatmap, calendar, announcements.
