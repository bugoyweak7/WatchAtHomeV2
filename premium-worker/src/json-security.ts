import { AccountApiError } from "./account-device";

const SENSITIVE_KEY_FRAGMENTS = [
  "password",
  "passwd",
  "secret",
  "token",
  "credential",
  "apikey",
  "accesskey",
  "authorization",
  "bearer",
];

const SENSITIVE_EXACT_KEYS = new Set([
  "pin",
  "pincode",
  "pinhash",
  "pinvalue",
  "animeskipclientid",
]);

/**
 * Prevent generic profile JSON blobs from becoming a storage path for secrets.
 * Secret values belong in dedicated encrypted credential/PIN storage instead.
 * Unknown non-sensitive fields remain untouched for forward compatibility.
 */
export function rejectSensitiveJsonKeys(value: unknown, resource: string): void {
  const pending: unknown[] = [value];

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || typeof current !== "object") continue;

    if (Array.isArray(current)) {
      pending.push(...current);
      continue;
    }

    for (const [key, child] of Object.entries(current as Record<string, unknown>)) {
      const normalized = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
      if (
        SENSITIVE_EXACT_KEYS.has(normalized) ||
        SENSITIVE_KEY_FRAGMENTS.some(fragment => normalized.includes(fragment))
      ) {
        throw new AccountApiError(
          400,
          `${resource} contains a sensitive field. Store credentials through the dedicated encrypted credential endpoint.`,
        );
      }
      if (child && typeof child === "object") pending.push(child);
    }
  }
}
