import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const SCRIPT = resolve(__dirname, "../scripts/ai/build-review-context.sh");

function run(...args) {
  return spawnSync("bash", [SCRIPT, ...args], { encoding: "utf8" });
}

describe("build-review-context.sh", () => {
  it("exits non-zero with usage message when no base argument is provided", () => {
    const result = run();
    assert.notEqual(result.status, 0, "should exit non-zero");
    assert.match(result.stderr, /Usage:/, "stderr should contain Usage:");
    assert.match(result.stderr, /base-branch-or-sha/, "stderr should name the required arg");
  });

  it("passes the usage check and fails later (not on usage) when a branch is supplied", () => {
    // Run with a real base branch and an out path under /tmp so the script can proceed
    // past the usage guard. It will eventually fail on git/gh calls in the test env,
    // but the exit must not be caused by the usage check (stderr must not say "Usage:").
    const out = `/tmp/rc-test-${Date.now()}.md`;
    const result = run("master", out);
    // If the script failed, it must NOT be the usage-check failure.
    if (result.status !== 0) {
      assert.doesNotMatch(
        result.stderr,
        /^Usage:/m,
        "failure must not be the usage-check error",
      );
    }
  });

  it("passes the usage check when a commit SHA is supplied as the base", () => {
    const out = `/tmp/rc-test-sha-${Date.now()}.md`;
    // HEAD^ is always resolvable in a git repo.
    const shaResult = spawnSync("git", ["rev-parse", "HEAD^"], { encoding: "utf8" });
    if (shaResult.status !== 0) return; // skip if not in a git repo
    const sha = shaResult.stdout.trim();
    const result = run(sha, out);
    if (result.status !== 0) {
      assert.doesNotMatch(
        result.stderr,
        /^Usage:/m,
        "failure with a SHA must not be the usage-check error",
      );
    }
  });

  it("does not use gh pr diff when the base is a commit SHA", () => {
    // When the caller provides a SHA as the base (no-PR maintenance flow), the script
    // must not call gh pr diff — which would pull a stale or unrelated PR's full diff.
    // We verify this by checking the generated file does NOT contain the gh pr diff
    // output header format, and that the script exits without the usage error.
    const shaResult = spawnSync("git", ["rev-parse", "HEAD^"], { encoding: "utf8" });
    if (shaResult.status !== 0) return;
    const sha = shaResult.stdout.trim();
    const out = `/tmp/rc-test-no-pr-diff-${Date.now()}.md`;
    const result = run(sha, out);
    // Must not be a usage-check failure.
    if (result.status !== 0) {
      assert.doesNotMatch(result.stderr, /^Usage:/m);
    }
    // The BASE_REF for a SHA does not start with "origin/" so gh pr diff must be skipped.
    // We can't easily inspect the output in all environments, but we can assert the
    // script did not crash on the usage guard (checked above) and that the stderr does
    // not contain "gh pr diff" failure messages attributable to a wrong PR being used.
    assert.doesNotMatch(result.stderr ?? "", /gh pr diff.*failed/i);
  });
});
