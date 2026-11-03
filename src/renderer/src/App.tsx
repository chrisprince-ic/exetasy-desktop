import { useCallback, useEffect, useMemo, useState } from "react";
import { ContinueWithChatGPTButton } from "@siwc/react";
import { AppShell, NAV, examCountdown, type PaletteItem, type Route } from "./AppShell";
import { CourseDialog, NewExamDialog, examMinutes, questionMix, type ExamConfig, type ExamPreset } from "./dialogs";
import { rankTopics } from "./plan";
import { EmptyState, Icon, IS_MAC, Logo, longDate, useToast } from "./ui";
import { Overview } from "./pages/Overview";
import { Exams } from "./pages/Exams";
import { Generating } from "./pages/Generating";
import { ExamRun } from "./pages/ExamRun";
import { Results } from "./pages/Results";
import { Materials } from "./pages/Materials";
import { Flashcards } from "./pages/Flashcards";
import { Plan } from "./pages/Plan";
import { Coach } from "./pages/Coach";
import { Settings } from "./pages/Settings";
import {
  isFailure,
  type Attempt,
  type ChatGPTModel,
  type CoachTurn,
  type Course,
  type Deck,
  type Exam,
  type Readiness,
  type SessionState,
  type Stats,
} from "./types";

/** Full-screen state while the exam runner owns the window. */
type Running = { exam: Exam; attempt: Attempt; before: Readiness | null };
type Reviewing = { exam: Exam; attempt: Attempt; before: Readiness | null; after: Readiness | null };
type GenState = { source: string; title: string; count: number };

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
};

