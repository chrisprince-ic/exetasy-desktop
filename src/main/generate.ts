/**
 * Exam generation against the signed-in student's ChatGPT plan.
 *
 * Two constraints shape this file:
 *
 *   1. @siwc/local enforces a hard 180s ceiling per request with no retries,
 *      so large exams must be split into batches.
 *   2. The student pays for every token out of their own weekly allowance, so
 *      the naive "paste all the notes into every batch" approach is the thing
 *      to avoid. A 30-question exam over 60k characters of notes would resend
 *      those characters three times.
 *
 * So: build a local BM25 index over the material once, derive a cached topic
 * profile for the course once, then give each batch only the passages relevant
 * to its own topics. Chunks used by one batch are excluded from the next,
 * which saves tokens and stops the model repeating itself.
 */
import { createHash } from "node:crypto";
import { parseAiJson } from "../shared/parse-ai-json";
import { normalizeExamQuestions } from "../shared/normalize-exam-questions";
import type { ExamQuestion } from "../shared/types";
import { getChatGPT } from "./chatgpt.js";
import { buildIndex, renderChunks, type ChunkIndex } from "./retrieval.js";
import { getMaterialsFull, getProfile, saveProfile, type CourseProfile } from "./store.js";

/** Questions keep the topic they were generated for; readiness scoring needs it. */
export type TopicQuestion = ExamQuestion & { topic: string };

export interface GenerateExamInput {
  model: string;
  courseId: string;
  courseName: string;
  courseCode?: string;
  professor?: string;
  material: string;
  materialIds: string[];
  mcCount: number;
  saCount: number;
  laCount: number;
  timeLimit: number;
  /** Restricts the exam to these topics � a "drill" on weak areas. */
  focusTopics?: string[];
  difficulty?: Difficulty;
  /** Free-text requests from the student, e.g. "focus on calculations". */
  instructions?: string;
}

/** Longest custom instruction passed to the model. */
const MAX_INSTRUCTIONS = 1000;

export type Difficulty = "foundational" | "exam" | "challenging";

const DIFFICULTY_BRIEF: Record<Difficulty, string> = {
  foundational:
    "Foundational: test core definitions and direct recall so the student can build confidence.",
  exam: "Exam level: match the difficulty and mix of a real university exam in this course.",
  challenging:
    "Challenging: favour multi-step reasoning, application to unfamiliar cases, and subtle distractors.",
};

/** Keeps one request well inside the 180s ceiling. */
const MAX_QUESTIONS_PER_BATCH = 10;
/** Characters of source material per request. ~4k tokens, not ~15k. */
const CONTEXT_BUDGET = 14_000;
/** The profiling pass reads more, but it only ever runs once per material set. */
const PROFILE_BUDGET = 28_000;

const JSON_RULES =
  "Return ONLY valid JSON. No markdown fences, no preamble, no trailing " +
  "commentary. Escape newlines inside strings as \\n.";

/* --------------------------- course profile --------------------------- */

/**
 * A compact description of the course, derived once and reused by every
 * later exam. This is the main reason a second exam costs far less than the
 * first: the expensive "read everything" pass has already happened.
 */
async function ensureProfile(
  input: GenerateExamInput,
  index: ChunkIndex,
  materialsHash: string,
  onProgress: (m: string) => void,
): Promise<CourseProfile> {
  const cached = await getProfile(input.courseId, materialsHash);
  if (cached) return cached;

  onProgress("Reading your course material (one time only)...");

  // Query-less selection: take a spread of the material, not a focused slice.
  const { chunks } = index.select(input.courseName, PROFILE_BUDGET);

  const { text } = await getChatGPT().streamResponse({
    model: input.model,
    instructions: `You analyse university course material and summarise its structure. ${JSON_RULES}`,
    input: `Course: ${input.courseName}${input.courseCode ? ` (${input.courseCode})` : ""}

Read the material below and identify what this course actually covers.

${renderChunks(chunks)}

Return ONLY this JSON:
{
  "topics": ["8-14 specific topics actually present in the material"],
  "keyTerms": ["10-20 technical terms a student must know"],
  "style": "one sentence on the material's level and emphasis"
}`,
  });

  const parsed = parseAiJson<{ topics?: unknown; keyTerms?: unknown; style?: unknown }>(text);
  const strings = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];

  const profile = {
    courseId: input.courseId,
    materialsHash,
    topics: strings(parsed.topics).slice(0, 14),
    keyTerms: strings(parsed.keyTerms).slice(0, 20),
    style: typeof parsed.style === "string" ? parsed.style : "",
  };

  // A profile with no topics is useless but not fatal — generation falls back
  // to retrieving against the course name instead.
  return saveProfile(profile);
}

