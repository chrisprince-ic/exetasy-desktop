/**
 * Exam readiness score.
 *
 * Builds on the EASE readiness model (src/lib/ease/readinessScore.ts), which
 * computes a blueprint-weighted accuracy with unattempted topics counted as
 * zero. That coverage rule is the important idea and is kept. Its letter-grade
 * scale is reused directly.
 *
 * Two things that model does not account for, and which matter a lot when the
 * score is driven by a handful of self-generated practice exams:
 *
 *   1. RECENCY. A topic you aced three weeks ago is weaker evidence of
 *      readiness today than one you aced last night. Marks decay with a
 *      three-week half-life.
 *
 *   2. SAMPLE SIZE. Scoring 5/5 on a topic is not the same as 50/50. Naive
 *      accuracy says 100% for both. We instead take the lower bound of a
 *      Wilson score interval, which is the standard way to say "given this
 *      much evidence, what level can we actually be confident in". Five
 *      perfect marks yields roughly 65%, fifty yields roughly 94%.
 *
 * Both corrections push the score down when evidence is thin, which is the
 * honest direction: a readiness number that reads 100% after one short quiz
 * would be actively harmful the week before a final.
 */
import { gradeFromPct } from "../shared/grade-scale";
import type { Attempt, Exam, CourseProfile } from "./store.js";

/** Marks lose half their evidential weight every three weeks. */
const HALF_LIFE_DAYS = 21;

/**
 * One-sided z for the Wilson lower bound; 1.645 is the standard 95% level.
 *
 * Calibration at this value: 5 perfect marks reads ~65%, 100 perfect marks
 * ~97%. A gentler z (1.04) was tried first and scored 5/5 at 82%, which
 * overstates readiness from almost no evidence — exactly the failure mode
 * this bound exists to prevent.
 */
const Z = 1.645;

/** Accuracy below this on a weighted topic marks it high risk. */
const HIGH_RISK = 60;

export interface ReadinessBreakdown {
  topic: string;
  /** Share of assessed marks this topic represents, 0-1. */
  weight: number;
  /** Confidence-adjusted mastery, 0-100. */
  mastery: number;
  /** Raw decayed accuracy before the confidence adjustment, 0-100. */
  rawAccuracy: number;
  /** Decay-weighted marks attempted. */
  evidence: number;
  attempted: boolean;
}

export interface Readiness {
  /** Null when there is no graded evidence at all. */
  readinessPct: number | null;
  predictedGrade: string | null;
  riskLevel: "low" | "medium" | "high" | "unknown";
  highRiskTopics: string[];
  /** 0-1: how much the score can be trusted, from total evidence. */
  confidence: number;
  /** Plain-language reason the score is where it is. */
  limiting: string;
  gradedAttempts: number;
  topics: ReadinessBreakdown[];
}

/**
 * Lower bound of the Wilson score interval.
 *
 * Standard formula for a binomial proportion. Marks act as pseudo-trials:
 * earning 7 of 10 marks is treated as 7 successes in 10. That is an
 * approximation — marks within a question are correlated — but it is a far
 * better estimator than raw accuracy and errs conservative, which is what we
 * want for a readiness claim.
 */
export function wilsonLowerBound(successes: number, trials: number, z = Z): number {
  if (trials <= 0) return 0;
  const p = Math.min(1, Math.max(0, successes / trials));
  const z2 = z * z;
  const denominator = 1 + z2 / trials;
  const centre = p + z2 / (2 * trials);
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * trials)) / trials);
  return Math.max(0, Math.min(1, (centre - margin) / denominator));
}

/** Exponential forgetting curve applied to a mark's evidential weight. */
function decay(gradedAt: number, now: number): number {
  const ageDays = Math.max(0, (now - gradedAt) / 86_400_000);
  return Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
}

interface QuestionTopic {
  topic: string;
  marks: number;
}

/** Maps questionId -> {topic, marks} for one exam. */
function topicsOf(exam: Exam): Map<number, QuestionTopic> {
  const map = new Map<number, QuestionTopic>();
  for (const raw of exam.questions) {
    if (!raw || typeof raw !== "object") continue;
    const q = raw as { id?: unknown; topic?: unknown; marks?: unknown };
    const id = Number(q.id);
    if (!Number.isFinite(id)) continue;
    map.set(id, {
      topic: typeof q.topic === "string" && q.topic.trim() ? q.topic.trim() : "General",
      marks: Number(q.marks) || 0,
    });
  }
  return map;
}

