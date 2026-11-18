// Simple in-memory sliding-window rate limiter.
// Suitable for small-company traffic on Vercel serverless instances.

interface Bucket {
  timestamps: number[];
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

export function checkRateLimit(
  key: string,
  limit = 30,
  windowMs = 60_000
): RateLimitResult {
  const now = Date.now();
  const cutoff = now - windowMs;

  const bucket = buckets.get(key) ?? { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((ts) => ts > cutoff);

  if (bucket.timestamps.length >= limit) {
    const oldest = bucket.timestamps[0] ?? now;
    const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    buckets.set(key, bucket);
    return { allowed: false, remaining: 0, retryAfterSec };
  }

  bucket.timestamps.push(now);
  buckets.set(key, bucket);

  // Periodic cleanup to avoid unbounded memory growth
  if (buckets.size > 1000) {
    for (const [k, b] of buckets.entries()) {
      if (b.timestamps.every((ts) => ts <= cutoff)) {
        buckets.delete(k);
      }
    }
  }

  return {
    allowed: true,
    remaining: Math.max(0, limit - bucket.timestamps.length),
    retryAfterSec: 0,
  };
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return request.headers.get("x-real-ip") || "unknown";
}
