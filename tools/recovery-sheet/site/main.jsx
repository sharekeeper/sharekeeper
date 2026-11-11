import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowRight, ArrowUpRight, Check, ChevronDown, ChevronRight, Download,
  ExternalLink, FileText, Info, KeyRound, LockKeyhole, Menu, Search,
  ShieldCheck, UsersRound, X,
} from "lucide-react";
import "@fontsource/source-sans-3/latin-400.css";
import "@fontsource/source-sans-3/latin-600.css";
import "@fontsource/source-sans-3/latin-700.css";
import logo from "../assets/logo-with-domain.webp";
import samplePreview from "./assets/recovery-sheet-preview.webp";
import providerData from "./providers.json";
import intakeConfig from "./intake-config.json";
import { publicNavigationUrls } from "../shared/public-urls.js";
import {
  SERVICES, approvedProviders, filterProviders, hostedFormUrl,
  emptyApplication, applicationErrors,
} from "./directory.js";
import "./style.css";
import CRC64Tool from "./CRC64Tool.jsx";

const REFS = {
  slip39: "https://github.com/satoshilabs/slips/blob/master/slip-0039.md",
  crc: "https://en.wikipedia.org/wiki/Cyclic_redundancy_check#Data_integrity",
  crc64: "https://reveng.sourceforge.io/crc-catalogue/17plus.htm",
  randomness: "https://developer.mozilla.org/en-US/docs/Web/API/Crypto/getRandomValues",
  sample: "./downloads/sharekeeper-recovery-sheet-sample.pdf",
};
const NAV = [
  ["/", "Home"], ["/standard", "Standard"], ["/learn", "Learn"],
  ["/tools", "Tools"], ["/providers", "Providers"],
];
const TITLES = {
  "/": "Recovery, with a plan",
  "/standard": "The working standard",
  "/learn": "Understand recovery custody",
  "/tools": "Recovery planning tools",
  "/providers": "Provider directory",
  "/apply": "Apply to the directory",
};
const PROVIDERS = approvedProviders(providerData);
const HOSTED_FORM = hostedFormUrl(intakeConfig.responderUrl);
const {
  platformPreview: PLATFORM_PREVIEW,
  standaloneRecoveryUrl: STANDALONE_RECOVERY_URL,
} = publicNavigationUrls(globalThis.location, globalThis.origin);

function RouteLink({ to, children, className = "", ...props }) {
  return <a href={`#${to}`} className={className} {...props}>{children}</a>;
}
function SourceLink({ href, children }) {
  return <a href={href} target="_blank" rel="noreferrer">{children}<ArrowUpRight aria-hidden="true" size={15} /></a>;
}
function PdfLink({ href, children, className = "text-link" }) {
  return <a className={className} href={href} target="_blank" rel="noreferrer">{children}<ArrowUpRight aria-hidden="true" size={18} /><span className="sr-only"> (PDF, opens in a new tab)</span></a>;
}
function SectionLink({ to, title, children, note }) {
  return <RouteLink to={to} className="section-link">
    <div><h3>{title}</h3><p>{children}</p></div>
    <span className="section-link-end">{note}<ArrowUpRight aria-hidden="true" size={22} /></span>
  </RouteLink>;
}
function DraftNotice({ compact = false }) {
  return <div className={`draft-notice ${compact ? "compact" : ""}`}>
    <Info size={18} aria-hidden="true" />
    <p><strong>Working draft.</strong> {compact ? "A standard in development, not a certification." : "The standard and sample sheet are design inputs. They are not an audited recovery procedure or a certification."}</p>
    {!compact && <RouteLink to="/standard">See open decisions<ArrowRight size={17} aria-hidden="true" /></RouteLink>}
  </div>;
}
function PageHeading({ title, children }) {
  return <div className="page-heading container">
    <h1>{title}</h1><p>{children}</p>
  </div>;
}

