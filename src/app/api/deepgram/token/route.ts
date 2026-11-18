import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rl = checkRateLimit(`deepgram-token:${ip}`, 15, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many token requests. Please wait a moment." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
    );
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
    // 1. Preferred: Deepgram /v1/auth/grant (short-lived JWT)
    const grantRes = await fetch("https://api.deepgram.com/v1/auth/grant", {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ttl_seconds: 60 }),
    });

    if (grantRes.ok) {
      const data = (await grantRes.json()) as {
        access_token: string;
        expires_in?: number;
      };
      return NextResponse.json({
        token: data.access_token,
        expires_in: data.expires_in ?? 60,
        auth_type: "bearer",
      });
    }

    // 2. Fallback: Project-scoped 60s temporary key if /v1/auth/grant returned 403
    if (grantRes.status === 403) {
      const projRes = await fetch("https://api.deepgram.com/v1/projects", {
        headers: { Authorization: `Token ${apiKey}` },
      });

      if (projRes.ok) {
        const projData = (await projRes.json()) as {
          projects?: Array<{ project_id: string }>;
        };
        const projectId = projData.projects?.[0]?.project_id;
        if (projectId) {
          const tempKeyRes = await fetch(
            `https://api.deepgram.com/v1/projects/${projectId}/keys`,
            {
              method: "POST",
              headers: {
                Authorization: `Token ${apiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                comment: "meetnotes-temp-60s",
                scopes: ["usage:write"],
                time_to_live_in_seconds: 60,
              }),
            }
          );

          if (tempKeyRes.ok) {
            const tempData = (await tempKeyRes.json()) as { key: string };
            return NextResponse.json({
              token: tempData.key,
              expires_in: 60,
              auth_type: "token",
            });
          }
        }
      }

      return NextResponse.json(
        {
          error:
            "Deepgram returned 403 Forbidden: your API key lacks permission to mint short-lived tokens. In Deepgram Console → API Keys, create a key with Admin (or Owner) role and update DEEPGRAM_API_KEY.",
        },
        { status: 403 }
      );
    }

    const detail = await grantRes.text();
    return NextResponse.json(
      { error: "Failed to create short-lived Deepgram token", detail },
      { status: 502 }
    );
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
