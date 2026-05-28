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
    render(<SshPassphraseModal open={false} prompt="" onDismiss={onDismiss} />);
    expect(screen.queryByTestId("ssh-passphrase-input")).toBeNull();
  });

  it("renders the modal when open=true", () => {
    render(<SshPassphraseModal open={true} prompt="Enter passphrase:" onDismiss={onDismiss} />);
    expect(screen.getByTestId("ssh-passphrase-input")).toBeTruthy();
    expect(screen.getByText(/SSH key passphrase required/i)).toBeTruthy();
  });

  it("shows the prompt text from backend", () => {
    render(
      <SshPassphraseModal
        open={true}
        prompt="Enter passphrase for key '/home/user/.ssh/id_ed25519':"
        onDismiss={onDismiss}
      />,
    );
    expect(screen.getByText(/id_ed25519/)).toBeTruthy();
  });

  it("shows guidance to use ssh-add", () => {
    render(<SshPassphraseModal open={true} prompt="" onDismiss={onDismiss} />);
    expect(screen.getByText(/ssh-add/i)).toBeTruthy();
  });

  it("calls respondSshPassphrase with the typed passphrase on Continue", async () => {
    render(<SshPassphraseModal open={true} prompt="Enter passphrase:" onDismiss={onDismiss} />);

    fireEvent.change(screen.getByTestId("ssh-passphrase-input"), {
      target: { value: "my-secret" },
    });
    fireEvent.click(screen.getByText("Continue"));

    await waitFor(() => {
      expect(tauriClient.respondSshPassphrase).toHaveBeenCalledWith("my-secret");
    });
    expect(onDismiss).toHaveBeenCalled();
  });

  it("calls respondSshPassphrase with null on Cancel", async () => {
    render(<SshPassphraseModal open={true} prompt="" onDismiss={onDismiss} />);

    fireEvent.click(screen.getByText("Cancel"));

    await waitFor(() => {
      expect(tauriClient.respondSshPassphrase).toHaveBeenCalledWith(null);
    });
    expect(onDismiss).toHaveBeenCalled();
  });

  it("calls respondSshPassphrase with passphrase on Enter key", async () => {
    render(<SshPassphraseModal open={true} prompt="" onDismiss={onDismiss} />);

    fireEvent.change(screen.getByTestId("ssh-passphrase-input"), {
      target: { value: "hunter2" },
    });
    fireEvent.keyDown(screen.getByTestId("ssh-passphrase-input"), { key: "Enter" });

    await waitFor(() => {
      expect(tauriClient.respondSshPassphrase).toHaveBeenCalledWith("hunter2");
    });
    expect(onDismiss).toHaveBeenCalled();
  });

  it("clears the input after successful submit", async () => {
    const { rerender } = render(
      <SshPassphraseModal open={true} prompt="" onDismiss={onDismiss} />,
    );

    fireEvent.change(screen.getByTestId("ssh-passphrase-input"), {
      target: { value: "secret" },
    });
    expect((screen.getByTestId("ssh-passphrase-input") as HTMLInputElement).value).toBe("secret");

    fireEvent.click(screen.getByText("Continue"));
    await waitFor(() => expect(onDismiss).toHaveBeenCalled());

    // Re-open: input should be blank.
    rerender(<SshPassphraseModal open={false} prompt="" onDismiss={onDismiss} />);
    rerender(<SshPassphraseModal open={true} prompt="" onDismiss={onDismiss} />);
    expect((screen.getByTestId("ssh-passphrase-input") as HTMLInputElement).value).toBe("");
  });
});
