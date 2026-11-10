import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { inlineBrowserIcons, removeEmittedFaviconFiles } from "./inline-branding.mjs";

const buildDir = new URL("../dist/", import.meta.url);
const path = new URL("index.html", buildDir);
let html = await readFile(path, "utf8");
html = await inlineBrowserIcons(html);
const notices = await readFile(new URL("../assets/third-party-notices.txt", import.meta.url), "utf8");
const escapedNotices = notices.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
html = html.replace("</body>", `<template id="third-party-notices">${escapedNotices}</template></body>`);
const hashes = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .map((match) => `'sha256-${createHash("sha256").update(match[1]).digest("base64")}'`);
if (!hashes.length) throw new Error("Expected a self-contained application script.");
const policy = [
  "default-src 'none'",
  `script-src ${hashes.join(" ")}`,
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "font-src data:",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");
html = html.replace("<head>", `<head><meta http-equiv="Content-Security-Policy" content="${policy}">`);
// One unified workflow app, written to three identical files:
// recovery.html (hosted entry: guided start + opt-in dry run),
// sharekeeper-offline.html (the download), and sharekeeper-shamir-offline.html
// (kept so earlier download links still work). Each is the pristine build,
// never a serialization of live state, so downloads cannot carry contacts,
// movement input, seeds, shares or pads.
if (!html.includes("Seed to")) throw new Error("Expected the unified workflow build.");
for (const name of ["recovery.html", "sharekeeper-offline.html", "sharekeeper-shamir-offline.html"]) {
  await writeFile(new URL(`../dist/${name}`, import.meta.url), html);
}
await removeEmittedFaviconFiles(new URL("../dist/", import.meta.url));
console.log("Built identical recovery.html, sharekeeper-offline.html and sharekeeper-shamir-offline.html; outbound connections blocked.");
