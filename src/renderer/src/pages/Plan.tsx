import { useMemo, useState } from "react";
import { buildPlan, doneKey, type PlanSession, type SessionKind } from "../plan";
import { Icon, MONTHS, longDate } from "../ui";
import type { Course, Readiness } from "../types";

const KIND: Record<SessionKind, string> = {
  Practice: "var(--navy)",
  Review: "var(--teal)",
  Reading: "var(--gold-deep)",
  Exam: "var(--wine)",
  "Test day": "var(--wine)",
};

const WD = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

export function Plan({
  course,
  readiness,
  done,
  onToggle,
  onDrill,
  onFullExam,
  onReview,
  onRead,
  onCoach,
  onSetDate,
}: {
  course: Course;
  readiness: Readiness | null;
  done: Record<string, boolean>;
  onToggle: (key: string) => void;
  onDrill: (topic: string) => void;
  onFullExam: () => void;
  onReview: () => void;
  onRead: () => void;
  onCoach: () => void;
  onSetDate: () => void;
}) {
  const days = useMemo(() => buildPlan(course, readiness), [course, readiness]);
  const [sel, setSel] = useState(0);
  const day = days[Math.min(sel, days.length - 1)]!;
  const examDay = days.find((d) => d.isExamDay);
  const examName = course.examLabel || "exam";

  const start = (s: PlanSession) => {
    if (s.kind === "Practice" && s.topic) return onDrill(s.topic);
    if (s.kind === "Practice" || s.kind === "Exam") return onFullExam();
    if (s.kind === "Review") return onReview();
    if (s.kind === "Reading") return onRead();
  };

  const top =
    day.offset === 0
      ? "Today"
      : day.isExamDay
        ? `${examName} day`
        : examDay
          ? `${examDay.offset - day.offset} day${examDay.offset - day.offset === 1 ? "" : "s"} before the ${examName.toLowerCase()}`
          : `In ${day.offset} day${day.offset === 1 ? "" : "s"}`;

  return (
    <div className="page" style={{ maxWidth: 1100, gap: 22 }}>
      <div className="rise" style={{ display: "flex", gap: 8, overflowX: "auto", padding: "4px 2px 10px" }}>
        {days.map((d, i) => {
          const on = i === sel;
          return (
            <button
              key={d.iso}
              onClick={() => setSel(i)}
              style={{
                flex: "0 0 64px",
                height: 88,
                borderRadius: 8,
                border: `1px solid ${on ? "var(--navy)" : d.isExamDay ? "rgba(142,44,58,.3)" : "var(--line)"}`,
                background: on ? "var(--navy)" : d.isExamDay ? "var(--wine-tint)" : "var(--paper)",
                color: on ? "var(--on-navy)" : d.isExamDay ? "var(--wine)" : "var(--ink)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                transition: "all .2s var(--ease)",
              }}
            >
              <span style={{ font: "500 11.5px/1 var(--font)", opacity: 0.85 }}>{i === 0 ? "Today" : WD[d.date.getDay()]}</span>
              <span style={{ font: "500 24px/1 var(--serif)", fontVariantNumeric: "tabular-nums" }}>{d.date.getDate()}</span>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: d.isExamDay ? "var(--wine)" : on ? "var(--gold)" : "var(--gold-deep)" }} />
            </button>
          );
        })}
      </div>

      <div className="row">
        <div key={day.iso} className="card rise" style={{ flex: "1.5 1 420px", padding: 28, display: "flex", flexDirection: "column", gap: 12 }}>
          <span className="eyebrow" style={{ letterSpacing: ".1em" }}>{top}</span>
          <span style={{ font: "500 28px/1.15 var(--serif)", letterSpacing: "-.015em", marginBottom: 8 }}>{longDate(day.date)}</span>
          {day.sessions.map((s, j) => {
            const key = doneKey(course.id, day.iso, j);
            const isDone = Boolean(done[key]);
            const actionable = s.kind !== "Test day";
            return (
              <div
                key={key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  padding: 16,
                  borderRadius: 8,
                  border: "1px solid var(--line)",
                  background: isDone ? "var(--hover)" : "var(--paper)",
                  animation: `rise .4s ${j * 0.06}s both`,
                }}
              >
                <span style={{ font: "500 13px/1 var(--font)", color: "var(--ink-4)", width: 70, flexShrink: 0 }}>{s.slot}</span>
                <span style={{ width: 4, alignSelf: "stretch", borderRadius: 4, background: KIND[s.kind] }} />
                <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                  <span style={{ font: "600 15px/20px var(--font)", textDecoration: isDone ? "line-through" : "none", color: isDone ? "var(--ink-5)" : "var(--ink)" }}>{s.title}</span>
                  <span style={{ font: "400 12.5px/17px var(--font)", color: "var(--ink-5)" }}>
                    {s.kind}
                    {s.minutes ? ` · ${s.minutes} min` : " · you’ve got this"}
                  </span>
                </span>
                {actionable && day.offset === 0 && !isDone && (
                  <button className="btn btn-sm btn-soft" onClick={() => start(s)}>
                    Start
                  </button>
                )}
                {actionable && (
                  <button title={isDone ? "Mark as not done" : "Mark as done"} onClick={() => onToggle(key)} style={{ display: "flex" }}>
                    <Icon name="check_circle" size={26} fill={isDone} color={isDone ? "var(--teal)" : "var(--track)"} />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="card-navy rise" style={{ flex: "1 1 280px", borderRadius: 10, padding: 28, display: "flex", flexDirection: "column", gap: 14, alignSelf: "flex-start", animationDelay: ".14s" }}>
          <span className="eyebrow" style={{ color: "var(--on-navy-2)" }}>How this plan works</span>
          <span style={{ font: "500 22px/1.3 var(--serif)" }}>
            {examDay
              ? `Built backwards from ${MONTHS[examDay.date.getMonth()]} ${examDay.date.getDate()}, weighted toward your weakest topics.`
              : "A rolling week, weighted toward your weakest topics."}
          </span>
          <span style={{ font: "400 14px/21px var(--font)", color: "var(--on-navy-2)" }}>
            Drills target the topics with the lowest mastery. Every exam you submit updates readiness, and the plan rebalances around the new numbers. It&rsquo;s worked out on your computer — no plan usage.
          </span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            {!course.examDate && (
              <button className="btn btn-sm btn-gold" onClick={onSetDate}>
                <Icon name="event" size={17} />
                Set exam date
              </button>
            )}
            <button className="btn btn-sm btn-outline-light" onClick={onCoach}>
              Adjust with your coach
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
