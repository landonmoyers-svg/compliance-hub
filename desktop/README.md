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

`build:mac` builds **unsigned** (`CSC_IDENTITY_AUTO_DISCOVERY=false`) → Gatekeeper
warns on first open. For a distributable macOS build, sign + notarize locally:

### Signed + notarized macOS build (local)

Prereqs (one time): an Apple Developer account, a **Developer ID Application**
certificate in your login Keychain (Xcode → Settings → Accounts → your team →
Manage Certificates → + → Developer ID Application), and a notarytool **keychain
profile** holding an app-specific password — created by *you* so the password
never leaves your Keychain:

```bash
xcrun notarytool store-credentials "compliance-hub-notary" \
  --apple-id "<your-apple-id>" --team-id "XVN4NXD6CJ"
# paste an app-specific password from https://appleid.apple.com when prompted
```

Then:

```bash
npm run build:mac:signed
```

electron-builder auto-signs with the Developer ID cert and the `notarize.js`
afterSign hook notarizes + staples via the keychain profile. Result:
`dist/Compliance Hub-<ver>-universal.dmg`, no Gatekeeper warning.
(Override the profile name with `NOTARY_PROFILE`; `SKIP_NOTARIZE=1` to sign only.)

## Signed cross-platform release (CI)

`.github/workflows/desktop-release.yml` builds signed macOS + Windows installers
on GitHub's runners and publishes them to a GitHub Release (which also powers
auto-update). Trigger it by pushing a tag like `desktop-v1.0.1`.

Add these repository **secrets** (Settings → Secrets and variables → Actions →
New repository secret) — the build won't sign without them:

**macOS** (Team ID `XVN4NXD6CJ`, Apple Developer account $99/yr):
1. Export the cert — Keychain Access → **My Certificates** → right-click
   **"Developer ID Application: Landon Moyers (XVN4NXD6CJ)"** → **Export…** →
   save a `.p12` and set a password (that's `MAC_CSC_KEY_PASSWORD`).
2. Base64 it and copy: `base64 -i developer-id.p12 | pbcopy` → paste into
   `MAC_CSC_LINK`.
3. Add `MAC_CSC_KEY_PASSWORD` (the `.p12` password from step 1).
4. Add `APPLE_ID` = `landlmoyers@gmail.com`, `APPLE_TEAM_ID` = `XVN4NXD6CJ`, and
   `APPLE_APP_SPECIFIC_PASSWORD` = an app-specific password from
   appleid.apple.com (a fresh one, or reuse the notarization one).

**Windows (Authenticode cert):**
- `WIN_CSC_LINK` — base64 of your code-signing `.pfx`
- `WIN_CSC_KEY_PASSWORD` — the `.pfx` password
- *(If you use a cloud signer — Azure Trusted Signing or SSL.com eSigner — the
  Windows step needs adjusting; ask and I'll update it.)*

`GITHUB_TOKEN` (auto-provided) publishes the release. Bump `version` in
`package.json` for each release so auto-update can compare.

The CI runs on GitHub's clean macOS/Windows runners, so it avoids the local
gotchas (iCloud xattrs, timestamp rate-limits, notary-poll timeouts) entirely.

## Auto-update

`electron-updater` checks the GitHub Releases of `landonmoyers-svg/compliance-hub`
on launch and installs newer **signed** builds. Unsigned local builds don't
auto-update (expected).

## Notes

- External links and non-app origins open in the system browser.
- Password-reset / invite emails link to the web URL and open in the browser;
  users finish there, then sign in inside the app.
- Icon source: `build/icon.png` (electron-builder generates `.icns`/`.ico`).
