import { z } from "zod";

export const NoteItemSchema = z.object({
  existing_id: z.string().nullable().optional(),
  department: z.string().min(1),
  content: z.string().min(1),
  timestamp_ms: z.number().int().nonnegative(),
});

export const TaskItemSchema = z.object({
  existing_id: z.string().nullable().optional(),
  title: z.string().min(1),
  assignee: z.string().min(1).default("Unassigned"),
  department: z.string().min(1).default("General"),
  deadline: z.string().nullable().optional(),
  status: z.enum(["Pending", "Done"]).default("Pending"),
  timestamp_ms: z.number().int().nonnegative(),
});

export const QuestionItemSchema = z.object({
  existing_id: z.string().nullable().optional(),
  question: z.string().min(1),
  asked_by: z.string().min(1).default("Speaker 1"),
  is_open: z.boolean().default(true),
  answer: z.string().nullable().optional(),
  timestamp_ms: z.number().int().nonnegative(),
  answered_timestamp_ms: z.number().int().nonnegative().nullable().optional(),
});

export const MeetingAnalysisSchema = z.object({
  summary: z.string().default(""),
  decisions: z.array(z.string()).default([]),
  notes: z.array(NoteItemSchema).default([]),
  tasks: z.array(TaskItemSchema).default([]),
  questions: z.array(QuestionItemSchema).default([]),
});

export type MeetingAnalysisResult = z.infer<typeof MeetingAnalysisSchema>;

export const AskAICitationSchema = z.object({
  meeting_title: z.string(),
  meeting_date: z.string(),
  meeting_id: z.string().optional(),
});

export const AskAIResponseSchema = z.object({
  answer: z.string().min(1),
  citations: z.array(AskAICitationSchema).default([]),
});

export type AskAIResponse = z.infer<typeof AskAIResponseSchema>;
