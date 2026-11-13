export interface DataEncryptionEnv {
  DATA_ENCRYPTION_KEYS_JSON: string;
  DATA_ENCRYPTION_ACTIVE_VERSION: string;
}

export interface EncryptedValue {
  ciphertext: Uint8Array;
  nonce: Uint8Array;
  keyVersion: number;
}

export interface EncryptionContext {
  userId: string;
  profileIndex: number;
  resource: string;
  recordKey: string;
}

function decodeBase64(value: string): Uint8Array {
  let binary: string;
  try {
    binary = atob(value);
  } catch {
    throw new Error("Encryption key ring contains invalid base64.");
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encodeBase64(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function parseKeyRing(env: DataEncryptionEnv): { activeVersion: number; keys: Map<number, Uint8Array> } {
  let raw: unknown;
  try {
    raw = JSON.parse(env.DATA_ENCRYPTION_KEYS_JSON);
  } catch {
    throw new Error("Data encryption key ring is not valid JSON.");
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Data encryption key ring must be a version-to-key object.");
  }
  const keys = new Map<number, Uint8Array>();
  for (const [versionText, encoded] of Object.entries(raw as Record<string, unknown>)) {
    const version = Number(versionText);
    if (!Number.isSafeInteger(version) || version < 1 || typeof encoded !== "string") {
      throw new Error("Data encryption key ring contains an invalid entry.");
    }
    const key = decodeBase64(encoded);
    if (key.byteLength !== 32) throw new Error("Each data encryption key must be exactly 32 bytes.");
    keys.set(version, key);
  }
  const activeVersion = Number(env.DATA_ENCRYPTION_ACTIVE_VERSION);
  if (!Number.isSafeInteger(activeVersion) || !keys.has(activeVersion)) {
    throw new Error("Active data encryption key version is unavailable.");
  }
  return { activeVersion, keys };
}

function additionalData(context: EncryptionContext): Uint8Array {
  if (
    !context.userId ||
    !Number.isSafeInteger(context.profileIndex) ||
    context.profileIndex < 1 ||
    !context.resource ||
    !context.recordKey
  ) {
    throw new Error("Encryption ownership context is incomplete.");
  }
  return new TextEncoder().encode(JSON.stringify([
    "watchathome-data-v1",
    context.userId,
    context.profileIndex,
    context.resource,
    context.recordKey,
  ]));
}

export function encodeEncryptedValue(value: EncryptedValue): {
  ciphertext: string;
  nonce: string;
  keyVersion: number;
} {
  return {
    ciphertext: encodeBase64(value.ciphertext),
    nonce: encodeBase64(value.nonce),
    keyVersion: value.keyVersion,
  };
}

export async function encryptRecord(
  env: DataEncryptionEnv,
  context: EncryptionContext,
  plaintext: string,
): Promise<EncryptedValue> {
  const { activeVersion, keys } = parseKeyRing(env);
  const key = await crypto.subtle.importKey("raw", keys.get(activeVersion)!, "AES-GCM", false, ["encrypt"]);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce, additionalData: additionalData(context), tagLength: 128 },
    key,
    new TextEncoder().encode(plaintext),
  );
  return { ciphertext: new Uint8Array(ciphertext), nonce, keyVersion: activeVersion };
}

export async function decryptRecord(
  env: DataEncryptionEnv,
  context: EncryptionContext,
  encrypted: EncryptedValue,
): Promise<string> {
  const { keys } = parseKeyRing(env);
  const rawKey = keys.get(encrypted.keyVersion);
  if (!rawKey) throw new Error("Encrypted record references an unavailable key version.");
  if (encrypted.nonce.byteLength !== 12 || encrypted.ciphertext.byteLength < 16) {
    throw new Error("Encrypted record has an invalid AES-GCM payload.");
  }
  const key = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: encrypted.nonce, additionalData: additionalData(context), tagLength: 128 },
    key,
    encrypted.ciphertext,
  );
  return new TextDecoder().decode(plaintext);
}
