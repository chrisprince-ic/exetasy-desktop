/** Normalize AI grade-exam payloads that sometimes nest scores oddly. */

export interface NormalizedGradeResult {
  totalScore: number;
  totalPossible: number;
  grade: string;
  feedback: string;
  studyTopics: string[];
  questionResults: unknown[];
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return fallback;
}

function asString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

/** Coerce a possibly-object grade field into a displayable letter/label. */
export function coerceGradeLabel(grade: unknown): string {
  if (typeof grade === "string" && grade.trim()) return grade.trim();
  if (typeof grade === "number") return String(grade);
  if (grade && typeof grade === "object") {
    const g = grade as Record<string, unknown>;
    if (typeof g.letter === "string") return g.letter;
    if (typeof g.grade === "string") return g.grade;
    if (typeof g.pass_status === "string") return g.pass_status;
    if (typeof g.percentage === "number") return `${Math.round(g.percentage)}%`;
    if (typeof g.student_score === "number" && typeof g.total_possible_score === "number") {
      const pct = g.total_possible_score
        ? Math.round((g.student_score / g.total_possible_score) * 100)
        : 0;
      return `${pct}%`;
    }
  }
  return "—";
}

export function coerceFeedbackText(feedback: unknown): string {
  if (typeof feedback === "string") return feedback;
  if (feedback && typeof feedback === "object") {
    const f = feedback as Record<string, unknown>;
    if (typeof f.summary === "string") return f.summary;
    if (typeof f.text === "string") return f.text;
    if (typeof f.message === "string") return f.message;
  }
  return "";
}

export function normalizeGradeResult(
  raw: unknown,
  fallbackTotalPossible = 0,
): NormalizedGradeResult {
  const data = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const nestedGrade =
    data.grade && typeof data.grade === "object"
      ? (data.grade as Record<string, unknown>)
      : null;

  const totalScore = asNumber(
    data.totalScore ?? data.score ?? nestedGrade?.student_score,
    0,
  );
  const totalPossible = asNumber(
    data.totalPossible ?? nestedGrade?.total_possible_score,
    fallbackTotalPossible,
  );

  return {
    totalScore,
    totalPossible,
    grade: coerceGradeLabel(data.grade),
    feedback: coerceFeedbackText(data.feedback) || asString(data.feedback, ""),
    studyTopics: Array.isArray(data.studyTopics)
      ? data.studyTopics.filter((t): t is string => typeof t === "string")
      : [],
    questionResults: Array.isArray(data.questionResults) ? data.questionResults : [],
  };
}