export function App() {
  const toast = useToast();

  const [booted, setBooted] = useState(false);
  const [session, setSession] = useState<SessionState | null>(null);
  const [models, setModels] = useState<ChatGPTModel[]>([]);
  const [model, setModel] = useState("");
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState<string | undefined>();
  const [stats, setStats] = useState<Stats | null>(null);
  const [streak, setStreak] = useState(0);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [planDone, setPlanDone] = useState<Record<string, boolean>>({});

  const [route, setRoute] = useState<Route>("overview");
  const [signingIn, setSigningIn] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [importSignal, setImportSignal] = useState(0);

  const [courseDialog, setCourseDialog] = useState<"new" | "edit" | null>(null);
  const [examPreset, setExamPreset] = useState<ExamPreset | null>(null);
  const [examDialogOpen, setExamDialogOpen] = useState(false);
  const [generating, setGenerating] = useState<GenState | null>(null);
  const [running, setRunning] = useState<Running | null>(null);
  const [reviewing, setReviewing] = useState<Reviewing | null>(null);
  const [grading, setGrading] = useState(false);
  const [progress, setProgress] = useState("");
  const [coachLog, setCoachLog] = useState<Record<string, CoachTurn[]>>({});

  const course = courses.find((c) => c.id === courseId);
  const canGenerate = session?.status === "connected" && Boolean(session.sharing) && Boolean(model);
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);
  const weakTopics = useMemo(() => rankTopics(readiness), [readiness]);
  const dueCards = useMemo(() => {
    const now = Date.now();
    return decks.reduce((n, d) => n + d.cards.filter((c) => c.due <= now).length, 0);
  }, [decks]);

  /* ---------------- bootstrap ---------------- */
  useEffect(() => window.exee.onSession(setSession), []);
  useEffect(() => window.exee.onProgress(setProgress), []);

  useEffect(() => {
    void (async () => {
      const [s, st, settings] = await Promise.all([
        window.exee.getSession(),
        window.exee.touchStreak(),
        window.exee.settings(),
      ]);
      if (!isFailure(s)) setSession(s.data);
      if (!isFailure(st)) setStreak(st.data.streak ?? 0);
      if (!isFailure(settings)) {
        if (settings.data.model) setModel(settings.data.model);
        setCourseId(settings.data.currentCourseId);
        setPlanDone(settings.data.planDone ?? {});
      }
      setBooted(true);
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      const r = await window.exee.listCourses();
      if (isFailure(r)) return;
      setCourses(r.data);
      // Fall back to the newest course when the saved one is gone.
      setCourseId((id) => (r.data.some((c) => c.id === id) ? id : r.data[0]?.id));
    })();
  }, [refreshKey]);

  useEffect(() => {
    void (async () => {
      const r = await window.exee.stats();
      if (!isFailure(r)) setStats(r.data);
    })();
  }, [refreshKey, route]);

  // Everything course-scoped reloads when the course or the data changes.
  useEffect(() => {
    if (!courseId) {
      setReadiness(null);
      setDecks([]);
      return;
    }
    void (async () => {
      const [r, d] = await Promise.all([window.exee.readiness(courseId), window.exee.listDecks(courseId)]);
      if (!isFailure(r)) setReadiness(r.data);
      if (!isFailure(d)) setDecks(d.data);
    })();
  }, [courseId, refreshKey]);

  /* ---- model catalogue: per-account, so reload when sharing changes ---- */
  useEffect(() => {
    if (session?.status !== "connected" || !session.sharing) {
      setModels([]);
      return;
    }
    void (async () => {
      const r = await window.exee.listModels();
      if (isFailure(r)) return;
      setModels(r.data);
      setModel((current) => {
        // A saved model can vanish when the account changes.
        const next = r.data.some((m) => m.slug === current) ? current : (r.data[0]?.slug ?? "");
        if (next !== current) void window.exee.updateSettings({ model: next });
        return next;
      });
    })();
  }, [session?.status, session?.sharing, session?.profileId]);

  /* ---------------- actions ---------------- */
  const switchCourse = useCallback((id: string) => {
    setCourseId(id);
    setReviewing(null);
    void window.exee.updateSettings({ currentCourseId: id });
  }, []);

  const go = useCallback((to: Route) => {
    setReviewing(null);
    setRoute(to);
    window.scrollTo(0, 0);
  }, []);

  const signIn = useCallback(async () => {
    setSigningIn(true);
    const r = await window.exee.signIn();
    setSigningIn(false);
    if (isFailure(r)) {
      if (r.code !== "cancelled") toast(r.message, "error");
      return;
    }
    setSession(r.data);
    toast("Connected to ChatGPT", "success");
  }, [toast]);

  const disconnect = useCallback(async () => {
    const r = await window.exee.disconnect();
    if (isFailure(r)) toast(r.message, "error");
  }, [toast]);

  const openUsage = useCallback(() => void window.exee.openUsage(), []);

  const needsPlan = useCallback(() => {
    if (canGenerate) return false;
    toast(session?.sharing ? "Pick a model in Settings first" : "Plan usage is off for this account", "error");
    return true;
  }, [canGenerate, session?.sharing, toast]);

  const openNewExam = useCallback(
    (preset: ExamPreset = {}) => {
      if (!course) {
        setCourseDialog("new");
        return toast("Create a course first");
      }
      if (needsPlan()) return;
      setExamPreset(preset);
      setExamDialogOpen(true);
    },
    [course, needsPlan, toast],
  );

  const startExam = useCallback(
    async (exam: Exam) => {
      const r = await window.exee.startAttempt({ examId: exam.id, courseId: exam.courseId });
      if (isFailure(r)) return toast(r.message, "error");
      setReviewing(null);
      setRunning({ exam, attempt: r.data, before: readiness });
    },
    [toast, readiness],
  );

  const generate = useCallback(
    async (cfg: ExamConfig) => {
      if (!course || needsPlan()) return;
      setExamDialogOpen(false);

      const materials = await window.exee.listMaterials(course.id);
      const all = isFailure(materials) ? [] : materials.data;
      const picked = all.filter((m) => cfg.materialIds.includes(m.id));
      const source =
        cfg.focusTopics.length === 1
          ? `your notes on ${cfg.focusTopics[0]}`
          : picked.length === 1
            ? picked[0]!.title
            : `${picked.length || "all"} of your ${course.code || course.name} materials`;
      const examCount = stats?.exams ?? 0;
      const title =
        cfg.title ??
        (cfg.focusTopics.length === 1
          ? `${cfg.focusTopics[0]} drill`
          : `${course.code || course.name} practice #${examCount + 1}`);

      const { mc, sa } = questionMix(cfg.count, cfg.written);
      setProgress("");
      setGenerating({ source, title, count: cfg.count });
      window.scrollTo(0, 0);

      const r = await window.exee.generateExam({
        model,
        courseId: course.id,
        courseName: course.name,
        courseCode: course.code,
        professor: course.professor,
        title,
        material: "",
        materialIds: cfg.materialIds,
        mcCount: mc,
        saCount: sa,
        laCount: 0,
        timeLimit: cfg.timed ? examMinutes(cfg.count, cfg.written) : 0,
        focusTopics: cfg.focusTopics,
        difficulty: cfg.difficulty,
      });

      setGenerating(null);
      refresh();
      if (isFailure(r)) return toast(r.message, "error");
      if (r.data.exam.questions.length === 0) return toast("No questions came back. Try again.", "error");
      await startExam(r.data.exam);
    },
    [course, needsPlan, stats?.exams, model, refresh, toast, startExam],
  );

  /** One-click drill: six exam-level questions on a single topic, all materials. */
  const drill = useCallback(
    async (topic?: string) => {
      if (!course) return openNewExam();
      const target = topic ?? weakTopics[0];
      if (!target) return openNewExam();
      if (needsPlan()) return;
      const m = await window.exee.listMaterials(course.id);
      const ids = isFailure(m) ? [] : m.data.map((x) => x.id);
      if (ids.length === 0) {
        go("materials");
        return toast("Add study material to this course first");
      }
      await generate({ materialIds: ids, focusTopics: [target], count: 6, difficulty: "exam", written: false, timed: true });
    },
    [course, weakTopics, needsPlan, generate, openNewExam, go, toast],
  );

  const submitExam = useCallback(
    async (answers: Record<string, string | number>) => {
      if (!running) return;
      const examCourse = courses.find((c) => c.id === running.exam.courseId);
      setGrading(true);
      setProgress("Grading your answers...");

      const r = await window.exee.gradeExam({
        attemptId: running.attempt.id,
        model,
        courseName: examCourse?.name ?? "This course",
        questions: running.exam.questions,
        answers,
      });

      setGrading(false);
      if (isFailure(r)) {
        toast(r.message, "error");
        return;
      }

      const after = await window.exee.readiness(running.exam.courseId);
      const graded: Attempt = { ...running.attempt, answers, result: r.data, gradedAt: Date.now() };
      setRunning(null);
      setReviewing({
        exam: running.exam,
        attempt: graded,
        before: running.before,
        after: isFailure(after) ? null : after.data,
      });
      setRoute("exams");
      refresh();
    },
    [running, courses, model, toast, refresh],
  );

  const togglePlan = useCallback((key: string) => {
    setPlanDone((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      if (!next[key]) delete next[key];
      void window.exee.updateSettings({ planDone: next });
      return next;
    });
  }, []);

  const uploadMaterial = useCallback(() => {
    go("materials");
    setImportSignal((n) => n + 1);
  }, [go]);

  /* ---------------- palette ---------------- */
  const palette = useMemo<PaletteItem[]>(
    () => [
      ...NAV.map((n) => ({ label: `Go to ${n.label.toLowerCase()}`, icon: n.icon, group: "PAGE" as const, run: () => go(n.id) })),
      { label: "Go to settings", icon: "settings", group: "PAGE", run: () => go("settings") },
      { label: "Start a new practice exam", icon: "add_circle", group: "ACTION", run: () => openNewExam() },
      ...(weakTopics[0]
        ? [{ label: `Drill ${weakTopics[0]}`, icon: "target", group: "ACTION" as const, run: () => void drill(weakTopics[0]) }]
        : []),
      { label: "Upload study material", icon: "upload_file", group: "ACTION", run: uploadMaterial },
      { label: "Create a course", icon: "school", group: "ACTION", run: () => setCourseDialog("new") },
      ...weakTopics.map((t) => ({ label: t, icon: "topic", group: "TOPIC" as const, run: () => void drill(t) })),
      ...courses
        .filter((c) => c.id !== courseId)
        .map((c) => ({ label: `Switch to ${c.name}`, icon: "swap_horiz", group: "COURSE" as const, run: () => switchCourse(c.id) })),
    ],
    [go, openNewExam, weakTopics, drill, uploadMaterial, courses, courseId, switchCourse],
  );

  /* ---------------- render ---------------- */
  if (!booted) {
    return (
      <div style={{ display: "grid", placeItems: "center", height: "100vh" }}>
        <div className="spinner" />
      </div>
    );
  }

  // Not connected: full-screen welcome rather than an empty shell.
  if (session?.status !== "connected") {
    return <Welcome onSignIn={signIn} busy={signingIn} error={session?.error?.message} />;
  }

  if (generating) return <Generating {...generating} progress={progress} />;

  if (running) {
    return (
      <ExamRun
        exam={running.exam}
        attempt={running.attempt}
        onSubmit={submitExam}
        onExit={() => {
          setRunning(null);
          toast("Exam closed. Your questions are saved under Practice exams.");
        }}
        grading={grading}
        progress={progress}
      />
    );
  }

  const name = session.identity?.name?.split(" ")[0] || session.identity?.email?.split("@")[0] || "there";
  const courseTag = course ? course.code || course.name : "your course";
  const countdown = examCountdown(course);
  const [title, subtitle] = reviewing
    ? ["Results", reviewing.exam.title]
    : ({
        overview: [`${greeting()}, ${name}`, `${longDate(new Date())}${countdown ? ` · ${countdown}` : ""}`],
        exams: ["Practice exams", `Generated from your materials, calibrated to ${courseTag}`],
        flashcards: ["Flashcards", "Spaced repetition · missed cards return sooner"],
        materials: ["Study materials", `Everything Exee AI has read for ${courseTag}`],
        plan: ["Study plan", countdown ? `Counting down to ${course?.examLabel || "your exam"} · ${countdown.toLowerCase()}` : "A rolling week, weighted toward your weakest topics"],
        coach: ["AI coach", "Grounded in your materials and your results"],
        settings: ["Settings", "Account, model, and where your data lives"],
      } satisfies Record<Route, [string, string]>)[route];

  const noCourse = (
    <div className="page">
      <EmptyState
        icon="school"
        title="Start with a course"
        body="Create a course, add your slides or notes, and Exee AI writes practice exams and flashcards from them — on your own ChatGPT plan."
        action={
          <button className="btn btn-primary" onClick={() => setCourseDialog("new")}>
            Create your first course
          </button>
        }
      />
    </div>
  );

  const page = () => {
    if (reviewing) {
      return (
        <Results
          exam={reviewing.exam}
          attempt={reviewing.attempt}
          before={reviewing.before}
          after={reviewing.after}
          onRetake={() => void startExam(reviewing.exam)}
          onFlashcards={() => go("flashcards")}
          onDone={() => go("overview")}
        />
      );
    }
    if (route === "settings") {
      return (
        <Settings
          session={session}
          models={models}
          model={model}
          onModelChange={setModel}
          stats={stats}
          signingIn={signingIn}
          onSignIn={signIn}
          onDisconnect={disconnect}
          onOpenUsage={openUsage}
        />
      );
    }
    if (!course) return noCourse;

    switch (route) {
      case "overview":
        return (
          <Overview
            course={course}
            readiness={readiness}
            dueCards={dueCards}
            refreshKey={refreshKey}
            planDone={planDone}
            onTogglePlan={togglePlan}
            nav={go}
            onDrill={(t) => void drill(t)}
            onNewExam={() => openNewExam()}
            onUpload={uploadMaterial}
            onEditCourse={() => setCourseDialog("edit")}
          />
        );
      case "exams":
        return (
          <Exams
            course={course}
            weakest={readiness?.topics.find((t) => t.topic === weakTopics[0] && t.attempted)}
            refreshKey={refreshKey}
            onNewExam={() => openNewExam()}
            onDrill={(t) => void drill(t)}
            onStart={(e) => void startExam(e)}
            onReview={(exam, attempt) => setReviewing({ exam, attempt, before: null, after: null })}
            onChanged={refresh}
          />
        );
      case "flashcards":
        return (
          <Flashcards
            course={course}
            decks={decks}
            model={model}
            canGenerate={canGenerate}
            onChanged={refresh}
            onNeedMaterial={() => go("materials")}
          />
        );
      case "materials":
        return (
          <Materials
            course={course}
            readiness={readiness}
            importSignal={importSignal}
            model={model}
            canGenerate={canGenerate}
            onExam={(materialIds) => openNewExam({ materialIds })}
            onChanged={refresh}
            onFlashcardsMade={() => go("flashcards")}
          />
        );
      case "plan":
        return (
          <Plan
            course={course}
            readiness={readiness}
            done={planDone}
            onToggle={togglePlan}
            onDrill={(t) => void drill(t)}
            onFullExam={() => openNewExam({ title: `${courseTag} full practice exam` })}
            onReview={() => go("flashcards")}
            onRead={() => go("materials")}
            onCoach={() => go("coach")}
            onSetDate={() => setCourseDialog("edit")}
          />
        );
      case "coach":
        return (
          <Coach
            course={course}
            model={model}
            canGenerate={canGenerate}
            weakest={weakTopics[0]}
            messages={coachLog[course.id] ?? []}
            onMessages={(m) => setCoachLog((log) => ({ ...log, [course.id]: m }))}
          />
        );
      default:
        return null;
    }
  };

  return (
    <AppShell
      route={route}
      nav={go}
      title={title}
      subtitle={subtitle}
      chrome={route !== "coach" || Boolean(reviewing) || !course}
      session={session}
      course={course}
      courses={courses}
      readinessPct={readiness?.readinessPct ?? null}
      streak={streak}
      dueCards={dueCards}
      palette={palette}
      onSwitchCourse={switchCourse}
      onNewCourse={() => setCourseDialog("new")}
      onEditCourse={() => setCourseDialog("edit")}
      onOpenUsage={openUsage}
    >
      {!session.sharing && route !== "settings" && (
        <div style={{ padding: "20px 32px 0", maxWidth: 1280, margin: "0 auto", width: "100%" }}>
          <div
            className="rise"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "16px 20px",
              borderRadius: 10,
              background: "var(--wine-tint)",
              color: "var(--wine)",
            }}
          >
            <Icon name="bolt" size={22} />
            <span style={{ flex: 1, font: "500 14px/20px var(--font)" }}>
              Plan usage isn&rsquo;t enabled for this ChatGPT account, so generation is unavailable. It needs Go, Plus or Pro.
            </span>
            <button className="btn btn-sm btn-outline" style={{ background: "var(--paper)" }} onClick={openUsage}>
              Open ChatGPT settings
            </button>
          </div>
        </div>
      )}

      {page()}

      <CourseDialog
        open={courseDialog !== null}
        course={courseDialog === "edit" ? course : undefined}
        onClose={() => setCourseDialog(null)}
        onSaved={(c) => {
          const created = courseDialog === "new";
          setCourseDialog(null);
          if (created) switchCourse(c.id);
          refresh();
          toast(created ? `${c.name} created` : "Course saved", "success");
        }}
        onDeleted={() => {
          setCourseDialog(null);
          setCourseId(undefined);
          refresh();
        }}
      />

      <NewExamDialog
        open={examDialogOpen}
        course={course}
        topics={weakTopics}
        preset={examPreset}
        onClose={() => setExamDialogOpen(false)}
        onGenerate={(cfg) => void generate(cfg)}
      />
    </AppShell>
  );
}

