/**
 * CredentialEncryption adapter backed by Electron's safeStorage.
 *
 * @siwc/local refuses to persist credentials without one of these and has no
 * plaintext fallback. safeStorage protects its key with DPAPI on Windows and
 * the Keychain on macOS.
 *
 * Main process only. Handing this provider — or anything it decrypts — to a
 * renderer would defeat the entire storage boundary.
 *
 * Uses the async safeStorage API: the synchronous variants are deprecated in
 * Electron 45 and slated for removal. @siwc/local's CredentialEncryption
 * interface already allows promises for every method, so this needs no
 * modification to the vendored DevKit.
 */
import { safeStorage } from "electron";
import type { CredentialEncryption } from "@siwc/local";

/**
 * `id` is a stable format identifier written into the credential file.
 * Changing it after credentials exist makes them unreadable. Treat as permanent.
 *
 * Note the async API is wire-compatible with the sync one, so credentials
 * written by an earlier build still decrypt — the id stays as it was.
 */
export const safeStorageEncryption: CredentialEncryption = {
  id: "electron-safe-storage-v1",

  isAvailable() {
    return safeStorage.isAsyncEncryptionAvailable();
  },

  encrypt(plaintext: string) {
    return safeStorage.encryptStringAsync(plaintext);
  },

  async decrypt(ciphertext: Uint8Array) {
    // `shouldReEncrypt` signals an OS key rotation. The DevKit owns the
    // credential file and rewrites it on every token refresh, so the value
    // gets re-encrypted under the new key within the hour without us
    // orchestrating anything.
    const { result } = await safeStorage.decryptStringAsync(Buffer.from(ciphertext));
    return result;
  },
};
