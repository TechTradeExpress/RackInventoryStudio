# CC Report — PR O: WebView CSP Hardening

## Summary

PR O adds a production Content-Security-Policy to the Tauri desktop WebView.
Before this PR the CSP was `null` (no policy). The new policy restricts script,
style, image, connect, and object sources to `'self'` or explicitly required
endpoints, and adds `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`,
and `form-action 'none'`.

## CSP before and after

| State | CSP |
|---|---|
| Before | `null` (no CSP applied) |
| After | See policy below |

## Final CSP policy

```
default-src 'self'; connect-src ipc: http://ipc.localhost; script-src 'self'; style-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'
```

## Directive-by-directive explanation

| Directive | Value | Reason |
|---|---|---|
| `default-src` | `'self'` | Fallback — all content from the app origin (tauri://localhost / http://tauri.localhost) |
| `connect-src` | `ipc: http://ipc.localhost` | Tauri IPC protocol. `ipc:` covers macOS/Linux (`ipc://localhost/...`); `http://ipc.localhost` covers Windows. Both are required for cross-platform builds. Explicitly specified because Tauri does NOT auto-inject these into connect-src. |
| `script-src` | `'self'` | Only same-origin scripts allowed. Tauri auto-adds `'nonce-RANDOM'` values at serve time for its injected initialization scripts via the `replace_csp_nonce` mechanism. |
| `style-src` | `'self'` | Production CSS is a separate file loaded via `<link rel="stylesheet">` from the same origin. No inline `<style>` blocks. React inline styles are DOM property mutations (not blocked by CSP). |
| `img-src` | `'self'` | No external images. Inline SVG icons are JSX, not separate image files. No `data:` images detected. |
| `object-src` | `'none'` | Disables all plugin/embed content (Flash, etc.). Overrides default-src fallback. |
| `base-uri` | `'none'` | Prevents injection of `<base href>` to redirect relative URLs. Not covered by default-src. |
| `frame-ancestors` | `'none'` | Prevents the app from being embedded in iframes (anti-clickjacking). Not covered by default-src in CSP Level 3. |
| `form-action` | `'none'` | Prevents native HTML form submissions. All user interactions in the app are handled via JavaScript. |

## Current state inventory (Part 1)

**Tauri version**: 2.11.0 (config schema v2)

**Previous CSP**: `"csp": null` — no policy applied

**App analysis**:
- ✅ No `eval()`, `new Function`, `innerHTML`, `dangerouslySetInnerHTML`, inline event handlers
- ✅ No remote CDN URLs, no external scripts/styles/images/fonts
- ✅ No `data:` or `blob:` URLs in source
- ✅ No `<canvas>` elements; icons are inline SVGs via React JSX
- ✅ No HTTP `fetch()` calls — all backend communication via Tauri `invoke()` (IPC)
- ✅ System fonts only (Segoe UI, Cascadia Mono) — no `@font-face` with remote URLs
- ✅ No `<img>` tags — icons are SVGs
- ⚠️ Heavy use of React `style={{...}}` inline style props — NOT blocked by CSP (DOM property mutations)
- ⚠️ `listen()` / Tauri events — use `ipc://localhost` covered by `connect-src ipc:`
- Production build: external JS bundle + external CSS file, no inline scripts or styles

**Tauri v2 CSP mechanism**:
- CSP in `tauri.conf.json` → `app.security.csp` applies ONLY to production (custom protocol)
- In dev mode (`devUrl: http://localhost:1420`), Vite serves the page and Tauri's CSP is not applied
- Tauri injects IPC initialization scripts with random nonces at serve time (`replace_csp_nonce`)
- Those nonces are automatically added to `script-src` in the response CSP header

**Why `'unsafe-inline'` is not required**:
1. `style-src`: Production CSS is an external file, not inline `<style>` blocks. React's
   `style={{...}}` props use `element.style.prop = value` — DOM mutations not covered by CSP.
2. `script-src`: Production HTML has only external `<script type="module" src="...">` tags.
   Tauri's injected initialization scripts use nonces (auto-managed by Tauri).

## Files changed

| File | Change |
|---|---|
| `apps/desktop/src-tauri/tauri.conf.json` | `"csp": null` → explicit production policy string |
| `docs/BETA1_FOLLOWUP_PLAN_EN.md` | PR O row; CSP item removed from "can wait" list; Section 19 added |
| `.ai/cc-report.md` | This file |

## Unsafe pattern scan results

| Pattern | Occurrences | Notes |
|---|---|---|
| `eval(` | 0 | Clean |
| `new Function` | 0 | Clean |
| `innerHTML` | 0 | Clean |
| `dangerouslySetInnerHTML` | 0 | Clean |
| Inline event handlers (`onclick=`, `onload=`) | 0 | Clean |
| Remote CDN URLs in source | 0 | `http://`/`https://` in source is only in `redact.ts` (string matching, not fetch) |
| `data:` / `blob:` URLs | 0 | Clean |
| `<canvas>` | 0 | Clean |
| `fetch(` / `XMLHttpRequest` | 0 | Clean — all backend calls use `invoke()` |

## Dev vs production behavior

| Context | CSP applied? | How served |
|---|---|---|
| Dev (`pnpm dev`) | ❌ No | Vite dev server at `http://localhost:1420`; Tauri's protocol handler not involved |
| Production build | ✅ Yes | Tauri custom protocol (`tauri://localhost` / `http://tauri.localhost`); CSP injected in response headers |

## Dependency audit results

- `cargo audit` — not installed locally; CI `Rust dependency audit` will verify (no Cargo changes)
- `pnpm audit --audit-level moderate` — no frontend dependency changes; clean (same as PR M)

## Tests

```
git diff --check
```
Clean.

```
node scripts/check-version-consistency.mjs
```
Pass — 0.1.0-beta.1 consistent.

```
node --test scripts/*.test.mjs
```
17/17 pass.

```
node scripts/check-repo-hygiene.mjs
```
All 8 checks pass.

```
cargo fmt --all --check
```
Clean (no Rust changes).

```
cargo check --workspace
```
Pass.

```
cargo test --workspace
```
All pass, 0 failures.

```
cargo clippy --workspace -- -D warnings
```
Clean.

```
npx pnpm@10.33.4 -C apps/desktop exec tsc --noEmit
```
No type errors.

```
npx pnpm@10.33.4 --filter @rack-inventory-studio/desktop exec vitest run
```
42 test files, 539 tests — all pass.

```
npx pnpm@10.33.4 --filter @rack-inventory-studio/desktop exec vite build
```
Production build succeeds. Output: `dist/index.html` with external-only JS and CSS references.
Built `dist/index.html` contains NO inline scripts and NO inline styles.

Note: `npx vitest run` (without pnpm) fails in this environment with
`SyntaxError: ... 'styleText'` because the global Node.js version is 18.19.1, which
predates `node:util.styleText` (added in Node 20.12). The project's local vitest (3.2.4)
is run correctly via `pnpm exec`.

Note: Full Tauri production build (`cargo tauri build`) cannot be run locally because
it requires Windows SDK/NSIS for the NSIS installer target. CI `Rust workspace` passes,
which confirms the Tauri app compiles. The CSP is a JSON string field — no compile-time
validation needed beyond the JSON schema check at build time.

## Risks

- **IPC on platforms not yet tested**: `ipc:` covers macOS/Linux; `http://ipc.localhost` covers
  Windows. The official Tauri v2 documentation example (`connect-src ipc: http://ipc.localhost`)
  is the canonical cross-platform recommendation. If a future platform requires a different URI,
  `connect-src` will need updating.
- **Tauri nonce injection**: Tauri automatically adds nonces to `script-src` for its initialization
  scripts. If a future Tauri version changes this mechanism, `script-src 'self'` alone may
  block those scripts. The nonce mechanism has been stable across Tauri v2 releases.
- **React inline styles**: React's `style={{...}}` props work via DOM property mutations, which
  are NOT CSP-controlled. This is a deliberate CSP spec design and not a loophole — inline
  style attributes set by JavaScript after page load are not covered by `style-src`.

## Not done

- TEST-01 smoke test (gate before beta release checklist, not a PR)
- GitHub Actions SHA pinning
- Askpass constant-time comparison
- End-to-end verification of CSP enforcement in a live Tauri build (requires Windows build env)

## Remaining items before beta release

1. **TEST-01** — manual smoke test (before release checklist, not a PR).
2. Post-beta.2: GitHub Actions SHA pinning, askpass CT comparison.

## Suggested next step

Generate review context and attach to ChatGPT for sign-off before merging PR O.
