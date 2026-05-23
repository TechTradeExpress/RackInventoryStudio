import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { RacksPanel } from "./RacksPanel";
import type { LocationDto } from "../../api/tauriClient";

const LOCATION_A: LocationDto = {
  id: "loc-1",
  code: "warsaw-a",
  name: "Warsaw A",
  description: null,
  address: null,
  tags: [],
  rack_count: 1,
};

const LOCATION_B: LocationDto = {
  id: "loc-2",
  code: "berlin-b",
  name: "Berlin B",
  description: null,
  address: null,
  tags: [],
  rack_count: 0,
};

vi.mock("../../api/tauriClient", () => ({
  listRacks: vi.fn().mockResolvedValue([
    {
      id: "rack-1",
      code: "rack-a01",
      name: "Rack A01",
      location_id: "loc-1",
      location_code: "warsaw-a",
      height_u: 42,
      row: "A",
      description: null,
      tags: [],
      front_placement_count: 0,
      rear_placement_count: 0,
      placement_count: 0,
    },
    {
      id: "rack-2",
      code: "rack-b01",
      name: "Rack B01",
      location_id: "loc-2",
      location_code: "berlin-b",
      height_u: 24,
      row: null,
      description: null,
      tags: [],
      front_placement_count: 0,
      rear_placement_count: 0,
      placement_count: 0,
    },
  ]),
  deleteRack: vi.fn(),
}));

vi.mock("./RackFormModal", () => ({ RackFormModal: () => null }));
vi.mock("./RackDetailPanel", () => ({ RackDetailPanel: () => null }));

const BASE_PROPS = {
  repoPath: "/repos/test",
  selectedRackId: null as string | null,
  onSelectRack: vi.fn(),
  mutationToken: 0,
  onRepositoryMutated: vi.fn(),
};

beforeEach(() => {
  document.body.innerHTML = "";
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("RacksPanel — no location selected", () => {
  it("shows empty state directing user to Locations when no selectedLocation", () => {
    render(<RacksPanel {...BASE_PROPS} />);
    expect(screen.getByText("Select a location to manage its racks")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Add rack/i })).toBeNull();
  });
});

describe("RacksPanel — with location context", () => {
  it("shows only racks belonging to the selected location", async () => {
    render(<RacksPanel {...BASE_PROPS} selectedLocation={LOCATION_A} />);
    await waitFor(() => {
      expect(screen.getByText("Rack A01")).toBeTruthy();
      expect(screen.queryByText("Rack B01")).toBeNull();
    });
  });

  it("shows racks for the other location when context changes", async () => {
    render(<RacksPanel {...BASE_PROPS} selectedLocation={LOCATION_B} />);
    await waitFor(() => {
      expect(screen.getByText("Rack B01")).toBeTruthy();
      expect(screen.queryByText("Rack A01")).toBeNull();
    });
  });

  it("shows Add rack button when location is selected", async () => {
    render(<RacksPanel {...BASE_PROPS} selectedLocation={LOCATION_A} />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Add rack/i })).toBeTruthy();
    });
  });

  it("shows empty state for location with no racks", async () => {
    render(<RacksPanel {...BASE_PROPS} selectedLocation={LOCATION_B} />);
    await waitFor(() => {
      expect(screen.queryByText("Rack A01")).toBeNull();
    });
  });
});
