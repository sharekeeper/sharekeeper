import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { assertPublicDirectory, hostedFormUrl } from "./site/directory.js";

// Reject private or unapproved raw source data before it enters a public bundle.
assertPublicDirectory(JSON.parse(readFileSync(new URL("./site/providers.json", import.meta.url), "utf8")));
const intake = JSON.parse(readFileSync(new URL("./site/intake-config.json", import.meta.url), "utf8"));
if (intake.responderUrl !== null && !hostedFormUrl(intake.responderUrl)) {
  throw new Error("Provider intake must use an explicitly verified native responder URL.");
}

export default defineConfig({
  root: fileURLToPath(new URL("./site", import.meta.url)),
  plugins: [react(), viteSingleFile()],
  base: "./",
  build: {
    outDir: fileURLToPath(new URL("./dist/site-build", import.meta.url)),
    emptyOutDir: true,
    assetsInlineLimit: 20000000,
    sourcemap: false,
  },
});
