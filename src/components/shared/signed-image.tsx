"use client";

import { useEffect, useState } from "react";
import { ImageIcon } from "lucide-react";
import { getSignedUrl } from "@/lib/storage";

/**
 * Renders an image stored in the private `documents` bucket by minting a
 * short-lived signed URL for its object path. Falls back to a placeholder.
 */
export function SignedImage({
  path,
  alt,
  className,
}: {
  path?: string | null;
  alt: string;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    if (!path) { setUrl(null); return; }
    void getSignedUrl(path, 600).then((u) => { if (active) setUrl(u); });
    return () => { active = false; };
  }, [path]);

  if (!path || failed) {
    return (
      <div className={`flex items-center justify-center bg-secondary/40 text-muted-foreground ${className ?? ""}`}>
        <ImageIcon className="size-4" />
      </div>
    );
  }
  if (!url) {
    return <div className={`animate-pulse bg-secondary/40 ${className ?? ""}`} />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={alt} onError={() => setFailed(true)} className={`object-cover ${className ?? ""}`} />
  );
}
