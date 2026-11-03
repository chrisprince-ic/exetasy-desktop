import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState, Icon, Modal, useToast } from "../ui";
import { isFailure, type Card, type Course, type Deck, type Rating } from "../types";

type Item = { deckId: string; card: Card };
type Out = "left" | "right" | "enter" | null;

const RATES: Array<{ label: string; rating: Rating; key: string; bg: string; fg: string }> = [
  { label: "Again", rating: "again", key: "1", bg: "var(--wine-tint)", fg: "var(--wine)" },
  { label: "Hard", rating: "hard", key: "2", bg: "var(--gold-tint)", fg: "var(--gold-ink)" },
  { label: "Good", rating: "good", key: "3", bg: "var(--teal-tint)", fg: "var(--teal)" },
];

const OUT_T: Record<Exclude<Out, null>, string> = {
  left: "translateX(-120%) rotate(-9deg)",
  right: "translateX(120%) rotate(9deg)",
  enter: "translateY(26px) scale(.94)",
};

export function Flashcards({
  course,
  decks,
  model,
  canGenerate,
  onChanged,
  onNeedMaterial,
}: {
  course: Course;
  decks: Deck[];
  model: string;
  canGenerate: boolean;
  onChanged: () => void;
  onNeedMaterial: () => void;
}) {
  const toast = useToast();
  const [deckId, setDeckId] = useState<string>("due");
  const [cram, setCram] = useState(false);
  const [queue, setQueue] = useState<Item[]>([]);
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [out, setOut] = useState<Out>(null);
  const [tally, setTally] = useState({ again: 0, hard: 0, good: 0 });
  const [newOpen, setNewOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Rebuild the session only when the selection or the set of decks changes,
  // not on every refresh — reviewing a card mustn't reshuffle the queue.
  const deckSig = decks.map((d) => `${d.id}:${d.cards.length}`).join("|");
  useEffect(() => {
    const now = Date.now();
    const pool = deckId === "due" ? decks : decks.filter((d) => d.id === deckId);
    const items = pool.flatMap((d) => d.cards.filter((c) => cram || c.due <= now).map((card) => ({ deckId: d.id, card })));
    // Missed cards (box 0) first, then the rest in deck order.
    items.sort((a, b) => a.card.box - b.card.box);
    setQueue(items);
    setI(0);
    setFlipped(false);
    setOut(null);
    setTally({ again: 0, hard: 0, good: 0 });
    setConfirmDelete(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId, cram, deckSig]);

  const item = queue[i];
  const done = queue.length > 0 && i >= queue.length;

  const flip = useCallback(() => {
    if (out || !item) return;
    setFlipped((f) => !f);
  }, [out, item]);

  const rate = useCallback(
    (rating: Rating) => {
      if (!item || !flipped || out) return;
      void window.exee.reviewCard({ deckId: item.deckId, cardId: item.card.id, rating }).then((r) => {
        if (isFailure(r)) toast(r.message, "error");
      });
      setTally((t) => ({ ...t, [rating]: t[rating] + 1 }));
      setOut(rating === "good" ? "right" : "left");
      window.setTimeout(() => {
        setI((n) => n + 1);
        setFlipped(false);
        setOut("enter");
        window.setTimeout(() => setOut(null), 60);
      }, 340);
    },
    [item, flipped, out, toast],
  );

  // Refresh decks once a session ends so the sidebar badge catches up.
  useEffect(() => {
    if (done) onChanged();
  }, [done, onChanged]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (newOpen || (e.target as HTMLElement | null)?.tagName === "INPUT") return;
      if (e.key === " ") {
        e.preventDefault();
        flip();
      }
      if (flipped) {
        const r = RATES.find((x) => x.key === e.key);
        if (r) rate(r.rating);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flip, rate, flipped, newOpen]);

  const now = Date.now();
  const dueAll = useMemo(() => decks.reduce((n, d) => n + d.cards.filter((c) => c.due <= now).length, 0), [decks, now]);
  const selected = decks.find((d) => d.id === deckId);

  const removeDeck = async () => {
    if (!selected) return;
    const r = await window.exee.deleteDeck(selected.id);
    if (isFailure(r)) return toast(r.message, "error");
    toast(`Deleted ${selected.title}`);
    setDeckId("due");
    onChanged();
  };

  return (
    <div className="page" style={{ maxWidth: 1000, alignItems: "center", gap: 26 }}>
      <div className="rise" style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
        <button className={deckId === "due" ? "pill-toggle on" : "pill-toggle"} onClick={() => { setDeckId("due"); setCram(false); }}>
          All due{dueAll ? ` · ${dueAll}` : ""}
        </button>
        {decks.map((d) => (
          <button key={d.id} className={deckId === d.id ? "pill-toggle on" : "pill-toggle"} onClick={() => { setDeckId(d.id); setCram(false); }}>
            {d.source === "mistakes" && <Icon name="history" size={16} style={{ marginRight: 6, verticalAlign: "-3px" }} />}
            {d.title}
          </button>
        ))}
        <button className="pill-toggle" style={{ borderStyle: "dashed" }} onClick={() => (canGenerate ? setNewOpen(true) : toast("Plan usage is off for this account", "error"))}>
          <Icon name="add" size={17} style={{ marginRight: 4, verticalAlign: "-4px" }} />
          New deck
        </button>
      </div>

      {decks.length === 0 ? (
        <div style={{ width: "100%" }}>
          <EmptyState
            icon="style"
            title="No cards yet"
            body="Generate a deck from your notes, or take a practice exam — anything you miss lands in a Mistakes deck automatically."
            action={<button className="btn btn-primary" onClick={() => (canGenerate ? setNewOpen(true) : toast("Plan usage is off for this account", "error"))}>Generate a deck</button>}
          />
        </div>
      ) : queue.length === 0 ? (
        <CaughtUp
          deck={selected}
          onCram={() => setCram(true)}
          onDelete={selected ? (confirmDelete ? () => void removeDeck() : () => setConfirmDelete(true)) : undefined}
          confirming={confirmDelete}
        />
      ) : done ? (
        <div className="card" style={{ width: "100%", maxWidth: 560, display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "48px 32px", borderRadius: 24, textAlign: "center", animation: "modal .5s both" }}>
          <span style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--teal-tint)", color: "var(--teal)", display: "flex", alignItems: "center", justifyContent: "center", animation: "pop .5s .2s both" }}>
            <Icon name="task_alt" size={32} />
          </span>
          <span style={{ font: "400 34px/1.1 var(--font)" }}>Session complete.</span>
          <span style={{ font: "400 15px/22px var(--font)", color: "var(--ink-3)" }}>
            {tally.good} good, {tally.hard} hard and {tally.again} again. Cards you missed come back tomorrow; the ones you knew wait longer.
          </span>
          <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={() => { setI(0); setTally({ again: 0, hard: 0, good: 0 }); }}>
            Study again
          </button>
        </div>
      ) : (
        item && (
          <>
            <div style={{ width: "100%", maxWidth: 640, display: "flex", justifyContent: "space-between", font: "500 12.5px/16px var(--font)", color: "var(--ink-4)" }}>
              <span>CARD {i + 1} OF {queue.length}{cram ? " · REVIEWING AHEAD" : ""}</span>
              <span style={{ display: "flex", gap: 14 }}>
                <span style={{ color: "var(--wine)" }}>{tally.again} again</span>
                <span style={{ color: "var(--gold-ink)" }}>{tally.hard} hard</span>
                <span style={{ color: "var(--teal)" }}>{tally.good} good</span>
              </span>
            </div>
            <div style={{ position: "relative", width: "100%", maxWidth: 640, height: 370 }}>
              <div style={{ position: "absolute", left: 28, right: 28, top: 22, bottom: -22, borderRadius: 24, background: "var(--sand-3)" }} />
              <div style={{ position: "absolute", left: 14, right: 14, top: 11, bottom: -11, borderRadius: 24, background: "var(--side)", border: "1px solid rgba(28,32,51,.06)" }} />
              <div
                className="flip-scene"
                style={{
                  transform: out ? OUT_T[out] : "none",
                  opacity: out ? 0 : 1,
                  transition: out === "enter" ? "none" : "transform .45s var(--ease), opacity .35s",
                }}
              >
                <div className={flipped ? "flip-card flipped" : "flip-card"} style={{ transition: out ? "none" : undefined }} onClick={flip}>
                  <div className="flip-face" style={{ background: "var(--paper)", border: "1px solid var(--line)", boxShadow: "0 24px 50px -30px rgba(28,32,51,.45)", alignItems: "center", textAlign: "center", gap: 18 }}>
                    {item.card.topic && <span className="tag">{item.card.topic}</span>}
                    <span style={{ font: `400 ${item.card.front.length > 90 ? 22 : item.card.front.length > 40 ? 30 : 44}px/1.2 var(--font)`, letterSpacing: "-.01em", textWrap: "balance" }}>
                      {item.card.front}
                    </span>
                    <span style={{ position: "absolute", bottom: 24, display: "flex", alignItems: "center", gap: 6, font: "400 13px/1 var(--font)", color: "var(--ink-5)" }}>
                      <Icon name="flip" size={18} />
                      Click or press Space to reveal
                    </span>
                  </div>
                  <div className="flip-face flip-back" style={{ background: "var(--navy)", color: "var(--on-navy)" }}>
                    <span className="eyebrow ellipsis" style={{ color: "var(--gold)", fontSize: 12 }}>{item.card.front}</span>
                    <span style={{ font: `400 ${item.card.back.length > 200 ? 18 : 24}px/1.45 var(--font)`, textWrap: "pretty", whiteSpace: "pre-wrap" }}>{item.card.back}</span>
                  </div>
                </div>
              </div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 10, marginTop: 16, minHeight: 52 }}>
              {!flipped ? (
                <button className="btn btn-lg btn-primary fade" onClick={flip} style={{ padding: "0 30px" }}>Show answer</button>
              ) : (
                RATES.map((r, k) => (
                  <button
                    key={r.rating}
                    className="btn btn-lg"
                    onClick={() => rate(r.rating)}
                    style={{ minWidth: 96, padding: "0 18px", gap: 10, background: r.bg, color: r.fg, animation: `rise .3s ${k * 0.05}s both` }}
                  >
                    {r.label}
                    <span style={{ font: "500 11px/1 var(--font)", opacity: 0.7 }}>{r.key}</span>
                  </button>
                ))
              )}
            </div>
          </>
        )
      )}

      <NewDeckDialog
        open={newOpen}
        course={course}
        model={model}
        onClose={() => setNewOpen(false)}
        onNeedMaterial={() => {
          setNewOpen(false);
          onNeedMaterial();
        }}
        onCreated={(deck) => {
          setNewOpen(false);
          onChanged();
          setDeckId(deck.id);
          toast(`${deck.cards.length} cards ready`, "success");
        }}
      />
    </div>
  );
}

