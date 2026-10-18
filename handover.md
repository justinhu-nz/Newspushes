# Push Feed — How the System Works

Oct 19, 2026 · @Justin

## Overview

Push Feed is a live public feed of news push notifications, collected by one spare Android phone and shown on a free website within about a minute of arriving.

It has four parts, and none of them is a server you run:

1. **The phone** has the news apps installed. MacroDroid copies every notification they send to a Google Form.
2. **The Google Form** turns each copy into a new row in a private Google Sheet.
3. **The Sheet** has a "Latest" tab that always holds the newest 150 notifications. Only that tab is published to the web, as a CSV file.
4. **The website** is one page, `index.html`, plus an `icons/` folder of app icons, hosted on GitHub Pages. Each visitor's browser downloads the CSV every 60 seconds and shows it as a feed.

Everything runs on free tiers. The only code in the system is the web page.

## Journey of one notification

A headline reaches the website in about 30–90 seconds. Almost all of that is waiting for the next scheduled check, not processing.

1. **A publisher sends a push.** For example, NZ Herald alerts its readers. The phone receives it like any other phone would.
2. **MacroDroid notices it (under 1 second).** Its "Notification Received" trigger fires for the news apps you ticked.
3. **MacroDroid submits the Form (about 1 second).** It sends the app name, package, title, text and the exact time posted, as if someone had filled the Form in.
4. **Google adds a row to the Sheet (instant).** The Form's own Timestamp column is filled in automatically.
5. **The "Latest" tab updates (instant).** Its formula re-sorts and keeps the newest 150 rows.
6. **Google refreshes the published CSV (seconds).** One check on 19 Oct 2026 found the published copy at most about 27 seconds behind.
7. **A visitor's browser downloads the CSV (every 60 seconds).** The page spots rows it hasn't shown before and highlights them in red for a few seconds.

**Measured on 19 Oct 2026:** the phone-side timestamp and the Form's timestamp matched to the same second on every row checked. Capture is effectively instant; the 60-second refresh sets the pace.

## 1. The phone and MacroDroid

The phone's only job is to receive pushes and forward them. One MacroDroid macro, "Forward notifications", does all of it.

**Trigger: Notification Received**

- **Apps:** only the news apps you want in the feed (currently NZ Herald, RNZ, Stuff, The Spinoff, 1News, AT Mobile).
- **Text content:** Any.
- **Ignore ongoing:** on, so music players and downloads are skipped.
- **Prevent multiple triggers:** on, so an app updating the same notification doesn't create repeats.
- **Sound filter:** any. Some publishers send silent pushes overnight.

**Action: HTTP Request**

- **Method:** POST
- **URL:** `https://docs.google.com/forms/d/e/1FAIpQLSeibGe_C0sqBsIzgKc2doquifP7l_jqyNGjO2I-Algh6sgrTw/formResponse`
- **Query params:**

| Key | Value | Form question |
| --- | --- | --- |
| `entry.146991690` | `{not_app_name}` | App |
| `entry.436763722` | `{not_app_package}` | Package |
| `entry.1268846484` | `{not_title}` | Title |
| `entry.1583331323` | `{notification}` | Text |
| `entry.1649855120` | `{not_timestamp}` | Posted at |

**Always-on settings:** Notification Access granted to MacroDroid; MacroDroid and every news app set to Unrestricted battery use; phone plugged in, ideally with a charge limit; Wi-Fi kept on during sleep; automatic system updates off.

The heartbeat macro is switched off. The website's "Last alert" line stands in for it.

Adding a publisher: install its app, turn its notifications on, then tick it in the macro's trigger. Nothing else changes.

## 2. The Google Form and Sheet

The Form is the inbox and the Sheet is the archive. Neither needs any code.

**The Form** has five short-answer questions: App, Package, Title, Text, Posted at. None is required, because Google silently drops a submission that misses a required answer while still reporting success. Email collection and sign-in are off.

**The responses tab** (`Form responses 1`) gets one row per notification, plus Google's own Timestamp column. Nothing ever needs editing here. It is the full archive and stays private.

**The "Latest" tab** holds two formulas:

| Cell | Formula | What it gives |
| --- | --- | --- |
| A1 | `=QUERY('Form responses 1'!A:F, "select A, B, C, D, E, F where B is not null and B <> 'heartbeat' and B <> 'TEST' order by A desc limit 150", 1)` | Header row, then the newest 150 real notifications, newest first |
| H2 | `=MAX('Form responses 1'!A:A)` | Time of the newest row (the website no longer needs this) |

