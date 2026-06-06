# Countdown Deck — PWA (mobile companion)

A standalone, installable web version of Countdown Deck for phones and tablets. It shares the desktop app's countdown engine (date, count-up, recurring, **trading sessions** with US-holiday awareness, and **world clocks**) plus natural-language entry, but stores data locally in the browser (`localStorage`) and works offline via a service worker.

## What's included
- Live countdowns (days/hours/minutes/seconds) with progress bars
- Add / edit / remove; category, color, and emoji icon
- Date, count-up, recurring, trading-session, and world-clock kinds
- Natural-language entry ("Friday 9pm", "in 3 weeks", "next Christmas")
- Live market-open status on trading cards
- Light / dark theme, search
- Installable to the home screen; works offline; web notifications when a countdown ends

## What's desktop-only (not in the PWA)
Tray/menu-bar widget, the always-on-top mini widget, alarm sounds & uploads, background images/video, auto-backup folders, command palette, custom global shortcuts, TMDB/TVmaze lookups, and `.ics` import live in the Electron desktop app.

## Run it
It's all static files — serve the `pwa/` folder over **https** (PWAs require https, except on `localhost`):

```bash
cd pwa
python3 -m http.server 8080   # then open http://localhost:8080
```

For real phones, host `pwa/` on any static host (GitHub Pages, Netlify, Vercel, Cloudflare Pages). On the phone, open the URL and choose **Add to Home Screen**.

> Bump `CACHE` in `sw.js` whenever you change the files, so installed copies pick up the update.
