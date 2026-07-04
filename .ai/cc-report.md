## Summary

PR-1: WebdriverIO + Tauri smoke foundation added.

Branch `feature/e2e-wdio-foundation` off `roadmap/e2e-wdio`.
WDIO dependencies installed, config and smoke spec added, package script added.
No app behavior changes. No Rust changes. No version bump.

---

## PR title / branch / base

- Title: `test(e2e): add WebdriverIO Tauri smoke foundation`
- Branch: `feature/e2e-wdio-foundation`
- Base: `roadmap/e2e-wdio` (Stage 0 base @ `68b7756`)

---

## Dependencies added

In `apps/desktop/` (devDependencies):

| Package | Version |
|---------|---------|
| `webdriverio` | 9.29.1 |
| `@wdio/cli` | 9.29.1 |
| `@wdio/local-runner` | 9.29.1 |
| `@wdio/mocha-framework` | 9.29.1 |
| `@wdio/tauri-service` | 1.2.0 |

**pnpm workspace override** added to root `package.json`:
```json
"pnpm": {
  "overrides": {
    "@wdio/native-utils": "2.5.0"
  }
}
```

**Why the override?**
`@wdio/tauri-service@1.2.0` was published with its `@wdio/native-utils` peer dep pinned to
`2.4.0`, but the package code imports `installMockSyncOverride` which only exists in `2.5.0`.
Without the override, WDIO fails at launcher init with a `SyntaxError: The requested module
'@wdio/native-utils' does not provide an export named 'installMockSyncOverride'`.
This is a bug in the published upstream package. The override is minimal and must stay until
`@wdio/tauri-service` ships a corrected peer dep range.

---

## Files added / changed

| File | Change |
|------|--------|
| `apps/desktop/e2e-wdio/wdio.conf.ts` | New: WDIO config with `@wdio/tauri-service`, `external` driver, cross-platform binary path |
| `apps/desktop/e2e-wdio/specs/app-smoke.e2e.ts` | New: 5-assertion smoke spec (body, 3 h2 headings, Create repository button) |
| `apps/desktop/package.json` | Added `test:e2e:wdio` script; WDIO devDependencies added by pnpm |
| `package.json` (root) | Added `pnpm.overrides["@wdio/native-utils"]: "2.5.0"` |
| `pnpm-lock.yaml` | Updated by pnpm install |
| `Cargo.lock` | Updated: `plist 1.9.0 → 1.10.0`, `quick-xml 0.39.3 → 0.41.0` (fixes RUSTSEC-2026-0194, RUSTSEC-2026-0195) |
| `docs/E2E_WDIO_PLAN.md` | PR-1 section marked implemented; deps, config path, driver choice, local run result documented |
| `.ai/cc-report.md` | This report |

---

## WDIO config location

`apps/desktop/e2e-wdio/wdio.conf.ts`

Key settings:
- `runner: 'local'`
- `specs: ['./specs/**/*.e2e.ts']`
- `framework: 'mocha'`, timeout 60 s
- `services: [['@wdio/tauri-service', { appBinaryPath, driverProvider: 'external' }]]`
- Binary path: `TAURI_BINARY_PATH` env var, or auto-derived from `process.cwd()/src-tauri/target/release/`
- `browserName: 'tauri'` in capabilities

---

## Smoke spec

`apps/desktop/e2e-wdio/specs/app-smoke.e2e.ts`

5 assertions:
1. `body` exists (app launched, WebView connected)
2. `h2=Open a repository` is displayed
3. `h2=Clone repository` is displayed
4. `h2=Create new repository` is displayed
5. `button=Create repository` is displayed

Selectors use stable heading text (`h2` from `Panel` component) and button text.
No `data-testid` additions required for these top-level elements.

---

## Package script added

`apps/desktop/package.json`:
```json
"test:e2e:wdio": "wdio run e2e-wdio/wdio.conf.ts"
```

Existing `test:e2e` (Playwright) unchanged.

---

## tauri-plugin-wdio decision

**Deferred.** Normal WebDriver element interactions are sufficient for the PR-1 smoke spec.
`tauri-plugin-wdio` (advanced IPC: mocking, log capture) is not needed for visibility assertions.
`tauri-plugin-wdio-webdriver` (embedded driver provider) is also deferred — the `external`
driver provider (`tauri-driver`) is used instead, avoiding any Rust app code changes.

