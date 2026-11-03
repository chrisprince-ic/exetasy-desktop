/**
 * Phase 3 gate: prove Sign in with ChatGPT plan usage works on this machine.
 *
 * No UI and no app — just the flow:
 *   sign in -> verify the sharing scope -> list models -> one streamed response.
 *
 * Run:  npm run spike -w @exee/desktop
 *
 * Credentials are written, encrypted, under Electron's userData dir (outside
 * this repo). Pass --reset to start from a clean slate.
 *
 * Set EXEE_SPIKE_LOG=<path> to mirror output to a file. On Windows the main
 * process is a GUI subsystem binary and ELECTRON_NO_ATTACH_CONSOLE can swallow
 * stdout entirely, so the log file is often the only reliable transcript.
 */
import { createRequire } from "node:module";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createChatGPT, ChatGPTError, CHATGPT_USAGE_URL } from "@siwc/local";
import { safeStorageEncryption } from "./credential-encryption.mjs";

// electron is CJS; see credential-encryption.mjs for why createRequire is used.
const { app, safeStorage, shell } = createRequire(import.meta.url)("electron");

const RESET = process.argv.includes("--reset");
const LOG_FILE = process.env.EXEE_SPIKE_LOG;

if (LOG_FILE) {
  try {
    mkdirSync(dirname(LOG_FILE), { recursive: true });
    writeFileSync(LOG_FILE, "");
  } catch {
    /* logging is best-effort and must never fail the run */
  }
}

function log(...parts) {
  const line = parts.join(" ");
  console.log(line);
  if (LOG_FILE) {
    try {
      appendFileSync(LOG_FILE, line + "\n");
    } catch {
      /* ignore */
    }
  }
}

const step = (n, msg) => log(`\n[${n}] ${msg}`);
const ok = (msg) => log(`    OK   ${msg}`);
const bad = (msg) => log(`    FAIL ${msg}`);

async function main() {
  const storageDir = join(app.getPath("userData"), "siwc-spike");

  log("=".repeat(70));
  log("  Exee AI - Sign in with ChatGPT spike");
  log("=".repeat(70));
  log(`  electron ${process.versions.electron} / node ${process.versions.node}`);
  log(`  storage  ${storageDir}`);

  step(1, "Check OS credential encryption");
  if (!(await safeStorage.isAsyncEncryptionAvailable())) {
    bad("safeStorage reports encryption unavailable; cannot persist credentials.");
    return 1;
  }
  ok(`available via "${safeStorageEncryption.id}"`);

  step(2, "Create client");
  const chatgpt = createChatGPT({
    appName: "Exee AI",
    appId: "exee-ai",
    redirectPort: 1455, // loopback 127.0.0.1 callback
    storageDir,
    credentialEncryption: safeStorageEncryption,
    openBrowser: (url) => shell.openExternal(url),
  });
  ok("createChatGPT() returned a client");

  if (RESET) {
    step("2b", "Reset requested - disconnecting any saved account");
    try {
      await chatgpt.disconnect();
      ok("disconnected");
    } catch (error) {
      log(`    note: ${error?.message ?? error}`);
    }
  }

  step(3, "Read saved session");
  let session = await chatgpt.getSession();
  log(`    status=${session.status} sharing=${session.sharing}`);

  if (session.status !== "connected") {
    step(4, "Sign in (a browser window will open - approve it there)");
    log("    Waiting for consent...");
    session = await chatgpt.signIn();
    ok(`signed in: status=${session.status}`);
  } else {
    step(4, "Already connected - reusing stored credentials (no re-consent)");
    ok("credential persistence across runs confirmed");
  }

  if (session.identity) {
    log(`    account: ${session.identity.email ?? "(no email)"}`);
  }

  step(5, "Check ChatGPT plan usage (scope chatgpt.tokens.use.direct)");
  if (!session.sharing) {
    bad("plan usage NOT granted for this account.");
    log("    Sign-in worked, but inference cannot run.");
    log("    This is what a free ChatGPT account looks like - Go/Plus/Pro is required.");
    log(`    Check: ${CHATGPT_USAGE_URL}`);
    return 2;
  }
  ok("plan usage granted - this account can power generation");

  step(6, "List models available to this account");
  const models = await chatgpt.listModels();
  ok(`${models.length} model(s)`);
  for (const m of models) log(`      - ${m.slug}  (${m.displayName})`);
  if (models.length === 0) {
    bad("no models returned; cannot run inference");
    return 3;
  }

  const model = models[0].slug;

  step(7, `Streamed Responses call using "${model}"`);
  let deltas = 0;
  const started = Date.now();
  const { text } = await chatgpt.streamResponse({
    model,
    instructions: "You are helping verify an API integration. Answer in one short sentence.",
    input: "Reply with exactly: Exee AI spike OK",
    onDelta: () => {
      deltas++;
    },
  });
  ok(`completed in ${Date.now() - started}ms over ${deltas} delta events`);
  log(`    response: ${JSON.stringify(text.trim())}`);

  step(8, "JSON-shaped output via prompting (no structured-output param exists)");
  const { text: jsonText } = await chatgpt.streamResponse({
    model,
    instructions:
      'Return ONLY valid JSON matching {"questions":[{"id":number,"text":string}]}. ' +
      "No markdown fences, no preamble.",
    input: "Produce 2 trivial practice questions about arithmetic.",
  });
  try {
    const cleaned = jsonText.trim().replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    const parsed = JSON.parse(cleaned);
    ok(`parsed JSON with ${parsed.questions?.length ?? 0} question(s)`);
    log(`    ${JSON.stringify(parsed).slice(0, 160)}`);
  } catch {
    bad("model did not return parseable JSON on this attempt");
    log(`    raw: ${jsonText.slice(0, 200)}`);
    log("    (the EASE pipeline already retries + zod-validates, so this is survivable)");
  }

  log("\n" + "=".repeat(70));
  log("  GATE PASSED - plan usage works end to end on this machine");
  log("=".repeat(70));
  return 0;
}

app.whenReady().then(async () => {
  let code = 0;
  try {
    code = await main();
  } catch (error) {
    code = 1;
    log("\n" + "=".repeat(70));
    log("  GATE FAILED");
    log("=".repeat(70));
    if (error instanceof ChatGPTError) {
      log(`  ChatGPTError  code=${error.code}  retryable=${error.retryable ?? false}`);
      log(`  message: ${error.message}`);
    } else {
      log(`  ${error?.stack ?? error}`);
    }
  }
  app.exit(code);
});
