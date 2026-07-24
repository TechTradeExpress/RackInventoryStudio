## Summary

Stage 3B.4, PR #154 — Part 2 of the 2-part repair pass on the existing
branch/PR (`feature/e2e-wdio-latency-optimization` → `roadmap/e2e-wdio`).
Part 1 start HEAD: `1fcb6afdaf33b992db4b9a781de3563f1c31f604`. Part 2 start
HEAD: `e2a97c9c8e04123dee8339df85e3773fdbbaef5a` (Part 1's final HEAD).

This part ran the Linux E2E validation that Part 1 could not (no
`xvfb-run`/`WebKitWebDriver` in that session's environment): the canonical
runner's occupied-port negative test, the integration smoke, all six specs
modified by the repair pass, `representative-latency ×2`, `core-inventory
×2`, and a production-binary (plugin-absent) check — all directly on
Linux/WebKitWebDriver.

Real E2E execution surfaced two further bugs that unit tests alone could
not have caught, both fixed and re-validated in place:

1. **Plugin-presence probe driver race**: firing the probe's first
   `browser.execute()` immediately after `@wdio/tauri-service`'s own
   before-hook plugin check (same event-loop tick) reliably hung the
   underlying WebDriver HTTP request for the full `connectionRetryTimeout`
   (90 s), surfacing as `UND_ERR_HEADERS_TIMEOUT`. Correctly classified as
   an infrastructure failure per Part 1's fix, but still blocked every run.
   Fixed with a 500 ms settle delay before the first probe.
2. **Run-root cleanup teardown race**: WDIO's `onComplete` hook (which runs
   `cleanupOwnedRunRoot`) fires *before* `@wdio/tauri-service` stops the
   driver/app process, so the app's own filesystem writes (GPU/shader
   cache, git/IPC activity) could still be landing in the run root when the
   recursive delete started, throwing `ENOTEMPTY` and turning an
   otherwise-passing run into `TEST_FAILED`. Fixed with `fs.rmSync`'s
   built-in `maxRetries`/`retryDelay` (widened from 5/200ms to 40/250ms
   after the first budget proved insufficient for `representative-latency`'s
   heavier filesystem activity).

All targeted validation is `CLEAN_PASS` at the final HEAD. Full 11-spec
suite remains intentionally deferred per the operator brief — not a merge
gate for this pass.

## Files changed

| File | Change |
|------|--------|
| `apps/desktop/e2e-wdio/support/plugin-presence.ts` | 500ms settle delay before the first probe (both present/absent branches) to avoid the driver race; extracted `delay()` helper |
| `apps/desktop/e2e-wdio/support/plugin-presence.test.ts` | Updated all fake-timer tests to advance past the new settle delay |
| `apps/desktop/e2e-wdio/support/test-environment.ts` | `cleanupOwnedRunRoot`: `rmSync` now uses `maxRetries: 40, retryDelay: 250` (was unretried) to tolerate the onComplete/driver-stop ordering race |
| `apps/desktop/e2e-wdio/wdio.conf.ts` | Header note: Linux validation status, pointer to §13 |
| `docs/E2E_WDIO_PLAN.md` | Stage 3B.4 section: new paragraph documenting the Linux repair pass (Part 1 + Part 2) |
| `docs/E2E_WDIO_LATENCY_OPTIMIZATION.md` | New §13: full Linux Part 1/Part 2 environment, occupied-port test, six-spec results, `representative-latency ×2`, `core-inventory ×2`, production-binary check, static validation |
| `docs/E2E_WDIO_WINDOWS_PERFORMANCE.md` | Header note: Linux is now primary; Windows data kept as historical driver-provider comparison |
| `.ai/cc-report.md` | This report |

## Tests

```
git diff --check                                          PASS

node --test scripts/run-wdio-e2e.test.mjs \
  scripts/run-wdio-performance-benchmark.test.mjs \
  scripts/build-wdio-plugin-binary.test.mjs                231/231 PASS

pnpm -C apps/desktop typecheck                             PASS — 0 errors
pnpm -C apps/desktop test                                  917/917 PASS
node scripts/check-repo-hygiene.mjs                        8/8 PASS
node scripts/check-version-consistency.mjs                 PASS
cargo fmt --all --check                                    PASS
cargo check/clippy --workspace                             PASS
cargo check/clippy -p rack-inventory-studio-desktop \
  --features wdio-embedded                                 PASS
cargo check/clippy -p rack-inventory-studio-desktop \
  --features wdio-plugin                                   PASS
```

