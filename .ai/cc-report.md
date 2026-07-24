## Summary

Stage 3B.4, PR #154 — Part 1 of a 2-part repair pass on the existing
branch/PR (`feature/e2e-wdio-latency-optimization` → `roadmap/e2e-wdio`).
Start HEAD: `1fcb6afdaf33b992db4b9a781de3563f1c31f604`. This part fixes six
correctness gaps in the canonical Linux E2E runner and its supporting
helpers, adds unit tests for each, runs full static validation, and builds
the wdio-plugin binary. No E2E spec runs and no benchmark re-validation are
included — those are scoped to Part 2.

Fixes delivered:

1. **Hard port contract** (`scripts/run-wdio-e2e.mjs`) — the runner
   previously only warned when ports 4444/4445 were occupied and could
   exit 0 with `ports_free=false`; an `ss` spawn failure or non-zero exit
   was silently treated as "ports free". New pure functions
   `parseListeningPorts`, `inspectPortProbeResult`, and
   `deriveFinalRunnerExitCode` make the pre-run and post-run probes hard
   gates: an occupied port, or an unverifiable probe, now aborts the run
   (pre-run) or forces a non-zero final exit code (post-run), without ever
   auto-killing a pre-existing process and without clobbering a genuine
   non-zero child exit code.
2. **Deterministic child environment** (`scripts/run-wdio-e2e.mjs`) —
   `buildChildEnv()` now deletes any inherited `RIS_WDIO_EXPECT_PLUGIN`,
   `RIS_WDIO_DRIVER_PROVIDER`, `TAURI_BINARY_PATH` before setting this run's
   own values, so a value left over in the invoking shell can no longer
   leak into the child. `--binary` now requires an explicit
   `--expect-plugin present|absent`; the default binary silently accepting
   `--expect-plugin absent` is now rejected.
3. **Plugin-presence probe infrastructure-failure classification**
   (`apps/desktop/e2e-wdio/support/plugin-presence.ts`) — the `"present"`
   case used `browser.waitUntil`, which treats a thrown predicate error
   identically to a timeout, so a session crash or `execute()` rejection
   during the 5 s poll was silently recorded as plain plugin absence.
   Replaced with manual polling: an infrastructure failure now propagates
   immediately with the original error preserved as `cause`, and only a
   probe that legitimately completes and returns `false` for the full
   window is recorded as absent. The `"absent"` case gets the same
   treatment for its single probe.
4. **Form-submit diagnostics** (`apps/desktop/e2e-wdio/support/spec-interactions.ts`)
   — `waitForFormCloseOrError` hardcoded `"Form submit failed"` for every
   caller, degrading the placement modal's previous
   `"Placement failed — modal error:"` message. Added `errorLabel` /
   `timeoutLabel` options (defaulting to the previous generic wording) and
   restored `"Placement failed"` / `"Placement modal"` at the two
   `place-btn` call sites in `destructive-guards-hierarchy.e2e.ts` and
   `destructive-guards-inventory.e2e.ts`.
5. **`expectActiveRepositoryPath` infra-failure diagnostic**
   (`apps/desktop/e2e-wdio/support/repository-ui.ts`) — a thrown
   `browser.execute()` inside the poll predicate was indistinguishable
   from a genuine path mismatch, both producing
   `"Active repository path never matched"`. The two `execute()` calls are
   now wrapped so an infrastructure failure reports
   `"Active repository path check failed"` with the original error
   preserved as `cause`, without disturbing the existing timeout/mismatch
   message or the pre-existing `canonicalPath()`-throws-mid-poll tolerance.
6. **Comment/doc accuracy** — updated header comments in
   `scripts/run-wdio-e2e.mjs`, `apps/desktop/e2e-wdio/wdio.conf.ts`, and
   `apps/desktop/e2e-wdio/support/plugin-presence.ts` to describe the
   actual behaviour above (port contract, deterministic env,
   `--binary`/`--expect-plugin` coupling, frontend presence-contract
   framing, infra-failure-is-not-absence).

## Files changed

