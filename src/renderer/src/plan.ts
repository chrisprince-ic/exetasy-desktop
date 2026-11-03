/**
 * The study plan, built locally from readiness — no plan usage, no model call.
 *
 * Works backwards from the course's exam date in three phases, the shape the
 * prototype's coach describes:
 *
 *   1. close gaps   — topic drills on the weakest topics, plus card review
 *   2. rehearse     — timed full practice exams every other day
 *   3. taper        — the last two days are light review only
 *
 * Weak topics are recomputed from readiness every time the plan renders, so
 * finishing sessions (and the scores they produce) rebalances the plan.
 */
import { isoDay } from "./ui";
import type { Course, Readiness } from "./types";

export type SessionKind = "Practice" | "Review" | "Reading" | "Exam" | "Test day";

export interface PlanSession {
  slot: "Morning" | "Afternoon" | "Evening";
  title: string;
  kind: SessionKind;
  minutes: number;
  /** Set on drills: the topic to generate questions for. */
  topic?: string;
}

export interface PlanDay {
  date: Date;
  iso: string;
  /** 0 is today. */
  offset: number;
  isExamDay: boolean;
  sessions: PlanSession[];
}

/** Days shown when no exam date is set: a rolling week. */
const ROLLING_DAYS = 7;
/** A plan longer than this is unreadable as a strip; later days roll in over time. */
const MAX_DAYS = 21;

/** Weakest first. Untested topics count as weak: they're unknowns. */
export function rankTopics(readiness: Readiness | null): string[] {
  if (!readiness) return [];
  return [...readiness.topics]
    .sort((a, b) => {
      const ma = a.attempted ? a.mastery : 45;
      const mb = b.attempted ? b.mastery : 45;
      return ma - mb || b.weight - a.weight;
    })
    .map((t) => t.topic);
}

export function buildPlan(
  course: Course | undefined,
  readiness: Readiness | null,
  today = new Date(),
): PlanDay[] {
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);

  let daysToExam: number | null = null;
  if (course?.examDate) {
    const [y, m, d] = course.examDate.split("-").map(Number);
    const exam = new Date(y!, m! - 1, d!);
    daysToExam = Math.round((exam.getTime() - start.getTime()) / 86_400_000);
    if (daysToExam < 0) daysToExam = null;
  }

  const length = daysToExam === null ? ROLLING_DAYS : Math.min(daysToExam + 1, MAX_DAYS);
  const weak = rankTopics(readiness);
  // Cycle through the weakest half (at least three) so drills don't all hit one topic.
  const focus = weak.slice(0, Math.max(3, Math.ceil(weak.length / 2)));
  const topicFor = (n: number) => (focus.length ? focus[n % focus.length] : undefined);
  const examName = course?.examLabel || "Exam";

  const days: PlanDay[] = [];
  let drill = 0;

  for (let offset = 0; offset < length; offset++) {
    const date = new Date(start);
    date.setDate(start.getDate() + offset);
    const remaining = daysToExam === null ? null : daysToExam - offset;
    const sessions: PlanSession[] = [];

    if (remaining === 0) {
      sessions.push({ slot: "Morning", title: `${course?.name ?? "Course"} ${examName}`, kind: "Test day", minutes: 0 });
    } else if (remaining !== null && remaining <= 2) {
      // Taper: keep recall warm, don't cram.
      sessions.push({ slot: "Evening", title: "Light flashcard review", kind: "Review", minutes: 15 });
    } else {
      const total = daysToExam ?? ROLLING_DAYS;
      const rehearse = remaining !== null && total >= 6 && offset >= Math.floor(total * 0.4);
      const topic = topicFor(drill++);

      if (rehearse && offset % 2 === 0) {
        sessions.push({ slot: "Afternoon", title: "Full timed practice exam", kind: "Exam", minutes: 50 });
      } else if (topic) {
        sessions.push({ slot: "Afternoon", title: `${topic} drill`, kind: "Practice", minutes: 25, topic });
      } else {
        sessions.push({ slot: "Afternoon", title: "Practice exam from your materials", kind: "Practice", minutes: 30 });
      }

      // Reading days slot in before a topic is drilled again.
      if (offset % 3 === 1 && topic) {
        sessions.push({ slot: "Morning", title: `Re-read your notes on ${topic}`, kind: "Reading", minutes: 20 });
        sessions.sort((a, b) => (a.slot === "Morning" ? -1 : b.slot === "Morning" ? 1 : 0));
      }
      sessions.push({ slot: "Evening", title: "Review due flashcards", kind: "Review", minutes: 10 });
    }

    days.push({ date, iso: isoDay(date), offset, isExamDay: remaining === 0, sessions });
  }

  return days;
}

export const doneKey = (courseId: string, iso: string, index: number) => `${courseId}:${iso}:${index}`;
