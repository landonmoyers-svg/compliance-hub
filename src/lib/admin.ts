"use client";

/**
 * Provision a real login for a person: invites them via email and creates a
 * linked ComplianceUserProfile with their actual auth user id. Backed by the
 * privileged server route (service role). The caller must be an admin/HR user;
 * the route re-verifies that server-side.
 */
/** Offboarding: revoke a person's app login (privileged server route). */
export async function deactivateLogin(userId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("/api/admin/deactivate-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) return { ok: false, error: data.error ?? "Failed to deactivate login." };
    return { ok: true };
  } catch {
    return { ok: false, error: "Network error while deactivating the login." };
  }
}

export async function provisionLogin(input: {
  email: string;
  fullName: string;
  accountRole?: string;
  staffRole?: string;
  department?: string;
}): Promise<{ ok: boolean; userId?: string; error?: string }> {
  try {
    const res = await fetch("/api/admin/invite-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const data = (await res.json()) as { ok?: boolean; userId?: string; error?: string };
    if (!res.ok || !data.ok) return { ok: false, error: data.error ?? "Failed to invite user." };
    return { ok: true, userId: data.userId };
  } catch {
    return { ok: false, error: "Network error while inviting user." };
  }
}
