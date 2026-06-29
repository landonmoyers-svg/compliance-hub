"use client";

import { jsPDF } from "jspdf";
import type { CompletedForm, FillableFormTemplate } from "@/lib/data/schema";

/**
 * Generate and download a PDF of a completed form. Uses the template's field
 * definitions (for labels + ordering) when available, otherwise falls back to
 * the raw stored field keys. Pure client-side render — no server round-trip.
 */
export function downloadCompletedFormPdf(
  completed: CompletedForm,
  template?: FillableFormTemplate,
): void {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const margin = 56;
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Lone Peak Psychiatry", margin, y);
  y += 22;
  doc.setFontSize(13);
  doc.text(completed.templateTitle, margin, y);
  y += 16;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(120);
  const completedAt = completed.completedAt
    ? new Date(completed.completedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
    : "—";
  doc.text(`Employee: ${completed.employeeName}   ·   Completed: ${completedAt}`, margin, y);
  y += 18;

  // Draft watermark
  if (template?.isDraft) {
    doc.setTextColor(200, 60, 60);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("DRAFT — NOT FINAL — pending HR/Compliance review", margin, y);
    y += 16;
  }

  doc.setDrawColor(210);
  doc.line(margin, y, pageWidth - margin, y);
  y += 22;

  // Build an ordered list of [label, value]
  const rows: [string, string][] = [];
  if (template && template.fields.length > 0) {
    for (const f of template.fields) {
      const raw = completed.fieldValues[f.key] ?? "";
      const value = f.type === "checkbox" ? (raw === "true" ? "Yes" : "No") : raw;
      rows.push([f.label, value || "—"]);
    }
  } else {
    for (const [k, v] of Object.entries(completed.fieldValues)) {
      rows.push([k, v || "—"]);
    }
  }

  // Fields
  doc.setTextColor(20);
  for (const [label, value] of rows) {
    if (y > doc.internal.pageSize.getHeight() - margin - 40) {
      doc.addPage();
      y = margin;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(label, margin, y);
    y += 14;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    const lines = doc.splitTextToSize(value, contentWidth) as string[];
    doc.text(lines, margin, y);
    y += lines.length * 14 + 10;
  }

  // Signature block
  y += 10;
  if (y > doc.internal.pageSize.getHeight() - margin - 60) {
    doc.addPage();
    y = margin;
  }
  doc.setDrawColor(210);
  doc.line(margin, y, pageWidth - margin, y);
  y += 20;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Signed by:", margin, y);
  doc.setFont("helvetica", "normal");
  doc.text(completed.signedByName || "(not required)", margin + 70, y);
  y += 16;
  doc.setTextColor(120);
  doc.setFontSize(8);
  doc.text(
    "Electronically completed via Compliance Hub. This record reflects the values entered at completion time.",
    margin,
    y,
  );

  const safeTitle = completed.templateTitle.replace(/[^a-zA-Z0-9]+/g, "-").slice(0, 50);
  doc.save(`${safeTitle}-${completed.employeeName.replace(/[^a-zA-Z0-9]+/g, "-")}.pdf`);
}
