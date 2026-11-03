/**
 * The only bridge between the renderer and the main process.
 *
 * Exposes named operations, never a generic invoke(). The renderer cannot reach
 * a channel that is not listed here, and no operation returns a token.
 */
import { contextBridge, ipcRenderer } from "electron";

type Invoke = <T>(channel: string, payload?: unknown) => Promise<T>;
const call: Invoke = (channel, payload) => ipcRenderer.invoke(channel, payload);

/** Subscribes to a main-process event; returns an unsubscribe function. */
function on(channel: string, listener: (value: never) => void): () => void {
  const handler = (_event: unknown, value: unknown) => listener(value as never);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const api = {
  // ChatGPT account
  getSession: () => call("chatgpt:getSession"),
  signIn: () => call("chatgpt:signIn"),
  disconnect: () => call("chatgpt:disconnect"),
  listModels: () => call("chatgpt:listModels"),
  openUsage: () => call("chatgpt:openUsage"),

  // App data
  stats: () => call("store:stats"),
  readiness: (courseId?: string) => call("store:readiness", courseId),
  settings: () => call("store:settings"),
  updateSettings: (patch: unknown) => call("store:updateSettings", patch),
  touchStreak: () => call("store:touchStreak"),

  // Courses
  listCourses: () => call("courses:list"),
  createCourse: (input: unknown) => call("courses:create", input),
  updateCourse: (input: unknown) => call("courses:update", input),
  deleteCourse: (id: string) => call("courses:delete", id),

  // Materials
  listMaterials: (courseId?: string) => call("materials:list", courseId),
  pickMaterials: () => call("materials:pick"),
  commitMaterial: (input: unknown) => call("materials:commit", input),
  addTextMaterial: (input: unknown) => call("materials:addText", input),
  deleteMaterial: (id: string) => call("materials:delete", id),

  // Exams
  listExams: (courseId?: string) => call("exams:list", courseId),
  getExam: (id: string) => call("exams:get", id),
  deleteExam: (id: string) => call("exams:delete", id),
  examQuestions: (id: string) => call("exam:questions", id),
  generateExam: (input: unknown) => call("exam:generate", input),

  // Attempts
  listAttempts: (examId?: string) => call("attempts:list", examId),
  getAttempt: (id: string) => call("attempts:get", id),
  startAttempt: (input: unknown) => call("attempts:start", input),
  gradeExam: (input: unknown) => call("exam:grade", input),

  // Flashcards
  generateFlashcards: (input: unknown) => call("flashcards:generate", input),
  listDecks: (courseId?: string) => call("decks:list", courseId),
  reviewCard: (input: unknown) => call("decks:review", input),
  deleteDeck: (id: string) => call("decks:delete", id),

  // Coach
  askCoach: (input: unknown) => call("coach:ask", input),

  // Events
  onSession: (listener: (state: never) => void) => on("chatgpt:session", listener),
  onProgress: (listener: (message: never) => void) => on("exam:progress", listener),
  onCoachDelta: (listener: (delta: never) => void) => on("coach:delta", listener),
};

contextBridge.exposeInMainWorld("exee", api);

export type ExeeApi = typeof api;
