/**
 * Copies the Tesseract worker, WASM core, and English language data into the
 * renderer's public directory.
 *
 * Why not let tesseract.js fetch them? By default it pulls the worker, core and
 * ~15 MB of language data from a CDN at first use. That would break offline
 * use, and our CSP has no remote origins. Bundling them keeps OCR entirely
 * local — which is the whole point: it costs the student nothing.
 */
import { copyFile, mkdir, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, "../src/renderer/public/tesseract");

const pkgDir = (name) => dirname(require.resolve(`${name}/package.json`));

async function main() {
  await mkdir(out, { recursive: true });

  // 1. The worker script tesseract.js spawns.
  const tess = pkgDir("tesseract.js");
  await copyFile(join(tess, "dist/worker.min.js"), join(out, "worker.min.js"));

  // 2. The WASM core. Only the LSTM variants — tesseract.js v7 uses the LSTM
  //    engine, so the legacy cores are dead weight (they double the payload).
  //    SIMD is preferred at runtime with the plain build as the fallback.
  const core = pkgDir("tesseract.js-core");
  for (const file of await readdir(core)) {
    if (/^tesseract-core(-simd)?-lstm.(wasm|wasm.js|js)$/.test(file)) {
      await copyFile(join(core, file), join(out, file));
    }
  }

  // 3. English traineddata. The standard model, not *_best — roughly a third
  //    the size and accurate enough for lecture slides and scanned notes.
  const data = pkgDir("@tesseract.js-data/eng");
  await copyFile(join(data, "4.0.0/eng.traineddata.gz"), join(out, "eng.traineddata.gz"));

  const files = await readdir(out);
  console.log(`[ocr-assets] ${files.length} files -> src/renderer/public/tesseract`);
}

await main();
