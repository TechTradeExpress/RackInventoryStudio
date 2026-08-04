#!/bin/bash
# Entrypoint for the containerized Git-over-SSH fixture (Stage 3F.5.4).
#
# Host keys are generated at *container* startup, not baked into the image —
# baking them in would mean every container started from this image shares
# the same host key material, which is the same anti-pattern flagged against
# baked-in SSH host keys in early container base images generally. Since this
# container is disposable and carries no persistent volume, "generate on
# start" costs nothing and each container run gets its own identity.
set -euo pipefail

if [ ! -f /etc/ssh/ssh_host_ed25519_key ]; then
  ssh-keygen -A >/dev/null
fi

# Repository administration (container-git-remote.ts) runs bare-repo git
# commands via `docker exec` as root, but every bare repo under
# /home/git/repos is owned by the unprivileged `git` user (see the
# Dockerfile) — modern git's "detected dubious ownership" safety check
# (protecting against a different-owner repo being a sign of tampering)
# rejects root operating on a repo it doesn't own, confirmed empirically
# (Stage 3F.5.4: `git -C <bare>.git rev-list --count HEAD` as root failed
# with exactly this error against a `git`-owned repo). Safe to disable
# globally in this disposable, single-purpose container: the only two
# identities that ever touch a repository here are root (test
# administration, already has full filesystem access regardless) and the
# git-shell-restricted `git` user reached over SSH (whose own commands
# always run as the repo's actual owner, never hitting this check at all).
git config --system --add safe.directory '*'

# authorized_keys is expected to already exist by the time this runs in the
# normal flow (container-git-remote.ts installs the public key via
# `docker exec` right after the container is created, before it waits on the
# healthcheck) — created here defensively so sshd never fails to start on a
# fresh container if that hasn't happened yet.
touch /home/git/.ssh/authorized_keys
chmod 600 /home/git/.ssh/authorized_keys
chown git:git /home/git/.ssh/authorized_keys
chown git:git /home/git/repos

exec /usr/sbin/sshd -D -e
