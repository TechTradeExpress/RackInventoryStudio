import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { PlacePlacementModal } from "./PlacePlacementModal";
import type { DeviceDto, DeviceModelDto, RackSummaryDto } from "../../api/tauriClient";

// Mock busy context — runBusy just calls the fn directly
vi.mock("../../lib/appBusy", () => ({
  useBusy: () => ({
    isBusy: false,
    label: "",
    runBusy: <T,>(_label: string, fn: () => Promise<T>) => fn(),
  }),
}));

vi.mock("../../api/tauriClient", () => ({
  placeDevice: vi.fn(),
  placeRackObject: vi.fn(),
  addDevice: vi.fn(),
  addDeviceModel: vi.fn(),
  updateDevice: vi.fn(),
  updateDeviceModel: vi.fn(),
  listDevices: vi.fn(),
  listDeviceModels: vi.fn(),
}));

import {
  placeDevice,
  placeRackObject,
  addDevice,
  addDeviceModel,
  listDevices,
  listDeviceModels,
} from "../../api/tauriClient";
const mockPlaceDevice = vi.mocked(placeDevice);
const mockPlaceRackObject = vi.mocked(placeRackObject);
const mockAddDevice = vi.mocked(addDevice);
const mockAddDeviceModel = vi.mocked(addDeviceModel);
const mockListDevices = vi.mocked(listDevices);
const mockListDeviceModels = vi.mocked(listDeviceModels);

const FIXTURE_RACK: RackSummaryDto = {
  id: "rack-1",
  code: "rack-a01",
  name: "Rack A01",
  location_id: "loc-1",
  location_code: "datacenter-a",
  height_u: 42,
  row: "A",
  description: null,
  tags: [],
  front_placement_count: 0,
  rear_placement_count: 0,
  placement_count: 0,
  front_used_u: 0,
  rear_used_u: 0,
};

const DEVICE_1: DeviceDto = {
  id: "dev-1",
  code: "srv-01",
  device_type: "server",
  name: "Server 01",
  serial_number: "SRV001",
  asset_tag: null,
  external_ref: null,
  status: "installed",
  device_model_code: "srv-model",
  device_model_id: "model-1",
  is_placed: false,
  description: null,
  tags: [],
};

const RACK_OBJ_1: DeviceModelDto = {
  id: "model-2",
  code: "blank-1u",
  device_type: "rack_object",
  name: "Blank 1U",
  vendor: null,
  model_number: null,
  default_height_u: 1,
  description: null,
  tags: [],
};

const BASE_PROPS = {
  open: true,
  rack: FIXTURE_RACK,
  side: "front" as const,
  startU: 5,
  availableDevices: [DEVICE_1],
  availableRackObjects: [RACK_OBJ_1],
  onClose: vi.fn(),
  onPlaced: vi.fn(),
};

const CREATED_DEVICE_ID = "newly-created-device-id";
const CREATED_MODEL_ID = "newly-created-model-id";

const CREATED_DEVICE: import("../../api/tauriClient").DeviceDto = {
  id: CREATED_DEVICE_ID,
  code: "srv-new-01",
  device_type: "server",
  name: "New Server",
  serial_number: null,
  asset_tag: null,
  external_ref: null,
  status: "planned",
  device_model_code: null,
  device_model_id: null,
  is_placed: false,
  description: null,
  tags: [],
};

const CREATED_RACK_OBJ: import("../../api/tauriClient").DeviceModelDto = {
  id: CREATED_MODEL_ID,
  code: "new-rack-obj-01",
  device_type: "rack_object",
  name: "New Rack Object",
  vendor: null,
  model_number: null,
  default_height_u: 1,
  description: null,
  tags: [],
};

