import { useCallback, useEffect, useState } from "react";
import { Bar, Icon, scoreColor, shortDate, useToast } from "../ui";
import { isFailure, type Attempt, type Course, type Exam, type ReadinessBreakdown } from "../types";

export function Exams({
  course,
  weakest,
  refreshKey,
  onNewExam,
  onDrill,
  onStart,
  onReview,
  onChanged,
}: {
  course: Course;
  /** The weakest tested topic, for the recommendation banner. */
  weakest?: ReadinessBreakdown;
  refreshKey: number;
  onNewExam: () => void;
  onDrill: (topic: string) => void;
  onStart: (exam: Exam) => void;
  onReview: (exam: Exam, attempt: Attempt) => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [exams, setExams] = useState<Exam[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [confirm, setConfirm] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [e, a] = await Promise.all([window.exee.listExams(course.id), window.exee.listAttempts()]);
    if (!isFailure(e)) setExams(e.data);
    if (!isFailure(a)) setAttempts(a.data.filter((x) => x.courseId === course.id));
  }, [course.id]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const remove = async (exam: Exam) => {
    const r = await window.exee.deleteExam(exam.id);
    if (isFailure(r)) return toast(r.message, "error");
    setConfirm(null);
    toast("Exam deleted");
    await load();
    onChanged();
  };

  const newestId = exams[0]?.id;

  return (
    <div className="page" style={{ gap: 24 }}>
      {weakest && (
        <div
          className="rise"
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 24,
            padding: "26px 28px",
            borderRadius: 10,
            background: "var(--paper)",
            border: "1px solid var(--line-2)",
          }}
        >
          <span style={{ display: "flex", color: "var(--wine)" }}>
            <Icon name="target" size={26} />
          </span>
          <div style={{ flex: "1 1 300px", display: "flex", flexDirection: "column", gap: 4 }}>
            <span className="eyebrow">Recommended next</span>
            <span style={{ font: "500 22px/28px var(--serif)", letterSpacing: "-.01em" }}>
              {weakest.topic} is at {Math.round(weakest.mastery)}%. A 6&#8209;question drill takes about 9 minutes.
            </span>
          </div>
          <button className="btn btn-primary" onClick={() => onDrill(weakest.topic)}>
            Start drill
          </button>
        </div>
      )}

      <div className="grid-auto">
        <button
          onClick={onNewExam}
          className="dropzone rise"
          style={{ minHeight: 220, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, color: "var(--ink-3)", animationDelay: ".05s", background: "transparent" }}
        >
          <span style={{ width: 52, height: 52, borderRadius: "50%", background: "var(--navy)", color: "var(--on-navy)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="add" size={26} />
          </span>
          <span style={{ font: "500 19px/24px var(--font)", color: "var(--ink)" }}>New practice exam</span>
          <span style={{ font: "400 13px/18px var(--font)" }}>Built from any of your materials</span>
        </button>

        {exams.map((exam, i) => {
          const graded = attempts.find((a) => a.examId === exam.id && a.result);
          const result = graded?.result;
          const pct = result ? Math.round((result.score / Math.max(1, result.maxScore)) * 100) : null;
          const color = pct === null ? "var(--ink-5)" : scoreColor(pct);
          const topics = [...new Set(exam.questions.map((q) => q.topic).filter(Boolean))];
          return (
            <div
              key={exam.id}
              className="card card-sm lift rise"
              style={{ minHeight: 220, display: "flex", flexDirection: "column", gap: 14, padding: 22, borderRadius: 10, animationDelay: `${0.08 + i * 0.05}s` }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                  <span style={{ font: "600 15px/20px var(--font)" }}>{exam.title}</span>
                  <span className="ellipsis" style={{ font: "400 12.5px/17px var(--font)", color: "var(--ink-5)" }}>
                    {topics.length ? topics.slice(0, 3).join(" · ") : "Whole course"}
                  </span>
                </div>
                {exam.id === newestId && !result ? (
                  <span className="chip chip-teal">New</span>
                ) : (
                  <button className="icon-btn icon-btn-sm" title="Delete exam" onClick={() => setConfirm(confirm === exam.id ? null : exam.id)}>
                    <Icon name="more_horiz" size={20} />
                  </button>
                )}
              </div>

              {confirm === exam.id ? (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 10 }}>
                  <span style={{ font: "400 13.5px/19px var(--font)", color: "var(--ink-3)" }}>Delete this exam and its attempts?</span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn btn-sm btn-danger" style={{ flex: 1 }} onClick={() => void remove(exam)}>Delete</button>
                    <button className="btn btn-sm btn-soft" style={{ flex: 1 }} onClick={() => setConfirm(null)}>Keep</button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ flex: 1, display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
                    <span className="tnum" style={{ font: "500 36px/1 var(--serif)", color }}>
                      {pct === null ? "—" : pct}
                      {pct !== null && <span style={{ fontSize: 22 }}>%</span>}
                    </span>
                    <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, font: "500 12px/16px var(--font)", color: "var(--ink-4)" }}>
                      <span>{exam.questions.length} question{exam.questions.length === 1 ? "" : "s"}</span>
                      <span>{exam.timeLimit ? `${exam.timeLimit} min · ` : "Untimed · "}{shortDate(graded?.gradedAt ?? exam.createdAt)}</span>
                    </span>
                  </div>
                  <Bar value={pct ?? 0} color={color} delay={0.2} />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn btn-sm btn-outline" style={{ flex: 1 }} onClick={() => onStart(exam)}>
                      {result ? "Retake" : "Start"}
                    </button>
                    <button className="btn btn-sm btn-soft" style={{ flex: 1 }} disabled={!graded} onClick={() => graded && onReview(exam, graded)}>
                      Review
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
