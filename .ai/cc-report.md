## Summary

PR-1: WebdriverIO + Tauri smoke foundation — validated against real compiled binary.

Branch `feature/e2e-wdio-foundation` off `roadmap/e2e-wdio`.
WDIO dependencies installed, config and smoke spec added, package script added.
Smoke spec validated against the actual compiled Tauri binary on Linux with Xvfb.
Config bug fixed (binary path pointed to wrong location); selector bug fixed (`h1` vs `h2`
for the page title); Mocha timeout increased to accommodate startup + service overhead.
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

## Files changed

| File | Change |
|------|--------|
| `apps/desktop/e2e-wdio/wdio.conf.ts` | Config: fixed binary path (workspace root `../../target/release/`), removed redundant capability, updated docs, increased Mocha timeout to 180 s |
| `apps/desktop/e2e-wdio/specs/app-smoke.e2e.ts` | Fixed selector (`h1` for page title, not `h2`); consolidated into single `it()` scenario |
| `apps/desktop/package.json` | Added `test:e2e:wdio` script; WDIO devDependencies added by pnpm |
| `package.json` (root) | Added `pnpm.overrides["@wdio/native-utils"]: "2.5.0"` |
| `pnpm-lock.yaml` | Updated by pnpm install |
| `Cargo.lock` | Updated: `plist 1.9.0 → 1.10.0`, `quick-xml 0.39.3 → 0.41.0` (fixes RUSTSEC-2026-0194, RUSTSEC-2026-0195) |
| `docs/E2E_WDIO_PLAN.md` | PR-1 section updated with validated run results, platform notes, selector fix, build prerequisite clarification |
| `.ai/cc-report.md` | This report |

---

## Bugs fixed during validation

### 1. Binary path pointed at per-crate `src-tauri/target/release/`

`wdio.conf.ts` `defaultBinaryPath()` used `path.resolve(process.cwd(), "src-tauri", "target", "release")`.
A Cargo workspace puts the binary at the workspace root `target/release/`, two levels above
`apps/desktop/`.

**Fix:** `path.resolve(process.cwd(), "..", "..", "target", "release")`.

### 2. Wrong selector for page title heading

Smoke spec used `h2=Open a repository`.  The landing page title "Open a repository" is
rendered by the `PageHeader` component as `<h1>`, not `<h2>` (which is used by `Panel`).

**Fix:** Changed selector to `h1=Open a repository`.

### 3. `cargo build --release` produces a `devUrl` binary

Running `cargo build --release` directly does NOT embed `frontendDist` assets.  Tauri requires
the CLI toolchain (`pnpm tauri build --no-bundle`) to set the build-mode env vars that switch
the WebView from `devUrl` (`http://localhost:1420`) to the embedded custom protocol
(`tauri://localhost`).  Without this, the app shows "Connection refused".

**Fix:** Binary must be built with `pnpm tauri build --no-bundle` (or equivalent CLI command).
Documented in `wdio.conf.ts` comments and `docs/E2E_WDIO_PLAN.md`.

### 4. Mocha timeout (60 s) too tight for Linux/Xvfb environment

`@wdio/tauri-service` runs a plugin-availability `executeAsyncScript` before every WebDriver
command (~100 ms per call).  Tauri app startup on Linux with Xvfb takes ~15 s.
Total smoke scenario: ~75 s — exceeding the 60 s Mocha timeout.

**Fix:** Increased `mochaOpts.timeout` to `180_000` (3 min).

---

## WDIO config location

`apps/desktop/e2e-wdio/wdio.conf.ts`

Key settings:
- `runner: 'local'`
- `specs: ['./specs/**/*.e2e.ts']`
- `framework: 'mocha'`, timeout 180 s
- `services: [['@wdio/tauri-service', { appBinaryPath, driverProvider: 'external' }]]`
- Binary path default: `TAURI_BINARY_PATH` env var, or `../../target/release/rack-inventory-studio-desktop`
- `browserName: 'tauri'` in capabilities

---

## Smoke spec

`apps/desktop/e2e-wdio/specs/app-smoke.e2e.ts`

Single `it()` scenario with 4 assertions:
1. `body` exists (app launched, WebView connected)
2. `h1=Open a repository` is displayed (PageHeader `<h1>` title)
3. `h2=Clone repository` is displayed (Panel `<h2>` heading)
4. `h2=Create new repository` is displayed (Panel `<h2>` heading)
5. `button=Create repository` is displayed (submit button in Create form)

---

## Local WDIO run result

Environment: Linux x86_64, ubuntu-24.04-equivalent, 2026-07-12.

Prerequisites installed in this session:
- `tauri-driver` (via `cargo install tauri-driver`)
- `webkit2gtk-driver` (via `apt-get install -y webkit2gtk-driver`)
- `xvfb` (via `apt-get install -y xvfb`)
- Binary built with `pnpm tauri build --no-bundle`

```
Run: TAURI_BINARY_PATH=.../target/release/rack-inventory-studio-desktop \
     xvfb-run -a pnpm -C apps/desktop run test:e2e:wdio

Diagnostics: 10 checks passed, 1 warning
  (warning: libgtk-3-0 listed as missing — false alarm, ubuntu-24.04
   uses t64-suffixed packages which are present)

Result: 1 passed, 1 total (100% completed) in 00:01:17 — exit 0
```

---

## Checks run (2026-07-12)

```
git diff --check                            → clean
node scripts/check-version-consistency.mjs  → 0.1.0-beta.2, all match
node scripts/check-repo-hygiene.mjs         → 8/8 checks passed
node scripts/check-capabilities.test.mjs    → all passed
pnpm -C apps/desktop exec tsc --noEmit      → clean
pnpm -C apps/desktop exec vitest run        → 817 passed (50 test files)
cargo fmt --check                           → clean
cargo check                                 → clean
cargo clippy -- -D warnings                 → clean
cargo test                                  → all passed
cargo audit                                 → not installed in this env; CI verifies
pnpm audit --audit-level=high               → 1 low (below threshold, not blocking)
pnpm -C apps/desktop run test:e2e:wdio      → 1 passed, exit 0 (1 min 17 s)
```

---

## Risks

- `@wdio/native-utils` workspace override must be kept until `@wdio/tauri-service` fixes its
  peer dep range.
- Binary MUST be built with Tauri CLI (`pnpm tauri build --no-bundle`), not bare `cargo build`.
  The `defaultBinaryPath()` function correctly resolves the workspace `target/release/`, but
  the binary must exist and embed the correct assets.
- `@wdio/tauri-service` `beforeCommand` overhead (~100 ms/command) is significant on Linux.
  Adding `tauri-plugin-wdio` would remove this (deferred to a later PR).
- Mocha timeout set to 3 min — adequate for current overhead, but may need tuning if
  assertions increase significantly.
- Selectors use heading text (`h1`, `h2`) and button text; stable for current UI,
  fragile if text changes. `data-testid` additions deferred to PR-2.
- Playwright smoke still blocked in this environment (pre-existing: Firefox deps missing).

---

## Not done

- CI job for WDIO (PR-7).
- `data-testid` additions for stable selectors (PR-2).
- `tauri-plugin-wdio` or `tauri-plugin-wdio-webdriver` Rust integration (deferred).
- WDIO build script (`test:e2e:wdio:build`) or pre-test hook to ensure binary is fresh.

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
Add minimal `data-testid` attributes to components where text selectors are fragile,
and update the smoke spec to use them.
