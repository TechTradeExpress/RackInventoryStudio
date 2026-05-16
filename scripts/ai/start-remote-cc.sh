#!/usr/bin/env bash
set -euo pipefail

REPO_NAME="$(basename "$(git rev-parse --show-toplevel)")"
BRANCH="$(git branch --show-current)"

claude --remote-control "${REPO_NAME}:${BRANCH}"