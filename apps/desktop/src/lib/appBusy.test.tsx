// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, act, cleanup, waitFor } from "@testing-library/react";
import { AppBusyProvider, useBusy } from "./appBusy";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// Helper component that exposes busy state to the test DOM.
function BusyInspector() {
  const { isBusy, label } = useBusy();
  return (
    <div>
      <span data-testid="is-busy">{String(isBusy)}</span>
      <span data-testid="label">{label}</span>
    </div>
  );
}

// Helper that triggers runBusy via a button click.
function BusyTrigger({ label, fn }: { label: string; fn: () => Promise<void> }) {
  const { runBusy } = useBusy();
  return (
    <button
      onClick={() => runBusy(label, fn)}
      data-testid="trigger"
    >
      go
    </button>
  );
}

describe("AppBusyProvider / useBusy", () => {
  it("isBusy is false and label is empty by default", () => {
    render(
      <AppBusyProvider>
        <BusyInspector />
      </AppBusyProvider>,
    );
    expect(screen.getByTestId("is-busy").textContent).toBe("false");
    expect(screen.getByTestId("label").textContent).toBe("");
  });

  it("runBusy sets isBusy=true and the operation label while running", async () => {
    let resolve!: () => void;
    const pending = new Promise<void>((res) => { resolve = res; });

    render(
      <AppBusyProvider>
        <BusyInspector />
        <BusyTrigger label="Opening repository…" fn={() => pending} />
      </AppBusyProvider>,
    );

    screen.getByTestId("trigger").click();

    await waitFor(() =>
      expect(screen.getByTestId("is-busy").textContent).toBe("true"),
    );
    expect(screen.getByTestId("label").textContent).toBe("Opening repository…");

    // Resolve the pending operation.
    act(() => resolve());
    await waitFor(() =>
      expect(screen.getByTestId("is-busy").textContent).toBe("false"),
    );
    expect(screen.getByTestId("label").textContent).toBe("");
  });

  it("runBusy clears busy state after the fn resolves successfully", async () => {
    const fn = vi.fn().mockResolvedValue("ok");

    render(
      <AppBusyProvider>
        <BusyInspector />
        <BusyTrigger label="Saving changes…" fn={fn} />
      </AppBusyProvider>,
    );

    screen.getByTestId("trigger").click();

    await waitFor(() =>
      expect(screen.getByTestId("is-busy").textContent).toBe("false"),
    );
    expect(fn).toHaveBeenCalledOnce();
    expect(screen.getByTestId("label").textContent).toBe("");
  });

  it("runBusy clears busy state after the fn rejects (error path)", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("backend error"));

    function BusyTriggerSafe() {
      const { runBusy } = useBusy();
      return (
        <button
          onClick={() => runBusy("Committing changes…", fn).catch(() => {})}
          data-testid="trigger"
        >
          go
        </button>
      );
    }

    render(
      <AppBusyProvider>
        <BusyInspector />
        <BusyTriggerSafe />
      </AppBusyProvider>,
    );

    screen.getByTestId("trigger").click();

    await waitFor(() =>
      expect(screen.getByTestId("is-busy").textContent).toBe("false"),
    );
    expect(fn).toHaveBeenCalledOnce();
    expect(screen.getByTestId("label").textContent).toBe("");
  });

  it("runBusy re-throws the error so callers can display it", async () => {
    const err = new Error("git push failed");
    let caught: unknown = null;

    function ErrorCatcher() {
      const { runBusy } = useBusy();
      return (
        <button
          onClick={() =>
            runBusy("Pushing to remote…", () => Promise.reject(err)).catch(
              (e) => { caught = e; },
            )
          }
          data-testid="push"
        >
          push
        </button>
      );
    }

    render(
      <AppBusyProvider>
        <ErrorCatcher />
      </AppBusyProvider>,
    );

    screen.getByTestId("push").click();
    await waitFor(() => expect(caught).toBe(err));
  });
});
