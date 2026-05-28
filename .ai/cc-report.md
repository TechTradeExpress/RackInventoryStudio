## Summary

Post-beta 1 follow-up — branch `fix/windows-dnd-post-beta1`.

Fixed Windows drag-and-drop for rack placement. On Windows with Tauri + WebView2,
two independent bugs prevented DnD from working:

1. **Tauri intercepting DnD events**: `dragDropEnabled` was not set to `false` in
   the window config, so WebView2 captured HTML5 drag events at OS level for native
   file drop handling. Set `dragDropEnabled: false` in `tauri.conf.json`.

2. **Custom MIME type unreliability**: `application/ris-placement` may return an
   empty string from `getData()` on Windows WebView2 even when `setData()` succeeded.
   Now writing to both the custom MIME type and `text/plain`; `getDragPayload` reads
   in priority order: custom MIME → `text/plain` → in-memory singleton.

Also added the post-beta follow-up plan document and CHANGELOG entry.

## Files changed

- `apps/desktop/src-tauri/tauri.conf.json` — Added `"dragDropEnabled": false` to
  the main window. Primary fix for Windows DnD event interception.

- `apps/desktop/src/features/racks/dndHelpers.ts` — Added `writeDragData` export
  (writes to both MIME types, each write guarded against throwing). Updated
  `getDragPayload` with three-tier read strategy: custom MIME → `text/plain` →
  in-memory cache. Added cross-platform rationale comment block.

- `apps/desktop/src/features/racks/PlacementPalettePanel.tsx` — Replaced direct
  `setData(DND_DATA_TYPE, ...)` calls with `writeDragData`. Removed direct
  `DND_DATA_TYPE` import (no longer needed in this file).

- `apps/desktop/src/features/racks/RackUnitDiagram.tsx` — Replaced direct
  `setData(DND_DATA_TYPE, ...)` call with `writeDragData`. Removed direct
  `DND_DATA_TYPE` import.

- `apps/desktop/src/features/racks/dndHelpers.test.ts` — Replaced old 3-test
  `getDragPayload — dataTransfer fallback` block with:
  - `writeDragData` block (3 tests: writes both MIME types, tolerates throwing setData)
  - `getDragPayload — read priority` block (6 tests: custom MIME, text/plain fallback,
    preference order, in-memory fallback, throwing getData, all-null)

- `apps/desktop/src/features/racks/RackUnitDiagram.test.tsx` — Added import for
  `setActiveDragPayload`; added `RackUnitDiagram — drag and drop` describe block
  with 2 tests: dragover calls preventDefault when handler is wired, does not call
  it when no handler.

- `docs/BETA1_FOLLOWUP_PLAN_EN.md` — New document describing 6 post-beta issues
  with root cause and resolution plan for each.

- `CHANGELOG.md` — Added `## Unreleased — Post-beta 1 follow-up` section.

## Tests

```
git diff --check
node scripts/check-version-consistency.mjs
node --test scripts/*.test.mjs
node scripts/check-repo-hygiene.mjs
pnpm --filter @rack-inventory-studio/desktop exec tsc --noEmit
pnpm --filter @rack-inventory-studio/desktop exec vitest run
pnpm --filter @rack-inventory-studio/desktop exec playwright test
cargo fmt --all --check
cargo check --workspace
cargo test --workspace
cargo clippy --workspace -- -D warnings
```

(Results recorded after checks complete.)

## Risks

- Manual Windows QA not performed in this environment. The `dragDropEnabled: false`
  fix is consistent with Tauri v2 documentation and community reports for this exact
  symptom.
- `text/plain` fallback means an external file accidentally dragged onto the rack
  diagram could be decoded as a DnD payload if it contains valid JSON matching the
  `DndPayload` schema. Risk is low — the schema is specific and all malformed data
  is silently ignored.

## Not done

- SSH passphrase handling (tracked in plan doc, separate PR).
- Hidden/auto-generated `code` fields (tracked in plan doc, separate PR).
- Clear height override (tracked in plan doc, separate PR).
- CSV import summary counts (tracked in plan doc, separate PR).
- Dirty repository guard (tracked in plan doc, separate PR).
- Linux / macOS packaging (out of scope for this PR).

## Suggested next step

Manual smoke test on a Windows machine: drag a device from the palette onto an
empty rack slot, move a placed card to a different slot, and drag a placed card
to the palette to unplace it.

## Final review-context handoff

Generated after checks complete. See `.ai/review-context-*.md`.
