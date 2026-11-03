/* ============================================================
   EXETASY — App shell: sidebar, header and command palette.
   From "Exetasy redesign prototype (3)/Exetasy.dc.html".

   One deliberate change from the prototype: the profile row's
   "Free plan / Upgrade" is replaced by the ChatGPT plan status.
   Exetasy has no paid tier — the Sign in with ChatGPT Terms
   require students to reach their plan "without paying you or
   upgrading to a paid version of your application".
   ============================================================ */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Avatar, Bar, IS_MAC, Icon, Logo, daysUntil } from "./ui";
import type { Course, SessionState } from "./types";

export type Route = "overview" | "exams" | "flashcards" | "materials" | "plan" | "coach" | "settings";

export const NAV: Array<{ id: Route; label: string; icon: string }> = [
  { id: "overview", label: "Overview", icon: "space_dashboard" },
  { id: "exams", label: "Practice exams", icon: "quiz" },
  { id: "flashcards", label: "Flashcards", icon: "style" },
  { id: "materials", label: "Study materials", icon: "library_books" },
  { id: "plan", label: "Study plan", icon: "calendar_month" },
  { id: "coach", label: "AI coach", icon: "auto_awesome" },
];

export interface PaletteItem {
  label: string;
  icon: string;
  group: "PAGE" | "ACTION" | "TOPIC" | "COURSE";
  run: () => void;
}

export function examCountdown(course: Course | undefined): string | null {
  if (!course?.examDate) return null;
  const n = daysUntil(course.examDate);
  const label = course.examLabel || "Exam";
  if (n < 0) return `${label} has passed`;
  if (n === 0) return `${label} is today`;
  return `${label} in ${n} day${n === 1 ? "" : "s"}`;
}