export function computeReadiness(
  exams: Exam[],
  attempts: Attempt[],
  profiles: CourseProfile[],
  now = Date.now(),
): Readiness {
  const examById = new Map(exams.map((e) => [e.id, e]));
  const graded = attempts.filter((a) => a.result && a.gradedAt);

  // ---- 1. Accumulate decayed marks per topic ----
  const earned = new Map<string, number>();
  const total = new Map<string, number>();
  /** Undecayed mark totals, used for topic weighting (emphasis is timeless). */
  const assessed = new Map<string, number>();

  for (const attempt of graded) {
    const exam = examById.get(attempt.examId);
    if (!exam) continue; // exam deleted; its attempt no longer describes anything
    const topics = topicsOf(exam);
    const w = decay(attempt.gradedAt!, now);

    for (const q of attempt.result!.perQuestion) {
      const meta = topics.get(q.id);
      const topic = meta?.topic ?? "General";
      earned.set(topic, (earned.get(topic) ?? 0) + w * Math.max(0, q.awarded));
      total.set(topic, (total.get(topic) ?? 0) + w * Math.max(0, q.max));
      assessed.set(topic, (assessed.get(topic) ?? 0) + Math.max(0, q.max));
    }
  }

  if (graded.length === 0 || total.size === 0) {
    return {
      readinessPct: null,
      predictedGrade: null,
      riskLevel: "unknown",
      highRiskTopics: [],
      confidence: 0,
      limiting: "Take and submit a practice exam to see your readiness.",
      gradedAttempts: 0,
      topics: [],
    };
  }

  // ---- 2. Coverage: profile topics never assessed count as zero ----
  // This is the EASE rule, and it is what stops readiness being gamed by
  // drilling one easy topic repeatedly.
  const covered = new Set(assessed.keys());
  const allProfileTopics = new Set<string>();
  for (const p of profiles) for (const t of p.topics) allProfileTopics.add(t.trim());

  const uncovered = [...allProfileTopics].filter(
    (t) => t && !covered.has(t) && ![...covered].some((c) => c.toLowerCase() === t.toLowerCase()),
  );

  // An unassessed topic is weighted at the mean of the assessed ones, so
  // coverage gaps count without one gap dominating the whole score.
  const assessedTotal = [...assessed.values()].reduce((s, n) => s + n, 0);
  const meanWeight = assessedTotal / Math.max(1, assessed.size);
  const weightTotal = assessedTotal + uncovered.length * meanWeight;

  // ---- 3. Per-topic mastery with the confidence adjustment ----
  const breakdown: ReadinessBreakdown[] = [];

  for (const [topic, marksAssessed] of assessed) {
    const e = earned.get(topic) ?? 0;
    const t = total.get(topic) ?? 0;
    const raw = t > 0 ? (e / t) * 100 : 0;
    breakdown.push({
      topic,
      weight: marksAssessed / weightTotal,
      mastery: wilsonLowerBound(e, t) * 100,
      rawAccuracy: raw,
      evidence: t,
      attempted: true,
    });
  }

  for (const topic of uncovered) {
    breakdown.push({
      topic,
      weight: meanWeight / weightTotal,
      mastery: 0,
      rawAccuracy: 0,
      evidence: 0,
      attempted: false,
    });
  }

  // ---- 4. Weighted roll-up ----
  const readinessPct = Math.round(
    breakdown.reduce((sum, t) => sum + t.weight * t.mastery, 0),
  );
  const clamped = Math.max(0, Math.min(100, readinessPct));

  // ---- 5. Confidence and the limiting factor ----
  // One full exam's worth of recent marks (~100) is treated as solid evidence.
  const evidence = [...total.values()].reduce((s, n) => s + n, 0);
  const confidence = Math.min(1, evidence / 100);

  const highRiskTopics = breakdown
    .filter((t) => t.attempted && t.mastery < HIGH_RISK)
    .sort((a, b) => b.weight * (100 - b.mastery) - a.weight * (100 - a.mastery))
    .map((t) => t.topic);

  // "General" is the fallback bucket for questions generated before topics
  // were tracked. Naming it as a weak area reads like a bug, so treat it as
  // unlabelled and fall through to a message that is actually actionable.
  const namedRisk = highRiskTopics.filter((t) => t.toLowerCase() !== "general");

  let limiting: string;
  if (confidence < 0.35) {
    limiting = "Based on limited practice — take another exam to sharpen this estimate.";
  } else if (uncovered.length > 0) {
    limiting = `${uncovered.length} topic${uncovered.length === 1 ? "" : "s"} from your material haven't been tested yet.`;
  } else if (namedRisk.length > 0) {
    limiting = `Weakest area: ${namedRisk[0]}.`;
  } else if (highRiskTopics.length > 0) {
    limiting = "Scores are low across the board — revisit the material before the next attempt.";
  } else if (clamped >= 80) {
    limiting = "Strong across every topic you've practised.";
  } else {
    limiting = "Steady progress — keep practising to lift this.";
  }

  return {
    readinessPct: clamped,
    predictedGrade: gradeFromPct(clamped),
    riskLevel: clamped >= 80 ? "low" : clamped >= 60 ? "medium" : "high",
    highRiskTopics: highRiskTopics.slice(0, 5),
    confidence,
    limiting,
    gradedAttempts: graded.length,
    topics: breakdown.sort((a, b) => b.weight - a.weight),
  };
}
