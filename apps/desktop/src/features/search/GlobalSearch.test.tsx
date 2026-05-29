// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { GlobalSearch } from "./GlobalSearch";
import type { SearchResultDto } from "../../api/tauriClient";

const mockSearchRepository = vi.hoisted(() => vi.fn());

vi.mock("../../api/tauriClient", () => ({
  searchRepository: mockSearchRepository,
}));

function makeResult(overrides: Partial<SearchResultDto> & { kind: SearchResultDto["kind"] }): SearchResultDto {
  return {
    id: "id-1",
    code: "some-internal-code",
    label: "Display Name",
    detail: null,
    score: 0,
    navigation: {
      location_id: null,
      rack_id: null,
      device_id: null,
      device_model_id: null,
      placement_id: null,
    },
    ...overrides,
  };
}

const BASE_PROPS = {
  onNavigate: vi.fn(),
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ── Basic rendering ────────────────────────────────────────────────────────────

describe("GlobalSearch — basic rendering", () => {
  it("renders the search input", () => {
    render(<GlobalSearch {...BASE_PROPS} />);
    expect(screen.getByRole("combobox", { name: "Global search" })).toBeTruthy();
  });

  it("shows no dropdown before typing", () => {
    render(<GlobalSearch {...BASE_PROPS} />);
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});

// ── Code-leakage regression ────────────────────────────────────────────────────

describe("GlobalSearch — code leakage regression", () => {
  it("does not render device code in the dropdown when device has a name", async () => {
    mockSearchRepository.mockResolvedValue([
      makeResult({
        kind: "device",
        id: "dev-1",
        code: "device-secret-code-123",
        label: "Web Server 01",
        detail: "SN-ABCD",
      }),
    ]);

    render(<GlobalSearch {...BASE_PROPS} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "we" } });

    await waitFor(() => expect(screen.getByRole("listbox")).toBeTruthy());

    expect(screen.queryByText("device-secret-code-123")).toBeNull();
    expect(screen.getByText("Web Server 01")).toBeTruthy();
  });

  it("shows 'Unnamed device' in dropdown when device label has neutral fallback", async () => {
    mockSearchRepository.mockResolvedValue([
      makeResult({
        kind: "device",
        id: "dev-2",
        code: "device-secret-code-123",
        label: "Unnamed device",
        detail: null,
      }),
    ]);

    render(<GlobalSearch {...BASE_PROPS} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "un" } });

    await waitFor(() => expect(screen.getByRole("listbox")).toBeTruthy());

    expect(screen.queryByText("device-secret-code-123")).toBeNull();
    expect(screen.getByText("Unnamed device")).toBeTruthy();
  });

  it("does not render rack code in the dropdown", async () => {
    mockSearchRepository.mockResolvedValue([
      makeResult({
        kind: "rack",
        id: "rack-1",
        code: "rack-secret-code-789",
        label: "Production Rack A01",
        detail: "42U @ Warsaw A",
      }),
    ]);

    render(<GlobalSearch {...BASE_PROPS} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "pr" } });

    await waitFor(() => expect(screen.getByRole("listbox")).toBeTruthy());

    expect(screen.queryByText("rack-secret-code-789")).toBeNull();
    expect(screen.getByText("Production Rack A01")).toBeTruthy();
  });

  it("shows 'Unnamed rack' fallback and no rack code in dropdown", async () => {
    mockSearchRepository.mockResolvedValue([
      makeResult({
        kind: "rack",
        id: "rack-2",
        code: "rack-secret-code-789",
        label: "Unnamed rack",
        detail: "42U @ Warsaw A",
      }),
    ]);

    render(<GlobalSearch {...BASE_PROPS} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "un" } });

    await waitFor(() => expect(screen.getByRole("listbox")).toBeTruthy());

    expect(screen.queryByText("rack-secret-code-789")).toBeNull();
    expect(screen.getByText("Unnamed rack")).toBeTruthy();
  });

  it("does not render location code in the dropdown", async () => {
    mockSearchRepository.mockResolvedValue([
      makeResult({
        kind: "location",
        id: "loc-1",
        code: "location-secret-code-999",
        label: "Warsaw Datacenter A",
        detail: "Warsaw, Poland",
      }),
    ]);

    render(<GlobalSearch {...BASE_PROPS} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "wa" } });

    await waitFor(() => expect(screen.getByRole("listbox")).toBeTruthy());

    expect(screen.queryByText("location-secret-code-999")).toBeNull();
    expect(screen.getByText("Warsaw Datacenter A")).toBeTruthy();
  });

  it("does not render model code in the dropdown", async () => {
    mockSearchRepository.mockResolvedValue([
      makeResult({
        kind: "device_model",
        id: "model-1",
        code: "model-secret-code-456",
        label: "PowerEdge R750",
        detail: "Dell",
      }),
    ]);

    render(<GlobalSearch {...BASE_PROPS} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "po" } });

    await waitFor(() => expect(screen.getByRole("listbox")).toBeTruthy());

    expect(screen.queryByText("model-secret-code-456")).toBeNull();
    expect(screen.getByText("PowerEdge R750")).toBeTruthy();
  });

  it("does not render placement code in the dropdown", async () => {
    mockSearchRepository.mockResolvedValue([
      makeResult({
        kind: "placement",
        id: "plc-1",
        code: "plc-secret-code-xyz",
        label: "Production Server",
        detail: "Rack A01, front, U10",
      }),
    ]);

    render(<GlobalSearch {...BASE_PROPS} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "pr" } });

    await waitFor(() => expect(screen.getByRole("listbox")).toBeTruthy());

    expect(screen.queryByText("plc-secret-code-xyz")).toBeNull();
    expect(screen.getByText("Production Server")).toBeTruthy();
  });

  it("detail text does not contain location code when present", async () => {
    mockSearchRepository.mockResolvedValue([
      makeResult({
        kind: "rack",
        id: "rack-3",
        code: "rack-secret-code-789",
        label: "Rack B01",
        detail: "42U @ Warsaw A",
      }),
    ]);

    render(<GlobalSearch {...BASE_PROPS} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "ra" } });

    await waitFor(() => expect(screen.getByRole("listbox")).toBeTruthy());

    const listbox = screen.getByRole("listbox");
    expect(listbox.textContent).not.toContain("rack-secret-code-789");
    expect(listbox.textContent).not.toContain("location-secret-code-999");
    expect(listbox.textContent).toContain("42U @ Warsaw A");
  });
});

// ── Navigation ─────────────────────────────────────────────────────────────────

describe("GlobalSearch — navigation on select", () => {
  it("calls onNavigate with device tab when device result is clicked", async () => {
    const onNavigate = vi.fn();
    mockSearchRepository.mockResolvedValue([
      makeResult({
        kind: "device",
        id: "dev-nav",
        code: "device-secret-code-123",
        label: "App Server",
        navigation: { location_id: null, rack_id: null, device_id: "dev-nav", device_model_id: null, placement_id: null },
      }),
    ]);

    render(<GlobalSearch onNavigate={onNavigate} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "ap" } });

    await waitFor(() => expect(screen.getByRole("listbox")).toBeTruthy());

    fireEvent.mouseDown(screen.getByText("App Server"));

    expect(onNavigate).toHaveBeenCalledWith(
      expect.objectContaining({ tab: "devices", deviceId: "dev-nav" }),
    );
  });
});
