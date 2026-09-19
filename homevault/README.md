# HomeVault has moved

This app now lives in its own repository:

**<https://github.com/landonmoyers-svg/homevault>**

## Why

HomeVault existed here *and* there, with separate histories. Vercel builds the
standalone repo, so work that landed here — a fortnight of it — never reached
the deployed site. Two copies of one product is a trap that costs you the work
silently, and the only real fix is to stop having two.

The standalone repo now holds the complete history, including every commit that
was made here. Nothing was lost in the move.

## If you are looking for the code

```bash
git clone git@github.com:landonmoyers-svg/homevault.git
cd homevault && npm ci && npm run dev     # http://localhost:3100
```

On Windows, see `WINDOWS.md` in that repo.

## Why this file exists rather than nothing

A deleted directory looks like an accident. This says it was deliberate and
where to go, so nobody rebuilds it here by mistake.
