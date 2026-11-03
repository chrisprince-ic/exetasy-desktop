/**
 * Anonymous, opt-in usage counts, sent to Aptabase (https://aptabase.com).
 *
 * Written in-house instead of using @aptabase/electron: that SDK registers a
 * CSP-bypassing URL scheme so the renderer can send events directly. Here only
 * the main process sends, every event passes one consent check, and the
 * renderer's lockdown is unchanged.
 *
 * What is sent: an event name, a few counts or yes/no flags chosen at each call
 * site, and system details (OS, app version, locale). Never course names, file
 * names, questions, answers, scores, or anything from the ChatGPT account.
 * Aptabase does not store IP addresses; the session id is random and rotates.
 *
 * The app key is injected at build time from MAIN_VITE_APTABASE_KEY (a local
 * .env.local file, or a GitHub Actions secret for releases). A build without it
 * sends nothing at all.
 */
import { release } from "node:os";
import { app, net } from "electron";
import { getSettings } from "./store.js";

const KEY = (import.meta.env.MAIN_VITE_APTABASE_KEY ?? "").trim();
const HOSTS: Record<string, string> = {
  US: "https://us.aptabase.com",
  EU: "https://eu.aptabase.com",
};
const parts = KEY.split("-");
const ENDPOINT = parts.length === 3 && HOSTS[parts[1]!] ? `${HOSTS[parts[1]!]}/api/v0/event` : null;

/** True when this build can send usage counts at all (it has a valid key). */
export const analyticsAvailable = ENDPOINT !== null;

/** A session ends after an hour without events, as Aptabase's own SDKs do. */
const SESSION_IDLE_MS = 60 * 60 * 1000;
const newSessionId = () => `${Math.floor(Date.now() / 1000)}${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
let sessionId = newSessionId();
let lastEvent = Date.now();

type Props = Record<string, string | number | boolean>;

/**
 * Records one event if this build has a key and the student has opted in.
 * Never throws and never delays the caller: analytics must not break the app.
 */
export function track(eventName: string, props?: Props): void {
  if (!ENDPOINT) return;
  void (async () => {
    try {
      const settings = await getSettings();
      if (settings.analytics !== true) return;

      const now = Date.now();
      if (now - lastEvent > SESSION_IDLE_MS) sessionId = newSessionId();
      lastEvent = now;

      const body = JSON.stringify({
        timestamp: new Date(now).toISOString(),
        sessionId,
        eventName,
        systemProps: {
          isDebug: !app.isPackaged,
          locale: app.getLocale(),
          osName: process.platform === "darwin" ? "macOS" : process.platform === "win32" ? "Windows" : "Linux",
          osVersion: release(),
          engineName: "Chromium",
          engineVersion: process.versions.chrome,
          appVersion: app.getVersion(),
          sdkVersion: "exee-ai-analytics@1",
        },
        props: props ?? {},
      });

      const request = net.request({ method: "POST", url: ENDPOINT, credentials: "omit" });
      request.setHeader("Content-Type", "application/json");
      request.setHeader("App-Key", KEY);
      request.on("error", () => {});
      request.on("response", (res) => res.on("data", () => {}));
      request.end(body);
    } catch {
      // Offline, or the store is busy: drop the event.
    }
  })();
}
