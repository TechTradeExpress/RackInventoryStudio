// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { CloneRepositoryForm } from "./CloneRepositoryForm";
import type { OpenRepositoryResultDto } from "../../api/tauriClient";

vi.mock("../../api/tauriClient", () => ({
  cloneRepository: vi.fn(),
  selectRepositoryFolder: vi.fn(),
}));

vi.mock("../../lib/appBusy", () => ({
  useBusy: () => ({
    isBusy: false,
    label: "",
    runBusy: <T,>(_label: string, fn: () => Promise<T>) => fn(),
  }),
}));

import { cloneRepository, selectRepositoryFolder } from "../../api/tauriClient";

const mockClone = vi.mocked(cloneRepository);
const mockBrowse = vi.mocked(selectRepositoryFolder);

const FIXTURE_RESULT: OpenRepositoryResultDto = {
  summary: {
    repo_path: "/home/user/repos/test-repo",
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
  mockClone.mockResolvedValue(FIXTURE_RESULT);
  mockBrowse.mockResolvedValue(null);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CloneRepositoryForm — visibility", () => {
  it("renders Git URL field", () => {
    render(<CloneRepositoryForm onSuccess={vi.fn()} />);
    expect(screen.getByTestId("clone-url")).toBeTruthy();
  });

  it("renders parent directory field", () => {
    render(<CloneRepositoryForm onSuccess={vi.fn()} />);
    expect(screen.getByTestId("clone-parent")).toBeTruthy();
  });

  it("renders directory name field", () => {
    render(<CloneRepositoryForm onSuccess={vi.fn()} />);
    expect(screen.getByTestId("clone-dirname")).toBeTruthy();
  });

  it("renders Clone repository submit button", () => {
    render(<CloneRepositoryForm onSuccess={vi.fn()} />);
    expect(screen.getByTestId("clone-submit")).toBeTruthy();
  });
});

describe("CloneRepositoryForm — URL auto-derives directory name", () => {
  it("auto-fills directory name from URL", () => {
    render(<CloneRepositoryForm onSuccess={vi.fn()} />);
    fireEvent.change(screen.getByTestId("clone-url"), {
      target: { value: "https://github.com/org/my-project.git" },
    });
    expect((screen.getByTestId("clone-dirname") as HTMLInputElement).value).toBe("my-project");
  });

  it("auto-fills from SSH URL", () => {
    render(<CloneRepositoryForm onSuccess={vi.fn()} />);
    fireEvent.change(screen.getByTestId("clone-url"), {
      target: { value: "git@github.com:org/my-repo.git" },
    });
    expect((screen.getByTestId("clone-dirname") as HTMLInputElement).value).toBe("my-repo");
  });

  it("stops auto-filling after user manually edits directory name", () => {
    render(<CloneRepositoryForm onSuccess={vi.fn()} />);
    fireEvent.change(screen.getByTestId("clone-url"), {
      target: { value: "https://github.com/org/repo.git" },
    });
    fireEvent.change(screen.getByTestId("clone-dirname"), {
      target: { value: "custom-name" },
    });
    // Change URL again — dir name should not auto-update
    fireEvent.change(screen.getByTestId("clone-url"), {
      target: { value: "https://github.com/org/other.git" },
    });
    expect((screen.getByTestId("clone-dirname") as HTMLInputElement).value).toBe("custom-name");
  });
});

