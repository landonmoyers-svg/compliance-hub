"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { getSignedUrl } from "@/lib/storage";
import { toast } from "sonner";

/**
 * Opens a private storage object via a short-lived signed URL. The bucket is
 * private, so we never render the raw path as an href — we mint a signed URL on
 * click and open it in a new tab.
 */
export function FileLink({
  path,
  label = "View",
  className,
  iconOnly = false,
}: {
  path: string;
  label?: string;
  className?: string;
  iconOnly?: boolean;
}) {
  const [loading, setLoading] = useState(false);

  async function open() {
    setLoading(true);
    try {
      const url = await getSignedUrl(path);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
      else toast.error("Couldn't open file.");
    } catch {
      toast.error("Couldn't open file.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={open}
      disabled={loading}
      className={className ?? "inline-flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"}
      aria-label={label}
    >
      <ExternalLink className="size-3.5" />
      {!iconOnly && <span>{loading ? "Opening…" : label}</span>}
    </button>
  );
}
