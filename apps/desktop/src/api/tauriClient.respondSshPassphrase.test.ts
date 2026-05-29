import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock factories are hoisted before variable declarations, so the mock fn
// must be created with vi.hoisted to be accessible inside the factory.
const mockInvoke = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

// Mock @tauri-apps/api/core before importing tauriClient so we can inspect
// the exact payload passed to invoke — the camelCase key bug is invisible to
// higher-level modal tests that mock respondSshPassphrase itself.
vi.mock("@tauri-apps/api/core", () => ({ invoke: mockInvoke }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(), save: vi.fn() }));

import { respondSshPassphrase } from "./tauriClient";

beforeEach(() => {
  mockInvoke.mockClear();
});

describe("respondSshPassphrase", () => {
  it("invokes respond_ssh_passphrase with camelCase sessionId key (not session_id)", async () => {
    await respondSshPassphrase("my-secret", "aabbccddeeff0011");
    expect(mockInvoke).toHaveBeenCalledWith("respond_ssh_passphrase", {
      passphrase: "my-secret",
      sessionId: "aabbccddeeff0011",
    });
    // Regression guard: must NOT send snake_case key — Tauri v2 command
    // argument binding would reject it with "missing required key sessionId".
    const payload = mockInvoke.mock.calls[0][1] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("session_id");
  });

  it("invokes with passphrase=null and camelCase sessionId on cancel", async () => {
    await respondSshPassphrase(null, "0000000000000007");
    expect(mockInvoke).toHaveBeenCalledWith("respond_ssh_passphrase", {
      passphrase: null,
      sessionId: "0000000000000007",
    });
    const payload = mockInvoke.mock.calls[0][1] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("session_id");
  });

  it("works with high-entropy session ids that exceed Number.MAX_SAFE_INTEGER", async () => {
    // ffffffffffffffff = 18446744073709551615 > 9007199254740991 (MAX_SAFE_INTEGER)
    await respondSshPassphrase("hunter2", "ffffffffffffffff");
    expect(mockInvoke).toHaveBeenCalledWith("respond_ssh_passphrase", {
      passphrase: "hunter2",
      sessionId: "ffffffffffffffff",
    });
  });
});
