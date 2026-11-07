import test from "node:test";
import assert from "node:assert/strict";
import { publicNavigationUrls } from "../shared/public-urls.js";

const MIRROR_SITE = "https://sharekeeper.github.io/sharekeeper-app/";
const MIRROR_RECOVERY = `${MIRROR_SITE}recovery.html`;

test("ordinary HTTP and HTTPS generator navigation stays in the serving project", () => {
  for (const page of [
    "https://sharekeeper.org/recovery.html",
    "https://sharekeeper.github.io/sharekeeper-app/recovery.html",
    "https://sharekeeper.github.io/sharekeeper/recovery.html",
    "http://localhost:3000/recovery.html",
    "https://example.org/another-project/recovery.html",
  ]) {
    const location = new URL(page);
    const result = publicNavigationUrls(location, location.origin);
    assert.equal(result.platformPreview, false);
    assert.equal(result.siteUrl, "./index.html");
    assert.equal(new URL(`${result.siteUrl}#/tools`, page).href, new URL("./index.html#/tools", page).href);
    assert.equal(new URL(`${result.siteUrl}#/providers`, page).href, new URL("./index.html#/providers", page).href);
    assert.equal(result.standaloneRecoveryUrl, MIRROR_RECOVERY);
  }
});

test("offline file navigation uses the independent HTTPS mirror without becoming a platform preview", () => {
  const location = new URL("file:///private/offline/sharekeeper-offline.html");
  const result = publicNavigationUrls(location, "null");
  assert.equal(result.platformPreview, false);
  assert.equal(result.siteUrl, MIRROR_SITE);
  assert.equal(`${result.siteUrl}#/tools`, `${MIRROR_SITE}#/tools`);
  assert.equal(`${result.siteUrl}#/providers`, `${MIRROR_SITE}#/providers`);
  assert.equal(result.standaloneRecoveryUrl, MIRROR_RECOVERY);
});

test("platform hostname keeps the exact preview fallback behavior", () => {
  const location = new URL("https://sites.pplx.app/preview/recovery.html");
  const result = publicNavigationUrls(location, location.origin);
  assert.equal(result.platformPreview, true);
  assert.equal(result.siteUrl, MIRROR_SITE);
  assert.equal(result.standaloneRecoveryUrl, MIRROR_RECOVERY);
});

test("opaque detection uses the passed global origin rather than location.origin", () => {
  const location = new URL("https://preview.example/embedded/recovery.html");
  assert.notEqual(location.origin, "null");
  const result = publicNavigationUrls(location, "null");
  assert.equal(result.platformPreview, true);
  assert.equal(result.siteUrl, MIRROR_SITE);
  assert.equal(result.standaloneRecoveryUrl, MIRROR_RECOVERY);
});

test("missing or non-web locations use only the independent HTTPS public fallback", () => {
  for (const location of [undefined, { protocol: "data:", hostname: "" }, { protocol: "blob:", hostname: "" }]) {
    const result = publicNavigationUrls(location, undefined);
    assert.equal(result.siteUrl, MIRROR_SITE);
    assert.equal(result.standaloneRecoveryUrl, MIRROR_RECOVERY);
  }
  assert.equal(publicNavigationUrls(undefined, "null").platformPreview, true);
});