beforeEach(() => {
  document.body.innerHTML = "";
  mockPlaceDevice.mockResolvedValue("new-placement-id");
  mockPlaceRackObject.mockResolvedValue("new-rack-obj-placement-id");
  mockAddDevice.mockResolvedValue(CREATED_DEVICE_ID);
  mockAddDeviceModel.mockResolvedValue(CREATED_MODEL_ID);
  mockListDevices.mockResolvedValue([DEVICE_1, CREATED_DEVICE]);
  mockListDeviceModels.mockResolvedValue([RACK_OBJ_1, CREATED_RACK_OBJ]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PlacePlacementModal — closed", () => {
  it("does not render when open=false", () => {
    render(<PlacePlacementModal {...BASE_PROPS} open={false} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("PlacePlacementModal — open", () => {
  it("renders with rack/side/startU context in subtitle", () => {
    render(<PlacePlacementModal {...BASE_PROPS} />);
    expect(screen.getByText("Place equipment")).toBeTruthy();
    // subtitle shows rack name, not rack code
    expect(screen.getByText(/Rack A01/)).toBeTruthy();
    expect(screen.getByText(/Front/)).toBeTruthy();
    // rack code must not appear in subtitle
    expect(screen.queryByText(/rack-a01/)).toBeNull();
  });

  it("pre-fills start U from prop", () => {
    render(<PlacePlacementModal {...BASE_PROPS} startU={10} />);
    const input = screen.getByTestId("start-u-input") as HTMLInputElement;
    expect(input.value).toBe("10");
  });

  it("start U is empty when startU prop is null", () => {
    render(<PlacePlacementModal {...BASE_PROPS} startU={null} />);
    const input = screen.getByTestId("start-u-input") as HTMLInputElement;
    expect(input.value).toBe("");
  });

  it("Place button is disabled when no device is selected", () => {
    render(<PlacePlacementModal {...BASE_PROPS} />);
    const btn = screen.getByTestId("place-btn") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("Place button is enabled after selecting a device", () => {
    render(<PlacePlacementModal {...BASE_PROPS} />);
    fireEvent.change(screen.getByTestId("device-select"), {
      target: { value: "dev-1" },
    });
    const btn = screen.getByTestId("place-btn") as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it("calls placeDevice with correct payload on valid submit", async () => {
    const onPlaced = vi.fn();
    const onClose = vi.fn();
    render(
      <PlacePlacementModal {...BASE_PROPS} onPlaced={onPlaced} onClose={onClose} />,
    );

    fireEvent.change(screen.getByTestId("device-select"), {
      target: { value: "dev-1" },
    });
    fireEvent.click(screen.getByTestId("place-btn"));

    await waitFor(() => {
      expect(mockPlaceDevice).toHaveBeenCalledWith({
        rack_id: "rack-1",
        device_id: "dev-1",
        side: "front",
        start_u: 5,
        height_u: null,
      });
      expect(onPlaced).toHaveBeenCalledWith("new-placement-id");
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  it("calls placeRackObject when rack object type is selected", async () => {
    const onPlaced = vi.fn();
    render(<PlacePlacementModal {...BASE_PROPS} onPlaced={onPlaced} />);

    // Switch to rack_object mode
    fireEvent.click(screen.getByDisplayValue("rack_object") ?? screen.getAllByRole("radio")[1]);
    fireEvent.change(screen.getByTestId("rack-object-select"), {
      target: { value: "model-2" },
    });
    fireEvent.click(screen.getByTestId("place-btn"));

    await waitFor(() => {
      expect(mockPlaceRackObject).toHaveBeenCalledWith(
        expect.objectContaining({
          rack_id: "rack-1",
          device_model_id: "model-2",
          side: "front",
          start_u: 5,
        }),
      );
      expect(onPlaced).toHaveBeenCalledWith("new-rack-obj-placement-id");
    });
  });

  it("shows error message in footer when backend rejects", async () => {
    mockPlaceDevice.mockRejectedValueOnce(new Error("U slot occupied"));
    render(<PlacePlacementModal {...BASE_PROPS} />);

    fireEvent.change(screen.getByTestId("device-select"), {
      target: { value: "dev-1" },
    });
    fireEvent.click(screen.getByTestId("place-btn"));

    await waitFor(() => {
      expect(screen.getByText(/U slot occupied/)).toBeTruthy();
    });
  });

  it("shows validation error when start U is missing", async () => {
    render(<PlacePlacementModal {...BASE_PROPS} startU={null} />);

    fireEvent.change(screen.getByTestId("device-select"), {
      target: { value: "dev-1" },
    });
    // Place btn disabled when no startU, manually trigger via form validation
    const btn = screen.getByTestId("place-btn") as HTMLButtonElement;
    // Enable by typing a bad value then clicking
    fireEvent.change(screen.getByTestId("start-u-input"), {
      target: { value: "" },
    });
    // Simulate click even though disabled — implementation prevents submit via validate()
    // Instead verify the button is disabled (no device selected implies no submit)
    expect(btn.disabled).toBe(false); // device is selected
    fireEvent.click(btn);

    await waitFor(() => {
      expect(screen.getByText(/Start U must be a positive integer/)).toBeTruthy();
    });
    expect(mockPlaceDevice).not.toHaveBeenCalled();
  });

  it("calls onClose when Cancel is clicked", () => {
    const onClose = vi.fn();
    render(<PlacePlacementModal {...BASE_PROPS} onClose={onClose} />);
    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("PlacePlacementModal — DnD drop prefill", () => {
  it("device kind+id+startU prefilled via DnD → Place button enabled", () => {
    render(
      <PlacePlacementModal
        {...BASE_PROPS}
        initialTargetKind="device"
        initialTargetId="dev-1"
        startU={7}
      />,
    );
    const startUInput = screen.getByTestId("start-u-input") as HTMLInputElement;
    expect(startUInput.value).toBe("7");
    const select = screen.getByTestId("device-select") as HTMLSelectElement;
    expect(select.value).toBe("dev-1");
    const btn = screen.getByTestId("place-btn") as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it("rack_object kind+id+startU prefilled via DnD → Place button enabled", () => {
    render(
      <PlacePlacementModal
        {...BASE_PROPS}
        initialTargetKind="rack_object"
        initialTargetId="model-2"
        startU={3}
      />,
    );
    const startUInput = screen.getByTestId("start-u-input") as HTMLInputElement;
    expect(startUInput.value).toBe("3");
    const select = screen.getByTestId("rack-object-select") as HTMLSelectElement;
    expect(select.value).toBe("model-2");
    const btn = screen.getByTestId("place-btn") as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });
});

describe("PlacePlacementModal — Create new device flow", () => {
  it("shows 'Create new device…' button only in Device mode", () => {
    render(<PlacePlacementModal {...BASE_PROPS} />);
    // Device mode (default) — button visible
    expect(screen.getByTestId("create-device-btn")).toBeTruthy();
    // Switch to rack_object mode — button not rendered
    fireEvent.click(screen.getByDisplayValue("rack_object") ?? screen.getAllByRole("radio")[1]);
    expect(screen.queryByTestId("create-device-btn")).toBeNull();
  });

  it("clicking 'Create new device…' opens the DeviceFormModal", async () => {
    render(<PlacePlacementModal {...BASE_PROPS} />);
    fireEvent.click(screen.getByTestId("create-device-btn"));
    await waitFor(() => {
      // DeviceFormModal renders an "Add device" dialog
      expect(screen.getByText("Add device")).toBeTruthy();
    });
  });

  it("canceling DeviceFormModal returns to unchanged Place equipment modal", async () => {
    render(<PlacePlacementModal {...BASE_PROPS} startU={7} />);
    // Open device form
    fireEvent.click(screen.getByTestId("create-device-btn"));
    await waitFor(() => expect(screen.getByText("Add device")).toBeTruthy());

    // Cancel the device form (click its Cancel button)
    const cancelBtns = screen.getAllByText("Cancel");
    // The device form Cancel is the one inside its modal footer
    cancelBtns[cancelBtns.length - 1].click();

    // Device form closes, place modal still open with original state
    await waitFor(() => {
      expect(screen.queryByText("Add device")).toBeNull();
      expect(screen.getByText("Place equipment")).toBeTruthy();
    });
    // StartU preserved
    expect((screen.getByTestId("start-u-input") as HTMLInputElement).value).toBe("7");
    // Device selector still showing nothing (no device was created)
    expect((screen.getByTestId("device-select") as HTMLSelectElement).value).toBe("");
  });

  it("successful device creation refreshes devices and preselects new device", async () => {
    const onDeviceCreated = vi.fn();
    render(
      <PlacePlacementModal
        {...BASE_PROPS}
        startU={10}
        onDeviceCreated={onDeviceCreated}
      />,
    );

    // Open device form
    fireEvent.click(screen.getByTestId("create-device-btn"));
    await waitFor(() => expect(screen.getByText("Add device")).toBeTruthy());

    // Fill minimal device form fields
    fireEvent.change(screen.getByTestId("field-device-type"), {
      target: { value: "server" },
    });
    fireEvent.change(screen.getByTestId("field-name"), {
      target: { value: "New Server" },
    });
    // Save the device form
    fireEvent.click(screen.getByText("Create device"));

    await waitFor(() => {
      // Device form closes
      expect(screen.queryByText("Add device")).toBeNull();
      // Place modal still open
      expect(screen.getByText("Place equipment")).toBeTruthy();
    });

    // New device ID is preselected in device selector
    await waitFor(() => {
      const select = screen.getByTestId("device-select") as HTMLSelectElement;
      expect(select.value).toBe(CREATED_DEVICE_ID);
    });

    // Place button is enabled
    expect((screen.getByTestId("place-btn") as HTMLButtonElement).disabled).toBe(false);

    // Parent notified
    expect(onDeviceCreated).toHaveBeenCalledOnce();
  });

  it("startU and heightU are preserved after returning from device creation", async () => {
    render(<PlacePlacementModal {...BASE_PROPS} startU={12} />);

    // Set height override before opening device form
    fireEvent.change(screen.getByTestId("height-u-input"), {
      target: { value: "2" },
    });

    // Open and cancel device form
    fireEvent.click(screen.getByTestId("create-device-btn"));
    await waitFor(() => expect(screen.getByText("Add device")).toBeTruthy());
    const cancelBtns = screen.getAllByText("Cancel");
    cancelBtns[cancelBtns.length - 1].click();

    await waitFor(() => expect(screen.queryByText("Add device")).toBeNull());

    expect((screen.getByTestId("start-u-input") as HTMLInputElement).value).toBe("12");
    expect((screen.getByTestId("height-u-input") as HTMLInputElement).value).toBe("2");
  });

  it("Place button enabled after device creation and calls placeDevice with new device ID", async () => {
    const onPlaced = vi.fn();
    render(<PlacePlacementModal {...BASE_PROPS} startU={5} onPlaced={onPlaced} />);

    // Create device
    fireEvent.click(screen.getByTestId("create-device-btn"));
    await waitFor(() => expect(screen.getByText("Add device")).toBeTruthy());
    fireEvent.change(screen.getByTestId("field-device-type"), { target: { value: "server" } });
    fireEvent.change(screen.getByTestId("field-name"), { target: { value: "New Server" } });
    fireEvent.click(screen.getByText("Create device"));

    await waitFor(() => {
      expect(screen.queryByText("Add device")).toBeNull();
    });

    // Wait for device preselection
    await waitFor(() => {
      const select = screen.getByTestId("device-select") as HTMLSelectElement;
      expect(select.value).toBe(CREATED_DEVICE_ID);
    });

    // Click Place
    fireEvent.click(screen.getByTestId("place-btn"));

    await waitFor(() => {
      expect(mockPlaceDevice).toHaveBeenCalledWith(
        expect.objectContaining({
          rack_id: "rack-1",
          device_id: CREATED_DEVICE_ID,
          side: "front",
          start_u: 5,
        }),
      );
      expect(onPlaced).toHaveBeenCalledWith("new-placement-id");
    });
  });

  it("Rack Object mode is unaffected — no 'Create new device…' button", () => {
    render(
      <PlacePlacementModal
        {...BASE_PROPS}
        initialTargetKind="rack_object"
        initialTargetId="model-2"
      />,
    );
    expect(screen.queryByTestId("create-device-btn")).toBeNull();
    // Rack object selector is present
    expect(screen.getByTestId("rack-object-select")).toBeTruthy();
  });
});

describe("PlacePlacementModal — initialTargetKind / initialTargetId preselection", () => {
  it("preselects a device when opened with initialTargetKind='device' and initialTargetId", () => {
    render(
      <PlacePlacementModal
        {...BASE_PROPS}
        initialTargetKind="device"
        initialTargetId="dev-1"
      />,
    );
    const select = screen.getByTestId("device-select") as HTMLSelectElement;
    expect(select.value).toBe("dev-1");
    // Place button should be enabled since a device is selected
    const btn = screen.getByTestId("place-btn") as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it("preselects a rack object model when opened with initialTargetKind='rack_object' and initialTargetId", () => {
    render(
      <PlacePlacementModal
        {...BASE_PROPS}
        initialTargetKind="rack_object"
        initialTargetId="model-2"
      />,
    );
    const select = screen.getByTestId("rack-object-select") as HTMLSelectElement;
    expect(select.value).toBe("model-2");
    // Place button should be enabled since a model is selected
    const btn = screen.getByTestId("place-btn") as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });
});

describe("PlacePlacementModal — Create new rack object flow", () => {
  it("shows 'Create new rack object…' button only in Rack Object mode", () => {
    render(<PlacePlacementModal {...BASE_PROPS} />);
    // Device mode (default) — rack object create button not visible
    expect(screen.queryByTestId("create-rack-object-btn")).toBeNull();
    // Switch to rack_object mode
    fireEvent.click(screen.getAllByRole("radio")[1]);
    expect(screen.getByTestId("create-rack-object-btn")).toBeTruthy();
  });

  it("clicking 'Create new rack object…' opens the DeviceModelFormModal", async () => {
    render(<PlacePlacementModal {...BASE_PROPS} initialTargetKind="rack_object" />);
    fireEvent.click(screen.getByTestId("create-rack-object-btn"));
    await waitFor(() => {
      expect(screen.getByText("Add device model")).toBeTruthy();
    });
  });

  it("canceling DeviceModelFormModal returns to unchanged Place equipment modal", async () => {
    render(<PlacePlacementModal {...BASE_PROPS} initialTargetKind="rack_object" startU={7} />);
    fireEvent.click(screen.getByTestId("create-rack-object-btn"));
    await waitFor(() => expect(screen.getByText("Add device model")).toBeTruthy());

    const cancelBtns = screen.getAllByText("Cancel");
    cancelBtns[cancelBtns.length - 1].click();

    await waitFor(() => {
      expect(screen.queryByText("Add device model")).toBeNull();
      expect(screen.getByText("Place equipment")).toBeTruthy();
    });
    expect((screen.getByTestId("start-u-input") as HTMLInputElement).value).toBe("7");
    expect((screen.getByTestId("rack-object-select") as HTMLSelectElement).value).toBe("");
  });

  it("successful rack object creation refreshes list and preselects new model", async () => {
    const onRackObjectCreated = vi.fn();
    render(
      <PlacePlacementModal
        {...BASE_PROPS}
        initialTargetKind="rack_object"
        startU={3}
        onRackObjectCreated={onRackObjectCreated}
      />,
    );

    fireEvent.click(screen.getByTestId("create-rack-object-btn"));
    await waitFor(() => expect(screen.getByText("Add device model")).toBeTruthy());

    // Fill minimal form: device_type (rack_object), name, height
    fireEvent.change(screen.getByTestId("field-device-type"), { target: { value: "rack_object" } });
    fireEvent.change(screen.getByTestId("field-name"), { target: { value: "New Rack Object" } });
    fireEvent.change(screen.getByTestId("field-height-u"), { target: { value: "1" } });
    fireEvent.click(screen.getByText("Create model"));

    await waitFor(() => {
      expect(screen.queryByText("Add device model")).toBeNull();
      expect(screen.getByText("Place equipment")).toBeTruthy();
    });

    await waitFor(() => {
      const select = screen.getByTestId("rack-object-select") as HTMLSelectElement;
      expect(select.value).toBe(CREATED_MODEL_ID);
    });

    expect((screen.getByTestId("place-btn") as HTMLButtonElement).disabled).toBe(false);
    expect(onRackObjectCreated).toHaveBeenCalledOnce();
  });
});

describe("PlacePlacementModal — Edit device button", () => {
  it("shows 'Edit device…' button only when a device is selected", () => {
    render(<PlacePlacementModal {...BASE_PROPS} />);
    // No device selected — no edit button
    expect(screen.queryByTestId("edit-device-btn")).toBeNull();
    // Select a device
    fireEvent.change(screen.getByTestId("device-select"), { target: { value: "dev-1" } });
    expect(screen.getByTestId("edit-device-btn")).toBeTruthy();
  });

  it("clicking 'Edit device…' opens DeviceFormModal in edit mode", async () => {
    render(
      <PlacePlacementModal {...BASE_PROPS} initialTargetKind="device" initialTargetId="dev-1" />,
    );
    fireEvent.click(screen.getByTestId("edit-device-btn"));
    await waitFor(() => {
      expect(screen.getByText("Edit device")).toBeTruthy();
    });
  });

  it("after editing device, list refreshes and same device remains selected", async () => {
    render(
      <PlacePlacementModal {...BASE_PROPS} initialTargetKind="device" initialTargetId="dev-1" />,
    );
    fireEvent.click(screen.getByTestId("edit-device-btn"));
    await waitFor(() => expect(screen.getByText("Edit device")).toBeTruthy());

    // Save with no changes (form opens in edit mode, auto-filled)
    // Find and click Save changes
    const saveBtns = screen.getAllByText("Save changes");
    fireEvent.click(saveBtns[saveBtns.length - 1]);

    await waitFor(() => {
      expect(screen.queryByText("Edit device")).toBeNull();
      expect(screen.getByText("Place equipment")).toBeTruthy();
    });
    // Device still selected after edit
    const select = screen.getByTestId("device-select") as HTMLSelectElement;
    expect(select.value).toBe("dev-1");
  });
});

describe("PlacePlacementModal — Edit rack object button", () => {
  it("shows 'Edit rack object…' button only when a rack object model is selected", () => {
    render(<PlacePlacementModal {...BASE_PROPS} initialTargetKind="rack_object" />);
    // No model selected — no edit button
    expect(screen.queryByTestId("edit-rack-object-btn")).toBeNull();
    // Select a model
    fireEvent.change(screen.getByTestId("rack-object-select"), { target: { value: "model-2" } });
    expect(screen.getByTestId("edit-rack-object-btn")).toBeTruthy();
  });

  it("clicking 'Edit rack object…' opens DeviceModelFormModal in edit mode", async () => {
    render(
      <PlacePlacementModal
        {...BASE_PROPS}
        initialTargetKind="rack_object"
        initialTargetId="model-2"
      />,
    );
    fireEvent.click(screen.getByTestId("edit-rack-object-btn"));
    await waitFor(() => {
      expect(screen.getByText("Edit device model")).toBeTruthy();
    });
  });
});
