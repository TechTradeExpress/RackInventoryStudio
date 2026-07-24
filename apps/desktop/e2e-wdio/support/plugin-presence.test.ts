// @vitest-environment node
/**
 * Unit tests for plugin-presence.ts: the opt-in RIS_WDIO_EXPECT_PLUGIN
 * contract check. browser is mocked so these tests run without a WDIO
 * session. Polling tests use fake timers so the 5 s "present" window never
 * waits in real time.
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

  function fakeBrowser(execute: ReturnType<typeof vi.fn>) {
    return { execute } as unknown as WebdriverIO.Browser;
  }

  it("does nothing and never probes when RIS_WDIO_EXPECT_PLUGIN is unset", async () => {
    delete process.env[ENV_VAR];
    const browser = fakeBrowser(vi.fn().mockResolvedValue(true));

    await assertPluginPresenceContract(browser);

    expect(browser.execute).not.toHaveBeenCalled();
    expect(recordPluginPresenceProbe).not.toHaveBeenCalled();
  });

  describe('expected "present"', () => {
    it("records true and returns immediately when the plugin is present on the first probe", async () => {
      process.env[ENV_VAR] = "present";
      const browser = fakeBrowser(vi.fn().mockResolvedValue(true));

      await expect(assertPluginPresenceContract(browser)).resolves.toBeUndefined();

      expect(browser.execute).toHaveBeenCalledTimes(1);
      expect(recordPluginPresenceProbe).toHaveBeenCalledWith(true);
    });

    it("records true after polling through two false reads (false, false, true)", async () => {
      vi.useFakeTimers();
      try {
        process.env[ENV_VAR] = "present";
        const execute = vi.fn()
          .mockResolvedValueOnce(false)
          .mockResolvedValueOnce(false)
          .mockResolvedValueOnce(true);
        const browser = fakeBrowser(execute);

        const promise = assertPluginPresenceContract(browser);
        // Two 100 ms polling waits stand between the three probes.
        await vi.advanceTimersByTimeAsync(100);
        await vi.advanceTimersByTimeAsync(100);
        await promise;

        expect(execute).toHaveBeenCalledTimes(3);
        expect(recordPluginPresenceProbe).toHaveBeenCalledTimes(1);
        expect(recordPluginPresenceProbe).toHaveBeenCalledWith(true);
      } finally {
        vi.useRealTimers();
      }
    });

    it("records false and throws a plugin-mismatch error when it stays false for the full 5 s window", async () => {
      vi.useFakeTimers();
      try {
        process.env[ENV_VAR] = "present";
        const execute = vi.fn().mockResolvedValue(false);
        const browser = fakeBrowser(execute);

        const promise = assertPluginPresenceContract(browser);
        const assertion = expect(promise).rejects.toThrow(/remained absent for 5 s/);
        await vi.advanceTimersByTimeAsync(5_100);
        await assertion;

        expect(recordPluginPresenceProbe).toHaveBeenCalledTimes(1);
        expect(recordPluginPresenceProbe).toHaveBeenCalledWith(false);
      } finally {
        vi.useRealTimers();
      }
    });

    it("throws an infrastructure error and never records a result when execute() throws on the first read", async () => {
      process.env[ENV_VAR] = "present";
      const probeError = new Error("session terminated");
      const execute = vi.fn().mockRejectedValue(probeError);
      const browser = fakeBrowser(execute);

      await expect(assertPluginPresenceContract(browser)).rejects.toMatchObject({
        message: expect.stringContaining("Failed to execute frontend plugin-presence probe"),
        cause: probeError,
      });
      expect(recordPluginPresenceProbe).not.toHaveBeenCalled();
    });

    it("throws an infrastructure error and never records a final false when execute() throws after an initial false read", async () => {
      vi.useFakeTimers();
      try {
        process.env[ENV_VAR] = "present";
        const probeError = new Error("driver crashed mid-session");
        const execute = vi.fn()
          .mockResolvedValueOnce(false)
          .mockRejectedValueOnce(probeError);
        const browser = fakeBrowser(execute);

        const promise = assertPluginPresenceContract(browser);
        const assertion = expect(promise).rejects.toMatchObject({
          message: expect.stringContaining("Failed to execute frontend plugin-presence probe"),
          cause: probeError,
        });
        await vi.advanceTimersByTimeAsync(100);
        await assertion;

        expect(recordPluginPresenceProbe).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('expected "absent"', () => {
    it("records false and passes silently when the plugin is absent", async () => {
      process.env[ENV_VAR] = "absent";
      const browser = fakeBrowser(vi.fn().mockResolvedValue(false));

      await expect(assertPluginPresenceContract(browser)).resolves.toBeUndefined();
      expect(browser.execute).toHaveBeenCalledTimes(1);
      expect(recordPluginPresenceProbe).toHaveBeenCalledWith(false);
    });

    it("records true and throws a plugin-mismatch error when the plugin is present", async () => {
      process.env[ENV_VAR] = "absent";
      const browser = fakeBrowser(vi.fn().mockResolvedValue(true));

      await expect(assertPluginPresenceContract(browser)).rejects.toThrow(/wrong binary variant/);
      expect(recordPluginPresenceProbe).toHaveBeenCalledWith(true);
    });

    it("throws an infrastructure error and never records a result when execute() throws", async () => {
      process.env[ENV_VAR] = "absent";
      const probeError = new Error("execute() serialization failure");
      const execute = vi.fn().mockRejectedValue(probeError);
      const browser = fakeBrowser(execute);

      await expect(assertPluginPresenceContract(browser)).rejects.toMatchObject({
        message: expect.stringContaining("Failed to execute frontend plugin-presence probe"),
        cause: probeError,
      });
      expect(recordPluginPresenceProbe).not.toHaveBeenCalled();
    });
  });
});
