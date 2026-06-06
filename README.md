# Countdown Deck

A cross-platform desktop dashboard of live countdown timers. Track anything with a date — a SpaceX IPO, the next season of *House of the Dragon*, a launch, a birthday — and watch it tick down from days to seconds. Built with Electron, so it runs on **macOS, Windows, and Linux**, and updates itself via GitHub Releases.

## Features

- Dashboard of multiple countdowns, each showing **days / hours / minutes / seconds**, updating every second.
- **Add, edit, and remove** countdowns. Each has a title, target date & time, accent color, and category.
- **Count-up mode** — track time *elapsed since* an event, not just time remaining.
- **Natural-language entry** — type "Friday 9pm", "in 3 weeks", "next Christmas", or "tomorrow 6am" and it fills the date for you, with a live preview.
- **Per-countdown entry timezone** — interpret a countdown's time in a chosen zone (e.g. always 9 PM ET) regardless of your display timezone.
- **Live market status** — trading cards show **Open / Pre-market / After-hours / Closed** in real time.
- **Calendar (.ics) import** — bring in events from Google Calendar, Outlook, or Apple Calendar (Settings → Data); future events become countdowns.
- **World clocks** — add a card that shows the live current time in any timezone.
- **Toolbar clock** — an optional always-visible clock in the toolbar, **analog or digital**, with its own timezone, size, and color (Settings → Menu-bar clock).
- **Recurring** countdowns (weekly / monthly / yearly) that automatically roll forward to the next occurrence.
- **Pin** important countdowns to the top, **drag to reorder**, **search**, **sort** (soonest / name / manual), and **filter by category**.
- **End-of-countdown alerts**, chosen per countdown — any combination of a **sound** (six built-in alarm tones, or your own uploaded audio), a **banner notification**, and a **full-screen flash**. Each countdown can use one, several, or all at once.
- **Milestone reminders** — optional heads-up banners at 1 day / 1 hour / 10 minutes before a countdown ends (per countdown; fire once per occurrence).
- **Progress bars** on each card showing how far along you are toward the target.
- **Focus mode** — click any card to view that single countdown full-screen with oversized digits, its background, large icon, and progress bar.
- **Quiet hours** — a scheduled mute window (e.g. 10 PM–7 AM) on top of the manual Do Not Disturb toggle, plus a **configurable snooze length**.
- **Light / dark theme** toggle.
- **Menu-bar / system-tray view** with your choice of what to show: the **soonest** countdown, a **specific** one you pick, or **cycle** through them all at an interval you set. Plus an optional **always-on-top** window.
- **Auto-find dates** — search a movie or TV show and the app fills in the real date automatically. **TV shows use [TVmaze](https://www.tvmaze.com/api)** (free, no key) to get the next episode's **exact air time including timezone** (e.g. a 9:00 PM ET premiere lands precisely). **Movies use TMDB** release dates (needs a free key). Manual entry always remains available.
- **Import / export** your countdowns to a JSON file.
- **Trading-session countdowns** for major exchanges (NYSE, Nasdaq, TSX, LSE, XETRA, Euronext, TSE, HKEX, SSE, NSE, ASX). Each session — pre-market open, market open, close, post-market close — counts down in the exchange's own timezone, automatically rolls to the next trading day, and **skips weekends (plus US market holidays for NYSE/Nasdaq)**.
- **Date/time format and display timezone** of your choice (System, ISO, US, European, or Long; 12/24-hour; any timezone), applied across every countdown.
- **Per-countdown backgrounds** — auto gradient from the accent color, a bundled generated image, an animated gradient/canvas, or **your own uploaded image / GIF / video**. Same options for the **dashboard background**, generated and set by default.
- **Fonts and sizes** — pick the overall UI font and size, and a font and text size per countdown.
- **Theme palettes & accent** — six curated palettes (Midnight, Daylight, Slate, Mocha, Forest, Rose) plus a global accent-color override.
- **Six layouts** — Cards, Compact, List, Column, Gallery, and Fan — plus optional collapsible category grouping. The progress bar shows in every layout.
- **Animated digits & urgency cues** — digits flip as they change, and timer numbers shift to amber (under an hour) then red (final minute).
- **Per-card background dim & blur** sliders so text stays readable over any image, plus ten bundled backgrounds.
- **Polish** — first-run welcome, empty-state illustration, smooth modal transitions, and keyboard shortcuts (**N** new, **/** search, **Esc** close).
- **Mini widget** — a small frameless, always-on-top window showing your soonest countdown (toggle from the toolbar ▦/clock button). Keeps ticking even when the main window is hidden.
- **Menu-bar popover** — left-click the tray icon for a quick popover list of your countdowns without opening the main window; click one to jump to it.
- **Auto-backup & file-based sync** — pick a backup folder (e.g. inside Dropbox/iCloud/OneDrive) and a copy is written on every change; optionally load the backup on launch if it's newer, plus a one-click Restore.
- **Command palette** — press **⌘K / Ctrl+K** to run actions (add, settings, theme, DND, group, mini widget) or fuzzy-jump to focus/edit any countdown.
- **Custom keyboard shortcuts** — map your own key combos to core commands in Settings → Keyboard shortcuts.
- **Customizable progress bars** — choose the bar's style (flat, rounded, striped, glow, sweep — the last three animated), height, **position** (below the timer, bottom edge, top edge, or hidden), and color.
- **Per-card icons** — an icon before each title, chosen automatically from the category/kind (e.g. 💲 for markets, 🚀 for space, 📺 for TV), or set to any emoji or your own uploaded image. Icons also appear in the mini widget, tray popover, and menu-bar text.
- **Home button + category tabs** — click the **Countdown Deck** wordmark (now a styled logo) to return to all countdowns; a browser-style tab strip switches between **All** and each category.
- **Configurable toolbar position** — place the toolbar at the top, left, right, or bottom of the window.
- **Mini widget upgrades** — **scroll** over it to cycle through countdowns, it shows a progress bar, and it matches your progress-bar styling and icons.
- **Auto-snooze** — per countdown, keep re-alerting at the snooze interval until you dismiss the flash.

### Tray, mini widget & windows

Left-clicking the tray icon opens a small popover panel; right-click pops up the full menu (with **Show Countdown Deck** and **Quit**) and hides the popover so the two never overlap. The mini widget and popover both follow the **menu-bar / mini widget show** setting (Settings → Window), so choosing **Cycle through all** makes the widget rotate through your countdowns. Closing the main window hides it to the tray rather than quitting. The mini widget and popover are fed live from the main window each second, so the main window stays running in the background (`backgroundThrottling` is disabled to keep timers accurate while hidden).
- A custom app icon, and **full auto-update** via `electron-updater` against GitHub Releases, with an in-app badge and one-click "restart to update."

### Trading sessions

US exchanges (NYSE/Nasdaq) skip weekends **and** market holidays. The holiday calendar is **computed by rule for any year** (no hard-coded list to maintain, no network needed): New Year's, MLK, Washington's Birthday, Good Friday, Memorial Day, Juneteenth, Independence Day, Labor Day, Thanksgiving, and Christmas — with the standard weekend-observance rules (including the NYSE quirk that a New Year's Day falling on Saturday is *not* observed the preceding Friday). It also models **early-close half-days** (1:00 PM ET): the day after Thanksgiving, July 3 when it precedes a weekday Independence Day, and Christmas Eve when it's a normal trading day. Other exchanges skip weekends only, and lunch breaks aren't modeled.

The day after Thanksgiving, etc., will show "early close" in the card. The whole calendar lives in `usCalendar()` in `src/renderer/app.js` if you ever need to tweak a rule.

A few **one-click trading presets** (NYSE open/close, LSE open, TSE open) appear as quick-add chips on the empty dashboard and in the Add dialog.

### Alerts

In the Add/Edit dialog, "Alerts when it ends" lets each countdown independently turn on a sound, a banner notification, and/or a full-screen flash. The six built-in sounds (Beep, Digital alarm, Chime, Bell, Radar, Pulse) are **synthesized at runtime with the Web Audio API** — no audio files are bundled, nothing to license, and it works offline. You can also upload your own MP3/WAV/OGG (stored like other media via the `cdmedia://` protocol). Use **Preview** to audition a sound while configuring. The flash overlay shows the countdown's title in its accent color, auto-dismisses after a few seconds (or on click / Esc), and honors "reduce motion." It also has a **Snooze 5 min** button that re-fires the alert after five minutes. Recurring and trading-session countdowns fire the same alerts each time they roll over.

Each card has a **🔔 test button** that previews its configured alerts on demand (this bypasses Do Not Disturb). The toolbar's **bell toggle** is a global **Do Not Disturb** — when on, all end-of-countdown alerts (sound, banner, flash) are muted until you turn it back off; the icon turns to 🔕 and is highlighted.

### Backgrounds & uploads

Bundled backgrounds live in `src/assets/backgrounds/`. Uploaded media is copied into the app's user-data folder and served through a private `cdmedia://` protocol, so your files never leak absolute paths into the saved data. Animated options are CSS/canvas (GPU-friendly) and honor "reduce motion" system settings.

### Where the dates come from

- **TV shows → [TVmaze](https://www.tvmaze.com/api).** Free and keyless. The app reads each episode's `airstamp` (a full ISO 8601 timestamp with timezone offset, e.g. `2026-06-21T21:00:00-04:00`) and sets your countdown to that exact instant, displayed in your local time. If a show has no upcoming episode dated yet, it tells you and you can set the date manually.
- **Movies → TMDB** (needs the free API key below). TMDB stores a release *date* but not a time, so the app fills a default time you can adjust.

### Setting the TMDB API key (movies only)

The movie lookup uses [The Movie Database](https://www.themoviedb.org). It's free: create an account, go to **Settings → API**, request a **v3 API key**, then paste it into Countdown Deck's **Settings (⚙)**. The key is stored locally on your machine only.

When you pick a search result, the app calls TMDB again to get the **real next date** — for a TV show that's its *next episode to air* (e.g. a Season 3 premiere, once announced), and for a movie it's the release date. Two honest limitations: (1) TMDB only stores the **date**, not the broadcast **time/zone**, so the app fills a default time you can adjust; and (2) episodes/seasons that haven't been dated by TMDB yet won't return a date until they're announced — in that case the app falls back to the latest known date and tells you.

### A note on closing vs. quitting

Because of the tray view, closing the window **hides** the app to the menu bar/tray rather than quitting it. Use the tray menu's **Quit** (or Cmd/Ctrl+Q) to fully exit.

## Mobile (PWA) & code signing

- **Mobile companion:** an installable Progressive Web App lives in [`pwa/`](pwa/README.md) — the same countdown engine (date, count-up, recurring, trading sessions, world clocks, natural-language entry) running in the browser with offline support and local storage. Host that folder over https and add it to your phone's home screen.
- **Signed/notarized installers:** the build is wired for Apple notarization and Windows signing — see [`SIGNING.md`](SIGNING.md). It builds unsigned by default and turns on signing automatically once you add the credentials as GitHub secrets.

## Run it in development

You need [Node.js](https://nodejs.org) 18+ installed.

```bash
cd countdown-deck
npm install
npm start
```

> Auto-update checks are disabled while running unpackaged (`npm start`); they only run in a built/installed app. Everything else works in dev.

## Build installers locally

```bash
npm run dist          # build for your current OS
npm run dist:mac      # macOS .dmg + .zip (x64 + arm64)
npm run dist:win      # Windows NSIS installer
npm run dist:linux    # Linux AppImage + .deb
```

Output lands in `dist/`. You can only build a macOS app on a Mac and a signed Windows app on Windows (Linux/Win builds also work from CI).

## Set up auto-update (GitHub Releases)

1. Create a public GitHub repo named `countdown-deck` (or any name — just match it below).
2. In **`package.json`**, replace `REPLACE_WITH_YOUR_GITHUB_USERNAME` under `build.publish.owner` with your GitHub username (and adjust `repo` if you renamed it).
3. Push the code to that repo.
4. To cut a release, bump `version` in `package.json`, commit, then push a matching tag:

   ```bash
   git tag v1.0.1
   git push origin v1.0.1
   ```

   The included GitHub Actions workflow (`.github/workflows/release.yml`) builds on macOS, Windows, and Linux and publishes the installers + update metadata to a GitHub Release automatically.
5. Installed copies of the app check for updates ~4 seconds after launch and every 6 hours. When a newer release exists, it downloads in the background and the badge turns into "click to restart."

### A note on code signing

Auto-update works without code signing on Linux and (mostly) Windows, but:

- **macOS** requires the app to be signed and notarized with an Apple Developer ID, or Gatekeeper will block updates (and the first launch). Add your Apple signing certs as CI secrets and the `mac` signing config when you're ready to distribute publicly.
- **Windows** users will see a SmartScreen warning for unsigned builds. A code-signing certificate removes it.

Until you sign, the app and updater still function for your own use — you'll just click through the OS security prompts.

## Project structure

```
countdown-deck/
├─ package.json              # deps, scripts, electron-builder + publish config
├─ src/
│  ├─ main.js                # Electron main: window, storage, auto-update
│  ├─ preload.js             # secure bridge (contextIsolation) to the renderer
│  └─ renderer/
│     ├─ index.html          # dashboard markup
│     ├─ styles.css          # dashboard styling
│     └─ app.js              # countdown logic, CRUD, presets, update UI
└─ .github/workflows/release.yml   # multi-OS build & publish on tag push
```

## Where your data lives

- **macOS:** `~/Library/Application Support/Countdown Deck/countdowns.json`
- **Windows:** `%APPDATA%\Countdown Deck\countdowns.json`
- **Linux:** `~/.config/Countdown Deck/countdowns.json`
