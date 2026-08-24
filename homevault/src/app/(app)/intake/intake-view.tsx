"use client";

import { useCallback, useRef, useState } from "react";
import { FolderUp, FileWarning, CheckCircle2, Eye, Loader2, ShieldCheck } from "lucide-react";
import { PageHeader, SectionCard, Card, Badge, Button, DataTable, Row, Cell } from "@/components/ui";
import {
  runBatch,
  REVIEW_EXPLANATION,
  type BatchPlan,
  type BatchProgress,
  type IntakeFile,
  type ProposedRecord,
} from "@/lib/ingest/batch";
import { BrowserTextExtractor, canExtract } from "@/lib/ingest/browser-extract";
import { useSecurityMode } from "@/components/security-mode-picker";
import { policyFor } from "@/lib/ingest/security-mode";

/**
 * Bulk intake: point at a folder, get proposed records back.
 *
 * The screen is built around one claim it must never overstate — how much of
 * this was actually understood. So the result is three separate numbers that are
 * never added together: filed, needs you, and couldn't read. A single
 * "384 documents imported!" would be a lie by aggregation, since the last two
 * groups are not imported in any sense that helps anybody.
 */
export function IntakeView() {
  const { mode } = useSecurityMode();
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [plan, setPlan] = useState<BatchPlan | null>(null);
  const [skipped, setSkipped] = useState<string[]>([]);
  const abort = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const start = useCallback(
    async (fileList: FileList) => {
      const picked = Array.from(fileList);

      // Images are separated out before the batch rather than failing inside it:
      // "this build can't read photos yet" is a fact about us and belongs in its
      // own bucket, not mixed in with documents that were genuinely unreadable.
      const readable: File[] = [];
      const needsOcr: string[] = [];
      for (const f of picked) {
        if (canExtract({ mediaType: f.type, filename: f.name })) readable.push(f);
        else needsOcr.push(f.name);
      }
      setSkipped(needsOcr);

      const blobs = new Map<string, Blob>();
      const files: IntakeFile[] = readable.map((f, i) => {
        const id = `f${i}`;
        blobs.set(id, f);
        return { id, filename: f.name, bytes: f.size, mediaType: f.type };
      });

      setPlan(null);
      setProgress({ total: files.length, completed: 0 });
      abort.current = new AbortController();

      const result = await runBatch(files, {
        extractor: new BrowserTextExtractor(blobs),
        policy: policyFor(mode),
        onProgress: setProgress,
        signal: abort.current.signal,
      });

      setProgress(null);
      setPlan(result);
    },
    [mode],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer.files.length) void start(e.dataTransfer.files);
    },
    [start],
  );

  const busy = progress !== null;

  return (
    <div>
      <PageHeader
        icon={<FolderUp size={22} />}
        title="Add a folder"
        subtitle="Point us at wherever your documents already are. Nothing is filed until you've seen what we made of it."
        description={
          <>
            Files are read on this device. In{" "}
            <b>{mode === "private" ? "Private" : "Assisted"}</b> mode,{" "}
            {mode === "private"
              ? "nothing about them is sent anywhere — anything we can't place comes back to you to file."
              : "documents this device can't place may be sent as a redacted copy, and you'll see exactly what would go before it does."}
          </>
        }
      />

      {!plan && !busy ? (
        <div
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          className="rounded-md border-2 border-dashed border-border bg-surface p-12 text-center"
        >
          <FolderUp className="mx-auto text-muted" size={32} />
          <h2 className="mt-4 text-lg">Drop a folder here</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">
            Hundreds of files at once is the expected case, not the stress test. Filenames don&apos;t
            matter — we read what&apos;s inside.
          </p>
          <div className="mt-5">
            <Button onClick={() => inputRef.current?.click()}>Choose files</Button>
          </div>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && void start(e.target.files)}
          />
        </div>
      ) : null}

      {busy ? (
        <Card className="p-8 text-center">
          <Loader2 className="mx-auto animate-spin text-accent" size={28} />
          <h2 className="mt-4 text-lg">
            Reading {progress.completed} of {progress.total}
          </h2>
          {progress.current ? (
            <p className="mt-1 truncate text-sm text-muted">{progress.current}</p>
          ) : null}
          <div className="mx-auto mt-4 h-1.5 w-full max-w-md overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full bg-accent transition-[width]"
              style={{ width: `${Math.round((progress.completed / Math.max(1, progress.total)) * 100)}%` }}
            />
          </div>
          <div className="mt-5">
            <Button variant="secondary" onClick={() => abort.current?.abort()}>
              Stop
            </Button>
          </div>
        </Card>
      ) : null}

      {plan ? <Results plan={plan} skipped={skipped} onReset={() => setPlan(null)} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * Three numbers, never summed.
 *
 * "Filed" is the only one that represents work done for you. Presenting a total
 * would let the review queue and the unreadable pile hide inside a big
 * reassuring figure, which is precisely where an import tool earns misplaced
 * trust.
 */
function Results({
  plan,
  skipped,
  onReset,
}: {
  plan: BatchPlan;
  skipped: string[];
  onReset: () => void;
}) {
  return (
    <div>
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Tally
          icon={<CheckCircle2 size={20} />}
          value={plan.ready.length}
          label="ready to file"
          hint="Identified with enough confidence to file unattended."
        />
        <Tally
          icon={<Eye size={20} />}
          value={plan.needsReview.length}
          label="need you"
          hint="Ordered by how likely we are to have got them wrong."
        />
        <Tally
          icon={<FileWarning size={20} />}
          value={plan.unreadable.length + skipped.length}
          label="couldn't read"
          hint="Nothing legible came out, or the file is an image."
        />
      </div>

      {plan.stats.sentForHelp > 0 ? (
        <Card className="mb-6 flex items-start gap-3 p-4">
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-accent" />
          <p className="text-sm text-muted">
            {plan.stats.sentForHelp} of {plan.stats.files} documents were sent as redacted copies. The rest
            were identified on this device.
          </p>
        </Card>
      ) : (
        <Card className="mb-6 flex items-start gap-3 p-4">
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-accent" />
          <p className="text-sm text-muted">
            All {plan.stats.files} documents were read on this device. Nothing was sent anywhere.
          </p>
        </Card>
      )}

      {plan.needsReview.length > 0 ? (
        <SectionCard
          title="Worth a look"
          className="mb-6"
          action={<Badge tone="neutral">{plan.needsReview.length}</Badge>}
        >
          <DataTable headers={["What we think it is", "Category", "Why we're asking", "Files"]}>
            {plan.needsReview.map((p) => (
              <ProposalRow key={p.id} proposal={p} showReasons />
            ))}
          </DataTable>
        </SectionCard>
      ) : null}

      {plan.ready.length > 0 ? (
        <SectionCard
          title="Ready to file"
          className="mb-6"
          action={<Button>File these {plan.ready.length}</Button>}
        >
          <DataTable headers={["Record", "Category", "Institution", "Files"]}>
            {plan.ready.map((p) => (
              <ProposalRow key={p.id} proposal={p} />
            ))}
          </DataTable>
        </SectionCard>
      ) : null}

      {skipped.length > 0 ? (
        <SectionCard title="Images we can't read yet" className="mb-6">
          <p className="text-sm text-muted">
            {skipped.length} file{skipped.length === 1 ? "" : "s"} {skipped.length === 1 ? "is" : "are"} a
            photo or a scan. Reading those needs OCR, which this build doesn&apos;t have — rather than guess
            from the filename, we&apos;ve left them for you.
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {skipped.slice(0, 12).map((name) => (
              <li key={name}>
                <Badge tone="neutral">{name}</Badge>
              </li>
            ))}
            {skipped.length > 12 ? (
              <li className="text-sm text-muted">and {skipped.length - 12} more</li>
            ) : null}
          </ul>
        </SectionCard>
      ) : null}

      <Button variant="secondary" onClick={onReset}>
        Add another folder
      </Button>
    </div>
  );
}

function Tally({
  icon,
  value,
  label,
  hint,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  hint: string;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-3xl font-light tracking-tight">{value}</div>
          <div className="mt-0.5 text-sm font-medium">{label}</div>
          <div className="mt-1 text-xs text-muted">{hint}</div>
        </div>
        <span className="text-accent">{icon}</span>
      </div>
    </Card>
  );
}

function ProposalRow({ proposal, showReasons }: { proposal: ProposedRecord; showReasons?: boolean }) {
  return (
    <Row>
      <Cell className="font-medium">
        {proposal.label}
        {/* Without this, two accounts at one bank render as an identical row
            and read as a duplicate — see ProposedRecord.distinguisher. */}
        {proposal.distinguisher ? (
          <span className="ml-2 font-normal text-muted">{proposal.distinguisher}</span>
        ) : null}
      </Cell>
      <Cell className="text-muted capitalize">{proposal.category.replace(/_/g, " ")}</Cell>
      {showReasons ? (
        <Cell className="text-muted">
          {proposal.reviewReasons.map((r) => REVIEW_EXPLANATION[r]).join(" ")}
        </Cell>
      ) : (
        <Cell className="text-muted">{proposal.issuer ?? "—"}</Cell>
      )}
      <Cell className="text-muted">
        {proposal.fileIds.length}
        {proposal.fileIds.length > 1 ? " (grouped)" : ""}
      </Cell>
    </Row>
  );
}