function App() {
  const getRoute = () => window.location.hash.slice(1).split("?")[0] || "/";
  const [route, setRoute] = useState(getRoute);
  const [menuOpen, setMenuOpen] = useState(false);
  const mainRef = useRef(null);
  const menuRef = useRef(null);
  const firstRender = useRef(true);

  useEffect(() => {
    const update = () => { setRoute(getRoute()); setMenuOpen(false); };
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  useEffect(() => {
    document.title = `${TITLES[route] || "Page not found"} | Sharekeeper.org`;
    if (!firstRender.current) {
      window.scrollTo({ top: 0, behavior: "instant" });
      mainRef.current?.focus({ preventScroll: true });
    }
    firstRender.current = false;
  }, [route]);
  useEffect(() => {
    const close = (event) => {
      if (event.key === "Escape" && menuOpen) {
        setMenuOpen(false);
        menuRef.current?.focus();
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [menuOpen]);

  const pages = {
    "/": <Home />, "/standard": <Standard />, "/learn": <Learn />,
    "/tools": <Tools />, "/providers": <Providers />, "/apply": <Apply />,
  };
  return <>
    <a className="skip-link" href="#main-content" onClick={(event) => {
      event.preventDefault(); mainRef.current?.focus(); mainRef.current?.scrollIntoView();
    }}>Skip to content</a>
    <header className="site-header">
      <div className="header-inner container">
        <RouteLink to="/" className="brand" aria-label="Sharekeeper.org home">
          <img src={logo} width="784" height="261" alt="Sharekeeper.org" />
        </RouteLink>
        <button ref={menuRef} className="menu-toggle" aria-expanded={menuOpen} aria-controls="main-navigation" onClick={() => setMenuOpen(!menuOpen)}>
          {menuOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}<span>{menuOpen ? "Close" : "Menu"}</span>
        </button>
        <nav id="main-navigation" className={menuOpen ? "main-nav open" : "main-nav"} aria-label="Main navigation">
          {NAV.map(([to, label]) => <RouteLink key={to} to={to} aria-current={route === to ? "page" : undefined}>{label}</RouteLink>)}
        </nav>
      </div>
    </header>
    <main id="main-content" ref={mainRef} tabIndex="-1" key={route}>{pages[route] || <NotFound />}</main>
    <Footer />
  </>;
}

function Home() {
  return <>
    <section className="home-hero container">
      <h1>Recovery,<br />with a plan.</h1>
      <div className="hero-bottom">
        <p>Sharekeeper.org is developing an open standard for distributed recovery custody, so a recovery plan does not depend on one place or person.</p>
        <div className="hero-actions">
          <RouteLink to="/tools" className="button" data-testid="home-access-tools">Access Tools<ArrowRight size={19} aria-hidden="true" /></RouteLink>
          <a href="./recovery.html" className="button" data-testid="home-generator">Generate Master Secret and Shares<ArrowRight size={19} aria-hidden="true" /></a>
          <a href="./recovery.html#recover" className="button" data-testid="home-validate-decrypt">Validate and Decrypt Shares<ArrowRight size={19} aria-hidden="true" /></a>
          <RouteLink to="/standard" className="button">Explore the standard<ArrowRight size={19} aria-hidden="true" /></RouteLink>
        </div>
      </div>
    </section>
    <div className="container"><DraftNotice /></div>
    <section className="custody-section container">
      <div className="section-intro">
        <h2>Separate custody.<br />Keep control.</h2>
        <div><p>The proposed model separates private recovery material held by the owner from encrypted share data held by independent providers.</p>
          <p>A useful recovery plan has to explain both: what stays private, and what happens when recovery is needed. <RouteLink to="/standard">Read the working standard</RouteLink> before preparing a sheet.</p>
        </div>
      </div>
      <CustodyDiagram />
    </section>
    <section className="threshold-section">
      <div className="container threshold-grid">
        <div><h2>Three of five.<br />Not all or nothing.</h2>
          <p>In the illustrative 3-of-5 custody model, the recovery threshold is three shares, with five shares distributed to different keepers.</p>
          <p>Threshold secret sharing is described in <SourceLink href={REFS.slip39}>SLIP-0039</SourceLink>. A complete recovery procedure still depends on the chosen implementation and the owner’s private material.</p>
          <RouteLink to="/learn" className="text-link">Understand the model<ArrowRight size={18} aria-hidden="true" /></RouteLink>
        </div>
        <ThresholdDemo />
      </div>
    </section>
    <section className="resource-section container">
      <div className="resource-title"><h2>From understanding<br />to preparation.</h2><p>Read the draft before using a tool. Keep a blank sample for reference, never a completed sheet in a public or shared space.</p></div>
      <div className="resource-list">
        <SectionLink to="/standard" title="Read the working standard" note="Standard">Scope, roles, and the decisions still open for review.</SectionLink>
        <SectionLink to="/learn" title="Learn before you set up" note="Education">Understand thresholds, private pads, custody, and release policies.</SectionLink>
        <SectionLink to="/tools" title="Prepare a recovery sheet" note="Tools">A local-only tool for private pads and keeper contact information.</SectionLink>
        <SectionLink to="/providers" title="Find reviewed providers" note="Directory">Only approved public listings. No providers are listed yet.</SectionLink>
      </div>
    </section>
    <section className="provider-invitation">
      <div className="container invitation-inner"><div><h2>Help build the directory.</h2><p>{HOSTED_FORM ? "Organizations can submit an application through the hosted Google Form for review." : "Organizations can prepare an application for review."} Private reviewer details are kept distinct from the fields proposed for publication.</p></div><RouteLink to="/apply" className="button button-light">{HOSTED_FORM ? "Submit an application" : "Provider applications"}<ArrowRight size={19} aria-hidden="true" /></RouteLink></div>
    </section>
  </>;
}

function CustodyDiagram() {
  return <figure className="custody-diagram" aria-label="Conceptual separation between owner-held private material and independent provider-held encrypted share data">
    <div className="custody-owner">
      <div className="diagram-heading"><KeyRound size={27} aria-hidden="true" /><h3>Held by the owner</h3></div>
      <p className="diagram-main">Private recovery sheet</p>
      <div className="paper-preview" aria-hidden="true">
        <div className="paper-header"><span>Recovery sheet</span><LockKeyhole size={17} /></div>
        <div className="paper-line"><span>Private pad</span><span>K</span></div>
        <div className="pad-blocks">{Array.from({ length: 20 }, (_, index) => <span key={index}>••••</span>)}</div>
        <div className="paper-footer">Private owner material</div>
      </div>
      <p>Private pads and recovery instructions stay on the owner’s side of the custody boundary.</p>
    </div>
    <div className="custody-boundary"><LockKeyhole size={22} aria-hidden="true" /><span>Kept separate</span><span className="boundary-caption">Conceptual model</span></div>
    <div className="custody-providers">
      <div className="diagram-heading"><UsersRound size={27} aria-hidden="true" /><h3>Held by providers</h3></div>
      <p className="diagram-main">Encrypted share data</p>
      <div className="keeper-set" aria-hidden="true">
        {["A", "B", "C", "D", "E"].map((name) => <div className="keeper-item" key={name}><LockKeyhole size={22} /><span>Keeper {name}</span><span>Encrypted data</span></div>)}
      </div>
      <p>Independent providers hold their assigned data under an agreed identity-verification and release policy.</p>
    </div>
    <figcaption>Draft model, not a finalized protocol. The Sharekeeper tool creates and encrypts real shares only on your own disconnected computer (an opt-in online dry run is for practice and creates no files), and never distributes them.</figcaption>
  </figure>;
}

function ThresholdDemo() {
  const [selected, setSelected] = useState([true, true, true, false, false]);
  const count = selected.filter(Boolean).length;
  return <div className="threshold-demo" data-ui>
    <div className="threshold-status"><span className="threshold-count">{count}<span> / 5</span></span><p>shares available<br /><strong>{count >= 3 ? "Threshold reached" : "Below the threshold"}</strong></p></div>
    <div className="threshold-controls" role="group" aria-label="Illustrate available shares">
      {selected.map((active, index) => <button key={index} className={`share-toggle ${active ? "selected" : ""}`} aria-pressed={active} aria-label={`Share ${String.fromCharCode(65 + index)} ${active ? "available" : "unavailable"}`} onClick={() => setSelected((values) => values.map((value, i) => i === index ? !value : value))}><span>{String.fromCharCode(65 + index)}</span>{active ? <Check size={19} aria-hidden="true" /> : <X size={17} aria-hidden="true" />}</button>)}
    </div>
    <p className="threshold-result" role="status">{count >= 3 ? `${count} available shares meet the illustrative 3-share threshold.` : `${3 - count} more ${3 - count === 1 ? "share is" : "shares are"} needed to meet the illustrative threshold.`}</p>
    <p className="small">Tap shares to explore the threshold. This is an explanation, not a recovery tool, and it handles no secret data.</p>
  </div>;
}

function Standard() {
  return <>
    <PageHeading title="The working standard">A shared vocabulary and a reviewable custody model. Open decisions remain visible instead of being silently treated as settled.</PageHeading>
    <div className="container"><DraftNotice compact /></div>
    <div className="reading-layout container">
      <aside className="reading-aside"><h2>In this draft</h2><a href="#/standard" onClick={(e) => jump(e, "scope")}>Purpose and scope</a><a href="#/standard" onClick={(e) => jump(e, "roles")}>Roles and boundaries</a><a href="#/standard" onClick={(e) => jump(e, "profile")}>Tool profile</a><a href="#/standard" onClick={(e) => jump(e, "decisions")}>Open decisions</a><a href="#/standard" onClick={(e) => jump(e, "artifacts")}>Reference sample</a></aside>
      <article className="reading-content">
        <section id="scope"><h2>Purpose and scope</h2><p>Sharekeeper.org is developing an open standard for distributing recovery custody across independent parties. The intended separation is between the owner’s private recovery material and provider-held encrypted share data.</p><p>The current materials are prototypes. They do not establish security certification, legal sufficiency, wallet compatibility, or a production-ready recovery procedure.</p></section>
        <section id="roles"><h2>Roles and boundaries</h2><dl className="definition-list">
          <div><dt>Owner</dt><dd>Maintains the private recovery sheet, private pads, and the instructions needed for their recovery plan. The owner must understand which material must never be shared with a provider.</dd></div>
          <div><dt>Sharekeeper / provider</dt><dd>Holds assigned encrypted share data and follows the agreed verification, notice, and release process. Provider custody is not ownership of the owner’s private pads.</dd></div>
          <div><dt>Recovery threshold</dt><dd>The number of shares required by the selected secret-sharing configuration. The site illustrates three of five. The Sharekeeper tool creates shares for the n of m you choose (for real use, offline only) and checks every qualifying set in memory.</dd></div>
          <div><dt>Directory reviewer</dt><dd>Reviews proposed provider listings before approved public fields can appear in the directory. A directory review is not a cryptographic audit or a guarantee of service.</dd></div>
        </dl><p>These role boundaries describe the project’s draft model. Exact procedures, encodings, and provider obligations still need a complete specification.</p></section>
        <section id="profile"><h2>The tool’s limited profile</h2><p>The Sharekeeper tool is one workflow, from a new seed to SLIP-39 shares to the recovery sheet and sharekeeper hand-outs, with an explicit 80-letter private-pad profile displayed as 20 groups of four letters. Real generation runs only when it is opened from a local file with no network; an opt-in online dry run is for practice and creates no files. It never accepts a seed phrase; an advanced option, off by default and unavailable in the dry run, accepts your own 128-bit SLIP-39 master secret as 32 hexadecimal digits instead of generating one.</p><ul className="plain-list">
          <li>Three to five keeper contact records, with a recovery threshold you choose (n of m, 2 ≤ n ≤ m − 1, so at least one sharekeeper can always be lost), shown on the sheet.</li><li>For each pad, a fresh 1600-bit browser random seed combined with a 1600-bit block derived from user movement or timing input (collected until a heuristic score reaches 1600).</li><li>A new 128-bit SLIP-39 seed, split into single-level n-of-m shares of 20 words; each share’s 80 four-letter prefixes are encrypted with its sharekeeper’s pad.</li><li>A private recovery-sheet PDF with 4 labeled copies (COPY 1 OF 4 to COPY 4 OF 4, one per page), holding contacts, pads, the first two cipher groups, each ciphertext CRC64 and, on wallet line 01 with the passphrase marked Empty, the seed’s first native SegWit address (BIP-84, m/84′/0′/0′/0/0), plus one hand-out PDF with a page per sharekeeper.</li><li>An optional dry run online, which must be opted into and creates no files.</li><li>No wallet passphrases or provider enrollment.</li>
        </ul><p>The browser random input is cryptographically strong pseudorandom output, not a claim of a true random source or a guaranteed entropy level; see <SourceLink href={REFS.randomness}>MDN’s getRandomValues documentation</SourceLink>. This tool’s profile is computational, not a claim of perfect secrecy.</p><RouteLink to="/tools" className="text-link">See tool boundaries<ArrowRight size={18} aria-hidden="true" /></RouteLink></section>
        <section id="decisions"><h2>Decisions still open</h2><p>The draft is not yet a complete normative specification. These choices need explicit review before any claim of protocol conformance.</p>
          <div className="decision-block"><h3>Pad profile and encoding</h3><p>The planning tool uses 80 letters, arranged in 20 four-letter groups. That is an explicit tool profile, not a finalized requirement for every implementation; the standard still needs to define the pad profile, encoding, and exact field roles.</p></div>
          <div className="decision-block"><h3>Agreed release policy</h3><p>The blank sample refers to seven days, but a universal release delay is not established by this website. A complete policy must specify identity verification, notice, remote and in-person release, contact changes, and the delays agreed by the owner and provider.</p></div>
          <div className="decision-block"><h3>Exact CRC64 specification</h3><p>The sheet uses CRC64, written as sixteen hexadecimal characters. The Sharekeeper tool uses one explicit choice, CRC-64/XZ (<SourceLink href={REFS.crc64}>CRC RevEng catalogue</SourceLink>) over the 80 ciphertext letters as uppercase ASCII with no spaces. That choice is not yet a finalized interoperable standard.</p><p>CRC64 can help detect accidental corruption; it is not an authenticity check, a security hash, or a digital signature, because anyone who edits the data can recompute it (<SourceLink href={REFS.crc}>cyclic redundancy check overview</SourceLink>). These limits remain important regardless of the eventual serialization choices.</p></div>
          <p>Read the <PdfLink href={REFS.sample} className="inline-pdf">updated blank sample</PdfLink> alongside these open choices. A prototype worksheet is not silently promoted to a final standard.</p>
        </section>
        <section id="artifacts"><h2>Read the reference sample</h2><div className="document-list">
          <a href={REFS.sample} target="_blank" rel="noreferrer"><FileText size={25} aria-hidden="true" /><div><h3>Recovery-sheet sample</h3><p>Blank US Letter reference with five keeper sections and seven account/passphrase rows. PDF.</p></div><ArrowUpRight aria-hidden="true" size={21} /></a>
        </div><p>Use only blank samples for public discussion. Completed sheets, seed phrases, private pads, live shares, and wallet passphrases do not belong in an application, issue, or public repository.</p></section>
      </article>
    </div>
  </>;
}

function jump(event, id) {
  event.preventDefault();
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.getElementById(id)?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
}

function Learn() {
  return <>
    <PageHeading title="Understand recovery custody">Start with the roles, the private material, and the recovery threshold. A sheet is only useful when the people who rely on it understand the plan.</PageHeading>
    <section className="learn-opening container"><div><h2>What does “3 of 5” mean?</h2><p>A threshold describes how many shares are needed, not how many people are allowed to know an entire secret. In an illustrative three-of-five arrangement, any qualifying set of three shares reaches the configured threshold.</p><p>SLIP-0039 describes threshold secret sharing encoded in mnemonic words; it does not make the rest of a custody or release process automatic (<SourceLink href={REFS.slip39}>SLIP-0039 specification</SourceLink>).</p></div><ThresholdDemo /></section>
    <section className="learn-glossary container"><div className="section-intro"><h2>Know what you hold.</h2><p>Different kinds of recovery material have different jobs. Calling everything a “backup” makes the most important boundaries harder to see.</p></div><dl className="glossary">
      <div><dt>Share</dt><dd>A piece of a configured secret-sharing scheme. Enough valid shares are required to meet its threshold (<SourceLink href={REFS.slip39}>SLIP-0039</SourceLink>).</dd></div>
      <div><dt>Private pad</dt><dd>Owner-held material in the proposed model. The Sharekeeper tool creates one private K pad per sharekeeper and uses it to encrypt that sharekeeper’s share. <PdfLink href={REFS.sample} className="inline-pdf">View the sheet</PdfLink></dd></div>
      <div><dt>Encrypted share data</dt><dd>Provider-held data in the draft custody model. Its exact encoding and encryption procedure still need to be fully specified. The Sharekeeper tool produces it offline under its own explicit, unaudited profile.</dd></div>
      <div><dt>CRC64</dt><dd>A 64-bit checksum shown as sixteen hexadecimal characters on the sheet; the tool uses CRC-64/XZ (<SourceLink href={REFS.crc64}>CRC RevEng catalogue</SourceLink>). It is an accidental-corruption check, not proof of authenticity or a security hash (<SourceLink href={REFS.crc}>cyclic redundancy check overview</SourceLink>).</dd></div>
      <div><dt>Release policy</dt><dd>The agreed identity-verification, notice, delay, and delivery process. The standard still needs a complete policy covering release paths and contact changes; a universal delay is not established here.</dd></div>
    </dl></section>
    <section className="preparation-band"><div className="container preparation-grid"><h2>Before you prepare<br />a recovery sheet.</h2><ol className="preparation-list">
      <li><strong>Understand the limits.</strong><p>The tool checks its own shares recombine in memory, but it cannot prove a wallet will restore them, that a custody plan is sound, or that a recovery will succeed.</p></li>
      <li><strong>Agree on the real process.</strong><p>Confirm each keeper’s role, verification requirements, contact-change process, and release timing. Do not assume draft educational material is a service agreement.</p></li>
      <li><strong>Choose a private environment.</strong><p>Do not enter secrets into this site. Treat the tool’s generated pads and completed PDF as private recovery material, not something to email to a directory reviewer.</p></li>
      <li><strong>Plan a safe rehearsal.</strong><p>Use non-secret test material and the relevant wallet or implementation documentation. The site does not perform, validate, or guarantee a recovery.</p></li>
    </ol></div></section>
    <section className="faq-section container"><div><h2>Common questions</h2><p>Practical answers to the boundaries that are easy to miss.</p></div><div className="faq-list">
      <details><summary>Does this site need my seed phrase?<ChevronDown size={20} aria-hidden="true" /></summary><p>No. Do not enter or upload a seed phrase, live share, private pad, wallet passphrase, or completed recovery sheet anywhere in the public portal or provider application. There is no seed-phrase input. For real use, the Sharekeeper tool generates a new seed on your own disconnected computer; it never asks you to type in an existing one.</p></details>
      <details><summary>Is a four-letter group a complete word?<ChevronDown size={20} aria-hidden="true" /></summary><p>SLIP-0039’s wordlist has unique four-letter prefixes, but that does not make any arbitrary four-letter group a valid share (<SourceLink href={REFS.slip39}>SLIP-0039 wordlist rules</SourceLink>). The tool’s 20 four-letter pad groups are a separate private-pad format, not a generated mnemonic share.</p></details>
      <details><summary>Does CRC64 prove a provider is honest?<ChevronDown size={20} aria-hidden="true" /></summary><p>No. A CRC, including CRC64, offers no authentication and is unsuitable for digital signatures (<SourceLink href={REFS.crc}>cyclic redundancy check overview</SourceLink>). A matching checksum is not evidence of who produced data or whether it was maliciously changed.</p></details>
      <details><summary>Is the browser tool a one-time-pad system?<ChevronDown size={20} aria-hidden="true" /></summary><p>No. The tool encrypts each share’s 80 four-letter prefixes with a pad, C = (P + K) mod 26, but it is an unaudited prototype, not a proven one-time-pad system. It derives each private pad by combining a 1600-bit browser random seed with a 1600-bit-long block derived from user interaction (XOR, then unbiased letter selection). Browser randomness is pseudorandom, so this is not a claim of information-theoretic perfect secrecy.</p><p>Browser randomness is described as cryptographically strong pseudorandom output, without a mandated minimum entropy level (<SourceLink href={REFS.randomness}>MDN getRandomValues</SourceLink>).</p></details>
      <details><summary>Are directory listings a certification?<ChevronDown size={20} aria-hidden="true" /></summary><p>No. Only approved public listings will appear, but directory review is not a security audit, certification, legal endorsement, or guarantee of availability. The directory currently has no approved listings.</p></details>
      <details><summary>Which release delay applies?<ChevronDown size={20} aria-hidden="true" /></summary><p>No single final release delay is established. The <PdfLink href={REFS.sample} className="inline-pdf">blank sample</PdfLink> refers to seven days, but it is a prototype, not a universal service policy. Agree explicitly on notice, identity checks, release paths, and contact-change delays before relying on a provider.</p></details>
    </div></section>
  </>;
}

function Tools() {
  return <>
    <PageHeading title="Recovery planning tools">Prepare deliberately. These utilities support the draft custody model without ever asking you to enter a seed phrase.</PageHeading>
    <div className="tools-grid container">
    <section className="featured-tool" aria-labelledby="recovery-tool-heading">
      <div className="tool-copy"><span className="crc-kicker"><LockKeyhole size={18} aria-hidden="true" />One workflow · offline</span><h2 id="recovery-tool-heading">Seed, shares and recovery sheet</h2><p>One tool takes you from a new wallet seed to SLIP-39 shares, your recovery sheet and the sharekeeper hand-outs. Real generation runs only from the downloaded file with the network disconnected; everything stays in that tab’s memory.</p><ul className="tool-facts">
        <li><Check size={18} aria-hidden="true" />A new 128-bit seed: browser CSPRNG combined with your mouse or touch input. Optional and off by default: your own 128-bit SLIP-39 master secret, entered as 32 hex digits</li>
        <li><Check size={18} aria-hidden="true" />Single-level SLIP-39 shares, n of m (m from 3 to 5, n from 2 to m − 1), checked by recombining every qualifying set</li>
        <li><Check size={18} aria-hidden="true" />Each share encrypted with its sharekeeper’s pad, C = (P + K) mod 26</li>
        <li><Check size={18} aria-hidden="true" />Recovery sheet: one PDF, 4 labeled copies, with first cipher groups, ciphertext CRC64 and the wallet’s first bc1q address</li>
        <li><Check size={18} aria-hidden="true" />Provider information pack: one PDF, two pages per provider, with only their ciphertext and CRC64, how to handle a release request, and a record of agreed terms to fill in</li>
        <li><Check size={18} aria-hidden="true" />Validate and decrypt: check each ciphertext you receive against your sheet, decrypt it with its pad, verify the SLIP-39 share, and confirm the wallet by its first address</li>
      </ul>
      <div className="tool-actions">{PLATFORM_PREVIEW
        ? <a href={STANDALONE_RECOVERY_URL} className="button" target="_blank" rel="noopener noreferrer">Open the standalone tool<ExternalLink size={19} aria-hidden="true" /></a>
        : <a href="./sharekeeper-offline.html" download="sharekeeper-offline.html" className="button" data-testid="tools-download">Download the tool<Download size={19} aria-hidden="true" /></a>}
        <a href="./recovery.html" className="text-link" data-testid="tools-open">Open it here: steps and optional dry run<ArrowRight size={18} aria-hidden="true" /></a>
        <a href="./recovery.html#recover" className="text-link" data-testid="tools-open-recover">Validate and decrypt shares, with a practice example<ArrowRight size={18} aria-hidden="true" /></a></div>
      <p className="small">The same downloaded file has both modes: create, and validate and decrypt. Real pads and ciphertext can be entered only offline from the file; online, the decrypt mode offers a read-only practice example. The dry run works online, must be opted into, creates no files, and is for practice only. Unaudited prototype: test recovery with a small amount first.</p></div>
      <figure className="tool-sheet-preview"><a href={REFS.sample} target="_blank" rel="noreferrer" aria-label="Open the updated blank recovery-sheet sample PDF"><img src={samplePreview} alt="The blank Sharekeeper recovery sheet with five keeper sections, twenty four-letter entry groups per section, sixteen-hex-digit CRC64 fields, and seven account/passphrase rows." width="1160" height="1500" /></a><figcaption>Blank sample with CRC64 fields. <PdfLink href={REFS.sample} className="inline-pdf">Open the full PDF</PdfLink></figcaption></figure>
    </section>
    <CRC64Tool />
    </div>
    <section className="tool-boundaries container"><div><h2>Know its boundaries.</h2><p>A useful planning tool must be specific about what it does not do.</p></div><div className="boundary-copy"><h3>What stays outside the Sharekeeper tool</h3><p>The tool does not import a seed phrase (BIP-39 or SLIP-39 words), create wallet passphrases, enroll providers, or deliver hand-outs. Its validate-and-decrypt mode checks and decrypts shares and confirms the first address, but it does not restore a wallet, show the seed, or move funds; you enter the share words into a wallet that supports SLIP-39 recovery. The separate CRC64 calculator below it checks exact input bytes; neither tool claims conformance to a finalized Sharekeeper standard.</p><p>The sample’s recovery instructions are prototype material, not a complete or audited recovery procedure. The tool does not perform wallet operations, sign or broadcast transactions, destroy material, or wipe devices.</p><h3>How private pads are derived</h3><p>For each pad, 200 fresh bytes (1600 bits) from the browser CSPRNG are combined by XOR with a 1600-bit block derived, with SHA-512, from mouse, touch, or timing input collected until a heuristic score reaches 1600 (at most 2 points per movement, from variation in its position changes). The score is an estimate, not measured entropy, and predictable motion can still score; the input adds protection only to the extent it is genuinely unpredictable. Browser CSPRNG output is cryptographically strong pseudorandom output, not a true-random or perfect-secrecy guarantee (<SourceLink href={REFS.randomness}>MDN getRandomValues</SourceLink>).</p><h3>Keep the output private</h3><p>A generated sheet contains private recovery material. Do not upload it to a provider application, public issue, repository, chat, or shared folder. The blank reference PDF below is the public artifact.</p></div></section>
    <section className="downloads-section"><div className="container"><div className="section-intro"><h2>Reference downloads</h2><p>Read the source materials alongside the standard’s open decisions. Blank prototypes are references, not evidence of an audited protocol.</p></div><div className="download-rows">
      <a href={REFS.sample} target="_blank" rel="noreferrer"><FileText size={29} aria-hidden="true" /><div><h3>Updated recovery-sheet sample</h3><p>Blank US Letter PDF based on the latest supplied sample, with 16-digit CRC64 fields and seven account/passphrase rows.</p></div><span>PDF<Download size={21} aria-hidden="true" /></span></a>
      {PLATFORM_PREVIEW ? <a href={STANDALONE_RECOVERY_URL} target="_blank" rel="noopener noreferrer"><LockKeyhole size={29} aria-hidden="true" /><div><h3>Open standalone recovery tool</h3><p>Starts a fresh session outside this preview. Use the standalone tool to download the offline HTML; preview sessions and entered data do not transfer.</p></div><span>Open<ExternalLink size={21} aria-hidden="true" /></span></a> : <a href="./sharekeeper-offline.html" download="sharekeeper-offline.html"><LockKeyhole size={29} aria-hidden="true" /><div><h3>Sharekeeper tool (offline HTML)</h3><p>One file: seed, shares, recovery sheet and hand-outs. Generates only when opened from your computer with no network.</p></div><span>HTML<Download size={21} aria-hidden="true" /></span></a>}
    </div><div className="download-note"><Info size={20} aria-hidden="true" /><p>The pad profile, exact CRC64 serialization, and agreed release policy remain specification choices. <RouteLink to="/standard">Review the open decisions</RouteLink> before relying on the sample.</p></div></div></section>
  </>;
}

function Providers() {
  const [query, setQuery] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [service, setService] = useState("");
  const jurisdictions = [...new Set(PROVIDERS.map((entry) => entry.jurisdiction))].sort();
  const filtered = filterProviders(PROVIDERS, { query, jurisdiction, service });
  const hasFilters = Boolean(query || jurisdiction || service);
  const clear = () => { setQuery(""); setJurisdiction(""); setService(""); };
  return <>
    <PageHeading title="Provider directory">A public directory of reviewed, approved listings. Inclusion is not a security certification, legal endorsement, or guarantee of service.</PageHeading>
    <div className="provider-apply container">
      <RouteLink to="/apply" className="button">Submit a provider<ArrowUpRight size={18} aria-hidden="true" /></RouteLink>
      <p>Represent an organization? Proposed listings are reviewed before publication.</p>
    </div>
    <section className="provider-audience container" aria-labelledby="provider-audience-heading">
      <h2 id="provider-audience-heading">Who the directory is for</h2>
      <p>Organizations and professionals who could act as independent sharekeepers, including:</p>
      <ol className="audience-list">
        <li>Information and software-escrow providers.</li>
        <li>Trust companies and corporate fiduciaries.</li>
        <li>Licensed professional fiduciaries.</li>
        <li>Secure records-storage and vault providers.</li>
        <li>Digital-asset security and recovery specialists.</li>
      </ol>
    </section>
    <section className="directory-section container" aria-label="Search the provider directory">
      <form className="directory-filters" onSubmit={(event) => event.preventDefault()} role="search">
        <div className="search-field"><label htmlFor="provider-search">Search providers</label><div><Search size={20} aria-hidden="true" /><input id="provider-search" type="search" placeholder="Name, location, or service" value={query} onChange={(event) => setQuery(event.target.value)} /></div></div>
        <div><label htmlFor="jurisdiction-filter">Jurisdiction</label><select id="jurisdiction-filter" value={jurisdiction} onChange={(event) => setJurisdiction(event.target.value)}><option value="">All jurisdictions</option>{jurisdictions.map((value) => <option key={value}>{value}</option>)}</select></div>
        <div><label htmlFor="service-filter">Service</label><select id="service-filter" value={service} onChange={(event) => setService(event.target.value)}><option value="">All services</option>{SERVICES.map((value) => <option key={value}>{value}</option>)}</select></div>
        <button type="button" className="filter-clear" onClick={clear} disabled={!hasFilters}>Clear filters</button>
      </form>
      <div className="directory-count" role="status"><span>{filtered.length} approved {filtered.length === 1 ? "provider" : "providers"}{hasFilters ? " matching your filters" : ""}</span><span>Reviewed listings only</span></div>
      {filtered.length ? <div className="provider-results">{filtered.map((provider) => <ProviderListing key={provider.id} provider={provider} />)}</div> : <div className="directory-empty">
        <UsersRound size={42} strokeWidth={1.4} aria-hidden="true" />
        <h2>{hasFilters ? "No matching providers." : "The directory starts with review."}</h2>
        <p>{hasFilters ? "There are no approved listings matching these filters. The directory currently has no approved providers; changing filters cannot reveal unreviewed applications." : "No providers have been approved for publication yet. We will not fill this directory with unverified names, sample businesses, or pending applications."}</p>
        {hasFilters && <button type="button" className="button" onClick={clear}>Clear filters<ArrowRight size={18} aria-hidden="true" /></button>}
      </div>}
    </section>
    <section className="directory-principles container"><div><h2>Public listings.<br />Private review.</h2><p>The directory is not an application feed. Proposed organizations do not become listings automatically.</p><p>It is a business directory, not a client-to-keeper map. It does not collect client accounts, client recovery contacts, or share locations.</p></div><div className="review-principles"><div><ShieldCheck size={25} aria-hidden="true" /><div><h3>Approval before publication</h3><p>Only records marked approved can appear. Business details are published from an explicit public-field allowlist.</p></div></div><div><LockKeyhole size={25} aria-hidden="true" /><div><h3>Reviewer details stay separate</h3><p>Private contact names, private email addresses, and review notes are not directory fields. No identity documents or recovery secrets are requested.</p></div></div></div></section>
  </>;
}

function ProviderListing({ provider }) {
  return <article className="provider-listing"><div className="provider-listing-head"><h2>{provider.businessName}</h2><a href={provider.website} target="_blank" rel="noreferrer">Visit website<ArrowUpRight size={18} aria-hidden="true" /></a></div><p>{provider.description}</p><dl><div><dt>Jurisdiction</dt><dd>{provider.jurisdiction}</dd></div><div><dt>Service area</dt><dd>{provider.serviceArea || "Not specified"}</dd></div><div><dt>Services</dt><dd>{provider.services.join(", ") || "Not specified"}</dd></div>{provider.address && <div><dt>Public address</dt><dd>{provider.address}</dd></div>}{provider.publicEmail && <div><dt>Public email</dt><dd><a href={`mailto:${provider.publicEmail}`}>{provider.publicEmail}</a></dd></div>}{provider.publicPhone && <div><dt>Public phone</dt><dd>{provider.publicPhone}</dd></div>}</dl>{provider.reviewedOn && <p className="small">Listing reviewed {provider.reviewedOn}. Directory inclusion is not certification.</p>}</article>;
}

function Apply() {
  const [draft, setDraft] = useState(emptyApplication);
  const [errors, setErrors] = useState({});
  const [review, setReview] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const errorRef = useRef(null);
  const reviewRef = useRef(null);
  const [embed, setEmbed] = useState(false);
  const [showDraft, setShowDraft] = useState(!HOSTED_FORM);
  const [resetPrompt, setResetPrompt] = useState(false);
  const dialogRef = useRef(null);
  useEffect(() => {
    if (resetPrompt && !dialogRef.current?.open) dialogRef.current?.showModal();
    if (!resetPrompt && dialogRef.current?.open) dialogRef.current?.close();
  }, [resetPrompt]);
  function update(section, field, value) {
    setDraft((old) => ({ ...old, [section]: { ...old[section], [field]: value } }));
    setErrors((old) => ({ ...old, [field]: "" }));
    setDownloaded(false);
  }
  function submitForReview(event) {
    event.preventDefault();
    const next = applicationErrors(draft);
    setErrors(next);
    if (Object.keys(next).length) {
      setTimeout(() => errorRef.current?.focus(), 0);
      return;
    }
    setReview(true);
    setTimeout(() => { reviewRef.current?.focus(); reviewRef.current?.scrollIntoView({ block: "start" }); }, 0);
  }
  function downloadDraft() {
    const blob = new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = "sharekeeper-provider-application-NOT-SUBMITTED.json";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setDownloaded(true);
  }
  function reset() { setDraft(emptyApplication()); setErrors({}); setReview(false); setDownloaded(false); setResetPrompt(false); }
  return <>
    <PageHeading title="Apply to the directory">{HOSTED_FORM ? "Apply through Google Forms. Public listing fields and private reviewer details stay separate; review and approval are required." : "Prepare public listing details and separate private reviewer contact information. An application is not a public listing, an approval, or a certification."}</PageHeading>
    <section className="application-container container">
      {!HOSTED_FORM && <div className="intake-banner" role="status"><Info size={23} aria-hidden="true" /><div><h2>Application intake is not connected.</h2><p>You can prepare and download a local draft below, but it will not be submitted. No application data is saved automatically or sent to a reviewer.</p></div></div>}
      {HOSTED_FORM && <div className="hosted-form-panel"><h2>Submit an application</h2><p>Google hosts this form. Opening or embedding it connects to Google; review its privacy notices before entering information.</p><div className="application-actions"><a className="button" href={HOSTED_FORM} target="_blank" rel="noreferrer">Open application form<ExternalLink size={18} aria-hidden="true" /></a><button className="text-link" type="button" aria-expanded={embed} aria-controls="hosted-application-embed" onClick={() => setEmbed(!embed)}>{embed ? "Hide embedded form" : "Show embedded form"}<ChevronDown size={18} aria-hidden="true" /></button></div><div className="hosted-form-notices"><p>Never include recovery secrets, identity documents, or client-to-keeper mappings. Complete the business and private reviewer details, with explicit publishing consent and confirmation of your authority to apply; incomplete or unconsented applications cannot become approved listings.</p><p className="small">Use Google’s own confirmation to verify submission. This portal does not detect or announce a submission, and no application is automatically published. Applying is not an approval or certification.</p></div>{embed && <iframe id="hosted-application-embed" title="Private provider application, hosted by Google Forms" src={`${HOSTED_FORM}?embedded=true`} loading="lazy" referrerPolicy="no-referrer" />}</div>}
      {HOSTED_FORM && <section className="optional-draft-disclosure"><h2><button type="button" aria-expanded={showDraft} aria-controls="optional-local-draft" onClick={() => setShowDraft(!showDraft)}>{showDraft ? "Hide the optional local draft" : "Prepare an optional local draft"}<ChevronDown className={showDraft ? "disclosure-open" : ""} size={22} aria-hidden="true" /></button></h2><p>The local draft is a separate planning aid, not a second way to submit. Its fields and downloaded JSON do not transfer to Google; use the hosted form above to apply.</p></section>}
      <div id="optional-local-draft" hidden={!showDraft}><div className="application-layout">
        <aside className="application-aside"><h2>A local draft</h2><ol className="application-progress"><li className={!review ? "current" : ""}>Prepare details</li><li className={review ? "current" : ""}>Review and download</li></ol><div className="privacy-reminder"><LockKeyhole size={25} aria-hidden="true" /><h3>No recovery material</h3><p>Never enter seed phrases, live shares, private pads, wallet passphrases, or identity-document numbers. There are no file uploads.</p></div><p className="small">Fields stay in this page’s memory only. Navigating away or reloading discards your draft unless you download it.</p></aside>
        <div className="application-main">
          {!review ? <form noValidate onSubmit={submitForReview}>
            {Object.values(errors).some(Boolean) && <div className="form-errors" role="alert" tabIndex="-1" ref={errorRef}><h2>Check your draft</h2><p>Complete the highlighted fields and confirmations before reviewing. Nothing has been submitted.</p></div>}
            <fieldset className="application-fieldset"><legend>Proposed public listing</legend><p className="fieldset-intro">Only these fields may be published, and only after review and approval. Fields marked “required” are needed to prepare a complete draft.</p><div className="field-grid">
              <Field label="Public business name" field="businessName" section="publicListing" draft={draft} update={update} errors={errors} required maxLength={160} />
              <Field label="Website" field="website" section="publicListing" draft={draft} update={update} errors={errors} required type="url" placeholder="https://your-organization.org" maxLength={500} />
              <Field label="Jurisdiction" field="jurisdiction" section="publicListing" draft={draft} update={update} errors={errors} required hint="Where your organization is legally based." maxLength={160} />
              <Field label="Service area" field="serviceArea" section="publicListing" draft={draft} update={update} errors={errors} required hint="Where the proposed services would be available." maxLength={300} />
              <Field label="Public business address" field="address" section="publicListing" draft={draft} update={update} errors={errors} hint="Optional. Enter only an address you authorize for publication." maxLength={400} wide />
              <Field label="Public email" field="publicEmail" section="publicListing" draft={draft} update={update} errors={errors} type="email" hint="Optional. This address may appear in the directory." maxLength={254} />
              <Field label="Public phone" field="publicPhone" section="publicListing" draft={draft} update={update} errors={errors} type="tel" hint="Optional. This number may appear in the directory." maxLength={80} />
            </div>
            <fieldset className="service-checkboxes" aria-describedby="services-hint"><legend>Proposed services <span>(required)</span></legend><p id="services-hint">Select the services you want reviewed. Selecting one is not an approval to offer it.</p>{SERVICES.map((service) => <label key={service}><input type="checkbox" checked={draft.publicListing.services.includes(service)} onChange={(event) => update("publicListing", "services", event.target.checked ? [...draft.publicListing.services, service] : draft.publicListing.services.filter((value) => value !== service))} /><span>{service}</span></label>)}{errors.services && <p className="field-error">{errors.services}</p>}</fieldset>
            <Field label="Public description" field="description" section="publicListing" draft={draft} update={update} errors={errors} required textarea maxLength={1200} hint="Describe the organization and proposed services. Do not include private reviewer details or recovery material." />
            </fieldset>
            <fieldset className="application-fieldset private-fieldset"><legend>Private reviewer contact</legend><p className="fieldset-intro">Separate from the proposed listing. These details are for application review only and are not public directory fields.</p><div className="field-grid"><Field label="Reviewer contact name" field="contactName" section="privateReview" draft={draft} update={update} errors={errors} required maxLength={160} /><Field label="Private contact email" field="contactEmail" section="privateReview" draft={draft} update={update} errors={errors} type="email" required hint="For private reviewer correspondence, not publication." maxLength={254} /></div><Field label="Private review notes" field="reviewNotes" section="privateReview" draft={draft} update={update} errors={errors} textarea maxLength={2000} hint="Optional context for reviewers. No identity documents, ID numbers, or recovery secrets." /></fieldset>
            <fieldset className="consent-fieldset"><legend>Confirmations</legend>
              <label><input type="checkbox" checked={draft.consent.publishApprovedPublicFields} onChange={(event) => update("consent", "publishApprovedPublicFields", event.target.checked)} /><span>I consent to publication of the proposed public listing fields only if the listing is reviewed and approved. Private reviewer contact information and notes are not for publication.</span></label>{errors.publishApprovedPublicFields && <p className="field-error">{errors.publishApprovedPublicFields}</p>}
              <label><input type="checkbox" checked={draft.consent.authorizedRepresentative} onChange={(event) => update("consent", "authorizedRepresentative", event.target.checked)} /><span>I am authorized to represent this organization and propose these details for the directory.</span></label>{errors.authorizedRepresentative && <p className="field-error">{errors.authorizedRepresentative}</p>}
            </fieldset>
            <div className="application-actions"><button className="button" type="submit">Review local draft<ArrowRight size={18} aria-hidden="true" /></button><button className="text-link" type="button" onClick={() => setResetPrompt(true)}>Clear draft</button></div><p className="small form-status">Reviewing a draft does not submit an application.</p>
          </form> : <div className="draft-review" ref={reviewRef} tabIndex="-1">
            <h2>Review your local draft</h2><p className="not-submitted">Not submitted. Not saved automatically.</p><p>Confirm which details are proposed for publication and which are private. The JSON download contains both sections, so treat it as private application information.</p><ApplicationReview draft={draft} />
            <div className="application-actions"><button className="button" type="button" onClick={downloadDraft}>Download draft JSON<Download size={18} aria-hidden="true" /></button><button className="text-link" type="button" onClick={() => { setReview(false); setDownloaded(false); }}>Edit details</button></div>
            {downloaded && <p className="download-confirmation" role="status"><Check size={18} aria-hidden="true" />Draft download requested. It has not been submitted or sent to a reviewer.</p>}
            {!HOSTED_FORM && <div className="submission-unavailable"><button type="button" className="button" disabled>Submit application</button><p>Submission is unavailable until a verified intake destination is connected. Downloading your draft does not reserve a listing or create a pending application.</p></div>}
            {HOSTED_FORM && <p>To submit, <a href={HOSTED_FORM} target="_blank" rel="noreferrer">open the hosted Google Form</a> and enter the information there. The downloaded draft is not automatically attached.</p>}
          </div>}
        </div>
      </div></div>
    </section>
    <dialog className="reset-dialog" ref={dialogRef} onCancel={() => setResetPrompt(false)}><h2>Clear this draft?</h2><p>This removes the fields from this page. It does not delete files you already downloaded.</p><div className="application-actions"><button type="button" className="button" onClick={reset}>Clear draft</button><button type="button" className="text-link" onClick={() => setResetPrompt(false)}>Keep editing</button></div></dialog>
  </>;
}

function Field({ label, field, section, draft, update, errors, required = false, textarea = false, hint = "", wide = false, maxLength, ...props }) {
  const id = `application-${field}`;
  const control = {
    id, name: `${section}.${field}`, value: draft[section][field],
    onChange: (event) => update(section, field, event.target.value),
    required, "aria-invalid": Boolean(errors[field]),
    "aria-describedby": [(hint || maxLength) && `${id}-hint`, errors[field] && `${id}-error`].filter(Boolean).join(" ") || undefined,
    ...props,
  };
  return <div className={`field ${wide ? "field-wide" : ""}`}><label htmlFor={id}>{label}<span>{required ? " (required)" : " (optional)"}</span></label>{textarea ? <textarea {...control} rows={4} /> : <input {...control} type={props.type || "text"} />}{(hint || maxLength) && <p className="field-hint" id={`${id}-hint`}>{hint}{hint && maxLength ? " " : ""}{maxLength ? `${draft[section][field].length} / ${maxLength} characters. Input is not shortened automatically.` : ""}</p>}{errors[field] && <p className="field-error" id={`${id}-error`}>{errors[field]}</p>}</div>;
}

function ApplicationReview({ draft }) {
  const labels = {
    businessName: "Business name", website: "Website", jurisdiction: "Jurisdiction", serviceArea: "Service area",
    address: "Public address", publicEmail: "Public email", publicPhone: "Public phone", services: "Proposed services",
    description: "Public description", contactName: "Reviewer contact name", contactEmail: "Private contact email", reviewNotes: "Private review notes",
  };
  return <><section className="review-public"><h3>Proposed public fields</h3><p>Publication requires separate review and approval.</p><dl>{Object.entries(draft.publicListing).map(([key, value]) => <div key={key}><dt>{labels[key]}</dt><dd>{Array.isArray(value) ? value.join(", ") : value || "Not provided"}</dd></div>)}</dl></section><section className="review-private"><h3>Private review fields</h3><p>Not public directory information.</p><dl>{Object.entries(draft.privateReview).map(([key, value]) => <div key={key}><dt>{labels[key]}</dt><dd>{value || "Not provided"}</dd></div>)}</dl></section><div className="review-consent"><p><Check size={17} aria-hidden="true" />Publishing consent confirmed for approved public fields only.</p><p><Check size={17} aria-hidden="true" />Authority to represent the organization confirmed.</p></div></>;
}

function NotFound() {
  return <section className="container not-found"><h1>Page not found.</h1><p>This route is not part of the Sharekeeper.org portal. Return to the homepage to explore the standard, learning material, and planning tools.</p><RouteLink to="/" className="button">Return home<ArrowRight size={18} aria-hidden="true" /></RouteLink></section>;
}
function Footer() {
  return <footer className="site-footer"><div className="container"><div className="footer-top"><RouteLink to="/" className="footer-name">Sharekeeper.org</RouteLink><p>Recovery custody,<br />in the open.</p></div><div className="footer-main"><p>An open standard in development.<br />Keep private recovery material private.</p><nav aria-label="Footer navigation"><RouteLink to="/standard">The standard</RouteLink><RouteLink to="/learn">Learning material</RouteLink><RouteLink to="/tools">Planning tools</RouteLink><RouteLink to="/providers">Provider directory</RouteLink><RouteLink to="/apply">Provider applications</RouteLink></nav><div className="footer-documents"><PdfLink href={REFS.sample} className="">Blank recovery sheet</PdfLink><a href="./recovery.html">Sharekeeper tool<ArrowUpRight size={16} aria-hidden="true" /></a></div></div><div className="footer-bottom"><span>Draft materials. No certification or recovery guarantee.</span><span>No analytics. No secret inputs.</span></div></div></footer>;
}

createRoot(document.getElementById("root")).render(<App />);
