# MVP Readiness Report

**Date:** 2026-05-19 (updated Git remote sync: 2026-05-19; roadmap updated to MVP+ / v1.0.0: 2026-05-19)
**Scope:** MVP Core complete — full inventory workflow including Git remote sync. Project is now in MVP+ / Beta phase targeting v1.0.0.

---

## Automated smoke coverage

A new Rust integration test (`crates/ris-application/tests/mvp_smoke_tests.rs`)
covers the full backend equivalent of the manual smoke-test checklist:

| Step | Covered |
|---|---|
| Open repository from temp fixture | Yes |
| Add location | Yes |
| Add rack under location | Yes |
| Add device model (server, 2U) | Yes |
| Add rack_object device model (1U) | Yes |
| Add concrete device manually | Yes |
| Preview valid CSV (2 rows) — no errors, no mutation | Yes |
| Import valid CSV — 2 devices created, indexed, unplaced | Yes |
| Place manually added device in new rack (front) | Yes |
| Place CSV-imported device in new rack (front, explicit height_u) | Yes |
| Place rack_object in new rack (front) | Yes |
| Move device placement (front → rear, same rack) | Yes |
| Remove one placement — device becomes unplaced again | Yes |
| Validate — no errors for smoke-created objects | Yes |
| Save | Yes |
| Reload — entities persist, placement state matches | Yes |
| Removed placement stays removed after reload | Yes |
| Invalid CSV preview → SkipDueToError | Yes |
| Import of invalid CSV → rejected, session not mutated | Yes |

Total new tests: **3** (1 full workflow, 2 negative CSV cases)

Invalid CSV coverage was already partially present in
`crates/ris-application/tests/application_tests.rs` (6 existing
`import_devices_csv_*` tests). The new negative cases serve as smoke
confirmations rather than new rule coverage.

---

## Manual smoke checklist

`docs/MVP_SMOKE_TEST_CHECKLIST_EN.md` contains 16 steps covering the full
UI-level workflow including validation navigation drill-down (step 16).

**Status:** Up to date as of this milestone.
No wording corrections were needed — the checklist accurately reflects the
current UI behavior.

The manual checklist has not been executed end-to-end in an automated UI
test harness (no UI automation is implemented). It is intended for human
execution before release candidates.

---

## Current MVP-capable workflow

The following non-Git inventory operations are implemented and tested:

- **Open repository** from a local YAML directory (path input, native folder picker, recent repositories list stored in localStorage)
- **Repository summary** live-refreshes after every mutation; includes validation error/warning counts from last open
- **Location management**: list, add
- **Rack management**: list, add (with location selector), rack detail view
- **Device model management**: list, add (server, network, storage, ups, appliance, other, rack_object)
- **Device management**: list, add (all concrete device types; rack_object excluded)
- **CSV device import**: preview with row-level validation, confirm/write
- **Placement**: place device, place rack object, move within/across rack side, remove
- **Rack unit diagram**: visual placement display
- **Validation**: 36 VAL-* rules, run on demand, results with navigation drill-down
- **Save**: write YAML files to disk
- **Dirty state**: unsaved changes banner, confirmation on close
- **Cross-panel refresh**: `repositoryMutationToken` propagates to all panels
- **Validation navigation**: each validation issue links to its relevant tab/object
- **Git foundation**: detect whether repo is a Git repository, init, show status (branch / upstream / ahead-behind / clean / counts), show recent commits, commit saved changes with user-provided message from Repository panel
- **Git remote sync**: list configured remotes, add a remote, push current branch (`git push -u`), pull fast-forward (`git pull --ff-only`); push/pull disabled when unsaved changes exist; after pull, session reloads from disk automatically; auth errors (SSH/HTTPS) surface as clear error messages

---

## MVP Core status

### Critical blockers — None

MVP Core is complete. The local Git workflow (init / commit / log) and remote sync (remote add / push / pull) are implemented. The full offline-first inventory workflow is demonstrable end-to-end.

**Auth assumption:** SSH keys and HTTPS credentials must be configured in the OS or a git-credential-helper before using push/pull. The app delegates auth entirely to the system git. This is intentional and documented.

---

## MVP+ / v1.0.0 scope

The following items are planned for the MVP+ / Beta phase before v1.0.0. They are not MVP Core blockers — the core workflow is complete — but they are required for a user-facing release.

### Planned MVP+ items

| Area | Status |
|---|---|
| Safe publish workflow / better Git UX | Planned next |
| Create new repository wizard | Done (PR #33) |
| Native CSV file picker | Done (PR #33) |
| Minimal global search | Done (PR #35) |
| Playwright smoke foundation | Done (PR #36) |
| Drag-and-drop placement | Done (PR #37) |
| Repository flow polish (landing/open/close/recent repos) | Done (PR #38) |
| Claude Design / UX audit and design direction | Planned |
| UI polish based on design direction | Planned |
| Release hardening + packaging check | v1.0.0 Candidate |
| User-facing release documentation | v1.0.0 Release |

### Known usability gaps (tracked, not blocking MVP Core)

- **No native CSV file picker** — users must paste CSV content into a textarea. Targeted: M40.
- **No drag-and-drop** for rack unit placement. Form-based operations cover core use case. Targeted: M43.
- **No global search** — entity lookup requires navigating to the correct tab. Targeted: M41.
- **No scrollIntoView** for validation-highlighted rows — rows may need manual scrolling to become visible.
- **No UI automation tests** — the manual checklist requires human execution. Targeted: M45.
- **Devices tab does not auto-scroll** to a newly highlighted device after validation navigation.
- **Repository summary placement counts** reflect all placement files; no per-location breakdown.

### Not planned before v1.0.0

- Update-existing-devices CSV import
- Placement import
- Device model import
- Autosave
- Tags UI filtering

---

## Recommended next step

**MVP+ / Beta phase (M38–M45):** Start with safe publish workflow (M38) and create new repository wizard (M39) as the highest-impact usability improvements. Native CSV file picker (M40) and minimal global search (M41) can follow. Claude Design / UX audit (M42) should be scheduled early enough to inform the UI polish milestone (M44).

See `docs/IMPLEMENTATION_PLAN_EN.md` section 30 for the full revised roadmap.

---

## Notes

- The automated smoke test revealed one behavioral detail:
  devices imported via CSV without a `device_model_code` column require an
  explicit `height_u` override at placement time (no model to derive height from).
  This is expected behavior and is documented as a known limitation.
- All 275 Rust tests pass (245 existing + 30 new ris-git tests: 7 parser unit + 11 remote integration + 12 git workflow).
- All 38 Vitest tests pass.
- Typecheck, build, and Clippy are clean.
