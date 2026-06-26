// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
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