| File | Change |
|------|--------|
| `scripts/run-wdio-e2e.mjs` | Hard port contract (`parseListeningPorts`, `inspectPortProbeResult`, `deriveFinalRunnerExitCode`); deterministic `buildChildEnv`; `--binary`/`--expect-plugin` validation; updated header comment |
| `scripts/run-wdio-e2e.test.mjs` | +45 tests: port-contract parsing/probe/exit-code, deterministic env, binary/expect-plugin validation |
| `apps/desktop/e2e-wdio/support/plugin-presence.ts` | Manual polling for `"present"`; infra-failure vs. absence distinction; reworded module header |
| `apps/desktop/e2e-wdio/support/plugin-presence.test.ts` | Rewritten with fake timers; 13 tests covering the 8 required scenarios |
| `apps/desktop/e2e-wdio/support/repository-ui.ts` | `RepositoryPathProbeError` marker class; infra-failure vs. timeout/mismatch distinction in `expectActiveRepositoryPath` |
| `apps/desktop/e2e-wdio/support/repository-ui.test.ts` | +3 tests for infra-failure diagnostics |
| `apps/desktop/e2e-wdio/support/spec-interactions.ts` | `errorLabel`/`timeoutLabel` options on `waitForFormCloseOrError` |
| `apps/desktop/e2e-wdio/support/spec-interactions.test.ts` | +4 tests for default/custom labels |
| `apps/desktop/e2e-wdio/specs/destructive-guards-hierarchy.e2e.ts` | `place-btn` call restores `"Placement failed"` / `"Placement modal"` |
| `apps/desktop/e2e-wdio/specs/destructive-guards-inventory.e2e.ts` | Same as above |
| `apps/desktop/e2e-wdio/wdio.conf.ts` | Header comment: port contract, deterministic env, binary/expect-plugin coupling |

## Tests

```
node --test scripts/run-wdio-e2e.test.mjs scripts/run-wdio-performance-benchmark.test.mjs scripts/build-wdio-plugin-binary.test.mjs
# 231/231 PASSED

pnpm -C apps/desktop typecheck   (tsc --noEmit)
# PASSED — 0 errors

pnpm -C apps/desktop test   (vitest run)
# 917/917 PASSED (up from 906 pre-Part-1; +11 new tests)

node scripts/check-repo-hygiene.mjs
# 8/8 PASSED

node scripts/check-version-consistency.mjs
# PASSED — 0.1.0-beta.2 everywhere

cargo fmt --all --check
# PASSED

cargo check --workspace
# PASSED

cargo clippy --workspace -- -D warnings
# PASSED

cargo check -p rack-inventory-studio-desktop --features wdio-embedded
# PASSED

cargo clippy -p rack-inventory-studio-desktop --features wdio-embedded -- -D warnings
# PASSED

cargo check -p rack-inventory-studio-desktop --features wdio-plugin
# PASSED

cargo clippy -p rack-inventory-studio-desktop --features wdio-plugin -- -D warnings
# PASSED

pnpm build:e2e:wdio-plugin
# PASSED — target-wdio-plugin/release/rack-inventory-studio-desktop
# 16,418,400 bytes, 2026-07-24T18:18:40Z, built from HEAD 74c860ea8b5658de1f97b7ac3364db51dad0f9d8
# regular target/release/ confirmed untouched (older timestamp, different size)
```

No E2E spec runs and no benchmark re-validation were performed in this part
— both are explicitly scoped to Part 2 (see Not done).

## Risks

- This part's environment had a stale/incomplete `node_modules` (missing
  `@wdio/tauri-plugin`, blocking `tsc`) unrelated to the code changes here;
  resolved with a full `pnpm install` before typecheck. No source or
  lockfile changes resulted from this — confirmed via `git status`
  immediately after.
- The `RepositoryPathProbeError` marker class relies on
  `browser.waitUntil()` rejecting immediately (not retrying) when its
  predicate throws — verified against the pre-existing
  `canonicalPath()`-throws-mid-poll tolerance in the same function, which
  depends on the identical behaviour, and against WebdriverIO's documented
  `waitUntil` semantics.
- The `plugin-presence.ts` "present" case switched from `browser.waitUntil`
  to a manual `Date.now()`-based polling loop; behaviourally equivalent
  (5 s timeout, 100 ms interval) but not byte-for-byte the same polling
  primitive as the rest of the codebase's `waitUntil`-based helpers.
- None of this part's changes were exercised against a real WDIO session —
  only unit tests with mocked `browser`. Part 2 begins with environment
  verification and targeted E2E validation of the six affected specs.

## Not done

- Targeted E2E validation of the six affected specs
  (`destructive-guards-hierarchy`, `destructive-guards-inventory`, and the
  four other specs touched by the underlying shared helpers) — scoped to
  Part 2.
- Full 11-spec WDIO suite — not required for this part; deferred to Part 2
  at the earliest per the operator brief.
- Final ×2 benchmark validation — scoped to Part 2.
- PR #154 body update to final form — deferred until Linux E2E validation
  (Part 2) is complete.
- Final review-context generation against `roadmap/e2e-wdio` — deferred to
  after Part 2.
- Stage 3C — explicitly out of scope for this repair pass.

## Suggested next step

Begin Part 2: verify the Linux E2E environment (xvfb-run, WebKitWebDriver),
run the smoke/integration runner, then validate the six affected specs
(isolated runs ×2 each where practical) plus the final ×2 benchmark
comparison, and only then update the PR #154 body and generate the review
context against `roadmap/e2e-wdio`.
