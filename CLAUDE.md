# Claude Code instructions

You are working in this repository as an implementation agent.

Rules:
- Work on a feature branch, never directly on main.
- Keep the scope minimal and aligned with the issue.
- Do not perform unrelated refactors.
- Do not remove tests unless explicitly asked.
- Every functional change should include or update tests.
- After changes, run the relevant format, lint and test commands.
- Never commit secrets, tokens, .env files or local credentials.
- Before finishing, create or update `.ai/cc-report.md`.

Final report format in `.ai/cc-report.md`:

## Summary
What changed.

## Files changed
List changed files with short explanation.

## Tests
Commands run and result.

## Risks
Known risks or assumptions.

## Not done
Anything intentionally left out.

## Suggested next step
One concrete next step.