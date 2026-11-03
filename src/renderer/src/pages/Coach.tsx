import { useEffect, useRef, useState } from "react";
import { CoachMark, Icon, useToast } from "../ui";
import { isFailure, type CoachTurn, type Course } from "../types";

export function Coach({
  course,
  model,
  canGenerate,
  weakest,
  messages,
  onMessages,
}: {
  course: Course;
  model: string;
  canGenerate: boolean;
  weakest?: string;
  /** Kept by App so the conversation survives page switches. */
  messages: CoachTurn[];
  onMessages: (m: CoachTurn[]) => void;
}) {
  const toast = useToast();
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [stream, setStream] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => window.exee.onCoachDelta((d) => setStream((s) => s + d)), []);

  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 1e6;
  }, [messages, stream, pending]);

  useEffect(() => field.current?.focus(), []);

  const send = async (text?: string) => {
    const question = (text ?? input).trim();
    if (!question || pending) return;
    if (!canGenerate) return toast("Plan usage is off for this account", "error");

    const history = messages;
    const next: CoachTurn[] = [...history, { role: "user", text: question }];
    onMessages(next);
    setInput("");
    setStream("");
    setPending(true);

    const r = await window.exee.askCoach({ model, courseId: course.id, question, history });
    setPending(false);
    setStream("");
    if (isFailure(r)) {
      toast(r.message, "error");
      onMessages(history);
      setInput(question);
      return;
    }
    onMessages([...next, { role: "coach", text: r.data.trim() }]);
  };

  const greeting: CoachTurn = {
    role: "coach",
    text: `Hi. I've read your ${course.code || course.name} materials and your practice results. Ask me to explain anything, or start with one of these.`,
  };
  const shown = [greeting, ...messages, ...(pending && stream ? [{ role: "coach" as const, text: stream }] : [])];
  const suggestions = [
    weakest ? `Why am I weak in ${weakest}?` : "Which topics should I start with?",
    course.examDate ? "Plan my days until the exam" : "Plan my next week of studying",
    weakest ? `Explain ${weakest} simply` : "Summarise the key ideas in my notes",
  ];

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", maxWidth: 820, width: "100%", margin: "0 auto", padding: "12px 32px 24px", height: "calc(100vh - 85px)" }}>
      <div ref={scroller} style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 18, padding: "20px 2px" }}>
        {shown.map((m, i) => {
          const coach = m.role === "coach";
          return (
            <div key={i} style={{ display: "flex", gap: 12, justifyContent: coach ? "flex-start" : "flex-end", animation: "rise .35s var(--ease) both" }}>
              {coach && <CoachMark />}
              <div
                style={{
                  maxWidth: "78%",
                  padding: "14px 18px",
                  borderRadius: coach ? "4px 18px 18px 18px" : "18px 4px 18px 18px",
                  background: coach ? "var(--paper)" : "var(--navy)",
                  color: coach ? "var(--ink)" : "var(--on-navy)",
                  border: `1px solid ${coach ? "var(--line)" : "var(--navy)"}`,
                  font: "400 15px/23px var(--font)",
                  whiteSpace: "pre-wrap",
                  textWrap: "pretty",
                  userSelect: "text",
                }}
              >
                {m.text}
              </div>
            </div>
          );
        })}
        {pending && !stream && (
          <div className="fade" style={{ display: "flex", gap: 12 }}>
            <CoachMark />
            <div style={{ padding: "16px 18px", borderRadius: "4px 18px 18px 18px", background: "var(--paper)", border: "1px solid var(--line)", display: "flex", gap: 5 }}>
              {[0, 0.15, 0.3].map((d) => (
                <span key={d} style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--ink-3)", animation: `dot 1.2s ${d}s infinite` }} />
              ))}
            </div>
          </div>
        )}
      </div>

      {messages.length === 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "10px 0" }}>
          {suggestions.map((s) => (
            <button key={s} className="pill-toggle" style={{ height: 34, padding: "0 14px", fontSize: 13 }} onClick={() => void send(s)}>
              {s}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 8px 8px 20px", borderRadius: 99, background: "var(--paper)", border: "1px solid var(--line-2)", boxShadow: "0 10px 30px -20px rgba(28,32,51,.4)" }}>
        <input
          ref={field}
          value={input}
          maxLength={2000}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void send()}
          placeholder="Ask about any topic in your materials…"
          style={{ flex: 1, border: 0, outline: 0, background: "transparent", font: "400 15px/22px var(--font)", minWidth: 0 }}
        />
        <button
          className="btn btn-primary"
          disabled={!input.trim() || pending}
          onClick={() => void send()}
          title="Send"
          style={{ width: 42, height: 42, padding: 0, borderRadius: "50%" }}
        >
          <Icon name="arrow_upward" size={20} />
        </button>
      </div>
      <span style={{ textAlign: "center", font: "400 11.5px/16px var(--font)", color: "var(--ink-5)", marginTop: 10 }}>
        Answers use your ChatGPT plan and your course notes. Check anything important against your materials.
      </span>
    </div>
  );
}
