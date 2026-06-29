"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import type { ComplianceUserProfile } from "@/lib/data/schema";
import { isAdminRole } from "./roles";

export type AuthStatus =
  | "loading"
  | "unauthenticated"
  | "no_profile"
  | "ready"
  | "error";

export interface AuthUser {
  id: string;
  fullName: string;
  email: string;
}

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  profile: ComplianceUserProfile | null;
  isAdmin: boolean;
  login: () => void;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = createClient();
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<ComplianceUserProfile | null>(null);

  const loadProfile = useCallback(
    async (authUser: User) => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("*")
          .eq("user_id", authUser.id)
          .single();

        if (error || !data) {
          setProfile(null);
          setStatus("no_profile");
          return;
        }

        const p: ComplianceUserProfile = {
          id: data.id,
          createdDate: data.created_date,
          userId: data.user_id,
          fullName: data.full_name,
          email: data.email,
          accountRole: data.account_role,
          staffRole: data.staff_role ?? undefined,
          professionalRole: data.professional_role ?? undefined,
          department: data.department ?? undefined,
          primaryLocationId: data.primary_location_id ?? undefined,
          active: data.active,
        };

        setUser({ id: authUser.id, fullName: p.fullName, email: p.email });
        setProfile(p);
        setStatus("ready");
      } catch {
        setStatus("error");
      }
    },
    [supabase],
  );

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", user.id)
      .single();
    if (data) {
      setProfile({
        id: data.id, createdDate: data.created_date, userId: data.user_id,
        fullName: data.full_name, email: data.email, accountRole: data.account_role,
        staffRole: data.staff_role ?? undefined, professionalRole: data.professional_role ?? undefined,
        department: data.department ?? undefined, primaryLocationId: data.primary_location_id ?? undefined,
        active: data.active,
      });
    }
  }, [supabase, user]);

  useEffect(() => {
    // Check for existing session on mount
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        void loadProfile(session.user);
      } else {
        setStatus("unauthenticated");
      }
    });

    // Subscribe to auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        void loadProfile(session.user);
      } else {
        setUser(null);
        setProfile(null);
        setStatus("unauthenticated");
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase, loadProfile]);

  // login() redirects to /auth/login — the page handles the form
  const login = useCallback(() => {
    window.location.href = "/auth/login";
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    window.location.href = "/auth/login";
  }, [supabase]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status, user, profile,
      isAdmin: isAdminRole(profile?.accountRole),
      login, logout, refreshProfile,
    }),
    [status, user, profile, login, logout, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