---

## Local WDIO run result

Environment: Ubuntu Linux (CI/dev), 2026-07-04.

```
BLOCKED — 3 environment prerequisites missing:
  1. tauri-driver not installed  →  cargo install tauri-driver
  2. WebKitWebDriver not installed  →  apt-get install -y webkit2gtk-driver
  3. Tauri release binary not built  →  pnpm tauri build
Config and spec are syntactically correct; run in a prepared environment.
```

The service itself initialized correctly after the `@wdio/native-utils` override.
Assertions and selectors are based on confirmed UI structure from Playwright smoke tests.

---

## Checks run

```
git diff --check                            → clean
node scripts/check-version-consistency.mjs  → 0.1.0-beta.2, all match
node --test scripts/*.test.mjs              → 19 passed, 0 failed
node scripts/check-repo-hygiene.mjs         → 8/8 checks passed
pnpm -C apps/desktop exec tsc --noEmit      → clean (no TypeScript errors)
pnpm -C apps/desktop exec vitest run        → 817 passed (50 test files)
pnpm -C apps/desktop exec playwright test   → BLOCKED (pre-existing: Firefox
                                              system deps missing in this env;
                                              unrelated to our changes)
pnpm -C apps/desktop run test:e2e:wdio      → BLOCKED (environment prerequisites;
                                              see above)
cargo fmt --check                           → clean
cargo check                                 → clean
cargo clippy --workspace -- -D warnings     → clean (matches CI flags)
cargo test                                  → 663 passed, 0 failed (all crates)
cargo audit (local)                         → not installed; CI verifies
```

---

## Rust audit repair (commit 3 — after original foundation + audit fix)

**Advisories fixed:**
- RUSTSEC-2026-0194 (HIGH): `quick-xml` 0.39.3 — quadratic runtime on duplicate attributes
- RUSTSEC-2026-0195 (HIGH): `quick-xml` 0.39.3 — unbounded namespace allocation DoS

**Root cause:** `quick-xml` 0.39.3 was a transitive dependency via `plist 1.9.0` → used by
`tauri`, `tauri-codegen`, `tauri-plugin`, `tauri-utils`. Both advisories published 2026-06-29,
after the base branch was created.

**Fix:** `cargo update plist` → `plist 1.9.0 → 1.10.0`, which pulled `quick-xml 0.39.3 → 0.41.0`.
No Cargo.toml change required; only `Cargo.lock` updated. No audit ignore entries added.

**Pre-existing vs introduced:** Pre-existing on base branch (`roadmap/e2e-wdio`); advisories
published after the branch was created. Not related to WDIO or any code in this PR.

---

## Risks

- `@wdio/native-utils` workspace override must be kept until `@wdio/tauri-service` fixes its
  peer dep range. If WDIO ecosystem releases break the override, update the version.
- `external` driver provider requires `cargo install tauri-driver` + `webkit2gtk-driver` on
  Linux. Switch to `embedded` provider (with `tauri-plugin-wdio-webdriver`) to remove these.
- Selectors use Panel `h2` heading text; if UI text changes, selectors need updating.
- Xvfb not available in this environment; service handles it gracefully (warns, continues).
- Remaining `cargo audit` warnings (19 total) are all pre-existing: GTK3 unmaintained,
  `proc-macro-error`, `unic-*`, `anyhow` unsound, `glib` unsound, `serde_yml` — CI
  treats these as `allowed` warnings and they do not fail the audit job.

---

## Not done

- CI job for WDIO (PR-7).
- `data-testid` additions for stable selectors (PR-2).
- `tauri-plugin-wdio` or `tauri-plugin-wdio-webdriver` Rust integration (deferred).
- Actual end-to-end confirmation that smoke passes on a prepared machine.
- WDIO build script (`test:e2e:wdio:build`): run `pnpm tauri build` first if needed.

---

## Confirmations

- No app behavior changes ✓
- No Rust code changed ✓
- No version bump ✓
- No tags created ✓
- No GitHub Release ✓
- No CI job added yet ✓
- Existing Playwright `test:e2e` script unchanged ✓
- No `.ai/review-context-*.md` committed ✓

---

## Suggested next step

PR-2: `feature/e2e-wdio-selectors` → `roadmap/e2e-wdio`
Add minimal `data-testid` attributes to components where text selectors are fragile.
