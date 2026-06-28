## Summary

PR 12 of beta.3 roadmap. Added rack view export to SVG and PNG. Users can export the currently displayed rack side (Front or Rear) to a vector SVG file or a 2× rasterized PNG, selecting the save location via a native file dialog. Export is driven by real rack data — not a DOM screenshot.

## Base branch / Working branch

- Base: `roadmap/beta3`
- Branch: `feature/beta3-rack-export`

## Architecture decision: SVG + PNG

- **SVG**: pure TypeScript helper `buildRackViewSvg()` produces a deterministic, XML-escaped SVG string from rack data. No DOM dependency.
- **PNG**: DOM rasterization — SVG blob URL → `Image` → canvas at 2× scale → PNG bytes → saved via Rust command. Canvas-dependent code lives in `rackExportDom.ts` (separate file, easily mockable in tests).
- No external libraries added.
- Backend writes file content supplied by the frontend via two minimal Rust commands.

## Export flow

1. User clicks **Export SVG** or **Export PNG** in the rack detail header (next to Front/Rear toggle).
2. `buildRackViewSvg()` is called with the active side's placements from the already-loaded `RackDetailDto`.
3. For SVG: native save dialog → `write_export_file` Rust command writes text content.
4. For PNG: SVG is rasterized via canvas (2× scale for retina clarity) → native save dialog → `write_export_bytes` Rust command writes binary content.
5. Dialog cancel: no error shown. Write error: error banner appears below header.

## Front/Rear isolation

- `activeSide === "front"` → `detail.front` passed to builder; exported filename includes `-front`.
- `activeSide === "rear"` → `detail.rear` passed to builder; exported filename includes `-rear`.
- The builder itself is side-agnostic; isolation is enforced in the handler.

## XML/SVG safety

- All user-supplied strings (rack name, rack code, device name, model, serial, asset tag) pass through `escapeXml()` before insertion into SVG.
- `escapeXml()` replaces `& < > " '` with XML entities.
- Tests verify `<script>alert(1)</script>` in a device name does not appear as raw XML in output.

## Filename sanitization

- `sanitizeFilename()` removes OS-forbidden chars, replaces spaces with hyphens, lowercases. Falls back to `"rack"` for fully-invalid names.
- Default filenames: `rack-<code>-front.svg`, `rack-<code>-rear.svg`, `rack-<code>-front.png`, etc.

## Files changed

### New files
- `apps/desktop/src/features/racks/rackExport.ts` — pure helpers: `escapeXml`, `sanitizeFilename`, `buildRackViewSvg`
- `apps/desktop/src/features/racks/rackExportDom.ts` — DOM helper: `rasterizeSvgToPng` (canvas-based, mockable)
- `apps/desktop/src/features/racks/rackExport.test.ts` — 31 unit tests for pure helpers
- `apps/desktop/src/features/racks/RackDetailPanel.export.test.tsx` — 13 component tests for export buttons

### Modified files
- `apps/desktop/src/features/racks/RackDetailPanel.tsx` — added `handleExportSvg`, `handleExportPng`, export error state, Export SVG/PNG buttons in header actions
- `apps/desktop/src/api/tauriClient.ts` — added `saveRackViewSvgViaDialog`, `saveRackViewPngViaDialog`
- `apps/desktop/src-tauri/src/commands/repository.rs` — added `write_export_file`, `write_export_bytes` Tauri commands (shared `write_export` helper); 5 Rust unit tests
- `apps/desktop/src-tauri/src/commands/mod.rs` — exported new commands
- `apps/desktop/src-tauri/src/lib.rs` — registered new commands

## Tests

```
cargo fmt --all --check      → clean
cargo check --workspace      → clean
cargo test --workspace       → 93 Rust tests passed (88 prior + 5 new write_export tests)
cargo clippy -- -D warnings  → clean
npx tsc --noEmit             → clean
npx vitest run               → 784 tests passed (50 files) [was 740/48]
npx vite build               → ✓ built (326 kB JS bundle)
git diff --check             → clean
node scripts/check-version-consistency.mjs → all versions match 0.1.0-beta.2
node scripts/check-repo-hygiene.mjs        → all 8 checks passed
node --test scripts/*.test.mjs             → 19 tests passed
```

## Manual smoke

_Not performed in this automated session — manual smoke requires a running desktop app with actual rack data. Checklist for manual verification:_
- Open a rack with front placements → click Export SVG → open file in browser → verify readable
- Switch to Rear → Export SVG → verify rear placements shown, front placements absent
- Export PNG → verify file opens without distortion (2× scale)
- Cancel save dialog → verify no error banner appears
- Verify front/rear filenames are distinct

## Risks

- PNG rasterization uses `Image` + `canvas` in Tauri's WebView. Some platforms may have canvas limitations for very large SVGs (e.g. rack with 48U × 2× scale). Unlikely to be a problem in practice.
- `write_export_bytes` sends PNG as `Vec<u8>` over Tauri IPC (JSON array of numbers). For very large exports (e.g. 48U @ 2×) this may be a few hundred KB. Acceptable for desktop; not suitable for bulk export.
- No progress indicator during PNG rasterization (fast for typical rack sizes).
- Overlapping placements in data: the builder renders the first placement at each visual-top U and ignores overlapping ones. This is documented behavior; no data repair is attempted.

## Not done

- PDF export (out of scope per spec).
- Multi-rack export (out of scope).
- Progress bar for PNG (not needed for typical rack sizes).
- Rack diagram labels beyond Name/Model/Serial/Asset (future enhancement).

## Version / tags

- Version unchanged: 0.1.0-beta.2
- No tags created
- No GitHub Release created
