"use client";

import { useMemo } from "react";
import { useCollection } from "@/lib/data/hooks";

export interface PersonValue {
  userId: string | null;
  name: string;
}

/**
 * Person picker that links a record to a user profile (so the record surfaces
 * on that person's portal and in their admin record view). Choosing a profile
 * stores both the stable userId and the display name; "Enter name manually"
 * stores a name only (for people who aren't app users).
 */
export function PersonSelect({
  value,
  onChange,
  label = "Person",
  required = false,
}: {
  value: PersonValue;
  onChange: (v: PersonValue) => void;
  label?: string;
  required?: boolean;
}) {
  const { data } = useCollection("profiles");
  const profiles = useMemo(
    () => [...(data ?? [])].sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [data],
  );

  // "manual" when there's a name but no matching profile userId
  const isManual = value.userId === null && value.name !== "";
  const selectValue = value.userId ?? (isManual ? "__manual__" : "");

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}{required && " *"}</label>
      <select
        className="input w-full"
        value={selectValue}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "__manual__") {
            onChange({ userId: null, name: value.name });
          } else if (v === "") {
            onChange({ userId: null, name: "" });
          } else {
            const p = profiles.find((pr) => pr.userId === v);
            onChange({ userId: v, name: p?.fullName ?? "" });
          }
        }}
      >
        <option value="">Select a person…</option>
        {profiles.map((p) => (
          <option key={p.userId} value={p.userId}>{p.fullName}</option>
        ))}
        <option value="__manual__">— Enter name manually —</option>
      </select>
      {selectValue === "__manual__" && (
        <input
          className="input mt-1.5 w-full"
          placeholder="Full name"
          value={value.name}
          onChange={(e) => onChange({ userId: null, name: e.target.value })}
        />
      )}
    </div>
  );
}
