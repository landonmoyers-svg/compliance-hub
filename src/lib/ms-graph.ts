"use client";

/**
 * Microsoft Graph, straight from the browser.
 *
 * This exists for one reason: controlled-substance logs carry patient chart
 * numbers, and the Hub's own vendors have no BAA. Microsoft 365 does — the
 * practice's agreement covers SharePoint — so the full record goes there and
 * the Hub keeps only a link and the de-identified entries.
 *
 * The important word is STRAIGHT. The file goes from this browser to Microsoft.
 * It is never posted to the Hub's API, so it never touches Vercel or Supabase,
 * and there is no server here holding a token that could read the practice's
 * documents on its own. Every call runs as the signed-in person, so SharePoint's
 * own permissions decide what they can open — the Hub cannot widen them.
 *
 * Signing in usually costs nothing, because staff sign into the HUB with their
 * Microsoft account: Supabase returns the Microsoft token with the session, so
 * SharePoint already knows who they are and no second prompt appears all day.
 * For a password account there is a fallback — authorization code with PKCE in
 * a popup, against the practice's own tenant.
 *
 * Nothing here works until an app registration exists and its id is set in
 * NEXT_PUBLIC_MS_CLIENT_ID; until then `msConfigured()` is false and the Hub
 * falls back to pasting a SharePoint link by hand.
 */

import { createClient } from "@/lib/supabase/client";

const CLIENT_ID = process.env.NEXT_PUBLIC_MS_CLIENT_ID ?? "";
const TENANT = process.env.NEXT_PUBLIC_MS_TENANT_ID || "organizations";
const AUTHORITY = `https://login.microsoftonline.com/${TENANT}`;
const GRAPH = "https://graph.microsoft.com/v1.0";

/** What the Hub asks for. Deliberately no more than reading and writing files. */
const SCOPES = ["openid", "profile", "offline_access", "User.Read", "Files.ReadWrite.All", "Sites.ReadWrite.All"];

/** The page Microsoft sends the popup back to. Must match the app registration exactly. */
export const REDIRECT_PATH = "/ms-auth";

/** True once an app registration has been created and its id configured. */
export function msConfigured(): boolean {
  return CLIENT_ID.length > 0;
}

export function msRedirectUri(): string {
  return typeof window === "undefined" ? REDIRECT_PATH : `${window.location.origin}${REDIRECT_PATH}`;
}

/* ------------------------------------------------------------ the token */

interface Token { accessToken: string; expiresAt: number; account: string }
let token: Token | null = null;
const REFRESH_KEY = "hub.ms.refresh";

/** Refresh tokens live for the tab only — closing it signs the person out. */
const stored = {
  get: () => { try { return sessionStorage.getItem(REFRESH_KEY); } catch { return null; } },
  set: (v: string | null) => {
    try {
      if (v) sessionStorage.setItem(REFRESH_KEY, v);
      else sessionStorage.removeItem(REFRESH_KEY);
    } catch { /* private window */ }
  },
};

export function msSignedIn(): boolean {
  return !!token && token.expiresAt > Date.now();
}

/**
 * The Microsoft token that came in with the Hub session.
 *
 * Staff sign into the Hub WITH their Microsoft account, and Supabase hands the
 * Microsoft access token back alongside the Hub session. So for anyone signed
 * in that way there is nothing more to do — no popup, not even a silent one.
 * The PKCE flow below is the fallback for password accounts.
 *
 * Supabase does not renew this token, so when it expires we renew it ourselves
 * from the provider refresh token and, failing that, ask.
 */
async function fromHubSession(): Promise<Token | null> {
  try {
    const { data } = await createClient().auth.getSession();
    const s = data.session;
    if (!s?.provider_token) {
      // Keep the refresh token if there is one: the access token may be spent
      // but the session can still mint another without troubling anybody.
      if (s?.provider_refresh_token) stored.set(s.provider_refresh_token);
      return null;
    }
    if (s.provider_refresh_token) stored.set(s.provider_refresh_token);
    return {
      accessToken: s.provider_token,
      // Supabase doesn't tell us when it expires; assume the short end of
      // Microsoft's range and let a 401 correct us.
      expiresAt: Date.now() + 50 * 60 * 1000,
      account: s.user?.email ?? "",
    };
  } catch {
    return null;
  }
}

