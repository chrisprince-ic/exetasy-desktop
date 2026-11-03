/**
 * The entire main <-> renderer surface.
 *
 * Deliberately narrow and task-specific. There is no generic "call OpenAI"
 * channel: that would turn the app into the general-purpose API passthrough the
 * Sign in with ChatGPT Terms prohibit, and would let a compromised renderer
 * spend the student's plan on anything.
 *
 * No handler ever returns a token.
 */
import { BrowserWindow, ipcMain, shell, type IpcMainInvokeEvent } from "electron";
import { ChatGPTError, CHATGPT_USAGE_URL, type SessionState } from "@siwc/local";
import type { ExamQuestion } from "../shared/types";
import { getChatGPT } from "./chatgpt.js";
import { askCoach, type CoachInput } from "./coach.js";
import { generateExam, type GenerateExamInput } from "./generate.js";
import { gradeAttempt, type GradeInput } from "./grade.js";
import { computeReadiness } from "./readiness.js";
import { addPastedMaterial, commitMaterial, pickMaterials } from "./materials.js";
import { analyticsAvailable, track } from "./analytics.js";
import * as store from "./store.js";

interface Failure {
  ok: false;
  code: string;
  message: string;
  retryable: boolean;
}
type Result<T> = { ok: true; data: T } | Failure;

function toFailure(error: unknown): Failure {
  if (error instanceof ChatGPTError) {
    return {
      ok: false,
      code: error.code,
      message: error.message,
      retryable: Boolean(error.retryable),
    };
  }
  return {
    ok: false,
    code: "unknown",
    message: error instanceof Error ? error.message : String(error),
    retryable: false,
  };
}

/**
 * Only the top-level frame of a window we created may call these handlers.
 * Rejects calls from iframes and from any other window.
 */
function isTrusted(event: IpcMainInvokeEvent): boolean {
  const window = BrowserWindow.fromWebContents(event.sender);
  return Boolean(window) && event.senderFrame?.parent === null;
}

