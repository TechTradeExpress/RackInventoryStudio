/**
 * Opt-in contract check confirming whether the running binary was actually
 * built with tauri-plugin-wdio (window.wdioTauri present) — or not.
 *
 * Activated only when RIS_WDIO_EXPECT_PLUGIN is set. When it is absent this
 * module is a no-op: no probe, no assertion, no recorded result. This keeps
 * every spec/benchmark run that doesn't care about the distinction
 * (most of them) completely unaffected.
 *
 *   RIS_WDIO_EXPECT_PLUGIN=present  — assert window.wdioTauri exists
 *   RIS_WDIO_EXPECT_PLUGIN=absent   — assert window.wdioTauri does not exist
 *
 * The probe result is recorded via command-timing.ts's
 * recordPluginPresenceProbe() so it ends up in summary.json as
 * `buildVariant`/`wdioPluginAvailable` — derived from the actual runtime
 * probe, never inferred from a binary path string.
 *
 * A probe *infrastructure* failure (the WebDriver session dies, execute()
 * rejects, a result fails to serialize) is never recorded as a plugin-
 * absence result and never reported as a plain presence/absence mismatch:
 * it is a distinct failure mode (session/driver broke) from "the frontend
 * genuinely never registered window.wdioTauri", and is surfaced as such
 * with the original error preserved as `cause`.
 */
import { recordPluginPresenceProbe } from "./command-timing";

const ALLOWED_EXPECTATIONS = ["present", "absent"] as const;
type ExpectedPluginPresence = (typeof ALLOWED_EXPECTATIONS)[number];

export function resolveExpectedPluginPresence(): ExpectedPluginPresence | null {
  const raw = process.env["RIS_WDIO_EXPECT_PLUGIN"];
  if (raw === undefined) return null;
  if ((ALLOWED_EXPECTATIONS as readonly string[]).includes(raw)) {
    return raw as ExpectedPluginPresence;
  }
  throw new Error(
    `[plugin-presence] Invalid RIS_WDIO_EXPECT_PLUGIN="${raw}". ` +
      `Allowed values: ${ALLOWED_EXPECTATIONS.join(", ")}.`,
  );
}

/** Self-contained — safe to pass directly to browser.execute(). */
export function isWdioTauriPresent(): boolean {
  return Boolean((window as unknown as { wdioTauri?: unknown }).wdioTauri);
}

const BINARY_VARIANT_HINT =
  "Built with the wrong binary variant? (present = wdio-plugin test binary via " +
  "scripts/build-wdio-plugin-binary.mjs; absent = plain production-shaped binary)";

/**
 * Runs a single execute() probe, re-thrown as a labeled infrastructure-
 * failure error (session crash, execute() rejection, serialization error —
 * anything other than the predicate legitimately returning false) with the
 * original error preserved as `cause`. Callers must not record a
 * present/absent result when this throws: an infrastructure failure is not
 * evidence about plugin presence either way.
 */
async function probeOnce(browser: WebdriverIO.Browser): Promise<boolean> {
  try {
    return await browser.execute(isWdioTauriPresent);
  } catch (cause) {
    throw new Error(
      "[plugin-presence] Failed to execute frontend plugin-presence probe " +
        "(session/driver error, not evidence of plugin absence)",
      { cause },
    );
  }
}

/**
 * Runs the opt-in plugin-presence contract check against the given
 * WebdriverIO browser session. No-op when RIS_WDIO_EXPECT_PLUGIN is unset.
 * Throws a descriptive error on a mismatch (wrong binary variant for the
 * run being performed) — this is meant to fail loudly and immediately, not
 * be silently tolerated.
 *
 * Uses manual polling (not browser.waitUntil) for the "present" case so an
 * infrastructure failure (execute() throwing — session crash, driver error,
 * serialization error) can be distinguished from the plugin genuinely never
 * becoming present: browser.waitUntil treats a thrown predicate error the
 * same as a timeout, which would otherwise cause an infrastructure failure
 * to be misreported as "plugin absent" and recorded as such. Only a probe
 * that runs to completion and legitimately returns false for the full 5 s
 * window is recorded as absent.
 */
export async function assertPluginPresenceContract(
  browser: WebdriverIO.Browser,
): Promise<void> {
  const expected = resolveExpectedPluginPresence();
  if (expected === null) return;

  if (expected === "present") {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      // Infrastructure failures propagate immediately — probeOnce() throws
      // before any recordPluginPresenceProbe() call.
      const actual = await probeOnce(browser);
      if (actual) {
        recordPluginPresenceProbe(true);
        return;
      }
      await new Promise((resolvePause) => setTimeout(resolvePause, 100));
    }
    recordPluginPresenceProbe(false);
    throw new Error(
      `[plugin-presence] RIS_WDIO_EXPECT_PLUGIN="present" but window.wdioTauri remained ` +
        `absent for 5 s. ${BINARY_VARIANT_HINT}`,
    );
  }

  // expected === "absent" — a single real probe; an infrastructure failure
  // must not be recorded as either present or absent.
  const actual = await probeOnce(browser);
  recordPluginPresenceProbe(actual);
  if (actual) {
    throw new Error(
      `[plugin-presence] RIS_WDIO_EXPECT_PLUGIN="absent" but window.wdioTauri was found. ` +
        BINARY_VARIANT_HINT,
    );
  }
}
