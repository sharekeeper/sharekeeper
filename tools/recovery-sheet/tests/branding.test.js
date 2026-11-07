import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { inlineBrowserIcons } from "../scripts/inline-branding.mjs";

test("favicon source remains the supplied standalone logo", async () => {
  const source = await readFile(new URL("../../../assets/brand/logo-prototype.png", import.meta.url));
  assert.equal(
    createHash("sha256").update(source).digest("hex"),
    "86f7ae7e8bdf6b3d1e17705f67064464a09ddeafc6dcd0f2e620879c50282149",
  );
  assert.equal(source.readUInt32BE(16), 1254);
  assert.equal(source.readUInt32BE(20), 1254);
});

test("domain lockup source remains the latest supplied unmodified logo", async () => {
  const source = await readFile(new URL("../../../assets/brand/logo-with-domain.png", import.meta.url));
  assert.equal(
    createHash("sha256").update(source).digest("hex"),
    "bbd14084bb740bfc7e07f9d303fe2b83ad7104be1f72d81b94d03f780b8de3c7",
  );
  assert.equal(source.readUInt32BE(16), 2172);
  assert.equal(source.readUInt32BE(20), 724);
});

test("browser icons include a 32px PNG and three valid ICO resolutions", async () => {
  const png = await readFile(new URL("../assets/favicon-32.png", import.meta.url));
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(png.readUInt32BE(16), 32);
  assert.equal(png.readUInt32BE(20), 32);
  const ico = await readFile(new URL("../assets/favicon.ico", import.meta.url));
  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 3);
  assert.deepEqual([0, 1, 2].map((index) => ico[6 + index * 16]), [16, 32, 48]);
  assert.deepEqual([0, 1, 2].map((index) => ico[7 + index * 16]), [16, 32, 48]);
});

test("portal and recovery source heads both reference the supplied-logo icons", async () => {
  for (const path of ["../index.html", "../site/index.html"]) {
    const html = await readFile(new URL(path, import.meta.url), "utf8");
    const head = html.match(/<head>([\s\S]*?)<\/head>/)?.[1];
    assert.ok(head);
    assert.match(head, /<link rel="icon"[^>]*type="image\/png"[^>]*sizes="32x32"[^>]*href="[^"]*assets\/favicon-32\.png"/);
    assert.match(head, /<link rel="icon"[^>]*type="image\/x-icon"[^>]*sizes="16x16 32x32 48x48"[^>]*href="[^"]*assets\/favicon\.ico"/);
  }
});

test("finalizer embeds both real icon files without external icon URLs", async () => {
  const source = '<head><link rel="icon" type="image/x-icon" href="./favicon-test.ico"><link rel="icon" type="image/png" href="./favicon-32-test.png"></head>';
  const html = await inlineBrowserIcons(source);
  assert.match(html, /href="data:image\/x-icon;base64,[A-Za-z0-9+/=]+"/);
  assert.match(html, /href="data:image\/png;base64,[A-Za-z0-9+/=]+"/);
  assert.doesNotMatch(html, /href="\.\//);
  await assert.rejects(inlineBrowserIcons("<head></head>"), /Expected both/);
});
