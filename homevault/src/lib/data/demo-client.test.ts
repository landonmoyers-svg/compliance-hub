import { test } from "node:test";
import assert from "node:assert/strict";
import { DemoDataClient } from "./demo-client";
import { DEMO_RECORDS, DEMO_RECIPIENTS } from "./demo";
import { CATEGORY_BY_KEY } from "../domain/categories";

/**
 * The demo adapter is what the public deployment serves, so these tests pin the
 * seam's contract: the shapes the UI relies on, and the zero-knowledge rule that
 * nothing secret crosses the DataClient boundary.
 */

const client = new DemoDataClient();

test("listRecords returns the demo household's metadata", async () => {
  const records = await client.listRecords();
  assert.equal(records.length, DEMO_RECORDS.length);
  assert.ok(records.length > 0);
});

test("records carry only non-secret metadata — no ciphertext or key material", async () => {
  const records = await client.listRecords();
  const allowed = new Set([
    "id",
    "householdId",
    "category",
    "tier",
    "label",
    "kind",
    "hasPhysicalLocation",
    "expiresOn",
    "createdAt",
    "updatedAt",
  ]);
  for (const r of records) {
    for (const key of Object.keys(r)) {
      assert.ok(allowed.has(key), `record exposed unexpected field "${key}" across the data seam`);
    }
  }
});

test("every record's category is a known taxonomy key", async () => {
  const records = await client.listRecords();
  for (const r of records) {
    assert.ok(CATEGORY_BY_KEY[r.category], `unknown category "${r.category}"`);
  }
});

test("expiresOn is a plain calendar day (YYYY-MM-DD) or null", async () => {
  const records = await client.listRecords();
  for (const r of records) {
    if (r.expiresOn !== null) {
      assert.match(r.expiresOn, /^\d{4}-\d{2}-\d{2}$/, `bad expiresOn "${r.expiresOn}" on ${r.id}`);
    }
  }
});

test("listRecipients maps to the seam shape (drops the fixture-only role field)", async () => {
  const recipients = await client.listRecipients();
  assert.equal(recipients.length, DEMO_RECIPIENTS.length);
  for (const r of recipients) {
    assert.deepEqual(Object.keys(r).sort(), ["id", "isMember", "name", "relationship", "scopeTiers"]);
  }
});

test("plans reference recipients that actually exist", async () => {
  const [plans, recipients] = await Promise.all([client.listPlans(), client.listRecipients()]);
  const ids = new Set(recipients.map((r) => r.id));
  assert.ok(plans.length > 0);
  for (const p of plans) {
    for (const rid of p.recipientIds) {
      assert.ok(ids.has(rid), `plan ${p.id} references unknown recipient "${rid}"`);
    }
  }
});

test("listMembers returns household members with valid roles", async () => {
  const members = await client.listMembers();
  const roles = new Set(["owner", "co_owner", "viewer"]);
  assert.ok(members.length > 0);
  for (const m of members) {
    assert.ok(roles.has(m.role), `unknown member role "${m.role}"`);
  }
});
