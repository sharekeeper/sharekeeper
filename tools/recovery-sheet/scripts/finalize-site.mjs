import { readFile, writeFile, mkdir, copyFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { inlineBrowserIcons } from "./inline-branding.mjs";

const dist = new URL("../dist/", import.meta.url);
let html = await readFile(new URL("site-build/index.html", dist), "utf8");
html = await inlineBrowserIcons(html);
const notices = await readFile(new URL("../assets/third-party-notices.txt", import.meta.url), "utf8");
const escaped = notices.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
html = html.replace("</body>", `<template id="third-party-notices">${escaped}</template></body>`);
const hashes = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .map((match) => `'sha256-${createHash("sha256").update(match[1]).digest("base64")}'`);
if (!hashes.length) throw new Error("Expected a self-contained website script.");
const policy = [
  "default-src 'none'",
  `script-src ${hashes.join(" ")}`,
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "font-src data:",
  "connect-src 'none'",
  "frame-src https://docs.google.com https://forms.google.com",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");
html = html.replace("<head>", `<head><meta http-equiv="Content-Security-Policy" content="${policy}">`);
await writeFile(new URL("index.html", dist), html);
await mkdir(new URL("downloads/", dist), { recursive: true });
await copyFile(
  new URL("../../../templates/recovery/sharekeeper-recovery-sheet-sample-crc64.pdf", import.meta.url),
  new URL("downloads/sharekeeper-recovery-sheet-sample.pdf", dist),
);
const recovery = await readFile(new URL("recovery.html", dist));
const offline = await readFile(new URL("sharekeeper-offline.html", dist));
if (!recovery.equals(offline)) throw new Error("Offline recovery copy must match the pristine recovery build.");
const legacyShamir = await readFile(new URL("sharekeeper-shamir-offline.html", dist));
if (!recovery.equals(legacyShamir)) throw new Error("The legacy Shamir download must be the same unified build.");
const recoveryHtml = recovery.toString("utf8");
if (!recoveryHtml.includes("connect-src 'none'") || !recoveryHtml.includes("form-action 'none'")) {
  throw new Error("Recovery tool outbound protections were lost.");
}
const { responderUrl } = JSON.parse(await readFile(new URL("../site/intake-config.json", import.meta.url), "utf8"));
if (responderUrl && recoveryHtml.includes(responderUrl)) {
  throw new Error("Provider intake must not be bundled into the recovery tool.");
}
await rm(new URL("site-build/", dist), { recursive: true });
console.log("Built the public website separately from the local-only recovery tool.");
