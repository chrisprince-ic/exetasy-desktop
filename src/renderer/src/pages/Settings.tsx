import { ContinueWithChatGPTButton } from "@siwc/react";
import { Avatar, Icon, Labeled, useToast } from "../ui";
import { isFailure, type ChatGPTModel, type SessionState, type Stats } from "../types";

export function Settings({
  session,
  models,
  model,
  onModelChange,
  stats,
  signingIn,
  onSignIn,
  onDisconnect,
  onOpenUsage,
}: {
  session: SessionState | null;
  models: ChatGPTModel[];
  model: string;
  onModelChange: (slug: string) => void;
  stats: Stats | null;
  signingIn: boolean;
  onSignIn: () => void;
  onDisconnect: () => void;
  onOpenUsage: () => void;
}) {
  const toast = useToast();
  const connected = session?.status === "connected";
  const sharing = Boolean(session?.sharing);
  const who = session?.identity?.email ?? session?.profileLabel ?? "Connected";

  return (
    <div className="page" style={{ maxWidth: 820 }}>
      <section className="card rise" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <h2 className="h-card">ChatGPT account</h2>
        {connected ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <Avatar name={session?.identity?.name || who} size={48} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="ellipsis" style={{ font: "600 15.5px/21px var(--font)" }}>{who}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: sharing ? "var(--teal)" : "var(--wine)" }} />
                  <span style={{ font: "400 13px/18px var(--font)", color: "var(--ink-4)" }}>{sharing ? "Plan usage enabled" : "Plan usage not granted"}</span>
                </div>
              </div>
              <button
                className="btn btn-sm btn-outline"
                onClick={() => {
                  onDisconnect();
                  toast("Disconnected. Your local data was kept.");
                }}
              >
                Disconnect
              </button>
            </div>
            {!sharing && (
              <div style={{ padding: 16, borderRadius: 14, background: "var(--wine-tint)", color: "var(--wine)", font: "400 13.5px/20px var(--font)" }}>
                You&rsquo;re signed in, but this account hasn&rsquo;t granted Exetasy permission to use your ChatGPT plan. That permission only exists on Go, Plus and Pro subscriptions.
              </div>
            )}
            <button className="btn btn-sm btn-soft" style={{ alignSelf: "flex-start" }} onClick={onOpenUsage}>
              <Icon name="data_usage" size={18} />
              Manage usage in ChatGPT
            </button>
          </>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "flex-start" }}>
            <p style={{ font: "400 14.5px/22px var(--font)", color: "var(--ink-4)" }}>
              Connect your ChatGPT account to generate exams. Exetasy charges you nothing — generation runs on your own plan allowance.
            </p>
            <ContinueWithChatGPTButton onClick={onSignIn} loading={signingIn} appearance="black" />
          </div>
        )}
      </section>

      {connected && sharing && (
        <section className="card rise" style={{ display: "flex", flexDirection: "column", gap: 14, animationDelay: ".05s" }}>
          <div>
            <h2 className="h-card">Model</h2>
            <p style={{ font: "400 13.5px/19px var(--font)", color: "var(--ink-4)", marginTop: 4 }}>Only models your account can reach are listed.</p>
          </div>
          <Labeled label="Generation model">
            <select
              className="field"
              value={model}
              onChange={async (e) => {
                onModelChange(e.target.value);
                const r = await window.exee.updateSettings({ model: e.target.value });
                if (isFailure(r)) toast(r.message, "error");
              }}
            >
              {models.map((m) => (
                <option key={m.slug} value={m.slug}>{m.displayName}</option>
              ))}
            </select>
          </Labeled>
        </section>
      )}

      <section className="card rise" style={{ display: "flex", flexDirection: "column", gap: 16, animationDelay: ".1s" }}>
        <div>
          <h2 className="h-card">Your data</h2>
          <p style={{ font: "400 13.5px/19px var(--font)", color: "var(--ink-4)", marginTop: 4 }}>Everything below is stored on this computer only.</p>
        </div>
        <div className="grid-fit" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
          {[
            ["Courses", stats?.courses],
            ["Materials", stats?.materials],
            ["Exams", stats?.exams],
            ["Attempts", stats?.attempts],
          ].map(([label, value]) => (
            <div key={label as string} style={{ padding: "14px 16px", borderRadius: 14, background: "var(--hover)" }}>
              <div className="tnum" style={{ font: "400 28px/1.1 var(--font)" }}>{value ?? 0}</div>
              <div style={{ font: "500 12.5px/16px var(--font)", color: "var(--ink-4)", marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>
        <p style={{ font: "400 12.5px/19px var(--font)", color: "var(--ink-5)" }}>
          Course files are copied into the app&rsquo;s data folder. Sign-in tokens are encrypted by your operating system&rsquo;s credential store and never leave this device. Deleting a course deletes its files too.
        </p>
      </section>

      <section className="card rise" style={{ display: "flex", flexDirection: "column", gap: 10, animationDelay: ".15s" }}>
        <h2 className="h-card">About</h2>
        <p style={{ font: "400 14px/22px var(--font)", color: "var(--ink-3)" }}>
          Exetasy is a free, noncommercial, open-source study tool. There is no paid tier and nothing is sold. It integrates OpenAI&rsquo;s Sign in with ChatGPT DevKit, which is licensed for noncommercial use only.
        </p>
        <p style={{ font: "400 13px/20px var(--font)", color: "var(--ink-5)" }}>Questions and grades are AI-generated. Treat them as practice, not as a source of truth.</p>
      </section>
    </div>
  );
}