function CaughtUp({ deck, onCram, onDelete, confirming }: { deck?: Deck; onCram: () => void; onDelete?: () => void; confirming: boolean }) {
  const next = deck?.cards.length ? Math.min(...deck.cards.map((c) => c.due)) : null;
  return (
    <div className="card rise" style={{ width: "100%", maxWidth: 560, display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "44px 32px", borderRadius: 24, textAlign: "center" }}>
      <span style={{ width: 60, height: 60, borderRadius: "50%", background: "var(--teal-tint)", color: "var(--teal)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon name="done_all" size={30} />
      </span>
      <span style={{ font: "400 30px/1.1 var(--font)" }}>You&rsquo;re caught up.</span>
      <span style={{ font: "400 14.5px/22px var(--font)", color: "var(--ink-4)", maxWidth: 400 }}>
        {deck
          ? `Nothing in ${deck.title} is due${next ? ` until ${new Date(next).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}` : ""}. Spacing reviews out is what makes them stick.`
          : "No cards are due today. Spacing reviews out is what makes them stick."}
      </span>
      <div style={{ display: "flex", gap: 10, marginTop: 6, flexWrap: "wrap", justifyContent: "center" }}>
        <button className="btn btn-outline" onClick={onCram}>Review ahead anyway</button>
        {onDelete && (
          <button className="btn btn-ghost" style={{ color: "var(--wine)" }} onClick={onDelete}>
            {confirming ? "Confirm: delete deck" : "Delete deck"}
          </button>
        )}
      </div>
    </div>
  );
}

function NewDeckDialog({
  open,
  course,
  model,
  onClose,
  onCreated,
  onNeedMaterial,
}: {
  open: boolean;
  course: Course;
  model: string;
  onClose: () => void;
  onCreated: (deck: Deck) => void;
  onNeedMaterial: () => void;
}) {
  const toast = useToast();
  const [count, setCount] = useState(12);
  const [busy, setBusy] = useState(false);
  const [materialIds, setMaterialIds] = useState<string[] | null>(null);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      const r = await window.exee.listMaterials(course.id);
      setMaterialIds(isFailure(r) ? [] : r.data.map((m) => m.id));
    })();
  }, [open, course.id]);

  const generate = async () => {
    if (!materialIds?.length) return;
    setBusy(true);
    const r = await window.exee.generateFlashcards({ model, courseId: course.id, courseName: course.name, title: `${course.code || course.name} deck`, materialIds, count });
    setBusy(false);
    if (isFailure(r)) return toast(r.message, "error");
    onCreated(r.data);
  };

  return (
    <Modal open={open} onClose={busy ? () => {} : onClose} width={480} title="New deck" sub="Cards are written from every material in this course.">
      {materialIds?.length === 0 ? (
        <>
          <p style={{ font: "400 14px/21px var(--font)", color: "var(--ink-3)" }}>This course has no material yet.</p>
          <button className="btn btn-primary" onClick={onNeedMaterial}>Add study material</button>
        </>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span className="label" style={{ marginBottom: 0 }}>Cards</span>
            <div style={{ display: "flex", gap: 6 }}>
              {[8, 12, 20, 30].map((n) => (
                <button key={n} className={count === n ? "pill-toggle on" : "pill-toggle"} style={{ width: 52, height: 38, padding: 0 }} onClick={() => setCount(n)}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          <button className="btn btn-primary btn-lg" disabled={busy || !materialIds} onClick={() => void generate()}>
            {busy ? <span className="spinner spinner-light" style={{ width: 18, height: 18 }} /> : <Icon name="auto_awesome" size={20} />}
            {busy ? "Writing cards…" : "Generate deck"}
          </button>
        </>
      )}
    </Modal>
  );
}
