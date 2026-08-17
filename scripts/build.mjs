// Bundles src/ into a single self-contained index.html at the repo root.
// Run with: npm run build
import esbuild from "esbuild";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = path.join(root, "build");
if (!existsSync(outDir)) mkdirSync(outDir);

const isWatch = process.argv.includes("--watch");

const buildOptions = {
  entryPoints: [path.join(root, "src/main.jsx")],
  bundle: true,
  minify: !process.argv.includes("--dev"),
  sourcemap: false,
  loader: { ".jsx": "jsx", ".js": "jsx" },
  jsx: "automatic",
  target: ["es2019"],
  define: { "process.env.NODE_ENV": JSON.stringify(process.argv.includes("--dev") ? "development" : "production") },
  outfile: path.join(outDir, "bundle.js"),
  logLevel: "info",
};

async function writeHtml() {
  const js = readFileSync(path.join(outDir, "bundle.js"), "utf8");
  const css = readFileSync(path.join(root, "src/styles.css"), "utf8");
  const template = readFileSync(path.join(root, "src/index.template.html"), "utf8");
  const html = template
    .replace("/*__STYLES__*/", css)
    .replace("/*__BUNDLE__*/", js);
  writeFileSync(path.join(root, "index.html"), html);
  const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
  console.log(`Wrote index.html (${kb} KB)`);
}

if (isWatch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.rebuild();
  await writeHtml();
  await ctx.watch();
  console.log("Watching for changes...");
} else {
  await esbuild.build(buildOptions);
  await writeHtml();
}
