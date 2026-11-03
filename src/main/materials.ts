/**
 * Importing course material from the student's disk.
 *
 * Split across processes by necessity: DOCX and plain text are extracted here,
 * but PDFs are handed to the renderer because rasterising pages for OCR needs
 * a canvas, and Chromium already has one. See src/renderer/src/extract.ts.
 *
 * The web app's lib/extract-*.ts helpers take a browser `File` and load the
 * pdf.js worker from /public, so they cannot run in this process.
 */
import { randomUUID } from "node:crypto";
import { copyFile, readFile, stat } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { dialog } from "electron";
import { addMaterial, materialsDir } from "./store.js";

const MAX_CHARS = 100_000;
/** Guards against someone picking a 2 GB file and blowing up the IPC channel. */
const MAX_PDF_BYTES = 120 * 1024 * 1024;

export type PickedKind = "pdf" | "docx" | "text";

export interface PickedFile {
  path: string;
  title: string;
  kind: PickedKind;
  /** Only set for PDFs — the renderer extracts those. */
  bytes?: Uint8Array;
  /** Set for docx/text, already extracted here. */
  text?: string;
  /** Set when this file cannot be imported at all. */
  error?: string;
}

async function extractDocx(path: string): Promise<string | null> {
  try {
    const mammoth = await import("mammoth");
    // Path input avoids reading the file into memory twice.
    const { value } = await mammoth.extractRawText({ path });
    const out = value.replace(/\s+\n/g, "\n").trim();
    return out ? out.slice(0, MAX_CHARS) : null;
  } catch (error) {
    console.error(`[materials] DOCX extraction failed for ${basename(path)}:`, error);
    return null;
  }
}

async function extractPlain(path: string): Promise<string | null> {
  const out = (await readFile(path, "utf8")).replace(/\s+\n/g, "\n").trim();
  return out ? out.slice(0, MAX_CHARS) : null;
}

/**
 * Opens the OS file picker and prepares each selection.
 *
 * Returns descriptors rather than saving anything: PDFs still need the
 * renderer to extract their text, and nothing should be stored until we know
 * we actually got text out of it.
 */
export async function pickMaterials(): Promise<PickedFile[]> {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: "Add course material",
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "Course material", extensions: ["pdf", "docx", "txt", "md"] },
      { name: "All files", extensions: ["*"] },
    ],
  });
  if (canceled) return [];

  const picked: PickedFile[] = [];

  for (const path of filePaths) {
    const title = basename(path);
    const ext = extname(path).toLowerCase();
    const kind: PickedKind = ext === ".pdf" ? "pdf" : ext === ".docx" ? "docx" : "text";

    try {
      if (kind === "pdf") {
        const { size } = await stat(path);
        if (size > MAX_PDF_BYTES) {
          picked.push({
            path,
            title,
            kind,
            error: `File is ${(size / 1024 / 1024).toFixed(0)} MB — too large to import.`,
          });
          continue;
        }
        picked.push({ path, title, kind, bytes: await readFile(path) });
      } else {
        const text = kind === "docx" ? await extractDocx(path) : await extractPlain(path);
        if (!text) {
          picked.push({ path, title, kind, error: "No readable text found." });
          continue;
        }
        picked.push({ path, title, kind, text });
      }
    } catch (error) {
      picked.push({
        path,
        title,
        kind,
        error: error instanceof Error ? error.message : "Could not read this file.",
      });
    }
  }

  return picked;
}

/** Copies the original file alongside its extracted text and saves both. */
export async function commitMaterial(input: {
  courseId: string;
  path: string;
  title: string;
  kind: PickedKind;
  text: string;
  /** How the text was obtained, recorded so the UI can flag OCR quality. */
  method?: "text-layer" | "ocr" | "none";
}) {
  const text = input.text.trim().slice(0, MAX_CHARS);
  if (!text) throw new Error("Refusing to save a material with no text.");

  // Prefix with a uuid so two files with the same name cannot collide.
  const fileName = `${randomUUID()}-${input.title}`;
  await copyFile(input.path, join(materialsDir(), fileName));

  return addMaterial({
    courseId: input.courseId,
    title: input.title,
    fileName,
    kind: input.kind,
    chars: text.length,
    text,
    method: input.method,
  });
}

/** Saves pasted text as a material without touching the filesystem. */
export async function addPastedMaterial(courseId: string, title: string, text: string) {
  const trimmed = text.trim().slice(0, MAX_CHARS);
  if (!trimmed) throw new Error("Nothing to save.");
  return addMaterial({
    courseId,
    title: title.trim() || "Pasted notes",
    kind: "text",
    chars: trimmed.length,
    text: trimmed,
  });
}
