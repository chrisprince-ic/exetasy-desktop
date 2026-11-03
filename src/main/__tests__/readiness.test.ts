import { describe, expect, it } from "vitest";
import { computeReadiness, wilsonLowerBound } from "../readiness";
import type { Attempt, CourseProfile, Exam } from "../store";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 0, 15);

function exam(id: string, questions: Array<{ id: number; topic: string; marks: number }>): Exam {
  return {
    id,
    courseId: "c1",
    title: `Exam ${id}`,
    questions,
    timeLimit: 60,
    createdAt: NOW,
  };
}

function attempt(
  examId: string,
  perQuestion: Array<{ id: number; awarded: number; max: number }>,
  ageDays = 0,
): Attempt {
  return {
    id: `a-${examId}-${ageDays}`,
    examId,
    courseId: "c1",
    answers: {},
    startedAt: NOW - ageDays * DAY,
    gradedAt: NOW - ageDays * DAY,
    result: {
      score: perQuestion.reduce((s, q) => s + q.awarded, 0),
      maxScore: perQuestion.reduce((s, q) => s + q.max, 0),
      perQuestion: perQuestion.map((q) => ({ ...q, feedback: "" })),
      weakTopics: [],
      summary: "",
    },
  };
}

const profile = (topics: string[]): CourseProfile => ({
  courseId: "c1",
  materialsHash: "h",
  topics,
  keyTerms: [],
  style: "",
  createdAt: NOW,
});

describe("wilsonLowerBound", () => {
  it("returns 0 with no trials", () => {
    expect(wilsonLowerBound(0, 0)).toBe(0);
  });

  it("discounts a perfect score far more when the sample is small", () => {
    const tiny = wilsonLowerBound(5, 5);
    const large = wilsonLowerBound(100, 100);
    expect(tiny).toBeLessThan(large);
    // Five perfect marks is encouraging but not proof of mastery.
    expect(tiny).toBeGreaterThan(0.5);
    expect(tiny).toBeLessThan(0.8);
    expect(large).toBeGreaterThan(0.95);
  });

  it("is always at or below the naive proportion", () => {
    for (const [s, n] of [
      [7, 10],
      [1, 3],
      [45, 60],
      [99, 100],
    ] as const) {
      expect(wilsonLowerBound(s, n)).toBeLessThanOrEqual(s / n);
    }
  });

  it("stays within [0, 1]", () => {
    expect(wilsonLowerBound(0, 50)).toBeGreaterThanOrEqual(0);
    expect(wilsonLowerBound(50, 50)).toBeLessThanOrEqual(1);
  });
});

