/* ============================================================
   EXEE AI — Exam run
   The question is set on an exam sheet and marked in red pen. Multiple choice is checked
   instantly against the answer key on this machine (no plan
   usage); written answers are graded by the model on submit.

   The focus chip is driven by real window blur events — no
   camera, nothing uploaded, nothing fabricated.
   ============================================================ */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon, IS_MAC, Modal } from "../ui";

/** Red-pen marks drawn over a checked option. */
function PenRing() {
  return (
    <svg className="pen pen-ring" viewBox="0 0 200 100" preserveAspectRatio="none" aria-hidden="true">
      <path vectorEffect="non-scaling-stroke" d="M10 58 C 4 26, 52 6, 104 7 S 197 24, 194 54 S 148 96, 90 94 S 4 86, 14 38" />
    </svg>
  );
}
function PenTick() {
  return (
    <svg className="pen pen-mark" viewBox="0 0 26 26" aria-hidden="true">
      <path d="M3 14 L10 22 L24 3" />
    </svg>
  );
}
function PenCross() {
  return (
    <svg className="pen pen-mark" viewBox="0 0 26 26" aria-hidden="true">
      <path d="M4 4 L22 22" />
      <path d="M22 4 L4 22" />
    </svg>
  );
}
import type { Attempt, Exam, ExamQuestion } from "../types";

type Answers = Record<string, string | number>;

const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

