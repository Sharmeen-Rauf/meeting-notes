import fs from "node:fs";
import path from "node:path";
import type { OutputLanguage } from "@/lib/types";

const PROMPTS_DIR = path.join(process.cwd(), "prompts");

export function loadPrompt(
  filename: string,
  vars: Record<string, string> = {}
): string {
  const filePath = path.join(PROMPTS_DIR, filename);
  let template = fs.readFileSync(filePath, "utf-8");
  for (const [key, value] of Object.entries(vars)) {
    template = template.replaceAll(`{{${key}}}`, value);
  }
  return template;
}

export function buildMeetingAnalysisPrompt(
  departments: string[],
  outputLanguage: OutputLanguage
): string {
  const vars = {
    DEPARTMENTS: departments.join(", "),
    OUTPUT_LANGUAGE: outputLanguage,
  };

  const deptPrompt = loadPrompt("department-classification.txt", vars);
  const taskPrompt = loadPrompt("task-extraction.txt", vars);
  const questionPrompt = loadPrompt("question-detection.txt", vars);

  return [
    deptPrompt,
    "---",
    taskPrompt,
    "---",
    questionPrompt,
    "---",
    `Combine all outputs into ONE JSON object with keys: "summary" (5-6 lines string), "decisions" (string[]), "notes" (array of {existing_id, department, content, timestamp_ms}), "tasks" (array of {existing_id, title, assignee, department, deadline, status, timestamp_ms}), "questions" (array of {existing_id, question, asked_by, is_open, answer, timestamp_ms, answered_timestamp_ms}).`,
  ].join("\n\n");
}