Column G stays empty as a spacer. The QUERY recalculates on its own whenever a Form response arrives.

To show more or fewer alerts on the site, change `limit 150` in A1. More rows means a bigger download for every visitor every minute.

## 3. The published CSV

The CSV is a public, read-only copy of the "Latest" tab, and it is the only part of the Sheet anyone else can see.

- **Link:** `https://docs.google.com/spreadsheets/d/e/2PACX-1vSeR3fuA85VYkk9nKiFzluKcxM86cBwqAgl85NQZkL3pX6NxhC_lZ1ODq8MKp7giwG4HvcKiLrIr36i/pub?gid=1296297111&single=true&output=csv`
- **Set up via:** File → Share → Publish to web → "Latest" (not "Entire document") → Comma-separated values.
- **What's in it:** the header row, up to 150 alerts, and the H2 value. Cells containing commas, quotes or line breaks are wrapped in double quotes, the standard CSV rule.
- **Freshness:** one check on 19 Oct 2026 found it at most about 27 seconds behind the Sheet.

The `2PACX-…` ID in the link is a separate publishing ID. It cannot be used to open or edit the Sheet itself.

To stop the website, unpublish: File → Share → Publish to web → Stop publishing. The page then shows "Can't reach the feed".

## 4. The website (index.html)

The whole site is one page plus its app icons. It downloads the CSV, turns it into cards, and repeats every 60 seconds, all inside the visitor's browser.

