#!/usr/bin/env bash
set -euo pipefail

OUT="${1:-.ai/cc-fix-prompt.md}"

if [[ ! -f .ai/chatgpt-review.md ]]; then
  echo "Missing .ai/chatgpt-review.md" >&2
  exit 1
fi

{
  echo "# Claude Code fix prompt"
  echo
  echo "Read CLAUDE.md and the ChatGPT review below."
  echo
  echo "Fix only blocking issues unless explicitly asked otherwise."
  echo "Keep the scope minimal."
  echo "Do not perform unrelated refactors."
  echo "Run the relevant tests."
  echo "Update .ai/cc-report.md after finishing."
  echo
  echo "## ChatGPT review"
  cat .ai/chatgpt-review.md
} > "$OUT"

echo "Saved fix prompt to $OUT"