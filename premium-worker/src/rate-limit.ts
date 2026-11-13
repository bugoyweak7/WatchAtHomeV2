export interface RateLimitDatabase {
  prepare(query: string): {
    bind(...values: unknown[]): {
      run(): Promise<{ meta: { changes: number } }>;
      first<T = Record<string, unknown>>(): Promise<T | null>;
    };
  };
}

export async function consumeRateLimit(
  db: RateLimitDatabase,
  ownerKey: string,
  routeKey: string,
  clientKey: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): Promise<{ allowed: boolean; count: number; retryAfterMs: number }> {
  if (!ownerKey || !routeKey || !clientKey ||
      !Number.isSafeInteger(limit) || limit < 1 ||
      !Number.isSafeInteger(windowMs) || windowMs < 1) {
    throw new Error("Invalid rate-limit configuration.");
  }
  const cutoff = now - windowMs;
  await db.prepare(`
    INSERT INTO api_rate_limits (
      owner_key, route_key, client_key, window_started_at, request_count, updated_at
    ) VALUES (?1, ?2, ?3, ?4, 1, ?5)
    ON CONFLICT(owner_key, route_key, client_key) DO UPDATE SET
      window_started_at = CASE
        WHEN api_rate_limits.window_started_at <= ?6 THEN excluded.window_started_at
        ELSE api_rate_limits.window_started_at
      END,
      request_count = CASE
        WHEN api_rate_limits.window_started_at <= ?6 THEN 1
        ELSE api_rate_limits.request_count + 1
      END,
      updated_at = excluded.updated_at
  `).bind(ownerKey, routeKey, clientKey, now, now, cutoff).run();

  const row = await db.prepare(`
    SELECT window_started_at AS windowStartedAt, request_count AS requestCount
    FROM api_rate_limits
    WHERE owner_key = ?1 AND route_key = ?2 AND client_key = ?3
  `).bind(ownerKey, routeKey, clientKey).first<{
    windowStartedAt: number;
    requestCount: number;
  }>();
  const count = Number(row?.requestCount ?? 0);
  const windowStartedAt = Number(row?.windowStartedAt ?? now);
  const retryAfterMs = Math.max(0, windowStartedAt + windowMs - now);
  return { allowed: count <= limit, count, retryAfterMs };
}
