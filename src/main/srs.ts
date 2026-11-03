/**
 * Spaced repetition for flashcards: a five-box Leitner system.
 *
 * Simple on purpose. Misses come back tomorrow, hits wait progressively
 * longer, and reviews land on local day boundaries so "due today" means the
 * same thing all day.
 */

/** One flashcard with its spaced-repetition state. */
export interface Card {
  id: string;
  front: string;
  back: string;
  topic?: string;
  /** Leitner box, 0 (new or missed) to 4 (well known). */
  box: number;
  /** Epoch ms; the card is due once this has passed. */
  due: number;
}

export type Rating = "again" | "hard" | "good";

/** Days until a card in each Leitner box comes back after a "good". */
const BOX_INTERVAL_DAYS = [1, 3, 7, 14, 30];

/** Start of the local day `days` from now; reviews land on day boundaries. */
export function dayFromNow(days: number, now = Date.now()): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  // Calendar arithmetic, not days * 24h, so a DST change can't shift the hour.
  d.setDate(d.getDate() + days);
  return d.getTime();
}

/** Leitner scheduling: misses return tomorrow, hits wait progressively longer. */
export function schedule(card: Card, rating: Rating, now = Date.now()): Card {
  if (rating === "again") return { ...card, box: 0, due: dayFromNow(1, now) };
  if (rating === "hard") {
    const box = Math.max(1, card.box);
    return { ...card, box, due: dayFromNow(1, now) };
  }
  const box = Math.min(BOX_INTERVAL_DAYS.length - 1, card.box + 1);
  return { ...card, box, due: dayFromNow(BOX_INTERVAL_DAYS[box], now) };
}

