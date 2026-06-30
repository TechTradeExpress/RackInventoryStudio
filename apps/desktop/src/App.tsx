import { useState, useEffect, useRef, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useBusy } from "./lib/appBusy";
import {
  closeRepository,
  getRepositorySummary,
  openRepository,
  saveCurrentRepository,
  selectRepositoryFolder,
  type LocationDto,
  type OpenRepositoryResultDto,
  type RackSummaryDto,
  type RepositorySummaryDto,
  type ValidationSummaryDto,
  type SshPassphraseRequestedPayload,
  type SshPassphraseSessionEndedPayload,
} from "./api/tauriClient";
import {
  addRecentRepository,
  getRecentRepositories,
  removeRecentRepository,
} from "./features/repository/recentRepositories";
import { RepositoryPanel } from "./features/repository/RepositoryPanel";
import { ValidationPanel } from "./features/validation/ValidationPanel";
import { LocationsPanel } from "./features/locations/LocationsPanel";
import { RacksPanel } from "./features/racks/RacksPanel";
import { DevicesPanel } from "./features/devices/DevicesPanel";
import { DeviceModelsPanel } from "./features/deviceModels/DeviceModelsPanel";
import { CsvImportPanel } from "./features/csvImport/CsvImportPanel";
import { SettingsPanel } from "./features/settings/SettingsPanel";
import { SshPassphraseModal } from "./features/repository/SshPassphraseModal";
import { UnsavedChangesDialog } from "./components/ui/UnsavedChangesDialog";
import {
  GlobalSearch,
  type SearchNavigationEvent,
} from "./features/search/GlobalSearch";
import {
  IcFolder,
  IcCheckCircle,
  IcMapPin,
  IcServer,
  IcBox,
  IcLayers,
  IcUpload,
  IcSearch,
  IcAlertTriangle,
  IcSave,
  IcAlertCircle,
  IcGitBranch,
  IcSettings,
} from "./components/ui/Icon";
import type { ValidationNavigationTarget } from "./features/validation/navigation";
import { logError, logInfo, logWarn } from "./lib/diagnosticsLog";
import { sanitizeErrorForLog, sanitizePathForLog } from "./lib/redact";
import { useWorkMode } from "./lib/workMode";

type Tab =
  | "repository"
  | "validation"
  | "locations"
  | "racks"
  | "devices"
  | "device_models"
  | "csv_import"
  | "settings";

