import React, { useEffect, useRef, useState } from "react";
import { Check, Copy, FileCheck2, Info } from "lucide-react";
import { crc64Hex, crc64Utf8, formatCrc64, MAX_CRC64_BYTES, normalizeCrc64Input } from "./crc64.js";

export default function CRC64Tool() {
  const [mode, setMode] = useState("text");
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [expected, setExpected] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const version = useRef(0);
  const fileInput = useRef(null);
  const resultInput = useRef(null);

  useEffect(() => () => { version.current += 1; }, []);

  function invalidate() {
    version.current += 1;
    setResult(null);
    setError("");
    setCopyMessage("");
    setBusy(false);
  }

  function clear(nextMode = mode) {
    invalidate();
    setMode(nextMode);
    setText("");
    setFile(null);
    setExpected("");
    if (fileInput.current) fileInput.current.value = "";
  }

  function chooseFile(event) {
    invalidate();
    const selected = event.target.files?.[0] || null;
    setFile(selected);
    if (selected && selected.size > MAX_CRC64_BYTES) {
      setError("Choose a file of 10 MiB or less. The file has not been read.");
    }
  }

  async function calculate(event) {
    event.preventDefault();
    const current = ++version.current;
    setResult(null);
    setError("");
    setCopyMessage("");
    setBusy(true);
    try {
      let hex;
      let bytes;
      if (mode === "file") {
        if (!file) throw new Error("missing-file");
        if (file.size > MAX_CRC64_BYTES) throw new RangeError("too-large");
        const buffer = await file.arrayBuffer();
        if (current !== version.current) return;
        hex = crc64Hex(new Uint8Array(buffer));
        bytes = buffer.byteLength;
      } else {
        hex = crc64Utf8(text);
        bytes = new TextEncoder().encode(text).byteLength;
      }
      if (current === version.current) {
        setResult({ hex, bytes, source: mode === "file" ? "Exact file bytes" : "UTF-8 text" });
      }
    } catch (failure) {
      if (current === version.current) {
        setError(failure instanceof RangeError
          ? "Input exceeds 10 MiB. Nothing was truncated or checksummed."
          : "Could not read this input. Choose the local file again or try UTF-8 text.");
      }
    } finally {
      if (current === version.current) setBusy(false);
    }
  }

  async function copyChecksum() {
    if (!result) return;
    const current = version.current;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("unavailable");
      await navigator.clipboard.writeText(formatCrc64(result.hex));
      if (current === version.current) setCopyMessage("Checksum copied.");
    } catch {
      if (current === version.current) {
        resultInput.current?.focus();
        resultInput.current?.select();
        setCopyMessage("Automatic copy is unavailable. Select the checksum and copy it manually.");
      }
    }
  }

  const normalizedExpected = expected.trim().toUpperCase();
  const expectedHex = normalizeCrc64Input(normalizedExpected);
  const expectedValid = Boolean(expectedHex);
  const comparison = normalizedExpected && expectedValid && result
    ? (expectedHex === result.hex ? "match" : "mismatch")
    : null;

  return <section className="crc-tool" id="crc64-calculator" aria-labelledby="crc64-heading">
    <div className="crc-tool-copy">
      <div className="crc-tool-intro">
      <span className="crc-kicker"><FileCheck2 size={18} aria-hidden="true" />Local checksum utility</span>
      <h2 id="crc64-heading">CRC64 checksum calculator</h2>
      <p>Calculate a 16-digit checksum for text or a local file, or compare it with an expected value. Everything is calculated in this browser; nothing is uploaded or saved by this tool.</p>
      </div>
      <div className="crc-tool-notes">
      <div className="crc-safety"><Info size={20} aria-hidden="true" /><p>CRC64 detects accidental changes, not authenticity. It is not encryption, a cryptographic hash, or proof that a provider is trustworthy. Never enter seed phrases, private pads, or wallet secrets.</p></div>
      <details className="crc-specification">
        <summary>Algorithm and byte rules</summary>
        <p>CRC-64/XZ (also called CRC-64/GO-ECMA): ECMA-182 polynomial <code>0x42F0E1EBA9EA3693</code>, reflected polynomial <code>0xC96C5795D7870F42</code>, initial value and final XOR <code>0xFFFFFFFFFFFFFFFF</code>, reflected input and output.</p>
        <p>Text is encoded as UTF-8 without trimming, case changes, or Unicode normalization. The text box uses LF line endings; choose File to preserve an existing document’s exact bytes and line endings.</p>
        <p>The check value for <code>123456789</code> is <code>995DC9BBDF1939FA</code>, as listed in the <a href="https://reveng.sourceforge.io/crc-catalogue/17plus.htm" target="_blank" rel="noreferrer">CRC RevEng catalogue</a>. This is an explicit calculator profile, not a finalized Sharekeeper ciphertext format; agree on the exact bytes before comparing checksums.</p>
        <a href="https://en.wikipedia.org/wiki/Cyclic_redundancy_check#Data_integrity" target="_blank" rel="noreferrer">About CRCs and their limits</a>
      </details>
      <p className="small crc-profile-note">Separate from pad generation and does not fill the sheet. To check a ciphertext CRC64 from the Sharekeeper tool, paste its 80 ciphertext letters as uppercase text with no spaces.</p>
      </div>
    </div>
    <form className="crc-calculator" onSubmit={calculate} noValidate aria-label="CRC64 calculator">
      <fieldset className="crc-mode">
        <legend>Input type</legend>
        <label><input type="radio" name="crc64-mode" value="text" checked={mode === "text"} onChange={() => clear("text")} />UTF-8 text</label>
        <label><input type="radio" name="crc64-mode" value="file" checked={mode === "file"} onChange={() => clear("file")} />File</label>
      </fieldset>
      {mode === "text" ? <div className="field">
        <label htmlFor="crc64-text">Text to checksum</label>
        <textarea id="crc64-text" rows="4" value={text} spellCheck="false" autoComplete="off" autoCapitalize="off" autoCorrect="off" aria-describedby="crc64-text-hint"
          onChange={(event) => { invalidate(); setText(event.target.value); }} placeholder="Paste the exact text here" />
        <p id="crc64-text-hint" className="field-hint">Spaces and letter case count. Maximum 10 MiB of UTF-8; empty text is valid. Never enter wallet secrets.</p>
      </div> : <div className="field">
        <label htmlFor="crc64-file">Choose a local file</label>
        <input ref={fileInput} id="crc64-file" type="file" onChange={chooseFile} aria-describedby="crc64-file-hint" />
        <p id="crc64-file-hint" className="field-hint">Read locally, never uploaded. Maximum 10 MiB. The checksum covers every original byte, including metadata in formats such as PDF.</p>
      </div>}
      <div className="crc-actions">
        <button className="button" type="submit" disabled={busy || (mode === "file" && (!file || file.size > MAX_CRC64_BYTES))}>{busy ? "Calculating locally..." : "Calculate CRC64"}</button>
        <button className="text-link" type="button" onClick={() => clear()}>Clear calculator</button>
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="crc-result" aria-busy={busy}>
        <label htmlFor="crc64-result">CRC64 hexadecimal</label>
        <input ref={resultInput} id="crc64-result" readOnly value={result ? formatCrc64(result.hex) : ""} placeholder="Not calculated" spellCheck="false" autoComplete="off"
          onFocus={(event) => event.target.select()} aria-describedby="crc64-result-meta" />
        <p id="crc64-result-meta">{result ? `${result.bytes.toLocaleString("en-US")} ${result.bytes === 1 ? "byte" : "bytes"} / ${result.source}` : "Sixteen hexadecimal digits in groups of four, including leading zeroes."}</p>
        <button type="button" className="crc-copy" onClick={copyChecksum} disabled={!result || busy}><Copy size={16} aria-hidden="true" />Copy checksum</button>
        <p className="crc-copy-message" role="status">{copyMessage}</p>
      </div>
      <div className="field">
        <label htmlFor="crc64-expected">Expected checksum <span>(optional)</span></label>
        <input id="crc64-expected" value={expected} onChange={(event) => setExpected(event.target.value)} placeholder="16 hex digits, spaces optional" spellCheck="false" autoComplete="off" autoCapitalize="characters"
          aria-describedby="crc64-comparison" aria-invalid={Boolean(normalizedExpected && !expectedValid)} />
        <p id="crc64-comparison" className={`crc-comparison ${comparison === "mismatch" || (normalizedExpected && !expectedValid) ? "field-error" : ""}`} role="status">
          {normalizedExpected && !expectedValid ? "Enter exactly sixteen hexadecimal characters (0–9, A–F), spaces optional, without a 0x prefix."
            : comparison === "match" ? <><Check size={17} aria-hidden="true" />Checksums match. This is not authentication.</>
              : comparison === "mismatch" ? "Checksums do not match. Check the input bytes and agreed format."
                : "Optionally compare with a 16-digit CRC64 value."}
        </p>
      </div>
    </form>
  </section>;
}
