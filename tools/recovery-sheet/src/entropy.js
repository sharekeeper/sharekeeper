/**
 * Local collector for the user's movement/timing contribution, with a
 * conservative running estimate of the entropy it contains.
 *
 * Estimate (after the Linux kernel's input-timing estimator): for each axis,
 * take the smallest of the first, second and third differences of successive
 * values; credit floor(log2(m)) bits for that axis when m >= 2, nothing
 * otherwise. Pointer events use the x and y position in whole CSS pixels and
 * are capped at 2 bits each; straight or constant-speed motion therefore earns
 * little or nothing. Keyboard/tap events use the interval in milliseconds and
 * are capped at 4 bits each. This is a deliberately cautious heuristic for
 * gating collection, not a measurement or guarantee of unpredictability.
 *
 * Records stay in memory only. encode() returns a binary copy for mixing.
 */
export const USER_ENTROPY_TARGET_BITS = 1600;
export const MAX_ENTROPY_RECORDS = 12_000;
const POINTER_CAP_BITS = 2;
const TIMING_CAP_BITS = 4;
const KIND_CODES = { mouse: 1, touch: 2, pen: 3, "tap / keyboard": 4 };
const FIELDS = 5;

function axis() {
  return { last: null, d1: null, d2: null };
}

/** Bits credited for a new value on one axis; updates the axis history. */
export function axisCredit(state, value) {
  if (state.last === null) {
    state.last = value;
    return 0;
  }
  const d1 = value - state.last;
  const d2 = state.d1 === null ? d1 : d1 - state.d1;
  const d3 = state.d2 === null ? d2 : d2 - state.d2;
  state.last = value;
  state.d1 = d1;
  state.d2 = d2;
  const m = Math.min(Math.abs(d1), Math.abs(d2), Math.abs(d3));
  return m >= 2 ? Math.floor(Math.log2(m)) : 0;
}

export function createEntropyCollector() {
  const records = [];
  const counts = new Map();
  let bits = 0;
  let x = axis();
  let y = axis();
  let t = axis();

  return {
    get bits() { return bits; },
    get count() { return records.length; },
    get full() { return records.length >= MAX_ENTROPY_RECORDS; },
    countOf(kind) { return counts.get(KIND_CODES[kind]) ?? 0; },
    /**
     * Add one trusted event. x/y are positions in 1/100 CSS px, time is
     * microseconds since collection started. Returns the bits credited.
     */
    add({ kind, x: px, y: py, time, pressure = 0 }) {
      if (records.length >= MAX_ENTROPY_RECORDS) return 0;
      const code = KIND_CODES[kind] ?? KIND_CODES.mouse;
      for (const value of [px, py, time, pressure]) {
        if (!Number.isSafeInteger(value)) throw new TypeError("Entropy record values must be safe integers.");
      }
      records.push([code, px, py, time, pressure]);
      counts.set(code, (counts.get(code) ?? 0) + 1);
      let credit;
      if (code === KIND_CODES["tap / keyboard"]) {
        credit = Math.min(TIMING_CAP_BITS, axisCredit(t, Math.round(time / 1000)));
      } else {
        credit = Math.min(POINTER_CAP_BITS,
          axisCredit(x, Math.round(px / 100)) + axisCredit(y, Math.round(py / 100)));
      }
      bits += credit;
      return credit;
    },
    /** Binary snapshot: version byte, then five signed 32-bit fields per record. */
    encode() {
      const bytes = new Uint8Array(1 + records.length * FIELDS * 4);
      const view = new DataView(bytes.buffer);
      bytes[0] = 2;
      records.forEach((record, index) => {
        record.forEach((value, field) => view.setInt32(1 + (index * FIELDS + field) * 4, value | 0, true));
      });
      return bytes;
    },
    clear() {
      records.forEach((record) => record.fill(0));
      records.length = 0;
      counts.clear();
      bits = 0;
      x = axis();
      y = axis();
      t = axis();
    },
  };
}
