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

/**
 * Runs the opt-in plugin-presence contract check against the given
 * WebdriverIO browser session. No-op when RIS_WDIO_EXPECT_PLUGIN is unset.
 * Throws a descriptive error on a mismatch (wrong binary variant for the
 * run being performed) — this is meant to fail loudly and immediately, not
 * be silently tolerated.
 *
 * For "present": polls via browser.waitUntil (5 s, 100 ms interval) so the
 * check survives any brief delay between app launch and plugin registration.
 * For "absent": a single immediate execute() is sufficient — if the plugin
 * is not registered immediately it was never built in.
 */
export async function assertPluginPresenceContract(
  browser: WebdriverIO.Browser,
): Promise<void> {
  const expected = resolveExpectedPluginPresence();
  if (expected === null) return;

  if (expected === "present") {
    try {
      await browser.waitUntil(
        async () => browser.execute(isWdioTauriPresent),
        { timeout: 5_000, interval: 100, timeoutMsg: "wdioTauri not present after 5 s" },
      );
      recordPluginPresenceProbe(true);
    } catch {
      recordPluginPresenceProbe(false);
      throw new Error(
        `[plugin-presence] RIS_WDIO_EXPECT_PLUGIN="present" but window.wdioTauri was not found ` +
          `after 5 s polling. Built with the wrong binary variant? (present = wdio-plugin test ` +
          `binary via scripts/build-wdio-plugin-binary.mjs; absent = plain production-shaped binary)`,
      );
    }
    return;
  }

  // expected === "absent"
  const actual = await browser.execute(isWdioTauriPresent);
  recordPluginPresenceProbe(actual);
  if (actual) {
    throw new Error(
      `[plugin-presence] RIS_WDIO_EXPECT_PLUGIN="absent" but window.wdioTauri was found. ` +
        `Built with the wrong binary variant? (present = wdio-plugin test binary via ` +
        `scripts/build-wdio-plugin-binary.mjs; absent = plain production-shaped binary)`,
    );
  }
}
