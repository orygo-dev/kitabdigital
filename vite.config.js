import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
const offlineAssets = {
  name: "aset-offline",
  apply: "build",
  closeBundle() {
    const assets = readdirSync("dist/assets").map((name) => "/assets/" + name);
    const template = readFileSync("public/sw.js", "utf8");
    const version = createHash("sha256")
      .update(assets.join("|") + template)
      .digest("hex")
      .slice(0, 12);
    const source = template
      .replace(
        /const PRECACHE\s*=\s*\[\];/,
        `const PRECACHE=${JSON.stringify(assets)};`,
      )
      .replace("kitab-shell-v1", "kitab-shell-" + version);
    writeFileSync("dist/sw.js", source);
  },
};
export default defineConfig({
  plugins: [tailwindcss(), offlineAssets],
  server: { proxy: { "/api": "http://127.0.0.1:8000" } },
  build: { chunkSizeWarningLimit: 1500 },
});
