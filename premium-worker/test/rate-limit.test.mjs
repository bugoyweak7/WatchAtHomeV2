import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { consumeRateLimit } from "../src/rate-limit.ts";

const schema = readFileSync(new URL("../schema/0001_account_data.draft.sql", import.meta.url), "utf8");
function createDb() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(schema);
  return {
    prepare(query) {
      let args = [];
      const stmt = {
        bind(...values) { args = values; return stmt; },
        async run() { const result = sqlite.prepare(query).run(...args); return { meta: { changes: Number(result.changes) } }; },
        async first() { return sqlite.prepare(query).get(...args) ?? null; },
      };
      return stmt;
    },
    close() { sqlite.close(); },
  };
}

test("rate limiter allows the configured count then blocks until the fixed window expires", async () => {
  const db = createDb();
  const now = 100000;
  for (let i = 1; i <= 3; i++) {
    const result = await consumeRateLimit(db, "user-a", "pin", "account", 3, 60000, now + i);
    assert.equal(result.allowed, true);
    assert.equal(result.count, i);
  }
  const blocked = await consumeRateLimit(db, "user-a", "pin", "account", 3, 60000, now + 4);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.count, 4);
  assert.equal(blocked.retryAfterMs, 59996);
  const reset = await consumeRateLimit(db, "user-a", "pin", "account", 3, 60000, now + 60001);
  assert.equal(reset.allowed, true);
  assert.equal(reset.count, 1);
  db.close();
});

test("rate-limit buckets are isolated by owner, route, and client key", async () => {
  const db = createDb();
  const first = await consumeRateLimit(db, "user-a", "pin", "account", 1, 60000, 1000);
  const second = await consumeRateLimit(db, "user-b", "pin", "account", 1, 60000, 1000);
  const third = await consumeRateLimit(db, "user-a", "credential", "account", 1, 60000, 1000);
  assert.equal(first.allowed && second.allowed && third.allowed, true);
  db.close();
});