export function msAccount(): string | null {
  return token?.account ?? null;
}

export function msSignOut() {
  token = null;
  stored.set(null);
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function pkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(48)));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64url(new Uint8Array(digest)) };
}

async function exchange(body: Record<string, string>): Promise<Token> {
  const res = await fetch(`${AUTHORITY}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: CLIENT_ID, ...body }),
  });
  const d = await res.json();
  if (!res.ok) throw new Error(d.error_description?.split("\n")[0] ?? "Microsoft sign-in failed");
  stored.set(d.refresh_token ?? null);
  // The account name is only for showing who is signed in.
  let account = "";
  try { account = JSON.parse(atob(d.id_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).preferred_username ?? ""; } catch { /* not fatal */ }
  return { accessToken: d.access_token, expiresAt: Date.now() + (Number(d.expires_in ?? 3600) - 60) * 1000, account };
}

/** Sign in through a popup. Resolves once Microsoft has handed back a token. */
export async function msSignIn(): Promise<void> {
  if (!msConfigured()) throw new Error("Microsoft 365 isn't connected to the Hub yet — an administrator needs to finish the setup.");
  const { verifier, challenge } = await pkce();
  const state = base64url(crypto.getRandomValues(new Uint8Array(12)));
  const url = `${AUTHORITY}/oauth2/v2.0/authorize?${new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: msRedirectUri(),
    response_mode: "query",
    scope: SCOPES.join(" "),
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  })}`;

  const popup = window.open(url, "hub-ms-signin", "width=520,height=680");
  if (!popup) throw new Error("Your browser blocked the Microsoft sign-in window — allow pop-ups for this site and try again.");

  const code = await new Promise<string>((resolve, reject) => {
    const done = (fn: () => void) => { window.removeEventListener("message", onMessage); clearInterval(closedTimer); fn(); };
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const d = e.data as { source?: string; code?: string; state?: string; error?: string };
      if (d?.source !== "hub-ms-auth") return;
      if (d.error) return done(() => reject(new Error(d.error!)));
      if (d.state !== state) return done(() => reject(new Error("Sign-in didn't come back from Microsoft as expected — try again.")));
      done(() => resolve(d.code!));
    };
    window.addEventListener("message", onMessage);
    const closedTimer = setInterval(() => {
      if (popup.closed) done(() => reject(new Error("Microsoft sign-in was closed before it finished.")));
    }, 500);
  });

  token = await exchange({ grant_type: "authorization_code", code, redirect_uri: msRedirectUri(), code_verifier: verifier, scope: SCOPES.join(" ") });
}

/** A usable access token, renewing silently where possible. */
async function accessToken(): Promise<string> {
  if (token && token.expiresAt > Date.now()) return token.accessToken;
  token = await fromHubSession();
  if (token) return token.accessToken;
  const refresh = stored.get();
  if (refresh) {
    try {
      token = await exchange({ grant_type: "refresh_token", refresh_token: refresh, scope: SCOPES.join(" ") });
      return token.accessToken;
    } catch { stored.set(null); }
  }
  await msSignIn();
  return token!.accessToken;
}

async function graph(path: string, init: RequestInit = {}, retried = false): Promise<Response> {
  const res = await fetch(path.startsWith("http") ? path : `${GRAPH}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await accessToken()}`, ...(init.headers ?? {}) },
  });
  // The token the Hub session carried has run out. Renew and try once more —
  // but only once, so a genuinely bad token can't loop.
  if (res.status === 401 && !retried) {
    token = null;
    return graph(path, init, true);
  }
  if (res.status === 403) throw new Error("Your Microsoft account doesn't have access to that SharePoint folder.");
  if (res.status === 404) throw new Error("That SharePoint folder or file couldn't be found — it may have been moved.");
  if (!res.ok) {
    let msg = `Microsoft returned ${res.status}`;
    try { msg = (await res.json())?.error?.message ?? msg; } catch { /* keep the status */ }
    throw new Error(msg);
  }
  return res;
}

/* ------------------------------------------------- addressing by its URL */

/**
 * Graph can address any file or folder by the URL you'd copy out of
 * SharePoint's address bar, which is the only identifier a person can be
 * expected to produce. That's what the Hub stores on the record.
 */
function shareId(url: string): string {
  return `u!${btoa(url.trim()).replace(/=+$/, "").replace(/\//g, "_").replace(/\+/g, "-")}`;
}

export interface DriveItemRef {
  driveId: string;
  itemId: string;
  name: string;
  webUrl: string;
  isFolder: boolean;
}

/** Resolve a pasted SharePoint URL to something the Hub can write into or read back. */
export async function msResolveUrl(url: string): Promise<DriveItemRef> {
  const d = await (await graph(`/shares/${shareId(url)}/driveItem?$select=id,name,webUrl,folder,parentReference`)).json();
  return {
    driveId: d.parentReference?.driveId ?? "",
    itemId: d.id,
    name: d.name,
    webUrl: d.webUrl,
    isFolder: !!d.folder,
  };
}

/* ----------------------------------------------------------- putting files */

const SMALL = 4 * 1024 * 1024; // Graph's limit for a single PUT

/** Upload a file into a folder. Returns the item, whose webUrl goes on the record. */
export async function msUpload(folder: DriveItemRef, name: string, body: Blob): Promise<DriveItemRef> {
  const safe = name.replace(/[\\/:*?"<>|#%]/g, "-");
  const base = `/drives/${folder.driveId}/items/${folder.itemId}:/${encodeURIComponent(safe)}`;

  if (body.size <= SMALL) {
    const d = await (await graph(`${base}:/content?@microsoft.graph.conflictBehavior=rename`, {
      method: "PUT",
      headers: { "Content-Type": body.type || "application/octet-stream" },
      body,
    })).json();
    return { driveId: folder.driveId, itemId: d.id, name: d.name, webUrl: d.webUrl, isFolder: false };
  }

  // Larger scans go up in chunks; Graph wants each one byte-ranged.
  const session = await (await graph(`${base}:/createUploadSession`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ item: { "@microsoft.graph.conflictBehavior": "rename", name: safe } }),
  })).json();

  const CHUNK = 5 * 320 * 1024; // must be a multiple of 320 KiB
  for (let start = 0; start < body.size; start += CHUNK) {
    const end = Math.min(start + CHUNK, body.size);
    const res = await fetch(session.uploadUrl, {
      method: "PUT",
      headers: { "Content-Range": `bytes ${start}-${end - 1}/${body.size}`, "Content-Length": String(end - start) },
      body: body.slice(start, end),
    });
    if (!res.ok && res.status !== 202) throw new Error("The upload to SharePoint was interrupted — try again.");
    if (res.status !== 202) {
      const d = await res.json();
      return { driveId: folder.driveId, itemId: d.id, name: d.name, webUrl: d.webUrl, isFolder: false };
    }
  }
  throw new Error("SharePoint didn't confirm the upload finished.");
}

