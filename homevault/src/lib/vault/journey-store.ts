"use client";

import { useCallback, useSyncExternalStore } from "react";
import { DEFAULT_JOURNEY, type JourneyKey } from "../domain/journeys";
import { NO_PREFERENCES, type CoachPreferences } from "../domain/coach";
import type { CategoryKey } from "../domain/categories";

/**
 * The household's journey and coaching preferences.
 *
 * These are ordinary, non-secret settings — which category order to work in,
 * what the household has asked us to stop suggesting — so they are kept in
 * `localStorage` rather than being encrypted or round-tripped through the
 * server. Nothing here reveals anything about the vault's contents.
 *
 * KNOWN LIMITATION: because this is per-browser, two partners in one household
 * can currently pick different journeys and won't see each other's dismissals.
 * The right home is a column on `households`, so the choice is shared. Kept
 * local for now so the preference exists at all rather than waiting on a
 * migration — but it should move before a household relies on it.
 */

const JOURNEY_KEY = "homevault:journey";
const PREFS_KEY = "homevault:coach-prefs";

const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) l();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

// `useSyncExternalStore` compares snapshots by identity, so parsed objects must
// be cached — returning a fresh object each read would loop forever.
let prefsRaw: string | null = null;
let prefsValue: CoachPreferences = NO_PREFERENCES;

function readPrefs(): CoachPreferences {
  const raw = localStorage.getItem(PREFS_KEY);
  if (raw !== prefsRaw) {
    prefsRaw = raw;
    try {
      prefsValue = raw ? (JSON.parse(raw) as CoachPreferences) : NO_PREFERENCES;
    } catch {
      prefsValue = NO_PREFERENCES;
    }
  }
  return prefsValue;
}

const readJourney = (): JourneyKey | null => localStorage.getItem(JOURNEY_KEY) as JourneyKey | null;
const journeyOnServer = (): JourneyKey | null => null;
const prefsOnServer = (): CoachPreferences => NO_PREFERENCES;

export function useJourney() {
  const journey = useSyncExternalStore(subscribe, readJourney, journeyOnServer);
  const prefs = useSyncExternalStore(subscribe, readPrefs, prefsOnServer);

  const choose = useCallback((next: JourneyKey) => {
    localStorage.setItem(JOURNEY_KEY, next);
    notify();
  }, []);

  const updatePrefs = useCallback((next: CoachPreferences) => {
    localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    notify();
  }, []);

  const dismissCategory = useCallback(
    (category: CategoryKey) => {
      const current = readPrefs();
      if (current.notApplicable.includes(category)) return;
      updatePrefs({ ...current, notApplicable: [...current.notApplicable, category] });
    },
    [updatePrefs],
  );

  const snoozeStep = useCallback(
    (stepId: string, days: number) => {
      const current = readPrefs();
      updatePrefs({
        ...current,
        snoozedUntil: { ...current.snoozedUntil, [stepId]: Date.now() + days * 86_400_000 },
      });
    },
    [updatePrefs],
  );

  return {
    /** Null until the household has chosen — the cue to show onboarding. */
    journey,
    /** Safe default for rendering before a choice is made. */
    effectiveJourney: journey ?? DEFAULT_JOURNEY,
    hasChosen: journey !== null,
    prefs,
    choose,
    dismissCategory,
    snoozeStep,
  };
}
