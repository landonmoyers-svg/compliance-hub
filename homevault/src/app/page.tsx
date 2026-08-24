import Link from "next/link";
import { ShieldCheck, KeyRound, Users, Lock, ArrowRight, FileText } from "lucide-react";
import { Card, Badge } from "@/components/ui";

const PILLARS = [
  {
    icon: Lock,
    title: "Zero-knowledge by design",
    body: "Everything is encrypted in your browser before it's stored. A breach of our servers yields ciphertext and nothing else — we can't read your vault, and neither can an attacker who steals the database.",
  },
  {
    icon: KeyRound,
    title: "The keys to the kingdom",
    body: "Passwords, SSNs, birth certificates, financial accounts, wills, medical history, and where the physical originals live — organized in one place your family can actually find.",
  },
  {
    icon: Users,
    title: "Handover, done right",
    body: "If you're incapacitated or pass away, a verified handover transfers access to the people you choose — with a grace period, multi-party verification, and no single point of failure. Not even us.",
  },
];

export default function Landing() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <div className="mb-3 flex items-center gap-2">
        <ShieldCheck className="text-accent" size={22} />
        <span className="text-lg font-semibold tracking-tight">HomeVault</span>
        <Badge tone="accent" className="ml-1">
          design scaffold
        </Badge>
      </div>

      <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
        The keys to the kingdom — <span className="text-accent">secured</span>, organized, and ready to
        hand over.
      </h1>
      <p className="mt-5 max-w-2xl text-lg text-muted">
        HomeVault does for a household what a compliance platform does for a business: a single trustworthy
        home for the documents, accounts, and knowledge your family needs — and a coached, verified process
        to hand over access when it matters most.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-background hover:opacity-90"
        >
          Explore the demo <ArrowRight size={16} />
        </Link>
        <a
          href="https://github.com"
          className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-5 py-2.5 text-sm font-medium hover:bg-surface-2"
        >
          <FileText size={16} /> Read the security model
        </a>
      </div>

      <div className="mt-14 grid gap-4 sm:grid-cols-3">
        {PILLARS.map((p) => (
          <Card key={p.title} className="card-gradient p-5">
            <p.icon className="text-accent" size={22} />
            <h3 className="mt-3 font-semibold">{p.title}</h3>
            <p className="mt-2 text-sm text-muted">{p.body}</p>
          </Card>
        ))}
      </div>

      <Card className="mt-10 p-5">
        <h3 className="font-semibold">Why &ldquo;no single party&rdquo; matters</h3>
        <p className="mt-2 text-sm text-muted">
          Your vault key is split into shares using Shamir secret-sharing and escrowed so that no one holder
          — not your spouse alone, not your attorney alone, and not HomeVault — can open it. Handover only
          happens when the conditions you configured are met: two key-holders combining their shares, a
          verified legal event, a dead-man&apos;s-switch after a long silence, or a combination. Every step is
          logged, notified, and reversible until the moment of release.
        </p>
      </Card>

      <p className="mt-10 text-xs text-muted">
        This is a design scaffold, not a production service. It is not yet wired to a live backend and has
        not undergone the independent cryptographic review that a product holding real SSNs and estate
        documents must pass. See the roadmap for what production requires.
      </p>
    </main>
  );
}
