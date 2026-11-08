#!/usr/bin/env python3
"""Cross-check src/slip39.js against the reference Python implementation.

Requires Node >= 20 on PATH and `pip install shamir-mnemonic` (tested with 0.3.0).
Run from tools/recovery-sheet:

    python3 scripts/slip39-crosscheck.py            # check only
    python3 scripts/slip39-crosscheck.py --write    # also rewrite the fixture

Checks:
  1. Deterministic: for each case, Python and JS split the same secret with the
     same injected byte stream (SHA-256(seed || counter) blocks), for T-of-N
     single-group splits and for 1-of-2 (two 1-of-1 groups, group threshold 1). Their
     mnemonics must be identical, Python must combine the JS mnemonics and JS
     must combine the Python mnemonics (sampled threshold-subsets), with and
     without the right passphrase behaving identically.
  2. Random: FUZZ_CASES random secrets/parameters split by Python with the OS
     RNG and combined by JS, and the same number split by JS with Web Crypto's
     RNG and combined by Python.

With --write, the deterministic cases are saved to
tests/fixtures/slip39-python-crosscheck.json, which the Node test suite uses
without needing Python.
"""

import hashlib
import itertools
import json
import math
import os
import random
import secrets
import subprocess
import sys
from importlib.metadata import version
from pathlib import Path

import shamir_mnemonic
from shamir_mnemonic import shamir

ROOT = Path(__file__).resolve().parent.parent
MODULE_URL = (ROOT / "src" / "slip39.js").as_uri()
FIXTURE = ROOT / "tests" / "fixtures" / "slip39-python-crosscheck.json"
FUZZ_CASES = 150
MAX_SUBSETS = 12
PRINTABLE = "".join(chr(c) for c in range(32, 127))


class Stream:
    """Deterministic byte stream: SHA-256(seed || counter_be32) blocks, consumed sequentially."""

    def __init__(self, seed: bytes):
        self.seed, self.counter, self.buf = seed, 0, b""

    def __call__(self, n: int) -> bytes:
        while len(self.buf) < n:
            self.buf += hashlib.sha256(self.seed + self.counter.to_bytes(4, "big")).digest()
            self.counter += 1
        out, self.buf = self.buf[:n], self.buf[n:]
        return out


NODE_HELPER = r"""
import { createHash, webcrypto } from "node:crypto";
const { splitMasterSecret, combineMnemonics } = await import(process.env.SLIP39_MODULE);
const hex = (b) => Buffer.from(b).toString("hex");
const fromHex = (h) => new Uint8Array(Buffer.from(h, "hex"));
function streamCrypto(seed) {
  let counter = 0, buf = new Uint8Array(0);
  return {
    subtle: webcrypto.subtle,
    getRandomValues(arr) {
      while (buf.length < arr.length) {
        const c = Buffer.alloc(4); c.writeUInt32BE(counter++);
        const block = createHash("sha256").update(Buffer.concat([Buffer.from(seed), c])).digest();
        const next = new Uint8Array(buf.length + block.length); next.set(buf); next.set(block, buf.length); buf = next;
      }
      arr.set(buf.subarray(0, arr.length)); buf = buf.slice(arr.length);
      return arr;
    },
  };
}
const jobs = JSON.parse(await new Promise((r) => { let s = ""; process.stdin.on("data", (d) => (s += d)); process.stdin.on("end", () => r(s)); }));
const out = [];
for (const job of jobs) {
  try {
    if (job.op === "split") {
      const crypto = job.seed ? streamCrypto(fromHex(job.seed)) : webcrypto;
      const mnemonics = await splitMasterSecret({ masterSecret: fromHex(job.secret), threshold: job.threshold, shareCount: job.count,
        passphrase: job.passphrase, iterationExponent: job.e, extendable: job.ext, crypto });
      out.push({ ok: true, mnemonics });
    } else {
      out.push({ ok: true, secret: hex(await combineMnemonics(job.mnemonics, job.passphrase, webcrypto)) });
    }
  } catch (e) { out.push({ ok: false, error: String(e && e.message) }); }
}
process.stdout.write(JSON.stringify(out));
"""


def node(jobs):
    env = dict(os.environ, SLIP39_MODULE=MODULE_URL)
    res = subprocess.run(["node", "--input-type=module", "-e", NODE_HELPER], input=json.dumps(jobs),
                         capture_output=True, text=True, env=env, check=True)
    return json.loads(res.stdout)


