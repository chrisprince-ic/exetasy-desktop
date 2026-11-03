/**
 * CredentialEncryption adapter backed by Electron's safeStorage.
 *
 * @siwc/local refuses to persist credentials without one of these, and has no
 * plaintext fallback. safeStorage protects its key with DPAPI on Windows and
 * the Keychain on macOS.
 *
 * This must only ever be constructed in the main process. Handing the provider
 * (or anything it decrypts) to a renderer defeats the entire storage boundary.
 */

// electron is CommonJS. Named ESM imports are not statically resolvable and the
// ESM wrapper exposes no usable default, so resolve it through createRequire.
import { createRequire } from "node:module";

const { safeStorage } = createRequire(import.meta.url)("electron");

/**
 * `id` is a stable format identifier written into the credential file. Changing
 * it after credentials exist makes them unreadable, so treat it as permanent.
 */
export const safeStorageEncryption = {
  id: "electron-safe-storage-v1",

  // Async variants: the sync ones are deprecated in Electron 45.
  isAvailable() {
    return safeStorage.isAsyncEncryptionAvailable();
  },

  encrypt(plaintext) {
    return safeStorage.encryptStringAsync(plaintext);
  },

  async decrypt(ciphertext) {
    const { result } = await safeStorage.decryptStringAsync(Buffer.from(ciphertext));
    return result;
  },
};
