import { verifyPin, type PinPepperEnv } from "./pin-verifier";

export interface PinD1Database {
  prepare(query: string): PinD1Statement;
}

interface PinD1Statement {
  bind(...values: unknown[]): PinD1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<{ meta: { changes: number } }>;
}

export const PIN_MAX_FAILED_ATTEMPTS = 5;
export const PIN_LOCKOUT_DURATION_MS = 15 * 60 * 1000;

export interface PinVerificationResult {
  verified: boolean;
  locked: boolean;
  retryAfterMs: number;
}

export async function verifyProfilePinWithLockout(
  db: PinD1Database,
  env: PinPepperEnv,
  userId: string,
  profileIndex: number,
  pin: string,
  now = Date.now(),
): Promise<PinVerificationResult> {
  if (!userId || userId.length > 128 || !Number.isSafeInteger(profileIndex) || profileIndex < 1) {
    throw new Error("Invalid profile PIN owner.");
  }
  const row = await db.prepare(`
    SELECT pin_hash AS pinHash, pin_salt AS pinSalt, hash_algorithm AS hashAlgorithm,
      hash_parameters_json AS hashParametersJson, failed_attempts AS failedAttempts,
      locked_until AS lockedUntil
    FROM profile_pin_credentials
    WHERE user_id = ?1 AND profile_index = ?2
  `).bind(userId, profileIndex).first<{
    pinHash: Uint8Array;
    pinSalt: Uint8Array;
    hashAlgorithm: string;
    hashParametersJson: string;
    failedAttempts: number;
    lockedUntil: number | null;
  }>();

  if (!row) return { verified: false, locked: false, retryAfterMs: 0 };
  if (row.lockedUntil !== null && Number(row.lockedUntil) > now) {
    return { verified: false, locked: true, retryAfterMs: Number(row.lockedUntil) - now };
  }

  const correct = await verifyPin(env, userId, profileIndex, pin, {
    pinHash: new Uint8Array(row.pinHash),
    pinSalt: new Uint8Array(row.pinSalt),
    hashAlgorithm: row.hashAlgorithm as "HMAC-SHA256-PEPPERED-PIN-V1",
    hashParametersJson: row.hashParametersJson,
  });

  if (correct) {
    const update = await db.prepare(`
      UPDATE profile_pin_credentials
      SET failed_attempts = 0, locked_until = NULL, updated_at = ?1
      WHERE user_id = ?2 AND profile_index = ?3
        AND (locked_until IS NULL OR locked_until <= ?1)
    `).bind(now, userId, profileIndex).run();
    if (update.meta.changes === 0) {
      const latest = await db.prepare(`
        SELECT locked_until AS lockedUntil FROM profile_pin_credentials
        WHERE user_id = ?1 AND profile_index = ?2
      `).bind(userId, profileIndex).first<{ lockedUntil: number | null }>();
      const retryAfterMs = Math.max(0, Number(latest?.lockedUntil ?? 0) - now);
      return { verified: false, locked: retryAfterMs > 0, retryAfterMs };
    }
    return { verified: true, locked: false, retryAfterMs: 0 };
  }

  const lockUntil = now + PIN_LOCKOUT_DURATION_MS;
  const update = await db.prepare(`
    UPDATE profile_pin_credentials
    SET failed_attempts = failed_attempts + 1,
      locked_until = CASE
        WHEN failed_attempts + 1 >= ?1 THEN ?2
        ELSE locked_until
      END,
      updated_at = ?3
    WHERE user_id = ?4 AND profile_index = ?5
      AND (locked_until IS NULL OR locked_until <= ?3)
  `).bind(PIN_MAX_FAILED_ATTEMPTS, lockUntil, now, userId, profileIndex).run();

  if (update.meta.changes === 0) {
    const latest = await db.prepare(`
      SELECT locked_until AS lockedUntil FROM profile_pin_credentials
      WHERE user_id = ?1 AND profile_index = ?2
    `).bind(userId, profileIndex).first<{ lockedUntil: number | null }>();
    const retryAfterMs = Math.max(0, Number(latest?.lockedUntil ?? 0) - now);
    return { verified: false, locked: retryAfterMs > 0, retryAfterMs };
  }

  const latest = await db.prepare(`
    SELECT failed_attempts AS failedAttempts, locked_until AS lockedUntil
    FROM profile_pin_credentials
    WHERE user_id = ?1 AND profile_index = ?2
  `).bind(userId, profileIndex).first<{
    failedAttempts: number;
    lockedUntil: number | null;
  }>();
  const retryAfterMs = Math.max(0, Number(latest?.lockedUntil ?? 0) - now);
  return { verified: false, locked: retryAfterMs > 0, retryAfterMs };
}
