/* ============================================================
   EXETASY — Exam run
   From the prototype's EXAM screen. Multiple choice is checked
   instantly against the answer key on this machine (no plan
   usage); written answers are graded by the model on submit.

   The focus chip is driven by real window blur events — no
   camera, nothing uploaded, nothing fabricated.
   ============================================================ */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon, IS_MAC, Modal } from "../ui";
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
          <span className="display" style={{ fontSize: 32, lineHeight: 1.15 }}>Marking your answers like your professor would.</span>
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
          background: "rgba(244,239,230,.92)",
          backdropFilter: "blur(10px)",
          borderBottom: "1px solid rgba(28,32,51,.06)",
        }}
      >
        <button className="icon-btn" title="Exit exam" onClick={() => setConfirm("exit")}>
          <Icon name="close" size={22} />
        </button>
        <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0, maxWidth: 280 }}>
          <span className="ellipsis" style={{ font: "500 17px/22px var(--font)" }}>{exam.title}</span>
          <span style={{ font: "500 11.5px/16px var(--font)", color: "var(--ink-5)" }}>
            QUESTION {idx + 1} OF {questions.length}
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
                    ? "#a9a08f"
                    : "var(--track)";
            return (
              <button
                key={x.id}
                title={`Question ${i + 1}`}
                onClick={() => i !== idx && goTo(i)}
                style={{ flex: 1, height: 6, borderRadius: 9, background: bg, transition: "background .35s" }}
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
            borderRadius: 99,
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
      <div style={{ flex: 1, display: "flex", justifyContent: "center", padding: "44px 24px 140px" }}>
        <div
          style={{
            width: "100%",
            maxWidth: 760,
            display: "flex",
            flexDirection: "column",
            gap: 26,
            opacity: fading ? 0 : 1,
            transform: fading ? "translateY(-10px)" : "none",
            transition: "opacity .22s, transform .22s var(--ease)",
          }}
        >
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {q.topic && <span className="tag">{q.topic}</span>}
            <span className="tag" style={{ background: "var(--sand)", color: "var(--ink-3)" }}>
              {q.type === "mc" ? "Multiple choice" : q.type === "sa" ? "Short answer" : "Long answer"} · {q.marks} marks
            </span>
          </div>
          <span style={{ font: "400 32px/1.3 var(--font)", letterSpacing: "-.01em", textWrap: "pretty", whiteSpace: "pre-wrap" }}>{q.text}</span>

          {q.type === "mc" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {q.options.map((text, k) => {
                let cls = "option";
                let icon = "";
                if (!isChecked && value === k) cls += " selected";
                if (isChecked) {
                  if (k === q.correct) {
                    cls += " correct";
                    icon = "check_circle";
                  } else if (k === value) {
                    cls += " wrong";
                    icon = "cancel";
                  } else cls += " dim";
                }
                return (
                  <button key={k} className={cls} disabled={isChecked} onClick={() => pick(k)}>
                    <span className="letter">{String.fromCharCode(65 + k)}</span>
                    <span style={{ flex: 1, font: "500 16px/23px var(--font)", color: "var(--ink)" }}>{text}</span>
                    {icon && <Icon name={icon} size={24} fill color={k === q.correct ? "var(--teal)" : "var(--wine)"} style={{ animation: "pop .35s both" }} />}
                  </button>
                );
              })}
            </div>
          ) : (
            <textarea
              className="field"
              autoFocus
              style={{ minHeight: q.type === "la" ? 320 : 200, borderRadius: 18, padding: "18px 20px", font: "400 16px/25px var(--font)" }}
              placeholder="Type your answer. The grader awards partial credit for the key concepts."
              value={String(value ?? "")}
              onChange={(e) => setAnswers((a) => ({ ...a, [String(q.id)]: e.target.value }))}
            />
          )}

          {q.type === "mc" && isChecked && (
            <div style={{ display: "flex", gap: 16, padding: 22, borderRadius: 18, background: correctNow ? "var(--teal-tint)" : "var(--wine-tint)", animation: "rise .4s var(--ease) both" }}>
              <Icon name={correctNow ? "check_circle" : "lightbulb"} size={26} fill color={correctNow ? "var(--teal)" : "var(--wine)"} />
              <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
                <span style={{ font: "500 20px/26px var(--font)", color: correctNow ? "var(--teal)" : "var(--wine)" }}>
                  {correctNow ? "Correct." : `Not quite — the answer is ${q.options[q.correct]}.`}
                </span>
                {q.explanation && <span style={{ font: "400 15px/23px var(--font)", color: "var(--ink-2)", textWrap: "pretty" }}>{q.explanation}</span>}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ---------- footer ---------- */}
      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, display: "flex", justifyContent: "center", padding: "16px 24px", background: "linear-gradient(to top, var(--cream) 60%, rgba(244,239,230,0))" }}>
        <div style={{ width: "100%", maxWidth: 760, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
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