/* ---------------- signed-out welcome ---------------- */
function Welcome({ onSignIn, busy, error }: { onSignIn: () => void; busy: boolean; error?: string }) {
  return (
    <div className="drag" style={{ minHeight: "100vh", display: "flex", background: "var(--cream)" }}>
      <div
        style={{
          flex: "1 1 50%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 22,
          padding: IS_MAC ? "72px 64px 48px" : "48px 64px",
          maxWidth: 640,
        }}
      >
        <Logo size={44} />
        <h1 className="display rise" style={{ fontSize: 40, lineHeight: 1.08 }}>
          Practice exams from your own notes
        </h1>
        <p className="rise" style={{ font: "400 16px/25px var(--font)", color: "var(--ink-3)", maxWidth: 480, animationDelay: ".06s" }}>
          Exee AI turns your slides and notes into realistic practice exams, grades your answers, and builds a study plan
          around your weakest topics. It runs on your computer and uses your own ChatGPT plan, so it costs you nothing
          extra.
        </p>

        <div className="rise no-drag" style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 12, animationDelay: ".12s" }}>
          <ContinueWithChatGPTButton onClick={onSignIn} loading={busy} appearance="black" />
          <span style={{ font: "400 12.5px/18px var(--font)", color: "var(--ink-5)" }}>
            Requires a ChatGPT Go, Plus or Pro subscription.
          </span>
        </div>

        {error && (
          <div style={{ padding: "12px 16px", borderRadius: 8, background: "var(--wine-tint)", color: "var(--wine)", font: "400 13.5px/20px var(--font)" }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 22, flexWrap: "wrap", marginTop: 12 }}>
          {[
            ["lock", "Your files stay on your computer"],
            ["savings", "No subscription, no API key"],
            ["task_alt", "Graded with feedback"],
          ].map(([icon, text]) => (
            <span key={text} style={{ display: "inline-flex", alignItems: "center", gap: 7, font: "500 13px/1 var(--font)", color: "var(--ink-4)" }}>
              <Icon name={icon!} size={17} color="var(--ink-4)" />
              {text}
            </span>
          ))}
        </div>
      </div>

      <div style={{ flex: "1 1 45%", padding: 24, display: "flex" }}>
        <div
          className="card-navy rise"
          style={{
            flex: 1,
            borderRadius: 10,
            padding: 40,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: 26,
            position: "relative",
            overflow: "hidden",
            animationDelay: ".1s",
          }}
        >
          <span className="eyebrow" style={{ color: "var(--on-navy-2)" }}>How it works</span>
          {[
            ["upload_file", "Add your material", "Slides, PDFs, Word files or pasted notes. Scanned pages are read with on-device OCR."],
            ["quiz", "Practise like it's the real thing", "Questions in your professor's style, timed and graded with feedback."],
            ["insights", "Know when you're ready", "A readiness score per topic, and a plan that works back from your exam date."],
          ].map(([icon, head, body]) => (
            <div key={head} style={{ display: "flex", gap: 16, position: "relative" }}>
              <Icon name={icon!} size={22} color="var(--on-navy-2)" style={{ marginTop: 3 }} />
              <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ font: "500 21px/26px var(--serif)", letterSpacing: "-.01em" }}>{head}</span>
                <span style={{ font: "400 14px/21px var(--font)", color: "var(--on-navy-2)" }}>{body}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
