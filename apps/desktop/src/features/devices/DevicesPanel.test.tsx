// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
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

vi.mock("../../lib/workMode", () => ({
  useWorkMode: vi.fn(() => ({ mode: "planning", setMode: vi.fn() })),
  WORK_MODE_DEFAULT_STATUS: { planning: "planned", "on-site": "installed" },
}));

import { listDevices, listDeviceModels } from "../../api/tauriClient";
import { useWorkMode } from "../../lib/workMode";
const mockUseWorkMode = vi.mocked(useWorkMode);

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

// ── Search, filter, sort ──────────────────────────────────────────────────────

describe("DevicesPanel — search", () => {
  it("search by name narrows the list", async () => {
    vi.mocked(listDevices).mockResolvedValue([
      makeDevice("d1", { name: "Alpha Server" }),
      makeDevice("d2", { name: "Beta Switch" }),
      makeDevice("d3", { name: "Gamma NAS" }),
    ]);
    render(<DevicesPanel {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByText("Alpha Server")).toBeTruthy());

    fireEvent.change(screen.getByPlaceholderText(/search/i), {
      target: { value: "alpha" },
    });

    await waitFor(() => expect(screen.queryByText("Beta Switch")).toBeNull());
    expect(screen.getByText("Alpha Server")).toBeTruthy();
    expect(screen.queryByText("Gamma NAS")).toBeNull();
  });

  it("search is case-insensitive", async () => {
    vi.mocked(listDevices).mockResolvedValue([
      makeDevice("d1", { name: "Alpha Server" }),
    ]);
    render(<DevicesPanel {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByText("Alpha Server")).toBeTruthy());

    fireEvent.change(screen.getByPlaceholderText(/search/i), {
      target: { value: "ALPHA" },
    });

    await waitFor(() => expect(screen.getByText("Alpha Server")).toBeTruthy());
  });

  it("search with no results shows no-match empty state", async () => {
    vi.mocked(listDevices).mockResolvedValue([
      makeDevice("d1", { name: "Alpha Server" }),
    ]);
    render(<DevicesPanel {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByText("Alpha Server")).toBeTruthy());

    fireEvent.change(screen.getByPlaceholderText(/search/i), {
      target: { value: "zzz-no-match" },
    });

    await waitFor(() => expect(screen.getByText("No devices match")).toBeTruthy());
    expect(screen.queryByText("Alpha Server")).toBeNull();
  });

  it("counter reflects search-filtered count vs total", async () => {
    vi.mocked(listDevices).mockResolvedValue([
      makeDevice("d1", { name: "Alpha" }),
      makeDevice("d2", { name: "Beta" }),
      makeDevice("d3", { name: "Gamma" }),
    ]);
    render(<DevicesPanel {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByText("3 of 3")).toBeTruthy());

    fireEvent.change(screen.getByPlaceholderText(/search/i), {
      target: { value: "alpha" },
    });

    await waitFor(() => expect(screen.getByText("1 of 3")).toBeTruthy());
  });

  it("search by serial_number matches the right device", async () => {
    vi.mocked(listDevices).mockResolvedValue([
      makeDevice("d1", { name: "Server A", serial_number: "SN-001" }),
      makeDevice("d2", { name: "Server B", serial_number: "SN-002" }),
    ]);
    render(<DevicesPanel {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByText("Server A")).toBeTruthy());

    fireEvent.change(screen.getByPlaceholderText(/search/i), {
      target: { value: "SN-001" },
    });

    await waitFor(() => expect(screen.queryByText("Server B")).toBeNull());
    expect(screen.getByText("Server A")).toBeTruthy();
  });

  it("existing placed/unplaced tab filter works together with search", async () => {
    vi.mocked(listDevices).mockResolvedValue([
      makeDevice("d1", { name: "Alpha Placed",   is_placed: true }),
      makeDevice("d2", { name: "Alpha Unplaced", is_placed: false }),
      makeDevice("d3", { name: "Beta Placed",    is_placed: true }),
    ]);
    render(<DevicesPanel {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByText("Alpha Placed")).toBeTruthy());

    // Click Placed filter
    fireEvent.click(screen.getByRole("button", { name: /^Placed/ }));
    // Then search for alpha
    fireEvent.change(screen.getByPlaceholderText(/search/i), {
      target: { value: "alpha" },
    });

    await waitFor(() => expect(screen.queryByText("Beta Placed")).toBeNull());
    expect(screen.getByText("Alpha Placed")).toBeTruthy();
    expect(screen.queryByText("Alpha Unplaced")).toBeNull();
  });
});

