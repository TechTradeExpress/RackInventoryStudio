// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { DevicesPanel } from "./DevicesPanel";
import type { DeviceDto, DeviceModelDto } from "../../api/tauriClient";

vi.mock("../../api/tauriClient", () => ({
  listDevices: vi.fn().mockResolvedValue([]),
  listDeviceModels: vi.fn().mockResolvedValue([]),
  deleteDevice: vi.fn(),
  addDevice: vi.fn(),
  updateDevice: vi.fn(),
}));

vi.mock("../../lib/appBusy", () => ({
  useBusy: () => ({
    isBusy: false,
    label: "",
    runBusy: <T,>(_label: string, fn: () => Promise<T>) => fn(),
  }),
}));

import { listDevices, listDeviceModels } from "../../api/tauriClient";

const BASE_PROPS = {
  repoPath: "/repos/test",
  mutationToken: 0,
  onRepositoryMutated: vi.fn(),
};

function makeDevice(id: string, overrides: Partial<DeviceDto> = {}): DeviceDto {
  return {
    id,
    code: `device-${id}`,
    name: `Device ${id}`,
    device_model_id: null,
    device_model_code: null,
    device_type: "server",
    is_placed: false,
    serial_number: null,
    asset_tag: null,
    external_ref: null,
    status: "active",
    description: null,
    tags: [],
    ...overrides,
  };
}

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
  vi.mocked(listDevices).mockResolvedValue([]);
  vi.mocked(listDeviceModels).mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ── Scroll foundation ─────────────────────────────────────────────────────────

describe("DevicesPanel — list scroll foundation", () => {
  it("renders all rows for a large device list", async () => {
    const manyDevices = Array.from({ length: 53 }, (_, i) =>
      makeDevice(`d${i}`, { name: `Device ${i + 1}` }),
    );
    vi.mocked(listDevices).mockResolvedValue(manyDevices);

    render(<DevicesPanel {...BASE_PROPS} />);

    await waitFor(() => expect(screen.getByText("Device 1")).toBeTruthy());

    // All 53 rows must be present in the DOM — none hidden or clipped by React
    for (let i = 1; i <= 53; i++) {
      expect(screen.getByText(`Device ${i}`)).toBeTruthy();
    }
  });

  it("wraps the table in a .tbl-wrap scroll container", async () => {
    vi.mocked(listDevices).mockResolvedValue([makeDevice("d1")]);

    const { container } = render(<DevicesPanel {...BASE_PROPS} />);

    await waitFor(() => expect(screen.getByText("Device d1")).toBeTruthy());

    const wrap = container.querySelector(".tbl-wrap");
    expect(wrap).not.toBeNull();
    const table = wrap?.querySelector("table.tbl");
    expect(table).not.toBeNull();
  });

  it("panel summary counter matches the filtered count", async () => {
    const devices = [
      makeDevice("d1", { name: "Alpha", is_placed: true }),
      makeDevice("d2", { name: "Beta",  is_placed: false }),
      makeDevice("d3", { name: "Gamma", is_placed: false }),
    ];
    vi.mocked(listDevices).mockResolvedValue(devices);

    render(<DevicesPanel {...BASE_PROPS} />);

    // "All" filter: 3 of 3
    await waitFor(() => expect(screen.getByText("3 of 3")).toBeTruthy());
  });
});

// ── Code-leakage regression ────────────────────────────────────────────────────

describe("DevicesPanel — code leakage regression", () => {
  it("shows device name in the table, not the device code", async () => {
    vi.mocked(listDevices).mockResolvedValue([
      makeDevice("d1", { code: "device-secret-code-123", name: "Web Server 01" }),
    ]);

    render(<DevicesPanel {...BASE_PROPS} />);

    await waitFor(() => expect(screen.getByText("Web Server 01")).toBeTruthy());

    expect(screen.queryByText("device-secret-code-123")).toBeNull();
  });

  it("shows model name in the table, not the model code", async () => {
    const model = makeModel("m1", { code: "model-secret-code-456", name: "Dell R750", device_type: "server" });
    vi.mocked(listDevices).mockResolvedValue([
      makeDevice("d1", { code: "device-secret-code-123", name: "Web Server", device_model_id: "m1", device_model_code: "model-secret-code-456" }),
    ]);
    vi.mocked(listDeviceModels).mockResolvedValue([model]);

    render(<DevicesPanel {...BASE_PROPS} />);

    await waitFor(() => expect(screen.getByText("Dell R750")).toBeTruthy());

    expect(screen.queryByText("model-secret-code-456")).toBeNull();
    expect(screen.queryByText("device-secret-code-123")).toBeNull();
  });

  it("shows 'Unnamed device' fallback when device name is null, never the code", async () => {
    vi.mocked(listDevices).mockResolvedValue([
      makeDevice("d2", { code: "device-secret-code-123", name: null }),
    ]);

    render(<DevicesPanel {...BASE_PROPS} />);

    await waitFor(() => expect(screen.getByText("Unnamed device")).toBeTruthy());

    expect(screen.queryByText("device-secret-code-123")).toBeNull();
  });

  it("Edit and Delete button aria-labels use device name, not code", async () => {
    vi.mocked(listDevices).mockResolvedValue([
      makeDevice("d3", { code: "device-secret-code-123", name: "Storage Array" }),
    ]);

    render(<DevicesPanel {...BASE_PROPS} />);

    await waitFor(() => expect(screen.getByLabelText("Edit Storage Array")).toBeTruthy());

    expect(screen.getByLabelText("Delete Storage Array")).toBeTruthy();
    expect(screen.queryByLabelText(/device-secret-code-123/)).toBeNull();
  });
});
