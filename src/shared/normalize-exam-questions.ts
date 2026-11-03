import type { ExamQuestion } from "./types";

function asString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value == null) return "";
  return String(value).trim();
}

function defaultMarks(type: "mc" | "sa" | "la"): number {
  if (type === "mc") return 2;
  if (type === "sa") return 10;
  return 20;
}

function resolveMcCorrect(options: string[], raw: Record<string, unknown>): number {
  if (typeof raw.correct === "number" && raw.correct >= 0) return raw.correct;

  const answer = asString(raw.correctAnswer ?? raw.correct_answer ?? raw.answer);
  if (!answer) return 0;

  const byExact = options.findIndex((opt) => opt === answer);
  if (byExact >= 0) return byExact;

  const letter = answer.match(/^([A-D])\b/i)?.[1]?.toUpperCase();
  if (letter) return Math.min(options.length - 1, letter.charCodeAt(0) - 65);

  const byPrefix = options.findIndex(
    (opt) => opt.startsWith(answer) || answer.startsWith(opt.slice(0, 12)),
  );
  return byPrefix >= 0 ? byPrefix : 0;
}

function resolveType(raw: Record<string, unknown>): "mc" | "sa" | "la" {
  const type = asString(raw.type).toLowerCase();
  if (type === "mc" || type === "multiple_choice" || type === "multiple choice") return "mc";
  if (type === "sa" || type === "short" || type === "short_answer" || type === "short answer") {
    return "sa";
  }
  return "la";
}

export function normalizeExamQuestion(raw: unknown, index: number): ExamQuestion {
  const q = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const type = resolveType(q);
  const text = asString(q.text ?? q.question ?? q.prompt ?? q.stem ?? q.body);
  const id = typeof q.id === "number" ? q.id : index + 1;
  const marks =
    typeof q.marks === "number" && q.marks > 0 ? q.marks : defaultMarks(type);

  if (type === "mc") {
    const options = Array.isArray(q.options) ? q.options.map((o) => asString(o)).filter(Boolean) : [];
    return {
      id,
      type: "mc",
      marks,
      text,
      options,
      correct: resolveMcCorrect(options, q),
      explanation: asString(q.explanation) || undefined,
    };
  }

  const shared = {
    id,
    marks,
    text,
    placeholder: asString(q.placeholder) || undefined,
    modelAnswer: asString(q.modelAnswer ?? q.model_answer ?? q.answer) || undefined,
  };

  return type === "sa" ? { ...shared, type: "sa" } : { ...shared, type: "la" };
}

export function normalizeExamQuestions(raw: unknown): ExamQuestion[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { questions?: unknown }).questions)
      ? (raw as { questions: unknown[] }).questions
      : [];

  return list.map((item, i) => normalizeExamQuestion(item, i));
}
