import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Meeting } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMs(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-PK", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function formatMeetingForWhatsApp(meeting: Meeting): string {
  const lines: string[] = [];
  lines.push(`*${meeting.title}*`);
  lines.push(`Date: ${formatDate(meeting.started_at)}`);
  lines.push("");

  if (meeting.summary) {
    lines.push("*Summary:*");
    lines.push(meeting.summary.trim());
    lines.push("");
  }

  if (meeting.decisions && meeting.decisions.length > 0) {
    lines.push("*Key Decisions:*");
    meeting.decisions.forEach((d) => lines.push(`- ${d}`));
    lines.push("");
  }

  const notes = meeting.notes ?? [];
  if (notes.length > 0) {
    lines.push("*Department Notes:*");
    const grouped = new Map<string, typeof notes>();
    for (const note of notes) {
      const list = grouped.get(note.department) ?? [];
      list.push(note);
      grouped.set(note.department, list);
    }
    for (const [dept, deptNotes] of grouped.entries()) {
      lines.push(`_${dept}_`);
      for (const n of deptNotes) {
        lines.push(`• [${formatMs(n.timestamp_ms)}] ${n.content}`);
      }
    }
    lines.push("");
  }

  const tasks = meeting.tasks ?? [];
  if (tasks.length > 0) {
    lines.push("*Tasks / Action Items:*");
    for (const t of tasks) {
      const mark = t.status === "Done" ? "✅" : "⏳";
      const due = t.deadline ? ` (Due: ${t.deadline})` : "";
      lines.push(`${mark} ${t.title} — *${t.assignee}* [${t.department}]${due}`);
    }
    lines.push("");
  }

  const questions = meeting.questions ?? [];
  if (questions.length > 0) {
    lines.push("*Questions:*");
    for (const q of questions) {
      if (q.is_open) {
        lines.push(`❓ *OPEN:* ${q.question} (${q.asked_by})`);
      } else {
        lines.push(`✔️ ${q.question} → ${q.answer ?? "Answered"}`);
      }
    }
  }

  return lines.join("\n").trim();
}
