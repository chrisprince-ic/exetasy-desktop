/* ============================================================
   EXETASY — UI primitives
   The small set of pieces every page shares, styled after
   "Exetasy redesign prototype (3)". Most styling lives in
   styles.css; these components only add behaviour and props.
   ============================================================ */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

/** macOS draws the traffic lights over the top-left of our content. */
export const IS_MAC = navigator.platform.toLowerCase().includes("mac");

/* ---------------- Icon (Material Symbols Rounded) ---------------- */
export function Icon({
  name,
  size = 20,
  fill = false,
  color,
  style,
}: {
  name: string;
  size?: number;
  fill?: boolean;
  color?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={fill ? "mi fill" : "mi"}
      aria-hidden="true"
      style={{ fontSize: size, color, ...style }}
    >
      {name}
    </span>
  );
}

/* ---------------- Logo ---------------- */
export function Logo({ size = 36, text = true }: { size?: number; text?: boolean }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 11, color: "var(--ink)" }}>
      <span
        style={{
          width: size,
          height: size,
          borderRadius: size * 0.28,
          background: "var(--navy)",
          color: "var(--gold)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          font: `italic 500 ${Math.round(size * 0.64)}px/1 var(--font)`,
          flexShrink: 0,
        }}
      >
        E
      </span>
      {text && (
        <span style={{ font: `500 ${Math.round(size * 0.64)}px/1 var(--font)`, letterSpacing: "-.01em" }}>
          Exetasy
        </span>
      )}
    </span>
  );
}

/** The coach's avatar: the logo mark at chat size. */
export const CoachMark = () => <Logo size={34} text={false} />;

/* ---------------- Avatar ---------------- */
export function Avatar({ name, size = 34 }: { name: string; size?: number }) {
  const initials =
    name
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]!.toUpperCase())
      .join("") || "ME";
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "var(--wine)",
        color: "var(--on-navy)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        font: `600 ${Math.round(size * 0.36)}px/1 var(--font)`,
        flexShrink: 0,
      }}
    >
      {initials}
    </span>
  );
}

/* ---------------- Score colour ---------------- */
/** Teal when strong, amber when building, wine when weak — the prototype's scale. */
export const scoreColor = (pct: number) =>
  pct >= 75 ? "var(--teal)" : pct >= 55 ? "var(--amber)" : "var(--wine)";

/* ---------------- Progress bar ---------------- */
export function Bar({
  value,
  color = "var(--gold-deep)",
  height = 5,
  delay = 0,
  track = "var(--sand)",
}: {
  value: number;
  color?: string;
  height?: number;
  delay?: number;
  track?: string;
}) {
  return (
    <span className="track" style={{ height, background: track }}>
      <span
        style={{
          width: `${Math.max(0, Math.min(100, value))}%`,
          background: color,
          animation: `growX .9s ${delay}s var(--ease) both`,
        }}
      />
    </span>
  );
}

/* ---------------- Ring ---------------- */
const RING_R = 76;
const RING_C = 2 * Math.PI * RING_R;

/** The navy-card progress ring from the overview and results heroes. */
export function Ring({
  value,
  size = 180,
  label,
  sub,
}: {
  value: number | null;
  size?: number;
  label: string;
  sub?: ReactNode;
}) {
  const shown = useCountUp(value ?? 0);
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox="0 0 180 180" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="90" cy="90" r={RING_R} fill="none" stroke="rgba(244,239,230,.1)" strokeWidth="11" />
        <circle
          cx="90"
          cy="90"
          r={RING_R}
          fill="none"
          stroke="var(--gold)"
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray={RING_C}
          strokeDashoffset={RING_C * (1 - shown / 100)}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 4,
          color: "var(--on-navy)",
        }}
      >
        {value === null ? (
          <span style={{ font: `400 ${size * 0.2}px/1 var(--font)`, color: "var(--on-navy-2)" }}>—</span>
        ) : (
          <span className="tnum" style={{ font: `400 ${size * 0.28}px/1 var(--font)` }}>
            {shown}
            <span style={{ fontSize: size * 0.13, color: "var(--gold)" }}>%</span>
          </span>
        )}
        <span style={{ font: "500 10.5px/14px var(--font)", letterSpacing: ".14em", color: "var(--on-navy-2)" }}>
          {label}
        </span>
        {sub}
      </div>
    </div>
  );
}

