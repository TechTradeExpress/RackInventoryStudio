// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { DeviceModelFormModal } from "./DeviceModelFormModal";
import type { DeviceModelDto } from "../../api/tauriClient";

vi.mock("../../api/tauriClient", () => ({
  addDeviceModel: vi.fn(),
  updateDeviceModel: vi.fn(),
}));

import { addDeviceModel, updateDeviceModel } from "../../api/tauriClient";

const mockAdd = vi.mocked(addDeviceModel);
const mockUpdate = vi.mocked(updateDeviceModel);

const FIXTURE_MODEL: DeviceModelDto = {
  id: "model-1",
  code: "dell-r750",
  device_type: "server",
  name: "PowerEdge R750",
  vendor: "Dell",
  model_number: "R750-001",
  default_height_u: 2,
  description: "2U rack server",
  tags: ["production"],
};

beforeEach(() => {
  document.body.innerHTML = "";
  mockAdd.mockResolvedValue("new-model-id");
  mockUpdate.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("DeviceModelFormModal — closed", () => {
  it("does not render when open=false", () => {
    render(
      <DeviceModelFormModal
        open={false}
        editing={null}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("DeviceModelFormModal — add mode", () => {
  it("shows Add device model title and empty fields", () => {
    render(
      <DeviceModelFormModal
        open
        editing={null}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.getByText("Add device model")).toBeTruthy();
    expect((screen.getByTestId("field-name") as HTMLInputElement).value).toBe("");
    expect((screen.getByTestId("field-height-u") as HTMLInputElement).value).toBe("");
  });

  it("shows required footer message when fields are empty", () => {
    render(
      <DeviceModelFormModal
        open
        editing={null}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.getByText(/Required:/)).toBeTruthy();
  });

  it("Create model button is disabled when required fields are empty", () => {
    render(
      <DeviceModelFormModal
        open
        editing={null}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    const btn = screen.getByText("Create model") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("calls onClose when Cancel is clicked", () => {
    const onClose = vi.fn();
    render(
      <DeviceModelFormModal
        open
        editing={null}
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
      <DeviceModelFormModal
        open
        editing={null}
        onClose={onClose}
        onSaved={vi.fn()}
      />,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('shows "Manufacturer model / SKU" label instead of "Model number"', () => {
    render(
      <DeviceModelFormModal
        open
        editing={null}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.getByText("Manufacturer model / SKU")).toBeTruthy();
    expect(screen.queryByText("Model number")).toBeNull();
  });

  it("shows vendor/SKU help text for the model field", () => {
    render(
      <DeviceModelFormModal
        open
        editing={null}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.getByText(/Vendor or catalog model identifier/i)).toBeTruthy();
  });

  it("calls addDeviceModel without code, onSaved, onClose on valid submit", async () => {
    const onClose = vi.fn();
    const onSaved = vi.fn();
    render(
      <DeviceModelFormModal
        open
        editing={null}
        onClose={onClose}
        onSaved={onSaved}
      />,
    );

    fireEvent.change(screen.getByTestId("field-device-type"), {
      target: { value: "server" },
    });
    fireEvent.change(screen.getByTestId("field-name"), {
      target: { value: "ProLiant DL380" },
    });
    fireEvent.change(screen.getByTestId("field-height-u"), {
      target: { value: "2" },
    });

    fireEvent.click(screen.getByText("Create model"));

    await waitFor(() => {
      expect(mockAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          device_type: "server",
          name: "ProLiant DL380",
          default_height_u: 2,
        }),
      );
      const call = mockAdd.mock.calls[0][0];
      expect(call).not.toHaveProperty("code");
      expect(onSaved).toHaveBeenCalledOnce();
      expect(onClose).toHaveBeenCalledOnce();
    });
  });
});

describe("DeviceModelFormModal — locked rack object mode", () => {
  it("shows 'Create rack object' as title and submit label", () => {
    render(
      <DeviceModelFormModal
        open
        editing={null}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        forcedDeviceType="rack_object"
        lockDeviceType
      />,
    );
    // Both the modal title div and the submit button contain this text
    expect(screen.getAllByText("Create rack object").length).toBeGreaterThan(0);
  });

  it("hides device type select and shows locked type display", () => {
    render(
      <DeviceModelFormModal
        open
        editing={null}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        forcedDeviceType="rack_object"
        lockDeviceType
      />,
    );
    expect(screen.queryByTestId("field-device-type")).toBeNull();
    const locked = screen.getByTestId("field-device-type-locked");
    expect(locked.textContent).toContain("rack_object");
  });

  it("payload contains device_type: rack_object on valid submit", async () => {
    const onSaved = vi.fn();
    const onClose = vi.fn();
    render(
      <DeviceModelFormModal
        open
        editing={null}
        onClose={onClose}
        onSaved={onSaved}
        forcedDeviceType="rack_object"
        lockDeviceType
      />,
    );
    fireEvent.change(screen.getByTestId("field-name"), { target: { value: "Cable Org 1U" } });
    fireEvent.change(screen.getByTestId("field-height-u"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Create rack object" }));

    await waitFor(() => {
      expect(mockAdd).toHaveBeenCalledWith(
        expect.objectContaining({ device_type: "rack_object", name: "Cable Org 1U" }),
      );
      expect(onSaved).toHaveBeenCalledWith("new-model-id");
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  it("normal add mode still shows editable device type select", () => {
    render(
      <DeviceModelFormModal open editing={null} onClose={vi.fn()} onSaved={vi.fn()} />,
    );
    expect(screen.getByTestId("field-device-type")).toBeTruthy();
    expect(screen.queryByTestId("field-device-type-locked")).toBeNull();
  });
});

describe("DeviceModelFormModal — edit mode", () => {
  it("shows Edit device model title and pre-populated fields", () => {
    render(
      <DeviceModelFormModal
        open
        editing={FIXTURE_MODEL}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.getByText("Edit device model")).toBeTruthy();
    expect((screen.getByTestId("field-name") as HTMLInputElement).value).toBe("PowerEdge R750");
    expect((screen.getByTestId("field-height-u") as HTMLInputElement).value).toBe("2");
  });

  it("calls updateDeviceModel without code on valid edit", async () => {
    const onClose = vi.fn();
    const onSaved = vi.fn();
    render(
      <DeviceModelFormModal
        open
        editing={FIXTURE_MODEL}
        onClose={onClose}
        onSaved={onSaved}
      />,
    );

    fireEvent.change(screen.getByTestId("field-name"), {
      target: { value: "PowerEdge R750 XL" },
    });
    fireEvent.click(screen.getByText("Save changes"));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "model-1",
          name: "PowerEdge R750 XL",
          default_height_u: 2,
        }),
      );
      const call = mockUpdate.mock.calls[0][0];
      expect(call).not.toHaveProperty("code");
      expect(onSaved).toHaveBeenCalledOnce();
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  it("pre-populates model number field from fixture", () => {
    render(
      <DeviceModelFormModal
        open
        editing={FIXTURE_MODEL}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    expect((screen.getByTestId("field-model-sku") as HTMLInputElement).value).toBe("R750-001");
  });

  it("submitted payload still uses model_number key", async () => {
    const onClose = vi.fn();
    const onSaved = vi.fn();
    render(
      <DeviceModelFormModal
        open
        editing={FIXTURE_MODEL}
        onClose={onClose}
        onSaved={onSaved}
      />,
    );
    fireEvent.change(screen.getByTestId("field-model-sku"), {
      target: { value: "R750-XL" },
    });
    fireEvent.click(screen.getByText("Save changes"));
    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ model: "R750-XL" }),
      );
    });
  });

  it("resets form when reopened with a different model", () => {
    const { rerender } = render(
      <DeviceModelFormModal
        open
        editing={FIXTURE_MODEL}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    const other: DeviceModelDto = {
      ...FIXTURE_MODEL,
      id: "model-2",
      code: "cisco-c9300",
      name: "Catalyst 9300",
      default_height_u: 1,
      device_type: "network",
    };
    rerender(
      <DeviceModelFormModal
        open
        editing={other}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    expect((screen.getByTestId("field-name") as HTMLInputElement).value).toBe("Catalyst 9300");
    expect((screen.getByTestId("field-height-u") as HTMLInputElement).value).toBe("1");
  });
});
