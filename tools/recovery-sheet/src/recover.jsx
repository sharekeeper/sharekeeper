import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, Download, Eye, EyeOff, KeyRound, LockKeyhole, Plus, ShieldCheck, Trash2, TriangleAlert } from "lucide-react";
import { publicNavigationUrls } from "../shared/public-urls.js";
import { analyzeShare, normalizeLetters, recoverFirstAddress, summarizeSets } from "./recover-core.js";
import { splitMasterSecret, wordPrefixes } from "./slip39.js";
import { ciphertextCrc64, encryptPrefixes } from "./cipher.js";
import { firstBip84Address, FIRST_ADDRESS_PATH } from "./btc-address.js";
import { formatCrc64 } from "../site/crc64.js";
import logo from "../assets/logo-with-domain.webp";

const { platformPreview: PLATFORM_PREVIEW, siteUrl: SITE_URL, standaloneRecoveryUrl: STANDALONE_URL } = publicNavigationUrls(globalThis.location, globalThis.origin);
const MAX_SHARES = 5;
const EMPTY_SLOT = Object.freeze({ ciphertext: "", pad: "", expectedCrc: "", expectedGroups: "" });

function offlineState() {
  const fromFile = globalThis.location?.protocol === "file:";
  const offline = globalThis.navigator?.onLine === false;
  return { fromFile, offline, ready: fromFile && offline };
}

const grouped = (letters) => normalizeLetters(letters).match(/.{1,4}/g)?.join(" ") ?? "";

function randomLetters(count, crypto) {
  // Rejection sampling: bytes 0..233 map evenly onto 26 letters.
  let out = "";
  const buffer = new Uint8Array(count * 2);
  while (out.length < count) {
    crypto.getRandomValues(buffer);
    for (const byte of buffer) { if (byte < 234 && out.length < count) out += String.fromCharCode(65 + (byte % 26)); }
  }
  buffer.fill(0);
  return out;
}

/** A throwaway 2-of-3 example made in this tab for practice. Never for real funds. */
async function practiceExample(crypto = globalThis.crypto) {
  const secret = new Uint8Array(16);
  crypto.getRandomValues(secret);
  try {
    const mnemonics = await splitMasterSecret({ masterSecret: secret, threshold: 2, shareCount: 3, crypto });
    const pads = mnemonics.map(() => randomLetters(80, crypto));
    const slots = mnemonics.map((m, i) => {
      const ciphertext = encryptPrefixes(wordPrefixes(m), pads[i]);
      return { ciphertext: grouped(ciphertext), pad: grouped(pads[i]), expectedCrc: formatCrc64(ciphertextCrc64(ciphertext)), expectedGroups: `${ciphertext.slice(0, 4)} ${ciphertext.slice(4, 8)}` };
    });
    return { slots, expectedAddress: firstBip84Address(secret) };
  } finally {
    secret.fill(0);
  }
}

function Status({ state, children }) {
  return <span className={`recover-chip ${state}`}>{state === "match" || state === "ok" ? <Check size={14} aria-hidden="true" /> : state === "mismatch" || state === "bad" ? <TriangleAlert size={14} aria-hidden="true" /> : null}{children}</span>;
}

export function ModeSwitch({ mode, locked = false }) {
  const item = (key, label) => mode === key
    ? <span className="mode-tab active" aria-current="page">{label}</span>
    : locked
      ? <span className="mode-tab disabled" title="Clear the current session first" aria-disabled="true">{label}</span>
      : <a className="mode-tab" href={`#${key}`} data-testid={`mode-${key}`}>{label}</a>;
  return <div className="mode-switch" role="navigation" aria-label="Tool mode">{item("create", "Create seed and shares")}{item("recover", "Validate and decrypt shares")}</div>;
}

