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
    expect((screen.getByTestId("field-code") as HTMLInputElement).value).toBe("");
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

  it("shows identifier required message when type/code/status are set but no name/serial/asset", () => {
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
    fireEvent.change(screen.getByTestId("field-code"), {
      target: { value: "srv-test" },
    });
    // status defaults to "planned", so it's set
    expect(
      screen.getByText(/at least one of name, serial number, or asset tag/i),
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

  it("shows code format error for invalid code", () => {
    render(
      <DeviceFormModal
        open
        editing={null}
        models={MODELS}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByTestId("field-code"), {
      target: { value: "INVALID CODE!" },
    });
    expect(screen.getByText(/lowercase letters/i)).toBeTruthy();
  });

  it("calls addDevice, onSaved with new device ID, and onClose on valid submit", async () => {
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
    fireEvent.change(screen.getByTestId("field-code"), {
      target: { value: "srv-test-01" },
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
          code: "srv-test-01",
          name: "Test Server",
          status: "planned",
        }),
      );
      // Add mode: onSaved receives the new device ID returned by addDevice
      expect(onSaved).toHaveBeenCalledWith("new-dev-id");
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  it("filters device models by selected device type", () => {
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
    const modelSelect = screen.getByTestId(
      "field-device-model",
    ) as HTMLSelectElement;
    const optionValues = Array.from(modelSelect.options).map((o) => o.value);
    // Only server model should appear (plus the empty option)
    expect(optionValues).toContain("model-srv");
    expect(optionValues).not.toContain("model-net");
  });

  it("clears device model when device type changes to incompatible type", () => {
    render(
      <DeviceFormModal
        open
        editing={null}
        models={MODELS}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    // Select server type and pick a server model
    fireEvent.change(screen.getByTestId("field-device-type"), {
      target: { value: "server" },
    });
    fireEvent.change(screen.getByTestId("field-device-model"), {
      target: { value: "model-srv" },
    });
    expect(
      (screen.getByTestId("field-device-model") as HTMLSelectElement).value,
    ).toBe("model-srv");

    // Switch to network type — server model should be cleared
    fireEvent.change(screen.getByTestId("field-device-type"), {
      target: { value: "network" },
    });
    expect(
      (screen.getByTestId("field-device-model") as HTMLSelectElement).value,
    ).toBe("");
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
    expect((screen.getByTestId("field-code") as HTMLInputElement).value).toBe(
      "srv-prod-01",
    );
    expect((screen.getByTestId("field-name") as HTMLInputElement).value).toBe(
      "Production Web Server",
    );
    expect(
      (screen.getByTestId("field-serial") as HTMLInputElement).value,
    ).toBe("SN123456");
  });

  it("disables code field in edit mode", () => {
    render(
      <DeviceFormModal
        open
        editing={FIXTURE_DEVICE}
        models={MODELS}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    expect(
      (screen.getByTestId("field-code") as HTMLInputElement).disabled,
    ).toBe(true);
  });

  it("calls updateDevice, onSaved without ID, and onClose on valid edit", async () => {
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
          code: "srv-prod-01",
          name: "Renamed Server",
          status: "installed",
        }),
      );
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
    expect((screen.getByTestId("field-code") as HTMLInputElement).value).toBe(
      "net-sw-01",
    );
    expect((screen.getByTestId("field-name") as HTMLInputElement).value).toBe(
      "Core Switch",
    );
    expect(
      (screen.getByTestId("field-serial") as HTMLInputElement).value,
    ).toBe("");
  });
});
