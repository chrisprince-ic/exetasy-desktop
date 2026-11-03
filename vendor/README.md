# Vendored third-party code

With the single exception of this `README.md`, everything in this directory is
**third-party code owned by OpenAI**, not by the Exee AI / Exetasy project. It is
reproduced here under the terms of its own license and is **not** covered by the
project's root `LICENSE`.

## Sign in with ChatGPT DevKit

| | |
|---|---|
| Upstream | https://github.com/openai/sign-in-with-chatgpt-devkit |
| Pinned commit | `0a36fefeb913055c8c7a1a29b63d82b96b2e841a` |
| Copyright | Copyright 2026 OpenAI |
| License | Sign-in with ChatGPT DevKit Noncommercial License v1.0 |
| License text | [`LICENSE`](LICENSE) |
| Third-party notices | [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) |

### What was copied

The upstream repository root maps onto `vendor/`:

| Path here | Path upstream |
|---|---|
| `siwc/local/` | `packages/local/` |
| `siwc/react/` | `packages/react/` |
| `assets/` | `assets/` |
| `docs/dependency-inventory.json` | `docs/dependency-inventory.json` |
| `scripts/` | `scripts/` |
| `tsconfig.base.json` | `tsconfig.base.json` |
| `LICENSE` | `LICENSE` |
| `THIRD_PARTY_NOTICES.md` | `THIRD_PARTY_NOTICES.md` |

The packages reference these by relative path — `../../tsconfig.base.json`,
`../../scripts/copy-package-notices.mjs`, `../../../assets/`. Preserving that
layout is exactly what lets the packages stay byte-for-byte unmodified. Moving
`LICENSE` or `assets/` elsewhere breaks both builds.

`scripts/copy-package-notices.mjs` copies `LICENSE` and `THIRD_PARTY_NOTICES.md`
into each package's `dist/` at build time, so the built output carries its own
license. Do not defeat this — it is how Section 4(a) is satisfied for anything
we ship.

### Modifications

**None.** Every file is a verbatim copy of the pinned upstream commit.

Section 4(b) of the license requires prominent change notices on any file we
change. Keeping this list empty is deliberate: it keeps re-syncing with upstream
a clean copy rather than a merge, and avoids us owning modifications that would
have to be relicensed under Section 4(d).

**If you ever modify a file here:** add a prominent change notice at the top of
that file, record it in this section, and understand that your modification is
then licensed under the DevKit Noncommercial License, not the project license.

### Branding assets

`assets/` contains OpenAI word marks, icons, sign-in buttons and bundled fonts.
Section 5 of the license grants **no** rights to these: "This License grants no
rights to OpenAI names, trademarks, logos, or branded visual assets."

Their use is governed separately by the
[OpenAI brand guidelines](https://openai.com/brand/) and the
[Sign in with ChatGPT UI/UX guidelines](https://developers.openai.com/siwc/ui-ux-guidelines),
which require the sign-in action to be labelled "Continue with ChatGPT" using
the approved button styles. Bundled fonts carry their own license files.

### Build and verify

```sh
npm run build -w @siwc/local
npm run build -w @siwc/react
node --test vendor/siwc/local/test/*.test.mjs   # 56 pass, 1 skipped
```

This directory is excluded from the project's own `vitest` run and `tsconfig`,
so our test and typecheck gates never compile or execute third-party code.

### Why this makes the whole project noncommercial

Section 2 grants rights "solely for Noncommercial Purposes," and Section 1
defines that to exclude development "by or for a business, employer, or
client... whether or not a fee is currently charged."

Exee AI therefore carries no paid tier, no subscription, and no commercial
offering. See the root `README.md` and `NOTICE`.

Note also Section 5: this license "grants no access to ChatGPT, the OpenAI API,
or any other OpenAI service." Access to ChatGPT plan usage comes from the
[Sign in with ChatGPT Terms](https://openai.com/policies/sign-in-with-chatgpt-terms/)
and OAuth registration, which are separate obligations we must also meet.

### Re-syncing with upstream

```sh
git clone https://github.com/openai/sign-in-with-chatgpt-devkit.git /tmp/devkit
# Copy each upstream path in the table above over its path here,
# then update the pinned commit recorded in this file and in NOTICE.
```
