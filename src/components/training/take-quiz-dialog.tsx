"use client";

import { useState } from "react";
import { X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TrainingAssignment, TrainingModule, TrainingQuestion } from "@/lib/data/schema";

/**
 * Take-the-quiz modal. Scores answers client-side; on a passing score it calls
 * `onPassed` (which records the attempt and completes the assignment). Shared by
 * the admin Training roster and the staff portal's self-serve training.
 */
export function TakeQuizDialog({
  assignment,
  module,
  questions,
  onClose,
  onPassed,
}: {
  assignment: TrainingAssignment;
  module: TrainingModule | undefined;
  questions: TrainingQuestion[];
  onClose: () => void;
  onPassed: (assignment: TrainingAssignment, score: number, answers: number[]) => Promise<void>;
}) {
  const passingScore = module?.passingScore ?? 80;
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<{ score: number; passed: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const allAnswered = questions.every((q) => answers[q.id] !== undefined);

  async function submit() {
    const correct = questions.filter((q) => answers[q.id] === q.correctIndex).length;
    const score = questions.length > 0 ? Math.round((correct / questions.length) * 100) : 0;
    const passed = score >= passingScore;
    setResult({ score, passed });
    if (passed) {
      setBusy(true);
      try {
        await onPassed(assignment, score, questions.map((q) => answers[q.id] ?? -1));
      } finally {
        setBusy(false);
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="font-semibold">{assignment.moduleTitle}</h2>
            <p className="text-xs text-muted-foreground">{questions.length} question{questions.length !== 1 ? "s" : ""} · pass at {passingScore}%</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
        </div>

        <div className="space-y-5 p-5">
          {result ? (
            <div className={`rounded-lg border p-5 text-center ${result.passed ? "border-success/40 bg-success/10" : "border-destructive/40 bg-destructive/10"}`}>
              <p className="text-3xl font-bold tabular-nums">{result.score}%</p>
              <p className={`mt-1 font-medium ${result.passed ? "text-success" : "text-destructive"}`}>
                {result.passed ? "Passed — training marked complete" : `Not passed — ${passingScore}% required. You can retake.`}
              </p>
            </div>
          ) : (
            questions.map((q, i) => (
              <div key={q.id} className="space-y-2">
                <p className="text-sm font-medium">{i + 1}. {q.prompt}</p>
                <div className="space-y-1.5">
                  {q.options.map((opt, oi) => (
                    <label key={oi} className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${answers[q.id] === oi ? "border-primary bg-primary/10" : "border-border hover:bg-secondary/30"}`}>
                      <input type="radio" name={q.id} checked={answers[q.id] === oi} onChange={() => setAnswers((p) => ({ ...p, [q.id]: oi }))} className="size-4" />
                      {opt}
                    </label>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          {result ? (
            result.passed ? (
              <Button onClick={onClose} disabled={busy}><Check className="size-4" /> Done</Button>
            ) : (
              <>
                <Button variant="outline" onClick={onClose}>Close</Button>
                <Button onClick={() => setResult(null)}>Retake</Button>
              </>
            )
          ) : (
            <>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={submit} disabled={!allAnswered || busy}>Submit answers</Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
