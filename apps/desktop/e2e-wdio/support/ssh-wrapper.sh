#!/usr/bin/env bash
# GIT_SSH_COMMAND target for Stage 3F.2's local-sshd remote-Git fixture.
#
# Registered once, unconditionally, in wdio.conf.ts (see the module doc
# comment there) so every WDIO worker's Tauri app process inherits it — this
# is a no-op for every spec that never adds an SSH remote, since ssh is only
# ever invoked by `git push`/`git pull`/`git fetch` against an SSH URL.
#
# git executes "$GIT_SSH_COMMAND <args...>" through a shell, so this script
# must be a single static path (fixed at app-launch time). The actual
# per-run connection details (port, identity file — decided by
# support/git-remote.ts's startRemote(), which happens after the app is
# already running) are instead read from a small env file at *invocation*
# time, keyed off RIS_E2E_RUN_ROOT, which the app process does inherit as a
# static value from wdio.conf.ts (see test-environment.ts).
set -euo pipefail

if [ -z "${RIS_E2E_RUN_ROOT:-}" ]; then
  echo "[ssh-wrapper] RIS_E2E_RUN_ROOT is not set — refusing to guess a config location" >&2
  exit 255
fi

CONFIG_FILE="${RIS_E2E_RUN_ROOT}/git/ssh-remote-command.env"

if [ ! -f "$CONFIG_FILE" ]; then
  echo "[ssh-wrapper] no active SSH remote fixture ($CONFIG_FILE missing) — was startRemote() called?" >&2
  exit 255
fi

# shellcheck disable=SC1090
source "$CONFIG_FILE"

if [ -z "${RIS_SSH_REMOTE_PORT:-}" ] || [ -z "${RIS_SSH_REMOTE_IDENTITY:-}" ]; then
  echo "[ssh-wrapper] $CONFIG_FILE is missing RIS_SSH_REMOTE_PORT/RIS_SSH_REMOTE_IDENTITY" >&2
  exit 255
fi

exec ssh \
  -p "$RIS_SSH_REMOTE_PORT" \
  -i "$RIS_SSH_REMOTE_IDENTITY" \
  -o IdentitiesOnly=yes \
  -o StrictHostKeyChecking=no \
  -o UserKnownHostsFile=/dev/null \
  -o BatchMode=yes \
  -o ConnectTimeout=10 \
  "$@"
