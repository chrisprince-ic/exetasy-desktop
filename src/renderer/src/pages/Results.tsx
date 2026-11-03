import { useState } from "react";
import { Icon, Ring } from "../ui";
import type { Attempt, Exam, ExamQuestion, Readiness } from "../types";

export function Results({
  exam,
  attempt,
  before,
  after,
  onRetake,
  onFlashcards,
  onDone,
}: {
  exam: Exam;
  attempt: Attempt;
  /** Readiness snapshots around this attempt; null when reviewing an old one. */
  before: Readiness | null;
  after: Readiness | null;
  onRetake: () => void;
  onFlashcards: () => void;
  onDone: () => void;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const result = attempt.result;

  if (!result) {
    return (
      <div className="page">
        <div className="card" style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 16, alignItems: "center" }}>
          <p className="muted">This attempt hasn&rsquo;t been graded.</p>
          <button className="btn btn-primary" onClick={onDone}>Back to overview</button>
        </div>
      </div>
    );
  }

  const pct = Math.round((result.score / Math.max(1, result.maxScore)) * 100);
  const byId = new Map(result.perQuestion.map((p) => [p.id, p]));
  const correct = result.perQuestion.filter((p) => p.awarded >= p.max / 2).length;
  const missed = result.perQuestion.length - correct;
  const secs = attempt.submittedAt ? Math.round((attempt.submittedAt - attempt.startedAt) / 1000) : null;
  const fresh = Boolean(after);
  const ring = after?.readinessPct ?? null;
  const delta = after?.readinessPct != null && before?.readinessPct != null ? after.readinessPct - before.readinessPct : null;

  const touched = [...new Set(exam.questions.map((q) => q.topic).filter((t): t is string => Boolean(t)))];
  const topicDelta = after
    ? touched
        .map((t) => {
          const now = after.topics.find((x) => x.topic === t);
          const was = before?.topics.find((x) => x.topic === t);
          if (!now) return null;
          return { name: t, now: Math.round(now.mastery), d: Math.round(now.mastery - (was?.attempted ? was.mastery : 0)), first: !was?.attempted };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
    : [];

  return (
    <div className="page" style={{ maxWidth: 1100 }}>
      <div className="row">
        <div className="card rise" style={{ flex: "1.3 1 420px", padding: 32, display: "flex", flexDirection: "column", gap: 14 }}>
          <span className="eyebrow" style={{ color: "var(--teal)" }}>
            Exam complete{secs !== null ? ` · ${Math.floor(secs / 60)}M ${secs % 60}S` : ""}
          </span>
          <span className="display" style={{ fontSize: 44, lineHeight: 1.05 }}>
            {pct >= 70 ? "Strong work." : pct >= 45 ? "Good effort — the gaps are clear now." : "A useful baseline."}
          </span>
          <span style={{ font: "400 15.5px/23px var(--font)", color: "var(--ink-3)", maxWidth: 520, textWrap: "pretty" }}>
            You scored <b style={{ color: "var(--ink)" }}>{result.score} of {result.maxScore}</b> marks ({pct}%).{" "}
            {result.summary}
            {fresh && missed > 0 && ` ${missed} missed question${missed === 1 ? " was" : "s were"} added to your Mistakes deck.`}
          </span>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
            <button className="btn btn-primary" onClick={onFlashcards}>Review mistakes</button>
            <button className="btn btn-outline" onClick={onRetake}>Retake</button>
            <button className="btn btn-ghost" onClick={onDone}>Back to overview</button>
          </div>
        </div>

        <div className="card-navy rise" style={{ flex: "1 1 300px", borderRadius: 22, padding: 30, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, animationDelay: ".1s" }}>
          {fresh ? (
            <>
              <Ring value={ring} size={170} label="READINESS" />
              {delta !== null && (
                <span
                  style={{
                    font: "600 13px/1 var(--font)",
                    padding: "8px 14px",
                    borderRadius: 99,
                    background: delta >= 0 ? "rgba(158,209,190,.16)" : "rgba(232,150,160,.16)",
                    color: delta >= 0 ? "var(--mint)" : "#f0a9b2",
                    animation: "pop .4s 1.2s both",
                  }}
                >
                  {delta >= 0 ? "+" : ""}
                  {delta} readiness points
                </span>
              )}
              {delta === null && ring !== null && <span style={{ font: "500 13px/1 var(--font)", color: "var(--on-navy-2)" }}>Your first measured score</span>}
            </>
          ) : (
            <Ring value={pct} size={170} label="SCORE" />
          )}
        </div>
      </div>

      <div className="row">
        <div className="card rise" style={{ flex: "1.5 1 420px", display: "flex", flexDirection: "column", gap: 6, animationDelay: ".18s" }}>
          <h2 className="h-card" style={{ marginBottom: 8 }}>Question review</h2>
          {exam.questions.map((q: ExamQuestion, i) => {
            const g = byId.get(q.id);
            const ok = g ? g.awarded >= g.max / 2 : false;
            const given = attempt.answers[String(q.id)];
            const isOpen = open === q.id;
            const detail =
              q.type === "mc"
                ? ok
                  ? `Correct · ${q.options[q.correct] ?? ""}`
                  : given === undefined
                    ? `Not answered · Answer: ${q.options[q.correct] ?? ""}`
                    : `You chose ${q.options[Number(given)] ?? "—"} · Answer: ${q.options[q.correct] ?? ""}`
                : `${g?.awarded ?? 0} of ${q.marks} marks${g?.feedback ? ` · ${g.feedback}` : ""}`;
            return (
              <div key={q.id} style={{ borderTop: "1px solid rgba(28,32,51,.07)" }}>
                <button onClick={() => setOpen(isOpen ? null : q.id)} style={{ display: "flex", gap: 14, padding: "12px 0", width: "100%", textAlign: "left" }}>
                  <Icon name={ok ? "check_circle" : "cancel"} size={22} fill color={ok ? "var(--teal)" : "var(--wine)"} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0, flex: 1 }}>
                    <span style={{ font: "500 14.5px/20px var(--font)" }}>
                      {i + 1}. {q.text}
                    </span>
                    <span style={{ font: "400 13px/18px var(--font)", color: "var(--ink-4)" }}>{detail}</span>
                  </div>
                  <Icon name={isOpen ? "expand_less" : "expand_more"} size={20} color="var(--ink-5)" />
                </button>
                {isOpen && (
                  <div className="fade" style={{ display: "flex", flexDirection: "column", gap: 12, padding: "0 0 16px 36px" }}>
                    {q.type !== "mc" && (
                      <Panel label="Your answer">{String(given ?? "").trim() || "Not answered"}</Panel>
                    )}
                    <Panel label={q.type === "mc" ? "Why" : "Model answer"}>
                      {q.type === "mc" ? q.explanation || `The answer is ${q.options[q.correct]}.` : q.modelAnswer || "No model answer was returned."}
                    </Panel>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="card rise" style={{ flex: "1 1 280px", display: "flex", flexDirection: "column", gap: 14, alignSelf: "flex-start", animationDelay: ".24s" }}>
          <h2 className="h-card">{topicDelta.length ? "Mastery changes" : "Revise these next"}</h2>
          {topicDelta.map((t) => (
            <div key={t.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <span style={{ font: "500 14px/20px var(--font)" }}>{t.name}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ font: "500 13px/1 var(--font)", color: "var(--ink-4)" }}>{t.now}%</span>
                <span className={t.first ? "chip chip-navy" : t.d >= 0 ? "chip chip-teal" : "chip chip-wine"} style={{ font: "600 12px/1 var(--font)", padding: "5px 8px" }}>
                  {t.first ? "new" : `${t.d >= 0 ? "+" : ""}${t.d}`}
                </span>
              </span>
            </div>
          ))}
          {!topicDelta.length &&
            (result.weakTopics.length ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {result.weakTopics.map((t) => (
                  <span key={t} className="chip chip-gold">{t}</span>
                ))}
              </div>
            ) : (
              <p className="muted" style={{ font: "400 13.5px/20px var(--font)" }}>Nothing flagged on this attempt.</p>
            ))}
          <p style={{ font: "400 12px/18px var(--font)", color: "var(--ink-5)", marginTop: 6 }}>
            Questions and grades are AI-generated. Check anything surprising against your notes.
          </p>
        </div>
      </div>
    </div>
  );
}

function Panel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span className="eyebrow" style={{ fontSize: 10.5 }}>{label}</span>
      <div style={{ font: "400 14px/21px var(--font)", color: "var(--ink-2)", whiteSpace: "pre-wrap", background: "var(--hover)", padding: "12px 14px", borderRadius: 12 }}>{children}</div>
    </div>
  );
}
