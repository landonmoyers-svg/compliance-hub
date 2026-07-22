# End-to-end smoke tests

Playwright smoke suite that catches the "a page is failing" class before it ships.

## Run

```bash
npm run test:e2e:install   # one-time: download the Chromium browser
npm run test:e2e           # run the suite
```

By default it targets the deployed app. Point it elsewhere with `E2E_BASE_URL`:

```bash
E2E_BASE_URL=http://localhost:3000 npm run test:e2e
```

## What runs

- **`public.spec.ts`** — no credentials needed. Verifies the login page renders
  and anonymous users are redirected to `/auth/login`. Catches total
  build/deploy breakage.
- **`pages.spec.ts`** — signs in and walks every key page asserting each renders
  a heading and hits no error boundary. **Runs only when credentials are set.**

## Authenticated run (env vars)

MFA is enforced, so the test account needs a verified authenticator factor and
you must supply its base32 secret:

```bash
E2E_EMAIL="test@lonepeakpsychiatry.com" \
E2E_PASSWORD="…" \
E2E_TOTP_SECRET="BASE32SECRET" \
npm run test:e2e
```

Use the **Landon Test** staff account (not the owner). When you enroll its
authenticator, save the base32 secret shown during setup as `E2E_TOTP_SECRET`.

## Error monitoring

Runtime errors are caught by the app's error boundaries (`src/app/error.tsx`,
`global-error.tsx`) and POSTed to `/api/monitoring/error`, which logs them to the
server (visible in Vercel logs) and — when `SENTRY_DSN` is set in the
environment — forwards them to Sentry. No DSN → it just logs centrally, which is
already a big step up from "only when a user reports it."