export function registerIpc(getWindow: () => BrowserWindow | undefined): void {
  const handle = <T>(channel: string, fn: (payload: never) => Promise<T> | T) => {
    ipcMain.handle(channel, async (event, payload): Promise<Result<T>> => {
      if (!isTrusted(event)) return toFailure(new Error("Rejected untrusted IPC sender."));
      try {
        return { ok: true, data: await fn(payload as never) };
      } catch (error) {
        return toFailure(error);
      }
    });
  };

  // Push session changes (sign-in, refresh failure, disconnect) to the renderer.
  getChatGPT().subscribe((state: SessionState) => {
    getWindow()?.webContents.send("chatgpt:session", state);
  });

  /* ------------------------- ChatGPT account ------------------------- */
  handle("chatgpt:getSession", () => getChatGPT().getSession());
  handle("chatgpt:signIn", async () => {
    const state = await getChatGPT().signIn();
    if (state.status === "connected") track("signed_in");
    return state;
  });
  handle("chatgpt:disconnect", () => getChatGPT().disconnect());
  handle("chatgpt:listModels", () => getChatGPT().listModels());
  handle("chatgpt:openUsage", () => shell.openExternal(CHATGPT_USAGE_URL));

  /* ------------------------------ data ------------------------------- */
  handle("store:stats", () => store.getStats());
  handle("store:readiness", async (courseId?: string) => {
    const { exams, attempts, profiles } = await store.readinessInputs(courseId);
    return computeReadiness(exams, attempts, profiles);
  });
  handle("store:settings", async () => ({ ...(await store.getSettings()), analyticsAvailable }));
  handle("store:updateSettings", async (patch: Partial<store.Settings> & { analyticsAvailable?: unknown }) => {
    const { analyticsAvailable: _readOnly, ...rest } = patch;
    const before = await store.getSettings();
    const saved = await store.updateSettings(rest);
    // Count the session in which someone opts in.
    if (rest.analytics === true && before.analytics !== true) track("app_started");
    return { ...saved, analyticsAvailable };
  });
  handle("store:touchStreak", () => store.touchStreak());

  handle("courses:list", () => store.listCourses());
  handle("courses:create", (input: Parameters<typeof store.createCourse>[0]) =>
    store.createCourse(input),
  );
  handle(
    "courses:update",
    (input: { id: string; patch: Parameters<typeof store.updateCourse>[1] }) =>
      store.updateCourse(input.id, input.patch),
  );
  handle("courses:delete", (id: string) => store.deleteCourse(id));

  handle("materials:list", (courseId?: string) => store.listMaterials(courseId));
  handle("materials:pick", () => pickMaterials());
  handle("materials:commit", async (input: Parameters<typeof commitMaterial>[0]) => {
    const material = await commitMaterial(input);
    track("material_added", { kind: input.kind, ocr: input.method === "ocr" });
    return material;
  });
  handle("materials:addText", async (input: { courseId: string; title: string; text: string }) => {
    const material = await addPastedMaterial(input.courseId, input.title, input.text);
    track("material_added", { kind: "pasted", ocr: false });
    return material;
  });
  handle("materials:delete", (id: string) => store.deleteMaterial(id));

  handle("exams:list", (courseId?: string) => store.listExams(courseId));
  handle("exams:get", (id: string) => store.getExam(id));
  handle("exams:delete", (id: string) => store.deleteExam(id));

  handle("attempts:list", (examId?: string) => store.listAttempts(examId));
  handle("attempts:get", (id: string) => store.getAttempt(id));
  handle("attempts:start", (input: { examId: string; courseId: string }) =>
    store.saveAttempt({ ...input, answers: {}, startedAt: Date.now() }),
  );

  /* --------------------------- generation ---------------------------- */
  handle(
    "exam:generate",
    async (input: GenerateExamInput & { title: string; feedback?: "each" | "end" }) => {
      const stats = await generateExam(input, (message) =>
        getWindow()?.webContents.send("exam:progress", message),
      );

      // Persist immediately: a generated exam the student loses to a crash is
      // plan usage they paid for and cannot get back.
      const exam = await store.saveExam({
        courseId: input.courseId,
        title: input.title,
        questions: stats.questions,
        timeLimit: input.timeLimit,
        feedback: input.feedback === "each" ? "each" : "end",
      });

      track("exam_generated", {
        questions: stats.questions.length,
        withMaterial: input.materialIds.length > 0,
        written: input.saCount + input.laCount > 0,
        timed: input.timeLimit > 0,
        answersAtEnd: input.feedback !== "each",
        customInstructions: Boolean(input.instructions?.trim()),
        drill: (input.focusTopics?.length ?? 0) === 1,
      });

      return {
        exam,
        contextChars: stats.contextChars,
        availableChars: stats.availableChars,
        batches: stats.batches,
        profileReused: stats.profileReused,
      };
    },
  );

  handle(
    "exam:grade",
    async (input: GradeInput & { attemptId: string }) => {
      getWindow()?.webContents.send("exam:progress", "Grading your answers...");
      const result = await gradeAttempt(input);
      const attempt = await store.updateAttempt(input.attemptId, {
        answers: input.answers,
        result,
        submittedAt: Date.now(),
        gradedAt: Date.now(),
      });

      // Anything scored under half marks becomes a flashcard, built locally
      // from the exam's own answer key � no extra plan usage.
      const byId = new Map(result.perQuestion.map((p) => [p.id, p]));
      const missed = input.questions.flatMap((q) => {
        const graded = byId.get(q.id);
        if (!graded || graded.awarded >= graded.max / 2) return [];
        const topic = (q as { topic?: string }).topic;
        const back =
          q.type === "mc"
            ? `${q.options[q.correct] ?? ""}${q.explanation ? `

${q.explanation}` : ""}`
            : (q.modelAnswer ?? graded.feedback);
        return back.trim() ? [{ front: q.text, back, topic }] : [];
      });
      await store.addMistakes(attempt.courseId, missed);
      track("exam_submitted", { questions: input.questions.length });
      return result;
    },
  );

  handle(
    "flashcards:generate",
    async (input: {
      model: string;
      courseId: string;
      courseName: string;
      title: string;
      materialIds: string[];
      count: number;
    }) => {
      const material = await store.getMaterialText(input.materialIds);
      const { text } = await getChatGPT().streamResponse({
        model: input.model,
        instructions:
          "You create concise study flashcards. Return ONLY valid JSON. " +
          "No markdown fences, no preamble.",
        input: `Course: ${input.courseName}

Create exactly ${input.count} flashcards from this material. Keep fronts short and
specific (a term or a pointed question); keep backs to one or two sentences.
Tag each card with the short topic name it belongs to.

${material.slice(0, 60_000)}

Return ONLY this JSON:
{ "cards": [ { "front": "...", "back": "...", "topic": "..." } ] }`,
      });

      const { parseAiJson } = await import("../shared/parse-ai-json");
      const parsed = parseAiJson<{
        cards?: Array<{ front?: string; back?: string; topic?: string }>;
      }>(text);
      const cards = (parsed.cards ?? [])
        .filter((c) => c?.front && c?.back)
        .map((c) => ({
          front: String(c.front),
          back: String(c.back),
          topic: typeof c.topic === "string" && c.topic.trim() ? c.topic.trim() : undefined,
        }));
      if (cards.length === 0) throw new Error("No cards came back. Try again.");
      // Saved straight away, same reasoning as exams: it cost plan usage.
      return store.createDeck({ courseId: input.courseId, title: input.title, cards });
    },
  );

  /* ------------------------------- decks ------------------------------ */
  handle("decks:list", (courseId?: string) => store.listDecks(courseId));
  handle("decks:review", (input: { deckId: string; cardId: string; rating: store.Rating }) =>
    store.reviewCard(input),
  );
  handle("decks:delete", (id: string) => store.deleteDeck(id));

  /* ------------------------------- coach ------------------------------ */
  handle("coach:ask", (input: CoachInput) => {
    track("coach_question");
    return askCoach(input, (delta) => getWindow()?.webContents.send("coach:delta", delta));
  },
  );

  /* ---------------------------- utilities ---------------------------- */
  handle("exam:questions", async (examId: string): Promise<ExamQuestion[]> => {
    const exam = await store.getExam(examId);
    return (exam?.questions ?? []) as ExamQuestion[];
  });
}
