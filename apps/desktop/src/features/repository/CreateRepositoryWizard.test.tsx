// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { CreateRepositoryWizard } from "./CreateRepositoryWizard";
import type { OpenRepositoryResultDto } from "../../api/tauriClient";

vi.mock("../../api/tauriClient", () => ({
  createRepository: vi.fn(),
  selectRepositoryFolder: vi.fn(),
}));

import { createRepository, selectRepositoryFolder } from "../../api/tauriClient";

const mockCreate = vi.mocked(createRepository);
const mockBrowse = vi.mocked(selectRepositoryFolder);

const FIXTURE_RESULT: OpenRepositoryResultDto = {
  summary: {
    repo_path: "/some/path",
    repository_code: "test-repo",
    repository_name: "Test Repo",
    locations_count: 0,
    racks_count: 0,
    device_models_count: 0,
    devices_count: 0,
    placement_files_count: 0,
    placements_count: 0,
    unplaced_devices_count: 0,
  },
  validation_summary: { errors: 0, warnings: 0, infos: 0, total: 0 },
};

beforeEach(() => {
  document.body.innerHTML = "";
  mockCreate.mockResolvedValue(FIXTURE_RESULT);
  mockBrowse.mockResolvedValue(null);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CreateRepositoryWizard — Git enforcement", () => {
  it("does not render an 'Initialize Git repository' checkbox", () => {
    render(<CreateRepositoryWizard onSuccess={vi.fn()} />);
    expect(screen.queryByLabelText(/initialize git/i)).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("shows the git auto-init info note", () => {
    render(<CreateRepositoryWizard onSuccess={vi.fn()} />);
    expect(
      screen.getByText(/git repository will be initialized automatically/i),
    ).toBeTruthy();
  });

  it("calls createRepository without initialize_git field on submit", async () => {
    render(<CreateRepositoryWizard onSuccess={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText(/path to new/i), {
      target: { value: "/my/dir" },
    });
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. my-datacenter/i), {
      target: { value: "test-repo" },
    });
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. my datacenter/i), {
      target: { value: "Test Repo" },
    });

    fireEvent.submit(screen.getByRole("button", { name: /create repository/i }).closest("form")!);

    await waitFor(() => expect(mockCreate).toHaveBeenCalledOnce());
    const call = mockCreate.mock.calls[0][0];
    expect(call).toEqual({ path: "/my/dir", code: "test-repo", name: "Test Repo" });
    expect(Object.prototype.hasOwnProperty.call(call, "initialize_git")).toBe(false);
  });

  it("calls onSuccess after successful create", async () => {
    const onSuccess = vi.fn();
    render(<CreateRepositoryWizard onSuccess={onSuccess} />);

    fireEvent.change(screen.getByPlaceholderText(/path to new/i), {
      target: { value: "/my/dir" },
    });
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. my-datacenter/i), {
      target: { value: "test-repo" },
    });
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. my datacenter/i), {
      target: { value: "Test Repo" },
    });

    fireEvent.submit(screen.getByRole("button", { name: /create repository/i }).closest("form")!);

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(FIXTURE_RESULT));
  });
});
