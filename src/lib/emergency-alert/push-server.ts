import "server-only";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Browser push for Emergency Alert — reaches a phone with the Hub installed
 * (or a desktop browser) even when no tab is open.
 *
 * Needs three server env vars (generate the key pair once with
 * `npx web-push generate-vapid-keys`): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
 * VAPID_SUBJECT (a mailto: address). NEXT_PUBLIC_VAPID_PUBLIC_KEY must match
 * VAPID_PUBLIC_KEY so browsers can subscribe. Without them this is a no-op
 * and the in-app alarm + Teams still fire.
 */

export interface PushPayload {
  title: string;
  body: string;
  tag: string;
  url: string;
  /** Re-alert even if a notification with this tag is already showing. */
  urgent?: boolean;
}

export function pushConfigured(): boolean {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
}

/** Push to every subscribed device in the sender's organization except the sender's own. */
export async function sendEmergencyPush(senderId: string, payload: PushPayload) {
  if (!pushConfigured()) return { sent: 0, reason: "not_configured" as const };
  const admin = createAdminClient();
  if (!admin) return { sent: 0, reason: "no_service_role" as const };

  webpush.setVapidDetails(process.env.VAPID_SUBJECT!, process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);

  const { data: membership } = await admin
    .from("org_memberships").select("org_id").eq("user_id", senderId).eq("active", true).limit(1).maybeSingle();
  if (!membership) return { sent: 0, reason: "no_org" as const };

  const { data: subs } = await admin
    .from("push_subscriptions").select("id, endpoint, p256dh, auth, user_id")
    .eq("org_id", membership.org_id).neq("user_id", senderId);

  let sent = 0;
  const dead: string[] = [];
  await Promise.all((subs ?? []).map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
        { TTL: 60 * 10, urgency: "high" },
      );
      sent += 1;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) dead.push(s.id); // unsubscribed / expired
    }
  }));
  if (dead.length) await admin.from("push_subscriptions").delete().in("id", dead);
  return { sent, reason: null };
}