export function App() {
  const { isBusy, runBusy } = useBusy();
  const { mode: workMode, setMode: setWorkMode } = useWorkMode();

  const [repoPath, setRepoPath] = useState("");
  const [summary, setSummary] = useState<RepositorySummaryDto | null>(null);
  const [validationSummary, setValidationSummary] = useState<ValidationSummaryDto | null>(null);
  const [recentRepos, setRecentRepos] = useState<string[]>(() => getRecentRepositories());
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("repository");
  const [selectedRack, setSelectedRack] = useState<RackSummaryDto | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [repositoryMutationToken, setRepositoryMutationToken] = useState(0);
  const [gitRefreshToken, setGitRefreshToken] = useState(0);
  const [selectedLocationForRacks, setSelectedLocationForRacks] = useState<LocationDto | null>(null);

  const [highlightedLocationId, setHighlightedLocationId] = useState<string | null>(null);
  const [highlightedDeviceId, setHighlightedDeviceId] = useState<string | null>(null);
  const [highlightedDeviceModelId, setHighlightedDeviceModelId] = useState<string | null>(null);
  const [pendingRackNavTarget, setPendingRackNavTarget] = useState<{
    rackId: string;
    placementId?: string;
  } | null>(null);

  const [askpassSession, setAskpassSession] = useState<{
    prompt: string;
    sessionId: string;
    expired: boolean;
  } | null>(null);

  // Async unsaved-changes guard: shows a 3-button dialog instead of window.confirm.
  const [unsavedGuardOpen, setUnsavedGuardOpen] = useState(false);
  const [unsavedGuardSaving, setUnsavedGuardSaving] = useState(false);
  const unsavedGuardResolveRef = useRef<((action: "save" | "discard" | "cancel") => void) | null>(null);
  // Always-current value of hasUnsavedChanges; used in effects with stable closures.
  const hasUnsavedChangesRef = useRef(hasUnsavedChanges);
  hasUnsavedChangesRef.current = hasUnsavedChanges;
  // Prevents re-entrant close handling while destroy() is in flight.
  const closingRef = useRef(false);

  const isOpen = summary !== null;

  function handleSaveSuccess() {
    setHasUnsavedChanges(false);
    setGitRefreshToken((t) => t + 1);
  }

  /** Opens the 3-button guard dialog and returns the user's choice. Returns 'discard' immediately when clean. */
  const openGuardDialog = useCallback(
    () =>
      new Promise<"save" | "discard" | "cancel">((resolve) => {
        unsavedGuardResolveRef.current = resolve;
        setUnsavedGuardOpen(true);
      }),
    [],
  );

  async function guardUnsaved(): Promise<"save" | "discard" | "cancel"> {
    if (!hasUnsavedChanges) return "discard";
    return openGuardDialog();
  }

  function resolveGuard(action: "save" | "discard" | "cancel") {
    unsavedGuardResolveRef.current?.(action);
    unsavedGuardResolveRef.current = null;
    setUnsavedGuardOpen(false);
  }

  async function handleGuardSave() {
    setUnsavedGuardSaving(true);
    try {
      await saveCurrentRepository();
      handleSaveSuccess();
      resolveGuard("save");
    } catch (e) {
      setError(String(e));
      logError(`Save failed during unsaved guard: ${sanitizeErrorForLog(e)}`);
      // Leave dialog open so user can retry or cancel.
    } finally {
      setUnsavedGuardSaving(false);
    }
  }

  // Listen for SSH passphrase requests emitted by the backend askpass session.
  useEffect(() => {
    const unlistenRequested = listen<SshPassphraseRequestedPayload>(
      "ssh-passphrase-requested",
      (event) => {
        logInfo(`askpass: ssh-passphrase-requested received session=${event.payload.session_id}`);
        setAskpassSession({
          prompt: event.payload.prompt,
          sessionId: event.payload.session_id,
          expired: false,
        });
      },
    );
    const unlistenEnded = listen<SshPassphraseSessionEndedPayload>(
      "ssh-passphrase-session-ended",
      (event) => {
        logInfo(`askpass: ssh-passphrase-session-ended received session=${event.payload.session_id}`);
        setAskpassSession((prev) => {
          if (prev === null || prev.sessionId !== event.payload.session_id) return prev;
          return { ...prev, expired: true };
        });
      },
    );
    return () => {
      unlistenRequested.then((fn) => fn());
      unlistenEnded.then((fn) => fn());
    };
  }, []);

  // Guard window close when there are unsaved changes.
  // Always calls event.preventDefault() and manages the close explicitly via
  // destroy() so the window closes reliably in all Tauri v2 environments.
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    getCurrentWindow()
      .onCloseRequested(async (event) => {
        event.preventDefault();
        if (closingRef.current) return;
        closingRef.current = true;
        try {
          if (hasUnsavedChangesRef.current) {
            const action = await openGuardDialog();
            if (action === "cancel") {
              closingRef.current = false;
              return;
            }
            // 'save' means save already completed in handleGuardSave.
            // 'discard' or 'save' both proceed to close.
          }
          await getCurrentWindow().destroy();
        } catch (error) {
          // destroy() rejected — likely a missing capability permission.
          // Reset so the user can retry; log for diagnostics.
          closingRef.current = false;
          logError(`window close failed: ${sanitizeErrorForLog(error)}`);
        }
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => {
      unlisten?.();
      closingRef.current = false;
    };
  }, [openGuardDialog]);

  function handleManageRacks(location: LocationDto) {
    setSelectedLocationForRacks(location);
    setActiveTab("racks");
  }

  function handleRepositoryMutated() {
    setHasUnsavedChanges(true);
    setRepositoryMutationToken((t) => t + 1);
    getRepositorySummary()
      .then(setSummary)
      .catch(() => {});
  }

  function handleNavigateFromValidation(target: ValidationNavigationTarget) {
    setHighlightedLocationId(null);
    setHighlightedDeviceId(null);
    setHighlightedDeviceModelId(null);
    setPendingRackNavTarget(null);

    switch (target.tab) {
      case "locations":
        setActiveTab("locations");
        setHighlightedLocationId(target.locationId ?? null);
        break;
      case "racks":
        setActiveTab("racks");
        if (target.rackId) {
          setPendingRackNavTarget({ rackId: target.rackId, placementId: target.placementId });
        }
        break;
      case "devices":
        setActiveTab("devices");
        setHighlightedDeviceId(target.deviceId ?? null);
        break;
      case "device_models":
        setActiveTab("device_models");
        setHighlightedDeviceModelId(target.deviceModelId ?? null);
        break;
    }
  }

  function handleNavigateFromSearch(event: SearchNavigationEvent) {
    setHighlightedLocationId(null);
    setHighlightedDeviceId(null);
    setHighlightedDeviceModelId(null);
    setPendingRackNavTarget(null);

    switch (event.tab) {
      case "locations":
        setActiveTab("locations");
        setHighlightedLocationId(event.locationId ?? null);
        break;
      case "racks":
        setActiveTab("racks");
        if (event.rackId) {
          setPendingRackNavTarget({ rackId: event.rackId, placementId: event.placementId });
        }
        break;
      case "devices":
        setActiveTab("devices");
        setHighlightedDeviceId(event.deviceId ?? null);
        break;
      case "device_models":
        setActiveTab("device_models");
        setHighlightedDeviceModelId(event.deviceModelId ?? null);
        break;
    }
  }

  async function doOpen(path: string) {
    setError(null);
    logInfo(`Opening repository: ${sanitizePathForLog(path)}`);
    try {
      const result = await runBusy("Opening repository…", () => openRepository(path));
      setRepoPath(path);
      setSummary(result.summary);
      setValidationSummary(result.validation_summary);
      setSelectedRack(null);
      setSelectedLocationForRacks(null);
      setHasUnsavedChanges(false);
      setHighlightedLocationId(null);
      setHighlightedDeviceId(null);
      setHighlightedDeviceModelId(null);
      setPendingRackNavTarget(null);
      setActiveTab("repository");
      addRecentRepository(path);
      setRecentRepos(getRecentRepositories());
      logInfo(
        `Repository opened: code=${result.summary.repository_code} locations=${result.summary.locations_count} racks=${result.summary.racks_count} devices=${result.summary.devices_count}`,
      );
    } catch (e) {
      setError(String(e));
      logWarn(`Open repository failed: ${sanitizeErrorForLog(e)}`);
    }
  }

  async function handleOpen() {
    const path = repoPath.trim();
    if (!path) return;
    const action = await guardUnsaved();
    if (action === "cancel") return;
    await doOpen(path);
  }

  async function handleOpenPath(path: string) {
    const action = await guardUnsaved();
    if (action === "cancel") return;
    await doOpen(path);
  }

  async function handleBrowse() {
    try {
      const path = await selectRepositoryFolder();
      if (path !== null) setRepoPath(path);
    } catch (e) {
      setError(String(e));
    }
  }

  function handleCreateSuccess(result: OpenRepositoryResultDto) {
    setSummary(result.summary);
    setValidationSummary(result.validation_summary);
    setRepoPath(result.summary.repo_path);
    setSelectedRack(null);
    setSelectedLocationForRacks(null);
    setHasUnsavedChanges(false);
    setHighlightedLocationId(null);
    setHighlightedDeviceId(null);
    setHighlightedDeviceModelId(null);
    setPendingRackNavTarget(null);
    setActiveTab("repository");
    addRecentRepository(result.summary.repo_path);
    setRecentRepos(getRecentRepositories());
    logInfo(`Repository created: code=${result.summary.repository_code}`);
  }

  function handleCloneSuccess(result: OpenRepositoryResultDto) {
    setSummary(result.summary);
    setValidationSummary(result.validation_summary);
    setRepoPath(result.summary.repo_path);
    setSelectedRack(null);
    setSelectedLocationForRacks(null);
    setHasUnsavedChanges(false);
    setHighlightedLocationId(null);
    setHighlightedDeviceId(null);
    setHighlightedDeviceModelId(null);
    setPendingRackNavTarget(null);
    setActiveTab("repository");
    addRecentRepository(result.summary.repo_path);
    setRecentRepos(getRecentRepositories());
    logInfo(`Repository cloned: code=${result.summary.repository_code}`);
  }

  async function handleClose() {
    const action = await guardUnsaved();
    if (action === "cancel") return;
    setError(null);
    try {
      await runBusy("Closing repository…", () => closeRepository());
      setSummary(null);
      setValidationSummary(null);
      setSelectedRack(null);
      setSelectedLocationForRacks(null);
      setHasUnsavedChanges(false);
      setRepositoryMutationToken(0);
      setHighlightedLocationId(null);
      setHighlightedDeviceId(null);
      setHighlightedDeviceModelId(null);
      setPendingRackNavTarget(null);
      setActiveTab("repository");
      logInfo("Repository closed");
    } catch (e) {
      setError(String(e));
      logError(`Close repository failed: ${sanitizeErrorForLog(e)}`);
    }
  }

  function navItem(tab: Tab, icon: React.ReactNode, label: string, badge?: React.ReactNode, subtitle?: string) {
    const alwaysEnabled = tab === "repository" || tab === "settings";
    const disabled = !isOpen && !alwaysEnabled;
    const active = activeTab === tab;
    return (
      <div
        key={tab}
        className={`nav-item${active ? " active" : ""}${disabled ? " nav-disabled" : ""}`}
        onClick={() => { if (!disabled) setActiveTab(tab); }}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e) => { if (!disabled && (e.key === "Enter" || e.key === " ")) setActiveTab(tab); }}
        aria-label={label}
        aria-current={active ? "page" : undefined}
        aria-disabled={disabled ? true : undefined}
      >
        <span className="nav-ic">{icon}</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block" }}>{label}</span>
          {subtitle && (
            <span style={{ display: "block", fontSize: 10, color: "var(--tx-4)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {subtitle}
            </span>
          )}
        </span>
        {badge}
      </div>
    );
  }

  const warnCount = validationSummary?.warnings ?? 0;
  const errCount  = validationSummary?.errors ?? 0;
  const valBadge = isOpen
    ? errCount > 0
      ? <span className="nav-count nc-err">{errCount}</span>
      : warnCount > 0
        ? <span className="nav-count nc-warn">{warnCount}</span>
        : null
    : null;

  return (
    <div className="app">
      {/* Titlebar — native window title already shows "Rack Inventory Studio"; only show repo context here */}
      <div className="titlebar">
        <div className="repo-pill">
          {isOpen ? (
            <>
              <IcFolder size={12} />
              <span className="repo-name">{summary.repository_name}</span>
              <span className="sep">·</span>
              <span className="mono" style={{ fontSize: 11, color: "var(--tx-3)" }}>
                {summary.repository_code}
              </span>
              {hasUnsavedChanges && (
                <>
                  <span className="sep">·</span>
                  <span style={{ color: "var(--st-warn-tx)", fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>
                    <IcAlertTriangle size={11} /> unsaved
                  </span>
                </>
              )}
              {validationSummary && errCount > 0 && (
                <>
                  <span className="sep">·</span>
                  <span style={{ color: "var(--st-err-tx)", fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>
                    <IcAlertCircle size={11} /> {errCount} error{errCount !== 1 ? "s" : ""}
                  </span>
                </>
              )}
            </>
          ) : (
            <span style={{ color: "var(--tx-4)", fontSize: 12 }}>No repository open</span>
          )}
        </div>
        {/* Work mode toggle — grid column 3 (auto) of the titlebar */}
        <div
          data-testid="work-mode-toggle"
          style={{ gridColumn: 3, display: "flex", alignItems: "center", gap: 6, padding: "0 10px" }}
        >
          <span style={{ fontSize: 11, color: "var(--tx-4)", flexShrink: 0 }}>Mode</span>
          <div className="seg" role="group" aria-label="Work mode">
            <button
              type="button"
              className={`seg-btn${workMode === "planning" ? " on" : ""}`}
              onClick={() => setWorkMode("planning")}
              aria-pressed={workMode === "planning"}
              data-testid="work-mode-planning"
              title="Planning mode — new devices default to 'planned' status"
            >
              Planning
            </button>
            <button
              type="button"
              className={`seg-btn${workMode === "on-site" ? " on" : ""}`}
              onClick={() => setWorkMode("on-site")}
              aria-pressed={workMode === "on-site"}
              data-testid="work-mode-onsite"
              title="On-site mode — new devices default to 'installed' status"
            >
              On-site
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="body">
        <aside className="rail">
          {/* Search */}
          <div className="rail-search">
            {isOpen ? (
              <GlobalSearch
                onNavigate={handleNavigateFromSearch}
                refreshKey={repositoryMutationToken}
                fullWidth
              />
            ) : (
              <>
                <span className="search-icon"><IcSearch size={13} /></span>
                <input
                  className="ri-input"
                  style={{ width: "100%", height: 28, paddingLeft: 26, fontSize: 12 }}
                  placeholder="Search…"
                  disabled
                />
              </>
            )}
          </div>

          {/* Nav */}
          <div style={{ flex: 1, overflowY: "auto", padding: "4px 0 8px" }}>
            <div className="nav-section">Workspace</div>
            {navItem("repository",   <IcFolder size={13} />,       "Repository")}
            {navItem("validation",   <IcCheckCircle size={13} />,  "Validation",   valBadge)}

            <div className="nav-section">Inventory</div>
            {navItem("locations",    <IcMapPin size={13} />,        "Locations")}
            {(selectedLocationForRacks !== null || activeTab === "racks") && navItem(
              "racks",
              <IcServer size={13} />,
              "Racks",
              undefined,
              selectedLocationForRacks
                ? `${selectedLocationForRacks.code} — ${selectedLocationForRacks.name}`
                : undefined,
            )}
            {navItem("devices",      <IcBox size={13} />,           "Devices",
              isOpen && summary.unplaced_devices_count > 0
                ? <span className="nav-count nc-warn">{summary.unplaced_devices_count}</span>
                : undefined
            )}
            {navItem("device_models",<IcLayers size={13} />,        "Device Models")}

            <div className="nav-section">Data</div>
            {navItem("csv_import",   <IcUpload size={13} />,        "CSV Import")}

            <div className="nav-section">System</div>
            {navItem("settings",     <IcSettings size={13} />,      "Settings")}
          </div>
        </aside>

        <main className="main">
          {/* Working indicator — kept for button-disabled feedback; visual overlay is handled by BusyOverlay */}
          {isBusy && (
            <div style={{ padding: "6px 16px", fontSize: 12, color: "var(--tx-3)", fontStyle: "italic", borderBottom: "1px solid var(--bd-1)", background: "var(--bg-surface)" }}>
              Working…
            </div>
          )}

          {/* Global error */}
          {error && (
            <div style={{ margin: "12px 16px", padding: "8px 12px", background: "var(--st-err-bg)", border: "1px solid var(--st-err-bd)", color: "var(--st-err-tx)", borderRadius: 4, fontSize: 12 }}>
              <strong>Error:</strong> {error}
            </div>
          )}

          {/* Unsaved changes callout bar */}
          {hasUnsavedChanges && (
            <div className="callout-bar">
              <IcAlertTriangle size={14} />
              <span>
                <strong>Unsaved inventory changes</strong> — data modified in memory, not yet written to YAML files.
                {activeTab !== "repository" && (
                  <> Use <strong>Save changes</strong> in the Repository tab.</>
                )}
              </span>
              {activeTab !== "repository" && (
                <div className="cb-actions">
                  <button
                    className="btn btn-sm"
                    onClick={() => setActiveTab("repository")}
                  >
                    <IcSave size={11} /> Go to Repository
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Panel content */}
          <div style={activeTab !== "repository" ? { display: "none" } : undefined}>
            <RepositoryPanel
              repoPath={repoPath}
              onRepoPathChange={setRepoPath}
              onOpen={handleOpen}
              onOpenPath={handleOpenPath}
              onBrowse={handleBrowse}
              onClose={handleClose}
              working={isBusy}
              summary={summary}
              validationSummary={validationSummary}
              recentRepos={recentRepos}
              onRemoveRecentRepo={(path) => {
                removeRecentRepository(path);
                setRecentRepos(getRecentRepositories());
              }}
              hasUnsavedChanges={hasUnsavedChanges}
              onSaveSuccess={handleSaveSuccess}
              onPullSuccess={(s) => setSummary(s)}
              onPullRunning={() => {}}
              onCreateSuccess={handleCreateSuccess}
              onCloneSuccess={handleCloneSuccess}
              gitRefreshToken={gitRefreshToken}
            />
          </div>

          {activeTab === "validation" && isOpen && (
            <ValidationPanel
              onSaveSuccess={handleSaveSuccess}
              onNavigate={handleNavigateFromValidation}
            />
          )}

          {activeTab === "locations" && isOpen && (
            <LocationsPanel
              repoPath={summary.repo_path}
              highlightedLocationId={highlightedLocationId}
              onRepositoryMutated={handleRepositoryMutated}
              onManageRacks={handleManageRacks}
            />
          )}

          {activeTab === "racks" && isOpen && (
            <RacksPanel
              repoPath={summary.repo_path}
              selectedRackId={selectedRack?.id ?? null}
              onSelectRack={setSelectedRack}
              mutationToken={repositoryMutationToken}
              pendingRackNavTarget={pendingRackNavTarget}
              onRackNavTargetConsumed={() => setPendingRackNavTarget(null)}
              onRepositoryMutated={handleRepositoryMutated}
              selectedLocation={selectedLocationForRacks}
            />
          )}

          {activeTab === "devices" && isOpen && (
            <DevicesPanel
              repoPath={summary.repo_path}
              mutationToken={repositoryMutationToken}
              highlightedDeviceId={highlightedDeviceId}
              onRepositoryMutated={handleRepositoryMutated}
            />
          )}

          {activeTab === "device_models" && isOpen && (
            <DeviceModelsPanel
              repoPath={summary.repo_path}
              mutationToken={repositoryMutationToken}
              highlightedDeviceModelId={highlightedDeviceModelId}
              onRepositoryMutated={handleRepositoryMutated}
            />
          )}

          {activeTab === "csv_import" && isOpen && (
            <CsvImportPanel
              onRepositoryMutated={handleRepositoryMutated}
            />
          )}

          {activeTab === "settings" && (
            <SettingsPanel />
          )}
        </main>
      </div>

      <SshPassphraseModal
        open={askpassSession !== null}
        prompt={askpassSession?.prompt ?? ""}
        sessionId={askpassSession?.sessionId ?? ""}
        expired={askpassSession?.expired ?? false}
        onDismiss={() => setAskpassSession(null)}
      />

      <UnsavedChangesDialog
        open={unsavedGuardOpen}
        saving={unsavedGuardSaving}
        onSave={handleGuardSave}
        onDiscard={() => resolveGuard("discard")}
        onCancel={() => resolveGuard("cancel")}
      />
    </div>
  );
}
