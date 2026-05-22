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
    expect((screen.getByTestId("field-code") as HTMLInputElement).value).toBe("");
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

  it("shows code format error for invalid code", () => {
    render(
      <DeviceModelFormModal
        open
        editing={null}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByTestId("field-code"), {
      target: { value: "INVALID CODE!" },
    });
    expect(screen.getByText(/lowercase letters/i)).toBeTruthy();
  });

  it("calls addDeviceModel, onSaved, onClose on valid submit", async () => {
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
    fireEvent.change(screen.getByTestId("field-code"), {
      target: { value: "hp-dl380" },
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
          code: "hp-dl380",
          name: "ProLiant DL380",
          default_height_u: 2,
        }),
      );
      expect(onSaved).toHaveBeenCalledOnce();
      expect(onClose).toHaveBeenCalledOnce();
    });
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
    expect((screen.getByTestId("field-code") as HTMLInputElement).value).toBe("dell-r750");
    expect((screen.getByTestId("field-name") as HTMLInputElement).value).toBe("PowerEdge R750");
    expect((screen.getByTestId("field-height-u") as HTMLInputElement).value).toBe("2");
  });

  it("disables code field in edit mode", () => {
    render(
      <DeviceModelFormModal
        open
        editing={FIXTURE_MODEL}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    expect((screen.getByTestId("field-code") as HTMLInputElement).disabled).toBe(true);
  });

  it("calls updateDeviceModel, onSaved, onClose on valid edit", async () => {
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
          code: "dell-r750",
          name: "PowerEdge R750 XL",
          default_height_u: 2,
        }),
      );
      expect(onSaved).toHaveBeenCalledOnce();
      expect(onClose).toHaveBeenCalledOnce();
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
    expect((screen.getByTestId("field-code") as HTMLInputElement).value).toBe("cisco-c9300");
    expect((screen.getByTestId("field-name") as HTMLInputElement).value).toBe("Catalyst 9300");
    expect((screen.getByTestId("field-height-u") as HTMLInputElement).value).toBe("1");
  });
});
