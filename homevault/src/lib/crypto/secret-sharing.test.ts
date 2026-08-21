import { test } from "node:test";
import assert from "node:assert/strict";
import { split, combine, type Share } from "./secret-sharing";

function eq(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

test("2-of-3: any two shares reconstruct the secret", () => {
  const secret = new Uint8Array([1, 2, 3, 255, 0, 42, 128]);
  const shares = split(secret, 3, 2);
  assert.equal(shares.length, 3);
  const pairs: [number, number][] = [
    [0, 1],
    [0, 2],
    [1, 2],
  ];
  for (const [a, b] of pairs) {
    assert.ok(eq(combine([shares[a], shares[b]]), secret), `pair ${a},${b} should reconstruct`);
  }
});

test("3-of-5: exactly threshold reconstructs; all shares also reconstruct", () => {
  const secret = crypto.getRandomValues(new Uint8Array(32)); // a 256-bit vault key
  const shares = split(secret, 5, 3);
  assert.ok(eq(combine(shares.slice(0, 3)), secret));
  assert.ok(eq(combine(shares), secret));
});

test("fewer than threshold does not reveal the secret", () => {
  const secret = new Uint8Array([9, 8, 7, 6]);
  const shares = split(secret, 3, 2);
  // A single share is just its y bytes — must not equal the secret.
  assert.ok(!eq(shares[0].y, secret));
});

test("duplicate x-coordinates are rejected", () => {
  const secret = new Uint8Array([1, 2, 3]);
  const s = split(secret, 3, 2);
  const dup: Share[] = [s[0], { x: s[0].x, y: s[0].y }];
  assert.throws(() => combine(dup), /Duplicate/);
});

test("invalid threshold is rejected", () => {
  assert.throws(() => split(new Uint8Array([1]), 3, 1), /threshold/);
  assert.throws(() => split(new Uint8Array([1]), 2, 3), /threshold/);
});