/* ------------------------------ batching ------------------------------ */

interface Batch {
  mc: number;
  sa: number;
  la: number;
  topics: string[];
}

/** Splits the requested counts into batches that each fit one request. */
function planBatches(mc: number, sa: number, la: number, topics: string[]): Batch[] {
  const batches: Batch[] = [];
  let [remMc, remSa, remLa] = [mc, sa, la];

  while (remMc + remSa + remLa > 0) {
    let room = MAX_QUESTIONS_PER_BATCH;
    // Long answers are the most expensive to generate, so place them first.
    const takeLa = Math.min(remLa, room);
    room -= takeLa;
    const takeSa = Math.min(remSa, room);
    room -= takeSa;
    const takeMc = Math.min(remMc, room);

    batches.push({ mc: takeMc, sa: takeSa, la: takeLa, topics: [] });
    remMc -= takeMc;
    remSa -= takeSa;
    remLa -= takeLa;
  }

  // Deal topics round-robin so batches cover different ground.
  if (topics.length) {
    batches.forEach((batch, i) => {
      batch.topics = topics.filter((_, t) => t % batches.length === i);
      if (batch.topics.length === 0) batch.topics = [topics[i % topics.length]];
    });
  }

  return batches;
}

function buildPrompt(
  input: GenerateExamInput,
  profile: CourseProfile,
  batch: Batch,
  excerpt: string,
  offset: number,
): string {
  const total = batch.mc + batch.sa + batch.la;
  const first = offset + 1;
  const asks = (input.instructions ?? "").trim().slice(0, MAX_INSTRUCTIONS);

  return `Course: ${input.courseName}${input.courseCode ? ` (${input.courseCode})` : ""}
Professor: ${input.professor || "Course Instructor"}
${input.timeLimit > 0 ? `Exam length: ${input.timeLimit} minutes` : "Untimed practice"}
Difficulty: ${DIFFICULTY_BRIEF[input.difficulty ?? "exam"]}
${profile.style ? `Course character: ${profile.style}` : ""}
${batch.topics.length ? `Focus this batch on: ${batch.topics.join(", ")}` : ""}
${profile.keyTerms.length ? `Key terms in this course: ${profile.keyTerms.join(", ")}` : ""}
${asks ? `The student's requests for this exam (follow them unless they conflict with the counts, format or rules below):\n"""\n${asks}\n"""` : ""}

Questions needed in this batch:
  - Multiple Choice: ${batch.mc} (2 marks each)
  - Short Answer: ${batch.sa} (10 marks each)
  - Long Answer / Essay: ${batch.la} (20 marks each)
Total: ${total}

Source material:
${excerpt || "No material supplied. Use typical university-level content for this course."}

Generate exactly ${total} questions, numbering ids from ${first}.
Return ONLY this JSON:
{
  "questions": [
    { "id": ${first}, "type": "mc", "topic": "...", "marks": 2, "text": "...", "options": ["A","B","C","D"], "correct": 0, "explanation": "..." },
    { "id": ${first + 1}, "type": "sa", "topic": "...", "marks": 10, "text": "...", "modelAnswer": "..." },
    { "id": ${first + 2}, "type": "la", "topic": "...", "marks": 20, "text": "...", "modelAnswer": "..." }
  ]
}

Rules:
- Produce exactly ${batch.mc} "mc", then ${batch.sa} "sa", then ${batch.la} "la" questions.
- Use the field name "text" for every question, never "question".
- "mc" needs exactly 4 options; "correct" is a 0-indexed integer.
${
    excerpt
      ? "- Base every question on the source material above, not on general knowledge."
      : "- No source material was supplied: write standard university-level questions for this course."
  }
- Set "topic" on every question to the single topic it tests, chosen from the
  focus list above where one fits. This drives the student's readiness score.
- University level. Do not repeat a concept you have already tested.`;
}

/* ----------------------------- generation ----------------------------- */

export interface GenerateStats {
  questions: TopicQuestion[];
  /** Characters of source material actually sent, across all batches. */
  contextChars: number;
  /** Characters available in the selected materials. */
  availableChars: number;
  batches: number;
  profileReused: boolean;
}

export async function generateExam(
  input: GenerateExamInput,
  onProgress: (message: string) => void,
): Promise<GenerateStats> {
  const chatgpt = getChatGPT();

  // ---- 1. Gather material and index it locally (free) ----
  const materials = input.materialIds.length
    ? await getMaterialsFull(input.materialIds)
    : input.material.trim()
      ? [{ id: "pasted", title: "Course notes", text: input.material, chars: input.material.length }]
      : [];

  const index = buildIndex(materials);
  const materialsHash = createHash("sha256")
    .update(materials.map((m) => `${m.id}:${m.chars}`).join("|"))
    .digest("hex")
    .slice(0, 16);

  // ---- 2. Course profile: cached after the first exam ----
  let profile: CourseProfile = {
    courseId: input.courseId,
    materialsHash,
    topics: [],
    keyTerms: [],
    style: "",
    createdAt: 0,
  };
  let profileReused = true;

  if (index.size > 0) {
    const cached = await getProfile(input.courseId, materialsHash);
    profileReused = Boolean(cached);
    profile = cached ?? (await ensureProfile(input, index, materialsHash, onProgress));
  }

  // ---- 3. Batch, retrieve, generate ----
  // A drill narrows every batch to the requested topics; otherwise spread the
  // exam across everything the course profile found.
  const focus = (input.focusTopics ?? []).map((t) => t.trim()).filter(Boolean);
  const batches = planBatches(
    input.mcCount,
    input.saCount,
    input.laCount,
    focus.length ? focus : profile.topics,
  );
  const questions: TopicQuestion[] = [];
  const usedChunks = new Set<number>();
  let contextChars = 0;

  for (const [i, batch] of batches.entries()) {
    const count = batch.mc + batch.sa + batch.la;
    onProgress(
      batches.length > 1
        ? `Writing batch ${i + 1} of ${batches.length} (${count} questions)...`
        : `Writing ${count} questions...`,
    );

    // Retrieve only what this batch needs, skipping passages already used.
    let excerpt = "";
    if (index.size > 0) {
      const query = [batch.topics.join(" "), input.courseName].filter(Boolean).join(" ");
      const selected = index.select(query, CONTEXT_BUDGET, usedChunks);
      for (const chunk of selected.chunks) usedChunks.add(chunk.id);
      contextChars += selected.chars;
      excerpt = renderChunks(selected.chunks);

      // Every chunk consumed: let later batches reuse the pool rather than
      // generating from nothing.
      if (usedChunks.size >= index.size) usedChunks.clear();
    }

    const { text } = await chatgpt.streamResponse({
      model: input.model,
      instructions: `You are an expert university professor writing rigorous exam questions. ${JSON_RULES}`,
      input: buildPrompt(input, profile, batch, excerpt, questions.length),
    });

    const parsed = parseAiJson<{ questions?: unknown[] }>(text);
    const rawList = Array.isArray(parsed.questions) ? parsed.questions : [];
    const normalized = normalizeExamQuestions(parsed.questions ?? parsed);

    // normalizeExamQuestions is shared with the web app and drops unknown
    // fields, so re-attach the topic from the raw payload by position.
    for (const [qi, question] of normalized.entries()) {
      const raw = rawList[qi] as { topic?: unknown } | undefined;
      const stated = typeof raw?.topic === "string" ? raw.topic.trim() : "";
      const topic =
        stated ||
        batch.topics[qi % Math.max(1, batch.topics.length)] ||
        "General";
      // Keep ids unique and contiguous across batches.
      questions.push({ ...question, id: questions.length + 1, topic });
    }
  }

  return {
    questions,
    contextChars,
    availableChars: index.totalChars,
    batches: batches.length,
    profileReused,
  };
}
