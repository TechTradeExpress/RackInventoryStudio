import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { ValidationPanel } from "./ValidationPanel";

vi.mock("../../api/tauriClient", () => ({
  validateCurrentRepository: vi.fn().mockResolvedValue([]),
  saveCurrentRepository: vi.fn().mockResolvedValue({
    created: 0, updated: 0, unchanged: 0, total: 0,
  }),
}));

import { validateCurrentRepository, saveCurrentRepository } from "../../api/tauriClient";

const mockValidate = vi.mocked(validateCurrentRepository);
const mockSave = vi.mocked(saveCurrentRepository);

const BASE_PROPS = {
  working: false,
  setWorking: vi.fn(),
  setError: vi.fn(),
  onSaveSuccess: vi.fn(),
};

beforeEach(() => {
  document.body.innerHTML = "";
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ValidationPanel — copy and labels", () => {
  it("renders 'Validate repository' as the primary action button", () => {
    render(<ValidationPanel {...BASE_PROPS} />);
    expect(screen.getByRole("button", { name: /Validate repository/i })).toBeTruthy();
  });

  it("renders 'Save changes' as the save action button", () => {
    render(<ValidationPanel {...BASE_PROPS} />);
    expect(screen.getByRole("button", { name: /Save changes/i })).toBeTruthy();
  });

  it("subtitle mentions saving or publishing", () => {
    render(<ValidationPanel {...BASE_PROPS} />);
    expect(screen.getByText(/saving or publishing/i)).toBeTruthy();
  });

  it("pre-validation empty state body explains validation does not write files to disk", () => {
    render(<ValidationPanel {...BASE_PROPS} />);
    expect(screen.getByText(/does not write files to disk/i)).toBeTruthy();
  });

  it("clicking 'Validate repository' calls validateCurrentRepository", async () => {
    render(<ValidationPanel {...BASE_PROPS} />);
    fireEvent.click(screen.getByRole("button", { name: /Validate repository/i }));
    await waitFor(() => expect(mockValidate).toHaveBeenCalledOnce());
  });

  it("clicking 'Save changes' calls saveCurrentRepository", async () => {
    render(<ValidationPanel {...BASE_PROPS} />);
    fireEvent.click(screen.getByRole("button", { name: /Save changes/i }));
    await waitFor(() => expect(mockSave).toHaveBeenCalledOnce());
  });
});
