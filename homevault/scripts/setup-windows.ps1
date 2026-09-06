# HomeVault — Windows setup
#
# Run in PowerShell from wherever you want the code to live:
#
#   irm https://raw.githubusercontent.com/... | iex     (not this; repo is private)
#
# Instead: save this file, then
#   powershell -ExecutionPolicy Bypass -File .\setup-windows.ps1
#
# It installs the toolchain, clones the repo, writes .env.local and starts the
# dev server. Everything it installs comes from winget, so nothing here needs a
# browser download or an admin password beyond winget's own prompts.

$ErrorActionPreference = "Stop"

function Step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }

# --- 1. Toolchain -----------------------------------------------------------
# Node 22.6+ is a hard floor, not a preference: `npm test` runs TypeScript
# directly via --experimental-strip-types, which does not exist before it.
# Vercel builds this project on 24.x, so 24 is what we match.
Step "Checking Node"
$needNode = $true
if (Get-Command node -ErrorAction SilentlyContinue) {
  $v = (node -v) -replace 'v',''
  if ([version]($v.Split('-')[0]) -ge [version]"22.6.0") {
    Write-Host "Node $v is fine."; $needNode = $false
  } else {
    Write-Host "Node $v is too old (need 22.6+)." -ForegroundColor Yellow
  }
}
if ($needNode) {
  Step "Installing Node 24 via winget"
  winget install --id OpenJS.NodeJS --version 24 --accept-source-agreements --accept-package-agreements
  Write-Host "Close and reopen PowerShell, then run this script again." -ForegroundColor Yellow
  exit 0
}

Step "Checking Git"
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  winget install --id Git.Git --accept-source-agreements --accept-package-agreements
  Write-Host "Close and reopen PowerShell, then run this script again." -ForegroundColor Yellow
  exit 0
}

# --- 2. The code ------------------------------------------------------------
# The private `homevault` repo, NOT compliance-hub. This one has the app at its
# root and is the repo Vercel deploys, so what you run locally is what ships.
Step "Getting the code"
$repo = "https://github.com/landonmoyers-svg/homevault.git"
if (Test-Path ".\homevault\.git") {
  Write-Host "Already cloned — pulling instead."
  git -C .\homevault pull --ff-only
} else {
  # Private repo: this will open a browser to sign in to GitHub the first time.
  git clone $repo homevault
}
Set-Location .\homevault

# --- 3. Configuration -------------------------------------------------------
# The URL and publishable key are safe to keep here: they ship inside the
# browser bundle of the deployed site by design, and every request they permit
# is still gated by row-level security plus the vault's own encryption. The
# service-role key is the one that must never appear in a file like this, and
# nothing local needs it.
Step "Writing .env.local"
if (Test-Path ".env.local") {
  Write-Host ".env.local already exists — leaving it alone."
} else {
@"
NEXT_PUBLIC_HOMEVAULT_BACKEND=supabase
NEXT_PUBLIC_SUPABASE_URL=https://txxewtgrldqtehszvzmv.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_BTtxuCRlrQUGJL5riu3l0w_VIa-3wEN
"@ | Set-Content -Encoding utf8 .env.local
  Write-Host "Written. Delete NEXT_PUBLIC_HOMEVAULT_BACKEND to run the offline demo instead."
}

# --- 4. Install and run -----------------------------------------------------
Step "Installing dependencies (a few minutes the first time)"
npm ci

Step "Running the tests"
npm test

Step "Starting the app on http://localhost:3100"
Write-Host "Ctrl+C to stop. Re-start later with: npm run dev" -ForegroundColor Green
npm run dev
