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

describe("LocationsPanel — Manage racks button", () => {
  it("renders Manage racks button for each location", async () => {
    render(<LocationsPanel {...BASE_PROPS} />);
    expect(
      await screen.findByRole("button", { name: "Manage racks for Warsaw A" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Manage racks for Berlin B" }),
    ).toBeTruthy();
  });

  it("clicking Manage racks calls onManageRacks with the correct location", async () => {
    const onManageRacks = vi.fn();
    render(<LocationsPanel {...BASE_PROPS} onManageRacks={onManageRacks} />);
    const btn = await screen.findByRole("button", { name: "Manage racks for Warsaw A" });
    fireEvent.click(btn);
    await waitFor(() => {
      expect(onManageRacks).toHaveBeenCalledOnce();
      const arg: LocationDto = onManageRacks.mock.calls[0][0];
      expect(arg.id).toBe("loc-1");
      expect(arg.code).toBe("warsaw-a");
    });
  });

  it("clicking Manage racks for the second location calls onManageRacks with the correct location", async () => {
    const onManageRacks = vi.fn();
    render(<LocationsPanel {...BASE_PROPS} onManageRacks={onManageRacks} />);
    const btn = await screen.findByRole("button", { name: "Manage racks for Berlin B" });
    fireEvent.click(btn);
    await waitFor(() => {
      expect(onManageRacks).toHaveBeenCalledOnce();
      expect(onManageRacks.mock.calls[0][0].id).toBe("loc-2");
    });
  });
});
