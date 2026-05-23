/**
 * In-memory rate limiter for Next.js API Route Handlers.
 *
 * This module-scoped Map persists across requests within the same
 * serverless function instance. It resets on cold starts (acceptable
 * for this project's scale — a Redis/Upstash solution would be needed
 * for multi-instance production deployments).
 *
 * Usage:
 *   const result = checkRateLimit(ip, { maxCalls: 1, windowMs: 60_000 });
 *   if (!result.allowed) return HTTP 429;
 */

/** @type {Map<string, { count: number, windowStart: number }>} */
const store = new Map();

/**
 * Check and record a rate-limited request.
 *
 * @param {string} key       - Unique key per client (e.g. IP address or user ID)
 * @param {{ maxCalls?: number, windowMs?: number }} options
 * @returns {{ allowed: boolean, retryAfterMs: number, remaining: number }}
 */
export function checkRateLimit(key, { maxCalls = 1, windowMs = 60_000 } = {}) {
  const now = Date.now();
  const entry = store.get(key) ?? { count: 0, windowStart: now };

  // Sliding-window reset: if the window has expired, start fresh
  if (now - entry.windowStart > windowMs) {
    store.set(key, { count: 1, windowStart: now });
    return { allowed: true, retryAfterMs: 0, remaining: maxCalls - 1 };
  }

  if (entry.count >= maxCalls) {
    const retryAfterMs = windowMs - (now - entry.windowStart);
    return { allowed: false, retryAfterMs, remaining: 0 };
  }

  store.set(key, { count: entry.count + 1, windowStart: entry.windowStart });
  return { allowed: true, retryAfterMs: 0, remaining: maxCalls - (entry.count + 1) };
}
