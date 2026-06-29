export function LoadingScreen() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="size-8 animate-spin rounded-full border-4 border-secondary border-t-primary" />
        <p className="text-sm text-muted-foreground">Loading Compliance Hub…</p>
      </div>
    </div>
  );
}
