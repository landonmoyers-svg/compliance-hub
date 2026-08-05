# Compliance Hub — Desktop app

A thin, hardened **Electron** shell around the hosted web app. It loads the
production URL (`https://compliance-hub-lone-peak.vercel.app`) in a native
window, so the desktop app is always in sync with what's deployed and every
`/api` route + Supabase login works exactly as in a browser. It does **not**
bundle the server or store data locally.

## Run in development

```bash
cd desktop
npm install
npm start
```

Point at a different environment with `COMPLIANCE_HUB_URL=... npm start`.

## Build an installer locally

- macOS (`.dmg`, on a Mac): `npm run build:mac` → `dist/Compliance Hub-<ver>.dmg`
- Windows (`.exe`, on Windows): `npm run build:win` → `dist/Compliance Hub Setup <ver>.exe`

The local scripts build **unsigned** (`CSC_IDENTITY_AUTO_DISCOVERY=false`), so
macOS Gatekeeper / Windows SmartScreen will warn on first open (right-click →
Open on macOS). For distribution you must **code-sign + notarize** — see below.

## Signed cross-platform release (CI)

`.github/workflows/desktop-release.yml` builds signed macOS + Windows installers
on GitHub's runners and publishes them to a GitHub Release (which also powers
auto-update). Trigger it by pushing a tag like `desktop-v1.0.1`.

You must add these repository **secrets** (Settings → Secrets → Actions) — the
build won't sign without them:

**macOS (Apple Developer account, $99/yr):**
- `MAC_CSC_LINK` — base64 of your Developer ID Application `.p12`
- `MAC_CSC_KEY_PASSWORD` — the `.p12` password
- `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` — for notarization

**Windows (Authenticode cert):**
- `WIN_CSC_LINK` — base64 of your code-signing `.pfx`
- `WIN_CSC_KEY_PASSWORD` — the `.pfx` password

`GITHUB_TOKEN` (auto-provided) publishes the release. Bump `version` in
`package.json` for each release so auto-update can compare.

## Auto-update

`electron-updater` checks the GitHub Releases of `landonmoyers-svg/compliance-hub`
on launch and installs newer **signed** builds. Unsigned local builds don't
auto-update (expected).

## Notes

- External links and non-app origins open in the system browser.
- Password-reset / invite emails link to the web URL and open in the browser;
  users finish there, then sign in inside the app.
- Icon source: `build/icon.png` (electron-builder generates `.icns`/`.ico`).
