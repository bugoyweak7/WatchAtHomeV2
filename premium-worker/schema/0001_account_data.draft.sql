-- WATCHATHOME ACCOUNT DATA SCHEMA — DRAFT ONLY
-- Source-derived from the approved User App client contracts.
-- Not applied to Cloudflare D1. Review and test locally before binding/deployment.
-- Ownership is always enforced by the Worker from a verified Firebase UID.
CREATE TABLE IF NOT EXISTS accounts (
  user_id TEXT PRIMARY KEY NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'deletion_pending', 'deleted')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE TABLE IF NOT EXISTS profiles (
  user_id TEXT NOT NULL,
  profile_index INTEGER NOT NULL CHECK (profile_index > 0),
  profile_id TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, profile_index),
  UNIQUE (user_id, profile_id),
  FOREIGN KEY (user_id) REFERENCES accounts(user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS profile_settings (
  user_id TEXT NOT NULL,
  profile_index INTEGER NOT NULL,
  platform TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version > 0),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, profile_index, platform),
  FOREIGN KEY (user_id, profile_index)
    REFERENCES profiles(user_id, profile_index) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS profile_pin_credentials (
  user_id TEXT NOT NULL,
  profile_index INTEGER NOT NULL,
  pin_hash BLOB NOT NULL,
  pin_salt BLOB NOT NULL,
  hash_algorithm TEXT NOT NULL,
  hash_parameters_json TEXT NOT NULL CHECK (json_valid(hash_parameters_json)),
  failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until INTEGER,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, profile_index),
  FOREIGN KEY (user_id, profile_index)
    REFERENCES profiles(user_id, profile_index) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS profile_addons (
  user_id TEXT NOT NULL,
  profile_index INTEGER NOT NULL,
  manifest_url TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, profile_index, manifest_url),
  FOREIGN KEY (user_id, profile_index)
    REFERENCES profiles(user_id, profile_index) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS profile_plugins (
  user_id TEXT NOT NULL,
  profile_index INTEGER NOT NULL,
  manifest_url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, profile_index, manifest_url),
  FOREIGN KEY (user_id, profile_index)
    REFERENCES profiles(user_id, profile_index) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS library_items (
  user_id TEXT NOT NULL,
  profile_index INTEGER NOT NULL,
  item_key TEXT NOT NULL,
  content_id TEXT NOT NULL,
  content_type TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  PRIMARY KEY (user_id, profile_index, item_key),
  FOREIGN KEY (user_id, profile_index)
    REFERENCES profiles(user_id, profile_index) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS watch_progress (
  user_id TEXT NOT NULL,
  profile_index INTEGER NOT NULL,
  progress_key TEXT NOT NULL,
  content_id TEXT NOT NULL,
  content_type TEXT NOT NULL,
  video_id TEXT NOT NULL DEFAULT '',
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  last_watched_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  PRIMARY KEY (user_id, profile_index, progress_key),
  FOREIGN KEY (user_id, profile_index)
    REFERENCES profiles(user_id, profile_index) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS watched_items (
  user_id TEXT NOT NULL,
  profile_index INTEGER NOT NULL,
  item_key TEXT NOT NULL,
  content_id TEXT NOT NULL,
  content_type TEXT NOT NULL,
  season_number INTEGER,
  episode_number INTEGER,
  watched_at INTEGER NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  PRIMARY KEY (user_id, profile_index, item_key),
  FOREIGN KEY (user_id, profile_index)
    REFERENCES profiles(user_id, profile_index) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS collections (
  user_id TEXT NOT NULL,
  profile_index INTEGER NOT NULL,
  collections_json TEXT NOT NULL CHECK (json_valid(collections_json)),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, profile_index),
  FOREIGN KEY (user_id, profile_index)
    REFERENCES profiles(user_id, profile_index) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS home_catalog_settings (
  user_id TEXT NOT NULL,
  profile_index INTEGER NOT NULL,
  platform TEXT NOT NULL,
  settings_json TEXT NOT NULL CHECK (json_valid(settings_json)),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, profile_index, platform),
  FOREIGN KEY (user_id, profile_index)
    REFERENCES profiles(user_id, profile_index) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS provider_credentials (
  user_id TEXT NOT NULL,
  profile_index INTEGER NOT NULL,
  provider TEXT NOT NULL,
  ciphertext BLOB NOT NULL,
  nonce BLOB NOT NULL,
  key_version INTEGER NOT NULL CHECK (key_version > 0),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, profile_index, provider),
  FOREIGN KEY (user_id, profile_index)
    REFERENCES profiles(user_id, profile_index) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS media_servers (
  user_id TEXT NOT NULL,
  profile_index INTEGER NOT NULL,
  server_key TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  remote_server_id TEXT NOT NULL,
  remote_user_id TEXT NOT NULL,
  metadata_json TEXT NOT NULL CHECK (json_valid(metadata_json)),
  token_ciphertext BLOB,
  token_nonce BLOB,
  token_key_version INTEGER,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, profile_index, server_key),
  CHECK (
    (token_ciphertext IS NULL AND token_nonce IS NULL AND token_key_version IS NULL)
    OR
    (token_ciphertext IS NOT NULL AND token_nonce IS NOT NULL AND token_key_version IS NOT NULL AND token_key_version > 0)
  ),
  FOREIGN KEY (user_id, profile_index)
    REFERENCES profiles(user_id, profile_index) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS registered_devices (
  user_id TEXT NOT NULL,
  installation_id TEXT NOT NULL,
  client_name TEXT NOT NULL,
  client_version TEXT NOT NULL,
  platform TEXT NOT NULL,
  device_name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  revoked_at INTEGER,
  PRIMARY KEY (user_id, installation_id),
  FOREIGN KEY (user_id) REFERENCES accounts(user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS device_link_sessions (
  session_id TEXT PRIMARY KEY NOT NULL,
  device_code_hash TEXT NOT NULL UNIQUE,
  user_code_hash TEXT NOT NULL UNIQUE,
  nonce_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'consumed', 'expired', 'cancelled')),
  approved_uid TEXT,
  redirect_base_url TEXT,
  device_name TEXT NOT NULL,
  device_type TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  poll_interval_seconds INTEGER NOT NULL CHECK (poll_interval_seconds > 0),
  failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  created_at INTEGER NOT NULL,
  approved_at INTEGER,
  consumed_at INTEGER,
  FOREIGN KEY (approved_uid) REFERENCES accounts(user_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sync_events (
  event_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  profile_index INTEGER NOT NULL,
  resource TEXT NOT NULL,
  record_key TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('upsert', 'delete')),
  payload_json TEXT CHECK (payload_json IS NULL OR json_valid(payload_json)),
  origin_client_id TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id, profile_index)
    REFERENCES profiles(user_id, profile_index) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  user_id TEXT NOT NULL,
  route_key TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_json TEXT CHECK (response_json IS NULL OR json_valid(response_json)),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, route_key, idempotency_key),
  FOREIGN KEY (user_id) REFERENCES accounts(user_id) ON DELETE CASCADE
);

-- Deliberately not FK-cascaded: retain a minimal retryable deletion tombstone
-- after owned account rows have been removed.
CREATE TABLE IF NOT EXISTS account_deletion_jobs (
  user_id TEXT PRIMARY KEY NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  current_step TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error_code TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_profiles_owner_updated
  ON profiles(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_library_delta
  ON library_items(user_id, profile_index, updated_at, item_key);
CREATE INDEX IF NOT EXISTS idx_watch_progress_delta
  ON watch_progress(user_id, profile_index, updated_at, progress_key);
CREATE INDEX IF NOT EXISTS idx_watched_items_delta
  ON watched_items(user_id, profile_index, updated_at, item_key);
CREATE INDEX IF NOT EXISTS idx_sync_events_cursor
  ON sync_events(user_id, profile_index, resource, event_id);
CREATE INDEX IF NOT EXISTS idx_sync_events_retention
  ON sync_events(created_at);
CREATE INDEX IF NOT EXISTS idx_device_link_expiry
  ON device_link_sessions(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_registered_devices_active
  ON registered_devices(user_id, revoked_at, last_seen_at);
CREATE INDEX IF NOT EXISTS idx_idempotency_expiry
  ON idempotency_keys(expires_at);
