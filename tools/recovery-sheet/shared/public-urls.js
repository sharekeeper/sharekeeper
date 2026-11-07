const INDEPENDENT_SITE_URL = "https://sharekeeper.github.io/sharekeeper-app/";

/**
 * Public navigation only. The caller passes globalThis.origin separately because
 * an opaque preview's origin can differ from location.origin.
 */
export function publicNavigationUrls(location, browserOrigin) {
  const platformPreview = location?.hostname === "sites.pplx.app"
    || (browserOrigin === "null" && location?.protocol !== "file:");
  const liveWeb = location?.protocol === "http:" || location?.protocol === "https:";
  return {
    platformPreview,
    siteUrl: liveWeb && !platformPreview ? "./index.html" : INDEPENDENT_SITE_URL,
    standaloneRecoveryUrl: `${INDEPENDENT_SITE_URL}recovery.html`,
  };
}
