"use client";

import { useMemo, useState } from "react";
import { useCollection } from "@/lib/data/hooks";

export interface PersonValue {
  userId: string | null;
  name: string;
}

/**
 * Person picker over the canonical EMPLOYEE roster (not just login-holders), so
 * every module that links a record to a person sees the same people — including
 * newly-added employees who don't have an app login yet.
 *
 * - An employee WITH a login stores their stable `userId` (so the record also
 *   surfaces on that person's portal) plus the display name.
 * - An employee WITHOUT a login stores the name only (userId null).
 * - "Enter name manually" stores a free-typed name (userId null) for someone not
 *   on the roster at all. Manual mode is tracked in local state so the input
 *   stays put even before a name is typed.
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
  const { data } = useCollection("employees");
  const employees = useMemo(
    () =>
      (data ?? [])
        .filter((e) => e.employmentStatus === "active")
        .map((e) => ({ id: e.id, userId: e.userId ?? null, name: [e.firstName, e.lastName].filter(Boolean).join(" ").trim() }))
        .filter((e) => e.name)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [data],
  );

  // Resolve the current value to a roster option (by login, else by name).
  const matchByUser = value.userId ? employees.find((e) => e.userId === value.userId) : undefined;
  const matchByName = !value.userId && value.name ? employees.find((e) => e.name === value.name) : undefined;

  // Manual mode is explicit local state — it must survive an empty name. Seed it
  // to true when the current value is a name that matches nobody on the roster.
  const [manual, setManual] = useState(() => !value.userId && value.name !== "" && !matchByName);

  const optionValue = (e: { id: string; userId: string | null }) => (e.userId ? `u:${e.userId}` : `e:${e.id}`);
  const selectValue = manual
    ? "__manual__"
    : matchByUser ? `u:${matchByUser.userId}`
    : matchByName ? `e:${matchByName.id}`
    : "";

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}{required && " *"}</label>
      <select
        className="input w-full"
        value={selectValue}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "__manual__") {
            setManual(true);
            onChange({ userId: null, name: value.name });
          } else if (v === "") {
            setManual(false);
            onChange({ userId: null, name: "" });
          } else {
            setManual(false);
            const emp = employees.find((x) => optionValue(x) === v);
            onChange({ userId: emp?.userId ?? null, name: emp?.name ?? "" });
          }
        }}
      >
        <option value="">Select a person…</option>
        {employees.map((e) => (
          <option key={e.id} value={optionValue(e)}>{e.name}{e.userId ? "" : " (no login)"}</option>
        ))}
        <option value="__manual__">— Enter name manually —</option>
      </select>
      {selectValue === "__manual__" && (
        <input
          className="input mt-1.5 w-full"
          placeholder="Full name"
          value={value.name}
          autoFocus
          onChange={(e) => onChange({ userId: null, name: e.target.value })}
        />
      )}
    </div>
  );
}
