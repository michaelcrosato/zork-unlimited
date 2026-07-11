/**
 * Post-build inliner: folds the built JS and CSS into dist/index.html so the
 * game is a single self-contained file that runs when double-clicked (file://),
 * with no dev server. Browsers block external module scripts on file://, so
 * inlining is what makes the double-click launcher (PLAY.bat) possible.
 */
import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const dist = fileURLToPath(new URL("../dist", import.meta.url));
const htmlPath = join(dist, "index.html");
let html = readFileSync(htmlPath, "utf8");
let scriptCount = 0;
let stylesheetCount = 0;

html = html.replace(
  /<script type="module"[^>]*\bsrc="\.?\/?(assets\/[^"]+)"[^>]*><\/script>/g,
  (_, src) => {
    // A literal closing tag inside the bundle would end the inline tag early.
    scriptCount += 1;
    const js = readFileSync(join(dist, src), "utf8").replace(/<\/script/gi, "<\\/script");
    return `<script type="module">\n${js}\n</script>`;
  },
);

html = html.replace(
  /<link rel="stylesheet"[^>]*\bhref="\.?\/?(assets\/[^"]+)"[^>]*>/g,
  (_, href) => {
    stylesheetCount += 1;
    const css = readFileSync(join(dist, href), "utf8");
    if (/@import\s+(?:url\(\s*)?["']?https?:\/\//i.test(css)) {
      throw new Error("built CSS still imports a remote stylesheet");
    }
    return `<style>\n${css.replace(/<\/style/gi, "<\\/style")}\n</style>`;
  },
);

if (scriptCount !== 1 || stylesheetCount !== 1) {
  throw new Error(
    `expected one module script and one stylesheet, inlined ${scriptCount} and ${stylesheetCount}`,
  );
}
if (/\bassets\//i.test(html)) {
  throw new Error("dist/index.html still references a generated asset after inlining");
}

writeFileSync(htmlPath, html);
rmSync(join(dist, "assets"), { recursive: true, force: true });
const leftovers = readdirSync(dist).filter((entry) => entry !== "index.html");
if (leftovers.length > 0) {
  throw new Error(`single-file build left extra output: ${leftovers.join(", ")}`);
}
console.log(`inlined build -> ${htmlPath} (${(html.length / 1024 / 1024).toFixed(1)} MB)`);
