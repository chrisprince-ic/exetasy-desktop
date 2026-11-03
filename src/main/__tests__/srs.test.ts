import { describe, expect, it } from "vitest";
import { dayFromNow, schedule, type Card } from "../srs";

const NOW = new Date(2026, 9, 29, 15, 30).getTime();
const card = (box: number): Card => ({ id: "c", front: "f", back: "b", box, due: NOW });

describe("schedule", () => {
  it("sends a missed card back to box 0, due tomorrow", () => {
    expect(schedule(card(3), "again", NOW)).toMatchObject({ box: 0, due: dayFromNow(1, NOW) });
  });

  it("keeps a hard card in at least box 1, due tomorrow", () => {
    expect(schedule(card(0), "hard", NOW)).toMatchObject({ box: 1, due: dayFromNow(1, NOW) });
    expect(schedule(card(3), "hard", NOW).box).toBe(3);
  });

  it("promotes a good card and lengthens the interval", () => {
    expect(schedule(card(0), "good", NOW)).toMatchObject({ box: 1, due: dayFromNow(3, NOW) });
    expect(schedule(card(2), "good", NOW)).toMatchObject({ box: 3, due: dayFromNow(14, NOW) });
  });

  it("caps at the last box", () => {
    expect(schedule(card(4), "good", NOW)).toMatchObject({ box: 4, due: dayFromNow(30, NOW) });
  });

  it("stays on midnight across a DST change", () => {
    const due = new Date(dayFromNow(14, NOW));
    expect([due.getHours(), due.getMinutes()]).toEqual([0, 0]);
  });

  it("lands reviews on local midnight", () => {
    const due = new Date(schedule(card(0), "again", NOW).due);
    expect([due.getHours(), due.getMinutes(), due.getDate()]).toEqual([0, 0, 30]);
  });
});
