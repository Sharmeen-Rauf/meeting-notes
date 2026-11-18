"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  Download,
  HelpCircle,
  Languages,
  Loader2,
} from "lucide-react";
import { jsPDF } from "jspdf";
import {
  fetchMeetingById,
  fetchSettings,
  saveMeetingRecord,
} from "@/lib/storage/data-client";
import type {
  Meeting,
  MeetingNote,
  MeetingQuestion,
  MeetingTask,
  OutputLanguage,
} from "@/lib/types";
import { DEFAULT_DEPARTMENTS } from "@/lib/types";
import {
  cn,
  formatDate,
  formatMeetingForWhatsApp,
  formatMs,
} from "@/lib/utils";
import type { MeetingAnalysisResult } from "@/lib/llm/schemas";

function MeetingDetailContent() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [departments, setDepartments] = useState<string[]>([
    ...DEFAULT_DEPARTMENTS,
  ]);
  const [showTranscript, setShowTranscript] = useState(false);

  useEffect(() => {
    Promise.all([fetchMeetingById(id), fetchSettings()]).then(([m, s]) => {
      setMeeting(m);
      setDepartments(s.departments);
      setLoading(false);
    });
  }, [id]);

  const handleCopyWhatsApp = async () => {
    if (!meeting) return;
    const text = formatMeetingForWhatsApp(meeting);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportPdf = () => {
    if (!meeting) return;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 40;
    const maxWidth = pageWidth - margin * 2;
    let y = 48;

    const addLine = (text: string, size = 10, bold = false) => {
      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.setFontSize(size);
      const lines = doc.splitTextToSize(text, maxWidth) as string[];
      for (const line of lines) {
        if (y > 780) {
          doc.addPage();
          y = 48;
        }
        doc.text(line, margin, y);
        y += size + 5;
      }
    };

    addLine(meeting.title, 16, true);
    addLine(`Date: ${formatDate(meeting.started_at)} | Language: ${meeting.output_language}`, 9);
    y += 8;

    if (meeting.summary) {
      addLine("Summary", 12, true);
      addLine(meeting.summary, 10);
      y += 8;
    }

    if (meeting.decisions.length > 0) {
      addLine("Key Decisions", 12, true);
      for (const d of meeting.decisions) addLine(`• ${d}`, 10);
      y += 8;
    }

    if ((meeting.notes ?? []).length > 0) {
      addLine("Department-wise Notes", 12, true);
      for (const n of meeting.notes ?? []) {
        addLine(`[${n.department}] (${formatMs(n.timestamp_ms)}) ${n.content}`, 10);
      }
      y += 8;
    }

    if ((meeting.tasks ?? []).length > 0) {
      addLine("Tasks / Assignments", 12, true);
      for (const t of meeting.tasks ?? []) {
        const due = t.deadline ? ` | Due: ${t.deadline}` : "";
        addLine(`[${t.status}] ${t.title} — ${t.assignee} (${t.department})${due}`, 10);
      }
      y += 8;
    }

    if ((meeting.questions ?? []).length > 0) {
      addLine("Questions", 12, true);
      for (const q of meeting.questions ?? []) {
        if (q.is_open) {
          addLine(`[OPEN] ${q.question} (${q.asked_by})`, 10);
        } else {
          addLine(`[ANSWERED] ${q.question} -> ${q.answer ?? ""}`, 10);
        }
      }
    }

    const safeName = meeting.title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    doc.save(`${safeName || "meeting-notes"}.pdf`);
  };

  const handleLanguageChange = async (nextLang: OutputLanguage) => {
    if (!meeting || regenerating) return;
    const segments = meeting.segments ?? [];
    if (segments.length === 0) return;

    setRegenerating(true);
    try {
      const res = await fetch("/api/notes/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          segments,
          departments,
          outputLanguage: nextLang,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { analysis: MeetingAnalysisResult };
        const updatedNotes: MeetingNote[] = data.analysis.notes.map((n) => ({
          id: crypto.randomUUID(),
          meeting_id: meeting.id,
          department: n.department,
          content: n.content,
          timestamp_ms: n.timestamp_ms,
        }));
        const updatedTasks: MeetingTask[] = data.analysis.tasks.map((t) => ({
          id: crypto.randomUUID(),
          meeting_id: meeting.id,
          title: t.title,
          assignee: t.assignee,
          department: t.department,
          deadline: t.deadline ?? null,
          status: t.status,
          timestamp_ms: t.timestamp_ms,
        }));
        const updatedQuestions: MeetingQuestion[] = data.analysis.questions.map(
          (q) => ({
            id: crypto.randomUUID(),
            meeting_id: meeting.id,
            question: q.question,
            answer: q.answer ?? null,
            is_open: q.is_open,
            asked_by: q.asked_by,
            timestamp_ms: q.timestamp_ms,
            answered_timestamp_ms: q.answered_timestamp_ms ?? null,
          })
        );

        const nextMeeting: Meeting = {
          ...meeting,
          output_language: nextLang,
          summary: data.analysis.summary,
          decisions: data.analysis.decisions,
          notes: updatedNotes,
          tasks: updatedTasks,
          questions: updatedQuestions,
        };
        await saveMeetingRecord(nextMeeting);
        setMeeting(nextMeeting);
      }
    } finally {
      setRegenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-sm text-slate-500">
        Loading meeting minutes...
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
        <p className="font-semibold">Meeting not found</p>
        <Link
          href="/meetings"
          className="mt-3 inline-block text-sm text-blue-600 hover:underline"
        >
          Back to Meeting History
        </Link>
      </div>
    );
  }

  const notesByDept = new Map<string, MeetingNote[]>();
  for (const n of meeting.notes ?? []) {
    const list = notesByDept.get(n.department) ?? [];
    list.push(n);
    notesByDept.set(n.department, list);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Link
          href="/meetings"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          History
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-slate-800 dark:bg-slate-900">
            {regenerating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
            ) : (
              <Languages className="h-3.5 w-3.5 text-slate-500" />
            )}
            <select
              value={meeting.output_language}
              disabled={regenerating}
              onChange={(e) =>
                handleLanguageChange(e.target.value as OutputLanguage)
              }
              className="bg-transparent font-medium focus:outline-none"
            >
              <option value="English">English</option>
              <option value="Urdu">Urdu</option>
              <option value="Roman Urdu">Roman Urdu</option>
            </select>
          </div>

          <button
            type="button"
            onClick={handleCopyWhatsApp}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied!" : "Copy WhatsApp"}
          </button>

          <button
            type="button"
            onClick={handleExportPdf}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
          >
            <Download className="h-3.5 w-3.5" />
            Export PDF
          </button>
        </div>
      </div>

      {/* Title & Audio */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-xl font-bold">{meeting.title}</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          {formatDate(meeting.started_at)}
        </p>

        {meeting.audio_url && (
          <audio controls className="mt-3 w-full" src={meeting.audio_url} />
        )}
      </section>

      {/* Summary + Decisions */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Summary
        </h2>
        <p className="text-sm leading-relaxed">
          {meeting.summary || "No summary generated."}
        </p>

        {meeting.decisions && meeting.decisions.length > 0 && (
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 mb-1.5">
              Key Decisions
            </h3>
            <ul className="list-disc pl-5 space-y-1 text-sm">
              {meeting.decisions.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Department-wise Notes */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Department-wise Notes
        </h2>
        {notesByDept.size === 0 ? (
          <p className="text-sm text-slate-500">No department notes.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Array.from(notesByDept.entries()).map(([dept, items]) => (
              <div
                key={dept}
                className="rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/50"
              >
                <h3 className="text-xs font-bold text-blue-600 dark:text-blue-400 mb-2">
                  {dept}
                </h3>
                <ul className="space-y-1.5 text-sm">
                  {items.map((n) => (
                    <li key={n.id} className="flex gap-2">
                      <span className="font-mono text-xs text-slate-400 shrink-0 pt-0.5">
                        {formatMs(n.timestamp_ms)}
                      </span>
                      <span>{n.content}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Tasks Table */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Tasks & Assignments
          </h2>
          <Link href="/tasks" className="text-xs font-medium text-blue-600 hover:underline">
            Manage on Tasks Board →
          </Link>
        </div>

        {(meeting.tasks ?? []).length === 0 ? (
          <p className="text-sm text-slate-500">No tasks extracted.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500 dark:border-slate-800">
                  <th className="py-2 pr-3">Task</th>
                  <th className="py-2 pr-3">Assignee</th>
                  <th className="py-2 pr-3">Dept</th>
                  <th className="py-2 pr-3">Deadline</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {(meeting.tasks ?? []).map((t) => (
                  <tr key={t.id}>
                    <td className="py-2 pr-3 font-medium">{t.title}</td>
                    <td className="py-2 pr-3">{t.assignee}</td>
                    <td className="py-2 pr-3">{t.department}</td>
                    <td className="py-2 pr-3 text-xs text-slate-500">
                      {t.deadline || "—"}
                    </td>
                    <td className="py-2">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                          t.status === "Done"
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                            : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                        )}
                      >
                        {t.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Questions */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Questions
        </h2>
        {(meeting.questions ?? []).length === 0 ? (
          <p className="text-sm text-slate-500">No questions recorded.</p>
        ) : (
          <div className="space-y-2">
            {(meeting.questions ?? []).map((q) => (
              <div
                key={q.id}
                className={cn(
                  "rounded-xl border p-3",
                  q.is_open
                    ? "border-amber-300 bg-amber-50/70 dark:border-amber-800 dark:bg-amber-950/30"
                    : "border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50"
                )}
              >
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="inline-flex items-center gap-1 font-semibold">
                    {q.is_open ? (
                      <>
                        <HelpCircle className="h-3.5 w-3.5 text-amber-600" />
                        <span className="text-amber-700 dark:text-amber-400">
                          OPEN
                        </span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        <span className="text-emerald-700 dark:text-emerald-400">
                          ANSWERED
                        </span>
                      </>
                    )}
                  </span>
                  <span className="font-mono text-slate-400">
                    {q.asked_by} • {formatMs(q.timestamp_ms)}
                  </span>
                </div>
                <p className="text-sm font-medium">{q.question}</p>
                {q.answer && (
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                    Answer: {q.answer}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Collapsible Transcript */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <button
          type="button"
          onClick={() => setShowTranscript((v) => !v)}
          className="text-sm font-semibold text-blue-600 dark:text-blue-400"
        >
          {showTranscript ? "Hide Full Transcript ▲" : "Show Full Transcript ▼"}
        </button>

        {showTranscript && (
          <div className="mt-3 space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
            {(meeting.segments ?? []).map((seg) => (
              <div key={seg.id} className="flex gap-2.5 text-sm">
                <span className="font-mono text-xs text-slate-400 shrink-0 pt-0.5">
                  {formatMs(seg.start_ms)}
                </span>
                <div>
                  <span className="font-semibold text-blue-600 dark:text-blue-400 mr-1.5">
                    {seg.speaker_label}:
                  </span>
                  <span>{seg.text}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default function MeetingDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-sm text-slate-500">
          Loading meeting minutes...
        </div>
      }
    >
      <MeetingDetailContent />
    </Suspense>
  );
}