export function RecoverApp() {
  const [offline, setOffline] = useState(offlineState);
  const [practice, setPractice] = useState(false);
  const [slots, setSlots] = useState(() => [0, 1, 2].map(() => ({ ...EMPTY_SLOT })));
  const [shown, setShown] = useState(-1);
  const [passphrase, setPassphrase] = useState("");
  const [expectedAddress, setExpectedAddress] = useState("");
  const [recovery, setRecovery] = useState(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const version = useRef(0);
  const canEnter = offline.ready || practice;

  /** Any change that affects a result discards pending and shown results. */
  function invalidate() {
    version.current += 1;
    setRecovery(null); setFailure(""); setBusy(false);
  }

  function clearAll() {
    invalidate();
    setSlots([0, 1, 2].map(() => ({ ...EMPTY_SLOT })));
    setShown(-1); setPassphrase(""); setExpectedAddress(""); setPractice(false);
  }

  useEffect(() => () => { version.current += 1; }, []);

  useEffect(() => {
    const update = () => {
      const next = offlineState();
      setOffline(next);
      // A connection appearing during a real session discards everything typed.
      if (!next.ready) setSlots((current) => (practice ? current : current.map(() => ({ ...EMPTY_SLOT }))));
      if (!next.ready && !practice) { invalidate(); setShown(-1); setPassphrase(""); setExpectedAddress(""); }
    };
    globalThis.addEventListener?.("online", update);
    globalThis.addEventListener?.("offline", update);
    return () => { globalThis.removeEventListener?.("online", update); globalThis.removeEventListener?.("offline", update); };
  }, [practice]);

  const reports = useMemo(() => slots.map((slot) => analyzeShare(slot)), [slots]);
  const sets = useMemo(() => summarizeSets(reports), [reports]);
  const readySet = sets.find((set) => set.enough);

  function update(index, name, value) {
    if (practice || !offline.ready) return;
    invalidate();
    setSlots((current) => current.map((slot, i) => (i === index ? { ...slot, [name]: value } : slot)));
  }

  async function loadPractice() {
    clearAll();
    const example = await practiceExample();
    setPractice(true);
    setSlots(example.slots);
    setExpectedAddress(example.expectedAddress);
  }

  function practiceMistake() {
    if (!practice) return;
    invalidate();
    setSlots((current) => current.map((slot, i) => {
      if (i !== 0) return slot;
      const letters = normalizeLetters(slot.ciphertext);
      const at = 45;
      const changed = letters.slice(0, at) + String.fromCharCode(65 + ((letters.charCodeAt(at) - 65 + 1) % 26)) + letters.slice(at + 1);
      return { ...slot, ciphertext: grouped(changed) };
    }));
  }

  async function checkRecovery() {
    if (!readySet || busy) return;
    if (!practice && !offlineState().ready) { setFailure("Recovery check is blocked: the network is connected."); return; }
    const current = ++version.current;
    setBusy(true); setFailure(""); setRecovery(null);
    try {
      const chosen = readySet.slots.slice(0, readySet.threshold);
      const result = await recoverFirstAddress({ mnemonics: chosen.map((slot) => reports[slot].mnemonic), passphrase, expectedAddress });
      if (current !== version.current) return;
      if (!practice && !offlineState().ready) throw new Error("A network connection appeared, so the result was discarded.");
      setRecovery({ ...result, used: chosen.map((slot) => reports[slot].share.memberIndex + 1) });
    } catch (error) {
      if (current === version.current) setFailure(error instanceof Error ? error.message : "The shares could not be combined.");
    } finally {
      if (current === version.current) setBusy(false);
    }
  }

  const field = (index, name, label, hint, rows = 2) => {
    const id = `recover-${index}-${name}`;
    const Tag = rows > 1 ? "textarea" : "input";
    return <div className="field recover-field">
      <label htmlFor={id}>{label}<span>{hint}</span></label>
      <Tag id={id} rows={rows > 1 ? rows : undefined} value={slots[index][name]} readOnly={!canEnter || practice} disabled={!canEnter}
        onChange={(e) => update(index, name, e.target.value)} autoComplete="off" autoCorrect="off" autoCapitalize="characters" spellCheck="false" data-testid={`recover-${name}-${index + 1}`} />
    </div>;
  };

  return <>
    <a href="#recover-main" className="skip-link">Skip to content</a>
    <header className="site-header">
      <a href={`${SITE_URL}#/`} target="_blank" rel="noopener noreferrer" className="brand-link" aria-label="ShareKeeper.org home (opens in a new tab, keeping this workspace)" data-testid="link-home"><img src={logo} alt="" width="280" height="93" className="brand" onError={(e) => { e.currentTarget.hidden = true; }} /></a>
      <div className="header-actions">
        <span className="local-label"><LockKeyhole size={15} aria-hidden="true" /> {practice ? "Practice · example data" : "Offline workspace"}</span>
        {offline.fromFile ? null : PLATFORM_PREVIEW
          ? <a className="quiet-link" href={`${STANDALONE_URL}#recover`} target="_blank" rel="noopener noreferrer">Open standalone app <ArrowRight size={15} aria-hidden="true" /></a>
          : <a className="quiet-link" href="./sharekeeper-offline.html" download="sharekeeper-offline.html" data-testid="download-offline">Download the tool <Download size={15} aria-hidden="true" /></a>}
      </div>
    </header>
    <nav className="tool-site-nav" aria-label="Sharekeeper website">
      <a href={`${SITE_URL}#/tools`} target="_blank" rel="noopener noreferrer">Sharekeeper tools</a>
      <ModeSwitch mode="recover" />
    </nav>
    <main id="recover-main" className="recover-panel">
      <p className="eyebrow">Recovery / Validate and decrypt</p>
      <h1 className="recover-title">Check the ciphertext you receive, then decrypt it with your pads.</h1>
      <p className="subheading">For each sharekeeper, enter the 20 groups they read to you and the matching pad (K) from your recovery sheet. The tool checks the CRC64 and first groups against your sheet, decrypts the share, verifies its SLIP-39 checksum, and, once enough shares are valid, confirms the wallet by its first Bitcoin address. Nothing is saved or sent.</p>
      {practice
        ? <div className="dry-run-banner" role="status" data-testid="recover-practice-banner"><Eye size={18} aria-hidden="true" /><span><strong>Practice example.</strong> These shares and pads were made in this tab for practice and cannot be edited. Never use them for real funds.</span></div>
        : <div className={`offline-gate ${offline.ready ? "ready" : ""}`} role="status" data-testid="recover-offline-gate">{offline.ready
          ? <><ShieldCheck size={18} aria-hidden="true" /><span>Offline check passed: opened from a local file and the browser reports no network connection.</span></>
          : <><LockKeyhole size={18} aria-hidden="true" /><span>Entering real pads and ciphertext is blocked until {!offline.fromFile ? "you open the downloaded file from your computer (file://)" : ""}{!offline.fromFile && !offline.offline ? " and " : ""}{!offline.offline ? "you disconnect from the network" : ""}. Anything typed is discarded if a connection appears.</span></>}</div>}
      {!offline.ready && !practice && <div className="plain-note"><KeyRound size={19} aria-hidden="true" /><div><h3>Try it with a practice example</h3><p>See how the checks work with a throwaway 2-of-3 example made in this tab, including what a copying mistake looks like.</p><div className="actions"><button type="button" className="secondary-button" onClick={loadPractice} data-testid="recover-practice">Load practice example <ArrowRight size={16} aria-hidden="true" /></button></div></div></div>}

      <div className="recover-shares">
        {slots.map((slot, index) => {
          const report = reports[index];
          const filled = Object.values(slot).some(Boolean);
          return <article className="recover-share" key={index} data-testid={`recover-share-${index + 1}`}>
            <header className="recover-share-head"><h2>Sharekeeper {String(index + 1).padStart(2, "0")}</h2>
              {report.ready ? <Status state="ok">Valid share {report.share.memberIndex + 1} · needs {report.share.memberThreshold}</Status> : filled ? <Status state={report.issues.length ? "bad" : "none"}>Not valid yet</Status> : null}</header>
            {field(index, "ciphertext", "Ciphertext from the sharekeeper", "80 letters, spaces optional", 3)}
            {field(index, "pad", "Pad (K) from your recovery sheet", "the 80 letters of the same share", 3)}
            <div className="recover-pair">
              {field(index, "expectedGroups", "First 2 cipher groups on your sheet", "optional · 8 letters", 1)}
              {field(index, "expectedCrc", "Expected ciphertext CRC64 on your sheet", "optional · 16 hex digits", 1)}
            </div>
            {report.crc && <p className="recover-checks" data-testid={`recover-checks-${index + 1}`}>CRC64 of what you entered: <strong>{formatCrc64(report.crc)}</strong>
              {report.crcStatus === "match" && <Status state="match">matches your sheet</Status>}{report.crcStatus === "mismatch" && <Status state="mismatch">does not match</Status>}
              {report.groupsStatus === "match" && <Status state="match">groups 01–02 match</Status>}{report.groupsStatus === "mismatch" && <Status state="mismatch">groups 01–02 differ</Status>}</p>}
            {filled && report.issues.length > 0 && <ul className="recover-issues" data-testid={`recover-issues-${index + 1}`}>{report.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>}
            {report.ready && <div className="recover-words">
              <button type="button" className="text-button" aria-expanded={shown === index} onClick={() => setShown(shown === index ? -1 : index)} data-testid={`recover-toggle-${index + 1}`}>{shown === index ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}{shown === index ? "Hide share words" : "Show share words"}</button>
              {shown === index && <article className="share-words"><h3>{practice ? "PRACTICE · " : ""}Share {report.share.memberIndex + 1} of a {report.share.memberThreshold}-of-n set</h3><ol data-testid={`recover-words-${index + 1}`}>{report.mnemonic.split(" ").map((word, w) => <li key={w}>{word}</li>)}</ol></article>}
            </div>}
          </article>;
        })}
      </div>
      <div className="actions">
        {slots.length < MAX_SHARES && <button type="button" className="secondary-button" disabled={!canEnter || practice} onClick={() => setSlots((s) => [...s, { ...EMPTY_SLOT }])} data-testid="recover-add"><Plus size={16} aria-hidden="true" /> Add a sharekeeper</button>}
        {practice && <button type="button" className="secondary-button" onClick={practiceMistake} data-testid="recover-mistake">Show a copying mistake</button>}
        <button type="button" className="text-button" onClick={clearAll} data-testid="recover-clear"><Trash2 size={15} aria-hidden="true" /> Clear everything</button>
      </div>

      <section className="recover-combine" aria-labelledby="recover-combine-heading">
        <h2 id="recover-combine-heading">Confirm the wallet</h2>
        <p className="technical-note">{readySet ? `You have ${readySet.members.length} valid share${readySet.members.length === 1 ? "" : "s"} of a set that needs ${readySet.threshold}. ` : sets.length ? `Valid shares so far: ${sets.map((s) => `${s.members.length} of ${s.threshold} needed`).join("; ")}. ` : "Enter at least the number of shares your sheet says are needed. "}{sets.length > 1 ? "Some shares belong to a different set; only shares of one set can be combined. " : ""}{sets.some((s) => s.duplicates.length) ? "The same share was entered twice; it counts once. " : ""}Combining happens only in this tab; the seed itself is never shown.</p>
        <div className="recover-pair">
          <div className="field recover-field"><label htmlFor="recover-passphrase">Passphrase<span>leave empty if "Empty" is ticked on your sheet</span></label><input id="recover-passphrase" type="password" value={passphrase} disabled={!canEnter} readOnly={practice} onChange={(e) => { if (!practice) { invalidate(); setPassphrase(e.target.value); } }} autoComplete="off" spellCheck="false" data-testid="recover-passphrase" /></div>
          <div className="field recover-field"><label htmlFor="recover-address">First known address on your sheet<span>optional · line 01, bc1q…</span></label><input id="recover-address" value={expectedAddress} disabled={!canEnter} readOnly={practice} onChange={(e) => { if (!practice) { invalidate(); setExpectedAddress(e.target.value.trim()); } }} autoComplete="off" spellCheck="false" data-testid="recover-expected-address" /></div>
        </div>
        <div className="actions"><button type="button" className="primary-button" disabled={!readySet || busy || !canEnter} onClick={checkRecovery} data-testid="recover-check">{busy ? "Checking locally…" : "Combine and check the first address"}</button></div>
        {recovery && <div className="address-panel" data-testid="recover-result"><h3>{recovery.expectedStatus === "match" ? "Recovered: the first address matches your sheet." : recovery.expectedStatus === "mismatch" ? "These shares and passphrase give a different wallet than your sheet." : "Shares combined."}</h3>
          <p className="address-value" data-testid="recover-address-result">{recovery.address}</p>
          <p className="technical-note">First receive address (BIP-84, {FIRST_ADDRESS_PATH}) of the wallet recovered from shares {recovery.used.join(", ")}{passphrase ? " with the passphrase you entered" : " with an empty passphrase"}. {recovery.expectedStatus === "mismatch" ? "Check the passphrase (case and spaces count) and that all shares come from this sheet. " : ""}{practice ? "Practice only: never send funds to it." : "Enter the share words into a wallet that supports SLIP-39 recovery, and check it shows this first address before relying on it."}</p></div>}
        {failure && <p className="error-message" role="alert" data-testid="recover-error">{failure}</p>}
      </section>
      <p className="technical-note">Prototype, not audited. Entries live only in this tab’s memory; clearing or closing the tab discards them, although the browser may keep copies until they are overwritten.</p>
    </main>
  </>;
}
