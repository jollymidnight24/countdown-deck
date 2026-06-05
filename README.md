# Countdown Deck

A cross-platform desktop dashboard of live countdown timers. Track anything with a date — a SpaceX IPO, the next season of *House of the Dragon*, a launch, a birthday — and watch it tick down from days to seconds. Built with Electron, so it runs on **macOS, Windows, and Linux**, and updates itself via GitHub Releases.

## Features

- Dashboard of multiple countdowns, each showing **days / hours / minutes / seconds**, updating every second.
- **Add, edit, and remove** countdowns. Each has a title, a target date & time, and an accent color.
- **Presets** for quick adds, plus full manual entry.
- Countdowns are saved locally (JSON in the OS user-data folder) and restored on launch.
- **Full auto-update** via `electron-updater` against GitHub Releases, with an in-app status badge and one-click "restart to update."

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
