import { existsSync } from "node:fs";
import { join } from "node:path";
import { app, BrowserWindow, shell } from "electron";
import { track } from "./analytics.js";
import { registerIpc } from "./ipc.js";
import { initStore } from "./store.js";

let mainWindow: BrowserWindow | undefined;

// The app was called Exetasy before it became Exee AI, and Electron names the
// data folder after the product. If an earlier install left its data under the
// old name and nothing exists under the new one, keep using the old folder so
// courses, exams and the ChatGPT sign-in carry over.
{
  const legacy = join(app.getPath("appData"), "Exetasy");
  if (existsSync(legacy) && !existsSync(app.getPath("userData"))) app.setPath("userData", legacy);
}

/** Only these origins are ever needed. Everything else is blocked. */
const ALLOWED_ORIGINS = new Set(["https://auth.openai.com", "https://api.openai.com"]);

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 900,
    minHeight: 640,
    show: false,
    backgroundColor: "#F5F3EE",
    autoHideMenuBar: true,
    // macOS: let the paper sidebar run under the traffic lights.
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    title: "Exee AI",
    // Dev runs from source where build/ is two levels up; the packaged app
    // gets its icon from the executable resources instead, so a miss here is
    // harmless.
    icon: join(import.meta.dirname, "../../build/icon.png"),
    webPreferences: {
      preload: join(import.meta.dirname, "../preload/index.mjs"),
      // The renderer is untrusted with credentials: no Node, full isolation.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // preload needs require() for the contextBridge module
      webviewTag: false,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());

  // OAuth consent must open in the system browser, never inside the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  // Block in-app navigation away from our own UI.
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const isDev = Boolean(process.env.ELECTRON_RENDERER_URL);
    if (isDev && url.startsWith(process.env.ELECTRON_RENDERER_URL!)) return;
    event.preventDefault();
    if (ALLOWED_ORIGINS.has(new URL(url).origin)) void shell.openExternal(url);
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(join(import.meta.dirname, "../renderer/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = undefined;
  });
}

app.whenReady().then(async () => {
  await initStore();
  registerIpc(() => mainWindow);
  createWindow();
  track("app_started");

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
