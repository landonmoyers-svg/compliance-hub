import { test } from "node:test";
import assert from "node:assert/strict";
import { generateVaultKey, seal, open, exportVaultKey, importVaultKey } from "./envelope";
import { utf8ToBytes } from "./encoding";
import { split, combine } from "./secret-sharing";

test("seal → open round-trips a payload with the right vault key and AAD", async () => {
  const vk = await generateVaultKey();
  const aad = utf8ToBytes(JSON.stringify({ id: "rec1", category: "financial" }));
  const payload = { fields: [{ key: "account", value: "1234-5678", secret: true }], notes: "primary checking" };

  const sealed = await seal(payload, vk, aad);
  const opened = await open<typeof payload>(sealed, vk, aad);
  assert.deepEqual(opened, payload);
});

test("open fails if the AAD (metadata) was tampered with", async () => {
  const vk = await generateVaultKey();
  const aad = utf8ToBytes("category=financial");
  const sealed = await seal({ x: 1 }, vk, aad);
  await assert.rejects(() => open(sealed, vk, utf8ToBytes("category=household")));
});

test("open fails with the wrong vault key", async () => {
  const vk = await generateVaultKey();
  const other = await generateVaultKey();
  const aad = utf8ToBytes("meta");
  const sealed = await seal({ x: 1 }, vk, aad);
  await assert.rejects(() => open(sealed, other, aad));
});

test("handover: a VK split into shares and reconstructed still decrypts records", async () => {
  const vk = await generateVaultKey();
  const aad = utf8ToBytes("meta");
  const sealed = await seal({ secret: "seed phrase words" }, vk, aad);

  // Split the raw VK into a 2-of-3 escrow, then reconstruct from two shares.
  const raw = await exportVaultKey(vk);
  const shares = split(raw, 3, 2);
  const reconstructed = combine([shares[0], shares[2]]);
  const recoveredVk = await importVaultKey(reconstructed);

  const opened = await open<{ secret: string }>(sealed, recoveredVk, aad);
  assert.equal(opened.secret, "seed phrase words");
});