export function AppShell({
  route,
  nav,
  title,
  subtitle,
  chrome = true,
  session,
  course,
  courses,
  readinessPct,
  streak,
  dueCards,
  palette,
  onSwitchCourse,
  onNewCourse,
  onEditCourse,
  onOpenUsage,
  children,
}: {
  route: Route;
  nav: (to: Route) => void;
  title: string;
  subtitle: string;
  /** False for full-bleed pages (the coach manages its own height). */
  chrome?: boolean;
  session: SessionState;
  course: Course | undefined;
  courses: Course[];
  readinessPct: number | null;
  streak: number;
  dueCards: number;
  palette: PaletteItem[];
  onSwitchCourse: (id: string) => void;
  onNewCourse: () => void;
  onEditCourse: () => void;
  onOpenUsage: () => void;
  children: ReactNode;
}) {
  const [narrow, setNarrow] = useState(() => window.innerWidth < 1080);
  const [courseMenu, setCourseMenu] = useState(false);
  const [palOpen, setPalOpen] = useState(false);

  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < 1080);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const wide = !narrow;
  const email = session.identity?.email ?? session.profileLabel ?? "";
  const displayName = session.identity?.name || email.split("@")[0] || "Student";
  const countdown = examCountdown(course);

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--cream)" }}>
      {/* ---------------- sidebar ---------------- */}
      <aside
        className="drag"
        style={{
          width: wide ? 252 : 76,
          flexShrink: 0,
          height: "100vh",
          position: "sticky",
          top: 0,
          display: "flex",
          flexDirection: "column",
          gap: 22,
          padding: IS_MAC ? "40px 14px 18px" : "22px 14px 18px",
          background: "var(--side)",
          borderRight: "1px solid var(--line)",
          transition: "width .25s var(--ease)",
        }}
      >
        <button onClick={() => nav("overview")} style={{ padding: "0 6px", alignSelf: "flex-start" }} title="Overview">
          <Logo size={36} text={wide} />
        </button>

        <nav style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {NAV.map((n) => {
            const on = route === n.id;
            return (
              <button
                key={n.id}
                className={on ? "nav-item on" : "nav-item"}
                onClick={() => nav(n.id)}
                title={n.label}
                style={{ justifyContent: wide ? "flex-start" : "center" }}
              >
                <Icon name={n.icon} size={21} fill={on} />
                {wide && <span style={{ flex: 1 }}>{n.label}</span>}
                {wide && n.id === "flashcards" && dueCards > 0 && <span className="nav-badge">{dueCards}</span>}
              </button>
            );
          })}
        </nav>

        <div style={{ flex: 1 }} />

        {/* current course */}
        <div style={{ position: "relative" }}>
          {wide ? (
            <button
              onClick={() => setCourseMenu((o) => !o)}
              className="lift"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
                padding: 16,
                width: "100%",
                borderRadius: 14,
                background: "var(--paper)",
                border: "1px solid var(--line)",
                textAlign: "left",
              }}
            >
              <span className="eyebrow" style={{ fontSize: 10.5, letterSpacing: ".1em", display: "flex", justifyContent: "space-between" }}>
                Current course
                <Icon name="unfold_more" size={16} />
              </span>
              <span style={{ font: "500 17px/22px var(--font)" }} className="ellipsis">
                {course ? `${course.code ? `${course.code} · ` : ""}${course.name}` : "No course yet"}
              </span>
              <span style={{ display: "flex", justifyContent: "space-between", gap: 8, font: "500 12px/16px var(--font)", color: "var(--ink-3)" }}>
                <span className="ellipsis">{course ? (countdown ?? "Set an exam date") : "Create one to begin"}</span>
                {readinessPct !== null && <span>{readinessPct}%</span>}
              </span>
              <Bar value={readinessPct ?? 0} />
            </button>
          ) : (
            <button
              className="icon-btn"
              style={{ width: 48, height: 48, margin: "0 auto", display: "flex", background: "var(--paper)", border: "1px solid var(--line)" }}
              onClick={() => setCourseMenu((o) => !o)}
              title={course?.name ?? "Courses"}
            >
              <Icon name="school" size={22} />
            </button>
          )}

          {courseMenu && (
            <CourseMenu
              courses={courses}
              currentId={course?.id}
              left={wide ? 0 : 64}
              onPick={(id) => {
                setCourseMenu(false);
                onSwitchCourse(id);
              }}
              onNew={() => {
                setCourseMenu(false);
                onNewCourse();
              }}
              onEdit={
                course
                  ? () => {
                      setCourseMenu(false);
                      onEditCourse();
                    }
                  : undefined
              }
              onClose={() => setCourseMenu(false)}
            />
          )}
        </div>

        {/* profile */}
        <button
          onClick={() => nav("settings")}
          title="Settings"
          className="nav-item"
          style={{
            padding: "6px 4px",
            gap: 10,
            justifyContent: wide ? "flex-start" : "center",
            background: route === "settings" ? "rgba(28,32,51,.06)" : undefined,
          }}
        >
          <Avatar name={displayName} />
          {wide && (
            <>
              <span style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
                <span className="ellipsis" style={{ font: "600 13.5px/18px var(--font)", color: "var(--ink)" }}>
                  {displayName}
                </span>
                <span style={{ font: "400 12px/16px var(--font)", color: session.sharing ? "var(--ink-5)" : "var(--wine)" }}>
                  {session.sharing ? "Your ChatGPT plan" : "Plan usage off"}
                </span>
              </span>
              <Icon name="settings" size={19} color="var(--ink-5)" />
            </>
          )}
        </button>
      </aside>

      {/* ---------------- main ---------------- */}
      <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <header
          className="drag"
          style={{
            position: "sticky",
            top: 0,
            zIndex: 20,
            display: "flex",
            alignItems: "center",
            gap: 16,
            padding: "18px 32px",
            background: "rgba(244,239,230,.88)",
            backdropFilter: "blur(10px)",
            borderBottom: "1px solid rgba(28,32,51,.06)",
          }}
        >
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
            <h1 className="ellipsis" style={{ font: "400 26px/1.25 var(--font)", letterSpacing: "-.01em" }}>
              {title}
            </h1>
            <span className="ellipsis" style={{ font: "400 13px/18px var(--font)", color: "var(--ink-4)" }}>
              {subtitle}
            </span>
          </div>

          <button
            onClick={() => setPalOpen(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              height: 40,
              padding: "0 10px 0 14px",
              borderRadius: 99,
              border: "1px solid var(--line)",
              background: "var(--paper)",
              color: "var(--ink-4)",
              font: "400 13.5px/1 var(--font)",
            }}
          >
            <Icon name="search" size={19} />
            {wide && <span style={{ minWidth: 150, textAlign: "left" }}>Search or jump to…</span>}
            <span className="kbd">{IS_MAC ? "⌘K" : "Ctrl K"}</span>
          </button>

          <span
            title={`${streak}-day streak`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              height: 40,
              padding: "0 14px",
              borderRadius: 99,
              background: "var(--gold-tint)",
              color: "var(--gold-ink)",
              font: "600 13px/1 var(--font)",
            }}
          >
            <Icon name="local_fire_department" size={19} fill color="var(--gold-deep)" />
            {streak}
          </span>

          <button className="icon-btn" title="ChatGPT plan usage" onClick={onOpenUsage}>
            <Icon name="speed" size={22} />
          </button>
        </header>

        {chrome ? <div style={{ flex: 1 }}>{children}</div> : children}
      </main>

      {palOpen && <Palette items={palette} onClose={() => setPalOpen(false)} />}
    </div>
  );
}

