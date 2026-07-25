## Summary

Resumed technical pass before Stage 3C, on `chore/e2e-dependency-audit-embedded-driver`
→ `roadmap/e2e-wdio` (checkpoint HEAD `4db16bc1fb5fe1dd700b66cfab5e839f769cff85`,
where the dependency audit had already been fixed). Stage 3C is out of scope.

1. Standardized the workspace on Node.js 24 LTS (24.18.0 "Krypton").
2. Re-validated the dependency audit on Node 24/pnpm 10.33.4; a new
   `brace-expansion` DoS advisory (GHSA-mh99-v99m-4gvg) surfaced mid-pass
   and was fixed with a pinned `pnpm.overrides` entry.
3. Investigated the embedded WDIO driver's `mousedown` gap against upstream
   `webdriverio/desktop-mobile` source directly: the root cause (bare
   `.click()` → JS `el.click()`, no `mousedown`) is still present on current
   `main`, but the W3C Actions API path (`element.click({})`) already
   dispatches real `mousedown`/`mouseup` and is already included in the
   pinned `tauri-plugin-wdio-webdriver` 1.2.0 — no upstream patch, pin, or
   `SearchableSelect.tsx` change needed (remediation category 1: correct
   existing API usage).
4. Added `selectSearchableOption()` (Actions-routed click) and used it at
   every SearchableSelect option-click site; added a dedicated
   `searchable-select-regression.e2e.ts` spec.
5. Formalized `pnpm test:e2e:wdio:embedded` as a canonical embedded runner,
   mirroring the existing external one, building into its own
   `target-embedded/` `CARGO_TARGET_DIR`.
6. Validated all 12 real E2E specs plus `representative-latency` ×2 and
   `core-inventory` ×2 under the embedded provider on the final HEAD — all
   `CLEAN_PASS`. **Embedded driver: USABLE.**
7. Regressed the external provider (still default) on the final HEAD,
   including a production-shaped binary confirming plugin absence.
8. Full static validation suite green; opened PR #155 to `roadmap/e2e-wdio`
   (not merged); all 7 CI jobs pass.

Final HEAD: `2139126b95941bdae228003e16939169ed7e723c`.

## Files changed

| File | Change |
|------|--------|
| `.nvmrc` | New: `24` |
| `package.json` | `engines.node: ">=24 <25"`; added `build:e2e:wdio-embedded`/`test:e2e:wdio:embedded` scripts; `pnpm.overrides` gained `brace-expansion: ">=5.0.8"` |
| `.github/workflows/ci.yml`, `dependency-audit.yml`, `windows-installer.yml` | `node-version: 22` → `24` |
| `docs/BETA1_SMOKE_TEST_EN.md`, `docs/IMPLEMENTATION_PLAN_EN.md` | Node version references updated |
| `scripts/check-version-consistency.mjs` (+ new `.test.mjs`) | Extended to cross-check Node/pnpm toolchain declarations |
| `apps/desktop/e2e-wdio/support/spec-interactions.ts` | Added `selectSearchableOption()` (Actions-routed click) |
| `apps/desktop/e2e-wdio/specs/{core-inventory,destructive-guards-hierarchy,destructive-guards-inventory,entity-updates-work-mode,placement-lifecycle}.e2e.ts`, `apps/desktop/e2e-wdio/benchmarks/representative-latency.e2e.ts` | Replaced bare SearchableSelect option `.click()` with `selectSearchableOption()` |
| `apps/desktop/e2e-wdio/specs/searchable-select-regression.e2e.ts` | New: dedicated SearchableSelect regression spec |
| `scripts/build-wdio-embedded-binary.mjs` (+ `.test.mjs`) | New: builds the `wdio-embedded` binary into `target-embedded/` |
| `scripts/run-wdio-e2e-embedded.mjs` (+ `.test.mjs`) | New: canonical embedded runner (`pnpm test:e2e:wdio:embedded`) |
| `pnpm-lock.yaml` | `brace-expansion` resolved to 5.0.8 |
| `docs/E2E_WDIO_PLAN.md` | New "Technical pass — Node 24, dependency audit, embedded driver restoration" section |
| `apps/desktop/e2e-wdio/wdio.conf.ts` | Docstring: embedded canonical command + updated validation status |
| `.ai/cc-report.md` | This report |

