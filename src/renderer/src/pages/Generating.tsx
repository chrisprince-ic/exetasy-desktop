/* ============================================================
   EXEE AI — "Building your exam"
   The steps track the main process's real progress messages
   (see main/generate.ts); nothing here is a simulated timer
   except the gentle creep inside the current step.
   ============================================================ */
import { useEffect, useRef, useState } from "react";
import { Icon } from "../ui";

const STEPS = ["Reading your material", "Mapping course topics", "Writing questions", "Calibrating to exam level"];

/** Which step a progress message belongs to, plus a detail line for done steps. */
function interpret(message: string): { step: number; batch?: [number, number] } {
  if (/reading your course material/i.test(message)) return { step: 1 };
  const batch = /batch (\d+) of (\d+)/i.exec(message);
  if (batch) return { step: 2, batch: [Number(batch[1]), Number(batch[2])] };
  if (/writing/i.test(message)) return { step: 2, batch: [1, 1] };
  return { step: 0 };
}

export function Generating({ source, title, count, progress }: { source: string; title: string; count: number; progress: string }) {
  const [step, setStep] = useState(0);
  const [pct, setPct] = useState(4);
  const [profiled, setProfiled] = useState(false);
  const target = useRef(10);

  useEffect(() => {
    if (!progress) return;
    const { step: s, batch } = interpret(progress);
    if (s === 1) setProfiled(true);
    setStep((cur) => Math.max(cur, s));
    if (s === 2 && batch) {
      const [i, n] = batch;
      // Writing is the long part: spread 30%→92% across batches.
      target.current = 30 + ((i - 1) / n) * 62 + 62 / n - 4;
    } else if (s === 1) {
      target.current = 26;
    }
  }, [progress]);

  // Ease toward the current target so the bar never stalls or jumps.
  useEffect(() => {
    const t = window.setInterval(() => setPct((p) => (p < target.current ? p + Math.max(0.15, (target.current - p) * 0.04) : p)), 120);
    return () => window.clearInterval(t);
  }, []);

  const details = ["Indexed on your computer", profiled ? "Course profile saved" : "Reused saved profile", `${count} drafted`, title];

  return (
    <div className="drag" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 32 }}>
      <div className="rise" style={{ width: "100%", maxWidth: 580, display: "flex", flexDirection: "column", gap: 28 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span className="eyebrow" style={{ color: "var(--wine)" }}>Building your exam</span>
          <span className="display" style={{ fontSize: 30, lineHeight: 1.15 }}>
            Reading <em>{source}</em> and writing questions in your professor&rsquo;s style.
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4, background: "var(--paper)", borderRadius: 10, border: "1px solid var(--line)", padding: 10 }}>
          {STEPS.map((label, i) => {
            const done = i < step;
            const active = i === step;
            return (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 14, padding: 12, borderRadius: 12, background: active ? "var(--hover)" : "transparent", transition: "background .3s" }}>
                <span style={{ width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {done && (
                    <span style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--teal)", color: "var(--paper)", display: "flex", alignItems: "center", justifyContent: "center", animation: "pop .35s both" }}>
                      <Icon name="check" size={16} />
                    </span>
                  )}
                  {active && <span className="spinner" style={{ width: 20, height: 20 }} />}
                  {!done && !active && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--track)" }} />}
                </span>
                <span style={{ flex: 1, font: "500 14.5px/20px var(--font)", color: i > step ? "var(--ink-5)" : "var(--ink)" }}>
                  {active && i === 2 && progress ? progress.replace(/\.\.\.$/, "…") : label}
                </span>
                {done && <span className="fade" style={{ font: "500 12px/1 var(--font)", color: "var(--ink-4)" }}>{details[i]}</span>}
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="track" style={{ height: 6, background: "var(--sand-3)" }}>
            <span style={{ width: `${pct}%`, background: "var(--navy)", transition: "width .2s linear" }} />
          </div>
          <span style={{ display: "flex", justifyContent: "space-between", font: "500 12px/16px var(--font)", color: "var(--ink-5)" }}>
            <span>Running on your ChatGPT plan · large exams are split into batches</span>
            <span>{Math.round(pct)}%</span>
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 22, borderRadius: 10, background: "var(--paper)", border: "1px solid rgba(28,32,51,.06)", opacity: 0.8 }}>
          <div className="shimmer" style={{ height: 12, width: "30%" }} />
          <div className="shimmer" style={{ height: 18, width: "88%" }} />
          <div className="shimmer" style={{ height: 18, width: "64%" }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 6 }}>
            {[0, 1, 2, 3].map((k) => (
              <div key={k} className="shimmer" style={{ height: 42, borderRadius: 10 }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
