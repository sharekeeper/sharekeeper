/**
 * Local collector for the user's movement/timing contribution, with a
 * heuristic running score (in bits) used to gate collection.
 *
 * Estimate (after the Linux kernel's input-timing estimator): for each axis,
 * take the smallest of the first, second and third differences of successive
 * values; credit floor(log2(m)) bits for that axis when m >= 2, nothing
 * otherwise. Pointer events use the x and y position in whole CSS pixels and
 * are capped at 2 bits each; straight or constant-speed motion therefore earns
 * little or nothing. A position change identical to one of the previous 16
 * earns nothing, so simple repeated patterns stall. Keyboard/tap events use
 * the interval in milliseconds and are capped at 4 bits each. The score only
 * reflects arithmetic variation: it is not measured entropy, and predictable
 * motion can still score. It gates collection; it guarantees nothing.
 *
 * Records stay in memory only. encode() returns a binary copy for mixing.
 */
/**
 * Collection target: 376 points per pad (an 80-letter pad carries
 * 80 × log2 26 ≈ 376 bits) for each of the m shares, plus 128 for the
 * 128-bit master secret: 376·m + 128 (1256, 1632, 2008 for m = 3, 4, 5).
 */
export const PAD_TARGET_BITS = 376;
export const SEED_TARGET_BITS = 128;
export function userEntropyTargetBits(shareCount) {
  if (!Number.isInteger(shareCount) || shareCount < 2 || shareCount > 5) throw new RangeError("Share count must be an integer from 2 to 5.");
  return PAD_TARGET_BITS * shareCount + SEED_TARGET_BITS;
}
export const MAX_ENTROPY_RECORDS = 12_000;
const POINTER_CAP_BITS = 2;
const TIMING_CAP_BITS = 4;
const KIND_CODES = { mouse: 1, touch: 2, pen: 3, "tap / keyboard": 4 };
const FIELDS = 5;
const RECENT_DELTAS = 16;

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
  let lastPixel = null;
  const recent = [];

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
        const pixel = [Math.round(px / 100), Math.round(py / 100)];
        credit = Math.min(POINTER_CAP_BITS, axisCredit(x, pixel[0]) + axisCredit(y, pixel[1]));
        if (lastPixel) {
          const delta = `${pixel[0] - lastPixel[0]},${pixel[1] - lastPixel[1]}`;
          if (recent.includes(delta)) credit = 0;
          recent.push(delta);
          if (recent.length > RECENT_DELTAS) recent.shift();
        }
        lastPixel = pixel;
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
      lastPixel = null;
      recent.length = 0;
    },
  };
}
