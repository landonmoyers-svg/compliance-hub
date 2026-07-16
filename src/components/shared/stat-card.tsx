import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";

type Tone = "default" | "success" | "warning" | "destructive";

const toneText: Record<Tone, string> = {
  default: "text-primary",
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
};

const toneBg: Record<Tone, string> = {
  default: "bg-primary/10",
  success: "bg-success/10",
  warning: "bg-warning/10",
  destructive: "bg-destructive/10",
};

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "default",
  hint,
  loading = false,
  href,
}: {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  tone?: Tone;
  hint?: string;
  loading?: boolean;
  /** When set, the whole card links here (drill-down to the source list). */
  href?: string;
}) {
  const inner = (
    <CardContent className="flex items-center justify-between gap-3 p-4">
      <div className="min-w-0 space-y-1">
        {/* Wrap (up to 2 lines) instead of truncating so labels are never clipped. */}
        <p className="text-xs font-medium uppercase leading-tight tracking-wide text-muted-foreground line-clamp-2">
          {label}
        </p>
        {loading ? (
          <Skeleton className="h-7 w-16" />
        ) : (
          <p className="text-2xl font-semibold tabular-nums">{value}</p>
        )}
        {hint && !loading && (
          <p className="line-clamp-2 text-xs text-muted-foreground">{hint}</p>
        )}
      </div>
      {Icon && (
        <div
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-lg",
            toneBg[tone],
          )}
        >
          <Icon className={cn("size-5", toneText[tone])} aria-hidden />
        </div>
      )}
    </CardContent>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        <Card className="h-full transition-colors hover:border-primary/40 hover:bg-secondary/20">
          {inner}
        </Card>
      </Link>
    );
  }
  return <Card>{inner}</Card>;
}
