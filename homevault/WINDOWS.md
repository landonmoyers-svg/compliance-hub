# HomeVault on Windows

Two different things you might mean by "get it on Windows", with very different
amounts of work. Start with the first one.

## 1. Just use it — nothing to install

Open **<https://homevault-eight.vercel.app>** in Edge or Chrome.

That's it. HomeVault is a web app, so Windows needs nothing installed. Sign in
with the account you create below and it behaves exactly as it does on the Mac.

### Your vault does not follow you between computers by itself

This is the part that surprises people, and it is the security model working
rather than a bug.

Signing in proves *who you are* to the server. It does not open the vault. The
key that decrypts your records is built on this machine from two things: your
passphrase, and a factor belonging to **that specific device**. The server never
has it — that is the whole promise.

So on the Windows machine you will be asked to unlock, and:

- **Same passphrase, new device** → the device factor is missing, so unlocking
  needs your **recovery code**. Have it to hand before you start.
- After that, Windows registers its own device factor and unlocks normally
  from then on.

If you have not printed the recovery code yet, do that on the Mac first. Without
it, a second computer cannot get in, and neither can you if the Mac dies.

### There is no account yet

I never created one — the first account defines the household, and that is
yours to make. On either machine:

1. Go to `/signin` → **First time here? Create an account**
2. Confirm the email Supabase sends
3. Sign in, then set a vault passphrase — this creates the household and issues
   your recovery code
4. **Print or write down the recovery code before leaving that screen**

Do this on whichever machine you'll use most; the other one then joins with the
recovery code as described above.

## 2. Develop on Windows

Only if you want to change the code there. Otherwise skip this.

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-windows.ps1
```

The script installs Node and Git if missing, clones the repo, writes
`.env.local`, runs the tests and starts the app on <http://localhost:3100>.

### Doing it by hand instead

```powershell
winget install OpenJS.NodeJS --version 24
winget install Git.Git
# reopen PowerShell so PATH updates
git clone https://github.com/landonmoyers-svg/homevault.git
cd homevault
npm ci
npm run dev
```

Then create `.env.local` with the three `NEXT_PUBLIC_*` values from
`scripts/setup-windows.ps1`.

### Things that specifically bite on Windows

**Node 22.6 is a hard floor.** `npm test` runs TypeScript directly through
`--experimental-strip-types`, which older Node does not have. Vercel builds on
24.x, so use 24 and you are running what ships.

**Clone the `homevault` repo, not `compliance-hub`.** Both contain this app.
`homevault` has it at the root and is what Vercel deploys. In `compliance-hub`
it is a subdirectory next to an unrelated product, and work there does not reach
the deployed site — see below.

**Line endings.** `.gitattributes` now pins the repo to LF. Without it Git for
Windows rewrites every file it touches and each diff looks like the whole file
changed. If you cloned before that landed, run `git add --renormalize .` once.

**Long paths.** `node_modules` nests deeply enough to hit the 260-character
limit if you clone somewhere like `C:\Users\you\OneDrive\Documents\Projects\…`.
Clone near the root — `C:\dev\homevault` — or enable long paths:
`git config --global core.longpaths true`.

**Don't put it in OneDrive.** OneDrive syncing `node_modules` will make installs
crawl and can corrupt them mid-write. It is also what produced the `page 2.tsx`
duplicate files on the Mac.

## Where the code actually lives

Worth knowing, because it caused the deployed site to sit two weeks stale:

| Repo | Contains | Deploys? |
|---|---|---|
| `landonmoyers-svg/homevault` | app at root | **yes** — Vercel builds `main` |
| `landonmoyers-svg/compliance-hub` | `homevault/` subdir, branch `claude/household-document-management-qtsk5t` | no |

Work has been happening in `compliance-hub` while Vercel watches `homevault`, so
nothing reached the live site after 23 August. Until those are consolidated,
anything meant to go live has to be synced across.
