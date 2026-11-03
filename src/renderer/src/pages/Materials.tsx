import { useCallback, useEffect, useRef, useState } from "react";
import { EmptyState, Icon, Labeled, Modal, shortDate, useToast } from "../ui";
import { extractPdf } from "../extract";
import { isFailure, type Course, type MaterialMeta, type Readiness } from "../types";

const KIND: Record<string, { label: string; bg: string; fg: string }> = {
  pdf: { label: "PDF", bg: "var(--wine-tint)", fg: "var(--wine)" },
  docx: { label: "DOC", bg: "var(--gold-tint)", fg: "var(--gold-ink)" },
  text: { label: "NOTES", bg: "var(--teal-tint)", fg: "var(--teal)" },
};

/** Roughly what a student thinks of as a page of notes. */
const CHARS_PER_PAGE = 2_500;

export function Materials({
  course,
  readiness,
  importSignal,
  model,
  canGenerate,
  onExam,
  onChanged,
  onFlashcardsMade,
}: {
  course: Course;
  readiness: Readiness | null;
  /** Bumped by the palette / overview to start an import from elsewhere. */
  importSignal: number;
  model: string;
  canGenerate: boolean;
  onExam: (materialIds: string[]) => void;
  onChanged: () => void;
  onFlashcardsMade: () => void;
}) {
  const toast = useToast();
  const [materials, setMaterials] = useState<MaterialMeta[]>([]);
  const [work, setWork] = useState<{ title: string; status: string } | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [carding, setCarding] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await window.exee.listMaterials(course.id);
    if (!isFailure(r)) setMaterials(r.data);
  }, [course.id]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * PDFs are extracted here rather than in the main process: OCR needs to
   * rasterise pages, and the renderer already has Chromium's canvas. DOCX and
   * plain text arrive already extracted.
   */
  const importFiles = useCallback(async () => {
    const picked = await window.exee.pickMaterials();
    if (isFailure(picked)) return toast(picked.message, "error");
    if (picked.data.length === 0) return;

    let added = 0;
    let ocrUsed = 0;
    try {
      for (const file of picked.data) {
        if (file.error) {
          toast(`${file.title}: ${file.error}`, "error");
          continue;
        }

        let text = file.text ?? "";
        let method: "text-layer" | "ocr" | "none" | undefined;

        if (file.kind === "pdf" && file.bytes) {
          setWork({ title: file.title, status: "Opening…" });
          try {
            const result = await extractPdf(file.bytes, (m) => setWork({ title: file.title, status: m }));
            text = result.text;
            method = result.method;
            if (result.method === "ocr") ocrUsed++;
          } catch (error) {
            toast(`${file.title}: ${error instanceof Error ? error.message : "Could not read this PDF."}`, "error");
            continue;
          }
        }

        if (!text.trim()) {
          toast(`${file.title}: no text could be read, even with OCR. It may be a photo of handwriting.`, "error");
          continue;
        }

        setWork({ title: file.title, status: "Saving…" });
        const saved = await window.exee.commitMaterial({ courseId: course.id, path: file.path, title: file.title, kind: file.kind, text, method });
        if (isFailure(saved)) {
          toast(`${file.title}: ${saved.message}`, "error");
          continue;
        }
        added++;
      }
    } finally {
      setWork(null);
    }

    if (added) {
      toast(ocrUsed ? `Added ${added} file${added === 1 ? "" : "s"} (${ocrUsed} via OCR)` : `Added ${added} file${added === 1 ? "" : "s"}`, "success");
      onChanged();
    }
    await load();
  }, [course.id, toast, load, onChanged]);

  // Triggered from outside (palette / quick action); skip the initial mount value.
  const lastSignal = useRef(importSignal);
  useEffect(() => {
    if (importSignal === lastSignal.current) return;
    lastSignal.current = importSignal;
    void importFiles();
  }, [importSignal, importFiles]);

  const remove = async (m: MaterialMeta) => {
    const r = await window.exee.deleteMaterial(m.id);
    if (isFailure(r)) return toast(r.message, "error");
    setConfirm(null);
    toast("Material removed");
    onChanged();
    await load();
  };

  const makeCards = async (m: MaterialMeta) => {
    if (!canGenerate) return toast("Plan usage is off for this account", "error");
    setCarding(m.id);
    const r = await window.exee.generateFlashcards({ model, courseId: course.id, courseName: course.name, title: m.title, materialIds: [m.id], count: 12 });
    setCarding(null);
    if (isFailure(r)) return toast(r.message, "error");
    toast(`${r.data.cards.length} cards ready`, "success");
    onChanged();
    onFlashcardsMade();
  };

  const topics = (readiness?.topics ?? []).map((t) => t.topic);
  const totalChars = materials.reduce((s, m) => s + m.chars, 0);

  return (
    <div className="page" style={{ gap: 22 }}>
      <button
        onClick={() => void importFiles()}
        disabled={Boolean(work)}
        className="dropzone rise"
        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 18, flexWrap: "wrap", padding: 34 }}
      >
        <span style={{ width: 56, height: 56, borderRadius: 18, background: "var(--navy)", color: "var(--gold)", display: "flex", alignItems: "center", justifyContent: "center", animation: "float 4s ease-in-out infinite" }}>
          <Icon name="upload_file" size={28} />
        </span>
        <span style={{ display: "flex", flexDirection: "column", gap: 4, textAlign: "left" }}>
          <span style={{ font: "500 21px/26px var(--font)" }}>Add slides, PDFs or notes</span>
          <span style={{ font: "400 13.5px/19px var(--font)", color: "var(--ink-4)" }}>
            Read and stored on your computer — scanned pages too, with on-device OCR. Only the excerpts an exam needs go to ChatGPT.
          </span>
        </span>
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ font: "500 13px/18px var(--font)", color: "var(--ink-4)" }}>
          {materials.length} item{materials.length === 1 ? "" : "s"} · about {Math.max(materials.length ? 1 : 0, Math.round(totalChars / CHARS_PER_PAGE))} pages of text
        </span>
        <div style={{ flex: 1 }} />
        <button className="btn btn-sm btn-outline" onClick={() => setPasteOpen(true)}>
          <Icon name="edit_note" size={18} />
          Paste text
        </button>
      </div>

      {topics.length > 0 && (
        <div className="card card-sm rise" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <span className="eyebrow">Topics Exetasy found in this course</span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {topics.map((t) => (
              <span key={t} className="chip">{t}</span>
            ))}
          </div>
        </div>
      )}

      {materials.length === 0 && !work ? (
        <EmptyState icon="library_books" title="Nothing here yet" body="Add PDFs, Word documents or plain text. Text is extracted on your machine and stored locally." />
      ) : (
        <div className="grid-auto" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(300px, 100%), 1fr))" }}>
          {work && (
            <div className="card card-sm rise" style={{ display: "flex", flexDirection: "column", gap: 14, borderRadius: 20 }}>
              <MaterialHead kind="pdf" title={work.title} meta="READING…" />
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div className="track"><span className="shimmer" style={{ width: "100%", background: "linear-gradient(90deg,#e3c78a 0,var(--gold-deep) 50%,#e3c78a 100%)", backgroundSize: "960px 100%" }} /></div>
                <span style={{ font: "500 12px/16px var(--font)", color: "var(--gold-ink)" }}>{work.status}</span>
                <span style={{ font: "400 12px/16px var(--font)", color: "var(--ink-5)" }}>Runs on your computer. Uses none of your ChatGPT plan.</span>
              </div>
            </div>
          )}
          {materials.map((m, i) => (
            <div key={m.id} className="card card-sm lift rise" style={{ display: "flex", flexDirection: "column", gap: 14, borderRadius: 20, animationDelay: `${0.05 + i * 0.04}s` }}>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <MaterialHead
                    kind={m.kind}
                    title={m.title}
                    meta={`${Math.max(1, Math.round(m.chars / CHARS_PER_PAGE))} PAGE${m.chars > CHARS_PER_PAGE * 1.5 ? "S" : ""} · ${shortDate(m.createdAt).toUpperCase()}`}
                  />
                </div>
                <button className="icon-btn icon-btn-sm" title="Remove material" onClick={() => setConfirm(confirm === m.id ? null : m.id)}>
                  <Icon name="delete" size={19} />
                </button>
              </div>
              {m.method === "ocr" && (
                <span className="chip chip-gold" style={{ alignSelf: "flex-start" }} title="This was a scanned PDF. Text was recovered by OCR on your machine, so it may contain recognition errors.">
                  <Icon name="document_scanner" size={15} />
                  Read with OCR
                </span>
              )}
              {confirm === m.id ? (
                <div style={{ display: "flex", gap: 8, marginTop: "auto" }}>
                  <button className="btn btn-sm btn-danger" style={{ flex: 1 }} onClick={() => void remove(m)}>Remove</button>
                  <button className="btn btn-sm btn-soft" style={{ flex: 1 }} onClick={() => setConfirm(null)}>Keep</button>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 8, marginTop: "auto" }}>
                  <button className="btn btn-sm btn-primary" style={{ flex: 1 }} onClick={() => onExam([m.id])}>Generate exam</button>
                  <button className="btn btn-sm btn-outline" style={{ flex: 1 }} disabled={carding !== null} onClick={() => void makeCards(m)}>
                    {carding === m.id ? <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> : "Flashcards"}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <PasteModal
        open={pasteOpen}
        courseId={course.id}
        onClose={() => setPasteOpen(false)}
        onAdded={async () => {
          setPasteOpen(false);
          onChanged();
          await load();
          toast("Notes added", "success");
        }}
      />
    </div>
  );
}

function MaterialHead({ kind, title, meta }: { kind: string; title: string; meta: string }) {
  const k = KIND[kind] ?? KIND.text!;
  return (
    <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
      <span style={{ width: 44, height: 54, borderRadius: 8, background: k.bg, color: k.fg, display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 8, font: "600 9px/1 var(--font)", letterSpacing: ".06em", flexShrink: 0 }}>
        {k.label}
      </span>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
        <span style={{ font: "600 15px/20px var(--font)", overflowWrap: "anywhere" }}>{title}</span>
        <span style={{ font: "500 12px/16px var(--font)", color: "var(--ink-5)" }}>{meta}</span>
      </div>
    </div>
  );
}

function PasteModal({ open, courseId, onClose, onAdded }: { open: boolean; courseId: string; onClose: () => void; onAdded: () => void }) {
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");

  const submit = async () => {
    const r = await window.exee.addTextMaterial({ courseId, title, text });
    if (isFailure(r)) return toast(r.message, "error");
    setTitle("");
    setText("");
    onAdded();
  };

  return (
    <Modal open={open} onClose={onClose} width={640} title="Paste notes" sub="For material you can't export to a file.">
      <Labeled label="Title">
        <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Week 6 — deadlock" />
      </Labeled>
      <Labeled label="Text" hint={`${text.trim().length.toLocaleString()} characters`}>
        <textarea className="field" rows={12} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste lecture notes, slide content or a lab manual here." />
      </Labeled>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={!text.trim()} onClick={() => void submit()}>Add material</button>
      </div>
    </Modal>
  );
}
