import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Download, Fingerprint, LockKeyhole, MousePointer2, ShieldCheck, Trash2, Eye, EyeOff, FileText } from "lucide-react";
import "@fontsource/source-sans-3/latin-400.css";
import "@fontsource/source-sans-3/latin-600.css";
import "@fontsource/source-sans-3/latin-700.css";
import { blankKeeper, isValidThreshold, KEEPER_COUNTS, PAD_LENGTH, thresholdOptions } from "../shared/schema.js";
import { publicNavigationUrls } from "../shared/public-urls.js";
import { BROWSER_SEED_BITS, generatePadsWithEntropy, groupPad } from "./pads.js";
import { createEntropyCollector, USER_ENTROPY_TARGET_BITS } from "./entropy.js";
import { createRecoveryPdf, validatePdfContacts } from "./pdf.js";
import { contactErrors } from "./contacts.js";
import { ciphertextCrc32, decryptCiphertext, encryptPrefixes, firstCipherGroups } from "./cipher.js";
import { createKeeperCiphertextPdf } from "./keeper-pdf.js";
import { generateMasterSecret, thresholdSubsets } from "./master-secret.js";
import { combineMnemonics, decodeMnemonic, splitMasterSecret, wordPrefixes } from "./slip39.js";
import logo from "../assets/logo-with-domain.webp";
import "./style.css";

/**
 * The single Sharekeeper workflow: seed → SLIP-39 shares → pads → recovery
 * sheet (3 labeled copies) and sharekeeper hand-out. Real generation runs only
 * from a local file with no network. An explicitly opted-in dry run works
 * online but never creates or offers any download.
 */
const STEPS = ["Set up", "Sharekeepers", "Add entropy", "Generate seed and shares"];
function offlineState() {
  const fromFile = globalThis.location?.protocol === "file:";
  const offline = globalThis.navigator?.onLine === false;
  return { fromFile, offline, ready: fromFile && offline };
}
const {
  platformPreview: PLATFORM_PREVIEW,
  siteUrl: SITE_URL,
  standaloneRecoveryUrl: STANDALONE_URL,
} = publicNavigationUrls(globalThis.location, globalThis.origin);
const FIELD_LABELS = {
  name: "Name", reference: "Account No.",
  phone: "Phone", website: "Website",
  address1: "Street Address", address2: "Street Address 2", region: "State/Country Postal Code",
};

