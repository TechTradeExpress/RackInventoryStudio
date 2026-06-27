// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { DeviceFormModal } from "./DeviceFormModal";
import type { DeviceDto, DeviceModelDto } from "../../api/tauriClient";

vi.mock("../../api/tauriClient", () => ({
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

import { addDevice, updateDevice } from "../../api/tauriClient";

const mockAdd = vi.mocked(addDevice);
const mockUpdate = vi.mocked(updateDevice);

const MODELS: DeviceModelDto[] = [
  {
    id: "model-srv",
    code: "dell-r750",
    device_type: "server",
    name: "PowerEdge R750",
    vendor: "Dell",
    model_number: null,
    default_height_u: 2,
    description: null,
    tags: [],
  },
  {
    id: "model-net",
    code: "cisco-c9300",
    device_type: "network",
    name: "Catalyst 9300",
    vendor: "Cisco",
    model_number: null,
    default_height_u: 1,
    description: null,
    tags: [],
  },
];

const FIXTURE_DEVICE: DeviceDto = {
  id: "dev-1",
  code: "srv-prod-01",
  device_type: "server",
  name: "Production Web Server",
  serial_number: "SN123456",
  asset_tag: "AT-001",
  external_ref: "CMDB-999",
  status: "installed",
  device_model_code: "dell-r750",
  device_model_id: "model-srv",
  is_placed: true,
  description: "Main web server",
  tags: ["production"],
};

beforeEach(() => {
  document.body.innerHTML = "";
  mockAdd.mockResolvedValue("new-dev-id");
  mockUpdate.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("DeviceFormModal — closed", () => {
  it("does not render when open=false", () => {
    render(
      <DeviceFormModal
        open={false}
        editing={null}
        models={MODELS}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("DeviceFormModal — add mode", () => {
  it("shows Add device title and empty fields", () => {
    render(
      <DeviceFormModal
        open
        editing={null}
        models={MODELS}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.getByText("Add device")).toBeTruthy();
    expect((screen.getByTestId("field-name") as HTMLInputElement).value).toBe("");
  });

  it("shows required footer message when fields are empty", () => {
    render(
      <DeviceFormModal
        open
        editing={null}
        models={MODELS}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.getByText(/Required:/)).toBeTruthy();
  });

  it("Create device button is disabled when required fields are empty", () => {
    render(
      <DeviceFormModal
        open
        editing={null}
        models={MODELS}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    const btn = screen.getByText("Create device") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("shows identifier required message when type and status are set but no name/serial/asset", () => {
    render(
      <DeviceFormModal
        open
        editing={null}
        models={MODELS}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByTestId("field-device-type"), {
      target: { value: "server" },
    });
    // status defaults to "planned", so it's set
    expect(
      screen.getByText(/at least one of name, serial number, asset tag, or external reference/i),
    ).toBeTruthy();
  });

  it("calls onClose when Cancel is clicked", () => {
    const onClose = vi.fn();
    render(
      <DeviceFormModal
        open
        editing={null}
        models={MODELS}
        onClose={onClose}
        onSaved={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when Escape is pressed", () => {
    const onClose = vi.fn();
    render(
      <DeviceFormModal
        open
        editing={null}
        models={MODELS}
        onClose={onClose}
        onSaved={vi.fn()}
      />,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls addDevice without code, onSaved with new device ID, and onClose on valid submit", async () => {
    const onClose = vi.fn();
    const onSaved = vi.fn();
    render(
      <DeviceFormModal
        open
        editing={null}
        models={MODELS}
        onClose={onClose}
        onSaved={onSaved}
      />,
    );

    fireEvent.change(screen.getByTestId("field-device-type"), {
      target: { value: "server" },
    });
    // status already "planned"
    fireEvent.change(screen.getByTestId("field-name"), {
      target: { value: "Test Server" },
    });

    fireEvent.click(screen.getByText("Create device"));

    await waitFor(() => {
      expect(mockAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          device_type: "server",
          name: "Test Server",
          status: "planned",
        }),
      );
      const call = mockAdd.mock.calls[0][0];
      expect(call).not.toHaveProperty("code");
      // Add mode: onSaved receives the new device ID returned by addDevice
      expect(onSaved).toHaveBeenCalledWith("new-dev-id");
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  it("allows creating a device with only external_ref as identifier", async () => {
    const onClose = vi.fn();
    const onSaved = vi.fn();
    render(
      <DeviceFormModal
        open
        editing={null}
        models={MODELS}
        onClose={onClose}
        onSaved={onSaved}
      />,
    );

    fireEvent.change(screen.getByTestId("field-device-type"), {
      target: { value: "server" },
    });
    // Fill only external_ref — name, serial, asset_tag all blank
    fireEvent.change(
      screen.getByPlaceholderText("optional — CMDB ID, ticket, URL"),
      { target: { value: "CMDB-42" } },
    );

    const btn = screen.getByText("Create device") as HTMLButtonElement;
    expect(btn.disabled).toBe(false);

    fireEvent.click(btn);

    await waitFor(() => {
      expect(mockAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          device_type: "server",
          external_ref: "CMDB-42",
        }),
      );
      const call = mockAdd.mock.calls[0][0];
      expect(call.name).toBeUndefined();
      expect(call.serial_number).toBeUndefined();
      expect(call.asset_tag).toBeUndefined();
      expect(onSaved).toHaveBeenCalledWith("new-dev-id");
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  it("filters device models by selected device type", async () => {
    render(
      <DeviceFormModal
        open
        editing={null}
        models={MODELS}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByTestId("field-device-type"), {
      target: { value: "server" },
    });

    // Open the model searchable-select dropdown
    fireEvent.click(screen.getByTestId("field-device-model-trigger"));

    // Only the server model should appear in the dropdown
    await waitFor(() => {
      expect(screen.getByText("PowerEdge R750")).toBeTruthy();
      expect(screen.queryByText("Catalyst 9300")).toBeNull();
    });
  });

  it("clears device model when device type changes to incompatible type", async () => {
    render(
      <DeviceFormModal
        open
        editing={null}
        models={MODELS}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    // Select server type, then pick server model via searchable-select
    fireEvent.change(screen.getByTestId("field-device-type"), {
      target: { value: "server" },
    });
    fireEvent.click(screen.getByTestId("field-device-model-trigger"));
    await waitFor(() => screen.getByText("PowerEdge R750"));
    fireEvent.mouseDown(screen.getByText("PowerEdge R750").closest(".ss-option")!);

    // Trigger should show the selected model
    await waitFor(() => {
      expect(screen.getByTestId("field-device-model-trigger").textContent).toContain(
        "PowerEdge R750",
      );
    });

    // Switch to network type — server model should be cleared
    fireEvent.change(screen.getByTestId("field-device-type"), {
      target: { value: "network" },
    });

    // Trigger should no longer show the server model
    await waitFor(() => {
      expect(screen.getByTestId("field-device-model-trigger").textContent).not.toContain(
        "PowerEdge R750",
      );
    });
  });

  it("selecting a model via searchable-select is included in the save payload", async () => {
    const onSaved = vi.fn();
    const onClose = vi.fn();
    render(
      <DeviceFormModal
        open
        editing={null}
        models={MODELS}
        onClose={onClose}
        onSaved={onSaved}
      />,
    );

    fireEvent.change(screen.getByTestId("field-device-type"), {
      target: { value: "server" },
    });
    fireEvent.change(screen.getByTestId("field-name"), {
      target: { value: "Test Server" },
    });

    // Pick a model from the searchable select
    fireEvent.click(screen.getByTestId("field-device-model-trigger"));
    await waitFor(() => screen.getByText("PowerEdge R750"));
    fireEvent.mouseDown(screen.getByText("PowerEdge R750").closest(".ss-option")!);

    fireEvent.click(screen.getByText("Create device"));

    await waitFor(() => {
      expect(mockAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          device_type: "server",
          name: "Test Server",
          device_model_id: "model-srv",
        }),
      );
    });
  });
});

describe("DeviceFormModal — edit mode", () => {
  it("shows Edit device title and pre-populated fields", () => {
    render(
      <DeviceFormModal
        open
        editing={FIXTURE_DEVICE}
        models={MODELS}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.getByText("Edit device")).toBeTruthy();
    expect((screen.getByTestId("field-name") as HTMLInputElement).value).toBe(
      "Production Web Server",
    );
    expect(
      (screen.getByTestId("field-serial") as HTMLInputElement).value,
    ).toBe("SN123456");
  });

  it("shows the current device model in the searchable-select trigger", () => {
    render(
      <DeviceFormModal
        open
        editing={FIXTURE_DEVICE}
        models={MODELS}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    // FIXTURE_DEVICE has device_model_id: "model-srv" → name "PowerEdge R750"
    expect(
      screen.getByTestId("field-device-model-trigger").textContent,
    ).toContain("PowerEdge R750");
  });

  it("calls updateDevice without code, onSaved without ID, and onClose on valid edit", async () => {
    const onClose = vi.fn();
    const onSaved = vi.fn();
    render(
      <DeviceFormModal
        open
        editing={FIXTURE_DEVICE}
        models={MODELS}
        onClose={onClose}
        onSaved={onSaved}
      />,
    );

    fireEvent.change(screen.getByTestId("field-name"), {
      target: { value: "Renamed Server" },
    });
    fireEvent.click(screen.getByText("Save changes"));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "dev-1",
          name: "Renamed Server",
          status: "installed",
        }),
      );
      const call = mockUpdate.mock.calls[0][0];
      expect(call).not.toHaveProperty("code");
      // Edit mode: onSaved receives no device ID (undefined)
      expect(onSaved).toHaveBeenCalledWith(/* no argument */);
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  it("resets form when reopened with a different device", () => {
    const { rerender } = render(
      <DeviceFormModal
        open
        editing={FIXTURE_DEVICE}
        models={MODELS}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    const other: DeviceDto = {
      ...FIXTURE_DEVICE,
      id: "dev-2",
      code: "net-sw-01",
      name: "Core Switch",
      device_type: "network",
      status: "in_stock",
      serial_number: null,
    };
    rerender(
      <DeviceFormModal
        open
        editing={other}
        models={MODELS}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    expect((screen.getByTestId("field-name") as HTMLInputElement).value).toBe(
      "Core Switch",
    );
    expect(
      (screen.getByTestId("field-serial") as HTMLInputElement).value,
    ).toBe("");
  });
});