/* ---------------- Count-up ---------------- */
export function useCountUp(target: number, duration = 1300): number {
  const [value, setValue] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const start = from.current;
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const next = Math.round(start + (target - start) * eased);
      setValue(next);
      from.current = next;
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

/* ---------------- Modal ---------------- */
export function Modal({
  open,
  onClose,
  width = 540,
  title,
  sub,
  children,
}: {
  open: boolean;
  onClose: () => void;
  width?: number;
  title?: string;
  sub?: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" style={{ maxWidth: width }} onClick={(e) => e.stopPropagation()}>
        {title && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <h2 style={{ font: "400 28px/1.1 var(--font)" }}>{title}</h2>
              {sub && <p style={{ font: "400 13.5px/19px var(--font)", color: "var(--ink-4)" }}>{sub}</p>}
            </div>
            <button className="icon-btn icon-btn-sm" onClick={onClose} title="Close">
              <Icon name="close" size={22} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

/* ---------------- Toast ---------------- */
type Tone = "info" | "success" | "error";
interface Toast {
  id: number;
  msg: string;
  tone: Tone;
}

const ToastCtx = createContext<(msg: string, tone?: Tone) => void>(() => {});

export function useToast() {
  return useContext(ToastCtx);
}

const TOAST_ICON: Record<Tone, [string, string]> = {
  info: ["info", "var(--gold)"],
  success: ["check_circle", "var(--gold)"],
  error: ["error", "#f0a9b2"],
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef(0);

  const push = useCallback((msg: string, tone: Tone = "info") => {
    window.clearTimeout(timer.current);
    setToast({ id: Date.now(), msg, tone });
    // Errors carry instructions; give them longer.
    timer.current = window.setTimeout(() => setToast(null), tone === "error" ? 5200 : 2800);
  }, []);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      {toast && (
        <div key={toast.id} className="toast" role="status">
          <Icon name={TOAST_ICON[toast.tone][0]} size={19} color={TOAST_ICON[toast.tone][1]} />
          {toast.msg}
        </div>
      )}
    </ToastCtx.Provider>
  );
}

/* ---------------- Empty state ---------------- */
export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: string;
  title: string;
  body: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      className="card rise"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 14,
        padding: "48px 32px",
        textAlign: "center",
      }}
    >
      <span
        style={{
          width: 56,
          height: 56,
          borderRadius: 18,
          background: "var(--navy)",
          color: "var(--gold)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          animation: "float 4s ease-in-out infinite",
        }}
      >
        <Icon name={icon} size={28} />
      </span>
      <h2 style={{ font: "400 26px/1.15 var(--font)" }}>{title}</h2>
      <p style={{ font: "400 14.5px/22px var(--font)", color: "var(--ink-4)", maxWidth: 440 }}>{body}</p>
      {action && <div style={{ marginTop: 6 }}>{action}</div>}
    </div>
  );
}

/* ---------------- Form bits ---------------- */
export function Labeled({
  label,
  hint,
  children,
  style,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <label style={{ display: "block", ...style }}>
      <span className="label">
        {label}
        {hint && <span className="hint">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

export function Switch({
  on,
  onChange,
  title,
  detail,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
  title: string;
  detail?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      role="switch"
      aria-checked={on}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "14px 16px",
        borderRadius: 12,
        border: "1px solid var(--line-2)",
        textAlign: "left",
        width: "100%",
      }}
    >
      <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ font: "600 14px/19px var(--font)" }}>{title}</span>
        {detail && <span style={{ font: "400 12.5px/17px var(--font)", color: "var(--ink-5)" }}>{detail}</span>}
      </span>
      <span className={on ? "switch on" : "switch"} />
    </button>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? "on" : undefined}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------------- Card header ---------------- */
export function CardHead({ title, aside }: { title: string; aside?: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
      <h2 className="h-card">{title}</h2>
      {aside}
    </div>
  );
}

/* ---------------- Dates ---------------- */
export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Local YYYY-MM-DD; toISOString would shift the day near midnight. */
export function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function parseDay(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

/** Whole days from today to an ISO date; negative once it has passed. */
export function daysUntil(iso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((parseDay(iso).getTime() - today.getTime()) / 86_400_000);
}

export const longDate = (d: Date) => `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
export const shortDate = (ms: number) => {
  const d = new Date(ms);
  return `${MONTHS[d.getMonth()]!.slice(0, 3)} ${d.getDate()}`;
};