**What it does, in order** (each step is a labelled section in the file's comments):

1. **Reads the CSV** with a small built-in parser that handles quoted commas, doubled quote marks and multi-line alerts.
2. **Turns rows into alerts.** Columns are found by header name, so reordering them in the Sheet is safe. Heartbeat and test rows are skipped.
3. **Picks the time** from "Posted at", the phone's exact timestamp. The Form's Timestamp column is only a fallback, because its day/month/year format has no time zone.
4. **Picks the headline.** Text is always the headline. Title shows as a small line above it only when it adds something: AT Mobile's alert title or The Spinoff's author, but not NZ Herald's repeated "NZ Herald".
5. **Downloads with a cache buster:** a changing number on the end of the link, so no browser or server can serve an old copy.
6. **Removes repeats.** The same app sending the same headline again within 30 minutes is shown once: the first copy. Headlines are compared ignoring capitals, spacing and curly versus straight quotes. A genuine re-push after 30 minutes is kept, so the push history stays honest. The Sheet itself still keeps every row.
7. **Splits the feed into tabs.** News is the main tab. AT Mobile goes on its own tab, because its service alerts aren't news. Link straight to it with `#side` on the end of the address.
8. **Draws the feed** in the style of iOS dark-mode notifications: dark rounded cards on black, the app's icon on the left, a bold title, the text below, and the time on the right ("now", "12m ago", "14:43", "Fri 16:04"). The page is always dark, whatever the visitor's device is set to. Cards are grouped under Today, Yesterday and dated headings, in NZ time for every visitor.
   - The bold title is the alert's own title (AT Mobile) or author (The Spinoff), otherwise the app's name.
   - Long alerts are cut to four lines; tap a card to show the rest.
   - When repeats were hidden, the card shows as a stack with a red count badge on its icon.
   - Alerts new since the last check drop in with a short animation.
   - Fonts: iPhones and Macs use their built-in San Francisco font; other devices get Inter, a free look-alike from Google Fonts. Apple's own font files aren't loaded, because their licence only covers Apple devices.
9. **Shows the exact time on hover.** Hovering, tapping or tabbing to a card's time shows the app's name and the full date and time to the millisecond with its time zone, for example `Mon, 19 Oct 2026, 8:48:26.600 am NZDT`. If repeats were hidden, it also says how many and when the last one came.
10. **Shows feed health** in the header: green "Last alert 3 min ago", amber "Quiet for 4 h" after 3 hours with nothing new, red "Can't reach the feed" if a download fails. On a failure it keeps showing the last good alerts and retries next minute.

**Settings** live in the `CONFIG` block at the top of the `<script>` section:

| Setting | Current value | What it controls |
| --- | --- | --- |
| `CSV_URL` | your published link | Where alerts come from |
| `REFRESH_SECONDS` | 60 | How often to check |
| `FETCH_TIMEOUT_SECONDS` | 15 | When to give up on a slow download |
| `QUIET_AFTER_MINUTES` | 180 | When the dot turns amber |
| `TIME_ZONE` | `Pacific/Auckland` | Clock shown to visitors; `null` uses their own |
| `IGNORE_APPS` | heartbeat, test | App names never shown |
| `SIDE_TAB` | AT Mobile | Apps moved off the news feed onto their own tab; `null` for one feed |
| `DEDUPE_WINDOW_MINUTES` | 30 | How close together two identical alerts must be to count as a repeat |
| `ICONS` | 9 apps | Which icon file in `icons/` goes with which app name; unlisted apps get their initials on a coloured square |

**App icons** are 120 px PNGs in `icons/`, made from the originals in `app icons/`. To add one: save a square image as `icons/<name>.png` and add a line to `ICONS` with the app's name exactly as it appears in the Sheet's App column (capitals don't matter).

**Built-in protections:** headlines are always inserted as plain text, so a headline containing code is displayed, never run. Refreshes pause while the tab is hidden and catch up when it's visible again, which saves visitors' data and Google's servers.

**Tested 19 Oct 2026** in a headless browser against your real alerts plus deliberately awkward ones: 21 of 21 checks passed, covering parsing, bylines, filters, the 60-second refresh, new-alert highlighting, an outage and recovery.

## Hosting on GitHub Pages

GitHub Pages serves the site for free; it carries almost none of the load, because each visit downloads the page and icons (about 140 KB) once and every refresh after that goes to Google.

**Setup (about 10 minutes):**

1. Create a free GitHub account and a **public** repository, for example `push-feed`. Free accounts can only publish public repositories.
2. Upload `index.html` and the `icons` folder by dragging them onto the repository page, then commit.
3. Settings → Pages → Source: deploy from the `main` branch, root folder → Save.
4. About a minute later the site is live at `https://<your-username>.github.io/push-feed/`.
5. Optional: connect your own domain under Settings → Pages → Custom domain. HTTPS is free.

**To update the site,** edit `index.html` on GitHub (the pencil icon) or upload a new copy. Changes go live in about a minute.

**GitHub's rules that apply:**

- No commercial use. A free hobby feed is fine; ads or paid accounts would mean moving hosts.
- Sites copying an existing website must be written yourself, collect no user data, and carry a prominent "not affiliated" note. The page's footer already has one.
- Soft limit of 100 GB of bandwidth a month, about 2.5 million visits at this page size.

Cloudflare Pages is a drop-in alternative with no bandwidth cap and no ban on commercial use. Source: [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits).

## Speed, limits and capacity

The system comfortably beats the 10–120 second target; the practical ceiling is how many people watch at once, not how many alerts arrive.

| Part | Limit or figure | What it means here |
| --- | --- | --- |
| Phone → Sheet | Same second, measured 19 Oct 2026 | Capture adds no meaningful delay |
| Sheet → published CSV | About 27 s or less, one check | Small, but test it a few times |
| Website refresh | Every 60 s | Sets the worst-case delay: about 90 s |
| CSV download | About 30 KB at 150 rows | Per visitor, per minute, while the tab is open |
| Sheet size | About 10 million cells | Over 1.5 million alerts across 6 columns; it gets slow to open long before that |
| GitHub Pages | 100 GB / month soft limit | About 2.5 million visits |

**Where it would strain first:** every open tab asks Google for the CSV once a minute. A few hundred viewers is fine. A viral spike could see Google slow or block those requests. The fix then is the Apps Script backend with a shared cache, or Supabase.

## Privacy and security

Only the 150 newest alerts are public. The archive, the Form and the Sheet stay private, as long as the settings below stay as they are.

| Thing | Who can see it | Keep it that way by |
| --- | --- | --- |
| Published CSV ("Latest" tab) | Anyone | Publishing only that tab, never "Entire document" |
| The Sheet and its archive | Only you | Sharing set to Restricted |
| The Form's submit address | Only the phone | Never posting it; it lives only in MacroDroid |
| Form responses summary | Only you | "View results summary" turned off in Form settings |
| `index.html` and its code | Anyone | Nothing to hide: it holds only the public CSV link |

**The one real weakness:** the Form has no password. Anyone who finds its address can add rows, which would then appear on the site. If that happens, make a new Form, link it to the Sheet, and put the new entry IDs into MacroDroid. That takes about 15 minutes.

**Check once:** open the CSV link and change the `gid=` number to another tab's number. It should refuse. If it shows data, re-publish with only "Latest" selected.

## Maintenance routine

Day to day there's nothing to do; a glance at the status dot is the whole check.

**Daily (5 seconds):** open the site. Green means alerts are flowing. Amber in the middle of a weekday means the phone may need a look.

**After the phone restarts:** open MacroDroid once and confirm the "Forward notifications" macro is on.

**Monthly (2 minutes):** check the phone is charging and not swollen or hot. Clear any news app that has started asking you to log in or update.

**When the archive gets big** (Sheets slows noticeably around 100,000 rows, likely one to two years at this morning's pace):

1. In the responses tab, select every row older than the cut-off.
2. Copy them into a new spreadsheet named, for example, "Push Feed archive 2026", and save it.
3. Delete those rows from the responses tab. The Form keeps adding to the bottom as before.

The Latest tab only ever shows the newest 150, so archiving never changes what visitors see.

## Troubleshooting

Work from the phone outward: check the Sheet first, because it tells you which half of the system is broken.

| What you see | Likely cause | Fix |
| --- | --- | --- |
| Site amber or stale, Sheet has no new rows | Phone side stopped | Check the phone is on, charging and on Wi-Fi; MacroDroid macro switched on; Notification Access still granted |
| One publisher missing from the Sheet | That app's notifications are off, or it isn't ticked in the trigger | Re-enable in the app and in Android settings; tick it in the macro |
| Sheet has new rows, Latest tab doesn't | Formula error, often a renamed responses tab | Check A1 for `#REF!`; fix the tab name between the single quotes |
| Latest tab is fine, site stale | Published copy lagging, or publishing stopped | Open the CSV link in a browser; if it's old or an error, re-publish the Latest tab |
| Site red: "Can't reach the feed" | CSV link wrong or unpublished, or the network is down | Open the CSV link directly; if that works, compare it with `CSV_URL` in `index.html` |
| Site red, CSV link opens fine in a tab | The browser is blocking the cross-site download | Press F12 → Console; a "CORS" error confirms it. Tell me and we'll route it through a small proxy |
| Headline cut off at an `&` | MacroDroid didn't encode the text | Switch to a form-encoded body (ask for the steps) |
| Same alert appears twice | App re-posted it more than 30 minutes later, or changed the wording | Usually a real re-push. Hover the time to compare; raise `DEDUPE_WINDOW_MINUTES` if it's noise |
| Site shows a junk row | Someone found the Form address | Delete the row in the Sheet; replace the Form if it recurs |

**First-time check after uploading:** open the live site and press F12 → Console. No red errors and a green dot means everything works end to end. This is the one step that couldn't be tested before going live, because the test machine couldn't reach Google.

## Known quirks and upgrade path

The system has three small known quirks, and a clear next step if it outgrows Google Forms.

**Quirks:**

- **A leading apostrophe disappears.** Sheets treats a `'` at the very start of a cell as a hidden "text" marker, so 1News's `'Clinical': …` arrives as `Clinical': …`. Only headlines starting with a straight apostrophe are affected.
- **The Form's Timestamp column has no time zone.** The website uses "Posted at" instead, so this only matters if you read the Sheet directly.
- **Duplicates are removed only on the website.** The Form and Sheet keep every row, repeats included. The page hides repeats (see section 4), and "Prevent multiple triggers" on the phone stops most of them before they're sent. Repeats still use up places in the Latest tab's 150 rows.
- **The 150-row window can split a repeat pair.** If the first copy of an alert drops out of the newest 150 while a repeat is still inside, the repeat shows on its own. This only happens at the very bottom of the feed.

**When to upgrade,** and to what:

| If you want… | Move to | What changes |
| --- | --- | --- |
| A password on submissions, de-duplication, a shared cache for busy traffic | Apps Script web app (the `Code.gs` file from earlier) | MacroDroid points at a new URL; the site reads JSON instead of CSV |
| Search across the full archive, analytics, many phones | Supabase (free Postgres database) | Same phone setup; the site reads from Supabase, with live updates |
| No missed alerts during Wi-Fi drops | A forwarder app with a retry queue | Only the app on the phone changes |

In each case the phone's news apps and the overall shape stay the same; you swap one part at a time.
