/**
 * Rasterises build/icon.svg into the formats electron-builder and the OS need.
 *
 * Outputs:
 *   build/icon.png   1024x1024 — macOS/Linux, and the source electron-builder
 *                    uses if no .ico is present
 *   build/icon.ico   multi-resolution — Windows taskbar, Explorer, installer
 *
 * Kept as a script rather than committed binaries so the icon can be edited as
 * SVG and regenerated.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import pngToIco from "png-to-ico";

const here = dirname(fileURLToPath(import.meta.url));
const buildDir = resolve(here, "../build");

/** Windows picks the nearest size; omitting small ones makes the taskbar blurry. */
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

function render(svg, size) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: size },
    background: "rgba(0,0,0,0)",
  });
  return resvg.render().asPng();
}

async function main() {
  await mkdir(buildDir, { recursive: true });
  const svg = await readFile(resolve(buildDir, "icon.svg"));

  const master = render(svg, 1024);
  await writeFile(resolve(buildDir, "icon.png"), master);

  const frames = ICO_SIZES.map((size) => render(svg, size));
  await writeFile(resolve(buildDir, "icon.ico"), await pngToIco(frames));

  console.log(`[icons] icon.png 1024px, icon.ico (${ICO_SIZES.join(", ")})`);
}

await main();