/* ---------------- course menu ---------------- */
function CourseMenu({
  courses,
  currentId,
  left,
  onPick,
  onNew,
  onEdit,
  onClose,
}: {
  courses: Course[];
  currentId?: string;
  left: number;
  onPick: (id: string) => void;
  onNew: () => void;
  onEdit?: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    // Defer so the click that opened the menu doesn't close it.
    const t = window.setTimeout(() => window.addEventListener("mousedown", onDown));
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="no-drag"
      style={{
        position: "absolute",
        bottom: "calc(100% + 8px)",
        left,
        width: 260,
        zIndex: 40,
        background: "var(--paper)",
        borderRadius: 16,
        border: "1px solid var(--line)",
        boxShadow: "var(--shadow-pop)",
        padding: 8,
        animation: "modal .2s var(--ease) both",
      }}
    >
      <div style={{ maxHeight: 260, overflowY: "auto" }}>
        {courses.map((c) => (
          <button key={c.id} className="row-btn" style={{ padding: "10px 12px" }} onClick={() => onPick(c.id)}>
            <Icon name={c.id === currentId ? "radio_button_checked" : "radio_button_unchecked"} size={18} color={c.id === currentId ? "var(--navy)" : "var(--ink-5)"} />
            <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
              <span className="ellipsis" style={{ font: "500 14px/19px var(--font)" }}>{c.name}</span>
              {c.code && <span style={{ font: "400 12px/16px var(--font)", color: "var(--ink-5)" }}>{c.code}</span>}
            </span>
          </button>
        ))}
      </div>
      {courses.length > 0 && <div style={{ height: 1, background: "var(--line)", margin: "6px 4px" }} />}
      {onEdit && (
        <button className="row-btn" style={{ padding: "10px 12px" }} onClick={onEdit}>
          <Icon name="event" size={18} color="var(--ink-3)" />
          <span style={{ font: "500 14px/19px var(--font)" }}>Course details & exam date</span>
        </button>
      )}
      <button className="row-btn" style={{ padding: "10px 12px" }} onClick={onNew}>
        <Icon name="add" size={18} color="var(--ink-3)" />
        <span style={{ font: "500 14px/19px var(--font)" }}>New course</span>
      </button>
    </div>
  );
}

/* ---------------- command palette ---------------- */
function Palette({ items, onClose }: { items: PaletteItem[]; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = window.setTimeout(() => input.current?.focus(), 20);
    return () => window.clearTimeout(t);
  }, []);

  const shown = useMemo(() => {
    const needle = q.toLowerCase().trim();
    return needle ? items.filter((i) => i.label.toLowerCase().includes(needle)) : items;
  }, [q, items]);

  useEffect(() => setActive(0), [q]);

  const run = (item: PaletteItem | undefined) => {
    if (!item) return;
    onClose();
    item.run();
  };

  return (
    <div className="scrim" style={{ zIndex: 60, alignItems: "flex-start", paddingTop: "12vh", background: "rgba(28,32,51,.36)", animationDuration: ".15s" }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 580,
          background: "var(--paper)",
          borderRadius: 20,
          overflow: "hidden",
          boxShadow: "0 40px 80px -30px rgba(28,32,51,.55)",
          animation: "modal .22s var(--ease) both",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 20px", borderBottom: "1px solid var(--line)" }}>
          <Icon name="search" size={22} color="var(--ink-5)" />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "Enter") run(shown[active]);
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(shown.length - 1, a + 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              }
            }}
            placeholder="Search pages, topics and actions…"
            style={{ flex: 1, border: 0, outline: 0, background: "transparent", font: "400 17px/24px var(--font)", minWidth: 0 }}
          />
          <span className="kbd">ESC</span>
        </div>
        <div style={{ padding: 8, maxHeight: 380, overflowY: "auto" }}>
          {shown.map((item, i) => (
            <button
              key={`${item.group}:${item.label}`}
              className="row-btn"
              onMouseEnter={() => setActive(i)}
              onClick={() => run(item)}
              style={{ gap: 14, padding: "11px 12px", background: i === active ? "var(--sand-2)" : undefined }}
            >
              <span style={{ width: 34, height: 34, borderRadius: 10, background: "var(--sand-2)", color: "var(--navy)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name={item.icon} size={19} />
              </span>
              <span style={{ flex: 1, font: "500 14.5px/20px var(--font)" }}>{item.label}</span>
              <span style={{ font: "500 11px/1 var(--font)", color: "var(--ink-5)" }}>{item.group}</span>
            </button>
          ))}
          {shown.length === 0 && (
            <div style={{ padding: 28, textAlign: "center", font: "400 14px/20px var(--font)", color: "var(--ink-5)" }}>
              No matches. Try a topic name from your course.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