def py_split(secret, t, n, passphrase, e, ext, rng):
    shamir.RANDOM_BYTES = rng
    try:
        # 1-of-n (n = 2 only in JS) is n groups of 1-of-1 with group threshold 1.
        layout = [(1, 1)] * n if t == 1 else [(t, n)]
        groups = shamir_mnemonic.generate_mnemonics(1, layout, secret, passphrase.encode("ascii"), ext, e)
    finally:
        shamir.RANDOM_BYTES = secrets.token_bytes
    assert len(groups) == len(layout)
    return [m for group in groups for m in group]


def py_combine(mnemonics, passphrase):
    return shamir_mnemonic.combine_mnemonics(mnemonics, passphrase.encode("ascii"))


def subsets(n, t, rnd):
    if math.comb(n, t) <= MAX_SUBSETS:
        return list(itertools.combinations(range(n), t))
    picks = {tuple(range(t)), tuple(range(n - t, n))}
    while len(picks) < MAX_SUBSETS:
        picks.add(tuple(sorted(rnd.sample(range(n), t))))
    return sorted(picks)


def det_cases():
    cases = []
    spec = [
        # name, secret length or literal, t, n, passphrase, e, ext
        ("128-bit 2-of-3 default params", 16, 2, 3, "", 1, True),
        ("128-bit 3-of-5 TREZOR e=0", 16, 3, 5, "TREZOR", 0, True),
        ("256-bit 2-of-2", 32, 2, 2, "correct horse battery staple", 1, True),
        ("256-bit 5-of-7 non-extendable e=2", 32, 5, 7, "", 2, False),
        ("128-bit 16-of-16", 16, 16, 16, "p", 0, True),
        ("128-bit 2-of-16 non-extendable", 16, 2, 16, " ~!", 0, False),
        ("128-bit 4-of-6 all printable ASCII passphrase e=3", 16, 4, 6, PRINTABLE, 3, True),
        ("256-bit 8-of-16", 32, 8, 16, "", 0, True),
        ("128-bit all-zero secret 3-of-4", bytes(16), 3, 4, "", 1, True),
        ("256-bit all-0xff secret 2-of-5 non-extendable", bytes([255]) * 32, 2, 5, "TREZOR", 1, False),
        ("128-bit 5-of-5 e=0", 16, 5, 5, "", 0, True),
        ("128-bit 2-of-2 non-extendable e=0", 16, 2, 2, "", 0, False),
        ("128-bit 1-of-2 default params", 16, 1, 2, "", 1, True),
        ("256-bit 1-of-2 TREZOR e=0", 32, 1, 2, "TREZOR", 0, True),
        ("128-bit 1-of-2 non-extendable e=2", 16, 1, 2, "", 2, False),
    ]
    for i, (name, sec, t, n, pw, e, ext) in enumerate(spec):
        seed = hashlib.sha256(b"sharekeeper slip39 crosscheck seed %d" % i).digest()
        secret = sec if isinstance(sec, bytes) else hashlib.sha256(b"secret" + seed).digest()[:sec]
        cases.append(dict(name=name, masterSecretHex=secret.hex(), threshold=t, shareCount=n, passphrase=pw,
                          iterationExponent=e, extendable=ext, rngSeedHex=seed.hex()))
    return cases


