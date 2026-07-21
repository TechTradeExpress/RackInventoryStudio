## Summary

Stage 3B.1: entity updates and work mode spec — with RP hardening.

Branch: `feature/e2e-wdio-entity-updates-work-mode` → base: `roadmap/e2e-wdio`

Six MISSING workflows promoted to COVERED by one new spec:

1. **Work mode toggle** — Planning → On-site → Planning; `aria-pressed` verified on both
   `work-mode-planning` and `work-mode-onsite` testids; `after()` hook restores planning mode.

2. **Edit device** — name, status (planned→installed), serial; `device-form-submit`; persisted.

3. **Edit device model** — name, height (2→3), SKU; `model-form-submit`; device list reflects
   model rename; persisted.

4. **Edit rack** — name, height (14→18), row (A→B); `rack-form-submit`; persisted.

5. **Edit location** — name; `location-form-submit`; persisted.

6. **Persistence** — save + close + reopen cycle verifies all four entity updates survive.

No new selectors added to application source. Edit buttons use the existing
`aria-label="Edit <name>"` pattern. All form field testids and submit testids were
already present from prior stages.

`wdio.conf.ts` timeout bumped from 2 700 000 ms (45 min) to 3 600 000 ms (60 min):
the entity-updates-work-mode spec creates five entities, edits four, and persists —
wall-clock ~57 min, which exceeded the previous limit.

### RP changes

- Exact entity-name matching from each row's `<strong>` via `getEntityNamesInRows()`
  (`browser.execute()` — atomic, no stale-element risk)
- No broad WebDriver `catch` — only stale-element references in the post-wait element
  re-fetch are caught specifically
- No non-null assertions (`found!`) in row lookup
- Edit buttons clicked through native WebDriver `.click()` scoped to the exact row
- Generated review context removed from Git; repository hygiene restored
- `findRowByExactName` always called before assertion helpers after navigation to ensure
  the panel has rendered (fixes race condition with `browser.execute()` DOM reads)
- `after()` hook throws if `work-mode-planning` button is missing; also verifies
  `work-mode-onsite aria-pressed="false"`; session-gone errors logged without masking
  original failure

## Files changed

| File | Change |
|---|---|
| `.ai/cc-report.md` | This report |
| `apps/desktop/e2e-wdio/specs/entity-updates-work-mode.e2e.ts` | New spec: 9-part entity-update + work-mode coverage, RP-hardened helpers |
| `apps/desktop/e2e-wdio/wdio.conf.ts` | Bump `mochaOpts.timeout` 2 700 000 → 3 600 000 ms; update comment |
| `docs/E2E_WDIO_COVERAGE_GAPS.md` | Promote 6 workflows MISSING→COVERED; update summary counts (COVERED 24→30, MISSING 12→6) |
| `docs/E2E_WDIO_PLAN.md` | Stage 3A → COMPLETED (PR #147, 40f6a12); Stage 3B split into 3B.1 IN REVIEW + 3B.2 PLANNED |

## Tests

### TypeScript

```
pnpm -C apps/desktop exec tsc --noEmit   → clean (0 errors)
```

### Vitest

```
Test Files  51 passed (51)
     Tests  844 passed (844)
  Duration  30.29s
```

### Tauri build

```
pnpm -C apps/desktop tauri build --no-bundle
Finished `release` profile [optimized] target(s) in 47.25s   → clean (0 errors)
```

### Rust workspace

```
cargo fmt --all --check          → clean
cargo test --workspace           → all passed
cargo clippy --workspace -- -D warnings  → clean
cargo check --workspace          → clean
```

### Isolated spec — pre-RP (historical, old helpers)

Run 1 — **FAILED** (timeout): 45:03; hit the old 2 700 000 ms limit during Part I.
Fix: raised `mochaOpts.timeout` to 3 600 000 ms.

Run 2 — **PASSED**: 49:41 · suffix=mrnu0gd2 · /tmp/ris-wdio-Iwbjhx (cleaned up).

Run 3 — **PASSED**: 49:39 · suffix=mrnvt5ez · /tmp/ris-wdio-GjnDP9 (cleaned up).

### Isolated spec × 2 — RP runs (required gate, RP helpers)

RP Run 1 — **FAILED** (timeout 01:00:03): stale-element errors in `waitUntil` slowed
spec beyond 60 min. Fix: `getEntityNamesInRows()` (`browser.execute()`) for wait
condition eliminates stale-element retries.

RP Run 2 — **FAILED** (`expectExactlyOneRowByName` found 0 after repo reopen): `browser.execute()`
DOM query ran before React rendered the panel. Fix: add `findRowByExactName` (waitUntil)
before assertion helpers after navigation in Parts G and I.

RP Run 3 — **PASSED**: 56:33 · suffix=mrtq66wr · /tmp/ris-wdio-tiWyxX (cleaned up).
All parts A–I; work mode confirmed (planning=true, onsite=false).

RP Run 4 — **PASSED**: 56:34 · suffix=mrts7dr0 · /tmp/ris-wdio-bv03n0 (cleaned up).
All parts A–I; work mode confirmed (planning=true, onsite=false).

### Full WDIO suite (all 7 specs) — post-RP

```
Spec Files:  7 passed, 7 total (100% completed) in 02:23:28
run root /tmp/ris-wdio-RHsmii (cleaned up)
```

### Repository hygiene

```
node scripts/check-repo-hygiene.mjs   → All 8 hygiene checks passed
```

## Risks

- Spec takes ~57 min per run due to `@wdio/tauri-service` external driver overhead in
  headless Xvfb — inherent to the current driver configuration.
- `browser.execute()` fires synthetic `click` (not full mousedown/mouseup) for
  navigational `<tr>` rows. Production IPC paths are still exercised.
- Work mode `after()` hook logs and returns (does not throw) when the WebDriver session
  is already gone; all other cleanup errors propagate.

## Not done

- Edit placement height U (Stage 3B.2)
- Remove placement via EditPlacementModal remove button (Stage 3B.2)
- PlacementInspectorPanel navigate to device / model (Stage 3B.2)
- Delete entity flows (Stage 3B.2)
- ConfirmDialog selector (Stage 3B.2)

## Suggested next step

Merge PR #149 targeting roadmap/e2e-wdio after CI passes. Plan Stage 3B.2 separately.
