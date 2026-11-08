import test from "node:test";
import assert from "node:assert/strict";
import { axisCredit, createEntropyCollector, MAX_ENTROPY_RECORDS, USER_ENTROPY_TARGET_BITS } from "../src/entropy.js";

test("target is 1600 bits", () => {
  assert.equal(USER_ENTROPY_TARGET_BITS, 1600);
});

test("axis credit uses the smallest of first, second and third differences", () => {
  const state = { last: null, d1: null, d2: null };
  assert.equal(axisCredit(state, 0), 0);
  assert.equal(axisCredit(state, 100), 6); // d1=d2=d3=100 on second sample
  assert.equal(axisCredit(state, 200), 0); // constant speed: d2 = 0
  assert.equal(axisCredit(state, 310), 3); // d1 = 110, d2 = 10, d3 = 10 -> floor(log2 10)
  assert.equal(axisCredit(state, 421), 0); // d1 = 111, d2 = 1, d3 = -9 -> min 1
});

test("straight or constant-speed motion earns nothing", () => {
  const collector = createEntropyCollector();
  for (let i = 0; i < 500; i += 1) collector.add({ kind: "mouse", x: i * 500, y: i * 300, time: i * 16_000 });
  assert.ok(collector.bits <= 4, `got ${collector.bits}`);
});

test("pointer credit is capped at 2 bits per event and taps at 4", () => {
  const pointer = createEntropyCollector();
  let seed = 1;
  const next = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed; };
  for (let i = 0; i < 1000; i += 1) {
    const credit = pointer.add({ kind: "mouse", x: (next() % 80000), y: (next() % 40000), time: i * 16_000 });
    assert.ok(credit >= 0 && credit <= 2);
  }
  assert.ok(pointer.bits <= 2000);
  const taps = createEntropyCollector();
  let time = 0;
  for (let i = 0; i < 100; i += 1) {
    time += 150_000 + (next() % 400_000);
    const credit = taps.add({ kind: "tap / keyboard", x: 0, y: 0, time });
    assert.ok(credit >= 0 && credit <= 4);
  }
});

test("realistic curved movement reaches the target in about a thousand events", () => {
  const collector = createEntropyCollector();
  let seed = 7;
  const next = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  let x = 300; let y = 200; let vx = 3; let vy = 2; let events = 0;
  while (collector.bits < USER_ENTROPY_TARGET_BITS && events < 5000) {
    vx += (next() - 0.5) * 8; vy += (next() - 0.5) * 8;
    x += vx; y += vy;
    collector.add({ kind: "mouse", x: Math.round(x * 100), y: Math.round(y * 100), time: events * 16_000 });
    events += 1;
  }
  assert.ok(collector.bits >= USER_ENTROPY_TARGET_BITS);
  assert.ok(events < 2000, `took ${events} events`);
});

test("encode is a binary snapshot; clear resets records, counts and bits", () => {
  const collector = createEntropyCollector();
  collector.add({ kind: "mouse", x: 1, y: -2, time: 3, pressure: 4 });
  collector.add({ kind: "tap / keyboard", x: 0, y: 0, time: 9 });
  const bytes = collector.encode();
  assert.equal(bytes.byteLength, 1 + 2 * 20);
  assert.equal(bytes[0], 2);
  const view = new DataView(bytes.buffer);
  assert.deepEqual([0, 1, 2, 3, 4].map((field) => view.getInt32(1 + field * 4, true)), [1, 1, -2, 3, 4]);
  assert.equal(collector.countOf("tap / keyboard"), 1);
  collector.clear();
  assert.equal(collector.count, 0);
  assert.equal(collector.bits, 0);
  assert.equal(collector.countOf("mouse"), 0);
});

test("collection is bounded and fits the mixing input limit", () => {
  const collector = createEntropyCollector();
  for (let i = 0; i < MAX_ENTROPY_RECORDS + 10; i += 1) collector.add({ kind: "mouse", x: i, y: i, time: i });
  assert.equal(collector.count, MAX_ENTROPY_RECORDS);
  assert.ok(collector.encode().byteLength <= 262_144);
  assert.throws(() => createEntropyCollector().add({ kind: "mouse", x: 0.5, y: 0, time: 0 }), /safe integers/);
});
