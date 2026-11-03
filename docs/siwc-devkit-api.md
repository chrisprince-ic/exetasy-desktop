# Sign in with ChatGPT DevKit — API surface notes

Reference notes taken during Phase 0. Source of truth is the vendored copy; this
file exists so the integration work does not have to re-read the SDK each time.

**Upstream:** https://github.com/openai/sign-in-with-chatgpt-devkit
**Pinned commit:** `0a36fefeb913055c8c7a1a29b63d82b96b2e841a`
**License:** Sign-in with ChatGPT DevKit Noncommercial License v1.0
**Requires:** Node >= 22

## Packages

| Package | Role |
|---|---|
| `@siwc/local` | OAuth, credential storage, model discovery, streaming Responses |
| `@siwc/react` | Sign-in button, connection status, plan usage components |

Both are `"private": true` and unpublished — they must be vendored and built
from source (`npm run build -w @siwc/local`).

`@siwc/local` depends on `jose`, `proper-lockfile`, and `openai` ^7.21.0
(Apache-2.0), so the Responses transport is the official SDK rather than a
hand-rolled client.

## Entry point

```ts
import { createChatGPT, ChatGPTError, CHATGPT_USAGE_URL } from "@siwc/local";
// CHATGPT_USAGE_URL === "https://chatgpt.com/settings/usage"
```

### `ChatGPTConfig`

| Field | Notes |
|---|---|
| `appName` | human-readable, 1–120 chars, same on every installation |
| `appId` | stable filesystem id, must match `^[a-z0-9][a-z0-9._-]{0,99}$` |
| `redirectPort` | IPv4 loopback callback port; `0` picks a free port |
| `storageDir?` | absolute path; defaults to `~/.config/<appId>` |
| `credentialEncryption` | **required** — credentials are never persisted without it |
| `openBrowser?` | override how the consent URL is opened |
| `sendHostId?` | defaults to **false**; only enable where the provider supports `ext_agent_host_id` |

### `CredentialEncryption` (we implement this)

```ts
interface CredentialEncryption {
  id: string;                                        // stable format identifier
  isAvailable(): boolean | Promise<boolean>;
  encrypt(plaintext: string): Uint8Array | Promise<Uint8Array>;
  decrypt(ciphertext: Uint8Array): string | Promise<string>;
}
```

There is no plaintext fallback. Our adapter wraps Electron `safeStorage`
(DPAPI on Windows, Keychain on macOS) and must live in the main process only.

### `ChatGPTClient`

```ts
signIn(options?: SignInOptions): Promise<SessionState>
cancelSignIn(): void
getSession(): Promise<SessionState>
listProfiles(): Promise<LoginProfile[]>
selectProfile(id: string): Promise<SessionState>
subscribe(listener: (s: SessionState) => void): () => void
disconnect(): Promise<void>
listModels(options?: { signal?: AbortSignal }): Promise<ChatGPTModel[]>
streamResponse(options: StreamResponseOptions): Promise<{ text: string }>
```

### Inference

```ts
interface ResponseInputMessage {
  role: "user" | "assistant" | "developer";   // NOTE: no "system"
  content: string;
}

interface StreamResponseOptions {
  model: string;
  input: string | ResponseInputMessage[];
  instructions?: string;
  signal?: AbortSignal;
  onDelta?: (delta: string) => void;
}
```

Two consequences for our provider adapter:

- `streamResponse` **accumulates and returns `{ text }`**, so we do not parse SSE
  ourselves. `onDelta` is available if we want progressive UI.
- The option type exposes no `max_output_tokens`, `temperature` or `top_p`, and
  the role union excludes `"system"`. The documented Responses restrictions are
  therefore enforced by the type system — our adapter simply drops the Gemini
  path's `maxOutputTokens` and maps `systemInstruction` to `instructions`.

## Plan-usage signal

`SessionState.sharing` is `true` only when the profile is connected, has
credentials, and the granted scopes include `chatgpt.tokens.use.direct`.
This is the check for "can this student actually spend their plan" — a signed-in
free-tier user will be `status: "connected"` but `sharing: false`.

## Error codes seen in the SDK

`invalid_config`, `connection_busy`, `sign_in_required`, `sharing_not_enabled`,
`refresh_not_ready`, `cancelled`, `profile_not_found`,
`registration_upgrade_required`, `connection_changed`, `invalid_grant`,
`sign_in_failed`, `revocation_failed`, `invalid_id_token`,
`invalid_token_response`, `account_mismatch`, `invalid_request`.

`sharing_not_enabled` and `refresh_not_ready` are the two we must surface
gracefully in the UI. `ChatGPTError` carries a retryable flag.