def main():
    write = "--write" in sys.argv
    rnd = random.Random(39)
    failures = []
    stats = dict(det_cases=0, det_identical=0, py_combines_js=0, js_combines_py=0, wrong_pass_checks=0,
                 fuzz_py_to_js=0, fuzz_js_to_py=0)

    # 1. Deterministic, identical-output cases.
    cases = det_cases()
    js_out = node([dict(op="split", seed=c["rngSeedHex"], secret=c["masterSecretHex"], threshold=c["threshold"],
                        count=c["shareCount"], passphrase=c["passphrase"], e=c["iterationExponent"], ext=c["extendable"])
                   for c in cases])
    combine_jobs, expect = [], []
    for c, js in zip(cases, js_out):
        stats["det_cases"] += 1
        secret = bytes.fromhex(c["masterSecretHex"])
        py = py_split(secret, c["threshold"], c["shareCount"], c["passphrase"], c["iterationExponent"],
                      c["extendable"], Stream(bytes.fromhex(c["rngSeedHex"])))
        c["mnemonics"] = py
        if not js["ok"]:
            failures.append(f"JS split failed for {c['name']}: {js['error']}")
            continue
        if js["mnemonics"] == py:
            stats["det_identical"] += 1
        else:
            failures.append(f"JS and Python mnemonics differ for {c['name']}")
        for sub in subsets(c["shareCount"], c["threshold"], rnd):
            picked_js = [js["mnemonics"][k] for k in sub]
            if py_combine(picked_js, c["passphrase"]) == secret:
                stats["py_combines_js"] += 1
            else:
                failures.append(f"Python could not combine JS shares {sub} for {c['name']}")
            combine_jobs.append(dict(op="combine", mnemonics=[py[k] for k in reversed(sub)], passphrase=c["passphrase"]))
            expect.append((c["name"], sub, secret.hex()))
        wrong = c["passphrase"] + "x"
        sub = list(range(c["threshold"]))
        combine_jobs.append(dict(op="combine", mnemonics=[py[k] for k in sub], passphrase=wrong))
        expect.append((c["name"] + " wrong passphrase", sub, py_combine([py[k] for k in sub], wrong).hex()))
    for (name, sub, want), got in zip(expect, node(combine_jobs)):
        if got["ok"] and got["secret"] == want:
            stats["wrong_pass_checks" if "wrong passphrase" in name else "js_combines_py"] += 1
        else:
            failures.append(f"JS combine mismatch for {name} {sub}: {got}")

    # 2. Random fuzz, both directions.
    def rand_params():
        n = rnd.randint(2, 16)
        t = rnd.randint(2, n)
        if rnd.random() < 0.15:
            t, n = 1, 2
        return dict(t=t, n=n, length=rnd.choice([16, 32]), e=rnd.choice([0, 0, 1, 2]),
                    ext=rnd.choice([True, False]),
                    pw=rnd.choice(["", "TREZOR", "".join(rnd.choice(PRINTABLE) for _ in range(rnd.randint(1, 40)))]))

    jobs, expect = [], []
    for _ in range(FUZZ_CASES):
        p = rand_params()
        secret = secrets.token_bytes(p["length"])
        ms = py_split(secret, p["t"], p["n"], p["pw"], p["e"], p["ext"], secrets.token_bytes)
        jobs.append(dict(op="combine", mnemonics=[ms[k] for k in rnd.sample(range(p["n"]), p["t"])], passphrase=p["pw"]))
        expect.append(secret.hex())
    for want, got in zip(expect, node(jobs)):
        if got["ok"] and got["secret"] == want:
            stats["fuzz_py_to_js"] += 1
        else:
            failures.append(f"fuzz py->js mismatch: {got}")

    params = [rand_params() for _ in range(FUZZ_CASES)]
    secrets_ = [secrets.token_bytes(p["length"]) for p in params]
    js_out = node([dict(op="split", seed=None, secret=s.hex(), threshold=p["t"], count=p["n"], passphrase=p["pw"],
                        e=p["e"], ext=p["ext"]) for p, s in zip(params, secrets_)])
    for p, s, js in zip(params, secrets_, js_out):
        if not js["ok"]:
            failures.append(f"fuzz JS split failed: {js['error']}")
            continue
        picked = [js["mnemonics"][k] for k in rnd.sample(range(p["n"]), p["t"])]
        if py_combine(picked, p["pw"]) == s:
            stats["fuzz_js_to_py"] += 1
        else:
            failures.append("fuzz js->py mismatch")

    print(json.dumps(dict(shamir_mnemonic=version("shamir-mnemonic"), **stats), indent=2))
    if failures:
        print("FAILURES:", *failures, sep="\n  ")
        sys.exit(1)
    if write:
        FIXTURE.parent.mkdir(parents=True, exist_ok=True)
        payload = dict(
            description="Generated by scripts/slip39-crosscheck.py with python shamir-mnemonic. Each case was split by "
                        "the reference implementation with RANDOM_BYTES replaced by the byte stream "
                        "SHA-256(rngSeed || uint32be(counter)) for counter = 0, 1, ...; JS must produce identical "
                        "mnemonics from the same stream and must combine them to masterSecretHex.",
            generator="python shamir-mnemonic " + version("shamir-mnemonic"),
            cases=cases,
        )
        FIXTURE.write_text(json.dumps(payload, indent=2) + "\n")
        print(f"wrote {FIXTURE.relative_to(ROOT)}")
    print("OK")


if __name__ == "__main__":
    main()
