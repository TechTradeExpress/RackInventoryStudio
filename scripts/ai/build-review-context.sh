#!/usr/bin/env bash
set -euo pipefail

BASE_BRANCH="${1:-main}"
OUT="${2:-.ai/review-context.md}"

mkdir -p .ai
git fetch origin "$BASE_BRANCH" --quiet

CURRENT_BRANCH="$(git branch --show-current)"
PR_NUMBER="$(gh pr view --json number --jq '.number' 2>/dev/null || true)"

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
  git diff --name-status "origin/${BASE_BRANCH}...HEAD"
  echo

  echo "## Diff stat"
  git diff --stat "origin/${BASE_BRANCH}...HEAD"
  echo

  echo "## Diff"
  if [[ -n "${PR_NUMBER}" ]]; then
    gh pr diff "${PR_NUMBER}" --patch --color never
  else
    git diff --no-color "origin/${BASE_BRANCH}...HEAD"
  fi
} > "$OUT"

echo "Saved review context to $OUT"