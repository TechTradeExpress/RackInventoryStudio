// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { RackDetailPanel } from "./RackDetailPanel";
import type { RackSummaryDto, RackDetailDto, PlacementDto } from "../../api/tauriClient";

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const mockGetRackDetail = vi.hoisted(() => vi.fn());
const mockListDevices = vi.hoisted(() => vi.fn());
const mockListDeviceModels = vi.hoisted(() => vi.fn());
const mockSaveRackViewSvgViaDialog = vi.hoisted(() => vi.fn());
const mockSaveRackViewPngViaDialog = vi.hoisted(() => vi.fn());
const mockRasterizeSvgToPng = vi.hoisted(() => vi.fn());

vi.mock("../../api/tauriClient", () => ({
  getRackDetail: mockGetRackDetail,
  listDevices: mockListDevices,
  listDeviceModels: mockListDeviceModels,
  removePlacement: vi.fn(),
  movePlacement: vi.fn(),
  saveRackViewSvgViaDialog: mockSaveRackViewSvgViaDialog,
  saveRackViewPngViaDialog: mockSaveRackViewPngViaDialog,
}));

vi.mock("./rackExportDom", () => ({
  rasterizeSvgToPng: mockRasterizeSvgToPng,
}));

vi.mock("../../lib/appBusy", () => ({
  useBusy: () => ({
    isBusy: false,
    label: "",
    runBusy: <T,>(_label: string, fn: () => Promise<T>) => fn(),
  }),
}));

vi.mock("./PlacePlacementModal", () => ({ PlacePlacementModal: () => null }));
vi.mock("./EditPlacementModal", () => ({ EditPlacementModal: () => null }));
vi.mock("../devices/DeviceFormModal", () => ({ DeviceFormModal: () => null }));
vi.mock("../deviceModels/DeviceModelFormModal", () => ({ DeviceModelFormModal: () => null }));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PLACEMENT: PlacementDto = {
  id: "plc-1",
  code: "plc-1",
  target_kind: "device",
  target_id: "dev-1",
  target_code: "SRV-001",
  target_name: "Web Server 01",
  device_type: "server",
  start_u: 1,
  height_u: 1,
  effective_height_u: 1,
  end_u: 1,
  note: null,
  tags: [],
  model_name: "Dell R640",
  model_code: "R640",
  target_serial: null,
  target_asset_tag: null,
};

const REAR_PLACEMENT: PlacementDto = {
  ...PLACEMENT,
  id: "plc-rear-1",
  target_name: "Rear Device",
  start_u: 2,
  end_u: 2,
};

const RACK: RackSummaryDto = {
  id: "rack-1",
  code: "rack-a01",
  name: "Rack A01",
  location_id: "loc-1",
  location_code: "dc-a",
  height_u: 10,
  row: null,
  description: null,
  tags: [],
  front_placement_count: 1,
  rear_placement_count: 1,
  placement_count: 2,
  front_used_u: 1,
  rear_used_u: 1,
};

const DETAIL: RackDetailDto = {
  id: "rack-1",
  code: "rack-a01",
  name: "Rack A01",
  location_id: "loc-1",
  location_code: "dc-a",
  height_u: 10,
  row: null,
  front: [PLACEMENT],
  rear: [REAR_PLACEMENT],
};

