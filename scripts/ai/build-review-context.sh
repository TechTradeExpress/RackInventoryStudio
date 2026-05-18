#!/usr/bin/env bash
set -euo pipefail

BASE_BRANCH="${1:-main}"
OUT="${2:-.ai/review-context-$(date +%Y%m%d-%H%M).md}"

mkdir -p .ai
git fetch origin "$BASE_BRANCH" --quiet

CURRENT_BRANCH="$(git branch --show-current)"
PR_NUMBER="$(gh pr view --json number --jq '.number' 2>/dev/null || true)"

# Detect whether there are commits ahead of the base branch, or only working-tree changes.
COMMITS_AHEAD="$(git rev-list --count "origin/${BASE_BRANCH}...HEAD" 2>/dev/null || echo 0)"
HAS_WORKING_CHANGES=false
if git diff --quiet HEAD -- 2>/dev/null && git diff --cached --quiet HEAD -- 2>/dev/null; then
  HAS_WORKING_CHANGES=false
else
  HAS_WORKING_CHANGES=true
fi
UNTRACKED_FILES="$(git ls-files --others --exclude-standard | grep -v '^pnpm-lock' | grep -vF "$OUT" || true)"

{
  echo "# ChatGPT Code Review Context"
  echo
  echo "## Review mode"
  echo "You are a strict code reviewer. Review only this change. Focus on correctness, scope, tests, security, maintainability and operational risk."
  echo
  echo "Return:"
  echo "- Status: Approve / Request changes / Needs human decision"
  echo "- Summary"
  echo "- Blocking issues"
  echo "- Non-blocking suggestions"
  echo "- Scope check"
  echo "- Tests"
  echo "- Risks"
  echo "- Recommended next action"
  echo

  echo "## Repository"
  gh repo view --json nameWithOwner,url --jq '"- Repo: " + .nameWithOwner + "\n- URL: " + .url' 2>/dev/null || true
  echo

  echo "## Branch"
  echo "- Current branch: ${CURRENT_BRANCH}"
  echo "- Base branch: ${BASE_BRANCH}"
  echo "- Commits ahead of base: ${COMMITS_AHEAD}"
  if [[ "$HAS_WORKING_CHANGES" == "true" || -n "$UNTRACKED_FILES" ]]; then
    echo "- Uncommitted changes present: yes"
  fi
  echo

  if [[ -n "${PR_NUMBER}" ]]; then
    echo "## Pull request"
    gh pr view "${PR_NUMBER}" --json number,title,url,body,baseRefName,headRefName,changedFiles,additions,deletions,mergeable,reviewDecision \
      --jq '
        "- Number: #" + (.number|tostring) +
        "\n- Title: " + .title +
        "\n- URL: " + .url +
        "\n- Base: " + .baseRefName +
        "\n- Head: " + .headRefName +
        "\n- Changed files: " + (.changedFiles|tostring) +
        "\n- Additions: " + (.additions|tostring) +
        "\n- Deletions: " + (.deletions|tostring) +
        "\n- Mergeable: " + (.mergeable|tostring) +
        "\n- Review decision: " + (.reviewDecision|tostring) +
        "\n\n### Body\n" + (.body // "")
      '
    echo

    echo "## GitHub checks"
    gh pr checks "${PR_NUMBER}" || true
    echo
  else
    echo "## Pull request"
    echo "No PR detected for current branch."
    echo
  fi

  echo "## Claude Code report"
  if [[ -f .ai/cc-report.md ]]; then
    cat .ai/cc-report.md
  else
    echo "No .ai/cc-report.md found."
  fi
  echo

  echo "## Changed files"
  if [[ "$COMMITS_AHEAD" -gt 0 ]]; then
    git diff --name-status "origin/${BASE_BRANCH}...HEAD"
  fi
  if [[ "$HAS_WORKING_CHANGES" == "true" ]]; then
    git diff --name-status HEAD --
  fi
  if [[ -n "$UNTRACKED_FILES" ]]; then
    while IFS= read -r f; do
      echo "A	$f"
    done <<< "$UNTRACKED_FILES"
  fi
  echo

  echo "## Diff stat"
  if [[ "$COMMITS_AHEAD" -gt 0 ]]; then
    git diff --stat "origin/${BASE_BRANCH}...HEAD"
  fi
  if [[ "$HAS_WORKING_CHANGES" == "true" ]]; then
    git diff --stat HEAD --
  fi
  echo

  echo "## Diff"
  if [[ -n "${PR_NUMBER}" ]]; then
    gh pr diff "${PR_NUMBER}" --patch --color never
  elif [[ "$COMMITS_AHEAD" -gt 0 ]]; then
    git diff --no-color "origin/${BASE_BRANCH}...HEAD"
  fi

  # Working-tree changes (modified tracked files)
  if [[ "$HAS_WORKING_CHANGES" == "true" ]]; then
    git diff --no-color HEAD --
  fi

  # New untracked files — emit a synthetic diff so reviewers see full content
  if [[ -n "$UNTRACKED_FILES" ]]; then
    echo
    echo "## New files (untracked)"
    while IFS= read -r f; do
      echo
      echo "### $f"
      echo '```'
      cat "$f"
      echo '```'
    done <<< "$UNTRACKED_FILES"
  fi
} > "$OUT"

echo "Saved review context to $OUT"