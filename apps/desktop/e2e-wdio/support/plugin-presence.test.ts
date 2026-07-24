// @vitest-environment node
/**
 * Unit tests for plugin-presence.ts: the opt-in RIS_WDIO_EXPECT_PLUGIN
 * contract check. browser is mocked so these tests run without a WDIO
 * session.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./command-timing", () => ({
  recordPluginPresenceProbe: vi.fn(),
}));

import { resolveExpectedPluginPresence, assertPluginPresenceContract } from "./plugin-presence";
import { recordPluginPresenceProbe } from "./command-timing";

const ENV_VAR = "RIS_WDIO_EXPECT_PLUGIN";

describe("resolveExpectedPluginPresence", () => {
  const original = process.env[ENV_VAR];

  afterEach(() => {
    if (original === undefined) delete process.env[ENV_VAR];
    else process.env[ENV_VAR] = original;
  });

  it("returns null when unset (opt-in only)", () => {
    delete process.env[ENV_VAR];
    expect(resolveExpectedPluginPresence()).toBeNull();
  });

  it("returns 'present'", () => {
    process.env[ENV_VAR] = "present";
    expect(resolveExpectedPluginPresence()).toBe("present");
  });

  it("returns 'absent'", () => {
    process.env[ENV_VAR] = "absent";
    expect(resolveExpectedPluginPresence()).toBe("absent");
  });

  it("throws on an invalid value", () => {
    process.env[ENV_VAR] = "maybe";
    expect(() => resolveExpectedPluginPresence()).toThrow(/Invalid RIS_WDIO_EXPECT_PLUGIN/);
  });
});

describe("assertPluginPresenceContract", () => {
  const original = process.env[ENV_VAR];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (original === undefined) delete process.env[ENV_VAR];
    else process.env[ENV_VAR] = original;
  });

  function fakeBrowser(pluginPresent: boolean) {
    return {
      execute: vi.fn().mockResolvedValue(pluginPresent),
    } as unknown as WebdriverIO.Browser;
  }

  it("does nothing and never probes when RIS_WDIO_EXPECT_PLUGIN is unset", async () => {
    delete process.env[ENV_VAR];
    const browser = fakeBrowser(true);

    await assertPluginPresenceContract(browser);

    expect(browser.execute).not.toHaveBeenCalled();
    expect(recordPluginPresenceProbe).not.toHaveBeenCalled();
  });

  it("passes silently when expecting 'present' and the plugin is present", async () => {
    process.env[ENV_VAR] = "present";
    const browser = fakeBrowser(true);

    await expect(assertPluginPresenceContract(browser)).resolves.toBeUndefined();
    expect(recordPluginPresenceProbe).toHaveBeenCalledWith(true);
  });

  it("passes silently when expecting 'absent' and the plugin is absent", async () => {
    process.env[ENV_VAR] = "absent";
    const browser = fakeBrowser(false);

    await expect(assertPluginPresenceContract(browser)).resolves.toBeUndefined();
    expect(recordPluginPresenceProbe).toHaveBeenCalledWith(false);
  });

  it("throws when expecting 'present' but the plugin is absent", async () => {
    process.env[ENV_VAR] = "present";
    const browser = fakeBrowser(false);

    await expect(assertPluginPresenceContract(browser)).rejects.toThrow(/wrong binary variant/);
    expect(recordPluginPresenceProbe).toHaveBeenCalledWith(false);
  });

  it("throws when expecting 'absent' but the plugin is present", async () => {
    process.env[ENV_VAR] = "absent";
    const browser = fakeBrowser(true);

    await expect(assertPluginPresenceContract(browser)).rejects.toThrow(/wrong binary variant/);
    expect(recordPluginPresenceProbe).toHaveBeenCalledWith(true);
  });
});
