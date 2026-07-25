## Summary

Technical cleanup pass on `chore/e2e-remove-embedded-provider` →
`roadmap/e2e-wdio` (base `7e8b53e`, PR #157 merged — Stage 3C). Not Stage
3D, not started.

Full removal of the embedded WDIO driver provider, per an explicit user
decision ("porzucamy ten provider") made mid-Stage-3C after the provider
benchmark found it ~12x slower than external on `app-smoke` (~28x on
`core-inventory`) with no stability advantage, and Stage 3C's own
representative embedded regression check for `placement-inspector-workflows`
was still in its first part after 8 minutes when interrupted.

**Audit first, then removal.** Ran the full `git grep` sweep the task
specified across `package.json`, `pnpm-lock.yaml`, `Cargo.toml`,
`Cargo.lock`, `apps/desktop/`, `crates/`, `scripts/`, `docs/`, `.github/`,
`.ai/`, `.gitignore` before touching anything, and classified every hit —
active code, dev tooling, tests, operational docs, historical docs, AI
reports, or an unrelated English usage of the word "embedded"
(`apps/desktop/src-tauri/src/commands/repository.rs`,
`apps/desktop/src-tauri/src/diagnostics.rs`, `crates/ris-git/src/lib.rs`,
`docs/UX_AUDIT_PREP_EN.md`, `.ai/local-diagnostics-logging.md` — all
untouched, none are false removals).

**Two findings that shaped scope:**
1. Port 4445 is **not** embedded-exclusive. `docs/E2E_WDIO_WINDOWS_PERFORMANCE.md`'s
   own architecture diagram and raw per-run data show tauri-driver's own
   `msedgedriver.exe` child legitimately lands on 4445 on Windows (WebKitWebDriver
   plays the analogous role on Linux) — every external run in that historical
   matrix shows `4444→tauri-driver.exe, 4445→msedgedriver.exe`. The 4444/4445
   port-cleanup contract in `run-wdio-e2e.mjs` and
   `run-wdio-performance-benchmark.mjs` was therefore **kept unchanged**
   (only the internal constant naming was updated to stop calling it "the
   embedded port"), per the task's own explicit warning not to assume every
   port/dependency touching "wdio" is embedded-only.
2. The `brace-expansion`/`minimatch` `pnpm.overrides` are **not**
   embedded-related either — `pnpm why minimatch -r` traces them to
   `@wdio/cli`'s own dev-tooling chain (`jake`/`ejs`/`create-wdio`, `glob`,
   `mocha`) and to `@wdio/config`/`webdriver`/`webdriverio`/
   `@wdio/tauri-service` themselves, all required by the **external**
   provider. Both overrides were kept, unchanged.

**What was actually removed:** Cargo feature `wdio-embedded` and its
`tauri-plugin-wdio-webdriver` dependency (Cargo.toml, Cargo.lock), the
feature-gated plugin init in `lib.rs`, the embedded capability-file
generation in `build.rs`, `scripts/run-wdio-e2e-embedded.mjs` +
`scripts/build-wdio-embedded-binary.mjs` (+ tests),
`build:e2e:wdio-embedded`/`test:e2e:wdio:embedded` npm scripts, the
`RIS_WDIO_DRIVER_PROVIDER`/`RIS_WDIO_EMBEDDED_PORT` env-var plumbing and
embedded branch in `wdio.conf.ts`, `scripts/run-provider-benchmark.mjs` (+
test) and its `--provider`/`--compare` support in
`run-wdio-performance-benchmark.mjs`, `docs/E2E_WDIO_PROVIDER_BENCHMARK.md`
(folded into `docs/E2E_WDIO_PLAN.md`, then deleted), the `target-embedded/`
`.gitignore` entry, and a stray 1.4 GB `target-embedded/` build-artifact
directory found on disk (untracked, deleted).

**What was deliberately kept**, with the reason documented in this pass:
the `wdio-plugin` Cargo feature and `tauri-plugin-wdio` dependency (needed
by the external canonical runner's own execute-API/window-focus-tracking),
the 4444/4445 port contract, and the `brace-expansion`/`minimatch`
overrides (see findings above).

Final HEAD: see `git log -1`. PR to be opened against `roadmap/e2e-wdio`,
not merged.

## Files changed

| File | Change |
|------|--------|
| `apps/desktop/src-tauri/Cargo.toml` | Removed `wdio-embedded` feature + `tauri-plugin-wdio-webdriver` optional dep |
| `apps/desktop/src-tauri/build.rs` | Removed `capabilities/embedded-test.json` generation |
| `apps/desktop/src-tauri/src/lib.rs` | Removed feature-gated `tauri_plugin_wdio_webdriver::init()` |
| `Cargo.lock` | `tauri-plugin-wdio-webdriver` and its transitive deps dropped |
| `scripts/run-wdio-e2e-embedded.mjs`, `.test.mjs` | Deleted |
| `scripts/build-wdio-embedded-binary.mjs`, `.test.mjs` | Deleted |
| `scripts/run-provider-benchmark.mjs`, `.test.mjs` | Deleted |
| `scripts/run-wdio-performance-benchmark.mjs` | Simplified to external-only: removed `--provider`/`--compare`, compare-mode sequencing/report, and helpers used only by them |
| `scripts/run-wdio-performance-benchmark.test.mjs` | Tests for removed functionality deleted; remaining tests updated for the new signatures |
| `scripts/run-wdio-e2e.mjs` | No longer passes `--provider`/sets `RIS_WDIO_DRIVER_PROVIDER` to the child |
| `scripts/run-wdio-e2e.test.mjs` | Tests for removed env-var/arg plumbing deleted |
| `package.json` | Removed `build:e2e:wdio-embedded`/`test:e2e:wdio:embedded` scripts |
| `apps/desktop/e2e-wdio/wdio.conf.ts` | Removed embedded provider resolution/config branch; `driverProvider` hardcoded `"external"`; header docs rewritten |
| `apps/desktop/e2e-wdio/support/command-timing.ts` | `PROVIDER` hardcoded `"external"` instead of env-var-derived |
| `apps/desktop/e2e-wdio/support/spec-interactions.ts` | Comment updated: embedded-driver quirk now described as historical context |
| `apps/desktop/e2e-wdio/specs/searchable-select-regression.e2e.ts` | Comment updated similarly |
| `.gitignore` | Removed `target-embedded/` and `capabilities/embedded-test.json` entries |
| `docs/E2E_WDIO_PLAN.md` | New "Embedded WDIO provider removal" section; two prior technical-pass sections marked historical; stale "Future stages" follow-up bullet removed |
| `docs/E2E_WDIO_PROVIDER_BENCHMARK.md` | Deleted (content folded into `E2E_WDIO_PLAN.md`) |
| `.ai/cc-report.md` | This report |

## Tests

```
pnpm install --frozen-lockfile          PASS
pnpm audit                               PASS, 0 vulnerabilities
pnpm -C apps/desktop typecheck           PASS
pnpm -C apps/desktop test                923/923 PASS
node --test scripts/*.test.mjs           223/223 PASS
node scripts/check-repo-hygiene.mjs      PASS
node scripts/check-version-consistency.mjs   PASS
cargo fmt --all --check                  PASS
cargo check --workspace                  PASS
cargo clippy --workspace -- -D warnings  PASS
cargo tree -i tauri-plugin-wdio-webdriver   no match (confirmed removed)
git diff --check                         PASS

pnpm build:e2e:wdio-plugin                                                PASS
pnpm test:e2e:wdio -- --spec app-smoke --skip-build                       CLEAN_PASS, 5s
pnpm test:e2e:wdio -- --spec placement-inspector-workflows --skip-build   CLEAN_PASS, 26s
pnpm test:e2e:wdio -- --spec destructive-guards --skip-build              CLEAN_PASS, 34s
```

Every external run: ports 4444/4445 free before and after; no lingering
`tauri-driver`/`WebKitWebDriver`/`Xvfb`/application-binary processes
(verified via `ps aux` after each run). No embedded test was run — none
exists to run.

223 `node --test` cases is lower than the pre-removal count (353) purely
because three whole test files were deleted along with the code they
tested, and two others lost tests for now-removed functions — not a
coverage regression on anything that still exists.

Final verification greps (all per the task's explicit checklist):
- Active embedded references: none (only intentional historical prose in
  docs/comments naming what was removed and why, plus unrelated English
  "embedded" usages left untouched).
- `4445`: present only in the unchanged external-provider port contract
  and historical docs/data tables.
- `run-provider-benchmark`: none (file deleted).
- `tauri-plugin-wdio-webdriver`: present only in historical/removal prose.
- Old consolidated spec names (`destructive-guards-hierarchy`/`-inventory`,
  `entity-deletes-hierarchy`/`-inventory`): present only in historical
  provenance comments, no active reference.

## Risks

- The port-contract renaming (`EMBEDDED_PORT_DEFAULT` →
  `EXTERNAL_NATIVE_DRIVER_PORT`) is an internal identifier change only —
  the actual monitored ports (4444, 4445) and cleanup behavior are
  unchanged, verified by the `destructive-guards`/`placement-inspector-workflows`/`app-smoke`
  runs all reporting `ports_free=true`.
- `scripts/run-wdio-performance-benchmark.mjs` lost its `--provider`/
  `--compare` CLI surface entirely rather than being deprecated gradually —
  acceptable since nothing else in the repo (scripts, CI, docs describing
  *active* usage) called it with those flags after the embedded scripts
  were removed in the same pass.
- Two historical docs (`docs/E2E_WDIO_WINDOWS_PERFORMANCE.md`,
  `docs/E2E_WDIO_LATENCY_OPTIMIZATION.md`) still describe embedded-provider
  commands and results in detail, left untouched as genuinely historical,
  dated experiment records — judged not misleading since they are clearly
  framed as past experiments, not current instructions, and are
  cross-referenced from `E2E_WDIO_PLAN.md`'s new removal section for
  context.

## Not done

- Stage 3D — not started.
- No unrelated dependency upgrades — `brace-expansion`/`minimatch`
  overrides kept as-is (confirmed still needed, not embedded-related);
  nothing else touched.
- No production application code changes — this pass is entirely test
  infrastructure/tooling/docs.

## Suggested next step

Human review of this PR. Once merged, `roadmap/e2e-wdio` carries no
embedded-provider code, tooling, or active documentation — Stage 3D can
begin whenever the team is ready, unrelated to this cleanup.
