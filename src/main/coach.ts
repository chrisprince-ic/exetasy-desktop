/**
 * The AI study coach.
 *
 * This is deliberately not a general chat channel (see the note at the top of
 * ipc.ts). Every request is pinned to one course: the question is answered
 * from that course's own material, retrieved locally with the same BM25 index
 * exam generation uses, plus the student's readiness numbers. The
 * instructions tell the model to decline anything that isn't about studying
 * the course, and inputs are length-capped so the channel can't be used to
 * push arbitrary payloads through the student's plan.
 */
import { getChatGPT } from "./chatgpt.js";
import { computeReadiness } from "./readiness.js";
import { buildIndex, renderChunks } from "./retrieval.js";
import * as store from "./store.js";

export interface CoachTurn {
  role: "user" | "coach";
  text: string;
}

export interface CoachInput {
  model: string;
  courseId: string;
  question: string;
  history: CoachTurn[];
}

const MAX_QUESTION_CHARS = 2_000;
const MAX_HISTORY_TURNS = 6;
const MAX_TURN_CHARS = 1_500;
/** ~2.5k tokens of retrieved notes per answer. */
const CONTEXT_BUDGET = 10_000;

export async function askCoach(input: CoachInput, onDelta: (delta: string) => void): Promise<string> {
  const question = input.question.trim().slice(0, MAX_QUESTION_CHARS);
  if (!question) throw new Error("Ask a question first.");

  const course = (await store.listCourses()).find((c) => c.id === input.courseId);
  if (!course) throw new Error("Course not found.");

  // ---- Ground in the course's own notes (local, free) ----
  const metas = await store.listMaterials(course.id);
  const materials = await store.getMaterialsFull(metas.map((m) => m.id));
  const index = buildIndex(materials);
  const recent = input.history
    .slice(-MAX_HISTORY_TURNS)
    .map((t) => ({ role: t.role, text: String(t.text ?? "").slice(0, MAX_TURN_CHARS) }));
  // Fold the last user turn into the query so follow-ups ("explain that
  // again") still retrieve the right passages.
  const lastUser = [...recent].reverse().find((t) => t.role === "user")?.text ?? "";
  const excerpt =
    index.size > 0 ? renderChunks(index.select(`${question} ${lastUser}`, CONTEXT_BUDGET).chunks) : "";

  // ---- What the student is weak at ----
  const { exams, attempts, profiles } = await store.readinessInputs(course.id);
  const readiness = computeReadiness(exams, attempts, profiles);
  const topicLines = readiness.topics
    .filter((t) => t.attempted)
    .slice(0, 8)
    .map((t) => `- ${t.topic}: ${Math.round(t.mastery)}% mastery`)
    .join("\n");

  const daysLeft = course.examDate
    ? Math.ceil((new Date(`${course.examDate}T00:00:00`).getTime() - Date.now()) / 86_400_000)
    : null;

  const conversation = recent
    .map((t) => `${t.role === "user" ? "Student" : "Coach"}: ${t.text}`)
    .join("\n\n");

  const { text } = await getChatGPT().streamResponse({
    model: input.model,
    instructions:
      `You are Exetasy's study coach for the university course "${course.name}"` +
      `${course.code ? ` (${course.code})` : ""}. You only help this student study this course: ` +
      "explain concepts, diagnose weak topics, and plan revision. If asked for anything " +
      "unrelated to studying this course, briefly decline and steer back. Ground explanations " +
      "in the course excerpts provided and name the source title when you use one. If the " +
      "excerpts don't cover something, say so before answering from general knowledge. Be " +
      "concise and warm: short paragraphs, plain text, no markdown headings, no emojis.",
    input: `Student context
${readiness.readinessPct !== null ? `Exam readiness: ${readiness.readinessPct}% (${readiness.riskLevel} risk)` : "Exam readiness: not measured yet (no graded exams)"}
${daysLeft !== null ? `${course.examLabel || "Exam"} in ${daysLeft} day${daysLeft === 1 ? "" : "s"} (${course.examDate})` : "No exam date set"}
${topicLines ? `Topic mastery:\n${topicLines}` : ""}

Course excerpts
${excerpt || "No study material has been added to this course yet."}

${conversation ? `Conversation so far\n${conversation}\n\n` : ""}Student: ${question}`,
    onDelta,
  });

  return text;
}
