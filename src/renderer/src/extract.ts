/**
 * PDF text extraction with an OCR fallback — all local, all free.
 *
 * This runs in the renderer rather than the main process for one reason:
 * rasterising a PDF page needs a canvas, and Chromium already has a fast one.
 * Doing it in Node would mean a native canvas module and an Electron ABI
 * rebuild for no benefit.
 *
 * OCR cannot be delegated to the model: @siwc/local's `streamResponse` only
 * accepts string content, so page images cannot be sent at all. Even if they
 * could, a scanned page costs well over a thousand tokens of the student's
 * plan. Tesseract runs on their CPU for nothing.
 */
import * as pdfjs from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

export const MAX_CHARS = 100_000;
const MAX_PAGES = 40;
/** Below this, a "text layer" is almost certainly page furniture, not content. */
const TEXT_LAYER_MIN_CHARS = 120;
/** Scanned text needs more pixels than screen resolution to OCR reliably. */
const OCR_SCALE = 2.0;
/** OCR is slow (~1-3s/page); cap it so a 200-page scan can't hang the app. */
const MAX_OCR_PAGES = 20;

export type Progress = (message: string) => void;

export interface ExtractResult {
  text: string;
  /** How the text was obtained, so the UI can be honest about quality. */
  method: "text-layer" | "ocr" | "none";
  pages: number;
  ocrPages?: number;
}

/** Pulls the embedded text layer. Returns "" for a scanned document. */
async function readTextLayer(doc: pdfjs.PDFDocumentProxy, onProgress: Progress): Promise<string> {
  const parts: string[] = [];
  const pageCount = Math.min(doc.numPages, MAX_PAGES);

  for (let i = 1; i <= pageCount; i++) {
    if (i % 5 === 0) onProgress(`Reading page ${i} of ${pageCount}...`);
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? String(item.str) : ""))
      .filter(Boolean)
      .join(" ");
    if (text.trim()) parts.push(text);
    if (parts.join("\n").length >= MAX_CHARS) break;
  }

  return parts.join("\n\n").replace(/\s+\n/g, "\n").trim();
}

/** Rasterises each page and runs Tesseract over it. */
async function ocr(
  doc: pdfjs.PDFDocumentProxy,
  onProgress: Progress,
): Promise<{ text: string; pages: number }> {
  const { createWorker } = await import("tesseract.js");

  // Every path points inside the bundle; nothing is fetched from a CDN.
  const worker = await createWorker("eng", 1, {
    workerPath: "tesseract/worker.min.js",
    corePath: "tesseract",
    langPath: "tesseract",
    // The language file is the bundled .gz, so don't let it try the network.
    cacheMethod: "none",
    gzip: true,
  });

  try {
    const pageCount = Math.min(doc.numPages, MAX_OCR_PAGES);
    const parts: string[] = [];

    for (let i = 1; i <= pageCount; i++) {
      onProgress(`Reading scanned page ${i} of ${pageCount}...`);

      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: OCR_SCALE });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);

      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not create a drawing surface for OCR.");
      await page.render({ canvasContext: context, viewport }).promise;

      const { data } = await worker.recognize(canvas);
      if (data.text.trim()) parts.push(data.text.trim());

      // Release the bitmap straight away; 40 full-page canvases is a lot of RAM.
      canvas.width = 0;
      canvas.height = 0;

      if (parts.join("\n").length >= MAX_CHARS) break;
    }

    return {
      text: parts.join("\n\n").replace(/\s+\n/g, "\n").trim().slice(0, MAX_CHARS),
      pages: pageCount,
    };
  } finally {
    await worker.terminate();
  }
}

/**
 * Extracts text from a PDF, falling back to OCR when there is no text layer.
 */
export async function extractPdf(
  data: Uint8Array,
  onProgress: Progress,
): Promise<ExtractResult> {
  // pdfjs takes ownership of the buffer, so hand it a copy we don't reuse.
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;

  try {
    onProgress("Looking for a text layer...");
    const layer = await readTextLayer(doc, onProgress);

    if (layer.length >= TEXT_LAYER_MIN_CHARS) {
      return { text: layer.slice(0, MAX_CHARS), method: "text-layer", pages: doc.numPages };
    }

    onProgress("No text layer — running OCR on your machine. This can take a minute.");
    const result = await ocr(doc, onProgress);

    if (!result.text) {
      // Keep whatever the text layer had, even if it was below the threshold.
      return layer
        ? { text: layer, method: "text-layer", pages: doc.numPages }
        : { text: "", method: "none", pages: doc.numPages };
    }

    return {
      text: result.text,
      method: "ocr",
      pages: doc.numPages,
      ocrPages: result.pages,
    };
  } finally {
    await doc.destroy();
  }
}
