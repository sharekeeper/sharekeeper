import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const path = new URL("../dist/index.html", import.meta.url);
let html = await readFile(path, "utf8");
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
await writeFile(path, html);
// This is the pristine built application, never a serialization of live form
// state. Downloading it cannot include contacts, movements, or generated pads.
await writeFile(new URL("../dist/sharekeeper-offline.html", import.meta.url), html);
console.log("Built self-contained online and offline copies; outbound connections blocked.");
