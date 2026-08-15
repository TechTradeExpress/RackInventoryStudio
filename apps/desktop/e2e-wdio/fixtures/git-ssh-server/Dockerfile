# Containerized Git-over-SSH fixture (Stage 3F.5.4 proof of concept).
#
# Deliberately minimal: OpenSSH server + git + the shell each needs, nothing
# else. No language runtime, no package manager left dirty, no extra daemons.
#
# Base image: Alpine 3.20 (musl libc). Chosen over Debian-slim for footprint
# (~7 MB base vs ~75 MB) and because both openssh-server and git ship in
# Alpine's main repository with no extra apt/apk repo configuration needed.
# Maintenance implication: Alpine 3.20 is a stable release branch receiving
# security backports (not a rolling/edge tag) — pin is by exact point release
# below; bump deliberately, not via a floating `alpine:3` tag, so the fixture
# doesn't silently change under CI.
FROM alpine:3.20.3

# openssh-server: the SSH daemon under test.
# git: provides git-upload-pack/git-receive-pack AND git-shell (the restricted
#   login shell below — see sshd_config's rationale).
# bash: entrypoint.sh needs a real shell; the git-test user itself never gets
#   one (see git-shell, below) — this is a fixture-admin dependency only.
RUN apk add --no-cache openssh-server git bash

# Dedicated unprivileged git-test user. Its login shell is git-shell, not
# /bin/sh — git-shell rejects everything except git-upload-pack,
# git-receive-pack and git-upload-archive, so even if the generated test key
# ever authenticated a real interactive session, it could not run arbitrary
# commands on the container. This is the SSH-reachable identity from
# Windows; it is intentionally *not* used for repository administration
# (bare-repo creation etc.), which happens over `docker exec` as root
# instead (see container-git-remote.ts) — the split keeps the identity the
# Windows application authenticates as scoped to exactly what a real Git
# remote user needs.
RUN addgroup -S git && \
    adduser -S -G git -h /home/git -s /usr/bin/git-shell git && \
    mkdir -p /home/git/.ssh /home/git/repos && \
    chmod 700 /home/git/.ssh && \
    chown -R git:git /home/git && \
    # `adduser -S` (Alpine/BusyBox) leaves a locked ("!") shadow password
    # field. OpenSSH refuses login for *any* auth method — including
    # pubkey, which is the only method this fixture ever uses — against a
    # locked account (confirmed empirically: "User git not allowed because
    # account is locked", independent of PasswordAuthentication/PubkeyAuth
    # settings). `passwd -u` clears just the lock bit; PasswordAuthentication
    # stays "no" in sshd_config, so this does not enable password login.
    passwd -u git

COPY sshd_config /etc/ssh/sshd_config
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod 644 /etc/ssh/sshd_config && chmod 755 /usr/local/bin/entrypoint.sh

EXPOSE 22

# No arbitrary sleep on the Windows side (see container-git-remote.ts) — the
# helper polls this healthcheck as its primary readiness signal, falling
# back to a raw TCP probe if Docker's own health polling hasn't reported yet.
HEALTHCHECK --interval=1s --timeout=2s --start-period=2s --retries=20 \
  CMD nc -z 127.0.0.1 22 || exit 1

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
