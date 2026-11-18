import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { getLLMProvider } from "@/lib/llm/provider";
import { DEFAULT_DEPARTMENTS } from "@/lib/types";

const AnalyzeRequestSchema = z.object({
  segments: z.array(
    z.object({
      id: z.string(),
      speaker_id: z.string(),
      speaker_label: z.string(),
      text: z.string(),
      start_ms: z.number(),
      end_ms: z.number(),
      is_final: z.boolean(),
    })
  ),
  departments: z.array(z.string()).min(1).default([...DEFAULT_DEPARTMENTS]),
  outputLanguage: z.enum(["English", "Urdu", "Roman Urdu"]).default("English"),
  existingNotes: z
    .array(
      z.object({
        id: z.string(),
        department: z.string(),
        content: z.string(),
        timestamp_ms: z.number(),
      })
    )
    .optional(),
  existingTasks: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        assignee: z.string(),
        department: z.string(),
        deadline: z.string().nullable(),
        status: z.enum(["Pending", "Done"]),
        timestamp_ms: z.number(),
      })
    )
    .optional(),
  existingQuestions: z
    .array(
      z.object({
        id: z.string(),
        question: z.string(),
        answer: z.string().nullable(),
        is_open: z.boolean(),
        asked_by: z.string(),
        timestamp_ms: z.number(),
        answered_timestamp_ms: z.number().nullable(),
      })
    )
    .optional(),
});

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rl = checkRateLimit(`notes-analyze:${ip}`, 30, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please wait before analyzing again." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
    );
  }

  try {
    const body = await request.json();
    const parsed = AnalyzeRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request payload", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const provider = getLLMProvider();
    const result = await provider.analyzeMeeting(parsed.data);

    return NextResponse.json({
      provider: provider.name,
      analysis: result,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Failed to analyze meeting transcript",
        detail: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