## Tests

```
node --version / pnpm --version                          v24.18.0 / 10.33.4
pnpm install --frozen-lockfile                            PASS (lockfile unchanged pre-fix; brace-expansion bump post-fix)
pnpm audit                                                 PASS, 0 vulnerabilities (final)
pnpm -C apps/desktop typecheck                             PASS
pnpm -C apps/desktop test                                  917/917 PASS
node --test scripts/*.test.mjs                             328/328 PASS
node scripts/check-repo-hygiene.mjs                        8/8 PASS
node scripts/check-version-consistency.mjs                 PASS (app version + toolchain)
git diff --check                                           PASS
cargo fmt --all --check                                    PASS
cargo check --workspace                                    PASS
cargo clippy --workspace -- -D warnings                     PASS
cargo check/clippy -p rack-inventory-studio-desktop --features wdio-embedded   PASS
cargo check/clippy -p rack-inventory-studio-desktop --features wdio-plugin     PASS

Embedded (pnpm test:e2e:wdio:embedded), Linux xvfb-run + WebKitWebDriver, final HEAD:
  app-smoke                        CLEAN_PASS  66s
  searchable-select-regression     CLEAN_PASS  177s
  core-inventory ×2                CLEAN_PASS  280s, 279s (<1% variance)
  representative-latency ×2        CLEAN_PASS  239s, 239s (0% variance)
  csv-import                       CLEAN_PASS  353s
  destructive-guards-hierarchy     CLEAN_PASS  44:21
  destructive-guards-inventory     CLEAN_PASS  44:32
  entity-deletes-hierarchy         CLEAN_PASS  19:22
  entity-deletes-inventory         CLEAN_PASS  23:29
  entity-updates-work-mode         CLEAN_PASS  32:15
  placement-lifecycle              CLEAN_PASS  20:08
  repository-lifecycle             CLEAN_PASS  2:38
  safety-recovery                  CLEAN_PASS  5:55
  (12/12 real specs + representative-latency, all ports free before/after)

External (pnpm test:e2e:wdio), final HEAD:
  app-smoke (fresh wdio-plugin build)    CLEAN_PASS  5s
  core-inventory (--skip-build)          CLEAN_PASS  10s
  app-smoke, production-shaped binary,
    --expect-plugin absent               CLEAN_PASS  76s, window.wdioTauri confirmed undefined

CI (GitHub Actions, PR #155): 7/7 jobs PASS
  Frontend checks, Frontend dependency audit, Rust dependency audit,
  Rust workspace, Script and hygiene checks, Version consistency, Workflow lint
```

## Risks

- Embedded validation ran on Linux/WebKitWebDriver only; Windows/WebView2
  embedded re-validation was not repeated (Stage 3B.3 previously confirmed
  the same root cause cross-platform, and the fix is a WDIO-client-level
  change, not platform-specific driver code).
- The `brace-expansion` override forces a 1.x/2.x → 5.x major jump across
  all transitive dev-tooling consumers; no regression observed across the
  full static+E2E suite, but it is a wide-reaching pin.
- Embedded remains opt-in (`pnpm test:e2e:wdio:embedded`), not wired into
  any CI gate — intentionally left for a future stage/decision.
- Two of the destructive-guards embedded runs initially aborted mid-run due
  to an orchestration-side `timeout` wrapper set too short (30 min) for
  those specs' ~44-minute real duration — not a test or driver failure;
  re-run with a longer ceiling produced clean, deterministic passes both
  times, and ports/processes were confirmed clean after the aborted attempt
  too (PID-safe cleanup held even under external interruption).

## Not done

- Stage 3C (remaining placement workflows) — explicitly out of scope for
  this pass, not started.
- Windows embedded re-validation — deferred; no Windows environment
  available in this pass.
- Wiring the embedded provider into any CI gate — intentionally deferred to
  a future stage/decision; embedded stays opt-in.

## Suggested next step

Human review of PR #155 (strict review via the generated review context),
then a decision on whether/when to wire `pnpm test:e2e:wdio:embedded` into
CI as a gate, and whether Windows embedded re-validation is required before
that decision. Do not merge without that review. Stage 3C planning can begin
once this PR lands.