function App() {
  const [stage, setStage] = useState(0);
  const [count, setCount] = useState(5);
  const [threshold, setThreshold] = useState(3);
  const [keepers, setKeepers] = useState(() => Array.from({ length: 5 }, (_, i) => blankKeeper(i + 1)));
  const [keeperIndex, setKeeperIndex] = useState(0);
  const [errors, setErrors] = useState({});
  const [failure, setFailure] = useState("");
  const [samples, setSamples] = useState(0);
  const [taps, setTaps] = useState(0);
  const [userBits, setUserBits] = useState(0);
  const [inputKind, setInputKind] = useState("mouse / finger");
  const [keyboardMode, setKeyboardMode] = useState(false);
  const [acknowledgments, setAcknowledgments] = useState([false, false]);
  const [busy, setBusy] = useState(false);
  const [pads, setPads] = useState([]);
  const [pdfUrl, setPdfUrl] = useState("");
  const [reveal, setReveal] = useState(false);
  const [clearDialog, setClearDialog] = useState(false);
  const [offline, setOffline] = useState(offlineState);
  const [shares, setShares] = useState([]);
  const [ciphertexts, setCiphertexts] = useState([]);
  const [keeperPdfUrl, setKeeperPdfUrl] = useState("");
  const [shownShare, setShownShare] = useState(-1);
  const [checkSummary, setCheckSummary] = useState("");
  const [dryRun, setDryRun] = useState(false);
  const [dryRunConsent, setDryRunConsent] = useState(false);
  const dryRunRef = useRef(false);
  const movement = useRef(null);
  movement.current ??= createEntropyCollector();
  const lastPoint = useRef(null);
  const startTime = useRef(null);
  const drawRef = useRef(null);
  const headingRef = useRef(null);
  const dialogRef = useRef(null);
  const generationVersion = useRef(0);
  const generationBusy = useRef(false);
  const cryptoReady = typeof globalThis.crypto?.getRandomValues === "function" && !!globalThis.crypto?.subtle;
  const activeKeepers = keepers.slice(0, count);
  const entropyReady = userBits >= USER_ENTROPY_TARGET_BITS;
  const offlineBlocked = !dryRun && !offline.ready;
  const keeper = keepers[keeperIndex];

  useEffect(() => { headingRef.current?.focus(); }, [stage, keeperIndex]);
  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);
  useEffect(() => () => { if (keeperPdfUrl) URL.revokeObjectURL(keeperPdfUrl); }, [keeperPdfUrl]);
  useEffect(() => {
    const update = () => {
      const next = offlineState();
      setOffline(next);
      if (!next.ready && !dryRunRef.current) {
        setShownShare(-1);
        if (generationBusy.current) {
          // Invalidate the pending run: it stops at its next check, issues
          // nothing, and its finally block wipes the sensitive buffers.
          generationVersion.current += 1;
          generationBusy.current = false;
          setBusy(false);
          setFailure("A network connection appeared during generation, so it was cancelled. Nothing was issued.");
        }
      }
    };
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (clearDialog && dialog && !dialog.open) dialog.showModal();
    if (!clearDialog && dialog?.open) dialog.close();
  }, [clearDialog]);
  useEffect(() => {
    const warn = (event) => {
      if (stage > 0) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [stage]);

  function go(next) { setFailure(""); setErrors({}); setStage(next); }

  function appendMovement(event, mode = "pointer") {
    const native = event.nativeEvent ?? event;
    if (!native.isTrusted || movement.current.full) return;
    const now = performance.now();
    if (startTime.current === null) startTime.current = now;
    const box = drawRef.current?.getBoundingClientRect();
    const x = mode === "pointer" ? Math.round((event.clientX - (box?.left ?? 0)) * 100) : 0;
    const y = mode === "pointer" ? Math.round((event.clientY - (box?.top ?? 0)) * 100) : 0;
    if (mode === "pointer" && lastPoint.current?.x === x && lastPoint.current?.y === y) return;
    if (mode === "pointer") lastPoint.current = { x, y };
    const kind = mode === "pointer" ? (event.pointerType || "mouse") : "tap / keyboard";
    movement.current.add({ kind, x, y, time: Math.round((now - startTime.current) * 1000), pressure: Math.round((event.pressure ?? 0) * 1000) });
    setUserBits(movement.current.bits);
    setInputKind(kind);
    if (mode === "pointer") {
      setSamples(movement.current.count - movement.current.countOf("tap / keyboard"));
      const dot = drawRef.current?.querySelector(".movement-dot");
      if (dot) { dot.style.left = `${x / 100}px`; dot.style.top = `${y / 100}px`; dot.style.opacity = "1"; }
    } else {
      setTaps(movement.current.countOf("tap / keyboard"));
    }
  }

  function resetMovement() {
    movement.current.clear();
    lastPoint.current = null;
    startTime.current = null;
    setSamples(0); setTaps(0); setUserBits(0);
    const dot = drawRef.current?.querySelector(".movement-dot");
    if (dot) dot.style.opacity = "0";
  }

  function updateKeeper(field, value) {
    setKeepers((old) => old.map((k, i) => i === keeperIndex ? { ...k, [field]: value } : k));
    setErrors((old) => ({ ...old, [field]: "" }));
  }

  function nextKeeper(event) {
    event.preventDefault();
    const nextErrors = contactErrors(keeper);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    if (keeperIndex < count - 1) setKeeperIndex(keeperIndex + 1);
    else {
      const incomplete = activeKeepers.findIndex((k) => Object.keys(contactErrors(k)).length);
      if (incomplete >= 0) {
        setKeeperIndex(incomplete);
        setErrors(contactErrors(activeKeepers[incomplete]));
      } else go(2);
    }
  }

  function clearSession() {
    generationVersion.current += 1;
    generationBusy.current = false;
    setBusy(false);
    setPads([]); setPdfUrl(""); setReveal(false);
    setShares([]); setCiphertexts([]); setKeeperPdfUrl(""); setShownShare(-1); setCheckSummary("");
    dryRunRef.current = false; setDryRun(false); setDryRunConsent(false);
    setKeepers(Array.from({ length: 5 }, (_, i) => blankKeeper(i + 1)));
    setCount(5); setThreshold(3); setKeeperIndex(0); setAcknowledgments([false, false]);
    resetMovement(); setKeyboardMode(false); setClearDialog(false); go(0);
  }

  function startDryRun() {
    if (!dryRunConsent || stage !== 0) return;
    dryRunRef.current = true; setDryRun(true); go(1);
  }

  async function generate() {
    if (generationBusy.current || !cryptoReady || !entropyReady || !acknowledgments.every(Boolean)) return;
    const isDryRun = dryRunRef.current;
    if (!isDryRun && !offlineState().ready) { setOffline(offlineState()); setFailure("Generation is blocked: open the downloaded file from your computer with the network disconnected, or start an opted-in dry run."); return; }
    const badIndex = activeKeepers.findIndex((k) => Object.keys(contactErrors(k)).length);
    if (badIndex >= 0) { setKeeperIndex(badIndex); go(1); setErrors(contactErrors(activeKeepers[badIndex])); return; }
    generationBusy.current = true;
    const version = ++generationVersion.current;
    setBusy(true); setFailure("");
    let contribution;
    let masterSecret;
    const stillOffline = () => {
      if (version !== generationVersion.current || (!isDryRun && !offlineState().ready)) {
        throw new Error("A network connection appeared during generation, so it was cancelled. Nothing was issued.");
      }
    };
    try {
      const issues = await validatePdfContacts(activeKeepers);
      if (issues.length) throw new Error(issues.map((i) => i.message).join(" "));
      contribution = movement.current.encode();
      const newPads = await generatePadsWithEntropy(count, contribution);
      let shamir = null;
      {
        stillOffline();
        masterSecret = await generateMasterSecret(contribution);
        stillOffline();
        if (!isValidThreshold(threshold, count)) throw new Error("Only SLIP-39 single-level schemes with 2 ≤ n ≤ m − 1 are supported. Nothing was issued.");
        const mnemonics = await splitMasterSecret({ masterSecret, threshold, shareCount: count, crypto: globalThis.crypto });
        mnemonics.forEach((m, i) => {
          const d = decodeMnemonic(m);
          d.value?.fill?.(0);
          if (d.groupCount !== 1 || d.groupThreshold !== 1 || d.groupIndex !== 0 || d.memberThreshold !== threshold || d.memberIndex !== i || d.wordCount !== 20) {
            throw new Error("Share check failed: not a single-level 20-word SLIP-39 share. Nothing was issued.");
          }
        });
        stillOffline();
        const subsets = thresholdSubsets(count, threshold);
        for (const subset of subsets) {
          const recovered = await combineMnemonics(subset.map((i) => mnemonics[i]), "", globalThis.crypto);
          const same = recovered.length === masterSecret.length && recovered.every((b, i) => b === masterSecret[i]);
          recovered.fill(0);
          if (!same) throw new Error("Recovery check failed: a set of shares did not recover the seed. Nothing was issued.");
        }
        let refused = false;
        try { (await combineMnemonics(mnemonics.slice(0, threshold - 1), "", globalThis.crypto)).fill(0); } catch { refused = true; }
        if (!refused) throw new Error("Recovery check failed: fewer than the threshold of shares were accepted. Nothing was issued.");
        const prefixes = mnemonics.map((m) => wordPrefixes(m));
        const texts = prefixes.map((p, i) => encryptPrefixes(p, newPads[i]));
        texts.forEach((c, i) => { if (decryptCiphertext(c, newPads[i]) !== prefixes[i]) throw new Error("Cipher check failed. Nothing was issued."); });
        stillOffline();
        // A dry run never builds or offers any file.
        const keeperBytes = isDryRun ? null : await createKeeperCiphertextPdf({ keepers: activeKeepers, ciphertexts: texts, threshold });
        shamir = { mnemonics, texts, keeperBytes, subsetCount: subsets.length };
      }
      const bytes = isDryRun ? null : await createRecoveryPdf({
        keepers: activeKeepers, pads: newPads, threshold,
        entropySummary: { sampleCount: movement.current.count, inputKind },
        cipherGroups: shamir.texts.map(firstCipherGroups), ciphertextCrcs: shamir.texts.map(ciphertextCrc32),
      });
      if (version !== generationVersion.current) return;
      stillOffline();
      const url = bytes ? URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })) : "";
      {
        setShares(shamir.mnemonics); setCiphertexts(shamir.texts); setShownShare(-1);
        setKeeperPdfUrl(shamir.keeperBytes ? URL.createObjectURL(new Blob([shamir.keeperBytes], { type: "application/pdf" })) : "");
        setCheckSummary(`Recovery check passed in memory: ${shamir.subsetCount === 1 ? `the only set of ${threshold} shares` : `each of the ${shamir.subsetCount} possible sets of ${threshold} shares`} recovered the seed, and ${threshold - 1} share${threshold - 1 === 1 ? " was" : "s were"} refused. Every ciphertext decrypted back to its share.`);
      }
      movement.current.clear(); setUserBits(0); setSamples(0); setTaps(0);
      setPads(newPads); setPdfUrl(url); setReveal(false); go(4);
    } catch (error) {
      if (version === generationVersion.current) setFailure(error instanceof Error ? error.message : "The sheet could not be generated. No PDF was issued.");
    } finally {
      contribution?.fill(0);
      masterSecret?.fill(0);
      if (version === generationVersion.current) {
        generationBusy.current = false;
        setBusy(false);
      }
    }
  }

  function field(name, optional = false) {
    const id = `keeper-${keeper.id}-${name}`;
    return <div className={`field ${name === "website" || name === "region" ? "wide" : ""}`} key={name}>
      <label htmlFor={id}>{FIELD_LABELS[name]}{optional && <span>Optional</span>}</label>
      <input id={id} data-testid={`input-${name}`} type={name === "phone" ? "tel" : "text"}
        autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck="false"
        value={keeper[name]} onChange={(e) => updateKeeper(name, e.target.value)}
        aria-invalid={!!errors[name]} aria-describedby={errors[name] ? `${id}-error` : undefined} />
      {errors[name] && <p className="field-error" id={`${id}-error`} role="alert">{errors[name]}</p>}
    </div>;
  }

  return <>
    <a href="#main-content" className="skip-link">Skip to content</a>
    <header className="site-header">
      <a href={`${SITE_URL}#/`} target="_blank" rel="noopener noreferrer" className="brand-link" aria-label="ShareKeeper.org home (opens in a new tab, keeping this workspace)" data-testid="link-home"><img src={logo} alt="" width="280" height="93" className="brand" data-testid="img-brand" onError={(e) => { e.currentTarget.hidden = true; }} /></a>
      <div className="header-actions">
        <span className="local-label"><LockKeyhole size={15} aria-hidden="true" /> {dryRun ? "Dry run · no downloads" : "Offline workspace"}</span>
        {offline.fromFile ? null : PLATFORM_PREVIEW
          ? <a className="quiet-link" href={STANDALONE_URL} target="_blank" rel="noopener noreferrer" data-testid="open-standalone">Open standalone app <ArrowRight size={15} aria-hidden="true" /></a>
          : <a className="quiet-link" href="./sharekeeper-offline.html" download="sharekeeper-offline.html" data-testid="download-offline">Download the tool <Download size={15} aria-hidden="true" /></a>}
      </div>
    </header>
    <nav className="tool-site-nav" aria-label="Sharekeeper website">
      <a href={`${SITE_URL}#/tools`} target="_blank" rel="noopener noreferrer" data-testid="link-site-tools"><ArrowLeft size={14} aria-hidden="true" /> Sharekeeper tools</a>
      <span aria-current="page">Seed, shares and recovery sheet</span>
      <a href={`${SITE_URL}#/providers`} target="_blank" rel="noopener noreferrer" data-testid="link-provider-directory">Provider directory <ArrowRight size={14} aria-hidden="true" /></a>
    </nav>
    <div className="workspace">
      <aside className="workflow" aria-label="Your progress">
        <p className="eyebrow">Recovery tools</p>
        <h1>Seed to<br className="desktop-break" /> hand-outs</h1><p className="intro">A new wallet seed, SLIP-39 shares,<br />your recovery sheet and hand-outs.</p>
        <ol className="steps">
          {STEPS.map((label, i) => <li key={label} className={Math.min(stage, 3) === i ? "active" : stage > i ? "complete" : ""} aria-current={Math.min(stage, 3) === i ? "step" : undefined}>
            <span className="step-number">{stage > i ? <Check size={15} aria-hidden="true" /> : String(i + 1).padStart(2, "0")}</span><span>{label}</span>
          </li>)}
        </ol>
        <div className="sidebar-note"><ShieldCheck size={21} aria-hidden="true" /><p>No account. No uploads.<br />Seed, shares, contacts and pads stay in this tab’s memory.</p></div>
        <button className="text-button clear-button" disabled={stage === 0 || busy} onClick={() => setClearDialog(true)} data-testid="button-clear"><Trash2 size={15} aria-hidden="true" /> Clear session</button>
      </aside>
      <main id="main-content" className="main-panel">
        <div className="panel-topline"><span>Private setup</span><span className="prototype-label">{dryRun ? "Dry run · practice only" : "Prototype · SLIP-39 · offline"}</span></div>
        {dryRun && <div className="dry-run-banner" role="status" data-testid="dry-run-banner"><Eye size={18} aria-hidden="true" /><span><strong>Dry run: practice only.</strong> Nothing can be downloaded. Never use this seed, these shares or these pads for real funds: this run is in a browser that may be online. Clearing the session ends the dry run.</span></div>}
        {!dryRun && <div className={`offline-gate ${offline.ready ? "ready" : ""}`} role="status" data-testid="offline-gate">{offline.ready
          ? <><ShieldCheck size={18} aria-hidden="true" /><span>Offline check passed: opened from a local file and the browser reports no network connection.</span></>
          : <><LockKeyhole size={18} aria-hidden="true" /><span>Generation is blocked until {!offline.fromFile ? "you open this downloaded file from your computer (file://)" : ""}{!offline.fromFile && !offline.offline ? " and " : ""}{!offline.offline ? "you disconnect from the network (Wi-Fi off, cable out)" : ""}. This check updates on its own.</span></>}</div>}
        <section className="interview" aria-labelledby="step-heading">
          {stage === 0 && <>
            <p className="eyebrow">Step 01 / Set up</p>
            <h2 id="step-heading" tabIndex="-1" ref={headingRef}>How many sharekeepers, and how many to recover?</h2>
            <p className="subheading">Choose 3–5 independent sharekeepers (m) and how many of them are needed to recover (n), always at least one fewer than m. We’ll guide you through their contact details, then generate a separate pad for each.</p>
            <fieldset className="count-fieldset"><legend>Number of sharekeepers</legend><div className="count-options">
              {KEEPER_COUNTS.map((n) => <button key={n} type="button" aria-pressed={count === n} className={count === n ? "count-option selected" : "count-option"} onClick={() => { setCount(n); setThreshold((t) => Math.min(Math.max(t, 2), n - 1)); }} data-testid={`count-${n}`}>
                <span className="count-value">{n}</span><span>sharekeepers</span><span className="count-detail">One pad per keeper</span>{count === n && <CheckCircle2 size={18} aria-hidden="true" />}
              </button>)}
            </div></fieldset>
            <fieldset className="count-fieldset threshold-fieldset"><legend>Sharekeepers needed to recover</legend><div className="count-options">
              {thresholdOptions(count).map((n) => <button key={n} type="button" aria-pressed={threshold === n} className={threshold === n ? "count-option selected" : "count-option"} onClick={() => setThreshold(n)} data-testid={`threshold-${n}`}>
                <span className="count-value">{n} of {count}</span><span>needed</span><span className="count-detail">{`${count - n} can be lost`}</span>{threshold === n && <CheckCircle2 size={18} aria-hidden="true" />}
              </button>)}
            </div></fieldset>
            <p className="technical-note">Any {threshold} of your {count} sharekeepers can recover; up to {count - threshold} can be lost or refuse. The number needed is always at least one fewer than the total, so losing one sharekeeper never makes recovery impossible. Only SLIP-39 single-level schemes are offered (one group, 2 ≤ n ≤ m − 1); a threshold of 1 is not, as the spec forbids it with more than one share. The tool creates {count} SLIP-39 shares, any {threshold} of which recover the seed.</p>
            <div className="profile-row"><span><strong>{threshold}-of-{count}</strong> sheet layout</span><span><strong>{PAD_LENGTH} letters</strong> per pad</span><span><strong>US Letter</strong> printable PDF</span></div>
            {<div className="plain-note"><LockKeyhole size={19} aria-hidden="true" /><div><h3>This tool creates a new wallet seed.</h3><p>It generates a 128-bit SLIP-39 master secret and its {count} shares (20 words each) in this tab’s memory, encrypts each share with that sharekeeper’s pad, and never stores or sends anything. It does not import an existing seed. Nothing is saved: closing the tab or clearing the session discards it, although the browser may keep copies in memory until they are overwritten.</p></div></div>}
            {!dryRun && !offline.ready && <div className="run-paths" data-testid="run-paths">
              <article className="run-path"><h3>For real: offline</h3><ol>
                <li>{offline.fromFile ? "You are running the downloaded file." : PLATFORM_PREVIEW
                  ? <><a href={STANDALONE_URL} target="_blank" rel="noopener noreferrer" data-testid="guide-standalone">Open the standalone tool</a> and download it from there.</>
                  : <><a href="./sharekeeper-offline.html" download="sharekeeper-offline.html" data-testid="guide-download">Download the tool</a> (one HTML file).</>}</li>
                <li>Disconnect this computer from the network (Wi-Fi off, cable out).</li>
                <li>Open the downloaded file in your browser. Generation unlocks on its own once both checks pass.</li>
              </ol></article>
              <article className="run-path dry"><h3>Optional: dry run online</h3><p>Walk through every step here to see how it works. Downloads are disabled, and the results are for practice only.</p>
                <label className="dry-run-consent"><input type="checkbox" checked={dryRunConsent} onChange={(e) => setDryRunConsent(e.target.checked)} data-testid="dry-run-consent" /><span>I understand a dry run creates no files, and I will never use its seed, shares or pads for real funds.</span></label>
                <button type="button" className="secondary-button" disabled={!dryRunConsent || !cryptoReady} onClick={startDryRun} data-testid="button-dry-run">Start dry run <ArrowRight size={17} aria-hidden="true" /></button>
              </article>
            </div>}
            {!offlineBlocked && <div className="actions"><button className="primary-button" onClick={() => go(1)} disabled={!cryptoReady} data-testid="button-start">{dryRun ? "Continue dry run" : "Continue to contacts"} <ArrowRight size={17} aria-hidden="true" /></button></div>}
          </>}
          {stage === 1 && <>
            <p className="eyebrow">Step 02 / Sharekeeper {keeperIndex + 1} of {count}</p>
            <h2 id="step-heading" tabIndex="-1" ref={headingRef}>Who will you contact?</h2>
            <p className="subheading">Use independently verified details. Add a name and at least one contact channel; the rest can be completed on paper.</p>
            <div className="keeper-tabs" aria-label="Select sharekeeper">{activeKeepers.map((k, i) => <button key={k.id} type="button" className={i === keeperIndex ? "selected" : ""} aria-pressed={i === keeperIndex} onClick={() => { setKeeperIndex(i); setErrors({}); }} data-testid={`keeper-tab-${i + 1}`}>{String(i + 1).padStart(2, "0")}{!Object.keys(contactErrors(k)).length && <Check size={13} aria-hidden="true" />}</button>)}</div>
            <form onSubmit={nextKeeper} noValidate autoComplete="off">
              <div className="form-grid">{field("name")}{field("reference", true)}{field("phone")}{field("website", true)}</div>
              <details className="address-details"><summary data-testid="toggle-address">Add postal address <span>Optional</span></summary><div className="form-grid">{field("address1", true)}{field("address2", true)}{field("region", true)}</div></details>
              <div className="actions between"><button type="button" className="secondary-button" onClick={() => keeperIndex ? setKeeperIndex(keeperIndex - 1) : go(0)} data-testid="button-back"><ArrowLeft size={16} aria-hidden="true" /> Back</button><button type="submit" className="primary-button" data-testid="button-next-keeper">{keeperIndex < count - 1 ? "Next sharekeeper" : "Continue to entropy"}<ArrowRight size={17} aria-hidden="true" /></button></div>
            </form>
          </>}
          {stage === 2 && <>
            <p className="eyebrow">Step 03 / Add entropy</p>
            <h2 id="step-heading" tabIndex="-1" ref={headingRef}>Add your own source of randomness.</h2>
            <p className="subheading">Move your mouse around the area below, or draw with your finger. We mix your movement and event timing with the browser’s cryptographic randomness.</p>
            <div className="entropy-sources">
              <div><ShieldCheck size={19} aria-hidden="true" /><div><strong>Source 1 · Browser cryptographic RNG</strong><p>A fresh {BROWSER_SEED_BITS}-bit random seed for every pad.</p></div><span className="source-status">{cryptoReady ? "Available" : "Unavailable"}</span></div>
              <div><MousePointer2 size={19} aria-hidden="true" /><div><strong>Source 2 · Your movement + timing</strong><p>Mouse, touch, or keyboard/tap input, until its estimated score reaches {USER_ENTROPY_TARGET_BITS}.</p></div><span className={`source-status ${entropyReady ? "ready" : ""}`}>{entropyReady ? "Collected" : "Awaiting input"}</span></div>
            </div>
            <div ref={drawRef} className="movement-area" onPointerMove={(event) => appendMovement(event)} onPointerDown={(event) => appendMovement(event)} data-testid="movement-area" role="group" aria-label="Move your mouse or finger here to contribute movement and timing">
              <span className="movement-dot" aria-hidden="true"></span>
              <Fingerprint size={35} aria-hidden="true" /><strong>{entropyReady ? "Your contribution is collected." : "Move your mouse or draw here"}</strong><span data-testid="entropy-bits">Estimated score {Math.min(userBits, USER_ENTROPY_TARGET_BITS)} / {USER_ENTROPY_TARGET_BITS} · {samples} movement samples{taps ? ` · ${taps} timing taps` : ""}</span>
              <div className="sample-track" aria-hidden="true"><span style={{ width: `${Math.min(100, (userBits / USER_ENTROPY_TARGET_BITS) * 100)}%` }} /></div>
              <span className="movement-target">{entropyReady ? "You can keep moving, or continue." : `Keep moving in curves, changing speed and direction, until the score reaches ${USER_ENTROPY_TARGET_BITS}.`}</span>
            </div>
            <div className="entropy-utilities"><button className="text-button" onClick={() => setKeyboardMode(!keyboardMode)} aria-expanded={keyboardMode} data-testid="toggle-timing">{keyboardMode ? "Hide timing input" : "Use keyboard / tap timing"}</button><button className="text-button" onClick={resetMovement} data-testid="reset-movement">Start input again</button></div>
            {keyboardMode && <button className="timing-button" onClick={(event) => appendMovement(event, "timing")} data-testid="timing-tap">Tap or focus and press Space at irregular intervals · {taps} taps (slow: up to 4 bits each)</button>}
            <p className="technical-note">The score is a heuristic estimate in bits, not measured entropy: each movement earns at most 2 points, from variation in its position changes; straight, steady or repeated motion earns little. Predictable motion can still score, so it is a collection gate, not a guarantee. For each pad, a 200-byte (1600-bit) browser seed is combined by XOR with a 200-byte block derived from your input with SHA-512. Your input adds protection only to the extent it is genuinely unpredictable; the browser seed alone is what makes the letters uniform.</p>
            <div className="actions between"><button className="secondary-button" onClick={() => { setKeeperIndex(count - 1); go(1); }} data-testid="button-back"><ArrowLeft size={16} aria-hidden="true" /> Back</button><button className="primary-button" disabled={!entropyReady || !cryptoReady} onClick={() => go(3)} data-testid="button-review">Review and generate <ArrowRight size={17} aria-hidden="true" /></button></div>
          </>}
          {stage === 3 && <>
            <p className="eyebrow">Step 04 / Review</p>
            <h2 id="step-heading" tabIndex="-1" ref={headingRef}>Check the details before creating keys.</h2>
            <p className="subheading">Each sharekeeper gets one SLIP-39 share, encrypted with its own {PAD_LENGTH}-letter pad. Nothing has been generated yet.</p>
            <div className="contact-review">{activeKeepers.map((k, i) => <article key={k.id} className="review-row"><span className="row-number">{String(i + 1).padStart(2, "0")}</span><div><h3>{k.name || "Contact details missing"}</h3><p>{k.phone || k.website || k.address1 || "Add a contact channel"}</p></div><button className="text-button" disabled={busy} onClick={() => { setKeeperIndex(i); go(1); }} data-testid={`edit-keeper-${i + 1}`}>Edit</button></article>)}</div>
            <div className="mix-summary"><Fingerprint size={20} aria-hidden="true" /><div><strong>Two sources, one local generation</strong><p>{BROWSER_SEED_BITS}-bit browser seed per pad ⊕ {BROWSER_SEED_BITS}-bit block from your {movement.current.count} movement/timing samples (estimated score {Math.min(userBits, 99999)}) → unbiased A–Z selection.</p></div></div>
            {<p className="technical-note">Generation creates a 128-bit master secret (browser CSPRNG ⊕ SHA-512 of your input), splits it into {count} SLIP-39 shares with threshold {threshold} (single-level: one group; extendable, iteration exponent 1, no SLIP-39 passphrase), and checks in memory that every set of {threshold} shares recovers it. Each share’s 80-letter plaintext P is the first 4 letters of its 20 words; ciphertext C = (P + K) mod 26 with A = 0. {dryRun ? "In a dry run no PDF is created: you see the results on screen only." : "You get two PDFs: your one unified recovery sheet for all sharekeepers, as 3 labeled copies on 3 pages (COPY 1 OF 3 to COPY 3 OF 3) with contacts, pads, first 2 cipher groups and ciphertext CRC32 filled in, and a hand-out file with one ciphertext page per sharekeeper. Wallet passphrases stay blank."}</p>}
            <div className="acknowledgments">{(dryRun ? [
              "I understand this is a practice run: nothing will be downloaded, and the results must never be used for real funds.",
              "I understand that for real use I must download the tool and run it offline.",
            ] : [
              "I understand this is an unaudited prototype and will test recovery offline, with a small amount first, before relying on it.",
              "I will keep my recovery sheet and the plaintext shares private. Each sharekeeper receives only their own ciphertext page.",
            ]).map((text, i) => <label key={i}><input type="checkbox" disabled={busy} checked={acknowledgments[i]} onChange={(e) => setAcknowledgments((old) => old.map((v, j) => j === i ? e.target.checked : v))} data-testid={`ack-${i}`} /><span>{text}</span></label>)}</div>
            <div className="actions between"><button className="secondary-button" disabled={busy} onClick={() => go(2)} data-testid="button-back"><ArrowLeft size={16} aria-hidden="true" /> Back</button><button className="primary-button" disabled={busy || !cryptoReady || !entropyReady || offlineBlocked || !acknowledgments.every(Boolean)} onClick={generate} data-testid="button-generate">{busy ? "Generating locally…" : dryRun ? "Generate dry run" : "Generate seed and shares"}<LockKeyhole size={17} aria-hidden="true" /></button></div>
          </>}
          {stage === 4 && <>
            <p className="eyebrow">{dryRun ? "Dry run / Practice only" : "Ready / Private documents"}</p>
            <h2 id="step-heading" tabIndex="-1" ref={headingRef}>{dryRun ? `Dry run complete: a practice seed and ${count} shares.` : `Your seed and ${count} shares are ready.`}</h2>
            <p className="subheading" data-testid="check-summary">{checkSummary}</p>
            {dryRun ? <div className="plain-note dry-note" data-testid="dry-run-no-downloads"><LockKeyhole size={20} aria-hidden="true" /><div><h3>No downloads in a dry run.</h3><p>A real run produces your recovery sheet (one PDF, 3 labeled copies) and the sharekeeper hand-out (one PDF, a page per sharekeeper). To get them, {offline.fromFile ? "disconnect from the network, reopen this file," : PLATFORM_PREVIEW ? <><a href={STANDALONE_URL} target="_blank" rel="noopener noreferrer">open the standalone tool</a>, download it, disconnect,</> : <><a href="./sharekeeper-offline.html" download="sharekeeper-offline.html" data-testid="dry-download">download the tool</a>, disconnect, open the file,</>} and run it again. Your contacts are not carried over.</p></div></div> : <><div className="download-panel"><FileText size={33} aria-hidden="true" /><div><h3>Your recovery sheet</h3><p>One unified sheet for all {count} sharekeepers, 3 labeled copies (COPY 1–3 OF 3, one per page) · {threshold} of {count} · contacts, pads, first 2 cipher groups, ciphertext CRC32 · US Letter</p><span>Contains the pads. Keep it private; never give it to a sharekeeper.</span></div></div>
            <div className="actions"><a className="primary-button" href={pdfUrl} download="sharekeeper-recovery-sheet-private.pdf" data-testid="download-pdf"><Download size={18} aria-hidden="true" /> Download recovery sheet</a></div>
            <div className="download-panel"><FileText size={33} aria-hidden="true" /><div><h3>Sharekeeper hand-out pages</h3><p>One PDF · one page per sharekeeper · their 20 groups of 4 letters and CRC32</p><span>Print it and give each sharekeeper only their own page. Don’t send the file itself to anyone: it holds every sharekeeper’s ciphertext.</span></div></div>
            <div className="actions"><a className="secondary-button" href={keeperPdfUrl} download="sharekeeper-ciphertext-handout.pdf" data-testid="download-ciphertexts"><Download size={18} aria-hidden="true" /> Download hand-out pages</a></div></>}
            <div className="contact-review">{activeKeepers.map((k, i) => <article key={k.id} className="review-row"><span className="row-number">{String(i + 1).padStart(2, "0")}</span><div><h3>{k.name}</h3><p data-testid={`cipher-summary-${i + 1}`}>First groups {ciphertexts[i]?.slice(0, 4)} {ciphertexts[i]?.slice(4, 8)} · CRC32 {ciphertexts[i] ? ciphertextCrc32(ciphertexts[i]) : ""}</p></div></article>)}</div>
            <div className="secret-section"><h3>Plaintext shares</h3>
              <p className="technical-note">{dryRun ? "Practice shares: never use them for real funds. " : ""}These are the {count} SLIP-39 shares; any {threshold} restore the seed in a wallet that supports SLIP-39 recovery. They exist only on this screen{dryRun ? "" : " and are not in either PDF"}. Show one at a time, only where no camera or person can see the screen.</p>
              <div className="share-buttons">{shares.map((_, i) => <button key={i} type="button" className="text-button" disabled={offlineBlocked} aria-expanded={shownShare === i} onClick={() => setShownShare(shownShare === i ? -1 : i)} data-testid={`toggle-share-${i + 1}`}>{shownShare === i ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}{shownShare === i ? `Hide share ${String(i + 1).padStart(2, "0")}` : `Show share ${String(i + 1).padStart(2, "0")}`}</button>)}</div>
              {shownShare >= 0 && !offlineBlocked && <article className="share-words"><h3>{dryRun ? "DRY RUN · " : ""}Share {String(shownShare + 1).padStart(2, "0")} · {activeKeepers[shownShare]?.name}</h3><ol data-testid={`share-words-${shownShare + 1}`}>{shares[shownShare].split(" ").map((word, w) => <li key={w}>{word}</li>)}</ol></article>}
            </div>
            <div className="secret-section"><button className="text-button" aria-expanded={reveal} onClick={() => setReveal(!reveal)} data-testid="toggle-pads">{reveal ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}{reveal ? "Hide pads on screen" : "Show pads on screen"}</button>
              {reveal && <div className="pad-list">{pads.map((pad, i) => <article key={i}><h3>Sharekeeper {i + 1} · Secret pad K</h3><p className="pad-text" data-testid={`pad-${i + 1}`}>{groupPad(pad)}</p></article>)}</div>}
            </div>
            {!dryRun && <div className="plain-note"><ShieldCheck size={20} aria-hidden="true" /><div><h3>Before relying on it.</h3><p>Restore the wallet from {threshold} shares on an offline device and confirm it shows the addresses you expect, then decrypt one ciphertext page with its pad by hand. Fill in wallet passphrases on paper only. Clear this session when done; nothing is saved.</p></div></div>}
            <button className="secondary-button new-sheet" onClick={() => setClearDialog(true)} data-testid="button-new-sheet">{dryRun ? "End dry run and clear" : "Clear session and start again"}</button>
          </>}
          {!cryptoReady && <p className="error-message" role="alert">Web Crypto is unavailable. Use a current browser in a secure context or the downloaded offline app. Generation is blocked; there is no weaker fallback.</p>}
          {failure && <p className="error-message" role="alert" data-testid="generation-error">{failure}</p>}
        </section>
        <details className="scope-note main-scope"><summary data-testid="toggle-scope">About this prototype and its limits</summary>{PLATFORM_PREVIEW && <p>To download the tool, use Open standalone app. It opens a fresh GitHub Pages session; your current contacts and keys are not transferred.</p>}<p>Real generation runs only when this file is opened from your computer (file://) and the browser reports no network connection. That check reflects what the browser reports; it cannot prove the computer is physically disconnected or trustworthy. A dry run skips the check, creates no files, and is for practice only.</p><p>The 80-letter profile is an explicit choice for this tool, not a finalized Sharekeeper standard. The n-of-m header reflects the SLIP-39 shares this tool created; custody terms still need explicit agreement.</p><p>The updated sample uses an eight-hex-digit CRC32 field. A checksum is not cryptographic authentication; this tool fills in CRC-32/ISO-HDLC of each 80-letter ciphertext to catch copying mistakes.</p><p>Each pad combines a 200-byte (1600-bit) browser seed with a 200-byte block derived from your input. Block length is not entropy: browser randomness is cryptographic pseudorandomness, and the movement score is a heuristic estimate, not measured entropy. This prototype does not claim information-theoretic one-time-pad security.</p><p>A downloaded PDF contains secret pads. Clearing this tab cannot erase downloads, print queues, screenshots, or all browser memory.</p></details>
        <footer className="panel-footer"><LockKeyhole size={14} aria-hidden="true" /><span>In-memory only. Refreshing or closing this tab loses the session.</span></footer>
      </main>
      <aside className="sheet-aside" aria-label="Your sheet profile">
        <p className="eyebrow">The document</p>
        <div className="paper-preview" aria-hidden="true">
          <div className="paper-title">SHAREKEEPER</div><div className="paper-subtitle">RECOVERY SHEET · {threshold} OF {count} · 3 COPIES</div><div className="paper-instructions" />
          {Array.from({ length: 5 }, (_, i) => <div className={`paper-share ${i >= count ? "unused" : ""}`} key={i}><div className="paper-share-header"><strong>SHARE {String(i + 1).padStart(2, "0")}</strong><span>{i >= count ? "LEFT BLANK" : ""}</span></div><div className="paper-share-content"><div className="paper-contact">{i < count && keepers[i].name ? keepers[i].name : <><i /><i /><i /></>}</div><div className="paper-grid">{Array.from({ length: 20 }, (_, j) => <i key={j} />)}</div></div><div className="paper-hash" /></div>)}
          <div className="paper-wallets"><span>ACCOUNTS / WALLET PASSPHRASES</span>{Array.from({ length: 7 }, (_, i) => <i key={i} />)}</div>
        </div>
        <p className="preview-caption">Layout preview · no secret keys shown</p>
        <dl className="document-facts"><div><dt>Sharekeepers</dt><dd>{count} independent contacts</dd></div><div><dt>Recovery</dt><dd>Any {threshold} of {count}</dd></div><div><dt>Pad format</dt><dd>20 groups × 4 A–Z letters</dd></div><div><dt>Randomness</dt><dd>Browser RNG + your input</dd></div><div><dt>Output</dt><dd>{dryRun ? "None (dry run)" : "Recovery sheet (3 copies) + hand-out"}</dd></div></dl>
      </aside>
    </div>
    <dialog ref={dialogRef} onCancel={(e) => { e.preventDefault(); setClearDialog(false); }} className="clear-dialog" aria-labelledby="clear-heading">
      <h2 id="clear-heading">Clear this session?</h2><p>Contacts, movement input, the seed, shares and pads will be removed from this app’s active state. Downloaded files and printed copies are not deleted, and browser-memory erasure cannot be guaranteed.</p>
      <div className="actions between"><button className="secondary-button" autoFocus onClick={() => setClearDialog(false)} data-testid="cancel-clear">Keep this session</button><button className="primary-button" onClick={clearSession} data-testid="confirm-clear">Clear and start over</button></div>
    </dialog>
  </>;
}

createRoot(document.getElementById("root")).render(<App />);
