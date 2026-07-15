# Claude Code instructions

You are working in this repository as an implementation agent.

Rules:
- Work on a feature branch, never directly on master/main. The standard base branch for this repository is `master`.
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

## Final review-context handoff

After all implementation, checks, and `.ai/cc-report.md` update, generate the review context as the last step using a timestamped filename.

The base argument to `build-review-context.sh` is **mandatory** and must be the
direct base of the current pull request — not the eventual integration target.

### Review-context base policy

Always generate the review context against the **direct PR base**, not the eventual
integration destination of the program or roadmap.

| Head branch | Direct PR base | Review-context base |
|-------------|----------------|---------------------|
| `feature/*` | `development` | `development` |
| `feature/e2e-*` | `roadmap/e2e-wdio` | `roadmap/e2e-wdio` |
| `feature/cmdb-*` | `roadmap/cmdb` | `roadmap/cmdb` |
| `roadmap/e2e-wdio` | `development` | `development` |
| `release/*` | `master` | `master` |

Never select `development` or `master` merely because they are the eventual
integration target. The eventual destination of a roadmap program is irrelevant
to feature-PR review. Use the immediate merge target shown by the current PR.

#### For an open PR — resolve the base from GitHub

```bash
BASE_BRANCH="$(gh pr view --json baseRefName --jq '.baseRefName')"
test -n "$BASE_BRANCH"
bash scripts/ai/build-review-context.sh \
  "$BASE_BRANCH" \
  ".ai/review-context-$(date +%Y%m%d-%H%M).md"
```

When the current branch has exactly one open PR:

```bash
BASE_BRANCH="$(
  gh pr list \
    --head "$(git branch --show-current)" \
    --state open \
    --json baseRefName \
    --jq 'if length == 1 then .[0].baseRefName else empty end'
)"
test -n "$BASE_BRANCH"
bash scripts/ai/build-review-context.sh \
  "$BASE_BRANCH" \
  ".ai/review-context-$(date +%Y%m%d-%H%M).md"
```

Do not guess silently when no open PR exists or multiple open PRs exist.

#### When there is no PR (direct branch maintenance)

Do not compare the entire long-lived branch to `development`. Review only the
specific commit or commit range being introduced.

```bash
# For a single new commit — use its parent as the review base:
REVIEW_BASE="$(git rev-parse HEAD^)"
bash scripts/ai/build-review-context.sh \
  "$REVIEW_BASE" \
  ".ai/review-context-$(date +%Y%m%d-%H%M).md"
```

For multiple direct commits, use the commit immediately before the reviewed series.
This fallback applies only to direct branch-maintenance review when no PR base exists.

The file `.ai/review-context-YYYYMMDD-HHMM.md` should be attached or pasted to
ChatGPT as the code review context before approving the milestone.