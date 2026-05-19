# MVP Readiness Report

**Date:** 2026-05-19 (updated Git remote sync: 2026-05-19)
**Scope:** Non-Git MVP inventory workflow (open/add/import/place/validate/save/reload); Git foundation + remote sync added

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

- **Open repository** from a local YAML directory
- **Repository summary** live-refreshes after every mutation
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

## Remaining MVP blockers

### Critical (blocks full Git-backed MVP)

None — the local Git workflow (init / commit / log) and remote sync (remote add / push / pull) are now implemented. The core offline-first team collaboration workflow is demonstrable end-to-end.

**Remaining auth note:** SSH keys and HTTPS credentials must be configured in the OS or a git-credential-helper before using push/pull. The app delegates auth entirely to the system git. This is intentional and documented.

### Usability gaps (acceptable for MVP, documented)

2. **No native CSV file picker** — users must paste CSV content into a textarea.
3. **No edit/delete UI** for locations, racks, devices, device models, or placements
   (add-only; removal requires editing YAML directly or using the Remove Placement
   operation for placements).
4. **No drag-and-drop** for rack unit placement.
5. **No scrollIntoView** for validation-highlighted rows — rows may need manual
   scrolling to become visible.
6. **No UI automation tests** — the manual checklist requires human execution.
7. **Devices tab does not auto-scroll** to a newly highlighted device after
   validation navigation (highlighted row visible only if user scrolls to it).
8. **Repository summary placement counts** reflect all placement files; no
   per-location breakdown.

### Not planned for this MVP

- Update-existing-devices CSV import
- Placement import
- Device model import
- Autosave
- Tags UI filtering

---

## Recommended next step

**M35 — Edit/delete UI for entity types**: Add edit and delete operations for locations, racks, device models, and devices. Currently the app is add-only (except Remove Placement). This is the most impactful remaining usability gap for real-world use.

---

## Notes

- The automated smoke test revealed one behavioral detail:
  devices imported via CSV without a `device_model_code` column require an
  explicit `height_u` override at placement time (no model to derive height from).
  This is expected behavior and is documented as a known limitation.
- All 275 Rust tests pass (245 existing + 30 new ris-git tests: 7 parser unit + 11 remote integration + 12 git workflow).
- All 38 Vitest tests pass.
- Typecheck, build, and Clippy are clean.
