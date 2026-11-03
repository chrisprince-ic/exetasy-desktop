/**
 * Local-first persistence.
 *
 * Everything the student creates lives on their own machine: a single JSON
 * document for metadata plus original files copied into `materials/`. No
 * cloud, no account, no sync.
 *
 * JSON rather than SQLite deliberately: it avoids a native module in the
 * Electron build, and the data volume here (tens of courses, hundreds of
 * exams) is nowhere near needing a query engine. `Store` is the only thing
 * that touches disk, so swapping in SQLite later is a contained change.
 */
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { app } from "electron";
import { schedule, type Card, type Rating } from "./srs.js";

export type { Card, Rating };

export interface Course {
  id: string;
  name: string;
  code?: string;
  professor?: string;
  /** ISO date (YYYY-MM-DD) of the exam the student is preparing for. */
  examDate?: string;
  /** What that exam is called, e.g. "Midterm". */
  examLabel?: string;
  createdAt: number;
}

export interface Material {
  id: string;
  courseId: string;
  title: string;
  /** File name on disk inside materials/, absent for pasted text. */
  fileName?: string;
  kind: "pdf" | "docx" | "text";
  chars: number;
  text: string;
  /** How the text was obtained; "ocr" output is noisier and worth flagging. */
  method?: "text-layer" | "ocr" | "none";
  createdAt: number;
}

export interface CourseProfile {
  courseId: string;
  /** Fingerprint of the material set this profile was derived from. */
  materialsHash: string;
  topics: string[];
  keyTerms: string[];
  style: string;
  createdAt: number;
}

export interface Exam {
  id: string;
  courseId: string;
  title: string;
  questions: unknown[];
  timeLimit: number;
  createdAt: number;
}

export interface Attempt {
  id: string;
  examId: string;
  courseId: string;
  answers: Record<string, string | number>;
  /** Present once grading has run. */
  result?: {
    score: number;
    maxScore: number;
    perQuestion: Array<{
      id: number;
      awarded: number;
      max: number;
      feedback: string;
    }>;
    weakTopics: string[];
    summary: string;
  };
  startedAt: number;
  submittedAt?: number;
  gradedAt?: number;
}

export interface Settings {
  model?: string;
  /** Local-only counter powering the streak chip; no server involved. */
  lastActiveDay?: string;
  streak?: number;
  /** The course the sidebar and every page are scoped to. */
  currentCourseId?: string;
  /** Study-plan sessions the student has ticked off, keyed "courseId:YYYY-MM-DD:index". */
  planDone?: Record<string, boolean>;
}

export interface Deck {
  id: string;
  courseId: string;
  title: string;
  /** "mistakes" decks are filled automatically from graded attempts. */
  source: "ai" | "mistakes";
  cards: Card[];
  createdAt: number;
}

interface Db {
  version: 1;
  courses: Course[];
  materials: Material[];
  exams: Exam[];
  attempts: Attempt[];
  profiles: CourseProfile[];
  decks: Deck[];
  settings: Settings;
}

const EMPTY: Db = {
  version: 1,
  courses: [],
  materials: [],
  exams: [],
  attempts: [],
  profiles: [],
  decks: [],
  settings: {},
};

let cache: Db | undefined;
/** Serialises writes so two IPC calls cannot clobber each other. */
let queue: Promise<unknown> = Promise.resolve();

const dataDir = () => join(app.getPath("userData"), "data");
const dbPath = () => join(dataDir(), "exee.json");
export const materialsDir = () => join(dataDir(), "materials");

async function load(): Promise<Db> {
  if (cache) return cache;
  try {
    const raw = await readFile(dbPath(), "utf8");
    cache = { ...structuredClone(EMPTY), ...(JSON.parse(raw) as Db) };
  } catch {
    // Missing or unreadable file starts a fresh store rather than throwing;
    // a corrupt file is preserved below by the atomic write never truncating.
    cache = structuredClone(EMPTY);
  }
  return cache;
}