export function ExamRun({
  exam,
  attempt,
  onSubmit,
  onExit,
  grading,
  progress,
}: {
  exam: Exam;
  attempt: Attempt;
  onSubmit: (answers: Answers) => void;
  onExit: () => void;
  grading: boolean;
  progress: string;
}) {
  const questions = exam.questions;
  const timed = exam.timeLimit > 0;
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Answers>(attempt.answers ?? {});
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [secs, setSecs] = useState(timed ? exam.timeLimit * 60 : 0);
  const [fading, setFading] = useState(false);
  const [blurs, setBlurs] = useState(0);
  const [confirm, setConfirm] = useState<"submit" | "exit" | null>(null);
  const submitted = useRef(false);

  const q = questions[idx] as ExamQuestion | undefined;
  const value = q ? answers[String(q.id)] : undefined;
  const isChecked = q ? Boolean(checked[q.id]) : false;
  const last = idx === questions.length - 1;
  const answered = useMemo(
    () => questions.filter((x) => answers[String(x.id)] !== undefined && answers[String(x.id)] !== "").length,
    [answers, questions],
  );

  const submit = useCallback(() => {
    if (submitted.current) return;
    submitted.current = true;
    setConfirm(null);
    onSubmit(answers);
  }, [answers, onSubmit]);

  // clock: counts down when timed, up otherwise
  useEffect(() => {
    if (grading) return;
    const t = setInterval(() => setSecs((s) => (timed ? Math.max(0, s - 1) : s + 1)), 1000);
    return () => clearInterval(t);
  }, [grading, timed]);

  useEffect(() => {
    if (timed && secs === 0 && !grading) submit();
  }, [timed, secs, grading, submit]);

  useEffect(() => {
    if (grading) return;
    const onBlur = () => setBlurs((c) => c + 1);
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, [grading]);

  const goTo = useCallback((next: number) => {
    setFading(true);
    window.setTimeout(() => {
      setIdx(next);
      setFading(false);
      window.scrollTo(0, 0);
    }, 220);
  }, []);

  const pick = useCallback(
    (i: number) => {
      if (!q || q.type !== "mc" || checked[q.id] || i >= q.options.length) return;
      setAnswers((a) => ({ ...a, [String(q.id)]: i }));
    },
    [q, checked],
  );

  const primary = useCallback(() => {
    if (!q) return;
    if (q.type === "mc" && !checked[q.id]) {
      if (value === undefined) return;
      setChecked((c) => ({ ...c, [q.id]: true }));
      return;
    }
    if (last) setConfirm("submit");
    else goTo(idx + 1);
  }, [q, checked, value, last, idx, goTo]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (confirm || grading) return;
      const typing = (e.target as HTMLElement | null)?.tagName === "TEXTAREA";
      if (!typing && ["1", "2", "3", "4"].includes(e.key)) pick(Number(e.key) - 1);
      if (e.key === "Enter" && !typing) {
        e.preventDefault();
        primary();
      }
      if (e.key === "Enter" && typing && (e.metaKey || e.ctrlKey)) primary();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirm, grading, pick, primary]);

  /* ---------------- grading ---------------- */
  if (grading) {
    return (
      <div className="drag" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 32 }}>
        <div className="rise" style={{ maxWidth: 480, display: "flex", flexDirection: "column", alignItems: "center", gap: 18, textAlign: "center" }}>
          <span className="spinner" style={{ width: 34, height: 34, borderWidth: 3 }} />
          <span className="eyebrow" style={{ color: "var(--wine)" }}>Grading</span>
          <span className="display" style={{ fontSize: 28, lineHeight: 1.2 }}>Marking your answers like your professor would.</span>
          <span style={{ font: "400 14.5px/22px var(--font)", color: "var(--ink-4)" }}>
            {progress || "Working through your written answers…"} Multiple choice was marked on your computer and used none of your plan.
          </span>
        </div>
      </div>
    );
  }

  if (!q) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 16, alignItems: "center" }}>
          <p>This exam has no questions.</p>
          <button className="btn btn-primary" onClick={onExit}>Go back</button>
        </div>
      </div>
    );
  }

  const correctNow = q.type === "mc" && isChecked && value === q.correct;
  const lowTime = timed && secs < 300;
  const btnLabel = q.type === "mc" && !isChecked ? "Check answer" : last ? "Submit for grading" : "Next question";
  const btnDisabled = q.type === "mc" && !isChecked && value === undefined;

  return (
    <div className="fade" style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* ---------- top bar ---------- */}
      <div
        className="drag"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          gap: 20,
          padding: IS_MAC ? "16px 28px 16px 92px" : "16px 28px",
          background: "var(--cream)",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <button className="icon-btn" title="Exit exam" onClick={() => setConfirm("exit")}>
          <Icon name="close" size={22} />
        </button>
        <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0, maxWidth: 280 }}>
          <span className="ellipsis" style={{ font: "500 18px/23px var(--serif)", letterSpacing: "-.01em" }}>{exam.title}</span>
          <span className="tnum" style={{ font: "500 12.5px/17px var(--font)", color: "var(--ink-4)" }}>
            Question {idx + 1} of {questions.length}
          </span>
        </div>
        <div style={{ flex: 1, display: "flex", gap: 5, minWidth: 80 }}>
          {questions.map((x, i) => {
            const v = answers[String(x.id)];
            const bg =
              x.type === "mc" && checked[x.id]
                ? v === x.correct
                  ? "var(--teal)"
                  : "var(--wine)"
                : i === idx
                  ? "var(--navy)"
                  : v !== undefined && v !== ""
                    ? "var(--ink-5)"
                    : "var(--track)";
            return (
              <button
                key={x.id}
                title={`Question ${i + 1}`}
                onClick={() => i !== idx && goTo(i)}
                style={{ flex: 1, height: 5, borderRadius: 9, background: bg, transition: "background-color .3s ease" }}
              />
            );
          })}
        </div>
        {blurs > 0 && (
          <span title="Times you switched away from this window. Tracked locally, never uploaded." className="chip chip-gold" style={{ padding: "9px 12px", fontSize: 13 }}>
            <Icon name="visibility" size={16} />
            Left {blurs}×
          </span>
        )}
        <span
          className="tnum"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            font: "500 14px/1 var(--font)",
            padding: "9px 12px",
            borderRadius: 6,
            background: lowTime ? "var(--wine-tint)" : "var(--paper)",
            color: lowTime ? "var(--wine)" : "var(--ink-3)",
            border: "1px solid var(--line)",
          }}
        >
          <Icon name="timer" size={17} />
          {mmss(secs)}
        </span>
      </div>

      {/* ---------- question ---------- */}
      <div style={{ flex: 1, display: "flex", justifyContent: "center", padding: "36px 24px 140px" }}>
        <div
          style={{
            width: "100%",
            maxWidth: 820,
            display: "flex",
            flexDirection: "column",
            gap: 24,
            opacity: fading ? 0 : 1,
            transform: fading ? "translateY(-8px)" : "none",
            transition: "opacity .2s ease, transform .2s var(--ease)",
          }}
          className="exam-sheet"
        >
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {q.topic && <span className="tag">{q.topic}</span>}
            <span className="tag" style={{ background: "transparent", color: "var(--ink-4)", paddingLeft: 0 }}>
              {q.type === "mc" ? "Multiple choice" : q.type === "sa" ? "Short answer" : "Long answer"} · {q.marks} marks
            </span>
          </div>
          <p className="exam-stem">
            <b>{idx + 1}.</b>
            <span>{q.text}</span>
          </p>

          {q.type === "mc" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginLeft: "2.1em" }}>
              {q.options.map((text, k) => {
                let cls = "option";
                if (!isChecked && value === k) cls += " selected";
                if (isChecked) {
                  if (k === q.correct) cls += " correct";
                  else if (k === value) cls += " wrong";
                  else cls += " dim";
                }
                return (
                  <button key={k} className={cls} disabled={isChecked} onClick={() => pick(k)}>
                    <span className="letter">{String.fromCharCode(65 + k)}</span>
                    <span style={{ flex: 1, font: "500 16px/23px var(--font)", color: "var(--ink)" }}>{text}</span>
                    {isChecked && k === q.correct && <PenRing />}
                    {isChecked && k === value && (k === q.correct ? <PenTick /> : <PenCross />)}
                  </button>
                );
              })}
            </div>
          ) : (
            <textarea
              className="field"
              autoFocus
              style={{ minHeight: q.type === "la" ? 320 : 200, borderRadius: 4, padding: "16px 18px", font: "400 18px/28px var(--serif)" }}
              placeholder="Type your answer. The grader awards partial credit for the key concepts."
              value={String(value ?? "")}
              onChange={(e) => setAnswers((a) => ({ ...a, [String(q.id)]: e.target.value }))}
            />
          )}

          {q.type === "mc" && isChecked && (
            <div role="status" style={{ display: "flex", flexDirection: "column", gap: 6, marginLeft: "2.1em", paddingTop: 4 }}>
              <span className={correctNow ? "margin-note ok" : "margin-note"}>
                {correctNow ? "Correct." : `Not quite — the answer is ${String.fromCharCode(65 + q.correct)}, ${q.options[q.correct]}.`}
              </span>
              {q.explanation && (
                <span style={{ font: "400 15.5px/24px var(--font)", color: "var(--ink-2)", textWrap: "pretty", animation: "fade .3s .3s both" }}>{q.explanation}</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ---------- footer ---------- */}
      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, display: "flex", justifyContent: "center", padding: "16px 24px", background: "var(--cream)", borderTop: "1px solid var(--line)" }}>
        <div style={{ width: "100%", maxWidth: 820, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <span style={{ font: "400 13px/18px var(--font)", color: "var(--ink-5)" }}>
            {q.type === "mc" ? (
              <>
                Press <b style={{ fontWeight: 500, color: "var(--ink-3)" }}>1–4</b> to choose · <b style={{ fontWeight: 500, color: "var(--ink-3)" }}>Enter</b> to {isChecked ? "continue" : "check"}
              </>
            ) : (
              <>
                <b style={{ fontWeight: 500, color: "var(--ink-3)" }}>{IS_MAC ? "⌘" : "Ctrl"} Enter</b> to continue
              </>
            )}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            {idx > 0 && (
              <button className="btn btn-lg btn-ghost" onClick={() => goTo(idx - 1)}>
                Back
              </button>
            )}
            <button className="btn btn-lg btn-primary" disabled={btnDisabled} onClick={primary}>
              {btnLabel}
              <Icon name="arrow_forward" size={20} />
            </button>
          </div>
        </div>
      </div>

      <Modal
        open={confirm === "submit"}
        onClose={() => setConfirm(null)}
        width={460}
        title="Submit for grading?"
        sub={`You've answered ${answered} of ${questions.length} questions.${answered < questions.length ? " Unanswered questions score zero." : ""}`}
      >
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button className="btn btn-ghost" onClick={() => setConfirm(null)}>Keep working</button>
          <button className="btn btn-primary" onClick={submit}>Submit</button>
        </div>
      </Modal>

      <Modal open={confirm === "exit"} onClose={() => setConfirm(null)} width={460} title="Leave this exam?" sub="Your answers in this attempt won't be graded. The exam stays in Practice exams so you can retake it.">
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button className="btn btn-ghost" onClick={() => setConfirm(null)}>Keep going</button>
          <button className="btn btn-danger" onClick={onExit}>Leave exam</button>
        </div>
      </Modal>
    </div>
  );
}
