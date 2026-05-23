import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { RepositoryPanel } from "./RepositoryPanel";
import type { GitStatusDto, OpenRepositoryResultDto, RepositorySummaryDto } from "../../api/tauriClient";
import { getGitStatus, getGitLog, listGitRemotes } from "../../api/tauriClient";

vi.mock("../../api/tauriClient", () => ({
  addGitRemote: vi.fn(),
  commitRepositoryChanges: vi.fn(),
  getGitLog: vi.fn().mockResolvedValue([]),
  getGitStatus: vi.fn().mockResolvedValue({ is_repository: false }),
  initGitRepository: vi.fn(),
  listGitRemotes: vi.fn().mockResolvedValue([]),
  pullGitFfOnly: vi.fn(),
  pushGitCurrentBranch: vi.fn(),
  saveCurrentRepository: vi.fn(),
  validateCurrentRepository: vi.fn(),
}));

vi.mock("./CreateRepositoryWizard", () => ({
  CreateRepositoryWizard: () => <div data-testid="create-wizard" />,
}));

const BASE_PROPS = {
  repoPath: "",
  onRepoPathChange: vi.fn(),
  onOpen: vi.fn(),
  onOpenPath: vi.fn(),
  onBrowse: vi.fn(),
  onClose: vi.fn(),
  working: false,
  summary: null,
  validationSummary: null,
  recentRepos: [],
  onRemoveRecentRepo: vi.fn(),
  hasUnsavedChanges: false,
  onSaveSuccess: vi.fn(),
  onPullSuccess: vi.fn(),
  onPullRunning: vi.fn(),
  onCreateSuccess: vi.fn() as (result: OpenRepositoryResultDto) => void,
};