/* ---------------------------------------------------------- getting them back */

/**
 * Fetch a stored record back. Runs as the signed-in person, so someone without
 * access to the folder gets a refusal from SharePoint no matter what the Hub
 * thinks of them — which is the point of keeping the file there.
 */
export async function msDownload(webUrl: string): Promise<{ blob: Blob; name: string }> {
  const meta = await msResolveUrl(webUrl);
  const res = await graph(`/shares/${shareId(webUrl)}/driveItem/content`);
  return { blob: await res.blob(), name: meta.name };
}

/** Save a fetched record to the person's computer. */
export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/* ------------------------------------------------ remembering the folder */

/**
 * The inbox folder, remembered per browser so it's chosen once, not every time
 * — and remembered PER CLINIC, because Murray and Lehi hold separate DEA
 * registrations and separate logs. One remembered folder would have meant the
 * second clinic quietly filing into the first one's inbox.
 */
const FOLDER_KEY = "hub.ms.archiveFolder";

const folderKeyFor = (locationId: string | null | undefined) => `${FOLDER_KEY}.${locationId || "unspecified"}`;

export function rememberFolder(f: DriveItemRef, locationId: string | null | undefined) {
  try { localStorage.setItem(folderKeyFor(locationId), JSON.stringify(f)); } catch { /* private window */ }
}

export function rememberedFolder(locationId: string | null | undefined): DriveItemRef | null {
  try {
    const raw = localStorage.getItem(folderKeyFor(locationId));
    return raw ? (JSON.parse(raw) as DriveItemRef) : null;
  } catch { return null; }
}
