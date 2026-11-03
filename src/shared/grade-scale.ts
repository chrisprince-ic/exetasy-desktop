/** Map a 0–100 readiness percentage to a US letter grade. */
export function gradeFromPct(pct: number): string {
  const scale: Array<[number, string]> = [
    [93, "A"],
    [90, "A-"],
    [87, "B+"],
    [83, "B"],
    [80, "B-"],
    [77, "C+"],
    [73, "C"],
    [70, "C-"],
    [67, "D+"],
    [63, "D"],
    [60, "D-"],
  ];
  for (const [threshold, grade] of scale) {
    if (pct >= threshold) return grade;
  }
  return "F";
}
