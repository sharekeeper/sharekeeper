import { readFile, readdir, rm } from "node:fs/promises";

// Vite emits <link rel="icon"> assets even for this single-file build. Embed
// their public bytes explicitly so strict-CSP and file:// copies stay offline.
export async function inlineBrowserIcons(html) {
  const png = await readFile(new URL("../assets/favicon-32.png", import.meta.url));
  const ico = await readFile(new URL("../assets/favicon.ico", import.meta.url));
  const icons = new Map([
    ["image/png", `data:image/png;base64,${png.toString("base64")}`],
    ["image/x-icon", `data:image/x-icon;base64,${ico.toString("base64")}`],
  ]);
  let count = 0;
  const result = html.replace(/<link\b[^>]*\brel=["']icon["'][^>]*>/g, (tag) => {
    const mime = tag.match(/\btype=["']([^"']+)["']/)?.[1];
    const data = icons.get(mime);
    if (!data || !/\bhref=["'][^"']*["']/.test(tag)) {
      throw new Error("Unexpected browser icon declaration.");
    }
    count += 1;
    return tag.replace(/\bhref=(["'])[^"']*\1/, `href="${data}"`);
  });
  if (count !== 2) throw new Error("Expected both supplied-logo browser icons.");
  return result;
}

export async function removeEmittedFaviconFiles(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isFile() && /^favicon-[A-Za-z0-9_-]+\.(?:ico|png)$/.test(entry.name)) {
      await rm(new URL(entry.name, directory));
    }
  }
}
