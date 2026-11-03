/**
 * The single @siwc/local client for this process.
 *
 * Only safe, task-specific operations are exposed over IPC (see ipc.ts). The
 * client itself, and every access token it holds, stay in the main process.
 */
import { join } from "node:path";
import { app, shell } from "electron";
import { createChatGPT, type ChatGPTClient } from "@siwc/local";
import { safeStorageEncryption } from "./credential-encryption.js";

let client: ChatGPTClient | undefined;

export function getChatGPT(): ChatGPTClient {
  if (!client) {
    client = createChatGPT({
      appName: "Exee AI",
      appId: "exee-ai",
      // Loopback OAuth callback. Must be 127.0.0.1, never localhost.
      redirectPort: 1455,
      storageDir: join(app.getPath("userData"), "chatgpt"),
      credentialEncryption: safeStorageEncryption,
      openBrowser: (url) => shell.openExternal(url),
    });
  }
  return client;
}