describe("DevicesPanel — sort", () => {
  it("sorts by name ascending by default (a before b)", async () => {
    vi.mocked(listDevices).mockResolvedValue([
      makeDevice("d1", { name: "Zebra" }),
      makeDevice("d2", { name: "Alpha" }),
    ]);
    render(<DevicesPanel {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByText("Zebra")).toBeTruthy());

    const rows = screen.getAllByRole("row");
    const names = rows.slice(1).map((r) => r.querySelector("strong")?.textContent);
    expect(names[0]).toBe("Alpha");
    expect(names[1]).toBe("Zebra");
  });

  it("clicking Name header once switches to descending order", async () => {
    vi.mocked(listDevices).mockResolvedValue([
      makeDevice("d1", { name: "Zebra" }),
      makeDevice("d2", { name: "Alpha" }),
    ]);
    render(<DevicesPanel {...BASE_PROPS} />);

    // Default: asc — Alpha first
    await waitFor(() => {
      const rows = screen.getAllByRole("row");
      expect(rows[1].querySelector("strong")?.textContent).toBe("Alpha");
      expect(rows[2].querySelector("strong")?.textContent).toBe("Zebra");
    });

    // One click on the active Name header → desc
    fireEvent.click(screen.getByText((t) => t.startsWith("Name")));

    await waitFor(() => {
      const rows = screen.getAllByRole("row");
      expect(rows[1].querySelector("strong")?.textContent).toBe("Zebra");
      expect(rows[2].querySelector("strong")?.textContent).toBe("Alpha");
    });

    // Second click → back to asc
    fireEvent.click(screen.getByText((t) => t.startsWith("Name")));

    await waitFor(() => {
      const rows = screen.getAllByRole("row");
      expect(rows[1].querySelector("strong")?.textContent).toBe("Alpha");
      expect(rows[2].querySelector("strong")?.textContent).toBe("Zebra");
    });
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

// ── Work mode integration ──────────────────────────────────────────────────────

describe("DevicesPanel — work mode default status", () => {
  it("Add Device in planning mode opens form with 'planned' status", async () => {
    mockUseWorkMode.mockReturnValue({ mode: "planning", setMode: vi.fn() });
    render(<DevicesPanel {...BASE_PROPS} />);
    fireEvent.click(screen.getByRole("button", { name: "Add device" }));
    await waitFor(() => expect(screen.getByTestId("field-status")).toBeTruthy());
    expect((screen.getByTestId("field-status") as HTMLSelectElement).value).toBe("planned");
  });

  it("Add Device in on-site mode opens form with 'installed' status", async () => {
    mockUseWorkMode.mockReturnValue({ mode: "on-site", setMode: vi.fn() });
    render(<DevicesPanel {...BASE_PROPS} />);
    fireEvent.click(screen.getByRole("button", { name: "Add device" }));
    await waitFor(() => expect(screen.getByTestId("field-status")).toBeTruthy());
    expect((screen.getByTestId("field-status") as HTMLSelectElement).value).toBe("installed");
  });

  it("Edit Device ignores work mode and uses the device's own status", async () => {
    mockUseWorkMode.mockReturnValue({ mode: "on-site", setMode: vi.fn() });
    const device = makeDevice("d1", { name: "My Server", status: "planned" });
    vi.mocked(listDevices).mockResolvedValue([device]);
    render(<DevicesPanel {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByLabelText("Edit My Server")).toBeTruthy());
    fireEvent.click(screen.getByLabelText("Edit My Server"));
    await waitFor(() => expect(screen.getByTestId("field-status")).toBeTruthy());
    // Should show device's own "planned" status, not the on-site default "installed"
    expect((screen.getByTestId("field-status") as HTMLSelectElement).value).toBe("planned");
  });
});

// ── Create similar ─────────────────────────────────────────────────────────────

describe("DevicesPanel — create similar", () => {
  it("Create similar opens add modal with 'Copy of <name>' prefilled", async () => {
    mockUseWorkMode.mockReturnValue({ mode: "planning", setMode: vi.fn() });
    vi.mocked(listDevices).mockResolvedValue([
      makeDevice("d1", { name: "Web Server 01", device_type: "server", status: "installed" }),
    ]);
    render(<DevicesPanel {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByText("Web Server 01")).toBeTruthy());

    fireEvent.click(screen.getByLabelText("Create similar to Web Server 01"));

    await waitFor(() => expect(screen.getByTestId("field-name")).toBeTruthy());
    expect((screen.getByTestId("field-name") as HTMLInputElement).value).toBe("Copy of Web Server 01");
  });

  it("Create similar copies the source device's status (not work mode default)", async () => {
    mockUseWorkMode.mockReturnValue({ mode: "planning", setMode: vi.fn() });
    vi.mocked(listDevices).mockResolvedValue([
      makeDevice("d1", { name: "DB Server", status: "installed" }),
    ]);
    render(<DevicesPanel {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByText("DB Server")).toBeTruthy());

    fireEvent.click(screen.getByLabelText("Create similar to DB Server"));

    await waitFor(() => expect(screen.getByTestId("field-status")).toBeTruthy());
    // Source device status "installed" should override planning-mode default "planned"
    expect((screen.getByTestId("field-status") as HTMLSelectElement).value).toBe("installed");
  });

  it("Create similar leaves serial number and asset tag empty", async () => {
    mockUseWorkMode.mockReturnValue({ mode: "planning", setMode: vi.fn() });
    vi.mocked(listDevices).mockResolvedValue([
      makeDevice("d1", { name: "Server A", serial_number: "SN-001", asset_tag: "AT-001" }),
    ]);
    render(<DevicesPanel {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByText("Server A")).toBeTruthy());

    fireEvent.click(screen.getByLabelText("Create similar to Server A"));

    await waitFor(() => expect(screen.getByTestId("field-serial")).toBeTruthy());
    expect((screen.getByTestId("field-serial") as HTMLInputElement).value).toBe("");
    expect((screen.getByTestId("field-asset-tag") as HTMLInputElement).value).toBe("");
  });

  it("regular Add Device still respects work mode default status after Create similar was used", async () => {
    mockUseWorkMode.mockReturnValue({ mode: "on-site", setMode: vi.fn() });
    vi.mocked(listDevices).mockResolvedValue([
      makeDevice("d1", { name: "Server A", status: "planned" }),
    ]);
    render(<DevicesPanel {...BASE_PROPS} />);
    await waitFor(() => expect(screen.getByText("Server A")).toBeTruthy());

    // Use Create similar and then close
    fireEvent.click(screen.getByLabelText("Create similar to Server A"));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    fireEvent.click(screen.getByText("Cancel"));

    // Open regular Add Device
    fireEvent.click(screen.getByRole("button", { name: "Add device" }));
    await waitFor(() => expect(screen.getByTestId("field-status")).toBeTruthy());
    // Should use work mode default "installed", not the previously prefilled "planned"
    expect((screen.getByTestId("field-status") as HTMLSelectElement).value).toBe("installed");
  });
});
