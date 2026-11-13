import {
  decryptRecord,
  encryptRecord,
  type DataEncryptionEnv,
} from "./data-crypto";

export interface CredentialD1Database {
  prepare(query: string): CredentialD1Statement;
}

interface CredentialD1Statement {
  bind(...values: unknown[]): CredentialD1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<{ meta: { changes: number } }>;
}

function validateOwner(userId: string, profileIndex: number): void {
  if (!userId || userId.length > 128) throw new Error("Invalid credential owner.");
  if (!Number.isSafeInteger(profileIndex) || profileIndex < 1) {
    throw new Error("Invalid credential profile.");
  }
}

function validateRecordKey(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 160) throw new Error(`Invalid ${field}.`);
  return normalized;
}

function rejectSecretMetadata(value: unknown, path = "metadata"): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => rejectSecretMetadata(entry, `${path}[${index}]`));
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (/(^|_)(access_?token|refresh_?token|token|password|secret|api_?key|authorization)(_|$)/i.test(key)) {
      throw new Error(`Sensitive field is not allowed in media-server metadata: ${path}.`);
    }
    rejectSecretMetadata(child, `${path}.${key}`);
  }
}

export async function saveProviderCredential(
  db: CredentialD1Database,
  env: DataEncryptionEnv,
  userId: string,
  profileIndex: number,
  provider: string,
  credentialJson: string,
  now = Date.now(),
): Promise<void> {
  validateOwner(userId, profileIndex);
  const providerKey = validateRecordKey(provider, "provider");
  const parsed = JSON.parse(credentialJson) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Provider credential must be a JSON object.");
  }
  const encrypted = await encryptRecord(env, {
    userId,
    profileIndex,
    resource: "provider-credentials",
    recordKey: providerKey,
  }, credentialJson);

  await db.prepare(`
    INSERT INTO provider_credentials (
      user_id, profile_index, provider, ciphertext, nonce, key_version, updated_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
    ON CONFLICT(user_id, profile_index, provider) DO UPDATE SET
      ciphertext = excluded.ciphertext,
      nonce = excluded.nonce,
      key_version = excluded.key_version,
      updated_at = excluded.updated_at
  `).bind(
    userId, profileIndex, providerKey, encrypted.ciphertext,
    encrypted.nonce, encrypted.keyVersion, now,
  ).run();
}

export async function loadProviderCredential(
  db: CredentialD1Database,
  env: DataEncryptionEnv,
  userId: string,
  profileIndex: number,
  provider: string,
): Promise<string | null> {
  validateOwner(userId, profileIndex);
  const providerKey = validateRecordKey(provider, "provider");
  const row = await db.prepare(`
    SELECT ciphertext, nonce, key_version AS keyVersion
    FROM provider_credentials
    WHERE user_id = ?1 AND profile_index = ?2 AND provider = ?3
  `).bind(userId, profileIndex, providerKey).first<{
    ciphertext: Uint8Array;
    nonce: Uint8Array;
    keyVersion: number;
  }>();
  if (!row) return null;
  return decryptRecord(env, {
    userId,
    profileIndex,
    resource: "provider-credentials",
    recordKey: providerKey,
  }, {
    ciphertext: new Uint8Array(row.ciphertext),
    nonce: new Uint8Array(row.nonce),
    keyVersion: Number(row.keyVersion),
  });
}

export async function saveMediaServer(
  db: CredentialD1Database,
  env: DataEncryptionEnv,
  input: {
    userId: string;
    profileIndex: number;
    serverKey: string;
    providerId: string;
    remoteServerId: string;
    remoteUserId: string;
    metadataJson: string;
    accessToken: string | null;
  },
  now = Date.now(),
): Promise<void> {
  validateOwner(input.userId, input.profileIndex);
  const serverKey = validateRecordKey(input.serverKey, "server key");
  const metadata = JSON.parse(input.metadataJson) as unknown;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new Error("Media-server metadata must be a JSON object.");
  }
  rejectSecretMetadata(metadata);
  const encrypted = input.accessToken === null
    ? null
    : await encryptRecord(env, {
      userId: input.userId,
      profileIndex: input.profileIndex,
      resource: "media-server-token",
      recordKey: serverKey,
    }, input.accessToken);

  await db.prepare(`
    INSERT INTO media_servers (
      user_id, profile_index, server_key, provider_id, remote_server_id,
      remote_user_id, metadata_json, token_ciphertext, token_nonce,
      token_key_version, updated_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
    ON CONFLICT(user_id, profile_index, server_key) DO UPDATE SET
      provider_id = excluded.provider_id,
      remote_server_id = excluded.remote_server_id,
      remote_user_id = excluded.remote_user_id,
      metadata_json = excluded.metadata_json,
      token_ciphertext = excluded.token_ciphertext,
      token_nonce = excluded.token_nonce,
      token_key_version = excluded.token_key_version,
      updated_at = excluded.updated_at
  `).bind(
    input.userId, input.profileIndex, serverKey, input.providerId,
    input.remoteServerId, input.remoteUserId, input.metadataJson,
    encrypted?.ciphertext ?? null, encrypted?.nonce ?? null,
    encrypted?.keyVersion ?? null, now,
  ).run();
}

export async function loadMediaServerToken(
  db: CredentialD1Database,
  env: DataEncryptionEnv,
  userId: string,
  profileIndex: number,
  serverKey: string,
): Promise<string | null> {
  validateOwner(userId, profileIndex);
  const key = validateRecordKey(serverKey, "server key");
  const row = await db.prepare(`
    SELECT token_ciphertext AS ciphertext, token_nonce AS nonce,
      token_key_version AS keyVersion
    FROM media_servers
    WHERE user_id = ?1 AND profile_index = ?2 AND server_key = ?3
  `).bind(userId, profileIndex, key).first<{
    ciphertext: Uint8Array | null;
    nonce: Uint8Array | null;
    keyVersion: number | null;
  }>();
  if (!row || row.ciphertext === null || row.nonce === null || row.keyVersion === null) return null;
  return decryptRecord(env, {
    userId,
    profileIndex,
    resource: "media-server-token",
    recordKey: key,
  }, {
    ciphertext: new Uint8Array(row.ciphertext),
    nonce: new Uint8Array(row.nonce),
    keyVersion: Number(row.keyVersion),
  });
}
