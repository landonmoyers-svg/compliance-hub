import { Sidebar } from "@/components/sidebar";
import { Badge } from "@/components/ui";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1">
        <header className="flex items-center justify-between border-b border-border bg-surface/60 px-6 py-3 backdrop-blur">
          <div className="text-sm text-muted">
            Household: <span className="text-foreground">The Rivera household</span>
          </div>
          <Badge tone="accent">demo mode · no live backend</Badge>
        </header>
        <main className="px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
