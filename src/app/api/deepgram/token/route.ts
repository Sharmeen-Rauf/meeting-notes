import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rl = checkRateLimit(`deepgram-token:${ip}`, 15, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many token requests. Please wait a moment." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
    );
  }

  if (isSupabaseConfigured()) {
    const supabase = await createServerSupabaseClient();
    const { data } = (await supabase?.auth.getUser()) ?? { data: { user: null } };
    if (!data.user) {
      return NextResponse.json(
        { error: "Authentication required for live Deepgram transcription." },
        { status: 401 }
      );
    }
  }

  const apiKey = process.env.DEEPGRAM_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "DEEPGRAM_API_KEY is not configured. Use Demo Mode or add DEEPGRAM_API_KEY to your environment.",
      },
      { status: 503 }
    );
  }

  try {
    const res = await fetch("https://api.deepgram.com/v1/auth/grant", {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ttl_seconds: 60 }),
    });

    if (!res.ok) {
      const detail = await res.text();
      return NextResponse.json(
        { error: "Failed to create short-lived Deepgram token", detail },
        { status: 502 }
      );
    }

    const data = (await res.json()) as { access_token: string; expires_in?: number };
    return NextResponse.json({
      token: data.access_token,
      expires_in: data.expires_in ?? 60,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Unable to reach Deepgram auth service",
        detail: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 502 }
    );
  }
}
