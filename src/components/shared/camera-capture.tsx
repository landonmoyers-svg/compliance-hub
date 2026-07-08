"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, X, SwitchCamera, ImageUp, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface CaptureMeta { lat?: number; lng?: number; capturedAt?: string }

/**
 * In-app live camera. Streams the device camera (rear-facing by default),
 * captures a still to a downscaled JPEG File, and returns it via `onCapture`.
 * Works on phones AND desktop webcams (unlike an <input capture>, which does
 * nothing on desktop). `multiple` keeps the camera open to snap several in a
 * row; `wantGeo` grabs the current GPS fix (a canvas capture carries no EXIF)
 * so inventory can still guess the location. Falls back to the OS file/camera
 * picker when getUserMedia is unavailable or the user blocks the permission.
 */
export function CameraCapture({
  open,
  multiple = false,
  wantGeo = false,
  onCapture,
  onClose,
}: {
  open: boolean;
  multiple?: boolean;
  wantGeo?: boolean;
  onCapture: (file: File, meta?: CaptureMeta) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fallbackRef = useRef<HTMLInputElement>(null);
  const geoRef = useRef<CaptureMeta>({});
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [count, setCount] = useState(0);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async (f: "environment" | "user") => {
    stop();
    setReady(false);
    setError(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: f } }, audio: false });
      streamRef.current = stream;
      const v = videoRef.current;
      if (v) { v.srcObject = stream; await v.play().catch(() => {}); }
      setReady(true);
    } catch {
      setError(true);
    }
  }, [stop]);

  useEffect(() => {
    if (!open) return;
    setCount(0);
    if (!navigator.mediaDevices?.getUserMedia) { setError(true); return; }
    void start(facing);
    if (wantGeo && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => { geoRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude }; },
        () => {},
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
      );
    }
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, facing]);

  function finish() { stop(); onClose(); }

  function snap() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const maxDim = 1600;
    const scale = Math.min(1, maxDim / Math.max(v.videoWidth, v.videoHeight));
    const w = Math.round(v.videoWidth * scale);
    const h = Math.round(v.videoHeight * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, w, h);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" });
        onCapture(file, { ...geoRef.current, capturedAt: new Date().toISOString() });
        setCount((c) => c + 1);
        if (!multiple) finish();
      },
      "image/jpeg",
      0.85,
    );
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black" role="dialog" aria-label="Camera">
      {/* Fallback: OS camera / photo picker when the live camera can't start. */}
      <input
        ref={fallbackRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) { onCapture(f, { capturedAt: new Date().toISOString() }); if (!multiple) finish(); }
        }}
      />

      <div className="flex items-center justify-between px-4 py-3 text-white">
        <span className="text-sm font-medium">{multiple ? `Camera${count ? ` · ${count} taken` : ""}` : "Take a photo"}</span>
        <button onClick={finish} aria-label="Close camera" className="rounded-md p-1.5 hover:bg-white/10"><X className="size-5" /></button>
      </div>

      <div className="relative flex-1 overflow-hidden">
        {error ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center text-white">
            <Camera className="size-10 opacity-60" />
            <p className="max-w-xs text-sm text-white/80">Couldn’t open the in-app camera (permission blocked or unsupported). You can still take a photo with your device’s camera.</p>
            <Button variant="outline" onClick={() => fallbackRef.current?.click()} className="border-white/30 bg-white/10 text-white hover:bg-white/20">
              <ImageUp className="size-4" /> Use device camera / photo
            </Button>
          </div>
        ) : (
          <>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video ref={videoRef} autoPlay playsInline muted className="size-full object-cover" />
            {!ready && <div className="absolute inset-0 flex items-center justify-center text-sm text-white/70">Starting camera…</div>}
          </>
        )}
      </div>

      {!error && (
        <div className="flex items-center justify-between px-8 py-6">
          <button
            onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
            aria-label="Switch camera"
            className="rounded-full bg-white/10 p-3 text-white transition hover:bg-white/20"
          >
            <SwitchCamera className="size-5" />
          </button>
          <button
            onClick={snap}
            disabled={!ready}
            aria-label="Take photo"
            className="size-16 rounded-full border-4 border-white bg-white/30 transition active:scale-95 disabled:opacity-40"
          />
          {multiple ? (
            <button
              onClick={finish}
              disabled={count === 0}
              aria-label="Done"
              className="flex items-center gap-1 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40"
            >
              <Check className="size-4" /> Done
            </button>
          ) : (
            <div className="size-11" />
          )}
        </div>
      )}
    </div>
  );
}
