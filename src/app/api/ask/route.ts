import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { getLLMProvider } from "@/lib/llm/provider";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { Meeting } from "@/lib/types";

const AskRequestSchema = z.object({
  question: z.string().min(2).max(1000),
  meetings: z.array(z.any()).optional(),
});

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rl = checkRateLimit(`ask-ai:${ip}`, 20, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many questions. Please wait a moment." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
    );
  }

  try {
    const body = await request.json();
    const parsed = AskRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Please enter a valid question." },
        { status: 400 }
      );
    }

    let meetingsContext: Meeting[] = [];

    if (isSupabaseConfigured()) {
      const supabase = await createServerSupabaseClient();
      const { data: userData } = (await supabase?.auth.getUser()) ?? {
        data: { user: null },
      };

      if (supabase && userData.user) {
        const userId = userData.user.id;
        // 1. Recent 8 meetings
        const { data: recent } = await supabase
          .from("meetings")
          .select("*")
          .eq("user_id", userId)
          .order("started_at", { ascending: false })
          .limit(8);

        // 2. Full-text search matches
        const searchTerms = parsed.data.question
          .replace(/[^\w\s]/g, " ")
          .trim()
          .split(/\s+/)
          .filter((w) => w.length > 2)
          .slice(0, 6)
          .join(" | ");

        let ftsMatches: Meeting[] = [];
        if (searchTerms) {
          const { data: matched } = await supabase
            .from("meetings")
            .select("*")
            .eq("user_id", userId)
            .textSearch("search_vector", searchTerms, { config: "simple" })
            .limit(6);
          ftsMatches = (matched ?? []) as Meeting[];
        }

        const mergedMap = new Map<string, Meeting>();
        for (const m of [...(recent ?? []), ...ftsMatches] as Meeting[]) {
          mergedMap.set(m.id, m);
        }

        const ids = Array.from(mergedMap.keys());
        if (ids.length > 0) {
          const [notesRes, tasksRes, questionsRes] = await Promise.all([
            supabase.from("meeting_notes").select("*").in("meeting_id", ids),
            supabase.from("tasks").select("*").in("meeting_id", ids),
            supabase.from("questions").select("*").in("meeting_id", ids),
          ]);

          for (const m of mergedMap.values()) {
            m.notes = (notesRes.data ?? []).filter((n) => n.meeting_id === m.id);
            m.tasks = (tasksRes.data ?? []).filter((t) => t.meeting_id === m.id);
            m.questions = (questionsRes.data ?? []).filter((q) => q.meeting_id === m.id);
          }
        }

        meetingsContext = Array.from(mergedMap.values());
      }
    }

    // Fallback to client-supplied demo meetings if not in Supabase cloud mode
    if (meetingsContext.length === 0 && parsed.data.meetings) {
      meetingsContext = parsed.data.meetings as Meeting[];
    }

    if (meetingsContext.length === 0) {
      return NextResponse.json({
        provider: "none",
        answer:
          "Abhi tak koi meeting save nahi hui hai. Pehle ek meeting record karein ya Demo Meeting run karein.",
        citations: [],
      });
    }

    const provider = getLLMProvider();
    const response = await provider.askMeetings({
      question: parsed.data.question,
      meetings: meetingsContext,
    });

    return NextResponse.json({
      provider: provider.name,
      ...response,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Failed to answer question",
        detail: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