describe("CloneRepositoryForm — validation blocks submit", () => {
  it("submit button is disabled when URL is empty", () => {
    render(<CloneRepositoryForm onSuccess={vi.fn()} />);
    fireEvent.change(screen.getByTestId("clone-parent"), {
      target: { value: "/home/user/repos" },
    });
    fireEvent.change(screen.getByTestId("clone-dirname"), {
      target: { value: "repo" },
    });
    expect((screen.getByTestId("clone-submit") as HTMLButtonElement).disabled).toBe(true);
  });

  it("submit button is disabled when parent directory is empty", () => {
    render(<CloneRepositoryForm onSuccess={vi.fn()} />);
    fireEvent.change(screen.getByTestId("clone-url"), {
      target: { value: "https://github.com/org/repo.git" },
    });
    expect((screen.getByTestId("clone-submit") as HTMLButtonElement).disabled).toBe(true);
  });

  it("submit button is disabled when directory name contains path separator", () => {
    render(<CloneRepositoryForm onSuccess={vi.fn()} />);
    fireEvent.change(screen.getByTestId("clone-url"), {
      target: { value: "https://github.com/org/repo.git" },
    });
    fireEvent.change(screen.getByTestId("clone-parent"), {
      target: { value: "/home/user/repos" },
    });
    fireEvent.change(screen.getByTestId("clone-dirname"), {
      target: { value: "org/repo" },
    });
    expect((screen.getByTestId("clone-submit") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("clone-dirname-error")).toBeTruthy();
  });
});

describe("CloneRepositoryForm — path preview", () => {
  it("shows path preview when URL and parent are filled", () => {
    render(<CloneRepositoryForm onSuccess={vi.fn()} />);
    fireEvent.change(screen.getByTestId("clone-url"), {
      target: { value: "https://github.com/org/repo.git" },
    });
    fireEvent.change(screen.getByTestId("clone-parent"), {
      target: { value: "/home/user/repos" },
    });
    expect(screen.getByTestId("clone-preview")).toBeTruthy();
    expect(screen.getByTestId("clone-preview").textContent).toContain("/home/user/repos/repo");
  });

  it("does not show preview when parent is empty", () => {
    render(<CloneRepositoryForm onSuccess={vi.fn()} />);
    fireEvent.change(screen.getByTestId("clone-url"), {
      target: { value: "https://github.com/org/repo.git" },
    });
    expect(screen.queryByTestId("clone-preview")).toBeNull();
  });
});

describe("CloneRepositoryForm — successful clone", () => {
  it("calls cloneRepository with correct url and destination", async () => {
    const onSuccess = vi.fn();
    render(<CloneRepositoryForm onSuccess={onSuccess} />);

    fireEvent.change(screen.getByTestId("clone-url"), {
      target: { value: "https://github.com/org/repo.git" },
    });
    fireEvent.change(screen.getByTestId("clone-parent"), {
      target: { value: "/home/user/repos" },
    });
    // dirName is auto-filled as "repo"

    fireEvent.submit(screen.getByTestId("clone-form"));

    await waitFor(() => {
      expect(mockClone).toHaveBeenCalledWith(
        "https://github.com/org/repo.git",
        "/home/user/repos/repo",
      );
    });
  });

  it("calls onSuccess with the result after successful clone", async () => {
    const onSuccess = vi.fn();
    render(<CloneRepositoryForm onSuccess={onSuccess} />);

    fireEvent.change(screen.getByTestId("clone-url"), {
      target: { value: "https://github.com/org/repo.git" },
    });
    fireEvent.change(screen.getByTestId("clone-parent"), {
      target: { value: "/home/user/repos" },
    });

    fireEvent.submit(screen.getByTestId("clone-form"));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith(FIXTURE_RESULT);
    });
  });
});

describe("CloneRepositoryForm — error handling", () => {
  it("shows error banner when cloneRepository throws", async () => {
    mockClone.mockRejectedValueOnce("git clone failed: authentication required");
    render(<CloneRepositoryForm onSuccess={vi.fn()} />);

    fireEvent.change(screen.getByTestId("clone-url"), {
      target: { value: "https://github.com/org/repo.git" },
    });
    fireEvent.change(screen.getByTestId("clone-parent"), {
      target: { value: "/home/user/repos" },
    });

    fireEvent.submit(screen.getByTestId("clone-form"));

    await waitFor(() => {
      expect(screen.getByTestId("clone-error")).toBeTruthy();
      expect(screen.getByTestId("clone-error").textContent).toContain(
        "git clone failed: authentication required",
      );
    });
  });

  it("does not call onSuccess when clone fails", async () => {
    mockClone.mockRejectedValueOnce("git clone failed");
    const onSuccess = vi.fn();
    render(<CloneRepositoryForm onSuccess={onSuccess} />);

    fireEvent.change(screen.getByTestId("clone-url"), {
      target: { value: "https://github.com/org/repo.git" },
    });
    fireEvent.change(screen.getByTestId("clone-parent"), {
      target: { value: "/home/user/repos" },
    });

    fireEvent.submit(screen.getByTestId("clone-form"));

    await waitFor(() => {
      expect(screen.getByTestId("clone-error")).toBeTruthy();
    });
    expect(onSuccess).not.toHaveBeenCalled();
  });
});

