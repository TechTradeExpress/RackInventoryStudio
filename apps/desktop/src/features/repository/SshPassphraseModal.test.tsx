// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { SshPassphraseModal } from "./SshPassphraseModal";
import * as tauriClient from "../../api/tauriClient";

vi.mock("../../api/tauriClient", () => ({
  respondSshPassphrase: vi.fn().mockResolvedValue(undefined),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SshPassphraseModal", () => {
  const onDismiss = vi.fn();

  beforeEach(() => {
    onDismiss.mockReset();
  });

  it("does not render when open=false", () => {
    render(
      <SshPassphraseModal
        open={false}
        prompt=""
        sessionId="aabbccddeeff0011"
        expired={false}
        onDismiss={onDismiss}
      />,
    );
    expect(screen.queryByTestId("ssh-passphrase-input")).toBeNull();
  });

  it("renders the modal when open=true", () => {
    render(
      <SshPassphraseModal
        open={true}
        prompt="Enter passphrase:"
        sessionId="aabbccddeeff0011"
        expired={false}
        onDismiss={onDismiss}
      />,
    );
    expect(screen.getByTestId("ssh-passphrase-input")).toBeTruthy();
    expect(screen.getByText(/SSH key passphrase required/i)).toBeTruthy();
  });

  it("shows the prompt text from backend", () => {
    render(
      <SshPassphraseModal
        open={true}
        prompt="Enter passphrase for key '/home/user/.ssh/id_ed25519':"
        sessionId="aabbccddeeff0011"
        expired={false}
        onDismiss={onDismiss}
      />,
    );
    expect(screen.getByText(/id_ed25519/)).toBeTruthy();
  });

  it("shows guidance to use ssh-add", () => {
    render(
      <SshPassphraseModal
        open={true}
        prompt=""
        sessionId="aabbccddeeff0011"
        expired={false}
        onDismiss={onDismiss}
      />,
    );
    expect(screen.getByText(/ssh-add/i)).toBeTruthy();
  });

  it("calls respondSshPassphrase with the typed passphrase and string sessionId on Continue", async () => {
    render(
      <SshPassphraseModal
        open={true}
        prompt="Enter passphrase:"
        sessionId="aabbccddeeff0042"
        expired={false}
        onDismiss={onDismiss}
      />,
    );

    fireEvent.change(screen.getByTestId("ssh-passphrase-input"), {
      target: { value: "my-secret" },
    });
    fireEvent.click(screen.getByText("Continue"));

    await waitFor(() => {
      expect(tauriClient.respondSshPassphrase).toHaveBeenCalledWith(
        "my-secret",
        "aabbccddeeff0042",
      );
    });
    expect(onDismiss).toHaveBeenCalled();
  });

  it("calls respondSshPassphrase with null and string sessionId on Cancel", async () => {
    render(
      <SshPassphraseModal
        open={true}
        prompt=""
        sessionId="0000000000000007"
        expired={false}
        onDismiss={onDismiss}
      />,
    );

    fireEvent.click(screen.getByText("Cancel"));

    await waitFor(() => {
      expect(tauriClient.respondSshPassphrase).toHaveBeenCalledWith(null, "0000000000000007");
    });
    expect(onDismiss).toHaveBeenCalled();
  });

  it("calls respondSshPassphrase with passphrase and string sessionId on Enter key", async () => {
    render(
      <SshPassphraseModal
        open={true}
        prompt=""
        sessionId="ffffffffffffffff"
        expired={false}
        onDismiss={onDismiss}
      />,
    );

    fireEvent.change(screen.getByTestId("ssh-passphrase-input"), {
      target: { value: "hunter2" },
    });
    fireEvent.keyDown(screen.getByTestId("ssh-passphrase-input"), { key: "Enter" });

    await waitFor(() => {
      // ffffffffffffffff exceeds Number.MAX_SAFE_INTEGER — must be a string
      expect(tauriClient.respondSshPassphrase).toHaveBeenCalledWith("hunter2", "ffffffffffffffff");
    });
    expect(onDismiss).toHaveBeenCalled();
  });

  it("clears the input after successful submit", async () => {
    const { rerender } = render(
      <SshPassphraseModal
        open={true}
        prompt=""
        sessionId="aabbccddeeff0011"
        expired={false}
        onDismiss={onDismiss}
      />,
    );

    fireEvent.change(screen.getByTestId("ssh-passphrase-input"), {
      target: { value: "secret" },
    });
    expect((screen.getByTestId("ssh-passphrase-input") as HTMLInputElement).value).toBe("secret");

    fireEvent.click(screen.getByText("Continue"));
    await waitFor(() => expect(onDismiss).toHaveBeenCalled());

    // Re-open with new session: input should be blank.
    rerender(
      <SshPassphraseModal
        open={false}
        prompt=""
        sessionId="aabbccddeeff0011"
        expired={false}
        onDismiss={onDismiss}
      />,
    );
    rerender(
      <SshPassphraseModal
        open={true}
        prompt=""
        sessionId="aabbccddeeff0022"
        expired={false}
        onDismiss={onDismiss}
      />,
    );
    expect((screen.getByTestId("ssh-passphrase-input") as HTMLInputElement).value).toBe("");
  });

  it("clears the passphrase input when sessionId changes while open", async () => {
    const { rerender } = render(
      <SshPassphraseModal
        open={true}
        prompt="Enter passphrase:"
        sessionId="aabbccddeeff0011"
        expired={false}
        onDismiss={onDismiss}
      />,
    );

    fireEvent.change(screen.getByTestId("ssh-passphrase-input"), {
      target: { value: "typed-for-old-session" },
    });
    expect(
      (screen.getByTestId("ssh-passphrase-input") as HTMLInputElement).value,
    ).toBe("typed-for-old-session");

    // New request arrives — same modal stays open but sessionId changes.
    rerender(
      <SshPassphraseModal
        open={true}
        prompt="Enter passphrase:"
        sessionId="aabbccddeeff0099"
        expired={false}
        onDismiss={onDismiss}
      />,
    );

    await waitFor(() => {
      expect((screen.getByTestId("ssh-passphrase-input") as HTMLInputElement).value).toBe("");
    });
  });

  describe("expired session", () => {
    it("shows expiry message when expired=true", () => {
      render(
        <SshPassphraseModal
          open={true}
          prompt=""
          sessionId="aabbccddeeff0011"
          expired={true}
          onDismiss={onDismiss}
        />,
      );
      expect(screen.getByText(/expired or was replaced/i)).toBeTruthy();
    });

    it("shows Close button instead of Cancel when expired=true", () => {
      render(
        <SshPassphraseModal
          open={true}
          prompt=""
          sessionId="aabbccddeeff0011"
          expired={true}
          onDismiss={onDismiss}
        />,
      );
      expect(screen.getByText("Close")).toBeTruthy();
      expect(screen.queryByText("Cancel")).toBeNull();
    });

    it("hides Continue button when expired=true", () => {
      render(
        <SshPassphraseModal
          open={true}
          prompt=""
          sessionId="aabbccddeeff0011"
          expired={true}
          onDismiss={onDismiss}
        />,
      );
      expect(screen.queryByText("Continue")).toBeNull();
    });

    it("hides passphrase input when expired=true", () => {
      render(
        <SshPassphraseModal
          open={true}
          prompt=""
          sessionId="aabbccddeeff0011"
          expired={true}
          onDismiss={onDismiss}
        />,
      );
      expect(screen.queryByTestId("ssh-passphrase-input")).toBeNull();
    });

    it("clears passphrase when expired changes to true while modal is open", async () => {
      const { rerender } = render(
        <SshPassphraseModal
          open={true}
          prompt="Enter passphrase:"
          sessionId="aabbccddeeff0011"
          expired={false}
          onDismiss={onDismiss}
        />,
      );

      fireEvent.change(screen.getByTestId("ssh-passphrase-input"), {
        target: { value: "not-yet-submitted" },
      });
      expect(
        (screen.getByTestId("ssh-passphrase-input") as HTMLInputElement).value,
      ).toBe("not-yet-submitted");

      // Session expires before the user clicks Continue.
      rerender(
        <SshPassphraseModal
          open={true}
          prompt="Enter passphrase:"
          sessionId="aabbccddeeff0011"
          expired={true}
          onDismiss={onDismiss}
        />,
      );

      // Input is hidden, passphrase cleared — respondSshPassphrase must not be called.
      expect(screen.queryByTestId("ssh-passphrase-input")).toBeNull();
      expect(tauriClient.respondSshPassphrase).not.toHaveBeenCalled();
    });

    it("calls onDismiss on Close without calling respondSshPassphrase", async () => {
      render(
        <SshPassphraseModal
          open={true}
          prompt=""
          sessionId="aabbccddeeff0011"
          expired={true}
          onDismiss={onDismiss}
        />,
      );

      fireEvent.click(screen.getByText("Close"));

      await waitFor(() => expect(onDismiss).toHaveBeenCalled());
      expect(tauriClient.respondSshPassphrase).not.toHaveBeenCalled();
    });
  });
});