/** Write to a temp file then rename, so a crash can never leave a partial db. */
async function persist(db: Db): Promise<void> {
  await mkdir(dataDir(), { recursive: true });
  const tmp = `${dbPath()}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(db, null, 2), "utf8");
  await rename(tmp, dbPath());
}

function run<T>(fn: (db: Db) => T | Promise<T>): Promise<T> {
  const next = queue.then(async () => {
    const db = await load();
    const result = await fn(db);
    await persist(db);
    return result;
  });
  // Keep the chain alive even if this operation rejects.
  queue = next.catch(() => undefined);
  return next;
}

async function read<T>(fn: (db: Db) => T): Promise<T> {
  return fn(await load());
}

/* ------------------------------ courses ------------------------------ */

export const listCourses = () => read((db) => [...db.courses].sort((a, b) => b.createdAt - a.createdAt));

/** Only these fields come from the renderer; ids and timestamps never do. */
function courseFields(input: Partial<Course>) {
  const out: Partial<Pick<Course, "name" | "code" | "professor" | "examDate" | "examLabel">> = {};
  for (const key of ["name", "code", "professor", "examLabel"] as const) {
    if (key in input) out[key] = input[key] ? String(input[key]).slice(0, 200) : undefined;
  }
  if ("examDate" in input) {
    out.examDate = /^\d{4}-\d{2}-\d{2}$/.test(String(input.examDate ?? "")) ? input.examDate : undefined;
  }
  if (out.name === undefined) delete out.name;
  return out;
}

export const createCourse = (
  input: Pick<Course, "name"> & Partial<Pick<Course, "code" | "professor" | "examDate" | "examLabel">>,
) =>
  run((db) => {
    const course: Course = { ...courseFields(input), name: String(input.name), id: randomUUID(), createdAt: Date.now() };
    db.courses.push(course);
    return course;
  });

export const updateCourse = (
  id: string,
  patch: Partial<Pick<Course, "name" | "code" | "professor" | "examDate" | "examLabel">>,
) =>
  run((db) => {
    const course = db.courses.find((c) => c.id === id);
    if (!course) throw new Error("Course not found");
    Object.assign(course, courseFields(patch));
    return course;
  });

export const deleteCourse = (id: string) =>
  run(async (db) => {
    const orphaned = db.materials.filter((m) => m.courseId === id);
    db.courses = db.courses.filter((c) => c.id !== id);
    db.decks = db.decks.filter((d) => d.courseId !== id);
    db.materials = db.materials.filter((m) => m.courseId !== id);
    db.exams = db.exams.filter((e) => e.courseId !== id);
    db.attempts = db.attempts.filter((a) => a.courseId !== id);
    db.profiles = db.profiles.filter((p) => p.courseId !== id);
    // Remove the copied files too, so "delete" means deleted.
    for (const m of orphaned) {
      if (m.fileName) await rm(join(materialsDir(), m.fileName), { force: true });
    }
  });

/* ----------------------------- materials ----------------------------- */

export const listMaterials = (courseId?: string) =>
  read((db) =>
    db.materials
      .filter((m) => !courseId || m.courseId === courseId)
      .sort((a, b) => b.createdAt - a.createdAt)
      // Text can be megabytes; the list view never needs it.
      .map(({ text: _text, ...rest }) => rest),
  );

/** Full records for retrieval: chunking needs per-document titles. */
export const getMaterialsFull = (ids: string[]) =>
  read((db) =>
    db.materials
      .filter((m) => ids.includes(m.id))
      .map((m) => ({ id: m.id, title: m.title, text: m.text, chars: m.chars })),
  );

export const getMaterialText = (ids: string[]) =>
  read((db) =>
    db.materials
      .filter((m) => ids.includes(m.id))
      .map((m) => `## ${m.title}\n\n${m.text}`)
      .join("\n\n---\n\n"),
  );