describe("CloneRepositoryForm — Browse button", () => {
  it("Browse button calls selectRepositoryFolder and populates parent directory", async () => {
    mockBrowse.mockResolvedValueOnce("/picked/path");
    render(<CloneRepositoryForm onSuccess={vi.fn()} />);

    fireEvent.click(screen.getByTestId("clone-browse"));

    await waitFor(() => {
      expect((screen.getByTestId("clone-parent") as HTMLInputElement).value).toBe("/picked/path");
    });
  });

  it("Browse button cancels gracefully when user dismisses dialog (returns null)", async () => {
    mockBrowse.mockResolvedValueOnce(null);
    render(<CloneRepositoryForm onSuccess={vi.fn()} />);

    fireEvent.click(screen.getByTestId("clone-browse"));

    await waitFor(() => {
      expect(mockBrowse).toHaveBeenCalledOnce();
    });
    expect((screen.getByTestId("clone-parent") as HTMLInputElement).value).toBe("");
  });
});

describe("CloneRepositoryForm — unsafe URL validation (frontend defense-in-depth)", () => {
  function fillParentAndDir() {
    fireEvent.change(screen.getByTestId("clone-parent"), {
      target: { value: "/home/user/repos" },
    });
    fireEvent.change(screen.getByTestId("clone-dirname"), {
      target: { value: "repo" },
    });
  }

  it("submit is disabled and error shown for ext:: URL", () => {
    render(<CloneRepositoryForm onSuccess={vi.fn()} />);
    fireEvent.change(screen.getByTestId("clone-url"), {
      target: { value: "ext::sh -c 'touch /tmp/pwned'" },
    });
    fillParentAndDir();
    expect((screen.getByTestId("clone-submit") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("clone-url-error").textContent).toContain("SSH");
  });

  it("submit is disabled and error shown for fd:: URL", () => {
    render(<CloneRepositoryForm onSuccess={vi.fn()} />);
    fireEvent.change(screen.getByTestId("clone-url"), {
      target: { value: "fd::4" },
    });
    fillParentAndDir();
    expect((screen.getByTestId("clone-submit") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("clone-url-error")).toBeTruthy();
  });

  it("submit is disabled and error shown for file:// URL", () => {
    render(<CloneRepositoryForm onSuccess={vi.fn()} />);
    fireEvent.change(screen.getByTestId("clone-url"), {
      target: { value: "file:///tmp/repo.git" },
    });
    fillParentAndDir();
    expect((screen.getByTestId("clone-submit") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("clone-url-error")).toBeTruthy();
  });

  it("does not invoke cloneRepository for unsafe URL even if form is submitted", async () => {
    render(<CloneRepositoryForm onSuccess={vi.fn()} />);
    fireEvent.change(screen.getByTestId("clone-url"), {
      target: { value: "ext::sh -c 'echo bad'" },
    });
    fillParentAndDir();
    fireEvent.submit(screen.getByTestId("clone-form"));
    await waitFor(() => {
      expect(mockClone).not.toHaveBeenCalled();
    });
  });

  it("submit is enabled and no URL error for https:// URL", () => {
    render(<CloneRepositoryForm onSuccess={vi.fn()} />);
    fireEvent.change(screen.getByTestId("clone-url"), {
      target: { value: "https://github.com/org/repo.git" },
    });
    fillParentAndDir();
    expect((screen.getByTestId("clone-submit") as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByTestId("clone-url-error")).toBeNull();
  });

  it("submit is enabled and no URL error for scp-style SSH URL", () => {
    render(<CloneRepositoryForm onSuccess={vi.fn()} />);
    fireEvent.change(screen.getByTestId("clone-url"), {
      target: { value: "git@github.com:org/repo.git" },
    });
    fillParentAndDir();
    expect((screen.getByTestId("clone-submit") as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByTestId("clone-url-error")).toBeNull();
  });
});
