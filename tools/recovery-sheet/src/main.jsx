import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Download, Fingerprint, LockKeyhole, MousePointer2, ShieldCheck, Trash2, Eye, EyeOff, FileText } from "lucide-react";
import "@fontsource/source-sans-3/latin-400.css";
import "@fontsource/source-sans-3/latin-600.css";
import "@fontsource/source-sans-3/latin-700.css";
import { blankKeeper, KEEPER_COUNTS, THRESHOLD, PAD_LENGTH } from "../shared/schema.js";
import { publicNavigationUrls } from "../shared/public-urls.js";
import { generatePadsWithEntropy, groupPad } from "./pads.js";
import { createRecoveryPdf, validatePdfContacts } from "./pdf.js";
import { contactErrors } from "./contacts.js";
import logo from "../assets/logo-with-domain.webp";
import "./style.css";

const STEPS = ["Set up", "Sharekeepers", "Add entropy", "Generate sheet"];
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
  const [keepers, setKeepers] = useState(() => Array.from({ length: 5 }, (_, i) => blankKeeper(i + 1)));
  const [keeperIndex, setKeeperIndex] = useState(0);
  const [errors, setErrors] = useState({});
  const [failure, setFailure] = useState("");
  const [samples, setSamples] = useState(0);
  const [taps, setTaps] = useState(0);
  const [inputKind, setInputKind] = useState("mouse / finger");
  const [keyboardMode, setKeyboardMode] = useState(false);
  const [acknowledgments, setAcknowledgments] = useState([false, false]);
  const [busy, setBusy] = useState(false);
  const [pads, setPads] = useState([]);
  const [pdfUrl, setPdfUrl] = useState("");
  const [reveal, setReveal] = useState(false);
  const [clearDialog, setClearDialog] = useState(false);
  const movement = useRef([]);
  const lastPoint = useRef(null);
  const startTime = useRef(null);
  const drawRef = useRef(null);
  const headingRef = useRef(null);
  const dialogRef = useRef(null);
  const generationVersion = useRef(0);
  const generationBusy = useRef(false);
  const cryptoReady = typeof globalThis.crypto?.getRandomValues === "function" && !!globalThis.crypto?.subtle;
  const activeKeepers = keepers.slice(0, count);
  const entropyReady = samples >= 64 || taps >= 12;
  const keeper = keepers[keeperIndex];

  useEffect(() => { headingRef.current?.focus(); }, [stage, keeperIndex]);
  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);
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
    if (!native.isTrusted || movement.current.length >= 512) return;
    const now = performance.now();
    if (startTime.current === null) startTime.current = now;
    const box = drawRef.current?.getBoundingClientRect();
    const x = mode === "pointer" ? Math.round((event.clientX - (box?.left ?? 0)) * 100) : 0;
    const y = mode === "pointer" ? Math.round((event.clientY - (box?.top ?? 0)) * 100) : 0;
    if (mode === "pointer" && lastPoint.current?.x === x && lastPoint.current?.y === y) return;
    if (mode === "pointer") lastPoint.current = { x, y };
    const kind = mode === "pointer" ? (event.pointerType || "mouse") : "tap / keyboard";
    movement.current.push([kind, x, y, Math.round((now - startTime.current) * 1000), Math.round((event.pressure ?? 0) * 1000)]);
    setInputKind(kind);
    if (mode === "pointer") {
      const n = movement.current.filter((record) => record[0] !== "tap / keyboard").length;
      setSamples(n);
      const dot = drawRef.current?.querySelector(".movement-dot");
      if (dot) { dot.style.left = `${x / 100}px`; dot.style.top = `${y / 100}px`; dot.style.opacity = "1"; }
    } else {
      setTaps(movement.current.filter((record) => record[0] === "tap / keyboard").length);
    }
  }

  function resetMovement() {
    movement.current.forEach((record) => record.fill(0));
    movement.current.length = 0;
    lastPoint.current = null;
    startTime.current = null;
    setSamples(0); setTaps(0);
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
    setKeepers(Array.from({ length: 5 }, (_, i) => blankKeeper(i + 1)));
    setCount(5); setKeeperIndex(0); setAcknowledgments([false, false]);
    resetMovement(); setKeyboardMode(false); setClearDialog(false); go(0);
  }

  async function generate() {
    if (generationBusy.current || !cryptoReady || !entropyReady || !acknowledgments.every(Boolean)) return;
    const badIndex = activeKeepers.findIndex((k) => Object.keys(contactErrors(k)).length);
    if (badIndex >= 0) { setKeeperIndex(badIndex); go(1); setErrors(contactErrors(activeKeepers[badIndex])); return; }
    generationBusy.current = true;
    const version = ++generationVersion.current;
    setBusy(true); setFailure("");
    let contribution;
    try {
      const issues = await validatePdfContacts(activeKeepers);
      if (issues.length) throw new Error(issues.map((i) => i.message).join(" "));
      contribution = new TextEncoder().encode(JSON.stringify({ version: 1, records: movement.current }));
      const newPads = await generatePadsWithEntropy(count, contribution);
      const bytes = await createRecoveryPdf({
        keepers: activeKeepers, pads: newPads,
        entropySummary: { sampleCount: movement.current.length, inputKind },
      });
      if (version !== generationVersion.current) return;
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      movement.current.forEach((record) => record.fill(0));
      movement.current.length = 0;
      setPads(newPads); setPdfUrl(url); setReveal(false); go(4);
    } catch (error) {
      if (version === generationVersion.current) setFailure(error instanceof Error ? error.message : "The sheet could not be generated. No PDF was issued.");
    } finally {
      contribution?.fill(0);
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
      <img src={logo} alt="ShareKeeper.org" width="280" height="93" className="brand" data-testid="img-brand" onError={(e) => { e.currentTarget.hidden = true; }} />
      <div className="header-actions">
        <span className="local-label"><LockKeyhole size={15} aria-hidden="true" /> Browser-only workspace</span>
        {PLATFORM_PREVIEW
          ? <a className="quiet-link" href={STANDALONE_URL} target="_blank" rel="noopener noreferrer" data-testid="open-standalone">Open standalone app <ArrowRight size={15} aria-hidden="true" /></a>
          : <a className="quiet-link" href="./sharekeeper-offline.html" download="sharekeeper-offline.html" data-testid="download-offline">Download offline app <Download size={15} aria-hidden="true" /></a>}
      </div>
    </header>
    <nav className="tool-site-nav" aria-label="Sharekeeper website">
      <a href={`${SITE_URL}#/tools`} target="_blank" rel="noopener noreferrer" data-testid="link-site-tools"><ArrowLeft size={14} aria-hidden="true" /> Sharekeeper tools</a>
      <span aria-current="page">Recovery sheet generator</span>
      <a href={`${SITE_URL}#/providers`} target="_blank" rel="noopener noreferrer" data-testid="link-provider-directory">Provider directory <ArrowRight size={14} aria-hidden="true" /></a>
    </nav>
    <div className="workspace">
      <aside className="workflow" aria-label="Your progress">
        <p className="eyebrow">Recovery tools</p>
        <h1>Recovery sheet<br className="desktop-break" /> generator</h1>
        <p className="intro">Your contacts. Your keys.<br />One private recovery sheet.</p>
        <ol className="steps">
          {STEPS.map((label, i) => <li key={label} className={Math.min(stage, 3) === i ? "active" : stage > i ? "complete" : ""} aria-current={Math.min(stage, 3) === i ? "step" : undefined}>
            <span className="step-number">{stage > i ? <Check size={15} aria-hidden="true" /> : String(i + 1).padStart(2, "0")}</span><span>{label}</span>
          </li>)}
        </ol>
        <div className="sidebar-note"><ShieldCheck size={21} aria-hidden="true" /><p>No account. No uploads.<br />Contacts, movement input, and keys are processed locally.</p></div>
        <button className="text-button clear-button" disabled={stage === 0 || busy} onClick={() => setClearDialog(true)} data-testid="button-clear"><Trash2 size={15} aria-hidden="true" /> Clear session</button>
      </aside>
      <main id="main-content" className="main-panel">
        <div className="panel-topline"><span>Private setup</span><span className="prototype-label">Prototype · CRC32 sheet</span></div>
        <section className="interview" aria-labelledby="step-heading">
          {stage === 0 && <>
            <p className="eyebrow">Step 01 / Set up</p>
            <h2 id="step-heading" tabIndex="-1" ref={headingRef}>How many sharekeepers will you use?</h2>
            <p className="subheading">Choose 3–5 independent sharekeepers. We’ll guide you through their contact details, then generate a separate pad for each.</p>
            <fieldset className="count-fieldset"><legend>Number of sharekeepers</legend><div className="count-options">
              {KEEPER_COUNTS.map((n) => <button key={n} type="button" aria-pressed={count === n} className={count === n ? "count-option selected" : "count-option"} onClick={() => setCount(n)} data-testid={`count-${n}`}>
                <span className="count-value">{n}</span><span>sharekeepers</span><span className="count-detail">One pad per keeper</span>{count === n && <CheckCircle2 size={18} aria-hidden="true" />}
              </button>)}
            </div></fieldset>
            <p className="technical-note">The worksheet uses a fixed recovery threshold of 3, regardless of the keeper count. It prepares pad and contact fields, not the shares themselves.</p>
            <div className="profile-row"><span><strong>{THRESHOLD}-of-{count}</strong> sheet layout</span><span><strong>{PAD_LENGTH} letters</strong> per pad</span><span><strong>A2</strong> printable PDF</span></div>
            <div className="plain-note"><LockKeyhole size={19} aria-hidden="true" /><div><h3>Keep wallet secrets out of this tool.</h3><p>We never ask for a seed phrase, share, or wallet passphrase. This prototype creates pads and a contact sheet, not SLIP-39 shares.</p></div></div>
            <div className="actions"><button className="primary-button" onClick={() => go(1)} disabled={!cryptoReady} data-testid="button-start">Continue to contacts <ArrowRight size={17} aria-hidden="true" /></button></div>
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
              <div><ShieldCheck size={19} aria-hidden="true" /><div><strong>Source 1 · Browser cryptographic RNG</strong><p>A fresh 256-bit random seed for every pad.</p></div><span className="source-status">{cryptoReady ? "Available" : "Unavailable"}</span></div>
              <div><MousePointer2 size={19} aria-hidden="true" /><div><strong>Source 2 · Your movement + timing</strong><p>Mouse, touch, or accessible keyboard/tap input.</p></div><span className={`source-status ${entropyReady ? "ready" : ""}`}>{entropyReady ? "Collected" : "Awaiting input"}</span></div>
            </div>
            <div ref={drawRef} className="movement-area" onPointerMove={(event) => appendMovement(event)} onPointerDown={(event) => appendMovement(event)} data-testid="movement-area" role="group" aria-label="Move your mouse or finger here to contribute movement and timing">
              <span className="movement-dot" aria-hidden="true"></span>
              <Fingerprint size={35} aria-hidden="true" /><strong>{entropyReady ? "Your contribution is collected." : "Move your mouse or draw here"}</strong><span>{samples} movement samples{taps ? ` · ${taps} timing taps` : ""}</span>
              <div className="sample-track" aria-hidden="true"><span style={{ width: `${Math.min(100, Math.max(samples / 64, taps / 12) * 100)}%` }} /></div>
              <span className="movement-target">{entropyReady ? "You can keep moving, or continue." : "Collect 64 movement samples, or use 12 timing taps."}</span>
            </div>
            <div className="entropy-utilities"><button className="text-button" onClick={() => setKeyboardMode(!keyboardMode)} aria-expanded={keyboardMode} data-testid="toggle-timing">{keyboardMode ? "Hide timing input" : "Use keyboard / tap timing"}</button><button className="text-button" onClick={resetMovement} data-testid="reset-movement">Start input again</button></div>
            {keyboardMode && <button className="timing-button" onClick={(event) => appendMovement(event, "timing")} data-testid="timing-tap">Tap or focus and press Space at irregular intervals · {taps} / 12</button>}
            <p className="technical-note">The sample count is a collection target, not a bit-strength estimate. Movement may be predictable and never replaces Web Crypto. Both inputs are mixed with HKDF-SHA-256.</p>
            <div className="actions between"><button className="secondary-button" onClick={() => { setKeeperIndex(count - 1); go(1); }} data-testid="button-back"><ArrowLeft size={16} aria-hidden="true" /> Back</button><button className="primary-button" disabled={!entropyReady || !cryptoReady} onClick={() => go(3)} data-testid="button-review">Review and generate <ArrowRight size={17} aria-hidden="true" /></button></div>
          </>}
          {stage === 3 && <>
            <p className="eyebrow">Step 04 / Review</p>
            <h2 id="step-heading" tabIndex="-1" ref={headingRef}>Check the details before creating keys.</h2>
            <p className="subheading">Each sharekeeper gets its own {PAD_LENGTH}-letter pad. No keys have been generated yet.</p>
            <div className="contact-review">{activeKeepers.map((k, i) => <article key={k.id} className="review-row"><span className="row-number">{String(i + 1).padStart(2, "0")}</span><div><h3>{k.name || "Contact details missing"}</h3><p>{k.phone || k.website || k.address1 || "Add a contact channel"}</p></div><button className="text-button" disabled={busy} onClick={() => { setKeeperIndex(i); go(1); }} data-testid={`edit-keeper-${i + 1}`}>Edit</button></article>)}</div>
            <div className="mix-summary"><Fingerprint size={20} aria-hidden="true" /><div><strong>Two sources, one local generation</strong><p>Browser CSPRNG + {movement.current.length} user movement/timing samples → HKDF-SHA-256 → unbiased A–Z selection.</p></div></div>
            <p className="technical-note">The PDF is the published sample sheet, unchanged, with each sharekeeper’s contact details and secret pad K written into its share section. First cipher groups, the eight-digit ciphertext CRC32, and wallet passphrases stay blank for you to fill in; this is not a complete backup.</p>
            <div className="acknowledgments">{[
              "I understand this is an unaudited prototype and will test the complete recovery process offline before relying on it.",
              "I will keep the generated PDF private. Pads must never be sent to a sharekeeper.",
            ].map((text, i) => <label key={i}><input type="checkbox" disabled={busy} checked={acknowledgments[i]} onChange={(e) => setAcknowledgments((old) => old.map((v, j) => j === i ? e.target.checked : v))} data-testid={`ack-${i}`} /><span>{text}</span></label>)}</div>
            <div className="actions between"><button className="secondary-button" disabled={busy} onClick={() => go(2)} data-testid="button-back"><ArrowLeft size={16} aria-hidden="true" /> Back</button><button className="primary-button" disabled={busy || !cryptoReady || !entropyReady || !acknowledgments.every(Boolean)} onClick={generate} data-testid="button-generate">{busy ? "Generating locally…" : "Generate recovery sheet"}<LockKeyhole size={17} aria-hidden="true" /></button></div>
          </>}
          {stage === 4 && <>
            <p className="eyebrow">Ready / Private document</p>
            <h2 id="step-heading" tabIndex="-1" ref={headingRef}>Your recovery sheet is ready.</h2>
            <p className="subheading">Your {count} independently generated pads are in the PDF. Download the same sheet again without changing its keys.</p>
            <div className="download-panel"><FileText size={33} aria-hidden="true" /><div><h3>Sharekeeper recovery sheet</h3><p>{count} sharekeepers · 80-letter pads · A2 PDF</p><span>Contains secrets. Store and print privately.</span></div></div>
            <div className="actions"><a className="primary-button" href={pdfUrl} download="sharekeeper-recovery-sheet-private.pdf" data-testid="download-pdf"><Download size={18} aria-hidden="true" /> Download private PDF</a></div>
            <p className="technical-note">Print at actual A2 size, or tile at 100%. Shrinking the whole sheet to A4 makes the contact fields difficult to read.</p>
            <div className="secret-section"><button className="text-button" aria-expanded={reveal} onClick={() => setReveal(!reveal)} data-testid="toggle-pads">{reveal ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}{reveal ? "Hide pads on screen" : "Show pads on screen"}</button>
              {reveal && <div className="pad-list">{pads.map((pad, i) => <article key={i}><h3>Sharekeeper {i + 1} · Secret pad K</h3><p className="pad-text" data-testid={`pad-${i + 1}`}>{groupPad(pad)}</p></article>)}</div>}
            </div>
            <div className="plain-note"><ShieldCheck size={20} aria-hidden="true" /><div><h3>Finish setup offline.</h3><p>Creating pads does not create or encrypt SLIP-39 shares. Complete the expected ciphertext groups and CRC32 fields only after actual encryption, verify the complete recovery process, and follow your agreed custody plan.</p></div></div>
            <button className="secondary-button new-sheet" onClick={() => setClearDialog(true)} data-testid="button-new-sheet">Clear session and start a new sheet</button>
          </>}
          {!cryptoReady && <p className="error-message" role="alert">Web Crypto is unavailable. Use a current browser in a secure context or the downloaded offline app. Generation is blocked; there is no weaker fallback.</p>}
          {failure && <p className="error-message" role="alert" data-testid="generation-error">{failure}</p>}
        </section>
        <details className="scope-note main-scope"><summary data-testid="toggle-scope">About this prototype and its limits</summary>{PLATFORM_PREVIEW && <p>For an offline app download, use Open standalone app. It opens a fresh GitHub Pages session; your current contacts and keys are not transferred.</p>}<p>The 80-letter profile is an explicit choice for this generator, not a finalized Sharekeeper standard. The 3-of-N label is a layout setting, not proof that shares exist, and custody terms still need explicit agreement.</p><p>The updated sample uses an eight-hex-digit CRC32 field. A checksum is not cryptographic authentication; this generator leaves the ciphertext checksum blank.</p><p>HKDF produces computationally derived key material. This prototype does not claim information-theoretic one-time-pad security or a measured entropy contribution from gestures.</p><p>A downloaded PDF contains secret pads. Clearing this tab cannot erase downloads, print queues, screenshots, or all browser memory.</p></details>
        <footer className="panel-footer"><LockKeyhole size={14} aria-hidden="true" /><span>In-memory only. Refreshing or closing this tab loses the session.</span></footer>
      </main>
      <aside className="sheet-aside" aria-label="Your sheet profile">
        <p className="eyebrow">The document</p>
        <div className="paper-preview" aria-hidden="true">
          <div className="paper-title">SHAREKEEPER</div><div className="paper-subtitle">PRIVATE PAD WORKSHEET · 3 OF {count}</div><div className="paper-instructions" />
          {Array.from({ length: 5 }, (_, i) => <div className={`paper-share ${i >= count ? "unused" : ""}`} key={i}><div className="paper-share-header"><strong>SHARE {String(i + 1).padStart(2, "0")}</strong><span>{i >= count ? "LEFT BLANK" : ""}</span></div><div className="paper-share-content"><div className="paper-contact">{i < count && keepers[i].name ? keepers[i].name : <><i /><i /><i /></>}</div><div className="paper-grid">{Array.from({ length: 20 }, (_, j) => <i key={j} />)}</div></div><div className="paper-hash" /></div>)}
          <div className="paper-wallets"><span>ACCOUNTS / WALLET PASSPHRASES</span>{Array.from({ length: 7 }, (_, i) => <i key={i} />)}</div>
        </div>
        <p className="preview-caption">Layout preview · no secret keys shown</p>
        <dl className="document-facts"><div><dt>Sharekeepers</dt><dd>{count} independent contacts</dd></div><div><dt>Pad format</dt><dd>20 groups × 4 A–Z letters</dd></div><div><dt>Randomness</dt><dd>Browser RNG + your input</dd></div><div><dt>Output</dt><dd>One private A2 PDF</dd></div></dl>
      </aside>
    </div>
    <dialog ref={dialogRef} onCancel={(e) => { e.preventDefault(); setClearDialog(false); }} className="clear-dialog" aria-labelledby="clear-heading">
      <h2 id="clear-heading">Clear this session?</h2><p>Contacts, movement input, and generated pads will be removed from this app’s active state. Downloaded files and printed copies are not deleted, and browser-memory erasure cannot be guaranteed.</p>
      <div className="actions between"><button className="secondary-button" autoFocus onClick={() => setClearDialog(false)} data-testid="cancel-clear">Keep this session</button><button className="primary-button" onClick={clearSession} data-testid="confirm-clear">Clear and start over</button></div>
    </dialog>
  </>;
}

createRoot(document.getElementById("root")).render(<App />);