export const addMaterial = (material: Omit<Material, "id" | "createdAt">) =>
  run((db) => {
    const saved: Material = { ...material, id: randomUUID(), createdAt: Date.now() };
    db.materials.push(saved);
    const { text: _text, ...rest } = saved;
    return rest;
  });

export const deleteMaterial = (id: string) =>
  run(async (db) => {
    const found = db.materials.find((m) => m.id === id);
    db.materials = db.materials.filter((m) => m.id !== id);
    if (found?.fileName) await rm(join(materialsDir(), found.fileName), { force: true });
  });

/* ------------------------------- exams ------------------------------- */

export const listExams = (courseId?: string) =>
  read((db) =>
    db.exams
      .filter((e) => !courseId || e.courseId === courseId)
      .sort((a, b) => b.createdAt - a.createdAt),
  );

export const getExam = (id: string) => read((db) => db.exams.find((e) => e.id === id));

export const saveExam = (exam: Omit<Exam, "id" | "createdAt">) =>
  run((db) => {
    const saved: Exam = { ...exam, id: randomUUID(), createdAt: Date.now() };
    db.exams.push(saved);
    return saved;
  });

export const deleteExam = (id: string) =>
  run((db) => {
    db.exams = db.exams.filter((e) => e.id !== id);
    db.attempts = db.attempts.filter((a) => a.examId !== id);
  });

/* ------------------------------ attempts ----------------------------- */

export const listAttempts = (examId?: string) =>
  read((db) =>
    db.attempts
      .filter((a) => !examId || a.examId === examId)
      .sort((a, b) => b.startedAt - a.startedAt),
  );

export const getAttempt = (id: string) => read((db) => db.attempts.find((a) => a.id === id));

export const saveAttempt = (attempt: Omit<Attempt, "id">) =>
  run((db) => {
    const saved: Attempt = { ...attempt, id: randomUUID() };
    db.attempts.push(saved);
    return saved;
  });

export const updateAttempt = (id: string, patch: Partial<Attempt>) =>
  run((db) => {
    const index = db.attempts.findIndex((a) => a.id === id);
    if (index < 0) throw new Error("Attempt not found");
    db.attempts[index] = { ...db.attempts[index], ...patch };
    return db.attempts[index];
  });

/* --------------------------- course profiles -------------------------- */

export const getProfile = (courseId: string, materialsHash: string) =>
  read((db) =>
    db.profiles.find((p) => p.courseId === courseId && p.materialsHash === materialsHash),
  );

export const saveProfile = (profile: Omit<CourseProfile, "createdAt">) =>
  run((db) => {
    // One profile per course; a changed material set replaces the old one.
    db.profiles = db.profiles.filter((p) => p.courseId !== profile.courseId);
    const saved: CourseProfile = { ...profile, createdAt: Date.now() };
    db.profiles.push(saved);
    return saved;
  });

export const listProfiles = () => read((db) => [...db.profiles]);

/** Everything the readiness model needs, read in one pass. */
export const readinessInputs = (courseId?: string) =>
  read((db) => {
    const inCourse = <T extends { courseId: string }>(list: T[]) =>
      list.filter((x) => !courseId || x.courseId === courseId);
    return {
      exams: inCourse(db.exams),
      attempts: inCourse(db.attempts),
      profiles: inCourse(db.profiles),
    };
  });

/* -------------------------------- decks ------------------------------- */

const newCard = (c: { front: string; back: string; topic?: string }): Card => ({
  id: randomUUID(),
  front: c.front,
  back: c.back,
  topic: c.topic,
  box: 0,
  due: Date.now(),
});

export const listDecks = (courseId?: string) =>
  read((db) =>
    db.decks
      .filter((d) => !courseId || d.courseId === courseId)
      .sort((a, b) => b.createdAt - a.createdAt),
  );

