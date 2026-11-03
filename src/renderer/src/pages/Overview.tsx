import { useEffect, useMemo, useState } from "react";
import type { Route } from "../AppShell";
import { buildPlan, doneKey, rankTopics } from "../plan";
import { Bar, CardHead, Icon, MONTHS, Ring, WEEKDAYS, daysUntil, parseDay, scoreColor } from "../ui";
import { isFailure, type Attempt, type Course, type Readiness } from "../types";

export function Overview({
  course,
  readiness,
  dueCards,
  refreshKey,
  planDone,
  onTogglePlan,
  nav,
  onDrill,
  onNewExam,
  onUpload,
  onEditCourse,
}: {
  course: Course;
  readiness: Readiness | null;
  dueCards: number;
  refreshKey: number;
  planDone: Record<string, boolean>;
  onTogglePlan: (key: string) => void;
  nav: (r: Route) => void;
  onDrill: (topic?: string) => void;
  onNewExam: () => void;
  onUpload: () => void;
  onEditCourse: () => void;
}) {
  const [attempts, setAttempts] = useState<Attempt[]>([]);

  useEffect(() => {
    void (async () => {
      const r = await window.exee.listAttempts();
      if (!isFailure(r)) setAttempts(r.data.filter((a) => a.courseId === course.id));
    })();
  }, [course.id, refreshKey]);

  const pct = readiness?.readinessPct ?? null;
  const weakest = rankTopics(readiness)[0];
  const examName = course.examLabel || "exam";
  const left = course.examDate ? daysUntil(course.examDate) : null;
  const examWhen = course.examDate
    ? (() => {
        const d = parseDay(course.examDate);
        return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
      })()
    : null;

  const today = useMemo(() => buildPlan(course, readiness)[0], [course, readiness]);
  const doneCount = today?.sessions.filter((_, i) => planDone[doneKey(course.id, today.iso, i)]).length ?? 0;

  // Last seven days of activity, from attempt start/submit times.
  const week = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - (6 - i));
      return { start: d.getTime(), label: WEEKDAYS[d.getDay()]![0]!, minutes: 0, exams: 0 };
    });
    for (const a of attempts) {
      const day = days.find((d) => a.startedAt >= d.start && a.startedAt < d.start + 86_400_000);
      if (!day) continue;
      day.exams++;
      if (a.submittedAt) day.minutes += Math.min(180, Math.round((a.submittedAt - a.startedAt) / 60_000));
    }
    return days;
  }, [attempts]);
  const weekMinutes = week.reduce((s, d) => s + d.minutes, 0);
  const weekExams = week.reduce((s, d) => s + d.exams, 0);
  const maxMinutes = Math.max(30, ...week.map((d) => d.minutes));

  const mastery = (readiness?.topics ?? []).filter((t) => t.attempted).sort((a, b) => b.mastery - a.mastery);

  const heroLine =
    pct === null
      ? "Take a practice exam and Exee AI will start measuring how ready you are, topic by topic."
      : [
          examWhen ? `The ${examName.toLowerCase()} is on ${examWhen}.` : null,
          weakest ? `${weakest} is your weak spot right now.` : null,
          weakest ? "Two focused sessions there will move your score the most." : readiness?.limiting,
        ]
          .filter(Boolean)
          .join(" ");

  return (
    <div className="page">
      <div className="row">
        {/* hero */}
        <div
          className="card-navy rise"
          style={{ flex: "1 1 560px", minWidth: 0, borderRadius: 10, padding: 34, display: "flex", gap: 32, alignItems: "center", flexWrap: "wrap", position: "relative", overflow: "hidden" }}
        >
          <div style={{ flex: "1 1 300px", minWidth: 0, display: "flex", flexDirection: "column", gap: 16, position: "relative" }}>
            <span className="eyebrow" style={{ color: "var(--gold)" }}>
              {course.code || course.name} · {course.examLabel ? `${course.examLabel} readiness` : "Exam readiness"}
            </span>
            <span className="display" style={{ fontSize: 32, lineHeight: 1.12 }}>
              {pct === null ? (
                <>Let&rsquo;s find your <em style={{ color: "var(--gold)" }}>baseline</em>.</>
              ) : (
                <>
                  You&rsquo;re <em style={{ color: "var(--gold)" }}>{pct}%</em> exam&#8209;ready.
                </>
              )}
            </span>
            <span style={{ font: "400 15.5px/23px var(--font)", color: "var(--on-navy-2)", maxWidth: 460, textWrap: "pretty" }}>{heroLine}</span>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
              <button className="btn btn-gold" onClick={() => (weakest ? onDrill(weakest) : onNewExam())}>
                <Icon name="play_arrow" size={20} fill />
                {weakest ? `Start ${weakest} drill` : "Take a practice exam"}
              </button>
              <button className="btn btn-outline-light" onClick={() => nav("coach")}>
                <Icon name="auto_awesome" size={19} />
                Ask your coach
              </button>
            </div>
          </div>
          <div style={{ margin: "0 auto" }}>
            <Ring
              value={pct}
              label="Ready"
              sub={
                readiness && pct !== null ? (
                  <span style={{ font: "600 12px/16px var(--font)", color: "var(--mint)" }}>
                    {readiness.predictedGrade ? `Tracking ${readiness.predictedGrade}` : `${readiness.riskLevel} risk`}
                  </span>
                ) : (
                  <span style={{ font: "500 12px/16px var(--font)", color: "var(--on-navy-2)" }}>No graded exams</span>
                )
              }
            />
          </div>
        </div>

        {/* today's plan */}
        <div className="card rise" style={{ flex: "1 1 320px", minWidth: 0, display: "flex", flexDirection: "column", gap: 16, animationDelay: ".08s" }}>
          <CardHead
            title="Today’s plan"
            aside={
              <span style={{ font: "500 12px/16px var(--font)", color: "var(--ink-5)" }}>
                {doneCount}/{today?.sessions.length ?? 0} done
              </span>
            }
          />
          <Bar value={today?.sessions.length ? (doneCount / today.sessions.length) * 100 : 0} color="var(--teal)" height={4} />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {today?.sessions.map((s, i) => {
              const key = doneKey(course.id, today.iso, i);
              const done = Boolean(planDone[key]);
              return (
                <button key={key} className="row-btn" style={{ alignItems: "flex-start" }} onClick={() => onTogglePlan(key)}>
                  <span
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      flexShrink: 0,
                      marginTop: 1,
                      border: `1.5px solid ${done ? "var(--teal)" : "rgba(28,32,51,.3)"}`,
                      background: done ? "var(--teal)" : "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "all .25s",
                    }}
                  >
                    {done && <Icon name="check" size={15} color="var(--paper)" style={{ animation: "pop .3s both" }} />}
                  </span>
                  <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                    <span style={{ font: "500 14.5px/20px var(--font)", color: done ? "var(--ink-5)" : "var(--ink)", textDecoration: done ? "line-through" : "none" }}>
                      {s.title}
                    </span>
                    <span style={{ font: "400 12.5px/17px var(--font)", color: "var(--ink-5)" }}>
                      {s.kind === "Review" && dueCards ? `${dueCards} cards due · ` : ""}
                      {s.minutes ? `${s.minutes} min · ` : ""}
                      {s.slot.toLowerCase()}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          <button className="btn-link" style={{ alignSelf: "flex-start", marginTop: "auto" }} onClick={() => nav("plan")}>
            Full study plan
          </button>
        </div>
      </div>

      {/* quick actions */}
      <div className="grid-fit">
        {[
          { icon: "note_add", title: "Generate an exam", desc: "From any slide deck or PDF", bg: "var(--navy-tint)", fg: "var(--navy)", go: onNewExam },
          { icon: "style", title: "Review flashcards", desc: dueCards ? `${dueCards} card${dueCards === 1 ? "" : "s"} due today` : "Nothing due — you’re caught up", bg: "var(--teal-tint)", fg: "var(--teal)", go: () => nav("flashcards") },
          { icon: "upload_file", title: "Add study material", desc: "Slides, PDFs, notes", bg: "var(--gold-tint)", fg: "var(--amber)", go: onUpload },
        ].map((q, i) => (
          <button
            key={q.title}
            onClick={q.go}
            className="card card-sm lift rise"
            style={{ display: "flex", alignItems: "center", gap: 16, textAlign: "left", animationDelay: `${0.12 + i * 0.05}s` }}
          >
            <Icon name={q.icon} size={22} color="var(--ink-4)" />
            <span style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1, minWidth: 0 }}>
              <span style={{ font: "600 15px/20px var(--font)" }}>{q.title}</span>
              <span style={{ font: "400 13px/18px var(--font)", color: "var(--ink-4)" }}>{q.desc}</span>
            </span>
            <Icon name="arrow_forward" size={20} color="var(--ink-5)" />
          </button>
        ))}
      </div>

      <div className="row">
        {/* mastery */}
        <div className="card rise" style={{ flex: "1.4 1 400px", minWidth: 0, display: "flex", flexDirection: "column", gap: 18, animationDelay: ".2s" }}>
          <CardHead title="Topic mastery" aside={mastery.length > 0 && <span style={{ font: "400 12.5px/16px var(--font)", color: "var(--ink-5)" }}>Select a topic to drill it</span>} />
          {mastery.length === 0 ? (
            <p style={{ font: "400 14px/21px var(--font)", color: "var(--ink-4)" }}>
              Mastery appears here once you&rsquo;ve submitted a practice exam. Each question is tagged with the topic it tests, so
              every attempt sharpens the picture.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {mastery.slice(0, 8).map((m, i) => {
                const v = Math.round(m.mastery);
                return (
                  <button
                    key={m.topic}
                    className="row-btn"
                    style={{ display: "grid", gridTemplateColumns: "minmax(120px,190px) minmax(0,1fr) 48px", gap: 16, padding: 10, borderRadius: 10 }}
                    onClick={() => onDrill(m.topic)}
                    title={`Drill ${m.topic}`}
                  >
                    <span className="ellipsis" style={{ font: "500 14px/20px var(--font)" }}>{m.topic}</span>
                    <Bar value={v} color={scoreColor(v)} height={8} delay={0.3 + i * 0.07} />
                    <span style={{ font: "500 13px/1 var(--font)", color: scoreColor(v), textAlign: "right" }}>{v}%</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* this week */}
        <div className="card rise" style={{ flex: "1 1 300px", minWidth: 0, display: "flex", flexDirection: "column", gap: 18, animationDelay: ".26s" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <h2 className="h-card">This week</h2>
            <span style={{ font: "400 13px/18px var(--font)", color: "var(--ink-4)" }}>
              <b style={{ fontWeight: 600, color: "var(--ink)" }}>
                {Math.floor(weekMinutes / 60) ? `${Math.floor(weekMinutes / 60)}h ` : ""}
                {weekMinutes % 60}m
              </b>{" "}
              in exams · {weekExams} attempt{weekExams === 1 ? "" : "s"}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 140, paddingTop: 8 }}>
            {week.map((w, i) => (
              <div key={w.start} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, height: "100%", justifyContent: "flex-end" }}>
                <div
                  title={`${w.minutes} min`}
                  style={{
                    width: "100%",
                    maxWidth: 30,
                    height: Math.max(6, Math.round((w.minutes / maxMinutes) * 110)),
                    borderRadius: "7px 7px 3px 3px",
                    background: i === 6 ? "var(--wine)" : "var(--navy)",
                    transformOrigin: "bottom",
                    animation: `grow .8s ${0.3 + i * 0.05}s var(--ease) both`,
                  }}
                />
                <span style={{ font: "500 11px/1 var(--font)", color: i === 6 ? "var(--ink)" : "var(--ink-5)" }}>{w.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* coming up */}
        <div className="card rise" style={{ flex: "1 1 280px", minWidth: 0, display: "flex", flexDirection: "column", gap: 14, animationDelay: ".32s" }}>
          <CardHead title="Coming up" aside={<button className="btn-link" onClick={() => nav("plan")}>Study plan</button>} />
          {buildPlan(course, readiness)
            .slice(1)
            .filter((d) => d.isExamDay || d.sessions.some((s) => s.kind === "Exam"))
            .slice(0, 3)
            .map((d) => {
              const s = d.isExamDay ? d.sessions[0]! : d.sessions.find((x) => x.kind === "Exam")!;
              return (
                <div key={d.iso} style={{ display: "flex", alignItems: "center", gap: 14, padding: "6px 0" }}>
                  <div
                    style={{
                      width: 50,
                      height: 54,
                      borderRadius: 12,
                      background: d.isExamDay ? "var(--wine)" : "var(--sand-2)",
                      color: d.isExamDay ? "var(--on-navy)" : "var(--ink-3)",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 3,
                      flexShrink: 0,
                    }}
                  >
                    <span className="tnum" style={{ font: "500 21px/1 var(--serif)" }}>{d.date.getDate()}</span>
                    <span style={{ font: "500 11px/1 var(--font)" }}>{MONTHS[d.date.getMonth()]!.slice(0, 3)}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                    <span style={{ font: "600 14px/19px var(--font)" }}>{s.title}</span>
                    <span style={{ font: "400 12.5px/17px var(--font)", color: "var(--ink-5)" }}>
                      {WEEKDAYS[d.date.getDay()]} · {d.isExamDay ? "good luck" : `${s.minutes} min`}
                    </span>
                  </div>
                </div>
              );
            })}
          {!course.examDate && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" }}>
              <p style={{ font: "400 13.5px/20px var(--font)", color: "var(--ink-4)" }}>
                Add your exam date and Exee AI will plan backwards from it.
              </p>
              <button className="btn btn-sm btn-outline" onClick={onEditCourse}>
                <Icon name="event" size={17} />
                Set exam date
              </button>
            </div>
          )}
          {left !== null && left < 0 && (
            <p style={{ font: "400 13.5px/20px var(--font)", color: "var(--ink-4)" }}>That exam date has passed. Set the next one to keep planning.</p>
          )}
        </div>
      </div>
    </div>
  );
}
