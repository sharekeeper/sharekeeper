import { readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { inlineBrowserIcons, removeEmittedFaviconFiles } from "./inline-branding.mjs";

const shamir = process.argv[2] === "shamir";
const buildDir = new URL(shamir ? "../dist/shamir-build/" : "../dist/", import.meta.url);
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
if (shamir) {
  // Offline seed + SLIP-39 share tool: a separate single-file download. It is
  // never served as a hosted page, and it refuses to generate unless opened
  // from file:// with the browser reporting no network connection.
  if (!html.includes("Offline seed")) throw new Error("Expected the Shamir build mode.");
  await writeFile(new URL("../dist/sharekeeper-shamir-offline.html", import.meta.url), html);
  await rm(buildDir, { recursive: true });
  console.log("Built sharekeeper-shamir-offline.html; outbound connections blocked.");
} else {
  await writeFile(new URL("../dist/recovery.html", import.meta.url), html);
  // This is the pristine built application, never a serialization of live form
  // state. Downloading it cannot include contacts, movements, or generated pads.
  await writeFile(new URL("../dist/sharekeeper-offline.html", import.meta.url), html);
  await removeEmittedFaviconFiles(new URL("../dist/", import.meta.url));
  console.log("Built identical recovery.html and offline copies; outbound connections blocked.");
}