const BASE_PROPS = {
  rack: RACK,
  mutationToken: 0,
  onRepositoryMutated: vi.fn(),
  onNavigateToRackPlacement: () => false as boolean,
  initialNavigation: null,
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function renderWithDetail() {
  mockGetRackDetail.mockResolvedValue(DETAIL);
  mockListDevices.mockResolvedValue([]);
  mockListDeviceModels.mockResolvedValue([]);

  render(<RackDetailPanel {...BASE_PROPS} />);
  // Wait for detail to load so export buttons appear
  await waitFor(() => expect(screen.getByTestId("export-svg-btn")).toBeTruthy());
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("RackDetailPanel — Export SVG button", () => {
  it("renders Export SVG button after rack detail loads", async () => {
    await renderWithDetail();
    expect(screen.getByTestId("export-svg-btn")).toBeTruthy();
  });

  it("Export SVG button does not render before rack detail is loaded", () => {
    mockGetRackDetail.mockReturnValue(new Promise(() => {})); // never resolves
    mockListDevices.mockResolvedValue([]);
    mockListDeviceModels.mockResolvedValue([]);
    render(<RackDetailPanel {...BASE_PROPS} />);
    expect(screen.queryByTestId("export-svg-btn")).toBeNull();
  });

  it("clicking Export SVG calls saveRackViewSvgViaDialog", async () => {
    mockSaveRackViewSvgViaDialog.mockResolvedValue("saved");
    await renderWithDetail();
    fireEvent.click(screen.getByTestId("export-svg-btn"));
    await waitFor(() => expect(mockSaveRackViewSvgViaDialog).toHaveBeenCalledTimes(1));
  });

  it("SVG export passes SVG string (starts with <?xml) to saveRackViewSvgViaDialog", async () => {
    mockSaveRackViewSvgViaDialog.mockResolvedValue("saved");
    await renderWithDetail();
    fireEvent.click(screen.getByTestId("export-svg-btn"));
    await waitFor(() => expect(mockSaveRackViewSvgViaDialog).toHaveBeenCalled());
    const [svgContent] = mockSaveRackViewSvgViaDialog.mock.calls[0] as [string, string];
    expect(svgContent).toContain("<?xml");
    expect(svgContent).toContain("<svg");
  });

  it("SVG export uses front placements when activeSide is front (default)", async () => {
    mockSaveRackViewSvgViaDialog.mockResolvedValue("saved");
    await renderWithDetail();
    fireEvent.click(screen.getByTestId("export-svg-btn"));
    await waitFor(() => expect(mockSaveRackViewSvgViaDialog).toHaveBeenCalled());
    const [svgContent] = mockSaveRackViewSvgViaDialog.mock.calls[0] as [string, string];
    expect(svgContent).toContain("Web Server 01");
    expect(svgContent).not.toContain("Rear Device");
  });

  it("SVG export uses rear placements after switching to Rear side", async () => {
    mockSaveRackViewSvgViaDialog.mockResolvedValue("saved");
    await renderWithDetail();
    fireEvent.click(screen.getByTestId("rack-side-rear"));
    fireEvent.click(screen.getByTestId("export-svg-btn"));
    await waitFor(() => expect(mockSaveRackViewSvgViaDialog).toHaveBeenCalled());
    const [svgContent] = mockSaveRackViewSvgViaDialog.mock.calls[0] as [string, string];
    expect(svgContent).toContain("Rear Device");
    expect(svgContent).not.toContain("Web Server 01");
  });

  it("default filename contains rack code and active side", async () => {
    mockSaveRackViewSvgViaDialog.mockResolvedValue("saved");
    await renderWithDetail();
    fireEvent.click(screen.getByTestId("export-svg-btn"));
    await waitFor(() => expect(mockSaveRackViewSvgViaDialog).toHaveBeenCalled());
    const [, filename] = mockSaveRackViewSvgViaDialog.mock.calls[0] as [string, string];
    expect(filename).toMatch(/rack.*front.*\.svg$/i);
  });

  it("cancelling save dialog does not show error banner", async () => {
    mockSaveRackViewSvgViaDialog.mockResolvedValue("cancelled");
    await renderWithDetail();
    fireEvent.click(screen.getByTestId("export-svg-btn"));
    await waitFor(() => expect(mockSaveRackViewSvgViaDialog).toHaveBeenCalled());
    expect(screen.queryByTestId("export-error-banner")).toBeNull();
  });

  it("save error shows export error banner", async () => {
    mockSaveRackViewSvgViaDialog.mockRejectedValueOnce(new Error("disk full"));
    await renderWithDetail();
    fireEvent.click(screen.getByTestId("export-svg-btn"));
    await waitFor(() => expect(screen.getByTestId("export-error-banner")).toBeTruthy());
  });
});

describe("RackDetailPanel — Export PNG button", () => {
  it("renders Export PNG button after rack detail loads", async () => {
    await renderWithDetail();
    expect(screen.getByTestId("export-png-btn")).toBeTruthy();
  });

  it("clicking Export PNG calls rasterizeSvgToPng then saveRackViewPngViaDialog", async () => {
    mockRasterizeSvgToPng.mockResolvedValue([0x89, 0x50]);
    mockSaveRackViewPngViaDialog.mockResolvedValue("saved");
    await renderWithDetail();
    fireEvent.click(screen.getByTestId("export-png-btn"));
    await waitFor(() => expect(mockSaveRackViewPngViaDialog).toHaveBeenCalledTimes(1));
    expect(mockRasterizeSvgToPng).toHaveBeenCalledTimes(1);
  });

  it("cancelling PNG save dialog does not show error banner", async () => {
    mockRasterizeSvgToPng.mockResolvedValue([]);
    mockSaveRackViewPngViaDialog.mockResolvedValue("cancelled");
    await renderWithDetail();
    fireEvent.click(screen.getByTestId("export-png-btn"));
    await waitFor(() => expect(mockSaveRackViewPngViaDialog).toHaveBeenCalled());
    expect(screen.queryByTestId("export-error-banner")).toBeNull();
  });

  it("rasterization error shows export error banner", async () => {
    mockRasterizeSvgToPng.mockRejectedValueOnce(new Error("canvas unavailable"));
    await renderWithDetail();
    fireEvent.click(screen.getByTestId("export-png-btn"));
    await waitFor(() => expect(screen.getByTestId("export-error-banner")).toBeTruthy());
  });
});
