"use client";

import { useEffect, useState } from "react";
import { Play, Download, Trash2, HardDrive } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/data";
import { useAuth } from "@/lib/auth/context";
import { clipStore, deviceLabel, extFor, type StoredClip } from "@/lib/emergency-alert/audio/clip-store";
import { useLibraryVersion, liveStore } from "@/lib/emergency-alert/audio/live-store";
import { formatWhen } from "@/lib/emergency-alert/rules";
import { Button } from "@/components/ui/button";

/**
 * Incident audio saved on THIS device. Nothing here exists on the server, so
 * another admin's computer shows its own clips. Every play, export and delete
 * is written to the audio audit log.
 */
export function DeviceLibrary({ incidentId }: { incidentId?: string }) {
  const { user } = useAuth();
  const version = useLibraryVersion();
  const [clips, setClips] = useState<StoredClip[] | null>(null);
  const [playing, setPlaying] = useState<{ key: string; url: string } | null>(null);

  useEffect(() => {
    let alive = true;
    (incidentId ? clipStore.byIncident("library", incidentId) : clipStore.all("library"))
      .then((c) => alive && setClips(c.sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))))
      .catch(() => alive && setClips([]));
    return () => { alive = false; };
  }, [incidentId, version]);
  useEffect(() => () => { if (playing) URL.revokeObjectURL(playing.url); }, [playing]);

  const log = (c: StoredClip, action: "played_clip" | "exported_clip" | "deleted_clip") => {
    if (!user) return;
    void db().emergencyAudioLog.create({
      incidentId: c.incidentId, incidentLabel: c.incidentLabel, action, performedBy: user.id,
      performedByName: user.fullName, performedByEmail: user.email, clipIndex: c.seq, deviceLabel: deviceLabel(),
    }).catch(() => {});
  };

  const play = (c: StoredClip) => {
    if (playing) URL.revokeObjectURL(playing.url);
    setPlaying({ key: c.key, url: URL.createObjectURL(c.blob) });
    log(c, "played_clip");
  };
  const save = (c: StoredClip) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(c.blob);
    a.download = `${c.incidentLabel.replace(/[^\w-]+/g, "_")}_${String(c.seq + 1).padStart(2, "0")}_${c.recordedAt.slice(0, 19).replace(/[:T]/g, "-")}.${extFor(c.mime)}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    log(c, "exported_clip");
  };
  const remove = async (c: StoredClip) => {
    if (!window.confirm("Delete this clip from this device? If no other admin device has a copy, it's gone for good.")) return;
    await clipStore.remove("library", c.key);
    log(c, "deleted_clip");
    liveStore.libraryChanged();
    toast.success("Clip deleted from this device.");
  };

  if (clips === null) return null;
  if (clips.length === 0) {
    return <p className="flex items-center gap-2 text-sm text-muted-foreground"><HardDrive className="size-4" /> No incident audio saved on this device{incidentId ? " for this incident" : ""}.</p>;
  }

  return (
    <div className="space-y-2">
      <p className="flex items-center gap-2 text-xs text-muted-foreground"><HardDrive className="size-3.5" /> Saved on this device ({deviceLabel()}) · {clips.length} clip{clips.length === 1 ? "" : "s"}</p>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {clips.map((c) => (
          <li key={c.key} className="space-y-2 px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{incidentId ? `Clip ${c.seq + 1}` : c.incidentLabel}</span>
              <span className="text-xs text-muted-foreground">{formatWhen(c.recordedAt)} · {c.durationSec}s{c.fromName ? ` · from ${c.fromName}` : ""}</span>
              <span className="ml-auto flex gap-1">
                <Button size="icon" variant="ghost" aria-label="Play" onClick={() => play(c)}><Play /></Button>
                <Button size="icon" variant="ghost" aria-label="Save to files" onClick={() => save(c)}><Download /></Button>
                <Button size="icon" variant="ghost" aria-label="Delete" onClick={() => void remove(c)}><Trash2 /></Button>
              </span>
            </div>
            {playing?.key === c.key && <audio src={playing.url} controls autoPlay className="h-8 w-full" />}
          </li>
        ))}
      </ul>
    </div>
  );
}