**Real E2E validation (Linux, external provider, `pnpm test:e2e:wdio`):**

| Check | Result |
|-------|--------|
| Occupied-port negative test | exit 1, benchmark never started, diagnostic named port 4444 + raw `ss` line + PID |
| `app-smoke` integration smoke | CLEAN_PASS, 6.4s, 39 cmds, median 16ms, p95 191ms, ≥5s: 0, plugin present, ports free |
| `entity-deletes-hierarchy` | CLEAN_PASS, 19s, 980 cmds, ports free |
| `entity-deletes-inventory` | CLEAN_PASS, 21s, 1141 cmds, ports free |
| `entity-updates-work-mode` | CLEAN_PASS, 27s, 1860 cmds, ports free |
| `destructive-guards-hierarchy` | CLEAN_PASS, 33s, 2274 cmds, ports free |
| `destructive-guards-inventory` | CLEAN_PASS, 32s, 2296 cmds, ports free |
| `placement-lifecycle` | CLEAN_PASS, 21s, 1001 cmds, ports free |
| `representative-latency ×2` | CLEAN_PASS both, 11.3s/11.0s, variance 3.3%, all 9 cases pass, ≥5s: 0 |
| `core-inventory ×2` | CLEAN_PASS both, 11.5s/10.9s, variance 4.6%, ≥5s: 0 |
| Production binary (`--expect-plugin absent`) | CLEAN_PASS, `buildVariant=plain`, `wdioPluginAvailable=false`, ~81s (correctly reproduces pre-plugin retry-loop cost) |

Full details, per-run metrics, and step breakdowns: `docs/E2E_WDIO_LATENCY_OPTIMIZATION.md` §13.

## Risks

- This sandbox's pinned `pnpm@10.33.4` requires Node ≥22; only Node 18.19.1
  is available, so `pnpm@9.15.9` (via a `pnpm` shim on `PATH`) was used for
  every command in this session. Behaviourally equivalent for the commands
  run (`install`, `run <script>`, `-C <dir> <script>`); the `--` argument
  separator behaves differently between the two majors, so the no-`--` form
  (`pnpm test:e2e:wdio --spec <name>`) was used throughout instead of the
  documented `pnpm test:e2e:wdio -- --spec <name>` — this is a pnpm-version
  interaction specific to this sandbox, not a defect in the runner or its
  docs (the documented form is standard npm/pnpm syntax for the pinned
  v10.33.4).
- Both real bugs found and fixed this session (plugin-presence settle delay,
  cleanup retry budget) are environment-timing-sensitive fixes tuned against
  this specific sandbox's observed behaviour (a 500ms/40-retry budget that
  reliably worked here). They are conservative and one-time-per-run costs,
  not per-command, so they should generalize, but neither has been
  cross-validated against a different Linux machine or CI runner.
- `representative-latency` and `core-inventory` had no prior Linux
  plugin-backed baseline to regress against — this session establishes both
  baselines rather than confirming a regression gate. Documented explicitly
  in §13.6/§13.7 rather than silently treated as a "no regression" result.
- Full 11-spec suite not run as a single execution (by design — not a merge
  gate for this pass; see Not done).

## Not done

- Full 11-spec WDIO suite as a single run — intentionally deferred per the
  operator brief, not required for this pass.
- `repository-lifecycle.e2e.ts`, `safety-recovery.e2e.ts`, `csv-import.e2e.ts`
  not re-validated this pass (not modified by the repair pass).
- Stage 3C — explicitly out of scope.
- Cross-validation of the two new timing/retry fixes on a second machine or
  in CI (see Risks).

## Suggested next step

Update PR #154 body with the Linux validation results (superseding the
stale "no real E2E runs" / Windows-only claims), push the final commits,
observe CI (frontend/Rust/hygiene/version/workflow-lint/dependency-audit
checks — report each separately, especially any dependency-audit result),
then generate the final review context against `roadmap/e2e-wdio` for
strict review. Do not merge.
