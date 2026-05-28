# Post-Beta 1 Follow-Up Plan

Issues identified after the v0.1.0-beta.1 Windows release. Each item is tracked
as a separate PR unless noted.

---

## 1. Windows drag-and-drop compatibility — **done in this PR**

**Symptom**: Dragging equipment from the palette onto rack slots had no effect on
Windows. Drop events were silently swallowed and no placement was created.

**Root cause**: Two separate WebView2 issues:
- Tauri's default window configuration intercepted HTML5 drag events at the OS
  level for native file drop handling. Setting `dragDropEnabled: false` in
  `tauri.conf.json` releases control back to the browser's DnD API.
- Custom MIME types (`application/ris-placement`) may return an empty string from
  `getData()` on Windows even when `setData()` succeeded. Writing the payload to
  `text/plain` as a fallback ensures it is readable in all contexts.

**Fix**: `dragDropEnabled: false` in the Tauri window config; `writeDragData`
helper writes to both MIME types; `getDragPayload` reads custom MIME → `text/plain`
→ in-memory singleton in that order.

---

## 2. SSH passphrase handling

**Symptom**: Push and pull operations that require an SSH passphrase hang
indefinitely or return a non-descriptive error because the Git process prompts for
a passphrase on stdin, which is unavailable in a Tauri subprocess.

**Plan**: Detect SSH agent availability at startup; if absent, surface a
configurable passphrase field in the Repository settings panel and inject it via
`GIT_SSH_COMMAND` (or equivalent) when spawning `git push` / `git pull`.
Fall back gracefully if the key has no passphrase.

**Scope**: Does not change authentication for HTTPS remotes.

---

## 3. Hidden / auto-generated `code` fields

**Symptom**: Users must manually enter a unique `code` value for every device,
rack, and location. In common workflows the code is either auto-incrementable or
derivable from the name, so the field adds friction without value.

**Plan**: Make `code` optional in the UI. When left blank, derive it automatically
from the name (slugified) or from an auto-incremented sequence, whichever the user
configures. The backend field remains required; the frontend fills it before
submitting the create/update request.

**Scope**: UI change only; no database schema migration required.

---

## 4. Clear height override

**Symptom**: Once a per-placement height override is set, there is no UI affordance
to reset it back to the model default. The inspector shows the current height but
provides no "Clear override" action.

**Plan**: Add a "Reset to model default" button in the placement inspector height
field. Submits `height_u: null` to the backend, which causes the effective height
to fall back to `device_model.default_height_u`.

---

## 5. CSV import summary counts

**Symptom**: After a CSV device import the confirmation modal shows the raw outcome
("3 created, 1 updated, 0 skipped") but does not distinguish between rows that were
skipped intentionally (duplicate prevention) and rows that failed validation.
Users cannot tell whether data was silently dropped.

**Plan**: Extend the import result DTO to carry separate counters for
`created`, `updated`, `skipped_duplicate`, and `failed_validation`. Surface all
four in the confirmation UI. Export a downloadable error report when
`failed_validation > 0`.

---

## 6. Dirty repository guard

**Symptom**: If the user closes the app or switches repositories while there are
uncommitted local changes, those changes are silently retained in the working tree
but the user receives no warning and may forget about them.

**Plan**: Check `git status --porcelain` before any operation that changes the
active repository (open, close, create new). If the working tree is dirty, present
a modal: commit now / discard changes / cancel. Implement as a reusable hook so the
guard can be applied consistently from all entry points.
