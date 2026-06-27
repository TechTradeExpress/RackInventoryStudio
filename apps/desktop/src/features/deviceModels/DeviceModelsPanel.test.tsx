// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { DeviceModelsPanel } from "./DeviceModelsPanel";
import type { DeviceModelDto } from "../../api/tauriClient";

vi.mock("../../api/tauriClient", () => ({
  listDeviceModels: vi.fn().mockResolvedValue([]),
  deleteDeviceModel: vi.fn(),
  addDeviceModel: vi.fn(),
  updateDeviceModel: vi.fn(),
}));

vi.mock("../../lib/appBusy", () => ({
  useBusy: () => ({
    isBusy: false,
    label: "",
    runBusy: <T,>(_label: string, fn: () => Promise<T>) => fn(),
  }),
}));

import { listDeviceModels } from "../../api/tauriClient";

const BASE_PROPS = {
  repoPath: "/repos/test",
  mutationToken: 0,
  onRepositoryMutated: vi.fn(),
};

function makeModel(id: string, overrides: Partial<DeviceModelDto> = {}): DeviceModelDto {
  return {
    id,
    code: `model-${id}`,
    device_type: "server",
    name: `Model ${id}`,
    vendor: null,
    model_number: null,
    default_height_u: 1,
    description: null,
    tags: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(listDeviceModels).mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ── Scroll foundation ──────────────────────────────────────────────────────────

describe("DeviceModelsPanel — list scroll foundation", () => {
  it("renders all rows for a large model list", async () => {
    const manyModels = Array.from({ length: 40 }, (_, i) =>
      makeModel(`m${i}`, { name: `Model ${i + 1}` }),
    );
    vi.mocked(listDeviceModels).mockResolvedValue(manyModels);

    render(<DeviceModelsPanel {...BASE_PROPS} />);

    await waitFor(() => expect(screen.getByText("Model 1")).toBeTruthy());

    for (let i = 1; i <= 40; i++) {
      expect(screen.getByText(`Model ${i}`)).toBeTruthy();
    }
  });

  it("wraps the table in a .tbl-wrap scroll container", async () => {
    vi.mocked(listDeviceModels).mockResolvedValue([makeModel("m1")]);

    const { container } = render(<DeviceModelsPanel {...BASE_PROPS} />);

    await waitFor(() => expect(screen.getByText("Model m1")).toBeTruthy());

    const wrap = container.querySelector(".tbl-wrap");
    expect(wrap).not.toBeNull();
    const table = wrap?.querySelector("table.tbl");
    expect(table).not.toBeNull();
  });

  it("panel title shows the correct model count", async () => {
    const models = [makeModel("m1"), makeModel("m2"), makeModel("m3")];
    vi.mocked(listDeviceModels).mockResolvedValue(models);

    render(<DeviceModelsPanel {...BASE_PROPS} />);

    await waitFor(() => expect(screen.getByText("3 models")).toBeTruthy());
  });

  it("shows empty state when no models exist", async () => {
    vi.mocked(listDeviceModels).mockResolvedValue([]);

    render(<DeviceModelsPanel {...BASE_PROPS} />);

    await waitFor(() =>
      expect(screen.getByText("No device models yet")).toBeTruthy(),
    );
  });
});

// ── Search, filter, sort ───────────────────────────────────────────────────────

describe("DeviceModelsPanel — search", () => {
  it("search by name narrows the list", async () => {
    vi.mocked(listDeviceModels).mockResolvedValue([
      makeModel("m1", { name: "Dell PowerEdge R750" }),
      makeModel("m2", { name: "Cisco Catalyst 9300" }),
    ]);
    render(<DeviceModelsPanel {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByText("Dell PowerEdge R750")).toBeTruthy());

    fireEvent.change(screen.getByPlaceholderText(/search/i), {
      target: { value: "dell" },
    });

    await waitFor(() => expect(screen.queryByText("Cisco Catalyst 9300")).toBeNull());
    expect(screen.getByText("Dell PowerEdge R750")).toBeTruthy();
  });

  it("search by vendor matches correctly", async () => {
    vi.mocked(listDeviceModels).mockResolvedValue([
      makeModel("m1", { name: "Server A", vendor: "Dell" }),
      makeModel("m2", { name: "Server B", vendor: "HPE" }),
    ]);
    render(<DeviceModelsPanel {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByText("Server A")).toBeTruthy());

    fireEvent.change(screen.getByPlaceholderText(/search/i), {
      target: { value: "hpe" },
    });

    await waitFor(() => expect(screen.queryByText("Server A")).toBeNull());
    expect(screen.getByText("Server B")).toBeTruthy();
  });

  it("search by model_number matches correctly", async () => {
    vi.mocked(listDeviceModels).mockResolvedValue([
      makeModel("m1", { name: "Server A", model_number: "R750" }),
      makeModel("m2", { name: "Server B", model_number: "DL380" }),
    ]);
    render(<DeviceModelsPanel {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByText("Server A")).toBeTruthy());

    fireEvent.change(screen.getByPlaceholderText(/search/i), {
      target: { value: "DL380" },
    });

    await waitFor(() => expect(screen.queryByText("Server A")).toBeNull());
    expect(screen.getByText("Server B")).toBeTruthy();
  });

  it("search with no match shows no-match empty state", async () => {
    vi.mocked(listDeviceModels).mockResolvedValue([
      makeModel("m1", { name: "Dell R750" }),
    ]);
    render(<DeviceModelsPanel {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByText("Dell R750")).toBeTruthy());

    fireEvent.change(screen.getByPlaceholderText(/search/i), {
      target: { value: "zzz-no-match" },
    });

    await waitFor(() => expect(screen.getByText("No models match")).toBeTruthy());
  });

  it("panel title shows filtered count when search is active", async () => {
    vi.mocked(listDeviceModels).mockResolvedValue([
      makeModel("m1", { name: "Dell R750" }),
      makeModel("m2", { name: "HPE DL380" }),
      makeModel("m3", { name: "Cisco C9300" }),
    ]);
    render(<DeviceModelsPanel {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByText("3 models")).toBeTruthy());

    fireEvent.change(screen.getByPlaceholderText(/search/i), {
      target: { value: "dell" },
    });

    await waitFor(() => expect(screen.getByText("1 of 3 models")).toBeTruthy());
  });
});

describe("DeviceModelsPanel — sort", () => {
  it("sorts by name ascending by default", async () => {
    vi.mocked(listDeviceModels).mockResolvedValue([
      makeModel("m1", { name: "Zebra Model" }),
      makeModel("m2", { name: "Alpha Model" }),
    ]);
    render(<DeviceModelsPanel {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByText("Zebra Model")).toBeTruthy());

    const rows = screen.getAllByRole("row");
    const names = rows.slice(1).map((r) => r.querySelector("strong")?.textContent);
    expect(names[0]).toBe("Alpha Model");
    expect(names[1]).toBe("Zebra Model");
  });

  it("clicking Height header sorts by height ascending then descending", async () => {
    vi.mocked(listDeviceModels).mockResolvedValue([
      makeModel("m1", { name: "Tall", default_height_u: 4 }),
      makeModel("m2", { name: "Short", default_height_u: 1 }),
    ]);
    render(<DeviceModelsPanel {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByText("Tall")).toBeTruthy());

    const heightHeader = screen.getByText((t) => t.startsWith("Height"));
    fireEvent.click(heightHeader);

    await waitFor(() => {
      const rows = screen.getAllByRole("row");
      const firstName = rows[1].querySelector("strong")?.textContent;
      expect(firstName).toBe("Short");
    });

    fireEvent.click(heightHeader);

    await waitFor(() => {
      const rows = screen.getAllByRole("row");
      const firstName = rows[1].querySelector("strong")?.textContent;
      expect(firstName).toBe("Tall");
    });
  });
});