describe("computeReadiness", () => {
  it("reports no score when nothing has been graded", () => {
    const r = computeReadiness([], [], [], NOW);
    expect(r.readinessPct).toBeNull();
    expect(r.riskLevel).toBe("unknown");
    expect(r.confidence).toBe(0);
  });

  it("ignores attempts whose exam has been deleted", () => {
    const r = computeReadiness([], [attempt("gone", [{ id: 1, awarded: 10, max: 10 }])], [], NOW);
    expect(r.readinessPct).toBeNull();
  });

  it("scores a strong, well-evidenced performance highly", () => {
    const questions = Array.from({ length: 20 }, (_, i) => ({
      id: i + 1,
      topic: i % 2 ? "Trees" : "Graphs",
      marks: 10,
    }));
    const r = computeReadiness(
      [exam("e1", questions)],
      [attempt("e1", questions.map((q) => ({ id: q.id, awarded: 10, max: 10 })))],
      [profile(["Graphs", "Trees"])],
      NOW,
    );
    expect(r.readinessPct).toBeGreaterThan(90);
    expect(r.riskLevel).toBe("low");
    expect(r.confidence).toBe(1);
    expect(r.highRiskTopics).toEqual([]);
  });

  it("penalises topics in the material that were never tested", () => {
    const questions = [{ id: 1, topic: "Graphs", marks: 100 }];
    const tested = computeReadiness(
      [exam("e1", questions)],
      [attempt("e1", [{ id: 1, awarded: 100, max: 100 }])],
      [profile(["Graphs"])],
      NOW,
    );
    const halfUntested = computeReadiness(
      [exam("e1", questions)],
      [attempt("e1", [{ id: 1, awarded: 100, max: 100 }])],
      [profile(["Graphs", "Hashing", "Sorting"])],
      NOW,
    );
    // Same performance, but two thirds of the syllabus is unverified.
    expect(halfUntested.readinessPct!).toBeLessThan(tested.readinessPct!);
    expect(halfUntested.limiting).toContain("haven't been tested");
  });

  it("weights recent evidence above stale evidence", () => {
    const questions = [{ id: 1, topic: "Graphs", marks: 100 }];
    const recentGood = computeReadiness(
      [exam("e1", questions)],
      [
        attempt("e1", [{ id: 1, awarded: 20, max: 100 }], 60), // bad, long ago
        attempt("e1", [{ id: 1, awarded: 95, max: 100 }], 1), // good, yesterday
      ],
      [profile(["Graphs"])],
      NOW,
    );
    const recentBad = computeReadiness(
      [exam("e1", questions)],
      [
        attempt("e1", [{ id: 1, awarded: 95, max: 100 }], 60), // good, long ago
        attempt("e1", [{ id: 1, awarded: 20, max: 100 }], 1), // bad, yesterday
      ],
      [profile(["Graphs"])],
      NOW,
    );
    expect(recentGood.readinessPct!).toBeGreaterThan(recentBad.readinessPct!);
  });

  it("keeps a tiny perfect sample well below certainty", () => {
    const questions = [{ id: 1, topic: "Graphs", marks: 4 }];
    const r = computeReadiness(
      [exam("e1", questions)],
      [attempt("e1", [{ id: 1, awarded: 4, max: 4 }])],
      [profile(["Graphs"])],
      NOW,
    );
    // Four perfect marks must not read as "ready".
    expect(r.readinessPct!).toBeLessThan(80);
    expect(r.confidence).toBeLessThan(0.35);
    expect(r.limiting).toContain("limited practice");
  });

  it("surfaces the weakest high-weight topic first", () => {
    const questions = [
      { id: 1, topic: "Graphs", marks: 80 },
      { id: 2, topic: "Trees", marks: 20 },
    ];
    const r = computeReadiness(
      [exam("e1", questions)],
      [
        attempt("e1", [
          { id: 1, awarded: 16, max: 80 }, // heavy topic, badly failed
          { id: 2, awarded: 4, max: 20 }, // light topic, also failed
        ]),
      ],
      [profile(["Graphs", "Trees"])],
      NOW,
    );
    expect(r.highRiskTopics[0]).toBe("Graphs");
    expect(r.riskLevel).toBe("high");
  });

  it("maps the score onto the shared EASE grade scale", () => {
    const questions = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      topic: "Graphs",
      marks: 20,
    }));
    const r = computeReadiness(
      [exam("e1", questions)],
      [attempt("e1", questions.map((q) => ({ id: q.id, awarded: 20, max: 20 })))],
      [profile(["Graphs"])],
      NOW,
    );
    expect(r.predictedGrade).toBe("A");
  });

  it("never returns a score outside 0-100", () => {
    const questions = [{ id: 1, topic: "Graphs", marks: 10 }];
    const over = computeReadiness(
      [exam("e1", questions)],
      // Defensive: a grader returning more marks than available must not break it.
      [attempt("e1", [{ id: 1, awarded: 999, max: 10 }])],
      [profile(["Graphs"])],
      NOW,
    );
    expect(over.readinessPct!).toBeLessThanOrEqual(100);
    expect(over.readinessPct!).toBeGreaterThanOrEqual(0);
  });
});
