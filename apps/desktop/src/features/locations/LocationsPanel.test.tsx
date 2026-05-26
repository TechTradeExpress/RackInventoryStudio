import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { LocationsPanel } from "./LocationsPanel";
import type { LocationDto } from "../../api/tauriClient";

vi.mock("../../api/tauriClient", () => ({
  listLocations: vi.fn().mockResolvedValue([
    {
      id: "loc-1",
      code: "warsaw-a",
      name: "Warsaw A",
      description: null,
      address: null,
      tags: [],
      rack_count: 2,
    },
    {
      id: "loc-2",
      code: "berlin-b",
      name: "Berlin B",
      description: null,
      address: null,
      tags: [],
      rack_count: 0,
    },
  ]),
  deleteLocation: vi.fn(),
}));

vi.mock("./LocationFormModal", () => ({ LocationFormModal: () => null }));

const BASE_PROPS = {
  repoPath: "/repos/test",
  onRepositoryMutated: vi.fn(),
  onManageRacks: vi.fn(),
};

beforeEach(() => {
  document.body.innerHTML = "";
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("LocationsPanel — location row navigates to racks", () => {
  it("renders a clickable row for each location with accessible name", async () => {
    render(<LocationsPanel {...BASE_PROPS} />);
    expect(
      await screen.findByRole("button", { name: "Open racks for Warsaw A" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Open racks for Berlin B" }),
    ).toBeTruthy();
  });

  it("clicking the location row calls onManageRacks with the correct location", async () => {
    const onManageRacks = vi.fn();
    render(<LocationsPanel {...BASE_PROPS} onManageRacks={onManageRacks} />);
    const row = await screen.findByRole("button", { name: "Open racks for Warsaw A" });
    fireEvent.click(row);
    await waitFor(() => {
      expect(onManageRacks).toHaveBeenCalledOnce();
      const arg: LocationDto = onManageRacks.mock.calls[0][0];
      expect(arg.id).toBe("loc-1");
      expect(arg.code).toBe("warsaw-a");
    });
  });

  it("clicking the row for the second location calls onManageRacks with the correct location", async () => {
    const onManageRacks = vi.fn();
    render(<LocationsPanel {...BASE_PROPS} onManageRacks={onManageRacks} />);
    const row = await screen.findByRole("button", { name: "Open racks for Berlin B" });
    fireEvent.click(row);
    await waitFor(() => {
      expect(onManageRacks).toHaveBeenCalledOnce();
      expect(onManageRacks.mock.calls[0][0].id).toBe("loc-2");
    });
  });

  it("clicking the actions cell does not trigger row navigation", async () => {
    const onManageRacks = vi.fn();
    render(<LocationsPanel {...BASE_PROPS} onManageRacks={onManageRacks} />);
    await screen.findByRole("button", { name: "Open racks for Warsaw A" });
    // Click the Edit action button — should NOT trigger row navigation
    fireEvent.click(screen.getByRole("button", { name: "Edit Warsaw A" }));
    await waitFor(() => {
      expect(onManageRacks).not.toHaveBeenCalled();
    });
  });

  it("pressing Enter on the row calls onManageRacks", async () => {
    const onManageRacks = vi.fn();
    render(<LocationsPanel {...BASE_PROPS} onManageRacks={onManageRacks} />);
    const row = await screen.findByRole("button", { name: "Open racks for Warsaw A" });
    fireEvent.keyDown(row, { key: "Enter" });
    await waitFor(() => {
      expect(onManageRacks).toHaveBeenCalledOnce();
      expect(onManageRacks.mock.calls[0][0].id).toBe("loc-1");
    });
  });

  it("pressing Space on the row calls onManageRacks", async () => {
    const onManageRacks = vi.fn();
    render(<LocationsPanel {...BASE_PROPS} onManageRacks={onManageRacks} />);
    const row = await screen.findByRole("button", { name: "Open racks for Warsaw A" });
    fireEvent.keyDown(row, { key: " " });
    await waitFor(() => {
      expect(onManageRacks).toHaveBeenCalledOnce();
    });
  });

  it("pressing Enter on an action button does not trigger row navigation", async () => {
    const onManageRacks = vi.fn();
    render(<LocationsPanel {...BASE_PROPS} onManageRacks={onManageRacks} />);
    await screen.findByRole("button", { name: "Open racks for Warsaw A" });
    fireEvent.keyDown(screen.getByRole("button", { name: "Edit Warsaw A" }), { key: "Enter" });
    // Allow microtasks to flush
    await waitFor(() => {
      expect(onManageRacks).not.toHaveBeenCalled();
    });
  });

  it("pressing Space on an action button does not trigger row navigation", async () => {
    const onManageRacks = vi.fn();
    render(<LocationsPanel {...BASE_PROPS} onManageRacks={onManageRacks} />);
    await screen.findByRole("button", { name: "Open racks for Warsaw A" });
    fireEvent.keyDown(screen.getByRole("button", { name: "Delete Warsaw A" }), { key: " " });
    await waitFor(() => {
      expect(onManageRacks).not.toHaveBeenCalled();
    });
  });
});
