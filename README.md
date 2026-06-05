# Countdown Deck

A cross-platform desktop dashboard of live countdown timers. Track anything with a date — a SpaceX IPO, the next season of *House of the Dragon*, a launch, a birthday — and watch it tick down from days to seconds. Built with Electron, so it runs on **macOS, Windows, and Linux**, and updates itself via GitHub Releases.

## Features

- Dashboard of multiple countdowns, each showing **days / hours / minutes / seconds**, updating every second.
- **Add, edit, and remove** countdowns. Each has a title, target date & time, accent color, and category.
- **Count-up mode** — track time *elapsed since* an event, not just time remaining.
- **Recurring** countdowns (weekly / monthly / yearly) that automatically roll forward to the next occurrence.
- **Pin** important countdowns to the top, **drag to reorder**, **search**, **sort** (soonest / name / manual), and **filter by category**.
- **Desktop notifications** when a countdown reaches zero (and when a recurring one rolls over).
- **Light / dark theme** toggle.
- **Menu-bar / system-tray view** with your choice of what to show: the **soonest** countdown, a **specific** one you pick, or **cycle** through them all at an interval you set. Plus an optional **always-on-top** window.
- **Auto-find dates** — search a movie or TV show and the app fills in the real date automatically. **TV shows use [TVmaze](https://www.tvmaze.com/api)** (free, no key) to get the next episode's **exact air time including timezone** (e.g. a 9:00 PM ET premiere lands precisely). **Movies use TMDB** release dates (needs a free key). Manual entry always remains available.
- **Import / export** your countdowns to a JSON file.
- A custom app icon, and **full auto-update** via `electron-updater` against GitHub Releases, with an in-app badge and one-click "restart to update."

### Where the dates come from

- **TV shows → [TVmaze](https://www.tvmaze.com/api).** Free and keyless. The app reads each episode's `airstamp` (a full ISO 8601 timestamp with timezone offset, e.g. `2026-06-21T21:00:00-04:00`) and sets your countdown to that exact instant, displayed in your local time. If a show has no upcoming episode dated yet, it tells you and you can set the date manually.
- **Movies → TMDB** (needs the free API key below). TMDB stores a release *date* but not a time, so the app fills a default time you can adjust.

### Setting the TMDB API key (movies only)

The movie lookup uses [The Movie Database](https://www.themoviedb.org). It's free: create an account, go to **Settings → API**, request a **v3 API key**, then paste it into Countdown Deck's **Settings (⚙)**. The key is stored locally on your machine only.

When you pick a search result, the app calls TMDB again to get the **real next date** — for a TV show that's its *next episode to air* (e.g. a Season 3 premiere, once announced), and for a movie it's the release date. Two honest limitations: (1) TMDB only stores the **date**, not the broadcast **time/zone**, so the app fills a default time you can adjust; and (2) episodes/seasons that haven't been dated by TMDB yet won't return a date until they're announced — in that case the app falls back to the latest known date and tells you.

### A note on closing vs. quitting

Because of the tray view, closing the window **hides** the app to the menu bar/tray rather than quitting it. Use the tray menu's **Quit** (or Cmd/Ctrl+Q) to fully exit.

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