beforeEach(() => {
  document.body.innerHTML = "";
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("RepositoryPanel — Recent repositories", () => {
  it("renders an Open button with aria-label for each recent repository", () => {
    render(
      <RepositoryPanel
        {...BASE_PROPS}
        recentRepos={["/repos/dc-a", "/repos/dc-b"]}
      />,
    );
    expect(screen.getByRole("button", { name: "Open /repos/dc-a" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open /repos/dc-b" })).toBeTruthy();
  });

  // Case 4 — Recent repo Open proceeds: button calls onOpenPath with correct path
  it("Open button directly calls onOpenPath with the repository path", () => {
    const onOpenPath = vi.fn();
    render(
      <RepositoryPanel
        {...BASE_PROPS}
        recentRepos={["/repos/dc-a"]}
        onOpenPath={onOpenPath}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open /repos/dc-a" }));
    expect(onOpenPath).toHaveBeenCalledWith("/repos/dc-a");
    expect(onOpenPath).toHaveBeenCalledTimes(1);
  });

  // Case 3 — Recent repo Open blocked: onOpenPath (=handleOpenPath in App) applies the guard.
  // Here we verify it is called so the guard runs — the guard result is tested in unsavedGuard.test.ts.
  it("Open button does not call onOpen (different handler) — uses the dedicated path handler", () => {
    const onOpen = vi.fn();
    const onOpenPath = vi.fn();
    render(
      <RepositoryPanel
        {...BASE_PROPS}
        recentRepos={["/repos/dc-a"]}
        onOpen={onOpen}
        onOpenPath={onOpenPath}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open /repos/dc-a" }));
    expect(onOpenPath).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  // Row click fills path field only, does NOT open
  it("clicking the path cell calls onRepoPathChange (fills field) and not onOpenPath", () => {
    const onRepoPathChange = vi.fn();
    const onOpenPath = vi.fn();
    render(
      <RepositoryPanel
        {...BASE_PROPS}
        recentRepos={["/repos/dc-a"]}
        onRepoPathChange={onRepoPathChange}
        onOpenPath={onOpenPath}
      />,
    );
    fireEvent.click(screen.getByText("/repos/dc-a"));
    expect(onRepoPathChange).toHaveBeenCalledWith("/repos/dc-a");
    expect(onOpenPath).not.toHaveBeenCalled();
  });

  it("Open button is safe when onOpenPath prop is not provided", () => {
    const props = { ...BASE_PROPS, onOpenPath: undefined, recentRepos: ["/repos/dc-a"] };
    render(<RepositoryPanel {...props} />);
    expect(() =>
      fireEvent.click(screen.getByRole("button", { name: "Open /repos/dc-a" })),
    ).not.toThrow();
  });

  it("each recent repo Open button calls onOpenPath with its own path", () => {
    const onOpenPath = vi.fn();
    render(
      <RepositoryPanel
        {...BASE_PROPS}
        recentRepos={["/repos/dc-a", "/repos/dc-b"]}
        onOpenPath={onOpenPath}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open /repos/dc-b" }));
    expect(onOpenPath).toHaveBeenCalledWith("/repos/dc-b");
    expect(onOpenPath).toHaveBeenCalledTimes(1);
  });
});

describe("RepositoryPanel — Open by path", () => {
  // Case 1 — normal Open is guarded inside handleOpen in App; here we verify the
  // path-input Open button routes to onOpen (which in App calls confirmUnsavedDiscard).
  it("Open by path button calls onOpen", () => {
    const onOpen = vi.fn();
    render(
      <RepositoryPanel
        {...BASE_PROPS}
        repoPath="/repos/dc-a"
        onOpen={onOpen}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

// ── Git status cache behaviour ────────────────────────────────────────────────

const GIT_STATUS_OK: GitStatusDto = {
  is_repository: true,
  branch: "main",
  upstream: "origin/main",
  ahead: 0,
  behind: 0,
  is_clean: true,
  staged_count: 0,
  unstaged_count: 0,
  untracked_count: 0,
  message: null,
};

const REPO_SUMMARY: RepositorySummaryDto = {
  repo_path: "/repos/test",
  repository_code: "TEST",
  repository_name: "Test Repository",
  locations_count: 0,
  racks_count: 0,
  device_models_count: 0,
  devices_count: 0,
  placement_files_count: 0,
  placements_count: 0,
  unplaced_devices_count: 0,
};

const OPEN_PROPS = {
  ...BASE_PROPS,
  summary: REPO_SUMMARY,
  repoPath: "/repos/test",
};

describe("RepositoryPanel — Git status cache", () => {
  beforeEach(() => {
    vi.mocked(getGitStatus).mockResolvedValue(GIT_STATUS_OK);
    vi.mocked(getGitLog).mockResolvedValue([]);
    vi.mocked(listGitRemotes).mockResolvedValue([]);
  });

  it("fetches Git status exactly once on initial mount", async () => {
    render(<RepositoryPanel {...OPEN_PROPS} />);
    await waitFor(() => expect(getGitStatus).toHaveBeenCalledTimes(1));
  });

  it("does not fetch Git status again when unrelated props change", async () => {
    const { rerender } = render(<RepositoryPanel {...OPEN_PROPS} />);
    await waitFor(() => expect(getGitStatus).toHaveBeenCalledTimes(1));
    rerender(<RepositoryPanel {...OPEN_PROPS} hasUnsavedChanges={true} />);
    expect(getGitStatus).toHaveBeenCalledTimes(1);
  });

  it("fetches Git status again when repo path changes (new repo opened)", async () => {
    const newSummary: RepositorySummaryDto = { ...REPO_SUMMARY, repo_path: "/repos/other" };
    const { rerender } = render(<RepositoryPanel {...OPEN_PROPS} />);
    await waitFor(() => expect(getGitStatus).toHaveBeenCalledTimes(1));
    rerender(<RepositoryPanel {...OPEN_PROPS} summary={newSummary} repoPath="/repos/other" />);
    await waitFor(() => expect(getGitStatus).toHaveBeenCalledTimes(2));
  });

  it("fetches Git status again when gitRefreshToken changes (external mutation e.g. save from another tab)", async () => {
    const { rerender } = render(<RepositoryPanel {...OPEN_PROPS} />);
    await waitFor(() => expect(getGitStatus).toHaveBeenCalledTimes(1));
    rerender(<RepositoryPanel {...OPEN_PROPS} gitRefreshToken={1} />);
    await waitFor(() => expect(getGitStatus).toHaveBeenCalledTimes(2));
  });

  it("clears Git status when repo is closed (summary becomes null)", async () => {
    const { rerender } = render(<RepositoryPanel {...OPEN_PROPS} />);
    await waitFor(() => expect(getGitStatus).toHaveBeenCalledTimes(1));
    rerender(<RepositoryPanel {...OPEN_PROPS} summary={null} />);
    expect(getGitStatus).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Refresh Git status" })).toBeNull();
  });
});

describe("RepositoryPanel — Refresh Git status button", () => {
  beforeEach(() => {
    vi.mocked(getGitStatus).mockResolvedValue(GIT_STATUS_OK);
    vi.mocked(getGitLog).mockResolvedValue([]);
    vi.mocked(listGitRemotes).mockResolvedValue([]);
  });

  it("Refresh Git status button is present after initial load", async () => {
    render(<RepositoryPanel {...OPEN_PROPS} />);
    expect(await screen.findByRole("button", { name: "Refresh Git status" })).toBeTruthy();
  });

  it("clicking Refresh Git status triggers another getGitStatus call", async () => {
    render(<RepositoryPanel {...OPEN_PROPS} />);
    const btn = await screen.findByRole("button", { name: "Refresh Git status" });
    fireEvent.click(btn);
    await waitFor(() => expect(getGitStatus).toHaveBeenCalledTimes(2));
  });

  it("Refresh Git status button is disabled while the refresh is running", async () => {
    render(<RepositoryPanel {...OPEN_PROPS} />);
    const btn = await screen.findByRole("button", { name: "Refresh Git status" });

    // Hang subsequent fetches so loading stays true
    vi.mocked(getGitStatus).mockReturnValueOnce(new Promise(() => {}));
    vi.mocked(getGitLog).mockReturnValueOnce(new Promise(() => {}));
    vi.mocked(listGitRemotes).mockReturnValueOnce(new Promise(() => {}));
    fireEvent.click(btn);
    await waitFor(() => expect((btn as HTMLButtonElement).disabled).toBe(true));
  });
});
