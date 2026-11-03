/**
 * Grading a submitted attempt against the student's ChatGPT plan.
 *
 * Multiple choice is graded locally — it is a string comparison and spending
 * plan usage on it would be wasteful. Only written answers go to the model.
 */
import { parseAiJson } from "../shared/parse-ai-json";
import { normalizeGradeResult } from "../shared/normalize-grade-result";
import type { ExamQuestion } from "../shared/types";
import { getChatGPT } from "./chatgpt.js";

export interface GradeInput {
  model: string;
  courseName: string;
  questions: ExamQuestion[];
  answers: Record<string, string | number>;
}

export interface GradeResult {
  score: number;
  maxScore: number;
  perQuestion: Array<{ id: number; awarded: number; max: number; feedback: string }>;
  weakTopics: string[];
  summary: string;
}

const SYSTEM_INSTRUCTION =
  "You are a fair but rigorous university examiner. Grade each written answer " +
  "against the model answer, award partial credit where deserved, and explain " +
  "the deduction in one or two sentences. Return ONLY valid JSON. No markdown " +
  "fences, no preamble.";

/** Written questions only; MC never reaches the model. */
const WRITTEN = new Set(["sa", "la"]);

export async function gradeAttempt(input: GradeInput): Promise<GradeResult> {
  const perQuestion: GradeResult["perQuestion"] = [];
  let score = 0;
  let maxScore = 0;

  // ---- 1. Multiple choice, graded locally ----
  const written: ExamQuestion[] = [];
  for (const q of input.questions) {
    maxScore += q.marks || 0;

    if (q.type === "mc") {
      const given = input.answers[String(q.id)];
      const correct = Number(given) === q.correct;
      const awarded = correct ? q.marks : 0;
      score += awarded;
      perQuestion.push({
        id: q.id,
        awarded,
        max: q.marks,
        feedback: correct
          ? "Correct."
          : given === undefined
            ? "Not answered."
            : `Incorrect. The correct option was ${String.fromCharCode(65 + q.correct)}.`,
      });
    } else if (WRITTEN.has(q.type)) {
      written.push(q);
    }
  }

  // ---- 2. Written answers, graded by the model ----
  if (written.length > 0) {
    const payload = written.map((q) => ({
      id: q.id,
      marks: q.marks,
      question: q.text,
      modelAnswer: "modelAnswer" in q ? q.modelAnswer : undefined,
      studentAnswer: String(input.answers[String(q.id)] ?? "").trim() || "(no answer given)",
    }));

    const prompt = `Course: ${input.courseName}

Grade each answer below. Award an integer mark from 0 to the question's maximum.

${JSON.stringify(payload, null, 2)}

Return ONLY this JSON:
{
  "questionResults": [
    { "id": <question id>, "awarded": <integer>, "feedback": "<1-2 sentences>" }
  ],
  "studyTopics": ["<topic the student should revise>"],
  "feedback": "<2-3 sentence overall summary>"
}`;

    const { text } = await getChatGPT().streamResponse({
      model: input.model,
      instructions: SYSTEM_INSTRUCTION,
      input: prompt,
    });

    const normalized = normalizeGradeResult(parseAiJson(text), maxScore);

    // Index the model's marks so a missing or malformed entry cannot drop a
    // question silently — unmatched written questions score 0 with a note.
    const byId = new Map<number, { awarded: number; feedback: string }>();
    for (const raw of normalized.questionResults) {
      if (!raw || typeof raw !== "object") continue;
      const r = raw as Record<string, unknown>;
      const id = Number(r.id);
      if (!Number.isFinite(id)) continue;
      byId.set(id, {
        awarded: Number(r.awarded ?? r.score ?? 0) || 0,
        feedback: typeof r.feedback === "string" ? r.feedback : "",
      });
    }

    for (const q of written) {
      const graded = byId.get(q.id);
      const awarded = Math.max(0, Math.min(q.marks, Math.round(graded?.awarded ?? 0)));
      score += awarded;
      perQuestion.push({
        id: q.id,
        awarded,
        max: q.marks,
        feedback: graded?.feedback || "The grader did not return feedback for this question.",
      });
    }

    return {
      score,
      maxScore,
      perQuestion: perQuestion.sort((a, b) => a.id - b.id),
      weakTopics: normalized.studyTopics,
      summary: normalized.feedback,
    };
  }

  // ---- MC-only paper: no model call needed at all ----
  const pct = maxScore ? Math.round((score / maxScore) * 100) : 0;
  return {
    score,
    maxScore,
    perQuestion: perQuestion.sort((a, b) => a.id - b.id),
    weakTopics: [],
    summary: `You scored ${score} out of ${maxScore} (${pct}%). Graded locally — multiple choice does not use your ChatGPT plan.`,
  };
}
