## Summary

Stage 3F.5.8A: implemented a native Linux Docker host backend for the
containerized Git-over-SSH E2E fixture, so
`RIS_E2E_GIT_REMOTE_PROVIDER=container` has a real, working implementation
on Linux (previously it only worked on Windows via WSL2 — the resolver
already accepted the value on Linux, but the backend behind it invoked
`wsl.exe` unconditionally and would fail immediately on a non-Windows
host).

Introduced a `ContainerHostBackend` interface
(`apps/desktop/e2e-wdio/support/container-git-remote.ts`) with two
implementations: `createWindowsWsl2Backend()` (the pre-existing WSL2
behavior, moved behind the interface, unchanged in effect) and
`createLinuxNativeBackend()` (new — talks to the local `docker` CLI
directly via `execFile`/`spawn`, never through `sudo` or a shell,
passes host paths through unchanged instead of translating them). All
shared lifecycle logic (image content-hash caching, transactional
startup/rollback, container health polling, authoritative cleanup,
bare-remote administration) takes a `ContainerHostBackend` parameter and
is not duplicated per platform. Container security posture
(loopback-only port publish, no privileged mode, no host networking, no
socket mount, non-root `git-shell` user) is inherited unchanged from the
already-shared `buildDockerRunArgs`.

The Linux default provider resolution is **unchanged**: unset/empty still
resolves to `"native"` on Linux (only `win32` defaults to `"container"`).
That default switch is explicitly out of scope for this stage.

**Stage O (running all three Git SSH specs for real on a Linux host with
the container provider) is blocked**, not by a defect in this stage's
code, but by a Docker networking restriction in this development sandbox
itself — see Risks below. All other stage requirements are complete.

## Files changed

- `apps/desktop/e2e-wdio/support/container-git-remote.ts` — added the
  `ContainerHostBackend` interface, `createWindowsWsl2Backend()`,
  `createLinuxNativeBackend()`, `resolveContainerHostKind()`,
  `createContainerHostBackend()`, `assertLinuxAbsolutePath()`,
  `classifyLinuxExecError()`, `wrapDockerError()`. Reworked all shared
  lifecycle functions (`ensureImageBuilt`, `inspectContainerPresence`,
  `removeContainerViaDocker`, `waitForContainerHealthy`,
  `collectDiagnostics`, `rollbackContainerByName`,
  `rollbackPartialContainerFixture`, `startContainerRemote`,
  `cleanupContainerRemote`, `cleanupOrphanedContainers`, and the
  bare-remote admin functions) to take a `ContainerHostBackend` instead
  of a WSL distro string. `ContainerOpsDeps` gained `createBackend()` and
  lost `resolveDistribution`/`startKeepAlive`/`stopKeepAlive` (keep-alive
  is now a backend method). `resolveGitRemoteProvider()` body/signature
  unchanged; only its doc comment was extended.
- `apps/desktop/e2e-wdio/support/container-git-remote.test.ts` — added
  `fakeBackend()` test helper; reworked every describe block that
  previously threaded a WSL distro string to thread a fake
  `ContainerHostBackend` instead; added new describe blocks for
  `resolveContainerHostKind`, `createContainerHostBackend`,
  `assertLinuxAbsolutePath`, `classifyLinuxExecError`, and a
  real-Docker-if-available probe block (skips gracefully without Docker).
  Fixed 9 pre-existing test failures caused by hardcoded Windows-style
  path fixtures (`"C:\\fake-run-root"`) that don't parse as absolute
  paths under Linux's `node:path` semantics — replaced with
  `join(tmpdir(), ...)`-based fixtures; this only changed fixture path
  *values*, not the path-safety logic under test.
- `apps/desktop/e2e-wdio/wdio.conf.ts` — no net change (a temporary debug
  `console.error` added during diagnosis was removed before finalizing).
- `docs/E2E_WDIO_PLAN.md` — added the "Stage 3F.5.8A — Linux-native
  Docker backend bootstrap" section.

## Tests

- `pnpm vitest run e2e-wdio/support/container-git-remote.test.ts` — 259/259
  passed, including full Windows/WSL2 backend regression coverage and the
  new Linux-backend unit tests.
- `pnpm build:e2e:wdio-plugin` — succeeded; used to build the real WDIO
  test binary for manual fixture validation.
- Manual, direct invocation of `startContainerRemote()` /
  `createContainerBareRemote()` against the real local Docker daemon
  confirmed: image build/reuse, container start, healthcheck pass, SSH
  keypair generation, public-key install via `docker exec`, and
  authoritative cleanup all succeed end-to-end on this Linux host with
  the native backend.
- `pnpm test:e2e:wdio --spec git-remote-workflows --skip-build --binary
  <built-binary> --expect-plugin present` with
  `RIS_E2E_GIT_REMOTE_PROVIDER=container` — provider correctly resolved
  to `container`, correctly selected the Linux-native backend, container
  fixture lifecycle completed successfully per logs — but all 3 scenarios
  failed at the point of the actual `git push` over SSH ("push never
  landed on the remote bare repository"), traced to the environment issue
  below, not application/fixture logic.
- Static validation not yet run at report-write time — see Not done.

## Risks

- **Docker port-publishing is not reachable from the host in this
  sandbox.** This Claude Code session runs inside its own Docker
  container (confirmed via `/.dockerenv` and `docker ps` showing the
  outer `ccw-ris` container). Reproduced with a completely unrelated
  `nginx:alpine` container: `docker port` reports the mapping as active
  and the container as healthy, but connecting to the published port on
  `127.0.0.1` gives "Connection refused", `ss -ltnp` shows no listening
  socket for it, no `docker-proxy` process exists, `iptables -t nat -L`
  fails with "Permission denied (you must be root)", and even a direct
  connection to the container's bridge IP (bypassing port-publishing
  entirely) times out. This points to the sandbox itself lacking the
  privileges Docker needs to program NAT/forwarding rules for
  newly-published ports — an environment limitation, not a defect in the
  Linux-native backend. `--network host` would likely work around it but
  is explicitly forbidden by this stage's security requirements, so it
  was not attempted.
- Because of the above, **Stage O's "all three specs pass on a real Linux
  host" requirement could not be completed in this environment.** The
  fixture's own logic (image build, container start, health check, key
  install via `docker exec`, cleanup) is verified working; only the
  actual SSH data-plane connection through the published port could not
  be validated here.

## Not done

- Stage O real-host spec validation (blocked — see Risks).
- Stage P (explicit native control run) and Stage Q (resource residue
  verification) were not formally executed as separate steps; residue
  checks were folded into ad-hoc `docker ps`/`ss`/cleanup verification
  during diagnosis.
- Full static validation suite (`git diff --check`, `pnpm
  check:version`, `pnpm check:hygiene`, `pnpm test:scripts`, typecheck,
  `cargo fmt`/`clippy`/`test`) not yet run as of this report — planned as
  the next step before committing.
- Commits not yet made / not yet pushed to
  `origin/feature/windows-ssh-fixture` as of this report — planned next.

## Suggested next step

Run this Linux-native backend's real-host validation (Stage O) on a
Linux host with normal (non-nested) Docker networking — e.g., a CI
runner or a bare-metal/VM development machine rather than this
Docker-in-Docker sandbox — to get a genuine pass/fail on all three Git
SSH specs before considering a future Stage 3F.5.8B (switching the Linux
default to container).
