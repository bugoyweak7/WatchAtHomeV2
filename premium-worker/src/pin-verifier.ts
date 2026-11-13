export interface PinPepperEnv {
  PIN_PEPPER_KEYS_JSON: string;
  PIN_PEPPER_ACTIVE_VERSION: string;
}

export interface PinVerifierRecord {
  pinHash: Uint8Array;
  pinSalt: Uint8Array;
  hashAlgorithm: "HMAC-SHA256-PEPPERED-PIN-V1";
  hashParametersJson: string;
}

function decodeBase64(value: string): Uint8Array {
  let binary: string;
  try {
    binary = atob(value);
  } catch {
    throw new Error("PIN pepper key ring contains invalid base64.");
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function parsePepperRing(env: PinPepperEnv): { activeVersion: number; keys: Map<number, Uint8Array> } {
  let raw: unknown;
  try {
    raw = JSON.parse(env.PIN_PEPPER_KEYS_JSON);
  } catch {
    throw new Error("PIN pepper key ring is not valid JSON.");
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("PIN pepper key ring must be a version-to-key object.");
  }
  const keys = new Map<number, Uint8Array>();
  for (const [versionText, encoded] of Object.entries(raw as Record<string, unknown>)) {
    const version = Number(versionText);
    if (!Number.isSafeInteger(version) || version < 1 || typeof encoded !== "string") {
      throw new Error("PIN pepper key ring contains an invalid entry.");
    }
    const key = decodeBase64(encoded);
    if (key.byteLength < 32) throw new Error("Each PIN pepper must contain at least 32 bytes.");
    keys.set(version, key);
  }
  const activeVersion = Number(env.PIN_PEPPER_ACTIVE_VERSION);
  if (!Number.isSafeInteger(activeVersion) || !keys.has(activeVersion)) {
    throw new Error("Active PIN pepper version is unavailable.");
  }
  return { activeVersion, keys };
}

function validatePin(pin: string): void {
  if (typeof pin !== "string" || pin.length < 4 || pin.length > 64) {
    throw new Error("PIN must contain between 4 and 64 characters.");
  }
}

function pinMessage(userId: string, profileIndex: number, salt: Uint8Array, pin: string): Uint8Array {
  if (!userId || userId.length > 128 || !Number.isSafeInteger(profileIndex) || profileIndex < 1) {
    throw new Error("PIN owner context is invalid.");
  }
  const prefix = new TextEncoder().encode(JSON.stringify([
    "watchathome-profile-pin-v1",
    userId,
    profileIndex,
  ]));
  const pinBytes = new TextEncoder().encode(pin);
  const output = new Uint8Array(prefix.length + salt.length + pinBytes.length);
  output.set(prefix, 0);
  output.set(salt, prefix.length);
  output.set(pinBytes, prefix.length + salt.length);
  return output;
}

async function hmac(keyBytes: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, message));
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let i = 0; i < left.byteLength; i++) difference |= left[i] ^ right[i];
  return difference === 0;
}

export async function createPinVerifier(
  env: PinPepperEnv,
  userId: string,
  profileIndex: number,
  pin: string,
): Promise<PinVerifierRecord> {
  validatePin(pin);
  const { activeVersion, keys } = parsePepperRing(env);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const pinHash = await hmac(keys.get(activeVersion)!, pinMessage(userId, profileIndex, salt, pin));
  return {
    pinHash,
    pinSalt: salt,
    hashAlgorithm: "HMAC-SHA256-PEPPERED-PIN-V1",
    hashParametersJson: JSON.stringify({ pepperVersion: activeVersion }),
  };
}

export async function verifyPin(
  env: PinPepperEnv,
  userId: string,
  profileIndex: number,
  pin: string,
  record: PinVerifierRecord,
): Promise<boolean> {
  validatePin(pin);
  if (record.hashAlgorithm !== "HMAC-SHA256-PEPPERED-PIN-V1") {
    throw new Error("Unsupported profile PIN verifier algorithm.");
  }
  if (record.pinSalt.byteLength !== 16 || record.pinHash.byteLength !== 32) {
    throw new Error("Stored profile PIN verifier has invalid dimensions.");
  }
  let parameters: unknown;
  try {
    parameters = JSON.parse(record.hashParametersJson);
  } catch {
    throw new Error("Stored profile PIN parameters are invalid.");
  }
  const pepperVersion = Number((parameters as { pepperVersion?: unknown })?.pepperVersion);
  const { keys } = parsePepperRing(env);
  const pepper = keys.get(pepperVersion);
  if (!pepper) throw new Error("Stored profile PIN pepper version is unavailable.");
  const candidate = await hmac(pepper, pinMessage(userId, profileIndex, record.pinSalt, pin));
  return constantTimeEqual(candidate, record.pinHash);
}
