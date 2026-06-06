# Code signing & notarization

By default Countdown Deck builds **unsigned** — it works, but macOS Gatekeeper and Windows SmartScreen show a warning on first launch. The project is already wired so that signing + notarization turn on automatically **as soon as you add the credentials below as GitHub repo secrets** (no code changes needed). Nothing breaks if you leave them unset.

## macOS (Apple notarization)

You need a paid **Apple Developer Program** membership ($99/yr).

1. **Create a "Developer ID Application" certificate** in your Apple Developer account (Certificates → +). Download it and export it from Keychain Access as a `.p12` with a password.
2. **Base64-encode** the `.p12` so it can live in a secret:
   ```bash
   base64 -i DeveloperID.p12 | pbcopy
   ```
3. **Create an app-specific password** for notarization at appleid.apple.com → Sign-In and Security → App-Specific Passwords.
4. **Find your Team ID** at developer.apple.com → Membership.
5. In your GitHub repo → **Settings → Secrets and variables → Actions**, add:
   - `CSC_LINK` — the base64 string from step 2
   - `CSC_KEY_PASSWORD` — the `.p12` export password
   - `APPLE_ID` — your Apple ID email
   - `APPLE_APP_SPECIFIC_PASSWORD` — the password from step 3
   - `APPLE_TEAM_ID` — your Team ID

On the next tagged build, electron-builder signs the app with hardened runtime + the entitlements in `build/entitlements.mac.plist`, and `scripts/notarize.js` submits it to Apple. If the Apple secrets are absent, notarization is skipped and the build stays unsigned.

## Windows (optional)

Windows signing needs a code-signing certificate (OV or EV) from a CA. Once you have a `.pfx`:
- `WIN_CSC_LINK` — base64 of the `.pfx`
- `WIN_CSC_KEY_PASSWORD` — its password

(EV certificates clear SmartScreen immediately; OV certificates build reputation over time.)

## Local signed build (macOS)

With your Developer ID cert in your login keychain and the Apple env vars exported:
```bash
export APPLE_ID="you@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="ABCDE12345"
npm run dist:mac
```