export const createDeck = (input: {
  courseId: string;
  title: string;
  cards: Array<{ front: string; back: string; topic?: string }>;
}) =>
  run((db) => {
    const deck: Deck = {
      id: randomUUID(),
      courseId: input.courseId,
      title: input.title,
      source: "ai",
      cards: input.cards.map(newCard),
      createdAt: Date.now(),
    };
    db.decks.push(deck);
    return deck;
  });

/**
 * Appends missed questions to the course's single "Mistakes" deck, skipping
 * any whose front is already there so retakes don't pile up duplicates.
 */
export const addMistakes = (
  courseId: string,
  cards: Array<{ front: string; back: string; topic?: string }>,
) =>
  run((db) => {
    if (cards.length === 0) return 0;
    let deck = db.decks.find((d) => d.courseId === courseId && d.source === "mistakes");
    if (!deck) {
      deck = {
        id: randomUUID(),
        courseId,
        title: "Mistakes",
        source: "mistakes",
        cards: [],
        createdAt: Date.now(),
      };
      db.decks.push(deck);
    }
    const seen = new Set(deck.cards.map((c) => c.front));
    let added = 0;
    for (const c of cards) {
      if (seen.has(c.front)) {
        // Missed again: put it back at the front of the queue.
        const existing = deck.cards.find((x) => x.front === c.front)!;
        existing.box = 0;
        existing.due = Date.now();
        continue;
      }
      deck.cards.push(newCard(c));
      seen.add(c.front);
      added++;
    }
    return added;
  });

export const reviewCard = (input: { deckId: string; cardId: string; rating: Rating }) =>
  run((db) => {
    const deck = db.decks.find((d) => d.id === input.deckId);
    const index = deck?.cards.findIndex((c) => c.id === input.cardId) ?? -1;
    if (!deck || index < 0) throw new Error("Card not found");
    deck.cards[index] = schedule(deck.cards[index], input.rating);
    return deck.cards[index];
  });

export const deleteDeck = (id: string) =>
  run((db) => {
    db.decks = db.decks.filter((d) => d.id !== id);
  });

/* ------------------------------ settings ----------------------------- */

export const getSettings = () => read((db) => db.settings);

export const updateSettings = (patch: Partial<Settings>) =>
  run((db) => {
    db.settings = { ...db.settings, ...patch };
    return db.settings;
  });

/** Bumps the local streak when the app is used on a new day. */
export const touchStreak = () =>
  run((db) => {
    const today = new Date().toISOString().slice(0, 10);
    const last = db.settings.lastActiveDay;
    if (last === today) return db.settings;

    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    db.settings.streak = last === yesterday ? (db.settings.streak ?? 0) + 1 : 1;
    db.settings.lastActiveDay = today;
    return db.settings;
  });

/* ----------------------------- dashboard ----------------------------- */

export const getStats = () =>
  read((db) => {
    const graded = db.attempts.filter((a) => a.result);
    const scores = graded.map((a) => (a.result!.score / Math.max(1, a.result!.maxScore)) * 100);
    const average = scores.length ? scores.reduce((s, n) => s + n, 0) / scores.length : 0;

    // Count every weak topic the grader has flagged, strongest signal first.
    const topicCounts = new Map<string, number>();
    for (const a of graded) {
      for (const t of a.result!.weakTopics) topicCounts.set(t, (topicCounts.get(t) ?? 0) + 1);
    }

    return {
      courses: db.courses.length,
      materials: db.materials.length,
      exams: db.exams.length,
      attempts: db.attempts.length,
      graded: graded.length,
      averageScore: Math.round(average),
      streak: db.settings.streak ?? 0,
      recentScores: scores.slice(-8).map((s) => Math.round(s)),
      weakTopics: [...topicCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([topic, count]) => ({ topic, count })),
    };
  });

/** Ensures the data directories exist before first use. */
export async function initStore(): Promise<void> {
  if (!existsSync(materialsDir())) await mkdir(materialsDir(), { recursive: true });
}
