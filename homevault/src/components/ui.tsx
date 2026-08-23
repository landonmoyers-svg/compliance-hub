import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { SensitivityTier } from "@/lib/domain/categories";

/**
 * UI primitives in Jane's language.
 *
 * The rules read off the screenshots, applied everywhere so pages don't each
 * reinvent them:
 *
 *  • White cards, hairline border, 6px radius, no shadow. Depth comes from the
 *    border against the near-white page, not from elevation.
 *  • Page titles are large and *light* — size carries hierarchy, weight doesn't.
 *  • A muted paragraph sits under the title explaining the page, which is Jane's
 *    most consistent and most under-appreciated habit.
 *  • The primary action is a teal button pinned to the top-right of the header.
 */

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("rounded-md border border-border bg-surface", className)}>{children}</div>;
}

/**
 * A titled card with its action on the right — the unit Jane's Settings pages
 * are built from ("Clinic Info", "Website", each with its own Edit).
 */
export function SectionCard({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <div className="flex items-center justify-between gap-3 px-5 pt-5">
        <h2 className="font-semibold">{title}</h2>
        {action}
      </div>
      <div className="px-5 pb-5 pt-4">{children}</div>
    </Card>
  );
}

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "success" | "warning" | "danger";
  className?: string;
}) {
  // Tinted fills rather than outlines: Jane's "Primary" chip and status pills
  // are soft blocks of colour, which stay legible at small sizes on white.
  const tones: Record<string, string> = {
    neutral: "bg-surface-2 text-muted border-border",
    accent: "bg-accent-soft text-accent-strong border-accent/25",
    success: "bg-success/12 text-success border-success/25",
    warning: "bg-warning/12 text-warning border-warning/25",
    danger: "bg-danger/12 text-danger border-danger/25",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const TIER_TONE: Record<SensitivityTier, "danger" | "warning" | "neutral"> = {
  critical: "danger",
  high: "warning",
  standard: "neutral",
};

export function TierBadge({ tier }: { tier: SensitivityTier }) {
  return <Badge tone={TIER_TONE[tier]}>{tier[0].toUpperCase() + tier.slice(1)}</Badge>;
}

export function Button({
  children,
  variant = "primary",
  className,
  ...props
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "quiet";
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const variants = {
    // Jane's primary is a solid teal block; secondary is white with a border,
    // which is what nearly every "Edit" on a settings page uses.
    primary: "bg-accent text-white hover:bg-accent-strong",
    secondary: "border border-border bg-surface text-foreground hover:bg-surface-2",
    quiet: "text-accent-strong hover:underline",
  };
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm text-muted">{label}</div>
          {/* Big and light, like Jane's dashboard figures. */}
          <div className="mt-1 text-3xl font-light tracking-tight">{value}</div>
          {hint ? <div className="mt-1 text-xs text-muted">{hint}</div> : null}
        </div>
        {icon ? <div className="text-accent">{icon}</div> : null}
      </div>
    </Card>
  );
}

/**
 * Page header.
 *
 * `description` is the muted explanatory paragraph Jane puts under almost every
 * title — the thing that makes its settings pages feel documented rather than
 * merely labelled. Worth keeping even when it feels obvious.
 */
export function PageHeader({
  title,
  subtitle,
  description,
  icon,
  actions,
  meta,
}: {
  title: string;
  subtitle?: string;
  /** Longer explanatory copy, in Jane's house style. */
  description?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  /** Small print under the header — Jane's "generated on…" line. */
  meta?: ReactNode;
}) {
  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          {icon ? <div className="mt-1.5 text-accent">{icon}</div> : null}
          <div>
            <h1 className="text-3xl">{title}</h1>
            {subtitle ? <p className="mt-1 max-w-2xl text-sm text-muted">{subtitle}</p> : null}
          </div>
        </div>
        {actions}
      </div>
      {description ? <div className="mt-3 max-w-3xl text-sm text-muted">{description}</div> : null}
      {meta ? <div className="mt-3 text-sm text-muted">{meta}</div> : null}
    </div>
  );
}

/**
 * Jane's filter strip: a bordered rail of dropdown "pills" behind a funnel
 * icon, sitting directly under the title on every report.
 */
export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <Card className="mb-5 flex flex-wrap items-center gap-1 px-4 py-2.5">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="mr-2 text-muted">
        <path d="M3 5h18l-7 8v6l-4 2v-8z" />
      </svg>
      {children}
    </Card>
  );
}

export function FilterPill({
  children,
  active,
  ...props
}: { children: ReactNode; active?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
        active ? "bg-accent-soft text-accent-strong" : "text-foreground hover:bg-surface-2",
      )}
      {...props}
    >
      {children}
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
        <path d="m5 8 7 7 7-7" />
      </svg>
    </button>
  );
}

/** Table shell matching Jane's reports: bold header row, hairline row rules. */
export function DataTable({ headers, children }: { headers: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border">
            {headers.map((header, i) => (
              <th key={i} className="px-3 py-3 text-left font-semibold">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <tr className="border-b border-border last:border-b-0">{children}</tr>;
}

export function Cell({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cn("px-3 py-3 align-top", className)}>{children}</td>;
}
