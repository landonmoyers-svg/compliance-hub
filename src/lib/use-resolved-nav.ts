"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth/context";
import { useCollection } from "@/lib/data/hooks";
import { resolveNav, type NavGroup } from "@/lib/nav";
import { industryHiddenModules } from "@/lib/industries";

/**
 * The navigation the CURRENT user should see, plus which group the current
 * route belongs to. Shared by the top section bar and the section rail so the
 * two can never disagree about visibility, ordering, or the active section.
 */
export function useResolvedNav(): { groups: NavGroup[]; activeGroup: NavGroup | undefined } {
  const pathname = usePathname();
  const { profile, user } = useAuth();
  const orgQ = useCollection("organizationSettings");
  const navPrefsQ = useCollection("navPreferences");
  const org = orgQ.data?.[0];

  const myUserId = profile?.userId ?? user?.id ?? "";
  const pref = useMemo(
    () => (navPrefsQ.data ?? []).find((p) => p.userId === myUserId),
    [navPrefsQ.data, myUserId],
  );

  const groups = useMemo(
    () =>
      resolveNav({
        role: profile?.accountRole,
        pageRoles: org?.pageRoles ?? {},
        disabledPages: org?.disabledPages ?? [],
        hiddenPages: pref?.hiddenPages ?? [],
        pageOrder: pref?.pageOrder ?? [],
        groupOrder: pref?.groupOrder ?? [],
        industryHidden: industryHiddenModules(org?.industry),
      }),
    [profile?.accountRole, org?.pageRoles, org?.disabledPages, org?.industry,
     pref?.hiddenPages, pref?.pageOrder, pref?.groupOrder],
  );

  // Exact match wins; otherwise the longest prefix match, so nested routes
  // (e.g. /hr/payroll) still light up their own section.
  const activeGroup = useMemo(() => {
    const exact = groups.find((g) => g.items.some((i) => i.href === pathname));
    if (exact) return exact;
    let best: NavGroup | undefined;
    let bestLen = 0;
    for (const g of groups) {
      for (const i of g.items) {
        if (i.href !== "/" && pathname.startsWith(i.href) && i.href.length > bestLen) {
          best = g; bestLen = i.href.length;
        }
      }
    }
    return best ?? groups[0];
  }, [groups, pathname]);

  return { groups, activeGroup };
}
